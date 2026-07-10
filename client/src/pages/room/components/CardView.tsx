import type { Card } from '@/stores/gameStore';
import { cardBackUrl, cardImageUrl } from '../cardAssets';

export function CardView({ card, faceDown, selected, mark, onClick, size = 'normal' }: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  mark?: 'head' | 'tail' | null;
  onClick?: () => void;
  size?: 'small' | 'normal';
}) {
  const showBack = faceDown || !card;
  const src = showBack ? cardBackUrl() : cardImageUrl(card!);
  const alt = showBack ? '牌背' : (card?.cnName || card?.rank || '牌');
  const cls = [
    'card',
    'tea-card',
    'img-card',
    size,
    selected ? 'selected' : '',
    mark === 'head' ? 'head-mark' : mark === 'tail' ? 'tail-mark' : '',
    showBack ? 'back' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={onClick} title={showBack ? undefined : card?.cnName}>
      <img className="card-art" src={src} alt={alt} draggable={false} />
    </div>
  );
}
