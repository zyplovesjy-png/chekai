import { create } from 'zustand';

export interface GamePlayer {
  username: string;
  nickname: string;
  pot: number;
  committed: number;
  roundCommitted?: number;
  allIn?: boolean;
  sanhuaShown?: boolean;
  sanhuaType?: string | null;
  canShowSanhua?: boolean;
  folded: boolean;
  eliminated: boolean;
  handCount: number;
  lastDelta: number;
  seat: string;
  publicCards?: Card[];
  split?: {
    head: Card[];
    tail: Card[];
    headName: string;
    tailName: string;
  } | null;
}

export interface Card {
  id: string;
  color: string;
  rank: string;
  cnName: string;
  cnChar: string;
  cardPoints: number;
  order: number;
  suit: string;
}

export interface SettlementPlayer {
  username: string;
  nickname: string;
  initial: number;
  final: number;
  delta: number;
}

export interface CompareResult {
  winner: string | null;
  results?: Record<string, {
    wins: number;
    losses: number;
    ties: number;
    headName: string;
    tailName: string;
    lastDelta: number;
  }>;
  ranked?: string[];
  alone?: boolean;
}

export interface GameAction {
  action: string;
  bet?: number;
  amount?: number;
  penalty?: number;
  player: string;
  name: string;
}

export interface RoundPlayerRecord {
  username: string;
  nickname: string;
  hand: Card[];
  split: { head: Card[]; tail: Card[]; headName: string; tailName: string } | null;
  lastDelta: number;
  wins: number;
  losses: number;
  ties: number;
  folded: boolean;
  eliminated: boolean;
}

export interface RoundRecord {
  round: number;
  bankerUsername: string;
  players: RoundPlayerRecord[];
  winner: string | null;
}

interface GameState {
  phase: string;
  round: number;
  currentBet: number;
  minBet: number;
  maxBet: number;
  potPi: number;
  remainingCards: number;
  deckSize: number;
  betRound: number;
  betStarted: boolean;
  toAct: string[];
  opener: string;
  hintText: string;
  players: GamePlayer[];
  // 庄家
  bankerIdx: number;
  bankerUsername: string | null;
  bankerHighlight: string | null; // 选庄动画中高亮的 username
  centerMessage: string | null;    // 中央弹出消息
  // 本局已敲用户（持久化到本局结束）
  knockedThisRound: string[];
  // 全局结算
  settlement: SettlementPlayer[] | null;
  // 对局历史
  roundHistory: RoundRecord[];
  // 私有
  myHand: Card[];
  mySplit: { headIdx: number[]; headName: string; tailName: string } | null;
  selected: number[];
  compareResult: CompareResult | null;
  gameStarted: boolean;

  setPublicState: (state: any) => void;
  setPrivateState: (state: any) => void;
  setMyHand: (hand: Card[]) => void;
  setMySplit: (split: any) => void;
  setSelected: (idx: number[]) => void;
  toggleSelected: (idx: number) => void;
  setCompareResult: (r: CompareResult | null) => void;
  setGameStarted: (v: boolean) => void;
  setHintText: (text: string) => void;
  setBankerHighlight: (username: string | null) => void;
  setCenterMessage: (msg: string | null) => void;
  addRoundHistory: (record: RoundRecord) => void;
  addHistory: (msg: string) => void;
  knockUser: (username: string) => void;
  clearKnockedThisRound: () => void;
  setSettlement: (settlement: SettlementPlayer[] | null) => void;
  history: string[];
  reset: () => void;
}

const initialState = {
  phase: 'idle',
  round: 0,
  currentBet: 0,
  minBet: 10,
  maxBet: 0,
  potPi: 0,
  remainingCards: 0,
  deckSize: 0,
  betRound: 0,
  betStarted: false,
  toAct: [],
  opener: '',
  hintText: '',
  players: [],
  bankerIdx: -1,
  bankerUsername: null as string | null,
  bankerHighlight: null as string | null,
  centerMessage: null as string | null,
  knockedThisRound: [] as string[],
  settlement: null as SettlementPlayer[] | null,
  roundHistory: [] as RoundRecord[],
  myHand: [],
  mySplit: null,
  selected: [],
  compareResult: null,
  gameStarted: false,
  history: [],
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setPublicState: (state) => set({
    phase: state.phase,
    round: state.round,
    currentBet: state.currentBet,
    minBet: state.minBet ?? 10,
    maxBet: state.maxBet ?? 0,
    potPi: state.potPi,
    remainingCards: state.remainingCards ?? 0,
    deckSize: state.deckSize ?? 0,
    betRound: state.betRound,
    betStarted: state.betStarted,
    toAct: state.toAct,
    opener: state.opener,
    hintText: state.hints || '',
    players: state.players || [],
    bankerIdx: state.bankerIdx ?? -1,
    bankerUsername: state.bankerUsername ?? null,
    compareResult: state.compareResult ?? null,
  }),

  setPrivateState: (state) => set({
    myHand: state.myHand || [],
    mySplit: state.mySplit || null,
    phase: state.phase,
    round: state.round,
    currentBet: state.currentBet,
    minBet: state.minBet ?? 10,
    maxBet: state.maxBet ?? 0,
    potPi: state.potPi,
    remainingCards: state.remainingCards ?? 0,
    deckSize: state.deckSize ?? 0,
    betRound: state.betRound,
    betStarted: state.betStarted,
    toAct: state.toAct,
    opener: state.opener,
    hintText: state.hints || '',
    players: state.players || [],
    bankerIdx: state.bankerIdx ?? -1,
    bankerUsername: state.bankerUsername ?? null,
    compareResult: state.compareResult ?? null,
  }),

  setMyHand: (hand) => set({ myHand: hand }),
  setMySplit: (split) => set({ mySplit: split }),
  setSelected: (selected) => set({ selected }),
  toggleSelected: (idx) => set((s) => {
    const i = s.selected.indexOf(idx);
    if (i >= 0) return { selected: s.selected.filter((_, j) => j !== i) };
    if (s.selected.length >= 2) return { selected: [s.selected[1], idx] };
    return { selected: [...s.selected, idx] };
  }),
  setCompareResult: (r) => set({ compareResult: r }),
  setGameStarted: (v) => set({ gameStarted: v }),
  setHintText: (text) => set({ hintText: text }),
  setBankerHighlight: (username) => set({ bankerHighlight: username }),
  setCenterMessage: (msg) => set({ centerMessage: msg }),
  addRoundHistory: (record) => set((s) => ({ roundHistory: [...s.roundHistory, record] })),
  knockUser: (username: string) => set((s) => ({ knockedThisRound: s.knockedThisRound.includes(username) ? s.knockedThisRound : [...s.knockedThisRound, username] })),
  clearKnockedThisRound: () => set({ knockedThisRound: [] }),
  setSettlement: (settlement: SettlementPlayer[] | null) => set({ settlement }),
  addHistory: (msg) => set((s) => ({ history: [...s.history.slice(-99), msg] })),
  reset: () => set({ ...initialState, knockedThisRound: [] }),
}));
