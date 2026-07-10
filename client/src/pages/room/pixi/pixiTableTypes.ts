export interface TableSize {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface TableGeometry {
  center: Point2D;
  feltRadiusX: number;
  feltRadiusY: number;
  deck: Point2D;
  pot: Point2D;
  seats: Point2D[];
}

export interface DealAnimationEvent {
  key: number;
  targets: number[];
}

/** 筹码飞行动画 */
export type ChipAnimKind =
  | 'to_seat_bet'   // 下注：从座位飞到该座位桌面喊价区
  | 'to_pot'        // 真正入池：从座位喊价区飞向底池（弃牌支付）
  | 'seat_to_seat'  // 结算：输家座位 → 赢家座位
  | 'pot_to_seat';   // 结算：底池 → 赢家座位

export interface ChipAnimationEvent {
  key: number;
  kind: ChipAnimKind;
  fromVisualSeat?: number;
  toVisualSeat?: number;
  amount?: number;
  player?: string;
}
