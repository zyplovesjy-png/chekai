import type { Card } from '@/stores/gameStore';
import { CardView } from './CardView';

interface MyHandProps {
  myHand: Card[];
  mySplit: { headIdx: number[]; headName: string; tailName: string } | null;
  selected: number[];
  phase: string;
  onCardClick: (idx: number) => void;
  /** 是否为真正比牌（有配牌）；弃牌结束等不应按头尾展示 */
  realCompare?: boolean;
}

export function MyHand({
  myHand,
  mySplit,
  selected,
  phase,
  onCardClick,
  realCompare = false,
}: MyHandProps) {
  if (myHand.length === 0) return null;

  // 仅配牌阶段（已确认）或真正比牌：左头右尾
  const showSplitLayout = !!mySplit?.headIdx && (
    phase === 'selecting'
    || phase === 'comparing'
    || (phase === 'done' && realCompare)
  );

  if (showSplitLayout && mySplit) {
    const headCards = mySplit.headIdx.map((i) => myHand[i]).filter(Boolean);
    const tailIdx = myHand.map((_, i) => i).filter((i) => !mySplit.headIdx.includes(i));
    const tailCards = tailIdx.map((i) => myHand[i]).filter(Boolean);
    return (
      <div className="my-hand-area">
        <div className="my-hand split-confirmed tea-split-hand tea-split-row">
          {headCards.map((card, i) => (
            <div className="card-slot" key={`h${i}`}>
              <CardView card={card} mark="head" />
            </div>
          ))}
          {tailCards.map((card, i) => (
            <div className="card-slot" key={`t${i}`}>
              <CardView card={card} mark="tail" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 选牌中：保持发牌顺序，仅高亮选中；非配牌阶段不可点选、不显示黄框
  return (
    <div className="my-hand-area">
      <div className={`my-hand${phase === 'selecting' ? ' selectable' : ''}`}>
        {myHand.map((card, idx) => {
          const isSelected = phase === 'selecting' && selected.includes(idx);
          return (
            <div className="card-slot" key={card.id || idx}>
              <CardView
                card={card}
                selected={isSelected}
                onClick={phase === 'selecting' ? () => onCardClick(idx) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
