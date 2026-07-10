import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useGameStore, type RoundRecord } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SEAT_IDS, TURN_TIME_SECONDS } from './constants';
import { calcSeatRotation } from './seatLayout';
import { estimateDealDurationMs } from './components/AnimatedLayer';
import type { ChipAnimationEvent } from './pixi/pixiTableTypes';
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
  const [showHistory, setShowHistory] = useState(false);
  const [viewingRound, setViewingRound] = useState(-1);
  const [raiseAmount, setRaiseAmount] = useState('');
  const [turnTimer, setTurnTimer] = useState(TURN_TIME_SECONDS);
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

  roomRef.current = room;
  myUsernameRef.current = myUsername;
  gameRef.current = game;
  navigateRef.current = navigate;
  setRoomRef.current = setRoom;

  const { visualSeats } = useMemo(() => calcSeatRotation(room, myUsername), [room, myUsername]);
  const currentActor = game.toAct?.[0] || null;

  useEffect(() => {
    if (!currentActor) {
      setTurnTimer(TURN_TIME_SECONDS);
      return;
    }

    setTurnTimer(TURN_TIME_SECONDS);
    const warned = { done: false };
    const interval = setInterval(() => {
      setTurnTimer((timeLeft) => {
        if (timeLeft === 31 && !warned.done) {
          warned.done = true;
          setTimeout(() => playWarnSound(), 900);
        }
        if (timeLeft <= 1) {
          clearInterval(interval);
          return 0;
        }
        return timeLeft - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentActor]);

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
      const record: RoundRecord = {
        round: game.round,
        bankerUsername: game.bankerUsername || '',
        winner: compareResult?.winner || null,
        players: game.players.map((player) => {
          const result = compareResult?.results?.[player.username];
          const fullHand = compareResult?.hands?.[player.username];
          const fullSplit = compareResult?.splits?.[player.username];
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
            folded: player.folded,
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
      room_update: (msg: any) => setRoomRef.current(msg.room),
      game_init: () => { gameRef.current.setGameStarted(true); },
      game_sync: (msg: any) => { gameRef.current.setGameStarted(true); gameRef.current.setPrivateState(msg.state); },
      game_state: (msg: any) => gameRef.current.setPublicState(msg.state),
      game_private: (msg: any) => gameRef.current.setPrivateState(msg.state),
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
          // 底池飞向赢家
          setTimeout(() => {
            setChipAnim({
              key: Date.now(),
              kind: 'pot_to_seat',
              toVisualSeat: winnerSeat,
              player: winnerName,
              amount: 20,
            });
          }, 120);
          // 其他有净输的玩家 → 赢家
          const results = msg.result?.results || {};
          let delay = 280;
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
            delay += 160;
          });
        }
      },
      game_settlement: (msg: any) => {
        setBuyInDecision(null);
        gameRef.current.setSettlement(msg.settlement || []);
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
      player_reconnected: () => gameRef.current.pushFeed('玩家重新连接', 'system'),
      room_disbanded: () => {
        gameRef.current.reset();
        alert('房间已被房主解散');
        navigateRef.current('/lobby', { replace: true });
      },
      error: (msg: any) => {
        gameRef.current.showToast(msg.msg || '错误', { ms: 2800 });
        gameRef.current.pushFeed(msg.msg || '错误', 'error');
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
      player_timeout: (msg: any) => {
        const currentRoom = roomRef.current;
        const name = currentRoom?.seats.find((seat) => seat?.username === msg.username)?.nickname || msg.username;
        gameRef.current.pushFeed(`${name} 因长时间未操作已离开座位`, 'system');
      },
    };
  }

  const handlers = handlersRef.current!;
  const { send } = useWebSocket(code || null, handlers);

  useEffect(() => {
    game.reset();
    return () => { game.reset(); };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    api(`/api/rooms/${code}`).then((result) => {
      if (!result.ok) {
        alert('房间不存在或已解散');
        navigate('/lobby', { replace: true });
        return;
      }
      setRoom(result.room);
    });
  }, [code, api, navigate, setRoom]);

  const getAvatar = useCallback((username?: string) => {
    if (!room || !username) return undefined;
    const member = room.members.find((item) => item.username === username);
    return member?.avatar_path || undefined;
  }, [room]);

  const handleSit = useCallback((visualIdx: number) => {
    const physIdx = visualSeats[visualIdx];
    if (physIdx == null || !room) return;
    const base = room.minBuyIn || 100;
    setBuyInAmount(base);
    setPendingSeatIdx(physIdx);
    setShowBuyIn(true);
  }, [visualSeats, room]);

  const handleSitConfirm = useCallback(async () => {
    if (pendingSeatIdx === null || !code) return;
    const sid = SEAT_IDS[pendingSeatIdx];
    await api(`/api/rooms/${code}/sit`, {
      method: 'POST',
      body: JSON.stringify({ seatId: sid, buyIn: buyInAmount }),
    });
    setShowBuyIn(false);
    setPendingSeatIdx(null);
  }, [api, buyInAmount, code, pendingSeatIdx]);

  const handleStandUp = useCallback(async () => {
    if (!code) return;
    await api(`/api/rooms/${code}/stand`, { method: 'POST' });
  }, [api, code]);

  const handleAddBuyIn = useCallback(async (amount: number) => {
    if (!code || amount <= 0) return;
    await api(`/api/rooms/${code}/add-buyin`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }, [api, code]);

  const handleBuyInDecision = useCallback((choice: 'continue' | 'settle', amount?: number) => {
    send({ type: 'buyin_decision', choice, amount });
    // 弹窗是否关闭由服务端回推的 awaiting / cleared 决定
  }, [send]);

  const handleReady = useCallback(async () => {
    if (!code) return;
    await api(`/api/rooms/${code}/ready-seat`, { method: 'POST' });
  }, [api, code]);

  const handleStartGame = useCallback(async () => {
    if (!code) return;
    const result = await api(`/api/rooms/${code}/start`, { method: 'POST' });
    if (!result.ok) alert(result.msg);
  }, [api, code]);

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
    pendingSeatIdx,
    buyInAmount,
    setBuyInAmount,
    showMenu,
    setShowMenu,
    showHistory,
    setShowHistory,
    viewingRound,
    setViewingRound,
    raiseAmount,
    setRaiseAmount,
    turnTimer,
    dealAnim,
    chipAnim,
    isDealing,
    visualSeats,
    currentActor,
    getAvatar,
    handleSit,
    handleSitConfirm,
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
    allReady,
    spectators,
    isMyTurn,
    isBetting,
    betStarted,
    send,
  };
}
