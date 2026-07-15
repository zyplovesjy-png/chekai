import type { Card } from '@/stores/gameStore';

export function CardView({ card, faceDown, selected, mark, onClick, size = 'normal' }: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  mark?: 'head' | 'tail' | null;
  onClick?: () => void;
  size?: 'small' | 'normal';
}) {
  const showBack = faceDown || !card;
  const isJoker = !showBack && (card?.color === 'joker' || card?.rank === 'JK');
  const suit = isJoker ? '★' : (card?.suit || '');
  const rank = isJoker ? 'JOKER' : (card?.rank || '');
  const isRed = !isJoker && (suit === '♥' || suit === '♦' || card?.color === 'red');
  const label = showBack ? '牌背' : `${rank}${suit}`;
  const cls = [
    'card',
    'tea-card',
    size,
    selected ? 'selected' : '',
    mark === 'head' ? 'head-mark' : mark === 'tail' ? 'tail-mark' : '',
    showBack ? 'back' : '',
    isJoker ? 'joker' : isRed ? 'red' : 'black',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {showBack ? (
        <div className="card-back-art" aria-hidden="true">
          <span className="card-back-medallion">♠</span>
        </div>
      ) : isJoker ? (
        <>
          <div className="card-corner card-corner-top" aria-hidden="true">
            <span className="card-joker-word">JOKER</span>
          </div>
          <span className="card-center-joker" aria-hidden="true">★</span>
          <div className="card-corner card-corner-bottom" aria-hidden="true">
            <span className="card-joker-word">JOKER</span>
          </div>
        </>
      ) : (
        <>
          <div className="card-corner card-corner-top" aria-hidden="true">
            <span className="card-corner-rank">{rank}</span>
          </div>
          <span className="card-center-suit" aria-hidden="true">{suit}</span>
          <div className="card-corner card-corner-bottom" aria-hidden="true">
            <span className="card-corner-rank">{rank}</span>
          </div>
        </>
      )}
    </div>
  );
}
