import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useGameStore, type RoundRecord } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SEAT_IDS, TURN_TIME_SECONDS } from './constants';
import { ANIMATION_MS } from './animationEvents';
import { calcSeatRotation } from './seatLayout';
import type { ChipAnimationEvent } from './pixi/pixiTableTypes';

type ApiFn = (url: string, opts?: RequestInit) => Promise<any>;

interface UseRoomGameControllerArgs {
  code: string | undefined;
  room: RoomInfo | null;
  myUsername: string;
  navigate: NavigateFunction;
  api: ApiFn;
  setRoom: (room: RoomInfo) => void;
}

let audioCtx: AudioContext | null = null;
function playWarningBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {}
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
  const [buyInDecision, setBuyInDecision] = useState<{ brokeUsername: string; brokeNickname: string } | null>(null);
  const [addBuyInAmount, setAddBuyInAmount] = useState(100);
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingRound, setViewingRound] = useState(-1);
  const [raiseAmount, setRaiseAmount] = useState('');
  const [turnTimer, setTurnTimer] = useState(TURN_TIME_SECONDS);
  const [dealAnim, setDealAnim] = useState<{ key: number; targets: number[] }>({ key: 0, targets: [] });
  const [chipAnim, setChipAnim] = useState<ChipAnimationEvent | null>(null);

  const roomRef = useRef(room);
  const myUsernameRef = useRef(myUsername);
  const gameRef = useRef(game);
  const navigateRef = useRef(navigate);
  const setRoomRef = useRef(setRoom);
  const bankerAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          setTimeout(() => playWarningBeep(), 900);
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
    if (game.phase !== 'dealing') return;

    const targets = game.players
      .filter((player) => !player.folded && !player.eliminated)
      .map((player) => {
        const physIdx = room?.seats?.findIndex((seat) => seat?.username === player.username) ?? -1;
        if (physIdx < 0) return -1;
        return visualSeats.indexOf(physIdx);
      })
      .filter((value) => value >= 0);
    const key = Date.now();
    setDealAnim({ key, targets });
    if (dealTimerRef.current) clearTimeout(dealTimerRef.current);
    dealTimerRef.current = setTimeout(() => {
      setDealAnim({ key: 0, targets: [] });
      dealTimerRef.current = null;
    }, ANIMATION_MS.deal + 100);
  }, [game.phase, game.players, room?.seats, visualSeats]);

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
    if (game.round !== prevRoundRef.current) {
      game.clearKnockedThisRound();
      prevRoundRef.current = game.round;
    }
  }, [game]);

  useEffect(() => {
    if (game.phase === 'done' && game.compareResult && game.round !== capturedRound.current) {
      capturedRound.current = game.round;
      const compareResult = game.compareResult;
      const record: RoundRecord = {
        round: game.round,
        bankerUsername: game.bankerUsername || '',
        winner: compareResult?.winner || null,
        players: game.players.map((player) => {
          const result = compareResult?.results?.[player.username];
          return {
            username: player.username,
            nickname: player.nickname,
            hand: [...(player.publicCards || [])],
            split: player.split || null,
            lastDelta: player.lastDelta,
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
        const chipActions = new Set(['see', 'raise', 'knock', 'call']);
        if (msg.action.player && chipActions.has(msg.action.action)) {
          const currentRoom = roomRef.current;
          const { visualSeats: currentVisualSeats } = calcSeatRotation(currentRoom, myUsernameRef.current);
          const physicalIndex = currentRoom?.seats?.findIndex((seat) => seat?.username === msg.action.player) ?? -1;
          const visualSeatIndex = physicalIndex >= 0 ? currentVisualSeats.indexOf(physicalIndex) : -1;
          if (visualSeatIndex >= 0) {
            setChipAnim({
              key: Date.now(),
              player: msg.action.player,
              visualSeatIndex,
              amount: msg.action.amount ?? msg.action.bet,
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
            break;
          case 'raise':
            text = `${msg.action.name} 返 ${msg.action.amount}`;
            if (msg.action.player && msg.action.allIn) currentGame.knockUser(msg.action.player);
            break;
          case 'knock':
            text = `${msg.action.name} 敲`;
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
        currentGame.setHintText(text);
      },
      game_compare: (msg: any) => {
        const currentGame = gameRef.current;
        currentGame.setCompareResult(msg.result);
        const winner = msg.result?.winner
          ? currentGame.players.find((player) => player.username === msg.result.winner)
          : null;
        currentGame.setCenterMessage(`本局胜者: ${winner?.nickname || msg.result?.winner || '-'}`);
      },
      game_settlement: (msg: any) => {
        setBuyInDecision(null);
        gameRef.current.setSettlement(msg.settlement || []);
      },
      awaiting_buyin_decision: (msg: any) => {
        setBuyInDecision({
          brokeUsername: msg.brokeUsername,
          brokeNickname: msg.brokeNickname,
        });
      },
      buyin_pending: (msg: any) => {
        gameRef.current.setHintText(`${msg.username} 已申请加簸 ${msg.amount}（下局生效）`);
      },
      player_reconnected: () => gameRef.current.setHintText('玩家重新连接'),
      room_disbanded: () => {
        gameRef.current.reset();
        alert('房间已被房主解散');
        navigateRef.current('/lobby', { replace: true });
      },
      error: (msg: any) => gameRef.current.setHintText(msg.msg || '错误'),
      banker_selecting: () => {
        const currentGame = gameRef.current;
        const currentRoom = roomRef.current;
        currentGame.setCenterMessage('选庄中...');
        const seats = currentRoom?.seats?.filter(Boolean) || [];
        if (seats.length === 0) return;
        if (bankerAnimRef.current) clearInterval(bankerAnimRef.current);
        bankerAnimRef.current = setInterval(() => {
          const rand = seats[Math.floor(Math.random() * seats.length)];
          currentGame.setBankerHighlight(rand!.username);
        }, 150);
      },
      banker_selected: (msg: any) => {
        if (bankerAnimRef.current) {
          clearInterval(bankerAnimRef.current);
          bankerAnimRef.current = null;
        }
        gameRef.current.setBankerHighlight(null);
        gameRef.current.setCenterMessage(`${msg.bankerName || msg.banker} 是庄家!`);
        setTimeout(() => gameRef.current.setCenterMessage(null), 2000);
      },
      banker_rotated: (msg: any) => {
        gameRef.current.setCenterMessage(`庄家轮转 → ${msg.bankerName || msg.banker}`);
        setTimeout(() => gameRef.current.setCenterMessage(null), 2000);
      },
      turn_warning: () => {
        playWarningBeep();
      },
      player_timeout: (msg: any) => {
        const currentRoom = roomRef.current;
        const name = currentRoom?.seats.find((seat) => seat?.username === msg.username)?.nickname || msg.username;
        gameRef.current.setHintText(`${name} 因长时间未操作已离开座位`);
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
    if (choice === 'continue') setBuyInDecision(null);
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

  const handleGameTypeChange = useCallback(async (gameType: string) => {
    if (!code) return;
    await api(`/api/rooms/${code}/gametype`, {
      method: 'POST',
      body: JSON.stringify({ gameType }),
    });
  }, [api, code]);

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
  }, [game.selected, send]);

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
  const betStarted = game.betStarted || game.betRound === 1;

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
    handleGameTypeChange,
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
