import type { GamePlayer } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { getVisualIndexForUsername } from '../seatLayout';
import { CardView } from './CardView';

interface PublicCardsProps {
  players: GamePlayer[];
  room: RoomInfo | null;
  visualSeats: number[];
  myUsername: string;
  phase: string;
  /** 是否为真正扯牌比大小（有配牌） */
  realCompare?: boolean;
  /** 比牌排布：two=上下两排(上头下尾) / one=一排四张 */
  compareLayout?: 'two' | 'one';
}

/**
 * 他人明牌：
 * - 只显示已发出的第 3/4 张（服务端 publicCards = hand.slice(2)，除非真正比牌）
 * - 弃牌 / 全员弃牌结束：不展示暗牌；无明牌则完全不渲染
 * - 真正比牌（有配牌）：展示头尾 4 张，默认上下两排（上头下尾）
 */
export function PublicCards({
  players,
  room,
  visualSeats,
  myUsername,
  phase,
  realCompare = false,
  compareLayout = 'two',
}: PublicCardsProps) {
  const isComparePhase = phase === 'comparing' || (phase === 'done' && realCompare);

  return (
    <>
      {players.map((player) => {
        if (player.username === myUsername) return null;

        const visualIdx = getVisualIndexForUsername(room, visualSeats, player.username);
        if (visualIdx < 0) return null;

        const folded = !!player.folded;
        const baseClass = `public-cards public-cards-vpos-${visualIdx}${folded ? ' folded-pub' : ''}`;
        const hasSplit = !!(player.split?.head?.length && player.split?.tail?.length);

        // 真正比牌且未弃：显示头尾
        if (isComparePhase && !folded && hasSplit) {
          const allCards = [...player.split!.head, ...player.split!.tail];
          if (compareLayout === 'one' || allCards.length <= 2) {
            return (
              <div key={player.username} className={`${baseClass} row4`}>
                {allCards.map((card, i) => (
                  <div className="card-slot" key={i}><CardView card={card} size="small" /></div>
                ))}
              </div>
            );
          }
          const head = allCards.slice(0, 2);
          const tail = allCards.slice(2);
          return (
            <div key={player.username} className={`${baseClass} split2`}>
              <div className="pub-row">
                {head.map((card, i) => (
                  <div className="card-slot" key={`h${i}`}><CardView card={card} size="small" /></div>
                ))}
              </div>
              <div className="pub-row">
                {tail.map((card, i) => (
                  <div className="card-slot" key={`t${i}`}><CardView card={card} size="small" /></div>
                ))}
              </div>
            </div>
          );
        }

        // 其余情况（含弃牌结束 done）：只展示明牌；没有则不渲染
        const visible = player.publicCards || [];
        if (visible.length === 0) return null;

        return (
          <div key={player.username} className={baseClass}>
            {visible.map((card, i) => (
              <div className="card-slot" key={i}><CardView card={card} size="small" /></div>
            ))}
          </div>
        );
      })}
    </>
  );
}
