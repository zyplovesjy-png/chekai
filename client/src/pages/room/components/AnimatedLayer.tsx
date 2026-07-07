interface AnimatedLayerProps {
  dealAnim: { key: number; targets: number[] };
  centerMessage: string | null;
  renderDealCards?: boolean;
}

/**
 * AnimatedLayer renders transient visual effects on top of the game table:
 * - deal flying cards
 * - center overlay message (banker selection, rotation, etc.)
 */
export function AnimatedLayer({ dealAnim, centerMessage, renderDealCards = true }: AnimatedLayerProps) {
  return (
    <>
      {/* 发牌动画 */}
      {renderDealCards && dealAnim.targets.length > 0 && dealAnim.targets.map((v) => (
        <div
          key={`${dealAnim.key}-${v}`}
          className={`deal-card deal-to-vpos-${v}`}
        />
      ))}

      {/* 中央弹出消息（选庄/轮庄等） */}
      {centerMessage && (
        <div className="center-overlay">
          <div className="center-message">{centerMessage}</div>
        </div>
      )}
    </>
  );
}
