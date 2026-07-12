import { create } from 'zustand';

export interface GamePlayer {
  username: string;
  nickname: string;
  pot: number;
  committed: number;
  roundCommitted?: number;
  pendingBuyIn?: number;
  allIn?: boolean;
  sanhuaShown?: boolean;
  sanhuaType?: string | null;
  canShowSanhua?: boolean;
  folded: boolean;
  rested?: boolean;
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

export interface PotSplitInfo {
  pot: number;
  shares: Record<string, number>;
  bankerUsername?: string | null;
  recipientCount?: number;
  base?: number;
  remainder?: number;
  inferred?: boolean;
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
  reason?: string;
  /** 局结束快照：全员完整手牌（含暗牌），供对局记录展示 */
  hands?: Record<string, Card[]>;
  splits?: Record<string, {
    head: Card[];
    tail: Card[];
    headName: string;
    tailName: string;
  }>;
}

/** 是否为真正扯牌比大小（有配牌结果），而非弃牌/休芒等提前结束 */
export function isRealCompare(result: CompareResult | null | undefined): boolean {
  if (!result) return false;
  if (result.reason === 'all_folded' || result.reason === 'rest_cross') return false;
  if (result.reason === 'compare') return true;
  const splits = result.splits;
  return !!(splits && Object.keys(splits).length > 0);
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
  rested: boolean;
  eliminated: boolean;
}

export interface RoundRecord {
  round: number;
  bankerUsername: string;
  players: RoundPlayerRecord[];
  winner: string | null;
  endReason?: string | null;
}

export type FeedKind = 'action' | 'system' | 'phase' | 'error';

export interface MessageFeedItem {
  id: number;
  text: string;
  kind: FeedKind;
  at: number;
}

export interface TableToast {
  text: string;
  sticky?: boolean;
  until?: number;
}

const FEED_MAX = 5;

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
  /** @deprecated 公共播报改走 messageFeed；保留兼容 */
  hintText: string;
  /** 公共动作条（最近几条） */
  messageFeed: MessageFeedItem[];
  /** 桌心高优先级 Toast */
  tableToast: TableToast | null;
  players: GamePlayer[];
  // 庄家
  bankerIdx: number;
  bankerUsername: string | null;
  bankerHighlight: string | null;
  centerMessage: string | null;
  // 本局已敲用户（持久化到本局结束）
  knockedThisRound: string[];
  // 全局结算
  settlement: SettlementPlayer[] | null;
  /** 终局遗留底池平分退回（有则展示说明） */
  potSplit: PotSplitInfo | null;
  // 对局历史
  roundHistory: RoundRecord[];
  // 私有
  myHand: Card[];
  mySplit: { headIdx: number[]; headName: string; tailName: string } | null;
  selected: number[];
  compareResult: CompareResult | null;
  gameStarted: boolean;
  /** 本局开局收取的芒果（有则底池下可显示一/二/三芒） */
  openingMango: { level: number; kind?: string | null; amount?: number; exempt?: string | null } | null;

  setPublicState: (state: any) => void;
  setPrivateState: (state: any) => void;
  setMyHand: (hand: Card[]) => void;
  setMySplit: (split: any) => void;
  setSelected: (idx: number[]) => void;
  toggleSelected: (idx: number) => void;
  setCompareResult: (r: CompareResult | null) => void;
  setGameStarted: (v: boolean) => void;
  setHintText: (text: string) => void;
  pushFeed: (text: string, kind?: FeedKind) => void;
  clearFeed: () => void;
  showToast: (text: string, opts?: { sticky?: boolean; ms?: number }) => void;
  clearToast: () => void;
  setBankerHighlight: (username: string | null) => void;
  setCenterMessage: (msg: string | null) => void;
  addRoundHistory: (record: RoundRecord) => void;
  setRoundHistory: (records: RoundRecord[]) => void;
  addHistory: (msg: string) => void;
  knockUser: (username: string) => void;
  clearKnockedThisRound: () => void;
  setSettlement: (settlement: SettlementPlayer[] | null, potSplit?: PotSplitInfo | null) => void;
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
  messageFeed: [] as MessageFeedItem[],
  tableToast: null as TableToast | null,
  players: [],
  bankerIdx: -1,
  bankerUsername: null as string | null,
  bankerHighlight: null as string | null,
  centerMessage: null as string | null,
  knockedThisRound: [] as string[],
  settlement: null as SettlementPlayer[] | null,
  potSplit: null as PotSplitInfo | null,
  roundHistory: [] as RoundRecord[],
  myHand: [],
  mySplit: null,
  selected: [],
  compareResult: null,
  gameStarted: false,
  openingMango: null as { level: number; kind?: string | null; amount?: number; exempt?: string | null } | null,
  history: [],
};

let feedSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = create<GameState>((set, get) => ({
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
    // 不再用服务端长 hints 覆盖公共消息区
    players: state.players || [],
    bankerIdx: state.bankerIdx ?? -1,
    bankerUsername: state.bankerUsername ?? null,
    compareResult: state.compareResult ?? null,
    openingMango: state.openingMango ?? null,
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
    players: state.players || [],
    bankerIdx: state.bankerIdx ?? -1,
    bankerUsername: state.bankerUsername ?? null,
    compareResult: state.compareResult ?? null,
    openingMango: state.openingMango ?? null,
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
  pushFeed: (text, kind = 'action') => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    set((s) => {
      const last = s.messageFeed[s.messageFeed.length - 1];
      if (last && last.text === trimmed && Date.now() - last.at < 400) {
        return s;
      }
      const item: MessageFeedItem = {
        id: ++feedSeq,
        text: trimmed,
        kind,
        at: Date.now(),
      };
      return { messageFeed: [...s.messageFeed.slice(-(FEED_MAX - 1)), item] };
    });
  },
  clearFeed: () => set({ messageFeed: [] }),
  showToast: (text, opts) => {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      get().clearToast();
      return;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const sticky = !!opts?.sticky;
    const ms = opts?.ms ?? (sticky ? 0 : 2800);
    set({
      tableToast: {
        text: trimmed,
        sticky,
        until: sticky || !ms ? undefined : Date.now() + ms,
      },
      centerMessage: trimmed,
    });
    if (!sticky && ms > 0) {
      toastTimer = setTimeout(() => {
        toastTimer = null;
        const cur = get().tableToast;
        if (cur?.text === trimmed) {
          set({ tableToast: null, centerMessage: null });
        }
      }, ms);
    }
  },
  clearToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ tableToast: null, centerMessage: null });
  },
  setBankerHighlight: (username) => set({ bankerHighlight: username }),
  setCenterMessage: (msg) => {
    // 兼容旧调用：转发到 showToast / clearToast
    if (!msg) get().clearToast();
    else get().showToast(msg, { sticky: true });
  },
  addRoundHistory: (record) => set((s) => {
    const list = s.roundHistory.filter((r) => r.round !== record.round);
    return { roundHistory: [...list, record].sort((a, b) => a.round - b.round) };
  }),
  setRoundHistory: (records) => set({
    roundHistory: Array.isArray(records)
      ? [...records].sort((a, b) => a.round - b.round)
      : [],
  }),
  knockUser: (username: string) => set((s) => ({ knockedThisRound: s.knockedThisRound.includes(username) ? s.knockedThisRound : [...s.knockedThisRound, username] })),
  clearKnockedThisRound: () => set({ knockedThisRound: [] }),
  setSettlement: (settlement: SettlementPlayer[] | null, potSplit: PotSplitInfo | null = null) =>
    set({ settlement, potSplit: potSplit ?? null }),
  addHistory: (msg) => set((s) => ({ history: [...s.history.slice(-99), msg] })),
  reset: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ ...initialState, knockedThisRound: [], messageFeed: [], tableToast: null });
  },
}));
