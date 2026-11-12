/**
 * PokerTrama — regras do Texas Hold'em No-Limit.
 *
 * Roda no celular de quem criou a mesa (o "dealer") e também no Node para os testes.
 * O estado público (state) vai para todos; o baralho e as cartas de cada um (ctx)
 * ficam só no aparelho do anfitrião, que manda para cada jogador apenas as cartas dele.
 *
 * Modos:
 *   torneio — sem recompra, blinds sobem a cada X minutos, eliminação e pódio
 *   cash    — blinds fixos, recompra quando zerar
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
const LOG_MAX = 50;

const DEFAULT_SETTINGS = {
  mode: 'torneio',
  startingStack: 20000,
  smallBlind: 100,
  bigBlind: 200,
  levelMinutes: 8,
  reentryLevels: 8, // reentrada liberada até o fim do nível 8 (0 = sem reentrada)
  turnSeconds: 30,
  timeBankSeconds: 60,
  allowRebuy: true, // só no cash
};
// Estrutura do torneio (para big blind inicial 200; outros valores são proporcionais).
// long = usa os minutos do nível escolhidos (8); os níveis finais andam mais rápido (5/8 disso).
const STRUCTURE = [
  { sb: 100, bb: 200, ante: 30, long: true },
  { sb: 125, bb: 250, ante: 35, long: true },
  { sb: 150, bb: 300, ante: 45, long: true },
  { sb: 200, bb: 400, ante: 60, long: true },
  { sb: 250, bb: 500, ante: 75, long: true },
  { sb: 300, bb: 600, ante: 90, long: true },
  { sb: 350, bb: 700, ante: 100, long: true },
  { sb: 400, bb: 800, ante: 120, long: true },
  { sb: 500, bb: 1000, ante: 150 },
  { sb: 600, bb: 1200, ante: 180 },
  { sb: 750, bb: 1500, ante: 200 },
  { sb: 1000, bb: 2000, ante: 300 },
  { sb: 1250, bb: 2500, ante: 375 },
  { sb: 1500, bb: 3000, ante: 450 },
  { sb: 2000, bb: 4000, ante: 600 },
  { sb: 2500, bb: 5000, ante: 750 },
  { sb: 3000, bb: 6000, ante: 900 },
  { sb: 4000, bb: 8000, ante: 1200 },
  { sb: 5000, bb: 10000, ante: 1500 },
  { sb: 6000, bb: 12000, ante: 1800 },
  { sb: 8000, bb: 16000, ante: 2400 },
  { sb: 10000, bb: 20000, ante: 3000 },
];
const NEXT_HAND_DELAY_MS = 7000;
const MAX_TIMEOUTS_BEFORE_SITOUT = 1; // estourou o tempo (e o banco) = offline
const COLORS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#F4C430', '#EC407A', '#6D4C41'];

class GameError extends Error {
  constructor(msg) { super(msg); this.name = 'GameError'; }
}
class SpectatorError extends GameError {
  constructor(msg) { super(msg); this.name = 'SpectatorError'; }
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
  const combos = cards.length === 7 ? COMBOS_7 : combinations(cards.length, 5);
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

function cleanColor(c, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : fallback;
}

function cleanSettings(s = {}) {
  const num = (v, def, min, max) => {
    const x = Math.floor(Number(v));
    if (!Number.isFinite(x)) return def;
    return Math.min(max, Math.max(min, x));
  };
  const mode = s.mode === 'cash' ? 'cash' : 'torneio';
  const bigBlind = num(s.bigBlind, DEFAULT_SETTINGS.bigBlind, 2, 1e7);
  const smallBlind = num(s.smallBlind, Math.floor(bigBlind / 2), 1, bigBlind);
  return {
    mode,
    startingStack: num(s.startingStack, DEFAULT_SETTINGS.startingStack, bigBlind * 10, 1e9),
    smallBlind,
    bigBlind,
    levelMinutes: num(s.levelMinutes, DEFAULT_SETTINGS.levelMinutes, 1, 120),
    reentryLevels: num(s.reentryLevels, DEFAULT_SETTINGS.reentryLevels, 0, 22),
    turnSeconds: num(s.turnSeconds, DEFAULT_SETTINGS.turnSeconds, 5, 300),
    timeBankSeconds: num(s.timeBankSeconds, DEFAULT_SETTINGS.timeBankSeconds, 0, 600),
    allowRebuy: mode === 'cash' && (s.allowRebuy === undefined ? true : !!s.allowRebuy),
  };
}

function createRoomState(code, hostUid, hostName, settings, now = Date.now(), hostColor) {
  const st = cleanSettings(settings);
  const state = {
    v: 2,
    code,
    hostUid,
    settings: st,
    blinds: null,
    tourney: null,
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
    usingBank: false,
    bankStart: 0,
    nextHandAt: 0,
    results: null,
    showOffer: null,
    stats: {},
    records: { biggestPot: null, bestHand: null },
    log: [],
    createdAt: now,
    updatedAt: now,
  };
  state.blinds = blindLevel(state, 0);
  addPlayer(state, hostUid, hostName, hostColor);
  return state;
}

function emptySeat(uid, name, stack, color, bankMs) {
  return {
    uid, name, stack, color,
    bet: 0, committed: 0, startStack: stack,
    inHand: false, folded: false, allIn: false, acted: false,
    sitOut: false, leaving: false, timeouts: 0, timeBank: bankMs,
    eliminated: false, place: 0, waitingReentry: false, bustedAt: 0,
    rebuys: 0, lastAction: '', shown: null,
  };
}

function seatOf(state, uid) {
  return state.seats.findIndex((s) => s && s.uid === uid);
}

const isTourney = (state) => state.settings.mode === 'torneio';
const tourneyRunning = (state) => isTourney(state) && state.started && !(state.tourney && state.tourney.finished);

/**
 * Senta o jogador (ou atualiza nome/cor se já estiver sentado).
 * Com o torneio em andamento, quem chega fica assistindo (SpectatorError).
 */
function addPlayer(state, uid, name, color) {
  const existing = seatOf(state, uid);
  const nm = cleanName(name);
  if (existing >= 0) {
    const s = state.seats[existing];
    s.name = nm;
    s.color = cleanColor(color, s.color);
    touchStats(state, uid, nm);
    return existing;
  }
  if (tourneyRunning(state) && !reentryOpen(state, Date.now())) throw new SpectatorError('O torneio já começou. Você assiste e entra no próximo.');
  const free = state.seats.findIndex((s) => s === null);
  if (free < 0) throw new GameError('Mesa cheia (máx. 9 jogadores)');
  state.seats[free] = emptySeat(uid, nm, state.settings.startingStack,
    cleanColor(color, COLORS[free % COLORS.length]), state.settings.timeBankSeconds * 1000);
  touchStats(state, uid, nm);
  log(state, `${nm} entrou na mesa`);
  return free;
}

function touchStats(state, uid, name) {
  const st = state.stats[uid] || (state.stats[uid] = { name, handsWon: 0, handsPlayed: 0, tourneyWins: 0, biggestWin: 0 });
  st.name = name;
  return st;
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
  // no torneio, quem sai é eliminado na posição atual
  if (tourneyRunning(state) && state.tourney && !s.eliminated) {
    eliminate(state, s, aliveInTourney(state).length);
  }
  if (handActive(state) && s.inHand && !s.folded && !s.allIn) {
    s.leaving = true;
    log(state, `${s.name} ${reason}`);
    if (state.toAct === i) {
      doAction(state, ctx, i, 'fold', 0, Date.now(), true);
    } else {
      s.folded = true;
      s.lastAction = 'Desistiu';
      const alive = state.seats.filter((x) => x && x.inHand && !x.folded);
      if (alive.length === 1) finishHand(state, ctx, Date.now(), false);
    }
  } else if (handActive(state) && s.inHand) {
    s.leaving = true;
    log(state, `${s.name} ${reason}`);
  } else {
    state.seats[i] = null;
    log(state, `${s.name} ${reason}`);
  }
  if (state.hostUid === uid) transferHost(state);
  if (!handActive(state)) checkTourneyEnd(state, Date.now());
}

function transferHost(state) {
  const next = state.seats.find((s) => s && !s.leaving);
  state.hostUid = next ? next.uid : null;
  if (next) log(state, `${next.name} agora é o anfitrião`);
}

/** Pode entrar na próxima mão? No torneio, quem está offline continua recebendo cartas (e desiste sozinho). */
function canPlayNextHand(state, s) {
  if (!s || s.leaving || s.eliminated || s.waitingReentry || s.stack <= 0) return false;
  return isTourney(state) ? true : !s.sitOut;
}

function nextSeat(state, from, pred) {
  for (let k = 1; k <= MAX_SEATS; k++) {
    const i = (from + k + MAX_SEATS) % MAX_SEATS;
    if (pred(state.seats[i], i)) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Torneio                                                             */
/* ------------------------------------------------------------------ */

/** Blinds, ante e duração de um nível do torneio. */
function blindLevel(state, level) {
  const st = state.settings;
  if (!isTourney(state)) return { sb: st.smallBlind, bb: st.bigBlind, ante: 0, level: 0, ms: 0 };
  const lv = Math.min(level, STRUCTURE.length - 1);
  const e = STRUCTURE[lv];
  const k = st.bigBlind / 200;
  const r = (x) => Math.max(1, Math.round(x * k));
  const minutes = e.long ? st.levelMinutes : Math.max(1, Math.round(st.levelMinutes * 5 / 8));
  return {
    sb: lv === 0 ? st.smallBlind : r(e.sb), bb: lv === 0 ? st.bigBlind : r(e.bb), ante: r(e.ante),
    level: lv, ms: minutes * 60000,
  };
}

/** Tabela completa (para mostrar na tela). */
function structure(state) {
  return STRUCTURE.map((_, i) => blindLevel(state, i));
}

/** Nível do torneio pelo relógio e quando ele termina. */
function levelAt(state, now) {
  const t = state.tourney;
  let lvl = 0, end = t.startedAt + blindLevel(state, 0).ms;
  while (now >= end && lvl < STRUCTURE.length - 1) { lvl++; end += blindLevel(state, lvl).ms; }
  return { lvl, end };
}

/** Ainda dá para reentrar? (até o fim do nível escolhido) */
function reentryOpen(state, now) {
  const t = state.tourney;
  if (!isTourney(state) || !state.settings.reentryLevels) return false;
  if (!t) return true;
  if (t.finished) return false;
  return levelAt(state, now).lvl < state.settings.reentryLevels;
}

/** Atualiza os blinds no início de cada mão (o nível novo vale a partir da mão seguinte). */
function updateBlinds(state, now) {
  if (!isTourney(state) || !state.tourney) {
    state.blinds = blindLevel(state, 0);
    return;
  }
  const t = state.tourney;
  const { lvl, end } = levelAt(state, now);
  if (lvl !== state.blinds.level) {
    state.blinds = blindLevel(state, lvl);
    log(state, `Blinds subiram para ${state.blinds.sb}/${state.blinds.bb} (ante ${state.blinds.ante})`);
  }
  t.nextLevelAt = lvl >= STRUCTURE.length - 1 ? 0 : end;
}

const aliveInTourney = (state) => state.seats.filter((s) => s && !s.eliminated && !s.leaving && s.stack > 0);
const waitingReentry = (state) => state.seats.filter((s) => s && s.waitingReentry && !s.eliminated && !s.leaving);

function eliminate(state, s, place) {
  s.eliminated = true;
  s.waitingReentry = false;
  s.place = place;
  state.tourney.places.push({ place, name: s.name, uid: s.uid, color: s.color });
  state.tourney.places.sort((a, b) => a.place - b.place);
  log(state, `${s.name} foi eliminado em ${place}º lugar`);
}

/** Fecha a reentrada: quem quebrou e não voltou é eliminado (quem quebrou por último fica na frente). */
function closeReentry(state, now) {
  const waiting = waitingReentry(state);
  if (!waiting.length || reentryOpen(state, now)) return false;
  const alive = aliveInTourney(state).length;
  waiting.sort((a, b) => b.bustedAt - a.bustedAt).forEach((s, k) => eliminate(state, s, alive + 1 + k));
  log(state, 'Reentrada encerrada');
  return true;
}

function checkTourneyEnd(state, now) {
  const t = state.tourney;
  if (!t || t.finished || !state.started) return;
  closeReentry(state, now);
  if (waitingReentry(state).length) return; // alguém ainda pode voltar
  const alive = aliveInTourney(state);
  if (alive.length !== 1) return;
  const w = alive[0];
  w.place = 1;
  t.places.push({ place: 1, name: w.name, uid: w.uid, color: w.color });
  t.places.sort((a, b) => a.place - b.place);
  t.finished = true;
  t.finishedAt = now;
  touchStats(state, w.uid, w.name).tourneyWins += 1;
  state.nextHandAt = 0;
  log(state, `🏆 ${w.name} venceu o torneio!`);
}

/** Prepara um torneio novo com os mesmos jogadores (fichas zeradas para o inicial). */
function newTournament(state) {
  if (handActive(state)) throw new GameError('Espere a mão terminar');
  if (!isTourney(state)) throw new GameError('Esta mesa é cash');
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (!s) continue;
    if (s.leaving) { state.seats[i] = null; continue; }
    Object.assign(s, {
      stack: state.settings.startingStack, startStack: state.settings.startingStack,
      bet: 0, committed: 0, inHand: false, folded: false, allIn: false, acted: false,
      eliminated: false, place: 0, waitingReentry: false, bustedAt: 0, rebuys: 0, lastAction: '', shown: null, timeouts: 0,
      timeBank: state.settings.timeBankSeconds * 1000,
    });
  }
  state.tourney = null;
  state.started = false;
  state.phase = 'waiting';
  state.results = null;
  state.board = [];
  state.showOffer = null;
  state.toAct = -1;
  state.deadline = 0;
  state.nextHandAt = 0;
  state.blinds = blindLevel(state, 0);
  log(state, '— Novo torneio —');
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
  if (state.tourney && state.tourney.finished) throw new GameError('O torneio terminou');
  cleanupAfterHand(state);
  const eligible = state.seats.filter((s) => canPlayNextHand(state, s));
  if (eligible.length < 2) throw new GameError('São necessários pelo menos 2 jogadores com fichas');

  if (isTourney(state) && !state.tourney) {
    state.tourney = {
      startedAt: now, levelMs: state.settings.levelMinutes * 60000, nextLevelAt: 0,
      places: [], finished: false, entrants: eligible.length,
    };
    state.blinds = blindLevel(state, 0);
    log(state, `— Torneio começou: ${eligible.length} jogadores —`);
  }
  updateBlinds(state, now);

  state.started = true;
  state.handNumber += 1;
  state.board = [];
  state.results = null;
  state.showOffer = null;
  state.nextHandAt = 0;
  state.usingBank = false;
  for (const s of state.seats) {
    if (!s) continue;
    Object.assign(s, { bet: 0, committed: 0, folded: false, allIn: false, acted: false, lastAction: '', shown: null });
    s.inHand = canPlayNextHand(state, s);
    s.startStack = s.stack;
  }

  const inHand = (s) => s && s.inHand;
  state.dealer = nextSeat(state, state.dealer < 0 ? -1 : state.dealer, inHand);
  const headsUp = eligible.length === 2;
  state.sbSeat = headsUp ? state.dealer : nextSeat(state, state.dealer, inHand);
  state.bbSeat = nextSeat(state, state.sbSeat, inHand);

  const deck = shuffle(newDeck(), randInt);
  const hands = {};
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
  if (state.blinds.ante > 0) {
    // ante: ficha "morta" que todos colocam no pote antes dos blinds
    for (const s of state.seats) {
      if (!s || !s.inHand) continue;
      const a = Math.min(state.blinds.ante, s.stack);
      s.stack -= a; s.committed += a;
      if (s.stack === 0) s.allIn = true;
    }
  }
  postBlind(state, state.sbSeat, state.blinds.sb, 'SB');
  postBlind(state, state.bbSeat, state.blinds.bb, 'BB');
  state.phase = 'preflop';
  state.currentBet = state.blinds.bb;
  state.minRaise = state.blinds.bb;

  const ctx = { deck, hands };
  state.toAct = state.bbSeat;
  advanceTurn(state, ctx, now);
  return ctx;
}

function postBlind(state, i, amount, label) {
  const s = state.seats[i];
  if (s.stack > 0) putChips(s, Math.min(amount, s.stack));
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

/** Desconta do banco de tempo o que o jogador da vez usou dele. */
function settleBank(state, now) {
  if (state.usingBank && state.toAct >= 0 && state.seats[state.toAct]) {
    const s = state.seats[state.toAct];
    s.timeBank = Math.max(0, s.timeBank - Math.max(0, now - state.bankStart));
  }
  state.usingBank = false;
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
      if (to < opts.minRaiseTo && !isAllIn) throw new GameError(`O aumento mínimo é para ${opts.minRaiseTo}`);
      if (to <= state.currentBet) throw new GameError('Valor inválido');
      const raiseBy = to - state.currentBet;
      const wasBet = state.currentBet === 0;
      putChips(s, to - s.bet);
      if (raiseBy >= state.minRaise) {
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
  settleBank(state, now);
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
  state.usingBank = false;
  const next = nextSeat(state, state.toAct, needsToAct(state));
  if (next >= 0) {
    state.toAct = next;
    state.deadline = now + state.settings.turnSeconds * 1000;
    return;
  }
  for (const s of state.seats) if (s) { s.bet = 0; s.acted = false; }
  state.currentBet = 0;
  state.minRaise = state.blinds.bb;

  const canBet = state.seats.filter((s) => s && s.inHand && !s.folded && !s.allIn);
  if (state.phase === 'river' || canBet.length <= 1) {
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
    ctx.deck.shift();
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

  for (const [i, e] of Object.entries(evals)) seats[i].lastAction = e.name;

  /* estatísticas da noite */
  const won = new Map(); // seat -> fichas ganhas (sem devoluções)
  let potTotal = 0;
  for (const r of results) {
    if (r.returned) continue;
    potTotal += r.amount;
    const share = Math.floor(r.amount / r.winners.length);
    for (const w of r.winners) won.set(w.seat, (won.get(w.seat) || 0) + share);
  }
  for (const s of seats) if (s && s.inHand) touchStats(state, s.uid, s.name).handsPlayed += 1;
  for (const [i, amt] of won) {
    const st = touchStats(state, seats[i].uid, seats[i].name);
    st.handsWon += 1;
    st.biggestWin = Math.max(st.biggestWin, amt);
  }
  const main = results.find((r) => !r.returned);
  const rec = state.records;
  if (main && (!rec.biggestPot || potTotal > rec.biggestPot.amount)) {
    rec.biggestPot = { amount: potTotal, names: main.winners.map((w) => w.name), hand: main.handName || '', handNumber: state.handNumber };
  }
  for (const i of won.keys()) {
    const e = evals[i];
    if (e && (!rec.bestHand || e.score > rec.bestHand.score)) {
      rec.bestHand = { score: e.score, name: e.name, cards: e.cards, by: seats[i].name, handNumber: state.handNumber };
    }
  }

  /* todo mundo desistiu: o vencedor pode escolher mostrar as cartas */
  if (!showdown) {
    const w = seats.findIndex((s) => s && s.inHand && !s.folded);
    if (w >= 0) state.showOffer = { seat: w, handNumber: state.handNumber };
  }

  state.results = results;
  state.phase = 'showdown';
  state.toAct = -1;
  state.deadline = 0;
  state.usingBank = false;
  state.currentBet = 0;
  state.nextHandAt = now + NEXT_HAND_DELAY_MS;
  for (const s of seats) if (s) { s.bet = 0; }

  /* torneio: quem zerou pode reentrar (se ainda estiver aberto) ou é eliminado.
     Quem começou a mão com mais fichas fica na frente. */
  if (state.tourney && !state.tourney.finished) {
    const busted = seats.filter((s) => s && s.inHand && s.stack === 0 && !s.eliminated)
      .sort((a, b) => b.startStack - a.startStack);
    if (reentryOpen(state, now)) {
      busted.forEach((s, k) => {
        s.waitingReentry = true;
        s.bustedAt = now * 100 + (busted.length - k); // desempate: mais fichas = quebrou "depois"
        log(state, `${s.name} quebrou e pode reentrar`);
      });
    } else {
      const remaining = aliveInTourney(state).length + waitingReentry(state).length;
      busted.forEach((s, k) => eliminate(state, s, remaining + 1 + k));
    }
    checkTourneyEnd(state, now);
  }
}

/** O vencedor de uma mão sem showdown decide mostrar as cartas. */
function showCards(state, ctx, uid) {
  const i = seatOf(state, uid);
  const o = state.showOffer;
  if (i < 0 || !o || o.seat !== i || state.phase !== 'showdown' || o.handNumber !== state.handNumber) {
    throw new GameError('Não dá para mostrar agora');
  }
  const cards = ctx.hands && ctx.hands[uid];
  if (!cards) throw new GameError('Cartas não encontradas');
  state.seats[i].shown = cards.slice();
  state.showOffer = null;
  log(state, `${state.seats[i].name} mostrou as cartas`);
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
/* Tempo: vez esgotada, banco de tempo e próxima mão                   */
/* ------------------------------------------------------------------ */

/**
 * Chamado periodicamente pelo anfitrião. Retorna:
 *   {type:'bank'}      – o tempo normal acabou e começou o banco de tempo
 *   {type:'timeout'}   – o jogador da vez estourou o tempo e agiu automaticamente
 *   {type:'nexthand', ctx} – nova mão iniciada
 *   {type:'waiting'}   – faltam jogadores para continuar
 *   null               – nada a fazer
 */
function tick(state, ctx, now = Date.now(), randInt) {
  const cur = handActive(state) && state.toAct >= 0 ? state.seats[state.toAct] : null;
  if (cur && cur.sitOut) {
    // offline joga na hora (passa ou desiste)
    const opts = legalActions(state, state.toAct);
    doAction(state, ctx, state.toAct, opts.canCheck ? 'check' : 'fold', 0, now, true);
    return { type: 'timeout' };
  }
  if (cur && state.deadline && now >= state.deadline) {
    if (!state.usingBank && cur.timeBank >= 1000) {
      state.usingBank = true;
      state.bankStart = now;
      state.deadline = now + cur.timeBank;
      return { type: 'bank' };
    }
    const i = state.toAct;
    settleBank(state, now);
    cur.timeouts = (cur.timeouts || 0) + 1;
    const opts = legalActions(state, i);
    log(state, `Tempo esgotado para ${cur.name}`);
    doAction(state, ctx, i, opts.canCheck ? 'check' : 'fold', 0, now, true);
    if (cur.timeouts >= MAX_TIMEOUTS_BEFORE_SITOUT) {
      cur.sitOut = true;
      log(state, `${cur.name} ficou offline`);
    }
    return { type: 'timeout' };
  }
  if (state.tourney && !state.tourney.finished && !handActive(state) && waitingReentry(state).length && !reentryOpen(state, now)) {
    checkTourneyEnd(state, now);
    return { type: 'reentry-closed' };
  }
  // jogo parado esperando jogadores (ex.: recompra/reentrada): recomeça sozinho
  if (state.phase === 'waiting' && state.started && !(state.tourney && state.tourney.finished)
      && state.seats.filter((s) => canPlayNextHand(state, s)).length >= 2) {
    const newCtx = startHand(state, now, randInt);
    return { type: 'nexthand', ctx: newCtx };
  }
  if (state.phase === 'showdown' && state.nextHandAt && now >= state.nextHandAt) {
    cleanupAfterHand(state);
    const eligible = state.seats.filter((s) => canPlayNextHand(state, s));
    if (eligible.length < 2) {
      state.phase = 'waiting';
      state.nextHandAt = 0;
      log(state, waitingReentry(state).length ? 'Esperando reentrada…' : 'Aguardando jogadores com fichas…');
      return { type: 'waiting' };
    }
    const newCtx = startHand(state, now, randInt);
    return { type: 'nexthand', ctx: newCtx };
  }
  return null;
}

/** Reentrada no torneio: volta com as fichas iniciais. */
function reenter(state, uid, now = Date.now()) {
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  const s = state.seats[i];
  if (!s.waitingReentry) throw new GameError('Você não precisa reentrar');
  if (!reentryOpen(state, now)) throw new GameError('A reentrada já fechou');
  s.stack = state.settings.startingStack;
  s.rebuys += 1;
  s.waitingReentry = false;
  s.sitOut = false;
  s.timeouts = 0;
  log(state, `${s.name} reentrou (${s.rebuys}ª reentrada)`);
}

/** Quem quebrou desiste da reentrada e sai do torneio na hora. */
function declineReentry(state, uid, now = Date.now()) {
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  const s = state.seats[i];
  if (!s.waitingReentry) throw new GameError('Nada a fazer');
  const ahead = aliveInTourney(state).length + waitingReentry(state).filter((x) => x !== s).length;
  eliminate(state, s, ahead + 1);
  if (!handActive(state)) checkTourneyEnd(state, now);
}

function rebuy(state, uid) {
  const i = seatOf(state, uid);
  if (i < 0) throw new GameError('Você não está na mesa');
  const s = state.seats[i];
  if (isTourney(state)) throw new GameError('No torneio não tem recompra');
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
  RANKS, SUITS, MAX_SEATS, DEFAULT_SETTINGS, NEXT_HAND_DELAY_MS, STRUCTURE, COLORS,
  GameError, SpectatorError,
  newDeck, shuffle, eval5, bestHand, HAND_NAMES,
  cleanName, cleanSettings, createRoomState, addPlayer, removePlayer, seatOf,
  startHand, legalActions, act, tick, rebuy, setSitOut, buildPots, handActive,
  totalChips, canPlayNextHand, secureRandInt, MAX_TIMEOUTS_BEFORE_SITOUT,
  showCards, newTournament, blindLevel, structure, isTourney, reenter, declineReentry, reentryOpen,
};
}));
