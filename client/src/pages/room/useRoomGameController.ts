import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useGameStore, type RoundRecord } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { useRoomStore } from '@/stores/roomStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SEAT_IDS, TURN_TIME_SECONDS } from './constants';
import { calcSeatRotation } from './seatLayout';
import { estimateDealDurationMs } from './components/AnimatedLayer';
import type { ChipAnimationEvent } from './pixi/pixiTableTypes';
import { estimateSettleChipAnimMs, settleAnimBaseDelayMs, SETTLE_ANIM_TIMING } from './animationEvents';
import {
  playFoldSound,
  playKnockSound,
  playWarnSound,
  playWinSound,
} from './sounds';

type ApiFn = (url: string, opts?: RequestInit) => Promise<any>;

interface UseRoomGameControllerArgs {
  code: string | undefined;
  room: RoomInfo | null;
  myUsername: string;
  navigate: NavigateFunction;
  api: ApiFn;
  setRoom: (room: RoomInfo) => void;
}

export function useRoomGameController({
  code,
  room,
  myUsername,
  navigate,
  api,
  setRoom,
}: UseRoomGameControllerArgs) {
  const game = useGameStore();
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [buyInMode, setBuyInMode] = useState<'full' | 'topup'>('full');
  const [carryChips, setCarryChips] = useState(0);
  const [showSeatChange, setShowSeatChange] = useState(false);
  const [pendingSeatIdx, setPendingSeatIdx] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState(0);
  const [buyInDecision, setBuyInDecision] = useState<{
    players: Array<{
      username: string;
      nickname: string;
      choice: 'continue' | 'settle' | null;
      amount?: number | null;
    }>;
    pending: string[];
    waitingText: string;
  } | null>(null);
  const [addBuyInAmount, setAddBuyInAmount] = useState(100);
  const [showMenu, setShowMenu] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState('');
  const [turnTimer, setTurnTimer] = useState(TURN_TIME_SECONDS);
  const [turnTimerMax, setTurnTimerMax] = useState(TURN_TIME_SECONDS);
  const [dealAnim, setDealAnim] = useState<{ key: number; targets: number[] }>({ key: 0, targets: [] });
  const [chipAnim, setChipAnim] = useState<ChipAnimationEvent | null>(null);
  const [isDealing, setIsDealing] = useState(false);

  const roomRef = useRef(room);
  const myUsernameRef = useRef(myUsername);
  const gameRef = useRef(game);
  const navigateRef = useRef(navigate);
  const setRoomRef = useRef(setRoom);
  const bankerAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealStreetKeyRef = useRef('');
  const capturedRound = useRef<number>(0);
  const prevRoundRef = useRef<number>(game.round);
  const turnTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnDeadlineRef = useRef<number>(0);
  const clearTurnTickRef = useRef<() => void>(() => {});
  const startLocalTurnTickRef = useRef<(secondsLeft: number, deadline?: number) => void>(() => {});
  /** 对局进行中刷新后，等待 WS game_sync；未收到则周期性重发 join */
  const awaitingGameSyncRef = useRef(false);
  const sendRef = useRef<(data: any) => boolean>(() => false);
  const settleAnimAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  roomRef.current = room;
  myUsernameRef.current = myUsername;
  gameRef.current = game;
  navigateRef.current = navigate;
  setRoomRef.current = setRoom;

  const { visualSeats } = useMemo(() => calcSeatRotation(room, myUsername), [room, myUsername]);
  const currentActor = game.toAct?.[0] || null;

  const clearTurnTick = useCallback(() => {
    if (turnTickRef.current) {
      clearInterval(turnTickRef.current);
      turnTickRef.current = null;
    }
  }, []);

  const startLocalTurnTick = useCallback((secondsLeft: number, deadline?: number) => {
    clearTurnTick();
    const secs = Math.max(0, Math.floor(secondsLeft));
    setTurnTimer(secs);
    setTurnTimerMax((prev) => Math.max(prev, secs, TURN_TIME_SECONDS));
    turnDeadlineRef.current = deadline || (Date.now() + secs * 1000);
    const warned = { done: false };
    turnTickRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((turnDeadlineRef.current - Date.now()) / 1000));
      setTurnTimer(left);
      if (left === 30 && !warned.done) {
        warned.done = true;
        playWarnSound();
      }
      if (left <= 0 && turnTickRef.current) {
        clearInterval(turnTickRef.current);
        turnTickRef.current = null;
      }
    }, 250);
  }, [clearTurnTick]);

  clearTurnTickRef.current = clearTurnTick;
  startLocalTurnTickRef.current = startLocalTurnTick;

  useEffect(() => {
    if (!currentActor) {
      clearTurnTick();
      setTurnTimer(TURN_TIME_SECONDS);
      setTurnTimerMax(TURN_TIME_SECONDS);
      return;
    }
    // 暂停中不本地重置倒计时
    if (room?.paused) {
      clearTurnTick();
      return;
    }
    // 新行动者：先本地重置，等待服务端 turn_timer 校准
    setTurnTimerMax(TURN_TIME_SECONDS);
    startLocalTurnTick(TURN_TIME_SECONDS);
    return () => clearTurnTick();
  }, [currentActor, clearTurnTick, startLocalTurnTick, room?.paused]);

  useEffect(() => {
    if (game.phase !== 'dealing') {
      setIsDealing(false);
      return;
    }

    // 同一局同一街只播一次（避免 players 数组引用变化导致重复）
    const streetKey = `${game.round}:${game.betRound}:${game.phase}`;
    if (dealStreetKeyRef.current === streetKey) return;
    dealStreetKeyRef.current = streetKey;

    const targets = game.players
      .filter((player) => !player.folded && !player.eliminated)
      .map((player) => {
        const physIdx = room?.seats?.findIndex((seat) => seat?.username === player.username) ?? -1;
        if (physIdx < 0) return -1;
        return visualSeats.indexOf(physIdx);
      })
      .filter((value) => value >= 0);

    // 自己也要收到飞牌（落到手牌区）
    const myPhys = room?.seats?.findIndex((seat) => seat?.username === myUsername) ?? -1;
    if (myPhys >= 0) {
      const myVisual = visualSeats.indexOf(myPhys);
      if (myVisual >= 0 && !targets.includes(myVisual)) targets.push(myVisual);
    }

    const key = Date.now();
    setIsDealing(true);
    setDealAnim({ key, targets });
    if (dealTimerRef.current) clearTimeout(dealTimerRef.current);
    const duration = estimateDealDurationMs(targets.length);
    dealTimerRef.current = setTimeout(() => {
      setDealAnim({ key: 0, targets: [] });
      setIsDealing(false);
      dealTimerRef.current = null;
    }, duration);
  }, [game.phase, game.round, game.betRound, game.players, room?.seats, visualSeats, myUsername]);

  useEffect(() => {
    return () => {
      if (dealTimerRef.current) {
        clearTimeout(dealTimerRef.current);
        dealTimerRef.current = null;
      }
      if (settleAnimAckTimerRef.current) {
        clearTimeout(settleAnimAckTimerRef.current);
        settleAnimAckTimerRef.current = null;
      }
      if (bankerAnimRef.current) {
        clearInterval(bankerAnimRef.current);
        bankerAnimRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (game.phase !== 'selecting' && game.selected.length) {
      game.setSelected([]);
    }
  }, [game.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 发牌张数变化时清掉选中，避免上一局/误点的黄框残留在暗牌上
  const handLenRef = useRef(0);
  useEffect(() => {
    const len = game.myHand.length;
    if (len !== handLenRef.current) {
      handLenRef.current = len;
      if (game.phase !== 'selecting' && game.selected.length) {
        game.setSelected([]);
      }
    }
  }, [game.myHand.length, game.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新一局开始时清掉上一局的选牌/配牌预览
  useEffect(() => {
    if (game.round !== prevRoundRef.current) {
      game.clearKnockedThisRound();
      game.clearFeed();
      game.setSelected([]);
      game.setMySplit(null);
      prevRoundRef.current = game.round;
    }
  }, [game]);

  // 阶段切换弱提示进动作条（不占桌心）
  const phaseFeedRef = useRef('');
  useEffect(() => {
    if (!game.gameStarted) {
      phaseFeedRef.current = '';
      return;
    }
    const key = `${game.round}:${game.phase}`;
    if (phaseFeedRef.current === key) return;
    const prev = phaseFeedRef.current;
    phaseFeedRef.current = key;
    if (!prev) return; // 首帧/重连不同步刷一条
    const labels: Record<string, string> = {
      betting2: '→ 第二轮（发第3张）',
      betting3: '→ 第三轮（发第4张）',
      selecting: '→ 配牌',
      comparing: '→ 比牌',
    };
    const label = labels[game.phase];
    if (label) game.pushFeed(label, 'phase');
  }, [game.gameStarted, game.round, game.phase]);

  useEffect(() => {
    if (game.phase === 'done' && game.round !== capturedRound.current) {
      capturedRound.current = game.round;
      const compareResult = game.compareResult;
      const endReason = compareResult?.reason || null;
      const record: RoundRecord = {
        round: game.round,
        bankerUsername: game.bankerUsername || '',
        winner: compareResult?.winner || null,
        endReason,
        players: game.players.map((player) => {
          const result = compareResult?.results?.[player.username];
          const fullHand = compareResult?.hands?.[player.username];
          const fullSplit = compareResult?.splits?.[player.username];
          const folded = !!player.folded;
          return {
            username: player.username,
            nickname: player.nickname,
            // 优先用结算快照里的完整手牌（含暗牌）
            hand: Array.isArray(fullHand) && fullHand.length
              ? [...fullHand]
              : [...(player.publicCards || [])],
            split: fullSplit || player.split || null,
            lastDelta: result?.lastDelta ?? player.lastDelta,
            wins: result?.wins || 0,
            losses: result?.losses || 0,
            ties: result?.ties || 0,
            folded,
            rested: !!player.rested || (endReason === 'rest_cross' && !folded),
            eliminated: player.eliminated,
          };
        }),
      };
      game.addRoundHistory(record);
    }
    if (game.phase === 'idle') {
      capturedRound.current = 0;
    }
  }, [game]);

  const handlersRef = useRef<Record<string, (msg: any) => void> | null>(null);
  if (!handlersRef.current) {
    handlersRef.current = {
      room_update: (msg: any) => {
        const r = msg.room || {};
        setRoomRef.current({
          ...r,
          durationMinutes: r.durationMinutes ?? 120,
          endsAt: r.endsAt ?? null,
          extendedMinutes: r.extendedMinutes || 0,
          paused: !!r.paused,
          endAfterHand: !!r.endAfterHand,
          disbanded: !!r.disbanded,
        });
        if (r.disbanded && r.lastSettlement?.settlement) {
          awaitingGameSyncRef.current = false;
          gameRef.current.setSettlement(
            r.lastSettlement.settlement,
            r.lastSettlement.potSplit || null,
          );
        }
      },
      room_time_update: (msg: any) => {
        const cur = useRoomStore.getState().room;
        if (!cur) return;
        setRoomRef.current({
          ...cur,
          endsAt: msg.endsAt ?? cur.endsAt,
          extendedMinutes: msg.extendedMinutes ?? cur.extendedMinutes,
          durationMinutes: msg.durationMinutes ?? cur.durationMinutes,
        });
        gameRef.current.pushFeed(
          `房主加时 +${msg.addedMinutes || 0} 分钟`,
          'system'
        );
      },
      game_paused: (msg: any) => {
        clearTurnTickRef.current?.();
        const cur = useRoomStore.getState().room;
        if (cur) {
          setRoomRef.current({
            ...cur,
            paused: true,
            endsAt: msg.endsAt ?? cur.endsAt,
          });
        }
        gameRef.current.pushFeed('房主已暂停对局', 'system');
        gameRef.current.showToast('对局已暂停', { sticky: true });
      },
      game_resumed: (msg: any) => {
        const cur = useRoomStore.getState().room;
        if (cur) {
          setRoomRef.current({
            ...cur,
            paused: false,
            endsAt: msg.endsAt ?? cur.endsAt,
          });
        }
        gameRef.current.pushFeed('对局已恢复', 'system');
        gameRef.current.showToast('对局已恢复', { ms: 2000 });
      },
      host_end_scheduled: () => {
        const cur = useRoomStore.getState().room;
        if (cur) setRoomRef.current({ ...cur, endAfterHand: true });
        gameRef.current.pushFeed('房主已设定：本局结束后结算', 'system');
      },
      game_init: () => {
        gameRef.current.setGameStarted(true);
        gameRef.current.setRoundHistory([]);
        awaitingGameSyncRef.current = false;
      },
      game_sync: (msg: any) => {
        awaitingGameSyncRef.current = false;
        gameRef.current.setGameStarted(true);
        gameRef.current.setPrivateState(msg.state);
        if (Array.isArray(msg.roundHistory)) {
          gameRef.current.setRoundHistory(msg.roundHistory);
        }
      },
      round_history: (msg: any) => {
        if (Array.isArray(msg.history)) {
          gameRef.current.setRoundHistory(msg.history);
        }
      },
      game_state: (msg: any) => {
        awaitingGameSyncRef.current = false;
        gameRef.current.setPublicState(msg.state);
      },
      game_private: (msg: any) => {
        awaitingGameSyncRef.current = false;
        gameRef.current.setPrivateState(msg.state);
      },
      game_action: (msg: any) => {
        if (!msg.action) return;

        const currentGame = gameRef.current;
        const currentRoom = roomRef.current;
        const { visualSeats: currentVisualSeats } = calcSeatRotation(currentRoom, myUsernameRef.current);
        const visualOf = (username?: string) => {
          if (!username) return -1;
          const physicalIndex = currentRoom?.seats?.findIndex((seat) => seat?.username === username) ?? -1;
          return physicalIndex >= 0 ? currentVisualSeats.indexOf(physicalIndex) : -1;
        };

        // 下注：筹码飞到该座位桌面喊价区（尚未入底池）
        const seatBetActions = new Set(['see', 'raise', 'knock', 'call']);
        if (msg.action.player && seatBetActions.has(msg.action.action)) {
          const visualSeatIndex = visualOf(msg.action.player);
          if (visualSeatIndex >= 0) {
            setChipAnim({
              key: Date.now(),
              kind: 'to_seat_bet',
              fromVisualSeat: visualSeatIndex,
              toVisualSeat: visualSeatIndex,
              player: msg.action.player,
              amount: msg.action.amount ?? msg.action.bet,
            });
          }
        }

        // 弃牌：喊价真正进底池 → 飞向底池
        if (msg.action.action === 'fold' && msg.action.player) {
          const visualSeatIndex = visualOf(msg.action.player);
          if (visualSeatIndex >= 0) {
            setChipAnim({
              key: Date.now(),
              kind: 'to_pot',
              fromVisualSeat: visualSeatIndex,
              player: msg.action.player,
              amount: msg.action.lost ?? msg.action.amount ?? msg.action.bet,
            });
          }
        }

        let text = '';
        switch (msg.action.action) {
          case 'see':
            text = `${msg.action.name} 跟 ${msg.action.bet ?? msg.action.delta ?? ''}`.trim();
            if (msg.action.player && msg.action.allIn) currentGame.knockUser(msg.action.player);
            break;
          case 'fold':
            text = `${msg.action.name} 甩`;
            playFoldSound();
            break;
          case 'raise':
            text = `${msg.action.name} 返 ${msg.action.amount}`;
            if (msg.action.player && msg.action.allIn) currentGame.knockUser(msg.action.player);
            break;
          case 'knock':
            text = `${msg.action.name} 敲`;
            playKnockSound();
            if (msg.action.player) currentGame.knockUser(msg.action.player);
            break;
          case 'rest':
            text = `${msg.action.name} 休`;
            break;
          case 'call':
            text = `${msg.action.name} 叫 ${msg.action.amount}`;
            if (msg.action.player && msg.action.allIn) currentGame.knockUser(msg.action.player);
            break;
        }
        if (text) {
          if (msg.action.timeout) text = `${text}（超时）`;
          currentGame.pushFeed(text, 'action');
        }
      },
      game_compare: (msg: any) => {
        const currentGame = gameRef.current;
        currentGame.setCompareResult(msg.result);
        // 不再播报赢家 Toast，局末尽快进下一局；筹码动画仍保留
        if (msg.result?.reason !== 'all_folded' && msg.result?.reason !== 'rest_cross') {
          playWinSound();
        }

        // 结算动画：底池 → 赢家；输家喊价区 → 赢家（简化：有净赢的飞向赢家）
        const currentRoom = roomRef.current;
        const { visualSeats: currentVisualSeats } = calcSeatRotation(currentRoom, myUsernameRef.current);
        const visualOf = (username?: string | null) => {
          if (!username) return -1;
          const physicalIndex = currentRoom?.seats?.findIndex((seat) => seat?.username === username) ?? -1;
          return physicalIndex >= 0 ? currentVisualSeats.indexOf(physicalIndex) : -1;
        };
        const winnerName = msg.result?.winner as string | undefined;
        const winnerSeat = visualOf(winnerName);
        if (winnerSeat >= 0 && msg.result?.reason !== 'rest_cross') {
          // all_folded：弃牌已 to_pot，只需底池→赢家；再 seat_to_seat 会重复飞一次
          const baseDelay = settleAnimBaseDelayMs(msg.result?.reason);
          const foldedOnly = msg.result?.reason === 'all_folded' || msg.result?.reason === 'all_sanhua';
          setTimeout(() => {
            setChipAnim({
              key: Date.now(),
              kind: 'pot_to_seat',
              toVisualSeat: winnerSeat,
              player: winnerName,
              amount: 20,
            });
          }, baseDelay);
          if (!foldedOnly) {
            const results = msg.result?.results || {};
            let delay = baseDelay + SETTLE_ANIM_TIMING.AFTER_POT_TO_WINNER_MS;
            Object.entries(results).forEach(([uname, r]: [string, any]) => {
              if (uname === winnerName) return;
              if ((r?.lastDelta ?? 0) >= 0) return;
              const fromSeat = visualOf(uname);
              if (fromSeat < 0) return;
              setTimeout(() => {
                setChipAnim({
                  key: Date.now() + fromSeat,
                  kind: 'seat_to_seat',
                  fromVisualSeat: fromSeat,
                  toVisualSeat: winnerSeat,
                  player: uname,
                  amount: Math.abs(r.lastDelta || 10),
                });
              }, delay);
              delay += SETTLE_ANIM_TIMING.SEAT_STAGGER_MS;
            });
          }
        }

        // B：本地结算飞筹估时结束后 ACK，服务端齐了或超时再开下一局
        if (msg.settleAnimId) {
          if (settleAnimAckTimerRef.current) {
            clearTimeout(settleAnimAckTimerRef.current);
            settleAnimAckTimerRef.current = null;
          }
          const waitMs = estimateSettleChipAnimMs(msg.result);
          settleAnimAckTimerRef.current = setTimeout(() => {
            settleAnimAckTimerRef.current = null;
            sendRef.current({ type: 'settle_anim_done', settleAnimId: msg.settleAnimId });
          }, waitMs);
        }
      },
      game_settlement: (msg: any) => {
        awaitingGameSyncRef.current = false;
        setBuyInDecision(null);
        gameRef.current.setSettlement(msg.settlement || [], msg.potSplit || null);
      },
      room_ended: (msg: any) => {
        awaitingGameSyncRef.current = false;
        gameRef.current.reset();
        alert(msg.msg || '对局已结束，房间已关闭');
        navigateRef.current('/lobby', { replace: true });
      },
      awaiting_buyin_decision: (msg: any) => {
        // 兼容旧单人字段
        const players = Array.isArray(msg.players) && msg.players.length
          ? msg.players
          : (msg.brokeUsername
            ? [{ username: msg.brokeUsername, nickname: msg.brokeNickname, choice: null, amount: null }]
            : []);
        const pending = Array.isArray(msg.pending)
          ? msg.pending
          : players.filter((p: any) => !p.choice).map((p: any) => p.username);
        const waitingText = msg.waitingText
          || (pending.length
            ? `等待 ${players.filter((p: any) => pending.includes(p.username)).map((p: any) => p.nickname || p.username).join('、')} 加簸或退出…`
            : '正在处理…');
        setBuyInDecision({ players, pending, waitingText });
        gameRef.current.showToast(waitingText, { sticky: true });
      },
      buyin_decision_cleared: () => {
        setBuyInDecision(null);
        gameRef.current.clearToast();
      },
      buyin_pending: (msg: any) => {
        const name = msg.nickname || msg.username || '玩家';
        const amount = msg.amount ?? 0;
        const suffix = msg.pending === false ? '' : '（下局生效）';
        gameRef.current.pushFeed(`${name} 加簸 ${amount}${suffix}`, 'system');
      },
      player_reconnected: (msg: any) => {
        const name = msg.nickname || msg.username || '玩家';
        gameRef.current.pushFeed(`${name} 重新连接`, 'system');
      },
      player_disconnected: (msg: any) => {
        const name = msg.nickname || msg.username || '玩家';
        gameRef.current.pushFeed(`${name} 掉线`, 'system');
      },
      player_stand: (msg: any) => {
        const name = msg.nickname || msg.username || '玩家';
        gameRef.current.pushFeed(`${name} 起身离座`, 'system');
      },
      player_left: (msg: any) => {
        const name = msg.nickname || msg.username || '玩家';
        gameRef.current.pushFeed(`${name} 离开房间`, 'system');
      },
      room_disbanded: () => {
        awaitingGameSyncRef.current = false;
        gameRef.current.reset();
        alert('房间已被房主解散');
        navigateRef.current('/lobby', { replace: true });
      },
      error: (msg: any) => {
        gameRef.current.showToast(msg.msg || '错误', { ms: 2800 });
        gameRef.current.pushFeed(msg.msg || '错误', 'error');
        if (msg.code === 'ROOM_GONE' || /房间不存在|已关闭|已解散/.test(String(msg.msg || ''))) {
          awaitingGameSyncRef.current = false;
          navigateRef.current('/lobby', { replace: true });
        }
      },
      banker_selecting: () => {
        const currentGame = gameRef.current;
        currentGame.setBankerHighlight(null);
        currentGame.showToast('系统随机选庄中', { sticky: true });
      },
      banker_selected: (msg: any) => {
        if (bankerAnimRef.current) {
          clearInterval(bankerAnimRef.current);
          bankerAnimRef.current = null;
        }
        gameRef.current.setBankerHighlight(null);
        // 首局定庄短提示即可；之后轮庄不再播报
        gameRef.current.showToast(`${msg.bankerName || msg.banker} 是庄家`, { ms: 1200 });
      },
      banker_rotated: () => {
        // 轮庄只靠「庄」标签体现，不再弹消息
      },
      turn_warning: () => {
        playWarnSound();
      },
      turn_timer: (msg: any) => {
        const secs = Number(msg.secondsLeft);
        if (!Number.isFinite(secs)) return;
        setTurnTimerMax((prev) => Math.max(prev, Math.floor(secs), TURN_TIME_SECONDS));
        startLocalTurnTickRef.current(secs, msg.deadline ? Number(msg.deadline) : undefined);
      },
      player_timeout: (msg: any) => {
        const currentRoom = roomRef.current;
        const name = currentRoom?.seats.find((seat) => seat?.username === msg.username)?.nickname || msg.username;
        gameRef.current.pushFeed(`${name} 因长时间未操作已离开座位`, 'system');
      },
    };
  }

  const handlers = handlersRef.current!;
  const { send, ensureConnected } = useWebSocket(code || null, handlers);
  sendRef.current = send;

  /** 把 GET /api/rooms/:code 的 room 规范化进 store（与 WS room_update 字段对齐） */
  const applyRoomPayload = useCallback((r: any) => {
    if (!r) return;
    setRoom({
      ...r,
      durationMinutes: r.durationMinutes ?? 120,
      endsAt: r.endsAt ?? null,
      extendedMinutes: r.extendedMinutes || 0,
      paused: !!r.paused,
      endAfterHand: !!r.endAfterHand,
      disbanded: !!r.disbanded,
    });
  }, [setRoom]);

  /**
   * HTTP 写操作成功后主动拉一次房间快照。
   * 不替代 WS：WS 仍负责他人操作推送；这里保证「自己点了坐下/准备」在 WS 短暂丢包时本地也能刷新。
   */
  const refreshRoom = useCallback(async () => {
    if (!code) return false;
    const result = await api(`/api/rooms/${code}`);
    if (!result?.ok || !result.room) return false;
    applyRoomPayload(result.room);
    if (result.room.disbanded && result.room.lastSettlement?.settlement) {
      awaitingGameSyncRef.current = false;
      gameRef.current.setSettlement(
        result.room.lastSettlement.settlement,
        result.room.lastSettlement.potSplit || null,
      );
    }
    ensureConnected();
    return true;
  }, [api, applyRoomPayload, code, ensureConnected]);

  useEffect(() => {
    game.reset();
    awaitingGameSyncRef.current = false;
    return () => { game.reset(); awaitingGameSyncRef.current = false; };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    api(`/api/rooms/${code}`).then((result) => {
      if (!result.ok) {
        alert(result.msg || '房间不存在或已解散');
        navigate('/lobby', { replace: true });
        return;
      }
      const r = result.room;
      applyRoomPayload(r);
      if (r.disbanded) {
        awaitingGameSyncRef.current = false;
        if (r.lastSettlement?.settlement?.length) {
          gameRef.current.setSettlement(r.lastSettlement.settlement, r.lastSettlement.potSplit || null);
        } else {
          alert('对局已结束，房间已关闭');
          navigate('/lobby', { replace: true });
        }
        return;
      }
      // 对局进行中：等 WS 补 game_sync；未开局则不需要
      awaitingGameSyncRef.current = !!r.gameStarted;
      ensureConnected();
    });
  }, [code, api, navigate, applyRoomPayload, ensureConnected]);

  // 刷新后若迟迟收不到 game_sync，周期性重发 join_room
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => {
      if (!awaitingGameSyncRef.current) return;
      ensureConnected();
    }, 2500);
    const stop = setTimeout(() => {
      if (awaitingGameSyncRef.current) {
        awaitingGameSyncRef.current = false;
        gameRef.current.showToast('对局状态同步超时，请再次刷新', { ms: 3200 });
      }
    }, 45000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [code, ensureConnected]);

  const getAvatar = useCallback((username?: string) => {
    if (!room || !username) return undefined;
    const member = room.members.find((item) => item.username === username);
    return member?.avatar_path || undefined;
  }, [room]);

  const sitWithBuyIn = useCallback(async (physIdx: number, amount: number) => {
    if (!code) return false;
    const sid = SEAT_IDS[physIdx];
    const result = await api(`/api/rooms/${code}/sit`, {
      method: 'POST',
      body: JSON.stringify({ seatId: sid, buyIn: amount }),
    });
    if (!result?.ok) {
      alert(result?.msg || '入座失败');
      return false;
    }
    await refreshRoom();
    if (result.spectating) {
      game.pushFeed('已入座，本局观战，下一局开始打牌', 'system');
    }
    return true;
  }, [api, code, game, refreshRoom]);

  const handleSit = useCallback(async (visualIdx: number) => {
    const physIdx = visualSeats[visualIdx];
    if (physIdx == null || !room) return;

    const mySeat = room.seats.find((s) => s?.username === myUsername);
    const gameStarted = !!room.gameStarted;
    const inHandPhases = ['betting1', 'betting2', 'betting3', 'dealing', 'selecting', 'comparing'];
    const inHand = gameStarted && inHandPhases.includes(game.phase);
    const myPlayer = game.players.find((p) => p.username === myUsername);
    const canChange = !!mySeat && gameStarted && (!inHand || !!myPlayer?.folded);

    // 已入座 + 对局中且不可换座：空座不应可点（UI 已禁，双保险）
    if (mySeat && gameStarted && !canChange) return;

    // 已入座且允许换座：确认后换座，不弹买入
    if (mySeat && canChange) {
      setPendingSeatIdx(physIdx);
      setShowSeatChange(true);
      return;
    }

    const minBuy = room.minBuyIn || 100;
    const carry = Math.max(0, Math.floor(Number(room.myCarryChips) || 0));

    // 结余已够最少带入：直接入座，不再掏钱
    if (gameStarted && carry >= minBuy) {
      await sitWithBuyIn(physIdx, 0);
      return;
    }

    // 有结余但不够：加簸补差
    if (gameStarted && carry > 0 && carry < minBuy) {
      const gap = minBuy - carry;
      setBuyInMode('topup');
      setCarryChips(carry);
      setBuyInAmount(gap);
      setPendingSeatIdx(physIdx);
      setShowBuyIn(true);
      return;
    }

    // 无结余：整笔买入
    setBuyInMode('full');
    setCarryChips(0);
    setBuyInAmount(minBuy);
    setPendingSeatIdx(physIdx);
    setShowBuyIn(true);
  }, [visualSeats, room, myUsername, game.phase, game.players, sitWithBuyIn]);

  const handleSitConfirm = useCallback(async () => {
    if (pendingSeatIdx === null) return;
    const ok = await sitWithBuyIn(pendingSeatIdx, buyInAmount);
    if (!ok) return;
    setShowBuyIn(false);
    setPendingSeatIdx(null);
  }, [pendingSeatIdx, buyInAmount, sitWithBuyIn]);

  const handleSeatChangeConfirm = useCallback(async () => {
    if (pendingSeatIdx === null || !code) return;
    const sid = SEAT_IDS[pendingSeatIdx];
    const result = await api(`/api/rooms/${code}/sit`, {
      method: 'POST',
      body: JSON.stringify({ seatId: sid }),
    });
    if (!result?.ok) {
      alert(result?.msg || '换座失败');
      return;
    }
    setShowSeatChange(false);
    setPendingSeatIdx(null);
    await refreshRoom();
    game.pushFeed(`已换到 ${pendingSeatIdx + 1} 号座`, 'system');
  }, [api, code, pendingSeatIdx, game, refreshRoom]);

  const emptySeatAction = useMemo((): 'sit' | 'join' | 'change' | 'none' => {
    if (!room) return 'none';
    if (!room.gameStarted) return 'sit';
    const mySeat = room.seats.find((s) => s?.username === myUsername);
    if (!mySeat) return 'join';
    const inHandPhases = ['betting1', 'betting2', 'betting3', 'dealing', 'selecting', 'comparing'];
    const inHand = inHandPhases.includes(game.phase);
    const myPlayer = game.players.find((p) => p.username === myUsername);
    if (!inHand || myPlayer?.folded) return 'change';
    return 'none';
  }, [room, myUsername, game.phase, game.players]);

  const handleStandUp = useCallback(async () => {
    if (!code) return;
    const result = await api(`/api/rooms/${code}/stand`, { method: 'POST' });
    if (result?.ok) await refreshRoom();
  }, [api, code, refreshRoom]);

  const handleAddBuyIn = useCallback(async (amount: number) => {
    if (!code || amount <= 0) return;
    const result = await api(`/api/rooms/${code}/add-buyin`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    if (result?.ok) await refreshRoom();
  }, [api, code, refreshRoom]);

  const handleBuyInDecision = useCallback((choice: 'continue' | 'settle', amount?: number) => {
    send({ type: 'buyin_decision', choice, amount });
    // 弹窗是否关闭由服务端回推的 awaiting / cleared 决定
  }, [send]);

  const handleReady = useCallback(async () => {
    if (!code) return;
    const result = await api(`/api/rooms/${code}/ready-seat`, { method: 'POST' });
    if (result?.ok) await refreshRoom();
    else if (result?.msg) alert(result.msg);
  }, [api, code, refreshRoom]);

  const handleStartGame = useCallback(async () => {
    if (!code) return;
    const result = await api(`/api/rooms/${code}/start`, { method: 'POST' });
    if (!result.ok) {
      alert(result.msg);
      return;
    }
    await refreshRoom();
  }, [api, code, refreshRoom]);

  const handleDisband = useCallback(async () => {
    if (!code) return;
    if (!confirm('确定要解散房间吗？')) return;
    await api(`/api/rooms/${code}/disband`, { method: 'POST' });
    navigate('/lobby', { replace: true });
  }, [api, code, navigate]);

  const handleLeaveRoom = useCallback(async () => {
    if (!code) return;
    await api(`/api/rooms/${code}/leave`, { method: 'POST' });
    game.reset();
    navigate('/lobby', { replace: true });
  }, [api, code, game, navigate]);

  const handleAction = useCallback((action: string, amount?: number) => {
    send({ type: 'player_action', action, amount });
  }, [send]);

  const handleCardClick = useCallback((idx: number) => {
    if (game.phase !== 'selecting') return;
    game.toggleSelected(idx);
  }, [game]);

  const handleAutoSplit = useCallback(() => {
    const cards = game.myHand;
    if (cards.length < 4) return;
    const combos = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    let best: number[] | null = null;
    let bestVal = -1;
    for (const [i, j] of combos) {
      if (cards[i].order + cards[j].order > bestVal) {
        bestVal = cards[i].order + cards[j].order;
        best = [i, j];
      }
    }
    if (best) game.setSelected(best);
  }, [game]);

  const handleConfirmSplit = useCallback(() => {
    if (game.selected.length !== 2) return;
    send({ type: 'player_split', headIdx: game.selected });
    // 提交后立刻清掉选中高亮；头尾展示改由 mySplit 驱动
    game.setSelected([]);
  }, [game, send]);

  const handleExtendTurn = useCallback(() => {
    send({ type: 'extend_turn' });
  }, [send]);

  const handleExtendTime = useCallback((minutes: number) => {
    send({ type: 'extend_time', minutes });
  }, [send]);

  const handlePauseGame = useCallback(() => {
    send({ type: 'pause_game' });
  }, [send]);

  const handleResumeGame = useCallback(() => {
    send({ type: 'resume_game' });
  }, [send]);

  const handleHostEndAfterHand = useCallback(() => {
    send({ type: 'host_end_after_hand' });
  }, [send]);

  const allReady = useMemo(() => {
    if (!room || room.gameStarted) return false;
    const seated = room.seats.filter((seat) => seat !== null && seat.username !== room.host);
    if (seated.length < 1) return false;
    return seated.every((seat) => seat?.ready);
  }, [room]);

  const spectators = useMemo(() => {
    if (!room) return [];
    const seated = new Set(room.seats.filter(Boolean).map((seat) => seat!.username));
    return room.members.filter((member) => !seated.has(member.username));
  }, [room]);

  const isMyTurn = currentActor === myUsername;
  const isBetting = ['betting1', 'betting2', 'betting3'].includes(game.phase);
  const betStarted = game.betStarted;

  return {
    game,
    showBuyIn,
    setShowBuyIn,
    showSeatChange,
    setShowSeatChange,
    pendingSeatIdx,
    buyInAmount,
    setBuyInAmount,
    buyInMode,
    carryChips,
    showMenu,
    setShowMenu,
    raiseAmount,
    setRaiseAmount,
    turnTimer,
    turnTimerMax,
    dealAnim,
    chipAnim,
    isDealing,
    visualSeats,
    currentActor,
    getAvatar,
    handleSit,
    handleSitConfirm,
    handleSeatChangeConfirm,
    emptySeatAction,
    handleStandUp,
    handleAddBuyIn,
    handleBuyInDecision,
    buyInDecision,
    addBuyInAmount,
    setAddBuyInAmount,
    handleReady,
    handleStartGame,
    handleDisband,
    handleLeaveRoom,
    handleAction,
    handleCardClick,
    handleAutoSplit,
    handleConfirmSplit,
    handleExtendTurn,
    handleExtendTime,
    handlePauseGame,
    handleResumeGame,
    handleHostEndAfterHand,
    allReady,
    spectators,
    isMyTurn,
    isBetting,
    betStarted,
    send,
  };
}
