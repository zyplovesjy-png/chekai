import type { Card } from '@/stores/gameStore';
import { CardView } from './CardView';

interface MyHandProps {
  myHand: Card[];
  mySplit: { headIdx: number[]; headName: string; tailName: string } | null;
  selected: number[];
  phase: string;
  onCardClick: (idx: number) => void;
}

const headLabel = '\u5934';
const tailLabel = '\u5c3e';

export function MyHand({ myHand, mySplit, selected, phase, onCardClick }: MyHandProps) {
  if (myHand.length === 0) return null;

  if (mySplit?.headIdx) {
    const headCards = mySplit.headIdx.map(i => myHand[i]);
    const tailIdx = myHand.map((_, i) => i).filter(i => !mySplit.headIdx.includes(i));
    const tailCards = tailIdx.map(i => myHand[i]);
    return (
      <div className="my-hand-area">
        <div className="my-hand split-confirmed">
          <div className="split-hand-group">
            <span className="split-hand-label">{headLabel}</span>
            <div className="split-hand-cards">
              {headCards.map((card, i) => (
                <div className="card-slot" key={`h${i}`}>
                  <CardView card={card} mark="head" />
                </div>
              ))}
            </div>
          </div>
          <div className="split-hand-divider" />
          <div className="split-hand-group">
            <span className="split-hand-label">{tailLabel}</span>
            <div className="split-hand-cards">
              {tailCards.map((card, i) => (
                <div className="card-slot" key={`t${i}`}>
                  <CardView card={card} mark="tail" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-hand-area">
      <div className={`my-hand${phase === 'selecting' ? ' selectable' : ''}`}>
        {myHand.map((card, idx) => {
          const isSelected = selected.includes(idx);
          return (
            <div className="card-slot" key={idx}>
              <CardView card={card} selected={isSelected} onClick={() => onCardClick(idx)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
