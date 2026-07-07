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
}

const headLabel = '\u5934';
const tailLabel = '\u5c3e';

export function PublicCards({ players, room, visualSeats, myUsername, phase }: PublicCardsProps) {
  const showSplit = ['comparing', 'done'].includes(phase);
  return (
    <>
      {players.map((player) => {
        if (!player.publicCards || player.publicCards.length === 0) return null;
        if (player.username === myUsername) return null;

        const visualIdx = getVisualIndexForUsername(room, visualSeats, player.username);
        if (visualIdx < 0) return null;

        const cardsToShow = player.folded ? player.publicCards.slice(-2) : player.publicCards;

        if (!player.folded && showSplit && player.split && player.publicCards.length === 4) {
          return (
            <div key={player.username} className={`public-cards public-cards-vpos-${visualIdx} split-display`}>
              <div className="split-group">
                <div className="split-label">{headLabel} {player.split.headName}</div>
                {player.split.head.map((card, i) => (
                  <div className="card-slot" key={`h${i}`}><CardView card={card} size="small" /></div>
                ))}
              </div>
              <div className="split-divider" />
              <div className="split-group">
                <div className="split-label">{tailLabel} {player.split.tailName}</div>
                {player.split.tail.map((card, i) => (
                  <div className="card-slot" key={`t${i}`}><CardView card={card} size="small" /></div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={player.username} className={`public-cards public-cards-vpos-${visualIdx}`}>
            {cardsToShow.map((card, i) => (
              <div className="card-slot" key={i}><CardView card={card} size="small" /></div>
            ))}
          </div>
        );
      })}
    </>
  );
}
