import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 15_000;
const CANCEL_DISTANCE_PX = 72;

type VoicePhase = 'idle' | 'requesting' | 'recording' | 'uploading';

interface VoiceRecorderButtonProps {
  className?: string;
  disabled?: boolean;
  onSend: (blob: Blob, durationMs: number, mimeType: string) => Promise<boolean>;
  onFeedback: (message: string) => void;
}

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function VoiceRecorderButton({
  className = '',
  disabled = false,
  onSend,
  onFeedback,
}: VoiceRecorderButtonProps) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [cancelling, setCancelling] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mountedRef = useRef(true);
  const phaseRef = useRef<VoicePhase>('idle');
  const pressedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const cancellingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const finishModeRef = useRef<'send' | 'cancel'>('cancel');
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSendRef = useRef(onSend);
  const onFeedbackRef = useRef(onFeedback);
  onSendRef.current = onSend;
  onFeedbackRef.current = onFeedback;
  phaseRef.current = phase;

  const clearTimers = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    durationTimerRef.current = null;
    maxTimerRef.current = null;
  };

  const resetRecorderResources = () => {
    clearTimers();
    stopStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    cancellingRef.current = false;
    if (mountedRef.current) {
      setCancelling(false);
      setElapsedMs(0);
    }
  };

  const stopRecording = (cancel: boolean) => {
    finishModeRef.current = cancel ? 'cancel' : 'send';
    pressedRef.current = false;
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { resetRecorderResources(); }
      return;
    }
    resetRecorderResources();
    if (mountedRef.current) setPhase('idle');
  };

  useEffect(() => {
    // React StrictMode 在开发环境会执行一次 setup → cleanup → setup。
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      finishModeRef.current = 'cancel';
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* ignore */ }
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  const beginRecording = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || phaseRef.current !== 'idle') return;
    event.preventDefault();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onFeedbackRef.current('当前浏览器不支持语音录制');
      return;
    }

    pressedRef.current = true;
    pointerIdRef.current = event.pointerId;
    startYRef.current = event.clientY;
    cancellingRef.current = false;
    setCancelling(false);
    setPhase('requesting');
    phaseRef.current = 'requesting';
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      pressedRef.current = false;
      if (mountedRef.current) setPhase('idle');
      const name = error instanceof DOMException ? error.name : '';
      onFeedbackRef.current(
        name === 'NotAllowedError'
          ? '请允许麦克风权限后再按住说话'
          : '无法启用麦克风，请检查系统设置',
      );
      return;
    }

    if (!mountedRef.current || !pressedRef.current) {
      stopStream(stream);
      if (mountedRef.current) {
        setPhase('idle');
        onFeedbackRef.current('麦克风已启用，请重新按住说话');
      }
      return;
    }

    const mimeType = chooseRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32_000,
      });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        stopStream(stream);
        pressedRef.current = false;
        if (mountedRef.current) setPhase('idle');
        onFeedbackRef.current('当前设备无法创建录音');
        return;
      }
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (blobEvent) => {
      if (blobEvent.data.size > 0) chunksRef.current.push(blobEvent.data);
    };
    recorder.onerror = () => {
      finishModeRef.current = 'cancel';
      onFeedbackRef.current('录音中断，请重试');
    };
    recorder.onstop = async () => {
      const durationMs = Math.min(MAX_DURATION_MS, Math.round(performance.now() - startedAtRef.current));
      const mode = finishModeRef.current;
      const chunks = chunksRef.current.splice(0);
      const finalMimeType = recorder.mimeType || chunks[0]?.type || mimeType || 'audio/webm';
      clearTimers();
      stopStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;

      if (!mountedRef.current) {
        chunks.length = 0;
        return;
      }
      setCancelling(false);
      setElapsedMs(0);
      if (mode === 'cancel') {
        chunks.length = 0;
        phaseRef.current = 'idle';
        setPhase('idle');
        onFeedbackRef.current('已取消发送');
        return;
      }
      if (durationMs < MIN_DURATION_MS) {
        chunks.length = 0;
        phaseRef.current = 'idle';
        setPhase('idle');
        onFeedbackRef.current('说话时间太短');
        return;
      }

      const blob = new Blob(chunks, { type: finalMimeType });
      chunks.length = 0;
      if (!blob.size) {
        phaseRef.current = 'idle';
        setPhase('idle');
        onFeedbackRef.current('没有录到声音，请重试');
        return;
      }

      phaseRef.current = 'uploading';
      setPhase('uploading');
      try {
        const sent = await onSendRef.current(blob, durationMs, finalMimeType);
        if (sent) onFeedbackRef.current('语音已发送');
      } catch {
        onFeedbackRef.current('语音发送失败，请重试');
      } finally {
        // Blob 没有写入任何持久存储；函数结束后即失去最后一个应用引用。
        if (mountedRef.current) {
          phaseRef.current = 'idle';
          setPhase('idle');
        }
      }
    };

    startedAtRef.current = performance.now();
    finishModeRef.current = 'send';
    try {
      // 短语音在 stop 时一次性产出 Blob，避免 Safari 分片容器拼接差异。
      recorder.start();
    } catch {
      resetRecorderResources();
      setPhase('idle');
      onFeedbackRef.current('录音启动失败，请重试');
      return;
    }
    setPhase('recording');
    phaseRef.current = 'recording';
    durationTimerRef.current = setInterval(() => {
      if (mountedRef.current) setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);
    maxTimerRef.current = setTimeout(() => {
      onFeedbackRef.current('已达到 15 秒，正在发送');
      stopRecording(false);
    }, MAX_DURATION_MS);
  };

  const moveRecording = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || !pressedRef.current) return;
    event.preventDefault();
    const nextCancelling = startYRef.current - event.clientY >= CANCEL_DISTANCE_PX;
    if (nextCancelling === cancellingRef.current) return;
    cancellingRef.current = nextCancelling;
    setCancelling(nextCancelling);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>, forcedCancel = false) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    pressedRef.current = false;
    pointerIdRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    if (phaseRef.current === 'recording') {
      stopRecording(forcedCancel || cancellingRef.current);
    }
  };

  const visible = phase !== 'idle';
  const seconds = Math.min(MAX_DURATION_MS, elapsedMs) / 1000;

  return (
    <>
      <button
        type="button"
        className={`voice-record-button ${className}${phase === 'recording' ? ' is-recording' : ''}`}
        aria-label="按住发送语音"
        disabled={disabled || phase === 'uploading'}
        onPointerDown={beginRecording}
        onPointerMove={moveRecording}
        onPointerUp={(event) => finishPointer(event)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
          <path d="M5.5 10.5V11a6.5 6.5 0 0 0 13 0v-.5M12 17.5V21M9 21h6" />
        </svg>
      </button>

      {visible && (
        <div
          className={`voice-recording-overlay${cancelling ? ' is-cancelling' : ''}${phase === 'uploading' ? ' is-uploading' : ''}`}
          role="status"
          aria-live="assertive"
        >
          <div className="voice-recording-card">
            <div className="voice-recording-orbit" aria-hidden="true">
              <span /><span /><span />
            </div>
            <strong>
              {phase === 'requesting'
                ? '正在启用麦克风'
                : phase === 'uploading'
                  ? '正在发送'
                  : cancelling
                    ? '松开取消'
                    : '松开发送'}
            </strong>
            <span className="voice-recording-time">
              {phase === 'recording' ? `${seconds.toFixed(1)}s` : phase === 'uploading' ? '即发即清理' : '请允许录音权限'}
            </span>
            {phase === 'recording' && (
              <span className="voice-recording-hint">
                {cancelling ? '手指移回按钮可继续录音' : '向上滑动可取消'}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
