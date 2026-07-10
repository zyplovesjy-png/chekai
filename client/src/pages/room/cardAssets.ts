/**
 * 扯旋 32 张标准扑克映射 → htdebeer/SVG-cards 资源
 * License: LGPL-2.1（见 /game/cards/LICENSE-LGPL.txt）
 */
import type { Card } from '@/stores/gameStore';

const SUIT_MAP: Record<string, string> = {
  '♥': 'heart',
  '♦': 'diamond',
  '♠': 'spade',
  '♣': 'club',
};

const RANK_MAP: Record<string, string> = {
  Q: 'queen',
  J: 'jack',
  JK: 'joker',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
};

/** 按 card.id 的稳定文件名（优先），避免同点数不同花色歧义 */
const ID_TO_FILE: Record<string, string> = {
  rQ1: 'heart_queen',
  rQ2: 'diamond_queen',
  r21: 'heart_2',
  r22: 'diamond_2',
  r81: 'heart_8',
  r82: 'diamond_8',
  r41: 'heart_4',
  r42: 'diamond_4',
  b101: 'spade_10',
  b102: 'club_10',
  b41: 'spade_4',
  b42: 'club_4',
  b61: 'spade_6',
  b62: 'club_6',
  bJ1: 'spade_jack',
  bJ2: 'club_jack',
  r101: 'heart_10',
  r102: 'diamond_10',
  r61: 'heart_6',
  r62: 'diamond_6',
  r71: 'heart_7',
  r72: 'diamond_7',
  b91: 'spade_9',
  b92: 'club_9',
  b81: 'spade_8',
  b82: 'club_8',
  b71: 'spade_7',
  b72: 'club_7',
  b51: 'spade_5',
  b52: 'club_5',
  r3: 'heart_3',
  joker: 'joker_red',
};

const CARD_BASE = '/game/cards/';
export const CARD_BACK_URL = `${CARD_BASE}back-maroon.png`;

function fileForCard(card: Card): string | null {
  if (ID_TO_FILE[card.id]) return ID_TO_FILE[card.id];
  if (card.color === 'joker' || card.rank === 'JK') return 'joker_red';
  const suit = SUIT_MAP[card.suit];
  const rank = RANK_MAP[card.rank];
  if (!suit || !rank) return null;
  return `${suit}_${rank}`;
}

export function cardImageUrl(card: Card, faceDown?: boolean): string {
  if (faceDown) return CARD_BACK_URL;
  const file = fileForCard(card);
  return file ? `${CARD_BASE}${file}.png` : CARD_BACK_URL;
}

export function cardBackUrl(): string {
  return CARD_BACK_URL;
}
