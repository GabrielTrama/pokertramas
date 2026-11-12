/**
 * PokerTramaS — regras do Texas Hold'em No-Limit.
 *
 * Roda no celular de quem criou a mesa (o "dealer") e também no Node para os testes.
 * O estado público (state) vai para todos; o baralho e as cartas de cada um (ctx)
 * ficam só no aparelho do anfitrião, que manda para cada jogador apenas as cartas dele.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PokerEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/** Inteiro aleatório em [0, n) com gerador criptográfico, sem viés. */
function secureRandInt(n) {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || require('crypto').webcrypto;
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x;
  do { c.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const MAX_SEATS = 9;
const LOG_MAX = 40;

const DEFAULT_SETTINGS = {
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  turnSeconds: 30,
  allowRebuy: true,
};
const NEXT_HAND_DELAY_MS = 7000;
const MAX_TIMEOUTS_BEFORE_SITOUT = 1; // 30 s sem jogar = offline

class GameError extends Error {
  constructor(msg) { super(msg); this.name = 'GameError'; }
}

/* ------------------------------------------------------------------ */
/* Baralho                                                             */
/* ------------------------------------------------------------------ */

function newDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

/** Fisher–Yates com gerador criptográfico. */
function shuffle(deck, randInt = secureRandInt) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Avaliação de mãos                                                   */
/* ------------------------------------------------------------------ */

const HAND_NAMES = [
  'Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência',
  'Flush', 'Full house', 'Quadra', 'Straight flush', 'Royal flush',
];

const rankVal = (c) => RANKS.indexOf(c[0]) + 2; // 2..14

/** Avalia exatamente 5 cartas. Retorna {score, cat}. Score maior = mão melhor. */
function eval5(cards) {
  const vals = cards.map(rankVal).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  // ordena por (contagem desc, valor desc)
  const groups = Object.entries(counts)
    .map(([v, n]) => [Number(v), n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const kick = groups.map((g) => g[0]);

  let cat; let tie;
  if (straightHigh && flush) { cat = straightHigh === 14 ? 9 : 8; tie = [straightHigh]; }
  else if (shape === '41') { cat = 7; tie = kick; }
  else if (shape === '32') { cat = 6; tie = kick; }
  else if (flush) { cat = 5; tie = vals; }
  else if (straightHigh) { cat = 4; tie = [straightHigh]; }
  else if (shape === '311') { cat = 3; tie = kick; }
  else if (shape === '221') { cat = 2; tie = kick; }
  else if (shape === '2111') { cat = 1; tie = kick; }
  else { cat = 0; tie = vals; }

  // Royal flush é só um straight flush ao Ás: mesma escala de força.
  const strength = cat === 9 ? 8 : cat;
  let score = strength;
  for (let i = 0; i < 5; i++) score = score * 15 + (tie[i] || 0);
  return { score, cat };
}

const COMBOS_7 = (() => {
  const out = [];
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
    out.push([0, 1, 2, 3, 4, 5, 6].filter((i) => i !== a && i !== b));
  }
  return out;
})();

/** Melhor mão de 5 entre 5–7 cartas. */
function bestHand(cards) {
  if (cards.length < 5) throw new GameError('Cartas insuficientes');
  let best = null;
  const combos = cards.length === 7 ? COMBOS_7
    : combinations(cards.length, 5);
  for (const idx of combos) {
    const five = idx.map((i) => cards[i]);
    const e = eval5(five);
    if (!best || e.score > best.score) best = { ...e, cards: five };
  }
  best.name = HAND_NAMES[best.cat];
  return best;
}

function combinations(n, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/* ------------------------------------------------------------------ */
/* Sala e jogadores                                                    */
/* ------------------------------------------------------------------ */

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!n) throw new GameError('Informe um nome');
  return n;
}

function cleanSettings(s = {}) {
  const num = (v, def, min, max) => {
    const x = Math.floor(Number(v));
    if (!Number.isFinite(x)) return def;
    return Math.min(max, Math.max(min, x));
  };
  const bigBlind = num(s.bigBlind, DEFAULT_SETTINGS.bigBlind, 2, 1e6);
  const smallBlind = num(s.smallBlind, Math.floor(bigBlind / 2), 1, bigBlind);
  return {
    startingStack: num(s.startingStack, DEFAULT_SETTINGS.startingStack, bigBlind * 10, 1e8),
    smallBlind,
    bigBlind,
    turnSeconds: num(s.turnSeconds, DEFAULT_SETTINGS.turnSeconds, 5, 300),
    allowRebuy: s.allowRebuy === undefined ? true : !!s.allowRebuy,
  };
}

function createRoomState(code, hostUid, hostName, settings, now = Date.now()) {
  const state = {
    code,
    hostUid,
    settings: cleanSettings(settings),
    seats: Array(MAX_SEATS).fill(null),
    phase: 'waiting',
    started: false,
    handNumber: 0,
    dealer: -1,
    sbSeat: -1,
    bbSeat: -1,
    board: [],
    currentBet: 0,
    minRaise: 0,
    toAct: -1,
    deadline: 0,
    nextHandAt: 0,
    results: null,
    log: [],
    createdAt: now,
    updatedAt: now,
  };
  addPlayer(state, hostUid, hostName);
  return state;
}

function emptySeat(uid, name, stack) {
  return {
    uid, name, stack,
    bet: 0, committed: 0,
    inHand: false, folded: false, allIn: false, acted: false,
    sitOut: false, leaving: false, timeouts: 0,
    rebuys: 0, lastAction: '', shown: null,
  };
}

function seatOf(state, uid) {
  return state.seats.findIndex((s) => s && s.uid === uid);
}

function addPlayer(state, uid, name) {
  const existing = seatOf(state, uid);
  if (existing >= 0) {
    // reconexão: só atualiza o nome
    state.seats[existing].name = cleanName(name);
    return existing;
  }
  const free = state.seats.findIndex((s) => s === null);
  if (free < 0) throw new GameError('Mesa cheia (máx. 9 jogadores)');
  state.seats[free] = emptySeat(uid, cleanName(name), state.settings.startingStack);
  log(state, `${state.seats[free].name} entrou na mesa`);
  return free;
}

function log(state, msg) {
  state.log.push(msg);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
}

const handActive = (state) => ['preflop', 'flop', 'turn', 'river'].includes(state.phase);

/** Remove o jogador. Se estiver numa mão ativa, desiste e sai ao final dela. */
function removePlayer(state, ctx, uid, reason = 'saiu da mesa') {
  const i = seatOf(state, uid);
  if (i < 0) return;
  const s = state.seats[i];
  if (handActive(state) && s.inHand && !s.folded && !s.allIn) {
    s.leaving = true;
    log(state, `${s.name} ${reason}`);
    if (state.toAct === i) {
      doAction(state, ctx, i, 'fold', 0, Date.now(), true);
    } else {
      // desiste fora da vez: a vez continua com quem está jogando
      s.folded = true;
      s.lastAction = 'Desistiu';
      const alive = state.seats.filter((x) => x && x.inHand && !x.folded);
      if (alive.length === 1) finishHand(state, ctx, Date.now(), false);
    }
  } else if (handActive(state) && s.inHand) {
    s.leaving = true; // já desistiu; sai no fim da mão (fichas comprometidas ficam no pote)
    log(state, `${s.name} ${reason}`);
  } else {
    state.seats[i] = null;
    log(state, `${s.name} ${reason}`);
  }
  if (state.hostUid === uid) transferHost(state);
}

function transferHost(state) {
  const next = state.seats.find((s) => s && !s.leaving);
  state.hostUid = next ? next.uid : null;
  if (next) log(state, `${next.name} agora é o anfitrião`);
}

function canPlayNextHand(s) {
  return s && !s.sitOut && !s.leaving && s.stack > 0;
}

function nextSeat(state, from, pred) {
  for (let k = 1; k <= MAX_SEATS; k++) {
    const i = (from + k + MAX_SEATS) % MAX_SEATS;
    if (pred(state.seats[i], i)) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Início da mão                                                       */
/* ------------------------------------------------------------------ */

/**
 * Começa uma nova mão. Retorna o contexto privado:
 *   { deck: string[], hands: { [uid]: [c1, c2] } }
 */
function startHand(state, now = Date.now(), randInt) {
  if (handActive(state)) throw new GameError('Já existe uma mão em andamento');
  cleanupAfterHand(state);
  const eligible = state.seats.filter(canPlayNextHand);
  if (eligible.length < 2) throw new GameError('São necessários pelo menos 2 jogadores com fichas');

  state.started = true;
  state.handNumber += 1;
  state.board = [];
  state.results = null;
  state.nextHandAt = 0;
  for (const s of state.seats) {
    if (!s) continue;
    Object.assign(s, { bet: 0, committed: 0, folded: false, allIn: false, acted: false, lastAction: '', shown: null });
    s.inHand = canPlayNextHand(s);
  }

  const inHand = (s) => s && s.inHand;
  state.dealer = nextSeat(state, state.dealer < 0 ? -1 : state.dealer, inHand);
  const headsUp = eligible.length === 2;
  state.sbSeat = headsUp ? state.dealer : nextSeat(state, state.dealer, inHand);
  state.bbSeat = nextSeat(state, state.sbSeat, inHand);

  const deck = shuffle(newDeck(), randInt);
  const hands = {};
  // distribui uma carta por vez, começando à esquerda do botão
  const order = [];
  let p = state.dealer;
  for (let k = 0; k < eligible.length; k++) { p = nextSeat(state, p, inHand); order.push(p); }
  for (let round = 0; round < 2; round++) {
    for (const i of order) {
      const uid = state.seats[i].uid;
      (hands[uid] = hands[uid] || []).push(deck.shift());
    }
  }

  log(state, `— Mão #${state.handNumber} —`);
  postBlind(state, state.sbSeat, state.settings.smallBlind, 'SB');
  postBlind(state, state.bbSeat, state.settings.bigBlind, 'BB');
  state.phase = 'preflop';
  state.currentBet = state.settings.bigBlind;
  state.minRaise = state.settings.bigBlind;

  const ctx = { deck, hands };
  state.toAct = state.bbSeat;
  advanceTurn(state, ctx, now);
  return ctx;
}

function postBlind(state, i, amount, label) {
  const s = state.seats[i];
  const put = Math.min(amount, s.stack);
  putChips(s, put);
  s.lastAction = label;
}

function putChips(s, amount) {
  s.stack -= amount;
  s.bet += amount;
  s.committed += amount;
  if (s.stack === 0) s.allIn = true;
}

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

const needsToAct = (state) => (s) =>
  s && s.inHand && !s.folded && !s.allIn && (!s.acted || s.bet < state.currentBet);

/** Opções disponíveis para o jogador da vez (usado pela interface e validação). */
function legalActions(state, i) {
  const s = state.seats[i];
  if (!s || state.toAct !== i || !handActive(state)) return null;
  const toCall = Math.min(state.currentBet - s.bet, s.stack);
  const maxTo = s.bet + s.stack;
  const canRaise = !s.acted && maxTo > state.currentBet;
  const minTo = Math.min(maxTo, state.currentBet + state.minRaise);
  return {
    canCheck: s.bet >= state.currentBet,
    toCall,
    canRaise,
    minRaiseTo: canRaise ? minTo : 0,
    maxRaiseTo: canRaise ? maxTo : 0,
  };
}

function act(state, ctx, uid, action, amount, now = Date.now()) {
  if (!handActive(state)) throw new GameError('Nenhuma mão em andamento');
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  if (state.toAct !== i) throw new GameError('Não é a sua vez');
  state.seats[i].timeouts = 0;
  doAction(state, ctx, i, action, amount, now, false);
}

function doAction(state, ctx, i, action, amount, now, forced) {
  const s = state.seats[i];
  const opts = legalActions(state, i);
  if (!opts) throw new GameError('Não é a sua vez');

  switch (action) {
    case 'fold':
      s.folded = true;
      s.lastAction = 'Desistiu';
      log(state, `${s.name} desistiu`);
      break;
    case 'check':
      if (!opts.canCheck) throw new GameError('Não dá para passar: há aposta para pagar');
      s.lastAction = 'Passou';
      log(state, `${s.name} passou`);
      break;
    case 'call': {
      if (opts.canCheck) { return doAction(state, ctx, i, 'check', 0, now, forced); }
      putChips(s, opts.toCall);
      s.lastAction = s.allIn ? 'All-in' : 'Pagou';
      log(state, `${s.name} ${s.allIn ? 'pagou all-in' : 'pagou'} ${opts.toCall}`);
      break;
    }
    case 'raise': {
      if (!opts.canRaise) throw new GameError('Aumento não permitido agora');
      let to = Math.floor(Number(amount));
      if (!Number.isFinite(to)) throw new GameError('Valor inválido');
      to = Math.min(to, opts.maxRaiseTo);
      const isAllIn = to === opts.maxRaiseTo;
      if (to < opts.minRaiseTo && !isAllIn) {
        throw new GameError(`O aumento mínimo é para ${opts.minRaiseTo}`);
      }
      if (to <= state.currentBet) throw new GameError('Valor inválido');
      const raiseBy = to - state.currentBet;
      const wasBet = state.currentBet === 0;
      putChips(s, to - s.bet);
      if (raiseBy >= state.minRaise) {
        // aumento completo: reabre a ação para todos
        state.minRaise = raiseBy;
        for (const o of state.seats) if (o && o !== s) o.acted = false;
      }
      state.currentBet = to;
      s.lastAction = s.allIn ? 'All-in' : (wasBet ? 'Apostou' : 'Aumentou');
      log(state, `${s.name} ${s.allIn ? 'foi all-in com' : (wasBet ? 'apostou' : 'aumentou para')} ${to}`);
      break;
    }
    default:
      throw new GameError('Ação desconhecida');
  }
  s.acted = true;
  afterAction(state, ctx, now);
}

function afterAction(state, ctx, now) {
  const alive = state.seats.filter((s) => s && s.inHand && !s.folded);
  if (alive.length === 1) {
    finishHand(state, ctx, now, false);
    return;
  }
  advanceTurn(state, ctx, now);
}

/** Passa a vez ou encerra a rodada de apostas. */
function advanceTurn(state, ctx, now) {
  const next = nextSeat(state, state.toAct, needsToAct(state));
  if (next >= 0) {
    state.toAct = next;
    state.deadline = now + state.settings.turnSeconds * 1000;
    return;
  }
  // rodada encerrada
  for (const s of state.seats) if (s) { s.bet = 0; s.acted = false; }
  state.currentBet = 0;
  state.minRaise = state.settings.bigBlind;

  const canBet = state.seats.filter((s) => s && s.inHand && !s.folded && !s.allIn);
  if (state.phase === 'river' || canBet.length <= 1) {
    // sem mais apostas possíveis: completa a mesa e vai ao showdown
    while (state.board.length < 5) dealStreet(state, ctx);
    finishHand(state, ctx, now, true);
    return;
  }
  dealStreet(state, ctx);
  for (const s of state.seats) if (s && s.inHand && !s.folded && !s.allIn) s.lastAction = '';
  state.toAct = state.dealer;
  advanceTurn(state, ctx, now);
}

function dealStreet(state, ctx) {
  const n = state.board.length;
  if (n === 0) {
    ctx.deck.shift(); // queima
    state.board.push(ctx.deck.shift(), ctx.deck.shift(), ctx.deck.shift());
    state.phase = 'flop';
  } else if (n < 5) {
    ctx.deck.shift();
    state.board.push(ctx.deck.shift());
    state.phase = n === 3 ? 'turn' : 'river';
  }
}

/* ------------------------------------------------------------------ */
/* Final da mão e potes                                                */
/* ------------------------------------------------------------------ */

/** Divide as fichas comprometidas em pote principal e potes paralelos. */
function buildPots(seats) {
  const contrib = seats.map((s, i) => (s && s.committed > 0 ? { i, c: s.committed, live: s.inHand && !s.folded } : null)).filter(Boolean);
  const levels = [...new Set(contrib.filter((x) => x.live).map((x) => x.c))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lvl of levels) {
    let amount = 0;
    for (const x of contrib) amount += Math.max(0, Math.min(x.c, lvl) - prev);
    const eligible = contrib.filter((x) => x.live && x.c >= lvl).map((x) => x.i);
    const contributors = contrib.filter((x) => x.c > prev).length; // quem pôs fichas nessa faixa (inclui quem desistiu)
    if (amount > 0) pots.push({ amount, eligible, contributors });
    prev = lvl;
  }
  // fichas acima do maior nível de quem continua na mão (só de quem desistiu) vão para o último pote
  let extra = 0;
  for (const x of contrib) extra += Math.max(0, x.c - prev);
  if (extra > 0 && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}

function finishHand(state, ctx, now, showdown) {
  const seats = state.seats;
  const pots = buildPots(seats);
  const results = [];
  const evals = {};

  if (showdown) {
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      if (!s || !s.inHand || s.folded) continue;
      const hole = ctx.hands[s.uid];
      s.shown = hole;
      evals[i] = bestHand([...hole, ...state.board]);
    }
  }

  // ordem para fichas ímpares: primeiro à esquerda do botão
  const orderFromButton = [];
  for (let k = 1; k <= MAX_SEATS; k++) orderFromButton.push((state.dealer + k) % MAX_SEATS);

  pots.forEach((pot, idx) => {
    let winners;
    if (pot.eligible.length === 1) winners = pot.eligible;
    else {
      const best = Math.max(...pot.eligible.map((i) => evals[i].score));
      winners = pot.eligible.filter((i) => evals[i].score === best);
    }
    winners.sort((a, b) => orderFromButton.indexOf(a) - orderFromButton.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let rest = pot.amount - share * winners.length;
    for (const w of winners) {
      seats[w].stack += share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
    }
    const ev = showdown && winners.length ? evals[winners[0]] : null;
    const uncontested = pot.eligible.length === 1;
    // aposta que ninguém pagou volta para quem apostou
    const returned = uncontested && pot.contributors === 1 && pots.length > 1;
    results.push({
      label: returned ? 'Devolvido' : (pots.length === 1 ? 'Pote' : (idx === 0 ? 'Pote principal' : `Pote paralelo ${idx}`)),
      returned,
      amount: pot.amount,
      winners: winners.map((w) => ({ seat: w, name: seats[w].name })),
      handName: ev && !uncontested ? ev.name : '',
      cards: ev && !uncontested ? ev.cards : [],
    });
    const names = winners.map((w) => seats[w].name).join(' e ');
    if (returned) log(state, `${pot.amount} voltaram para ${names}`);
    else log(state, `${names} ${winners.length > 1 ? 'dividiram' : 'ganhou'} ${pot.amount}${ev && !uncontested ? ` com ${ev.name}` : ''}`);
  });

  // nome da mão de cada um no showdown
  for (const [i, e] of Object.entries(evals)) seats[i].lastAction = e.name;

  state.results = results;
  state.phase = 'showdown';
  state.toAct = -1;
  state.deadline = 0;
  state.currentBet = 0;
  state.nextHandAt = now + NEXT_HAND_DELAY_MS;
  for (const s of seats) if (s) { s.bet = 0; }
}

/** Remove quem pediu para sair e zera marcações antes da próxima mão. */
function cleanupAfterHand(state) {
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s && s.leaving) state.seats[i] = null;
  }
  if (state.hostUid && seatOf(state, state.hostUid) < 0) transferHost(state);
}

/* ------------------------------------------------------------------ */
/* Tempo: vez esgotada e próxima mão                                   */
/* ------------------------------------------------------------------ */

/**
 * Chamado periodicamente pelos clientes. Retorna:
 *   'timeout'   – o jogador da vez estourou o tempo e agiu automaticamente
 *   'nexthand'  – nova mão iniciada (retorna também ctx)
 *   null        – nada a fazer
 */
function tick(state, ctx, now = Date.now(), randInt) {
  const cur = handActive(state) && state.toAct >= 0 ? state.seats[state.toAct] : null;
  // quem já está offline joga automaticamente na hora (passa ou desiste)
  if (cur && ((state.deadline && now >= state.deadline) || cur.sitOut)) {
    const i = state.toAct;
    const s = cur;
    const wasOffline = s.sitOut;
    if (!wasOffline) s.timeouts = (s.timeouts || 0) + 1;
    const opts = legalActions(state, i);
    if (!wasOffline) log(state, `Tempo esgotado para ${s.name}`);
    doAction(state, ctx, i, opts.canCheck ? 'check' : 'fold', 0, now, true);
    if (!wasOffline && s.timeouts >= MAX_TIMEOUTS_BEFORE_SITOUT) {
      s.sitOut = true;
      log(state, `${s.name} ficou offline`);
    }
    return { type: 'timeout' };
  }
  if (state.phase === 'showdown' && state.nextHandAt && now >= state.nextHandAt) {
    cleanupAfterHand(state);
    const eligible = state.seats.filter(canPlayNextHand);
    if (eligible.length < 2) {
      state.phase = 'waiting';
      state.nextHandAt = 0;
      log(state, 'Aguardando jogadores com fichas…');
      return { type: 'waiting' };
    }
    const newCtx = startHand(state, now, randInt);
    return { type: 'nexthand', ctx: newCtx };
  }
  return null;
}

function rebuy(state, uid) {
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  const s = state.seats[i];
  if (!state.settings.allowRebuy) throw new GameError('Recompra desativada nesta mesa');
  if (s.stack > 0) throw new GameError('Você ainda tem fichas');
  if (handActive(state) && s.inHand && !s.folded) throw new GameError('Espere a mão terminar');
  s.stack = state.settings.startingStack;
  s.rebuys += 1;
  s.sitOut = false;
  log(state, `${s.name} recomprou ${s.stack} fichas`);
}

function setSitOut(state, uid, value) {
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  const s = state.seats[i];
  if (s.sitOut === !!value) return;
  s.sitOut = !!value;
  s.timeouts = 0;
  log(state, value ? `${s.name} ficou offline` : `${s.name} voltou para a mesa`);
}

function totalChips(state) {
  return state.seats.reduce((t, s) => t + (s ? s.stack + (handActive(state) ? s.committed : 0) : 0), 0);
}

return {
  RANKS, SUITS, MAX_SEATS, DEFAULT_SETTINGS, NEXT_HAND_DELAY_MS, GameError,
  newDeck, shuffle, eval5, bestHand, HAND_NAMES,
  cleanName, cleanSettings, createRoomState, addPlayer, removePlayer, seatOf,
  startHand, legalActions, act, tick, rebuy, setSitOut, buildPots, handActive,
  totalChips, canPlayNextHand, secureRandInt, MAX_TIMEOUTS_BEFORE_SITOUT,
};
}));
