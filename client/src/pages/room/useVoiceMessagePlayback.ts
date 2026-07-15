import { useCallback, useEffect, useRef, useState } from 'react';
import { setVoiceDucking } from './sounds';

const VOICE_MESSAGES_ENABLED_KEY = 'chekai-voice-messages-enabled';

export interface VoiceMessageEnvelope {
  id: string;
  sequence: number;
  username: string;
  nickname: string;
  durationMs: number;
  mimeType: string;
  url: string;
}

interface UseVoiceMessagePlaybackArgs {
  token: string | null;
  myUsername: string;
  onAcknowledge: (id: string) => void;
  onFeedback: (message: string) => void;
}

function readEnabled() {
  try {
    const value = localStorage.getItem(VOICE_MESSAGES_ENABLED_KEY);
    return value == null || (value !== '0' && value !== 'false');
  } catch {
    return true;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useVoiceMessagePlayback({
  token,
  myUsername,
  onAcknowledge,
  onFeedback,
}: UseVoiceMessagePlaybackArgs) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const [nowPlaying, setNowPlaying] = useState<VoiceMessageEnvelope | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const tokenRef = useRef(token);
  const myUsernameRef = useRef(myUsername);
  const acknowledgeRef = useRef(onAcknowledge);
  const feedbackRef = useRef(onFeedback);
  const queueRef = useRef<VoiceMessageEnvelope[]>([]);
  const queuedIdsRef = useRef(new Set<string>());
  const runningRef = useRef(false);
  const processRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rejectPlaybackRef = useRef<((error: unknown) => void) | null>(null);
  const resumeBlockedRef = useRef<(() => void) | null>(null);

  enabledRef.current = enabled;
  tokenRef.current = token;
  myUsernameRef.current = myUsername;
  acknowledgeRef.current = onAcknowledge;
  feedbackRef.current = onFeedback;

  const cleanupCurrent = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch { /* ignore */ }
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* ignore */ }
    }
    audioRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    rejectPlaybackRef.current = null;
    resumeBlockedRef.current = null;
    setVoiceDucking(false);
    if (mountedRef.current) {
      setPlaybackBlocked(false);
      setNowPlaying(null);
    }
  };

  const processQueue = useCallback(async () => {
    if (runningRef.current || !mountedRef.current) return;
    runningRef.current = true;
    while (mountedRef.current && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      queuedIdsRef.current.delete(item.id);

      if (item.username === myUsernameRef.current) continue;
      if (!enabledRef.current) {
        acknowledgeRef.current(item.id);
        continue;
      }

      if (mountedRef.current) setNowPlaying(item);
      try {
        const controller = new AbortController();
        abortRef.current = controller;
        const response = await fetch(item.url, {
          method: 'GET',
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {},
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`voice fetch failed: ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('empty voice blob');

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audioRef.current = audio;
        setVoiceDucking(true);

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
          };
          audio.onended = () => finish(resolve);
          audio.onerror = () => finish(() => reject(new Error('voice playback failed')));
          rejectPlaybackRef.current = (error) => finish(() => reject(error));

          const attemptPlay = () => {
            if (!mountedRef.current || !enabledRef.current) {
              finish(() => reject(new DOMException('Voice playback stopped', 'AbortError')));
              return;
            }
            if (mountedRef.current) setPlaybackBlocked(false);
            resumeBlockedRef.current = null;
            let playPromise: Promise<void> | undefined;
            try { playPromise = audio.play(); } catch (error) {
              finish(() => reject(error));
              return;
            }
            playPromise?.catch((error) => {
              if (error instanceof DOMException && error.name === 'NotAllowedError') {
                resumeBlockedRef.current = attemptPlay;
                if (mountedRef.current) setPlaybackBlocked(true);
                return;
              }
              finish(() => reject(error));
            });
          };
          attemptPlay();
        });
      } catch (error) {
        if (!isAbortError(error)) feedbackRef.current('有一条语音播放失败');
      } finally {
        cleanupCurrent();
        acknowledgeRef.current(item.id);
      }
    }
    runningRef.current = false;
    if (mountedRef.current && queueRef.current.length > 0) processRef.current();
  }, []);
  processRef.current = () => { void processQueue(); };

  const enqueue = useCallback((item: VoiceMessageEnvelope) => {
    if (!item.id || !Number.isFinite(item.sequence) || queuedIdsRef.current.has(item.id)) return;
    if (item.username === myUsernameRef.current) return;
    if (!enabledRef.current) {
      acknowledgeRef.current(item.id);
      return;
    }
    queuedIdsRef.current.add(item.id);
    queueRef.current.push(item);
    queueRef.current.sort((a, b) => a.sequence - b.sequence);
    processRef.current();
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    enabledRef.current = next;
    setEnabledState(next);
    try { localStorage.setItem(VOICE_MESSAGES_ENABLED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (!next) {
      const waiting = queueRef.current.splice(0);
      waiting.forEach((item) => {
        queuedIdsRef.current.delete(item.id);
        acknowledgeRef.current(item.id);
      });
      abortRef.current?.abort();
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      rejectPlaybackRef.current?.(new DOMException('Voice playback disabled', 'AbortError'));
      feedbackRef.current('语音播报已关闭');
      return;
    }
    feedbackRef.current('语音播报已开启');
    processRef.current();
  }, []);

  const resumePlayback = useCallback(() => {
    resumeBlockedRef.current?.();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      rejectPlaybackRef.current?.(new DOMException('Room closed', 'AbortError'));
      queueRef.current = [];
      queuedIdsRef.current.clear();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      setVoiceDucking(false);
    };
  }, []);

  return {
    enabled,
    setEnabled,
    enqueue,
    nowPlaying,
    playbackBlocked,
    resumePlayback,
  };
}
