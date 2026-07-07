import type { Card } from '@/stores/gameStore';

export function CardView({ card, faceDown, selected, mark, onClick, size = 'normal' }: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  mark?: 'head' | 'tail' | null;
  onClick?: () => void;
  size?: 'small' | 'normal';
}) {
  if (faceDown || !card) {
    return <div className={`card back ${size}`} onClick={onClick} />;
  }

  const colorClass = card.color === 'joker' ? 'joker' : card.color;
  const cls = `card ${colorClass} ${size}${selected ? ' selected' : ''}${mark === 'head' ? ' head-mark' : mark === 'tail' ? ' tail-mark' : ''}`;

  if (card.color === 'joker') {
    return (
      <div className={cls} onClick={onClick}>
        <div className="rank">JK</div>
        <div className="center-suit">\u2605</div>
        <div className="suit">\u2605</div>
      </div>
    );
  }

  return (
    <div className={cls} onClick={onClick}>
      <div className="rank">{card.rank}</div>
      <div className="center-suit">{card.suit}</div>
      <div className="suit">{card.suit}</div>
    </div>
  );
}
