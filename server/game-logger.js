/* ========== 对局复盘日志：中文可读报告 + 调试 NDJSON ========== */
const fs = require('fs');
const path = require('path');
const { DECK } = require('./game');

const LOG_ROOT = path.join(__dirname, '..', 'logs', 'rooms');
const SCHEMA_VERSION = 2;

const CARD_BY_ID = Object.fromEntries(DECK.map(c => [c.id, c]));

const ACTION_CN = {
  rest: '休',
  fold: '弃牌',
  see: '跟',
  raise: '加注',
  call: '叫分',
  knock: '敲',
  show_sanhua: '亮三花',
};

const STREET_CN = {
  1: '暗牌（前两张）',
  2: '第三张',
  3: '第四张',
  showdown: '全下补牌至四张',
};

const REASON_CN = {
  all_folded: '只剩一人，本局结束',
  rest_cross: '全员休，本局作废（休芒）',
  all_matched: '本轮跟平',
  all_in_showdown: '进入全下比牌',
  compare: '比牌结算',
  players: '在座不足两人',
  round_limit: '达到总局数上限',
  time_limit: '到达时长上限',
  host_end: '房主提前结束',
  buyin_exit: '破产选择结算离场',
  disbanded: '房间解散',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

function localTime(iso = isoNow()) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

function cardLabel(cardOrId) {
  if (!cardOrId) return '?';
  if (typeof cardOrId === 'object') {
    return cardOrId.cnName || cardOrId.cnChar || cardOrId.id || '?';
  }
  const c = CARD_BY_ID[cardOrId];
  return c ? c.cnName : String(cardOrId);
}

function cardsLabel(cards) {
  if (!Array.isArray(cards) || !cards.length) return '（无）';
  return cards.map(cardLabel).join('、');
}

function cardIds(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(c => (c && c.id) || c).filter(Boolean);
}

function signed(n) {
  const v = Number(n) || 0;
  if (v > 0) return `+${v}`;
  return String(v);
}

function playerChipView(p) {
  if (!p) return null;
  return {
    username: p.username,
    nickname: p.nickname,
    seatNo: p.seatNo || null,
    seat: p.seat || null,
    pot: p.pot || 0,
    committed: p.committed || 0,
    foldPaid: p.foldPaid || 0,
    pendingBuyIn: p.pendingBuyIn || 0,
    totalBuyIn: p.totalBuyIn || 0,
    folded: !!p.folded,
    allIn: !!p.allIn,
    eliminated: !!p.eliminated,
    rested: !!p.rested,
    sanhuaShown: !!p.sanhuaShown,
    lastDelta: p.lastDelta || 0,
    roundStartPot: p.roundStartPot != null ? p.roundStartPot : null,
  };
}

function buildSnapshot(engine) {
  if (!engine || !engine.state) return null;
  const s = engine.state;
  return {
    potPi: s.potPi || 0,
    currentBet: s.currentBet || 0,
    minBet: s.minBet || 0,
    betStarted: !!s.betStarted,
    betRound: s.betRound || 0,
    lastFinalBet: s.lastFinalBet || 0,
    restMangoLevel: s.restMangoLevel || 0,
    banker: s.bankerIdx >= 0 ? engine.players[s.bankerIdx]?.username : null,
    toAct: [...(s.toAct || [])],
    activeIds: [...(s.activeIds || [])],
    players: engine.players.map(playerChipView),
  };
}

function chipCheckFromSnapshot(snapshot, archives = {}) {
  if (!snapshot) return null;
  // pending 加簸尚未进簸簸、也未计入 totalBuyIn，两侧都不计入，避免局中加簸误报守恒异常
  const seatedSum = (snapshot.players || []).reduce(
    (sum, p) => sum + (p.pot || 0) + (p.committed || 0),
    0,
  );
  const archiveSum = Object.values(archives).reduce(
    (sum, a) => sum + (a.finalPot || 0),
    0,
  );
  const seatedBuyIn = (snapshot.players || []).reduce((sum, p) => sum + (p.totalBuyIn || 0), 0);
  const archiveBuyIn = Object.values(archives).reduce((sum, a) => sum + (a.totalBuyIn || 0), 0);
  const left = seatedSum + (snapshot.potPi || 0) + archiveSum;
  const right = seatedBuyIn + archiveBuyIn;
  return {
    sumStacks: seatedSum,
    potPi: snapshot.potPi || 0,
    archiveSum,
    sumTotalBuyIn: seatedBuyIn + archiveBuyIn,
    left,
    right,
    ok: left === right,
  };
}

class GameLogger {
  constructor(room) {
    this.room = room;
    this.seq = 0;
    this.closed = false;
    this.names = new Map(); // username -> display
    this.actionNo = 0;
    this.currentRound = null;
    this.lastSplitKey = null;
    this.reportPath = null;
    this.debugPath = null;
    this._open();
  }

  _open() {
    const roomDir = path.join(LOG_ROOT, String(this.room.code));
    ensureDir(roomDir);
    const stamp = isoNow().replace(/[:.]/g, '-');
    const id = shortId();
    this.reportPath = path.join(roomDir, `复盘-${stamp}-${id}.md`);
    this.debugPath = path.join(roomDir, `debug-${stamp}-${id}.ndjson`);
    // 兼容旧字段：部分代码可能读 filePath
    this.filePath = this.reportPath;

    const header = [
      `# 扯旋对局复盘 · 房间 ${this.room.code}`,
      '',
      `| 项目 | 内容 |`,
      `| --- | --- |`,
      `| 房间名 | ${this.room.name || '—'} |`,
      `| 房主 | ${this._name(this.room.host)} |`,
      `| 对局时长 | ${this.room.durationMinutes ? `${this.room.durationMinutes} 分钟` : '—'} |`,
      `| 最低带入 | ${this.room.minBuyIn ?? '—'} |`,
      `| 开始时间 | ${localTime()} |`,
      '',
      '> 本文件给人看。同目录 `debug-*.ndjson` 供程序排查，一般不用打开。',
      '',
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(this.reportPath, header, 'utf8');
    fs.writeFileSync(this.debugPath, '', 'utf8');

    this._debug('session_open', {
      host: this.room.host,
      creator: this.room.creator,
      name: this.room.name,
      durationMinutes: this.room.durationMinutes,
      endsAt: this.room.endsAt || null,
      minBuyIn: this.room.minBuyIn,
      reportPath: this.reportPath,
      debugPath: this.debugPath,
    });
  }

  _name(username, nickname) {
    if (!username) return '—';
    if (nickname) this.names.set(username, nickname);
    const nick = this.names.get(username) || nickname;
    return nick && nick !== username ? `${nick}（${username}）` : (nick || username);
  }

  _rememberPlayers(list = []) {
    list.forEach(p => {
      if (p?.username) this._name(p.username, p.nickname);
    });
  }

  _appendReport(text) {
    if (this.closed || !this.reportPath) return;
    try {
      fs.appendFileSync(this.reportPath, text, 'utf8');
    } catch (err) {
      console.error('[GameLogger] report write failed:', err.message);
    }
  }

  _debug(type, payload = {}) {
    if (this.closed || !this.debugPath) return;
    const engine = this.room.game;
    const s = engine?.state;
    const row = {
      v: SCHEMA_VERSION,
      ts: isoNow(),
      seq: ++this.seq,
      type,
      room: String(this.room.code),
      round: s?.round ?? this.currentRound,
      phase: s?.phase ?? null,
      ...payload,
    };
    try {
      fs.appendFileSync(this.debugPath, JSON.stringify(row) + '\n', 'utf8');
    } catch (err) {
      console.error('[GameLogger] debug write failed:', err.message);
    }
  }

  _chipLine(check) {
    if (!check) return '';
    if (check.ok) return `筹码校验：通过（在座+底池 ${check.left} = 总带入 ${check.right}）`;
    return `筹码校验：异常 ⚠️（在座+底池 ${check.left} ≠ 总带入 ${check.right}）`;
  }

  _stackLine(snapshot) {
    if (!snapshot?.players?.length) return '';
    const parts = snapshot.players.map(p => {
      const bits = [`手中 ${p.pot}`];
      if (p.committed) bits.push(`喊价 ${p.committed}`);
      if (p.foldPaid) bits.push(`已弃付 ${p.foldPaid}`);
      if (p.folded) bits.push('已弃');
      if (p.allIn) bits.push('已敲');
      return `${this._name(p.username, p.nickname)} ${bits.join(' / ')}`;
    });
    return `筹码：${parts.join('；')}；底池 ${snapshot.potPi}`;
  }

  _deltasLine(deltas) {
    if (!deltas || !Object.keys(deltas).length) return '';
    return Object.entries(deltas)
      .map(([u, d]) => `${this._name(u)} ${signed(d)}`)
      .join(' · ');
  }

  snapshot(engine = this.room.game) {
    return buildSnapshot(engine);
  }

  chipCheck(engine = this.room.game) {
    return chipCheckFromSnapshot(buildSnapshot(engine), this.room.chipArchives || {});
  }

  logMember(action, user) {
    this._name(user.username, user.nickname);
    this._debug('member', { action, username: user.username, nickname: user.nickname });
    const verb = action === 'join' ? '进入房间' : action === 'leave' ? '离开房间' : action;
    this._appendReport(`- ${localTime()} ${this._name(user.username, user.nickname)} ${verb}\n`);
  }

  logSeat(action, { username, nickname, seatId, seatNo, buyIn, spectating, finalPot }) {
    this._name(username, nickname);
    this._debug('seat', { action, username, nickname, seatId, seatNo, buyIn, spectating, finalPot });
    const seat = seatNo != null ? `座位 ${seatNo}` : (seatId || '座位');
    if (action === 'sit') {
      const extra = spectating ? '（本局观战，下局入局）' : '';
      this._appendReport(`- ${localTime()} ${this._name(username, nickname)} 坐下 ${seat}，带入 ${buyIn ?? '—'} ${extra}\n`);
    } else if (action === 'change') {
      this._appendReport(`- ${localTime()} ${this._name(username, nickname)} 换到 ${seat}\n`);
    } else if (action === 'stand') {
      const pot = finalPot != null ? `，带走 ${finalPot}` : (buyIn != null ? `，带入 ${buyIn}` : '');
      this._appendReport(`- ${localTime()} ${this._name(username, nickname)} 起身离开 ${seat}${pot}\n`);
    }
  }

  logGameStart(engine) {
    this._rememberPlayers(engine.players);
    const banker = engine.state.bankerIdx >= 0 ? engine.players[engine.state.bankerIdx] : null;
    const players = engine.players.map(p => ({
      username: p.username,
      nickname: p.nickname,
      seatNo: p.seatNo,
      seat: p.seat,
      buyIn: p.totalBuyIn || p.pot,
    }));
    this._debug('game_start', {
      gameRound: this.room.gameRound,
      banker: banker?.username || null,
      players,
      snapshot: buildSnapshot(engine),
    });

    const rows = players.map(p =>
      `| ${p.seatNo ?? '—'} | ${this._name(p.username, p.nickname)} | ${p.buyIn} |`
    );
    this._appendReport([
      '',
      '## 开局名单',
      '',
      '| 座位 | 玩家 | 带入 |',
      '| --- | --- | --- |',
      ...rows,
      '',
      banker ? `庄家：${this._name(banker.username, banker.nickname)}` : '庄家：待选定',
      '',
      '---',
      '',
    ].join('\n'));
  }

  logRoundStart(engine, extra = {}) {
    const s = engine.state;
    const banker = s.bankerIdx >= 0 ? engine.players[s.bankerIdx] : null;
    this.currentRound = s.round;
    this.actionNo = 0;
    this.lastSplitKey = null;
    this._rememberPlayers(engine.players);

    const snapshot = buildSnapshot(engine);
    const chipCheck = chipCheckFromSnapshot(snapshot, this.room.chipArchives || {});
    const speakOrder = (s.toAct || []).map(u => this._name(u));

    this._debug('round_start', {
      banker: banker?.username || null,
      bankerSeatNo: banker?.seatNo || null,
      mangoLevel: s.restMangoLevel || 0,
      speakOrder: (s.toAct || []).slice(),
      opener: s.opener || null,
      snapshot,
      chipCheck,
      ...extra,
    });

    const opening = s.openingMango;
    let mango = '无芒果';
    if (opening && opening.level > 0) {
      const amt = opening.amount != null ? opening.amount : opening.level * 10;
      mango = opening.kind === 'beat'
        ? `揍芒 ${opening.level} 级（每人罚 ${amt}，揍芒赢家除外）`
        : `休芒 ${opening.level} 级（每人罚 ${amt}）`;
    } else if (s.restMangoLevel > 0) {
      // 兜底：尚未写入 openingMango 时按 beatMangoWinner 区分
      const amt = s.restMangoLevel * 10;
      mango = s.beatMangoWinner
        ? `揍芒 ${s.restMangoLevel} 级（每人罚 ${amt}，揍芒赢家除外）`
        : `休芒 ${s.restMangoLevel} 级（每人罚 ${amt}）`;
    }
    this._appendReport([
      '',
      `## 第 ${s.round} 局`,
      '',
      `- 庄家：${banker ? this._name(banker.username, banker.nickname) : '—'}（座位 ${banker?.seatNo ?? '—'}）`,
      `- 底池：${s.potPi}（已含底注/芒果）`,
      `- ${mango}`,
      `- 发言顺序：${speakOrder.join(' → ') || '—'}`,
      `- ${this._chipLine(chipCheck)}`,
      '',
    ].join('\n'));
  }

  logDeal(engine, street) {
    const hands = {};
    const handsCn = {};
    engine.players.forEach(p => {
      if (p.hand?.length) {
        hands[p.username] = cardIds(p.hand);
        handsCn[p.username] = p.hand.map(c => cardLabel(c));
      }
    });
    this._debug('deal', {
      street,
      hands,
      remainingCards: Math.max(0, (engine.state.deck?.length || 0) - (engine.state.dealIdx || 0)),
      opener: engine.state.opener || null,
      toAct: [...(engine.state.toAct || [])],
    });

    const title = STREET_CN[street] || `发牌 ${street}`;
    const lines = Object.entries(handsCn).map(([u, cards]) =>
      `- ${this._name(u)}：${cards.join('、')}`
    );
    const opener = engine.state.opener ? ` · 本轮先手 ${this._name(engine.state.opener)}` : '';
    this._appendReport([
      `### 发牌 · ${title}${opener}`,
      '',
      ...lines,
      '',
    ].join('\n'));
  }

  logAction(engine, result, meta = {}) {
    if (!result) return;
    const p = engine.getPlayer(result.player);
    if (p) this._name(p.username, p.nickname);

    const before = meta.before || null;
    const after = p ? {
      pot: p.pot,
      committed: p.committed,
      foldPaid: p.foldPaid || 0,
      allIn: !!p.allIn,
      folded: !!p.folded,
    } : null;
    const table = {
      currentBet: engine.state.currentBet,
      potPi: engine.state.potPi,
      minBet: engine.state.minBet,
      betStarted: engine.state.betStarted,
      betRound: engine.state.betRound,
      toAct: [...(engine.state.toAct || [])],
      activeIds: [...(engine.state.activeIds || [])],
    };

    this._debug('action', {
      actor: result.player,
      actorName: result.name || p?.nickname,
      action: result.action,
      amount: result.amount ?? null,
      delta: result.delta ?? result.bet ?? result.lost ?? result.refund ?? null,
      timeout: !!meta.timeout || !!result.timeout,
      leave: !!meta.leave || !!result.leave,
      before,
      after,
      table,
      snapshot: buildSnapshot(engine),
    });

    this.actionNo += 1;
    const actCn = ACTION_CN[result.action] || result.action;
    const flags = [];
    if (meta.timeout || result.timeout) flags.push('超时自动');
    if (meta.leave || result.leave) flags.push('离场');
    const flagText = flags.length ? `（${flags.join('，')}）` : '';

    let detail = '';
    if (result.action === 'fold') {
      const lost = result.lost || 0;
      detail = lost > 0 ? `，付出喊价 ${lost}` : '（未喊价，不扣分）';
    } else if (result.action === 'rest') {
      detail = '';
    } else if (result.action === 'show_sanhua') {
      detail = result.refund ? `，退还喊价 ${result.refund}` : '，喊价作废';
      if (result.sanhuaType) detail += ` · ${result.sanhuaType}`;
    } else if (result.amount != null) {
      detail = ` ${result.amount}`;
      if (result.delta != null && result.delta !== result.amount) detail += `（本次再付 ${result.delta}）`;
    }

    const chipBits = [];
    if (before && after) {
      if (before.pot !== after.pot || before.committed !== after.committed) {
        chipBits.push(`手中 ${before.pot}→${after.pot}`);
        chipBits.push(`喊价 ${before.committed}→${after.committed}`);
      } else {
        chipBits.push(`手中 ${after.pot}`);
      }
    } else if (after) {
      chipBits.push(`手中 ${after.pot}`);
      if (after.committed) chipBits.push(`喊价 ${after.committed}`);
    }
    chipBits.push(`当前最高 ${table.currentBet}`);
    chipBits.push(`底池 ${table.potPi}`);

    this._appendReport(
      `${this.actionNo}. **${this._name(result.player, result.name || p?.nickname)}** ${actCn}${detail}${flagText}  ·  ${chipBits.join(' · ')}\n`
    );
  }

  logStreetEnd(engine, done) {
    const snapshot = buildSnapshot(engine);
    const chipCheck = chipCheckFromSnapshot(snapshot, this.room.chipArchives || {});
    this._debug('street_end', {
      reason: done?.reason || null,
      winner: done?.winner || null,
      lastFinalBet: engine.state.lastFinalBet || 0,
      snapshot,
      chipCheck,
    });

    const reason = REASON_CN[done?.reason] || done?.reason || '本轮结束';
    const winner = done?.winner ? `，赢家 ${this._name(done.winner)}` : '';
    this._appendReport([
      '',
      `> 本轮结束：${reason}${winner}`,
      `> ${this._stackLine(snapshot)}`,
      `> ${this._chipLine(chipCheck)}`,
      '',
    ].join('\n'));
  }

  logSplit(username, split) {
    if (!split) return;
    const head = cardIds(split.head);
    const tail = cardIds(split.tail);
    const headName = split.headEval?.name || split.headName || null;
    const tailName = split.tailEval?.name || split.tailName || null;
    const key = `${username}|${head.join(',')}|${tail.join(',')}`;
    if (this.lastSplitKey === key) return; // 去重重复提交
    this.lastSplitKey = key;

    this._debug('split', { username, head, tail, headName, tailName });
    this._appendReport(
      `- **${this._name(username)}** 配牌：头「${headName || '?'}」${cardsLabel(split.head)} ／ 尾「${tailName || '?'}」${cardsLabel(split.tail)}\n`
    );
  }

  logCompare(engine, compareResult, snapshotBefore) {
    this._rememberPlayers(engine.players);
    const splits = {};
    Object.entries(engine.state.splits || {}).forEach(([u, sp]) => {
      splits[u] = {
        head: cardIds(sp.head),
        tail: cardIds(sp.tail),
        headName: sp.headEval?.name,
        tailName: sp.tailEval?.name,
      };
    });
    const deltas = {};
    engine.players.forEach(p => { deltas[p.username] = p.lastDelta || 0; });
    const snapshotAfter = buildSnapshot(engine);
    const chipCheck = chipCheckFromSnapshot(snapshotAfter, this.room.chipArchives || {});

    this._debug('compare', {
      winner: compareResult?.winner || null,
      winnerUsers: compareResult?.winnerUsers || null,
      transfers: compareResult?.transfers || null,
      alone: !!compareResult?.alone,
      ranked: compareResult?.ranked || null,
      results: compareResult?.results || null,
      splits,
      deltas,
      snapshotBefore: snapshotBefore || null,
      snapshotAfter,
      chipCheck,
    });

    const lines = ['', '### 比牌结果', ''];
    const winnerUsers = Array.isArray(compareResult?.winnerUsers)
      ? compareResult.winnerUsers
      : (compareResult?.winner ? [compareResult.winner] : []);
    if (winnerUsers.length > 0) {
      lines.push(`赢家：${winnerUsers.map((username) => this._name(username)).join('、')}${compareResult.alone ? '（独赢）' : ''}`);
    }
    if (compareResult?.results) {
      Object.entries(compareResult.results).forEach(([u, r]) => {
        const head = r.headName || splits[u]?.headName || '—';
        const tail = r.tailName || splits[u]?.tailName || '—';
        lines.push(
          `- ${this._name(u)}：头 ${head} / 尾 ${tail} · 胜${r.wins || 0} 负${r.losses || 0} 和${r.ties || 0} · 本局 ${signed(r.lastDelta ?? deltas[u])}`
        );
      });
    } else {
      lines.push(`本局输赢：${this._deltasLine(deltas)}`);
    }
    lines.push('');
    lines.push(this._chipLine(chipCheck));
    lines.push('');
    this._appendReport(lines.join('\n'));
  }

  logRoundEnd(engine, reason) {
    const deltas = {};
    engine.players.forEach(p => { deltas[p.username] = p.lastDelta || 0; });
    const snapshot = buildSnapshot(engine);
    const chipCheck = chipCheckFromSnapshot(snapshot, this.room.chipArchives || {});
    this._debug('round_end', { reason, deltas, snapshot, chipCheck });

    // compare 已写过详细结果时，这里只补一句收尾
    if (reason === 'compare') {
      this._appendReport(`本局结束（比牌）。\n\n---\n\n`);
      return;
    }
    this._appendReport([
      '',
      `### 本局结果：${REASON_CN[reason] || reason}`,
      '',
      `输赢：${this._deltasLine(deltas) || '无变化'}`,
      this._chipLine(chipCheck),
      '',
      '---',
      '',
    ].join('\n'));
  }

  logBuyIn(username, amount, extra = {}) {
    this._debug('buyin', { username, amount, ...extra });
    const state = extra.applied ? '已生效' : (extra.pending ? '待下局生效' : '');
    const why = extra.reason ? `（${extra.reason}）` : '';
    this._appendReport(`- ${localTime()} ${this._name(username)} 加簸 ${amount}${state ? ' · ' + state : ''}${why}\n`);
  }

  logExtendTime(minutes, endsAt) {
    const endText = endsAt ? new Date(endsAt).toLocaleString() : '—';
    this._appendReport(`- ${localTime()} 房主加时 +${minutes} 分钟，预计结束 ${endText}\n`);
    this._debug('extend_time', { minutes, endsAt, extendedMinutes: this.room.extendedMinutes || 0 });
  }

  logPause(paused) {
    this._appendReport(`- ${localTime()} 房主${paused ? '暂停' : '恢复'}对局\n`);
    this._debug(paused ? 'game_pause' : 'game_resume', {
      endsAt: this.room.endsAt || null,
    });
  }

  logHostEndAfterHand() {
    this._appendReport(`- ${localTime()} 房主请求：本局结束后结算\n`);
    this._debug('host_end_after_hand', {});
  }

  logBuyInDecisionStart(usernames = []) {
    this._debug('broke_decision_start', { players: usernames });
    const names = usernames.map(u => this._name(u)).join('、');
    this._appendReport(`\n> 簸簸归零，等待决策：${names || '—'}\n\n`);
  }

  logDisconnect(action, username, extra = {}) {
    this._debug('disconnect', { action, username, ...extra });
    const map = {
      mark: '断线',
      reconnect: '重连',
      timeout_remove: '超时离座',
      leave: '主动离场',
      broke_exit: '输光退出',
      broke_choose_settle: '选择立即退出',
    };
    const pot = extra.finalPot != null ? `，余额 ${extra.finalPot}` : '';
    this._appendReport(`- ${localTime()} ${this._name(username)} ${map[action] || action}${pot}\n`);
  }

  logSessionEnd(settlement, reason, potSplit = null) {
    const sumDelta = (settlement || []).reduce((s, p) => s + (p.delta || 0), 0);
    const check = { sumDelta, ok: sumDelta === 0 };
    this._debug('session_end', { reason, settlement: settlement || [], potSplit, chipCheck: check });

    (settlement || []).forEach(p => this._name(p.username, p.nickname));
    const rows = (settlement || []).map(p =>
      `| ${this._name(p.username, p.nickname)} | ${p.initial} | ${p.final} | ${signed(p.delta)} |`
    );
    const potLines = [];
    if (potSplit && potSplit.pot > 0) {
      const shareBits = Object.entries(potSplit.shares || {})
        .filter(([, v]) => v > 0)
        .map(([u, v]) => `${this._name(u)} +${v}`)
        .join('，');
      potLines.push(
        `- 终局底池平分：${potSplit.pot}（在座 ${potSplit.recipientCount} 人各 ${potSplit.base}，余数 ${potSplit.remainder} 归庄家${potSplit.bankerUsername ? this._name(potSplit.bankerUsername) : ''}）`,
        shareBits ? `- 分配明细：${shareBits}` : '',
      );
    }
    this._appendReport([
      '',
      '## 整场结算',
      '',
      `- 结束原因：${REASON_CN[reason] || reason}`,
      `- 结束时间：${localTime()}`,
      ...potLines.filter(Boolean),
      `- 输赢合计：${signed(sumDelta)} ${check.ok ? '（守恒通过）' : '（异常 ⚠️）'}`,
      '',
      '| 玩家 | 总带入 | 最终 | 输赢 |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'));
  }

  close() {
    if (this.closed) return;
    this._debug('session_close', {
      reportPath: this.reportPath,
      debugPath: this.debugPath,
      totalEvents: this.seq,
    });
    this._appendReport([
      '',
      `*复盘文件已关闭 · ${localTime()}*`,
      '',
    ].join('\n'));
    this.closed = true;
  }
}

function attachLogger(room) {
  if (room.logger && !room.logger.closed) return room.logger;
  room.logger = new GameLogger(room);
  return room.logger;
}

function getLogger(room) {
  return room?.logger || null;
}

/** 把旧版 NDJSON 转成中文复盘 Markdown（一次性工具） */
function convertNdjsonToMarkdown(ndjsonPath, outPath) {
  const lines = fs.readFileSync(ndjsonPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const room = { code: lines[0]?.room || '?', name: '', host: '', roundLimit: '', minBuyIn: '', game: null, chipArchives: {} };
  const open = lines.find(e => e.type === 'session_open');
  if (open) {
    room.name = open.name;
    room.host = open.host;
    room.roundLimit = open.roundLimit;
    room.minBuyIn = open.minBuyIn;
  }
  // 用临时 logger 只写报告：复用格式化逻辑太重，这里直接渲染
  const names = new Map();
  const nameOf = (u, n) => {
    if (n) names.set(u, n);
    const nick = names.get(u) || n;
    return nick && nick !== u ? `${nick}（${u}）` : (nick || u || '—');
  };
  const out = [];
  out.push(`# 扯旋对局复盘 · 房间 ${room.code}`);
  out.push('');
  out.push(`> 由 ${path.basename(ndjsonPath)} 转换`);
  out.push('');
  let actionNo = 0;
  let lastSplit = null;
  for (const e of lines) {
    if (e.type === 'member') {
      out.push(`- ${nameOf(e.username, e.nickname)} ${e.action === 'join' ? '进入房间' : '离开房间'}`);
    } else if (e.type === 'seat') {
      out.push(`- ${nameOf(e.username, e.nickname)} ${e.action === 'sit' ? '坐下' : e.action === 'stand' ? '起身' : '换座'} 座位${e.seatNo ?? ''} 带入${e.buyIn ?? ''}`);
    } else if (e.type === 'game_start') {
      out.push('', '## 开局名单', '');
      (e.players || []).forEach(p => out.push(`- 座位${p.seatNo} ${nameOf(p.username, p.nickname)} 带入 ${p.buyIn}`));
      out.push('');
    } else if (e.type === 'round_start') {
      actionNo = 0;
      lastSplit = null;
      out.push('', `## 第 ${e.round} 局`, '');
      out.push(`- 庄家：${nameOf(e.banker)} · 底池 ${e.snapshot?.potPi ?? '?'} · 芒果等级 ${e.mangoLevel ?? 0}`);
      out.push(`- 发言：${(e.speakOrder || []).map(u => nameOf(u)).join(' → ')}`);
      if (e.chipCheck) out.push(`- 筹码校验：${e.chipCheck.ok ? '通过' : '异常'}（${e.chipCheck.left}/${e.chipCheck.right}）`);
      out.push('');
    } else if (e.type === 'deal') {
      out.push(`### 发牌 · ${STREET_CN[e.street] || e.street}`, '');
      Object.entries(e.hands || {}).forEach(([u, ids]) => out.push(`- ${nameOf(u)}：${cardsLabel(ids)}`));
      out.push('');
    } else if (e.type === 'action') {
      actionNo += 1;
      const act = ACTION_CN[e.action] || e.action;
      const b = e.before, a = e.after, t = e.table;
      out.push(`${actionNo}. **${nameOf(e.actor, e.actorName)}** ${act}${e.amount != null ? ' ' + e.amount : ''}  ·  手中 ${b?.pot}→${a?.pot} · 喊价 ${b?.committed}→${a?.committed} · 最高 ${t?.currentBet} · 底池 ${t?.potPi}`);
    } else if (e.type === 'street_end') {
      out.push('', `> 本轮结束：${REASON_CN[e.reason] || e.reason}`, '');
    } else if (e.type === 'split') {
      const key = `${e.username}|${(e.head || []).join(',')}`;
      if (lastSplit === key) continue;
      lastSplit = key;
      out.push(`- **${nameOf(e.username)}** 配牌：头「${e.headName}」${cardsLabel(e.head)} ／ 尾「${e.tailName}」${cardsLabel(e.tail)}`);
    } else if (e.type === 'compare') {
      out.push('', '### 比牌结果', '');
      if (e.winner) out.push(`赢家：${nameOf(e.winner)}`);
      Object.entries(e.deltas || {}).forEach(([u, d]) => out.push(`- ${nameOf(u)} ${signed(d)}`));
      out.push('');
    } else if (e.type === 'round_end' && e.reason !== 'compare') {
      out.push('', `### 本局结果：${REASON_CN[e.reason] || e.reason}`, '');
      out.push(`输赢：${Object.entries(e.deltas || {}).map(([u, d]) => `${nameOf(u)} ${signed(d)}`).join(' · ')}`);
      out.push('', '---', '');
    } else if (e.type === 'session_end') {
      out.push('', '## 整场结算', '');
      out.push(`结束原因：${REASON_CN[e.reason] || e.reason}`);
      (e.settlement || []).forEach(p => out.push(`- ${nameOf(p.username, p.nickname)}：带入 ${p.initial} → ${p.final}（${signed(p.delta)}）`));
    }
  }
  const target = outPath || ndjsonPath.replace(/\.ndjson$/i, '.md').replace(/session-/, '复盘-');
  fs.writeFileSync(target, out.join('\n') + '\n', 'utf8');
  return target;
}

module.exports = {
  GameLogger,
  attachLogger,
  getLogger,
  buildSnapshot,
  chipCheckFromSnapshot,
  playerChipView,
  convertNdjsonToMarkdown,
  LOG_ROOT,
};
