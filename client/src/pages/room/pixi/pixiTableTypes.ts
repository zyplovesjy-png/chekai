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

export interface ChipAnimationEvent {
  key: number;
  player: string;
  visualSeatIndex: number;
  amount?: number;
}
