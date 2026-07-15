import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RoomMessage } from '@/types/quickMessages';

const SPEED_PX_PER_SECOND = 62;
const START_GAP_MS = 180;
const LANE_STEP_PX = 34;

interface ScheduledMessage extends RoomMessage {
  lane: number;
  delayMs: number;
  durationMs: number;
  travelPx: number;
}

interface BarrageLayerProps {
  messages: RoomMessage[];
}

export function BarrageLayer({ messages }: BarrageLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set<number>());
  const laneAvailableRef = useRef<number[]>(Array(4).fill(0));
  const lastLaunchRef = useRef(0);
  const cleanupTimersRef = useRef(new Set<number>());
  const [laneCount, setLaneCount] = useState(4);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = host.parentElement;
    const update = () => {
      const stageHeight = stage?.clientHeight || window.innerHeight;
      const next = stageHeight < 430 ? 3 : 4;
      setLaneCount(next);
      if (laneAvailableRef.current.length !== next) {
        laneAvailableRef.current = Array(next).fill(Date.now());
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage || host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hostWidth = hostRef.current?.clientWidth || window.innerWidth || 390;
    const now = Date.now();
    const nextScheduled: ScheduledMessage[] = [];

    messages.forEach((message) => {
      if (seenRef.current.has(message.localId)) return;
      seenRef.current.add(message.localId);

      const estimatedWidth = Math.min(300, 44 + Array.from(`${message.nickname}：${message.content}`).length * 14);
      const travelPx = hostWidth + estimatedWidth + 24;
      const durationMs = Math.max(8000, Math.min(12000, (travelPx / SPEED_PX_PER_SECOND) * 1000));
      const lanes = laneAvailableRef.current;
      let lane = 0;
      for (let index = 1; index < lanes.length; index += 1) {
        if (lanes[index] < lanes[lane]) lane = index;
      }
      const launchAt = Math.max(now, lastLaunchRef.current + START_GAP_MS, lanes[lane] || 0);
      lanes[lane] = launchAt + ((estimatedWidth + 28) / SPEED_PX_PER_SECOND) * 1000;
      lastLaunchRef.current = launchAt;

      const item = {
        ...message,
        lane,
        delayMs: Math.max(0, launchAt - now),
        durationMs,
        travelPx,
      };
      nextScheduled.push(item);

      const timer = window.setTimeout(() => {
        setScheduled((current) => current.filter((entry) => entry.localId !== message.localId));
        cleanupTimersRef.current.delete(timer);
      }, item.delayMs + item.durationMs + 500);
      cleanupTimersRef.current.add(timer);
    });

    if (nextScheduled.length) setScheduled((current) => [...current, ...nextScheduled]);
  }, [messages, laneCount]);

  useEffect(() => () => {
    cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    cleanupTimersRef.current.clear();
  }, []);

  return (
    <div
      ref={hostRef}
      className="barrage-layer"
      style={{
        '--barrage-lanes': laneCount,
        height: `${laneCount * LANE_STEP_PX}px`,
      } as CSSProperties}
    >
      {scheduled.map((message) => (
        <div
          key={message.localId}
          className="barrage-message"
          style={{
            '--barrage-lane': message.lane,
            '--barrage-top': `${(message.lane + 0.5) * LANE_STEP_PX}px`,
            '--barrage-delay': `${message.delayMs}ms`,
            '--barrage-duration': `${message.durationMs}ms`,
            '--barrage-travel': `-${message.travelPx}px`,
          } as CSSProperties}
        >
          <strong>{message.nickname}</strong>
          <span>：{message.content}</span>
        </div>
      ))}
      <span className="room-message-live" aria-live="polite">
        {messages.length ? `${messages[messages.length - 1].nickname}：${messages[messages.length - 1].content}` : ''}
      </span>
    </div>
  );
}
