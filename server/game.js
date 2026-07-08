/* ========== 扯旋服务端游戏引擎 ========== */

/* ----- 牌组（32张）----- */
const DECK = [
  {id:'rQ1', color:'red', rank:'Q', cnName:'天牌', cnChar:'天', cardPoints:12, order:100, suit:'♥'},
  {id:'rQ2', color:'red', rank:'Q', cnName:'天牌', cnChar:'天', cardPoints:12, order:100, suit:'♦'},
  {id:'r21', color:'red', rank:'2', cnName:'地牌', cnChar:'地', cardPoints:2, order:95, suit:'♥'},
  {id:'r22', color:'red', rank:'2', cnName:'地牌', cnChar:'地', cardPoints:2, order:95, suit:'♦'},
  {id:'r81', color:'red', rank:'8', cnName:'人牌', cnChar:'人', cardPoints:8, order:90, suit:'♥'},
  {id:'r82', color:'red', rank:'8', cnName:'人牌', cnChar:'人', cardPoints:8, order:90, suit:'♦'},
  {id:'r41', color:'red', rank:'4', cnName:'和牌', cnChar:'和', cardPoints:4, order:85, suit:'♥'},
  {id:'r42', color:'red', rank:'4', cnName:'和牌', cnChar:'和', cardPoints:4, order:85, suit:'♦'},
  {id:'b101', color:'black', rank:'10', cnName:'梅十', cnChar:'梅', cardPoints:10, order:75, suit:'♠'},
  {id:'b102', color:'black', rank:'10', cnName:'梅十', cnChar:'梅', cardPoints:10, order:75, suit:'♣'},
  {id:'b41', color:'black', rank:'4', cnName:'板凳', cnChar:'板', cardPoints:4, order:75, suit:'♠'},
  {id:'b42', color:'black', rank:'4', cnName:'板凳', cnChar:'板', cardPoints:4, order:75, suit:'♣'},
  {id:'b61', color:'black', rank:'6', cnName:'长三', cnChar:'长', cardPoints:6, order:75, suit:'♠'},
  {id:'b62', color:'black', rank:'6', cnName:'长三', cnChar:'长', cardPoints:6, order:75, suit:'♣'},
  {id:'bJ1', color:'black', rank:'J', cnName:'斧头', cnChar:'斧', cardPoints:11, order:65, suit:'♠'},
  {id:'bJ2', color:'black', rank:'J', cnName:'斧头', cnChar:'斧', cardPoints:11, order:65, suit:'♣'},
  {id:'r101', color:'red', rank:'10', cnName:'苕十', cnChar:'苕', cardPoints:10, order:65, suit:'♥'},
  {id:'r102', color:'red', rank:'10', cnName:'苕十', cnChar:'苕', cardPoints:10, order:65, suit:'♦'},
  {id:'r61', color:'red', rank:'6', cnName:'猫猫', cnChar:'猫', cardPoints:6, order:65, suit:'♥'},
  {id:'r62', color:'red', rank:'6', cnName:'猫猫', cnChar:'猫', cardPoints:6, order:65, suit:'♦'},
  {id:'r71', color:'red', rank:'7', cnName:'膏药', cnChar:'膏', cardPoints:7, order:65, suit:'♥'},
  {id:'r72', color:'red', rank:'7', cnName:'膏药', cnChar:'膏', cardPoints:7, order:65, suit:'♦'},
  {id:'b91', color:'black', rank:'9', cnName:'黑9', cnChar:'9', cardPoints:9, order:50, suit:'♠'},
  {id:'b92', color:'black', rank:'9', cnName:'黑9', cnChar:'9', cardPoints:9, order:50, suit:'♣'},
  {id:'b81', color:'black', rank:'8', cnName:'黑8', cnChar:'8', cardPoints:8, order:50, suit:'♠'},
  {id:'b82', color:'black', rank:'8', cnName:'黑8', cnChar:'8', cardPoints:8, order:50, suit:'♣'},
  {id:'b71', color:'black', rank:'7', cnName:'黑7', cnChar:'7', cardPoints:7, order:50, suit:'♠'},
  {id:'b72', color:'black', rank:'7', cnName:'黑7', cnChar:'7', cardPoints:7, order:50, suit:'♣'},
  {id:'b51', color:'black', rank:'5', cnName:'小5', cnChar:'5', cardPoints:5, order:50, suit:'♠'},
  {id:'b52', color:'black', rank:'5', cnName:'小5', cnChar:'5', cardPoints:5, order:50, suit:'♣'},
  {id:'r3', color:'red', rank:'3', cnName:'丁丁', cnChar:'丁', cardPoints:3, order:50, suit:'♥'},
  {id:'joker', color:'joker', rank:'JK', cnName:'大鬼', cnChar:'鬼', cardPoints:6, order:50, suit:'★'},
];

const GAME_TYPES = {
  '1,3':  { name:'1\u30013',  firstPot:100, minPot:50,  maxBet:Number.MAX_SAFE_INTEGER },
  '5,10': { name:'5\u300110', firstPot:500, minPot:300, maxBet:Number.MAX_SAFE_INTEGER },
  '5,20': { name:'5\u300120', firstPot:1000,minPot:500, maxBet:Number.MAX_SAFE_INTEGER },
};

const BANKER_ANTE = 10;
const MANGO_BASE = 10;
const MAX_REST_MANGO_LEVEL = 3;

const COMBO_RAW = [
  {a:'rQ', b:'b7', sub:1, pts:9, name:'天官九'},{a:'r2', b:'b7', sub:2, pts:9, name:'地官九'},
  {a:'r8', b:'bJ', sub:3, pts:9, name:'红笼九'},{a:'r4', b:'b5', sub:4, pts:9, name:'和五九'},
  {a:'b10',b:'b9', sub:5, pts:9, name:'梅十九'},{a:'b4', b:'b5', sub:5, pts:9, name:'板五九'},
  {a:'r3', b:'b6', sub:5, pts:9, name:'丁长九'},{a:'bJ', b:'b8', sub:6, pts:9, name:'乌龙九'},
  {a:'r10',b:'b9', sub:6, pts:9, name:'苕十九'},{a:'r3', b:'r6', sub:6, pts:9, name:'丁猫九'},
  {a:'rQ', b:'b6', sub:1, pts:8, name:'天官八'},{a:'rQ', b:'r6', sub:1, pts:8, name:'天官八'},
  {a:'rQ', b:'joker', sub:1, pts:8, name:'天官八'},{a:'r2', b:'b6', sub:2, pts:8, name:'地官八'},
  {a:'r2', b:'r6', sub:2, pts:8, name:'地官八'},{a:'r2', b:'joker', sub:2, pts:8, name:'地官八'},
  {a:'r8', b:'r10',sub:3, pts:8, name:'人十八'},{a:'r8', b:'b10',sub:3, pts:8, name:'人十八'},
  {a:'r4', b:'b4', sub:4, pts:8, name:'蛾儿八'},{a:'b10',b:'b8', sub:5, pts:8, name:'梅十八'},
  {a:'bJ', b:'b7', sub:6, pts:8, name:'斧七八'},{a:'bJ', b:'r7', sub:6, pts:8, name:'斧七八'},
  {a:'r10',b:'b8', sub:6, pts:8, name:'苕十八'},{a:'r3', b:'b5', sub:7, pts:8, name:'风筝八'},
  {a:'rQ', b:'b5', sub:1, pts:7, name:'天官七'},{a:'r2', b:'b5', sub:2, pts:7, name:'地官七'},
  {a:'r8', b:'b9', sub:3, pts:7, name:'苏州七'},{a:'r3', b:'r4', sub:4, pts:7, name:'丁和七'},
  {a:'b10',b:'b7', sub:5, pts:7, name:'梅十七'},{a:'b10',b:'r7', sub:5, pts:7, name:'梅十七'},
  {a:'r3', b:'b4', sub:5, pts:7, name:'丁板七'},{a:'bJ', b:'b6', sub:5, pts:7, name:'斧长七'},
  {a:'bJ', b:'r6', sub:6, pts:7, name:'斧猫七'},{a:'r10',b:'b7', sub:6, pts:7, name:'苕十七'},
  {a:'r10',b:'r7', sub:6, pts:7, name:'苕十七'},{a:'b8', b:'b9', sub:7, pts:7, name:'非洲七'},
  {a:'rQ', b:'r4', sub:1, pts:6, name:'天官六'},{a:'rQ', b:'b4', sub:1, pts:6, name:'天官六'},
  {a:'r2', b:'r4', sub:2, pts:6, name:'地官六'},{a:'r2', b:'b4', sub:2, pts:6, name:'地官六'},
  {a:'r8', b:'b8', sub:3, pts:6, name:'元宝六'},{a:'b10',b:'r6', sub:4, pts:6, name:'梅十六'},
  {a:'b10',b:'b6', sub:4, pts:6, name:'梅十六'},{a:'b6', b:'r10',sub:4, pts:6, name:'长三六'},
  {a:'bJ', b:'b5', sub:5, pts:6, name:'斧五六'},{a:'r10',b:'r6', sub:5, pts:6, name:'苕十六'},
  {a:'r7', b:'b9', sub:5, pts:6, name:'膏药六'},{a:'b7', b:'b9', sub:6, pts:6, name:'七九六'},
  {a:'rQ', b:'r3', sub:1, pts:5, name:'天丁五'},{a:'r2', b:'r3', sub:2, pts:5, name:'地丁五'},
  {a:'r8', b:'b7', sub:3, pts:5, name:'人十五'},{a:'r8', b:'r7', sub:3, pts:5, name:'人十五'},
  {a:'r4', b:'bJ', sub:4, pts:5, name:'和斧五'},{a:'b10',b:'b5', sub:5, pts:5, name:'梅十五'},
  {a:'b4', b:'bJ', sub:5, pts:5, name:'板斧五'},{a:'b6', b:'b9', sub:5, pts:5, name:'长三五'},
  {a:'r10',b:'b5', sub:6, pts:5, name:'苕十五'},{a:'r6', b:'b9', sub:6, pts:5, name:'猫九五'},
  {a:'r7', b:'b8', sub:6, pts:5, name:'膏药五'},{a:'b7', b:'b8', sub:7, pts:5, name:'七八五'},
  {a:'rQ', b:'r2', sub:1, pts:4, name:'双刀四'},{a:'r8', b:'r6', sub:2, pts:4, name:'人十四'},
  {a:'r8', b:'b6', sub:2, pts:4, name:'人十四'},{a:'r4', b:'r10',sub:3, pts:4, name:'和十四'},
  {a:'r4', b:'b10',sub:3, pts:4, name:'和十四'},{a:'b10',b:'b4', sub:4, pts:4, name:'梅十四'},
  {a:'b6', b:'b8', sub:4, pts:4, name:'长十四'},{a:'r3', b:'bJ', sub:5, pts:4, name:'丁斧四'},
  {a:'r6', b:'b8', sub:5, pts:4, name:'六八四'},{a:'r7', b:'r7', sub:5, pts:4, name:'双花七'},
  {a:'b5', b:'b9', sub:6, pts:4, name:'五九四'},
  {a:'rQ', b:'bJ', sub:1, pts:3, name:'天斧三'},{a:'r2', b:'bJ', sub:2, pts:3, name:'地斧三'},
  {a:'r8', b:'b5', sub:3, pts:3, name:'人十三'},{a:'r4', b:'b9', sub:4, pts:3, name:'和十三'},
  {a:'b10',b:'r3', sub:5, pts:3, name:'梅十三'},{a:'b4', b:'b9', sub:5, pts:3, name:'四九三'},
  {a:'b6', b:'b7', sub:5, pts:3, name:'长十三'},{a:'b6', b:'r7', sub:5, pts:3, name:'长十三'},
  {a:'r10',b:'r3', sub:6, pts:3, name:'苕十三'},{a:'r6', b:'b7', sub:6, pts:3, name:'六七三'},
  {a:'r6', b:'r7', sub:6, pts:3, name:'六七三'},{a:'b5', b:'b8', sub:7, pts:3, name:'五八三'},
  {a:'rQ', b:'r10',sub:1, pts:2, name:'天十二'},{a:'rQ', b:'b10',sub:1, pts:2, name:'天十二'},
  {a:'r2', b:'r10',sub:2, pts:2, name:'地十二'},{a:'r2', b:'b10',sub:2, pts:2, name:'地十二'},
  {a:'r8', b:'r4', sub:3, pts:2, name:'人十二'},{a:'r8', b:'b4', sub:3, pts:2, name:'人十二'},
  {a:'r4', b:'b8', sub:4, pts:2, name:'和十二'},{a:'b4', b:'b8', sub:5, pts:2, name:'四八二'},
  {a:'b6', b:'r6', sub:5, pts:2, name:'二六二'},{a:'r7', b:'b5', sub:6, pts:2, name:'膏药二'},
  {a:'r3', b:'b9', sub:7, pts:2, name:'丁九二'},{a:'b5', b:'b7', sub:7, pts:2, name:'五七二'},
  {a:'r2', b:'b9', sub:1, pts:1, name:'地九王'},{a:'r8', b:'r3', sub:2, pts:1, name:'人十一'},
  {a:'r4', b:'b7', sub:3, pts:1, name:'和十一'},{a:'r4', b:'r7', sub:3, pts:1, name:'和十一'},
  {a:'b10',b:'bJ', sub:4, pts:1, name:'梅十一'},{a:'b4', b:'b7', sub:4, pts:1, name:'四七一'},
  {a:'b4', b:'r7', sub:4, pts:1, name:'四七一'},{a:'b6', b:'b5', sub:4, pts:1, name:'长三一'},
  {a:'bJ', b:'r10',sub:5, pts:1, name:'斧十一'},{a:'b5', b:'r6', sub:5, pts:1, name:'五六一'},
  {a:'r3', b:'b8', sub:6, pts:1, name:'丁八一'},
  {a:'r4', b:'r6', sub:0, pts:0, name:'四六皱'},{a:'r4', b:'b6', sub:0, pts:0, name:'四六皱'},
  {a:'b4', b:'r6', sub:0, pts:0, name:'四六皱'},{a:'b4', b:'b6', sub:0, pts:0, name:'四六皱'},
  {a:'b10',b:'r10',sub:0, pts:0, name:'双花十'},{a:'bJ', b:'b9', sub:0, pts:0, name:'斧九皱'},
  {a:'r3', b:'b7', sub:0, pts:0, name:'丁七皱'},{a:'r3', b:'r7', sub:0, pts:0, name:'丁七皱'},
];

const COMBO_TABLE = {};
function comboKey(a, b) { return a < b ? a+'|'+b : b+'|'+a; }
COMBO_RAW.forEach(c => {
  const idsA = c.a === 'joker' || c.a === 'r3' ? [c.a] : [c.a+'1', c.a+'2'];
  const idsB = c.b === 'joker' || c.b === 'r3' ? [c.b] : [c.b+'1', c.b+'2'];
  idsA.forEach(a => idsB.forEach(b => {
    if (a !== b) COMBO_TABLE[comboKey(a, b)] = {sub: c.sub, pts: c.pts, name: c.name};
  }));
});

function evalCombo(c1, c2) {
  if ((c1.id==='r3' && c2.id==='joker') || (c2.id==='r3' && c1.id==='joker'))
    return {level:100, sub:1, points:9, maxO:50, minO:50, name:'丁二皇'};
  if (c1.color===c2.color && c1.rank===c2.rank && c1.id!==c2.id && c1.color!=='joker') {
    let sub;
    if (c1.order>=100) sub=1; else if(c1.order>=95) sub=2; else if(c1.order>=90) sub=3;
    else if(c1.order>=85) sub=4; else if(c1.order>=75) sub=5; else if(c1.order>=65) sub=6;
    else sub=7;
    return {level:90, sub, points:(c1.cardPoints*2)%10, maxO:c1.order, minO:c1.order, name:c1.cnName+'一对'};
  }
  if ((c1.cnName==='天牌'&&c2.cnName==='黑9') || (c2.cnName==='天牌'&&c1.cnName==='黑9'))
    return {level:80, sub:1, points:1, maxO:100, minO:50, name:'天九王'};
  if ((c1.cnName==='天牌'&&c2.cardPoints===8&&c2.rank==='8') || (c2.cnName==='天牌'&&c1.cardPoints===8&&c1.rank==='8'))
    return {level:75, sub:1, points:0, maxO:100, minO:Math.min(c1.order,c2.order), name:'天杠'};
  if ((c1.cnName==='地牌'&&c2.cardPoints===8&&c2.rank==='8') || (c2.cnName==='地牌'&&c1.cardPoints===8&&c1.rank==='8'))
    return {level:70, sub:1, points:0, maxO:95, minO:Math.min(c1.order,c2.order), name:'地杠'};
  const pts = (c1.cardPoints + c2.cardPoints) % 10;
  const k = comboKey(c1.id, c2.id);
  const f = COMBO_TABLE[k];
  if (f) return {level:pts, sub:f.sub, points:pts, maxO:Math.max(c1.order,c2.order), minO:Math.min(c1.order,c2.order), name:f.name};
  return {level:pts, sub:0, points:pts, maxO:Math.max(c1.order,c2.order), minO:Math.min(c1.order,c2.order), name:pts===0?'皱':pts+'点'};
}

function compareCombo(a, b) {
  if (!a && !b) return 0; if (!a) return -1; if (!b) return 1;
  if (a.level !== b.level) return a.level - b.level;
  if (a.level === 0 && a.sub === 0 && b.sub === 0) return 0;
  // sub 越小越强（天官九 sub1 > 地官九 sub2；天一对 sub1 > 人一对 sub3）
  if (a.sub !== b.sub) return b.sub - a.sub;
  if (a.maxO !== b.maxO) return a.maxO - b.maxO;
  return a.minO - b.minO;
}

function shuffle(arr) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

// 检测三花十 / 三花六：玩家持有特定三张牌 + 任意一张，本局免输不赢
function checkSanHua(cards) {
  const has = (cnName) => cards.some(c => c.cnName === cnName);
  // 三花十：黑10（梅十）+ 红10（苕十）+ 黑J（斧头）+ 任意
  if (has('梅十') && has('苕十') && has('斧头')) return { sanhua: true, type: 'sanhua_shi' };
  // 三花六：黑6（长三）+ 红6（猫猫）+ 大王（大鬼）+ 任意
  if (has('长三') && has('猫猫') && has('大鬼')) return { sanhua: true, type: 'sanhua_liu' };
  return { sanhua: false };
}

function sanHuaCards(cards, type) {
  const names = type === 'sanhua_shi'
    ? ['梅十', '苕十', '斧头']
    : ['长三', '猫猫', '大鬼'];
  return names.map(name => cards.find(c => c.cnName === name)).filter(Boolean);
}

function compareSingleCard(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  // 同点数时按花色排序：♠>♥>♣>♦
  const suitOrder = {'♠':4,'♥':3,'♣':2,'♦':1,'★':0};
  return (suitOrder[a.suit]||0) - (suitOrder[b.suit]||0);
}

function normalizeBetAmount(amount) {
  const n = Number(amount);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function compareSplit(aSp, bSp) {
  const hc = compareCombo(aSp.headEval, bSp.headEval);
  const tc = compareCombo(aSp.tailEval, bSp.tailEval);
  if (hc >= 0 && tc >= 0 && (hc > 0 || tc > 0)) return 1;
  if (hc <= 0 && tc <= 0 && (hc < 0 || tc < 0)) return -1;
  return 0;
}

/* ----- GameEngine 类 ----- */
class GameEngine {
  constructor(room) {
    this.room = room;
    this.reset();
  }

  reset() {
    this.players = [];
    this.state = null;
    this.timer = null;
  }

  // 从房间座位初始化玩家
  init(seats) {
    this.players = [];
    const config = GAME_TYPES[this.room.gameType];
    const seatIds = ['top-0','top-1','right-0','right-1','bottom-0','bottom-1','left-0','left-1'];
    seats.forEach((s, idx) => {
      if (!s) return;
      this.players.push({
        username: s.username,
        nickname: s.nickname,
        pot: s.buyIn || config.firstPot,
        hand: [],
        committed: 0,
        roundCommitted: 0,
        foldPaid: 0,
        folded: false,
        eliminated: false,
        matched: false,
        rested: false,
        allIn: false,
        actedThisRound: false,
        sanhuaShown: false,
        sanhuaType: null,
        sanhuaCards: [],
        sanhuaRevealLocked: false,
        lastDelta: 0,
        pendingBuyIn: 0,
        totalBuyIn: s.buyIn || config.firstPot,
        seat: seatIds[idx],
      });
    });
    if (this.players.length < 2) return false;

    this.state = {
      gameType: this.room.gameType,
      config,
      round: 0,
      phase: 'idle',
      bankerIdx: -1,
      deck: [],
      dealIdx: 0,
      activeIds: this.players.map(p => p.username),
      currentBet: 0,
      potPi: 0,
      mangoNext: null,
      lastWinner: null,
      restMangoLevel: 0,
      beatMangoWinner: null,
      roundHadBet: false,
      minBet: MANGO_BASE,
      lastFinalBet: 0,
      betRound: 0,
      betStarted: false,
      opener: null,
      raiseCount: 0,
      toAct: [],
      history: [],
      // 玩家配牌选择
      splits: {},
      // 比牌结果
      compareResult: null,
      // 玩家不活跃跟踪（超时掉线）
      playerInactivity: {},
    };
    return true;
  }

  // 获取所有存活玩家
  alivePlayers() {
    return this.players.filter(p => !p.eliminated && p.pot > 0);
  }

  // 获取玩家
  getPlayer(username) {
    return this.players.find(p => p.username === username);
  }

  // 底注 / 芒果等直接进底池（不算喊价）
  chargeToPot(player, amount) {
    const requested = Math.max(0, Math.floor(Number(amount) || 0));
    const paid = Math.min(player.pot, requested);
    if (paid <= 0) return 0;

    player.pot -= paid;
    player.lastDelta -= paid;
    this.state.potPi += paid;

    if (player.pot <= 0) {
      player.allIn = true;
    }

    return paid;
  }

  // 喊价：筹码从簸簸划出但不进底池（预扣），committed 为整局累计总额
  raiseCommitment(player, targetAmount) {
    const target = normalizeBetAmount(targetAmount);
    if (target === null) return null;
    if (target < player.committed) return null;
    const delta = target - player.committed;
    if (delta > player.pot) return null;
    if (delta > 0) {
      player.pot -= delta;
      player.lastDelta -= delta;
      player.committed += delta;
      this.state.roundHadBet = true;
    }
    player.roundCommitted = player.committed;
    if (player.pot <= 0) {
      player.allIn = true;
    }
    player.actedThisRound = true;
    player.rested = false;
    player.matched = true;
    return delta;
  }

  // 弃牌：把当前喊价支付进底池（预扣已从簸簸划出，此处转入 potPi）
  payCommitmentToPot(player) {
    const paid = Math.max(0, player.committed || 0);
    if (paid <= 0) return 0;
    this.state.potPi += paid;
    player.foldPaid = (player.foldPaid || 0) + paid;
    player.committed = 0;
    player.roundCommitted = 0;
    return paid;
  }

  // 退还喊价预扣（作废 / 亮三花 / 揍芒赢家）
  refundCommitment(player) {
    const refund = Math.max(0, player.committed || 0);
    if (refund <= 0) {
      player.committed = 0;
      player.roundCommitted = 0;
      return 0;
    }
    player.pot += refund;
    player.lastDelta += refund;
    player.committed = 0;
    player.roundCommitted = 0;
    return refund;
  }

  resetBettingRound(minBet) {
    const s = this.state;
    s.currentBet = 0;
    s.betStarted = false;
    s.minBet = Math.max(MANGO_BASE, Math.floor(minBet || MANGO_BASE));
    this.players.forEach(p => {
      // 保留整局 committed；roundCommitted 同步为累计额供 UI
      p.roundCommitted = p.committed;
      p.matched = !!p.allIn;
      p.rested = false;
      p.actedThisRound = !!p.allIn;
    });
  }

  placeBetToTarget(player, targetAmount) {
    return this.raiseCommitment(player, targetAmount);
  }

  canShowSanhua(player) {
    const s = this.state;
    if (!player || player.folded || player.eliminated || player.allIn || player.sanhuaShown || player.sanhuaRevealLocked) return false;
    if (!['betting2', 'betting3'].includes(s.phase)) return false;
    if (!s.toAct.includes(player.username)) return false;
    return checkSanHua(player.hand).sanhua;
  }

  lockSanhuaRevealIfAvailable(player) {
    if (this.canShowSanhua(player)) player.sanhuaRevealLocked = true;
  }

  doShowSanhua(p) {
    if (!this.canShowSanhua(p)) return null;
    const s = this.state;
    const sh = checkSanHua(p.hand);
    // 亮三花：已喊价作废、分文不付（预扣退还）；底注/芒果已在 potPi 不退
    const refund = this.refundCommitment(p);

    p.sanhuaShown = true;
    p.sanhuaType = sh.type;
    p.sanhuaCards = sanHuaCards(p.hand, sh.type);
    p.sanhuaRevealLocked = true;
    p.matched = true;
    p.actedThisRound = true;
    p.rested = false;

    s.activeIds = s.activeIds.filter(id => id !== p.username);
    s.toAct = s.toAct.filter(id => id !== p.username);

    return {
      action: 'show_sanhua',
      refund,
      sanhuaType: sh.type,
      cards: p.sanhuaCards,
      player: p.username,
      name: p.nickname,
    };
  }

  clearOtherMatchesAfterRaise(player) {
    const s = this.state;
    this.players.forEach(other => {
      if (other.username !== player.username && s.activeIds.includes(other.username) && !other.folded && !other.allIn) {
        other.matched = false;
        other.rested = false;
        other.actedThisRound = false;
      }
    });
  }

  chargeRoundOpeningContributions(alive) {
    const s = this.state;

    if (s.restMangoLevel > 0) {
      const mango = s.restMangoLevel * MANGO_BASE;
      alive.forEach(p => {
        if (p.username !== s.beatMangoWinner) this.chargeToPot(p, mango);
      });
      s.beatMangoWinner = null;
    }

    const banker = this.players[s.bankerIdx];
    if (banker && alive.includes(banker)) {
      this.chargeToPot(banker, BANKER_ANTE);
    }
  }

  // 活跃玩家索引（顺时针，保留备用）
  activeIndicesFrom(startIdx) {
    const n = this.players.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const idx = (startIdx + i) % n;
      const p = this.players[idx];
      if (this.state.activeIds.includes(p.username) && !p.folded) {
        result.push(idx);
      }
    }
    return result;
  }

  // 逆时针方向活跃玩家索引（从 startIdx 开始，递增索引 = 逆时针）
  activeIndicesCCW(startIdx) {
    const n = this.players.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const idx = (startIdx + i) % n;
      const p = this.players[idx];
      if (this.state.activeIds.includes(p.username) && !p.folded) {
        result.push(idx);
      }
    }
    return result;
  }

  // 随机选庄（第一局）
  selectBanker() {
    const alive = this.alivePlayers();
    if (alive.length === 0) return -1;
    const chosen = alive[Math.floor(Math.random() * alive.length)];
    this.state.bankerIdx = this.players.indexOf(chosen);
    return this.state.bankerIdx;
  }

  // 庄位逆时针轮转（跳过破产 / 离座玩家）
  rotateBanker() {
    const n = this.players.length;
    const oldIdx = this.state.bankerIdx;
    let idx = (oldIdx + 1) % n;
    let count = 0;
    while ((this.players[idx].eliminated || this.players[idx].pot <= 0) && count < n) {
      idx = (idx + 1) % n;
      count++;
    }
    this.state.bankerIdx = idx;
    console.log(`[ROTATE] oldBanker=${oldIdx}(${this.players[oldIdx]?.nickname}), newBanker=${idx}(${this.players[idx]?.nickname}), n=${n}`);
    return idx;
  }

  // 加簸：任意时刻可发起，当前局结算后 / 下局开始时生效
  addBuyIn(username, amount) {
    const p = this.getPlayer(username);
    const n = Math.floor(Number(amount) || 0);
    if (!p || n <= 0) return null;
    p.pendingBuyIn = (p.pendingBuyIn || 0) + n;
    return { username, amount: n, pendingBuyIn: p.pendingBuyIn };
  }

  // 下一局庄家预判（当前庄的下一位存活玩家）
  nextBankerUsername() {
    const n = this.players.length;
    if (n === 0 || this.state.bankerIdx < 0) return null;
    let idx = (this.state.bankerIdx + 1) % n;
    let count = 0;
    while ((this.players[idx].eliminated || this.players[idx].pot <= 0) && count < n) {
      idx = (idx + 1) % n;
      count++;
    }
    return this.players[idx]?.username || null;
  }

  // 按当前座位物理顺序重建 players（换座后调用）
  rebuildPlayersFromSeats(seats) {
    const config = GAME_TYPES[this.room.gameType];
    const seatIds = ['top-0','top-1','right-0','right-1','bottom-0','bottom-1','left-0','left-1'];
    const byUser = new Map(this.players.map(p => [p.username, p]));
    const oldBanker = this.state.bankerIdx >= 0 ? this.players[this.state.bankerIdx]?.username : null;
    const next = [];
    seats.forEach((s, idx) => {
      if (!s) return;
      const existing = byUser.get(s.username);
      if (existing) {
        existing.seat = seatIds[idx];
        next.push(existing);
      } else {
        next.push({
          username: s.username,
          nickname: s.nickname,
          pot: s.buyIn || config.firstPot,
          hand: [],
          committed: 0,
          roundCommitted: 0,
          foldPaid: 0,
          folded: true,
          eliminated: false,
          matched: true,
          rested: false,
          allIn: false,
          actedThisRound: true,
          sanhuaShown: false,
          sanhuaType: null,
          sanhuaCards: [],
          sanhuaRevealLocked: false,
          lastDelta: 0,
          pendingBuyIn: 0,
          totalBuyIn: s.buyIn || config.firstPot,
          seat: seatIds[idx],
          joiningNextRound: true,
        });
      }
    });
    this.players = next;
    if (oldBanker) {
      const bi = this.players.findIndex(p => p.username === oldBanker);
      this.state.bankerIdx = bi >= 0 ? bi : 0;
    }
  }

  // 逆时针距离计算（从 fromIdx 逆时针到 toIdx，递减方向）
  counterClockwiseDistance(fromIdx, toIdx) {
    const n = this.players.length;
    return (toIdx - fromIdx + n) % n;
  }

  // 带平局的开招者查找（用于第3、4张牌）
  findOpenerWithTieBreak(cardIdx) {
    const active = this.state.activeIds
      .map(id => this.getPlayer(id))
      .filter(p => p && !p.folded && p.hand[cardIdx]);
    if (active.length === 0) return null;
    let best = active[0];
    for (let i = 1; i < active.length; i++) {
      const p = active[i];
      const cardCmp = compareSingleCard(p.hand[cardIdx], best.hand[cardIdx]);
      if (cardCmp > 0) {
        best = p;
      } else if (cardCmp === 0) {
        // 平局：逆时针更靠近庄家的优先
        const pDist = this.counterClockwiseDistance(this.state.bankerIdx, this.players.indexOf(p));
        const bestDist = this.counterClockwiseDistance(this.state.bankerIdx, this.players.indexOf(best));
        if (pDist < bestDist) best = p;
      }
    }
    return best.username;
  }

  // ---- 游戏流程 ----

  startNewRound() {
    if (this.state && this.state.phase !== 'idle' && this.state.phase !== 'done' && this.state.phase !== 'gameover') return false;

    const alive = this.alivePlayers();
    if (alive.length < 2) return false;

    this.players.forEach(p => {
      p.hand = [];
      p.committed = 0;
      p.roundCommitted = 0;
      p.foldPaid = 0;
      p.folded = false;
      p.matched = false;
      p.rested = false;
      p.allIn = false;
      p.actedThisRound = false;
      p.sanhuaShown = false;
      p.sanhuaType = null;
      p.sanhuaCards = [];
      p.sanhuaRevealLocked = false;
      p.lastDelta = 0;
      p.joiningNextRound = false;
    });

    const s = this.state;
    s.round++;
    s.phase = 'dealing';
    s.deck = shuffle(DECK);
    s.dealIdx = 0;
    s.activeIds = alive.map(p => p.username);
    s.splits = {};
    s.compareResult = null;
    s.roundHadBet = false;
    s.lastFinalBet = 0;
    s.raiseCount = 0;

    this.chargeRoundOpeningContributions(alive);

    const n = this.players.length;
    const startFrom = (s.bankerIdx + 1) % n;
    const order = this.activeIndicesCCW(startFrom);
    console.log(`[ORDER] bankerIdx=${s.bankerIdx}, startFrom=${startFrom}, order=[${order.join(',')}], names=[${order.map(i=>this.players[i].nickname).join(',')}]`);
    for (let round = 0; round < 2; round++) {
      for (const idx of order) {
        this.players[idx].hand.push(s.deck[s.dealIdx++]);
      }
    }

    s.phase = 'betting1';
    s.betRound = 1;
    this.resetBettingRound(MANGO_BASE);
    s.opener = this.players[order[0]]?.username || null;
    s.toAct = order.map(idx => this.players[idx].username).filter(username => {
      const p = this.getPlayer(username);
      return p && !p.allIn;
    });

    const bankerName = this.players[s.bankerIdx]?.nickname || '?';
    console.log(`[START] round=${s.round}, banker=${bankerName}(${s.bankerIdx}), toAct=[${s.toAct.join(',')}]`);

    return true;
  }

  dealThirdCard() {
    const s = this.state;
    const previousFinalBet = s.lastFinalBet || s.currentBet;
    s.phase = 'dealing';
    const n = this.players.length;
    const order = this.activeIndicesCCW((s.bankerIdx + 1) % n);
    order.forEach(idx => {
      const p = this.players[idx];
      if (!p.folded && p.hand.length < 3) p.hand.push(s.deck[s.dealIdx++]);
    });
    s.betRound = 2;
    this.resetBettingRound(previousFinalBet > 0 ? previousFinalBet * 2 : MANGO_BASE);
    s.opener = this.findOpenerWithTieBreak(2);
    const openerIdx = this.players.indexOf(this.getPlayer(s.opener));
    s.toAct = this.activeIndicesCCW(openerIdx).map(idx => this.players[idx].username).filter(username => {
      const p = this.getPlayer(username);
      return p && !p.folded && !p.allIn;
    });
    s.phase = 'betting2';

    console.log(`[DEAL3] opener=${s.opener}, toAct=[${s.toAct.join(',')}], activeIds=[${s.activeIds.join(',')}]`);
  }

  dealFourthCard() {
    const s = this.state;
    const previousFinalBet = s.lastFinalBet || s.currentBet;
    s.phase = 'dealing';
    const n = this.players.length;
    const order = this.activeIndicesCCW((s.bankerIdx + 1) % n);
    order.forEach(idx => {
      const p = this.players[idx];
      if (!p.folded && p.hand.length < 4) p.hand.push(s.deck[s.dealIdx++]);
    });
    s.betRound = 3;
    this.resetBettingRound(previousFinalBet > 0 ? previousFinalBet * 2 : MANGO_BASE);
    s.opener = this.findOpenerWithTieBreak(3);
    const openerIdx = this.players.indexOf(this.getPlayer(s.opener));
    s.toAct = this.activeIndicesCCW(openerIdx).map(idx => this.players[idx].username).filter(username => {
      const p = this.getPlayer(username);
      return p && !p.folded && !p.allIn;
    });
    s.phase = 'betting3';

    console.log(`[DEAL4] opener=${s.opener}, toAct=[${s.toAct.join(',')}], activeIds=[${s.activeIds.join(',')}]`);
  }

  dealRemainingCardsToShowdown() {
    const s = this.state;
    const n = this.players.length;
    const order = this.activeIndicesCCW((s.bankerIdx + 1) % n);
    for (let cardCount = 0; cardCount < 4; cardCount++) {
      order.forEach(idx => {
        const p = this.players[idx];
        if (!p.folded && p.hand.length === cardCount && p.hand.length < 4) {
          p.hand.push(s.deck[s.dealIdx++]);
        }
      });
    }
    s.betRound = 3;
    s.phase = 'selecting';
    s.toAct = [];
  }

  // ---- Betting actions ----

  doSee(p) {
    const s = this.state;
    if (s.currentBet <= 0) return null;
    if (p.committed + p.pot < s.currentBet) return null;
    this.lockSanhuaRevealIfAvailable(p);
    const before = p.pot;
    const delta = this.placeBetToTarget(p, s.currentBet);
    if (delta === null) return null;
    return { action: 'see', bet: delta, amount: s.currentBet, delta, allIn: p.pot <= 0, player: p.username, name: p.nickname };
  }

  doFold(p) {
    this.lockSanhuaRevealIfAvailable(p);
    // 弃牌 = 立即支付自己当前的喊价进底池
    const lost = this.payCommitmentToPot(p);
    p.folded = true;
    this.state.activeIds = this.state.activeIds.filter(id => id !== p.username);
    p.matched = true;
    p.actedThisRound = true;
    return { action: 'fold', penalty: 0, lost, player: p.username, name: p.nickname };
  }

  doRaise(p, amount) {
    const s = this.state;
    amount = normalizeBetAmount(amount);
    if (amount === null) return null;
    if (amount <= s.currentBet) return null;
    // 本轮首个抬价需 ≥ minBet；同轮再加注只需高于当前最高喊价
    if (!s.betStarted && amount < s.minBet) return null;
    this.lockSanhuaRevealIfAvailable(p);
    const before = p.pot;
    const delta = this.placeBetToTarget(p, amount);
    if (delta === null) return null;
    s.currentBet = amount;
    s.betStarted = true;
    s.raiseCount++;
    this.clearOtherMatchesAfterRaise(p);
    return { action: 'raise', amount, delta, allIn: p.pot <= 0, player: p.username, name: p.nickname };
  }

  doKnock(p) {
    const s = this.state;
    // 敲 = 喊价直接变为自己的全部簸簸数（已预扣的 committed + 手中剩余）
    const target = p.committed + p.pot;
    if (target <= 0) return null;
    if (target === p.committed && p.allIn) return null;
    this.lockSanhuaRevealIfAvailable(p);
    const delta = this.placeBetToTarget(p, target);
    if (delta === null) return null;
    p.allIn = true;
    p.matched = true;
    if (target > s.currentBet) {
      s.currentBet = target;
      s.betStarted = true;
      this.clearOtherMatchesAfterRaise(p);
    }
    return { action: 'knock', amount: target, delta, allIn: true, player: p.username, name: p.nickname };
  }

  doRest(p) {
    const s = this.state;
    if (s.betStarted || s.currentBet > 0) return null;
    this.lockSanhuaRevealIfAvailable(p);
    p.rested = true;
    p.matched = true;
    p.actedThisRound = true;
    return { action: 'rest', player: p.username, name: p.nickname };
  }

  doCall(p, amount) {
    const s = this.state;
    amount = normalizeBetAmount(amount);
    if (amount === null) return null;
    if (amount < s.minBet) return null;
    if (amount <= s.currentBet) return null;
    this.lockSanhuaRevealIfAvailable(p);
    const delta = this.placeBetToTarget(p, amount);
    if (delta === null) return null;
    s.currentBet = amount;
    s.betStarted = true;
    this.clearOtherMatchesAfterRaise(p);
    return { action: 'call', amount, delta, allIn: p.pot <= 0, player: p.username, name: p.nickname };
  }

  // 本轮可休（无人抬价）
  canRestNow() {
    const s = this.state;
    return !s.betStarted && s.currentBet <= 0;
  }

  // 未敲存活玩家数
  countNonKnockedAlive() {
    const s = this.state;
    return s.activeIds
      .map(id => this.getPlayer(id))
      .filter(p => p && !p.folded && !p.eliminated && !p.allIn).length;
  }

  // ≤1 名未敲且其喊价已跟平（或本就最高）→ 应直接进比牌
  shouldSkipRemainingBettingRounds() {
    const s = this.state;
    const stillIn = s.activeIds.map(id => this.getPlayer(id)).filter(p => p && !p.folded && !p.eliminated);
    if (stillIn.length <= 1) return false;
    const nonKnocked = stillIn.filter(p => !p.allIn);
    if (nonKnocked.length > 1) return false;
    if (nonKnocked.length === 0) return true; // 全员敲
    const last = nonKnocked[0];
    return last.committed >= s.currentBet;
  }

  // Advance to the next player who still needs to act.
  advanceToAct() {
    const s = this.state;
    while (s.toAct.length > 0) {
      const pid = s.toAct[0];
      const p = this.getPlayer(pid);
      if (!p || p.folded || p.eliminated || p.matched || p.allIn) {
        s.toAct.shift();
        continue;
      }
      break;
    }
    return s.toAct.length > 0 ? s.toAct[0] : null;
  }

  // Rebuild the action queue after a bet or raise.
  rebuildQueueAfter(p) {
    const s = this.state;
    s.toAct = [];
    const pIdx = this.players.indexOf(p);
    const order = this.activeIndicesCCW((pIdx + 1) % this.players.length);
    order.forEach(idx => {
      const other = this.players[idx];
      if (other.username !== p.username && s.activeIds.includes(other.username) && !other.folded && !other.allIn && !other.matched) {
        s.toAct.push(other.username);
      }
    });
  }

  // Check whether the current betting round is complete.
  checkBettingDone() {
    const s = this.state;
    if (!['betting1', 'betting2', 'betting3'].includes(s.phase)) {
      return { done: false };
    }

    const stillInPlayers = s.activeIds.map(id => this.getPlayer(id)).filter(p => p && !p.folded && !p.eliminated);

    if (stillInPlayers.length <= 1) {
      if (stillInPlayers.length === 1) {
        const winner = stillInPlayers[0];
        // 幸存者喊价作废退还（揍芒：只吃底池，不碰赢家自己的喊价）
        this.refundCommitment(winner);
        const won = s.potPi;
        winner.pot += won;
        winner.lastDelta += won;
        s.potPi = 0;
        if (s.roundHadBet) {
          s.restMangoLevel = Math.min(MAX_REST_MANGO_LEVEL, s.restMangoLevel + 1);
          s.beatMangoWinner = winner.username;
        }
        return { done: true, reason: 'all_folded', winner: winner.username };
      }
      return { done: true, reason: 'all_folded' };
    }

    if (stillInPlayers.every(p => p.allIn)) {
      s.lastFinalBet = s.currentBet;
      return { done: true, reason: 'all_in_showdown' };
    }

    // ≤1 名未敲且已跟平 → 跳过后续下注，直接发满牌比牌
    if (this.shouldSkipRemainingBettingRounds()) {
      s.lastFinalBet = Math.max(s.currentBet, ...stillInPlayers.map(p => p.committed || 0));
      return { done: true, reason: 'all_in_showdown' };
    }

    if (!s.betStarted && s.currentBet <= 0) {
      const actionable = stillInPlayers.filter(p => !p.allIn);
      const allRested = actionable.length > 0 && actionable.every(p => p.actedThisRound && p.rested);
      if (allRested) {
        // 全员休：存活者喊价作废；弃牌者已付退回；只留底注+芒果
        stillInPlayers.forEach(p => this.refundCommitment(p));
        this.players.forEach(p => {
          if (!p.folded) return;
          const refund = Math.max(0, p.foldPaid || 0);
          if (refund > 0) {
            p.pot += refund;
            p.lastDelta += refund;
            s.potPi = Math.max(0, s.potPi - refund);
            p.foldPaid = 0;
          }
        });
        s.restMangoLevel = Math.min(MAX_REST_MANGO_LEVEL, s.restMangoLevel + 1);
        return { done: true, reason: 'rest_cross' };
      }
      return { done: false };
    }

    // 跟平口径：累计喊价 === 当前最高喊价（敲者不要求跟到最高）
    const allMatched = stillInPlayers.every(p => p.allIn || (p.actedThisRound && p.committed === s.currentBet));
    if (allMatched) {
      s.lastFinalBet = s.currentBet;
      return { done: true, reason: 'all_matched' };
    }

    return { done: false };
  }

  // ---- Split selection ----
  getAllSplits(cards) {
    const splits = [];
    const combos = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
    for (const [i,j] of combos) {
      const pair1 = [cards[i], cards[j]];
      const pair2 = cards.filter((_,k) => k!==i && k!==j);
      const e1 = evalCombo(pair1[0], pair1[1]);
      const e2 = evalCombo(pair2[0], pair2[1]);
      // 自动分配：大的作为头，小的作为尾
      if (compareCombo(e1, e2) >= 0) {
        splits.push({head:pair1, tail:pair2, headEval:e1, tailEval:e2, headIdx:[i,j]});
      } else {
        splits.push({head:pair2, tail:pair1, headEval:e2, tailEval:e1, headIdx:[i,j]});
      }
    }
    return splits;
  }

  aiPickSplit(player) {
    const splits = this.getAllSplits(player.hand);
    const byHead = [...splits].sort((a,b) => {
      const h = compareCombo(b.headEval, a.headEval);
      return h !== 0 ? h : compareCombo(b.tailEval, a.tailEval);
    });
    return byHead[0];
  }

  // ---- 比牌 ----
  doCompare() {
    const s = this.state;
    let active = s.activeIds.map(id => this.getPlayer(id)).filter(p => p);
    if (active.length === 0) return { winner: null };
    s.restMangoLevel = 0;
    s.beatMangoWinner = null;

    // 确保所有活跃玩家已配牌
    active.forEach(p => {
      if (!s.splits[p.username]) {
        const split = this.aiPickSplit(p);
        s.splits[p.username] = split;
      }
    });

    const results = {};
    active.forEach(p => {
      const sp = s.splits[p.username];
      results[p.username] = {
        wins: 0, losses: 0, ties: 0,
        headName: sp.headEval.name,
        tailName: sp.tailEval.name,
        lastDelta: 0,
      };
      p.lastDelta = 0;
    });

    if (active.length === 0) {
      s.potPi = 0;
      this.players.forEach(p => { p.pot = Math.max(0, p.pot + p.lastDelta); });
      s.compareResult = { winner: null, results };
      return s.compareResult;
    }

    if (active.length === 1) {
      // 唯一幸存者：喊价退还 + 底池归他
      this.refundCommitment(active[0]);
      active[0].pot += s.potPi;
      active[0].lastDelta += s.potPi;
      results[active[0].username].lastDelta += s.potPi;
      s.potPi = 0;
      this.players.forEach(p => { if (p.pot <= 0 && !p.eliminated) p.eliminated = true; });
      const result = { winner: active[0].username, alone: true, results };
      s.compareResult = result;
      return result;
    }

    // 喊价入池：每位存活玩家按最终比价从预扣转入结算（底池本身已是底注+芒果+弃牌）
    const openingAndFoldedPot = Math.max(0, s.potPi);
    // 预扣已从 pot 划出，settlement 用 lastDelta 记账；最终把 committed 视作已投入、退还/瓜分通过 lastDelta 返还

    const compareByTailThenHead = (a, b) => {
      const aSp = s.splits[a.username];
      const bSp = s.splits[b.username];
      const tailCmp = compareCombo(bSp.tailEval, aSp.tailEval);
      if (tailCmp !== 0) return tailCmp;
      return compareCombo(bSp.headEval, aSp.headEval);
    };

    const compareByTailThenSeat = (a, b) => {
      const aSp = s.splits[a.username];
      const bSp = s.splits[b.username];
      const tailCmp = compareCombo(bSp.tailEval, aSp.tailEval);
      if (tailCmp !== 0) return tailCmp;
      const aDist = this.counterClockwiseDistance(s.bankerIdx, this.players.indexOf(a));
      const bDist = this.counterClockwiseDistance(s.bankerIdx, this.players.indexOf(b));
      return aDist - bDist;
    };

    const groupByEval = (players, getEval) => {
      const groups = [];
      for (const p of players) {
        const last = groups[groups.length - 1];
        if (last && compareCombo(getEval(last[0]), getEval(p)) === 0) {
          last.push(p);
        } else {
          groups.push([p]);
        }
      }
      return groups;
    };

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const A = active[i], B = active[j];
        const aSp = s.splits[A.username];
        const bSp = s.splits[B.username];
        const cmp = compareSplit(aSp, bSp);

        if (cmp > 0) {
          results[A.username].wins++;
          results[B.username].losses++;
        } else if (cmp < 0) {
          results[B.username].wins++;
          results[A.username].losses++;
        } else {
          results[A.username].ties++;
          results[B.username].ties++;
        }
      }
    }

    const ranked = [...active].sort(compareByTailThenSeat);
    const tailWinnersFor = (players) => {
      const ordered = [...players].sort(compareByTailThenSeat);
      const tailLeaders = groupByEval(ordered, p => s.splits[p.username].tailEval)[0] || [];
      return tailLeaders.filter(candidate => {
        return !tailLeaders.some(other => {
          if (other.username === candidate.username) return false;
          return compareSplit(s.splits[other.username], s.splits[candidate.username]) > 0;
        });
      });
    };
    const distributePot = (amount, winners) => {
      if (amount <= 0 || winners.length === 0) return;
      let remaining = amount;
      winners.forEach((w, idx) => {
        const share = idx === winners.length - 1 ? remaining : Math.floor(amount / winners.length);
        if (share <= 0) return;
        w.lastDelta += share;
        results[w.username].lastDelta += share;
        remaining -= share;
      });
    };

    const credit = (player, amount) => {
      const value = Math.max(0, Math.floor(amount || 0));
      if (value <= 0) return;
      player.lastDelta += value;
      results[player.username].lastDelta += value;
    };

    // 梯队传递式分配输家最终比价（1.2）
    const buildTiers = (winners) => {
      const ordered = [...winners].sort(compareByTailThenHead);
      const tiers = [];
      for (const w of ordered) {
        const last = tiers[tiers.length - 1];
        if (last) {
          const aSp = s.splits[last[0].username];
          const bSp = s.splits[w.username];
          if (compareCombo(aSp.tailEval, bSp.tailEval) === 0 && compareCombo(aSp.headEval, bSp.headEval) === 0) {
            last.push(w);
            continue;
          }
        }
        tiers.push([w]);
      }
      return tiers;
    };

    // 梯队内按可吃平分，个人不超过自己的最终比价；先封顶的余量由并列者继续吃
    const allocateWithinTier = (tier, amount) => {
      let remaining = amount;
      const roomLeft = new Map(tier.map(w => [w.username, Math.max(0, w.committed || 0)]));
      const got = new Map(tier.map(w => [w.username, 0]));
      while (remaining > 0) {
        const eligible = tier.filter(w => (roomLeft.get(w.username) || 0) > 0);
        if (eligible.length === 0) break;
        const share = Math.floor(remaining / eligible.length);
        if (share === 0) {
          for (const w of eligible) {
            if (remaining <= 0) break;
            roomLeft.set(w.username, roomLeft.get(w.username) - 1);
            got.set(w.username, (got.get(w.username) || 0) + 1);
            remaining--;
          }
          continue;
        }
        let distributed = 0;
        for (const w of eligible) {
          const take = Math.min(share, roomLeft.get(w.username) || 0);
          if (take <= 0) continue;
          roomLeft.set(w.username, roomLeft.get(w.username) - take);
          got.set(w.username, (got.get(w.username) || 0) + take);
          distributed += take;
        }
        remaining -= distributed;
        if (distributed === 0) break;
      }
      return { got, leftover: remaining };
    };

    const distributeLoserStake = (loser, winners, stake) => {
      const wager = Math.max(0, Math.floor(stake || 0));
      if (wager <= 0) return;
      if (winners.length === 0) {
        credit(loser, wager);
        return;
      }
      const tiers = buildTiers(winners);
      let remaining = wager;
      for (const tier of tiers) {
        if (remaining <= 0) break;
        const tierCap = tier.reduce((sum, w) => sum + Math.max(0, w.committed || 0), 0);
        const edible = Math.min(remaining, tierCap);
        const { got, leftover } = allocateWithinTier(tier, edible);
        for (const w of tier) {
          credit(w, got.get(w.username) || 0);
        }
        remaining = remaining - edible + leftover;
      }
      if (remaining > 0) credit(loser, remaining);
    };

    active.forEach(loser => {
      const stake = Math.max(0, loser.committed || 0);
      if (stake <= 0) return;
      const winners = active.filter(candidate => {
        if (candidate.username === loser.username) return false;
        return compareSplit(s.splits[candidate.username], s.splits[loser.username]) > 0;
      });
      distributeLoserStake(loser, winners, stake);
    });

    // 底池（底注+芒果+弃牌）归尾大者，不受封顶
    distributePot(openingAndFoldedPot, tailWinnersFor(active));
    s.potPi = 0;

    // 清除已结算的喊价预扣（已通过 lastDelta 分配/退还）
    active.forEach(p => {
      p.committed = 0;
      p.roundCommitted = 0;
      p.pot = Math.max(0, p.pot + p.lastDelta);
    });

    // 检查破产
    this.players.forEach(p => {
      if (p.pot <= 0 && !p.eliminated) p.eliminated = true;
    });

    const result = {
      winner: ranked[0]?.username || null,
      results,
      ranked: ranked.map(p => p.username),
    };
    s.compareResult = result;
    return result;
  }

  // ---- 获取状态快照（发送给客户端） ----
  getPublicState() {
    const s = this.state;
    const showAllCards = ['comparing','done'].includes(s.phase);
    return {
      phase: s.phase,
      round: s.round,
      currentBet: s.currentBet,
      minBet: s.minBet,
      maxBet: s.config.maxBet,
      potPi: s.potPi,
      remainingCards: Math.max(0, s.deck.length - s.dealIdx),
      deckSize: s.deck.length,
      betRound: s.betRound,
      betStarted: s.betStarted,
      opener: s.opener,
      toAct: s.toAct,
      gameType: s.gameType,
      bankerIdx: s.bankerIdx,
      bankerUsername: s.bankerIdx >= 0 ? this.players[s.bankerIdx]?.username : null,
      compareResult: s.compareResult,
      hints: {
        'idle': '等待开始...',
        'dealing': '发牌中...',
        'betting1': `第一轮过招（暗牌）— 当前喊价 ${s.currentBet || '无'}`,
        'betting2': `第二轮过招（3张牌）— ${s.betStarted ? '当前喊价 ' + s.currentBet : '休/叫'}`,
        'betting3': `第三轮过招（4张牌）— ${s.betStarted ? '当前喊价 ' + s.currentBet : '休/叫'}`,
        'selecting': '请选2张牌配对，系统自动分配头尾',
        'comparing': '扯牌比大小中...',
        'done': '本局结束，即将开始下一局...',
        'gameover': '游戏结束',
      }[s.phase] || '',
      players: this.players.map(p => {
        const split = s.splits[p.username];
        return {
          username: p.username,
          nickname: p.nickname,
          pot: p.pot,
          committed: p.committed,
          roundCommitted: p.roundCommitted,
          allIn: p.allIn,
          sanhuaShown: p.sanhuaShown,
          sanhuaType: p.sanhuaType,
          canShowSanhua: this.canShowSanhua(p),
          folded: p.folded,
          eliminated: p.eliminated,
          handCount: p.hand.length,
          lastDelta: p.lastDelta,
          seat: p.seat,
          // 比牌阶段展示全部4张牌，否则只展示第3、4张明牌
          publicCards: p.sanhuaShown ? p.sanhuaCards : (showAllCards ? p.hand : p.hand.slice(2)),
          // 配牌分组信息
          split: split ? {
            head: split.head,
            tail: split.tail,
            headName: split.headEval.name,
            tailName: split.tailEval.name,
          } : null,
        };
      }),
    };
  }

  // 获取某个玩家的私有状态（包含手牌）
  getPrivateState(username) {
    const p = this.getPlayer(username);
    const s = this.state;
    const pub = this.getPublicState();
    return {
      ...pub,
      myHand: p ? p.hand : [],
      mySplit: (s.splits && s.splits[username]) ? {
        headIdx: s.splits[username].headIdx,
        headName: s.splits[username].headEval.name,
        tailName: s.splits[username].tailEval.name,
      } : null,
    };
  }

  // 结算后同步玩家资金到座位
  syncSeatBuyIns() {
    this.players.forEach(p => {
      const seatIdx = this.room.seats.findIndex(s => s && s.username === p.username);
      if (seatIdx >= 0 && this.room.seats[seatIdx]) {
        this.room.seats[seatIdx].buyIn = p.pot;
      }
    });
  }
}

module.exports = { GameEngine, evalCombo, compareCombo, compareSplit, DECK };
