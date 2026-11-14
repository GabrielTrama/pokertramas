'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../www/engine.js');

/* Nos testes antigos, o all-in termina na hora: estas versões completam a "virada" da mesa sozinhas. */
const _act = G.act, _tick = G.tick, _start = G.startHand;
const finishRunout = (st, ctx, r) => { let g = 0; while (st.runout && g++ < 10) _tick(st, ctx, st.runout.nextAt, r); };
G.act = (st, ctx, uid, action, amount, now) => { _act(st, ctx, uid, action, amount, now); finishRunout(st, ctx); };
G.tick = (st, ctx, now, r) => { const res = _tick(st, ctx, now, r); finishRunout(st, res && res.ctx ? res.ctx : ctx, r); return res; };
G.startHand = (st, now, r) => { const c = _start(st, now, r); finishRunout(st, c, r); return c; };

const h = (s) => s.split(' ');
const best = (s) => G.bestHand(h(s));

test('categorias de mãos', () => {
  assert.equal(best('As Ks Qs Js Ts 2d 3c').name, 'Royal flush');
  assert.equal(best('9h 8h 7h 6h 5h Ad Kc').name, 'Straight flush');
  assert.equal(best('9c 9d 9h 9s 2c 3d 4h').name, 'Quadra');
  assert.equal(best('Kc Kd Kh 2s 2c 3d 4h').name, 'Full house');
  assert.equal(best('Ac 9c 7c 4c 2c Kd Qh').name, 'Flush');
  assert.equal(best('Ac 2d 3h 4s 5c Kd Kh').name, 'Sequência');
  assert.equal(best('Tc Jd Qh Ks Ac 2d 2h').name, 'Sequência');
  assert.equal(best('7c 7d 7h Ks 2c 3d 9h').name, 'Trinca');
  assert.equal(best('7c 7d 9h 9s 2c 3d Ah').name, 'Dois pares');
  assert.equal(best('7c 7d 9h Js 2c 3d Ah').name, 'Par');
  assert.equal(best('7c 4d 9h Js 2c 3d Ah').name, 'Carta alta');
});

test('desempates', () => {
  const cmp = (a, b) => Math.sign(best(a).score - best(b).score);
  // roda (A-5) perde para 6-alta
  assert.equal(cmp('Ac 2d 3h 4s 5c Kd 9h', '6c 2d 3h 4s 5c Kd 9h'), -1);
  // kicker
  assert.equal(cmp('Ac Ad Kh 7s 5c 3d 2h', 'As Ah Qh 7d 5h 3c 2s'), 1);
  // mesa joga: empate
  assert.equal(cmp('2c 3d As Ks Qs Js Ts', '4h 5h As Ks Qs Js Ts'), 0);
  // dois pares com melhor terceiro par ignorado: só os 2 maiores + kicker
  assert.equal(cmp('Ac Ad Kc Kd Qc Qd 2s', 'Ah As Kh Ks Jh Jd Qs'), 0);
  // flush maior
  assert.equal(cmp('Ah 2h 5h 7h 9h Kc Qd', 'Kh Qh 5h 7h 9h Ac Ad'), 1);
  // full house: trinca maior vence
  assert.equal(cmp('3c 3d 3h 2s 2c Kd 9h', '2c 2d 2h As Ac Kd 9h'), 1);
});

test('baralho completo e sem repetição após embaralhar', () => {
  const d = G.shuffle(G.newDeck());
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
});

test('potes paralelos', () => {
  const seats = [
    { committed: 100, inHand: true, folded: false },
    { committed: 300, inHand: true, folded: false },
    { committed: 300, inHand: true, folded: false },
    { committed: 50, inHand: true, folded: true },
    null,
  ];
  const pots = G.buildPots(seats);
  assert.deepEqual(pots, [
    { amount: 350, eligible: [0, 1, 2], contributors: 4 },
    { amount: 400, eligible: [1, 2], contributors: 2 },
  ]);
});

/* ---------- helpers de mesa ---------- */
function table(n, stacks, extra = {}) {
  const st = G.createRoomState('ABCDE', 'u0', 'P0', { mode: 'cash', startingStack: 1000, smallBlind: 10, bigBlind: 20, timeBankSeconds: 0, ...extra });
  for (let i = 1; i < n; i++) G.addPlayer(st, 'u' + i, 'P' + i);
  if (stacks) stacks.forEach((v, i) => { st.seats[i].stack = v; });
  return st;
}
// randInt determinístico: sem embaralhar (deck em ordem 2s 2h 2d 2c 3s ...)
const noShuffle = () => (n) => n - 1;

test('heads-up: botão posta SB e age primeiro no pré-flop, último depois', () => {
  const st = table(2);
  const ctx = G.startHand(st, 0, noShuffle());
  assert.equal(st.dealer, 0);
  assert.equal(st.sbSeat, 0);
  assert.equal(st.bbSeat, 1);
  assert.equal(st.toAct, 0);
  G.act(st, ctx, 'u0', 'call');
  assert.equal(st.toAct, 1); // BB tem a opção
  G.act(st, ctx, 'u1', 'check');
  assert.equal(st.phase, 'flop');
  assert.equal(st.toAct, 1); // BB age primeiro pós-flop
});

test('3 jogadores: ordem e opção do BB', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  assert.deepEqual([st.dealer, st.sbSeat, st.bbSeat, st.toAct], [0, 1, 2, 0]);
  G.act(st, ctx, 'u0', 'call');
  G.act(st, ctx, 'u1', 'call');
  assert.equal(st.toAct, 2);
  assert.equal(G.legalActions(st, 2).canRaise, true);
  G.act(st, ctx, 'u2', 'raise', 60);
  assert.equal(st.toAct, 0);
  assert.throws(() => G.act(st, ctx, 'u0', 'raise', 80), /mínimo/); // min 100
  G.act(st, ctx, 'u0', 'raise', 100);
  G.act(st, ctx, 'u1', 'fold');
  G.act(st, ctx, 'u2', 'call');
  assert.equal(st.phase, 'flop');
  assert.equal(st.board.length, 3);
  assert.equal(st.toAct, 2); // primeiro ativo depois do botão
});

test('fora da vez não pode agir', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  assert.throws(() => G.act(st, ctx, 'u1', 'call'), /vez/);
});

test('all-in curto não reabre aumento', () => {
  const st = table(3, [1000, 1000, 130]);
  const ctx = G.startHand(st, 0, noShuffle()); // botão 0, SB 1, BB 2 (130)
  G.act(st, ctx, 'u0', 'raise', 100);  // aumento de 80
  G.act(st, ctx, 'u1', 'call');
  // BB vai all-in para 130 (aumento de 30 < 80): incompleto
  G.act(st, ctx, 'u2', 'raise', 130);
  assert.equal(st.toAct, 0);
  const la = G.legalActions(st, 0);
  assert.equal(la.canRaise, false);
  assert.equal(la.toCall, 30);
  G.act(st, ctx, 'u0', 'call');
  G.act(st, ctx, 'u1', 'call');
  assert.equal(st.phase, 'flop');
});

test('todos desistem: ganhador leva sem mostrar cartas', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'fold');
  G.act(st, ctx, 'u1', 'fold');
  assert.equal(st.phase, 'showdown');
  assert.equal(st.seats[2].stack, 1010);
  assert.equal(st.seats[2].shown, null);
});

test('all-in pré-flop roda a mesa até o river', () => {
  const st = table(2);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'raise', 1000);
  G.act(st, ctx, 'u1', 'call');
  assert.equal(st.phase, 'showdown');
  assert.equal(st.board.length, 5);
  assert.equal(st.seats[0].stack + st.seats[1].stack, 2000);
  assert.ok(st.seats[0].shown && st.seats[1].shown);
});

test('aposta não paga volta como "devolvido"', () => {
  const st = table(2, [1000, 500]);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'raise', 1000); // all-in de 1000 contra 500
  G.act(st, ctx, 'u1', 'call');
  const ret = st.results.find((r) => r.returned);
  assert.ok(ret && ret.amount === 500 && ret.winners[0].seat === 0, JSON.stringify(st.results));
  assert.equal(st.seats[0].stack + st.seats[1].stack, 1500);
});

test('30 s sem jogar: passa/desiste e fica offline; offline joga na hora', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  assert.equal(st.settings.turnSeconds, 30);
  assert.equal(st.seats[0].timeBank, 0);
  assert.equal(st.deadline, 30000);
  assert.equal(G.tick(st, ctx, 29999), null);
  G.tick(st, ctx, 30000);
  assert.equal(st.seats[0].folded, true);
  assert.equal(st.seats[0].sitOut, true);
  // u1 (SB) fica offline por vontade própria: na vez dele joga sozinho, sem esperar
  G.setSitOut(st, 'u1', true);
  assert.equal(st.toAct, 1);
  G.tick(st, ctx, 30001);
  assert.equal(st.seats[1].folded, true);
  assert.equal(st.phase, 'showdown');
  // offline não entra na próxima mão; voltando, entra
  G.setSitOut(st, 'u0', false);
  G.tick(st, ctx, st.nextHandAt);
  assert.equal(st.seats[0].inHand, true);
  assert.equal(st.seats[1].inHand, false);
});

test('próxima mão só depois do intervalo e botão gira', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'fold');
  G.act(st, ctx, 'u1', 'fold');
  assert.equal(G.tick(st, ctx, st.nextHandAt - 1), null);
  const r = G.tick(st, ctx, st.nextHandAt);
  assert.equal(r.type, 'nexthand');
  assert.equal(st.dealer, 1);
  assert.equal(st.handNumber, 2);
});

test('sair no meio da mão: desiste e libera o lugar no fim', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  G.removePlayer(st, ctx, 'u2'); // BB, fora da vez
  assert.equal(st.seats[2].folded, true);
  assert.equal(st.toAct, 0);
  G.act(st, ctx, 'u0', 'fold'); // sobra só u1
  assert.equal(st.phase, 'showdown');
  assert.equal(st.seats[1].stack, 1020);
  G.tick(st, ctx, st.nextHandAt);
  assert.equal(st.seats[2], null);
  assert.equal(G.totalChips(st), 2020); // u2 saiu deixando 20 no pote
});

test('anfitrião sai: outro assume', () => {
  const st = table(3);
  G.removePlayer(st, null, 'u0');
  assert.equal(st.hostUid, 'u1');
});

/* ---------- simulação aleatória ---------- */
test('simulação: 20 mil mãos aleatórias mantêm as fichas e o estado válido', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const randInt = (n) => Math.floor(rnd() * n);
  let showdowns = 0; let sidepots = 0; let splits = 0;

  for (let game = 0; game < 400; game++) {
    const n = 2 + randInt(8);
    const st = table(n);
    st.seats.forEach((s) => { if (s) s.stack = 40 + randInt(2000); });
    let total = G.totalChips(st);
    let now = 0;
    for (let hand = 0; hand < 50; hand++) {
      if (st.seats.filter((x) => G.canPlayNextHand(st, x)).length < 2) {
        // recompra para continuar
        for (const s of st.seats) if (s && s.stack === 0) { G.rebuy(st, s.uid); total += 1000; }
      }
      const ctx = G.startHand(st, now, randInt);
      assert.equal(G.totalChips(st), total, 'fichas após blinds');
      let guard = 0;
      while (G.handActive(st)) {
        assert.ok(guard++ < 500, 'loop infinito');
        const i = st.toAct;
        const s = st.seats[i];
        assert.ok(s && s.inHand && !s.folded && !s.allIn, 'jogador da vez inválido');
        const la = G.legalActions(st, i);
        const r = rnd();
        if (r < 0.03) { now = st.deadline; G.tick(st, ctx, now); continue; }
        if (r < 0.15 && !la.canCheck) G.act(st, ctx, s.uid, 'fold', 0, now);
        else if (r < 0.35 && la.canRaise) {
          const to = la.minRaiseTo + randInt(la.maxRaiseTo - la.minRaiseTo + 1);
          G.act(st, ctx, s.uid, 'raise', r < 0.2 ? la.maxRaiseTo : to, now);
        } else G.act(st, ctx, s.uid, 'call', 0, now);
        for (const x of st.seats) if (x) assert.ok(x.stack >= 0 && Number.isInteger(x.stack));
        if (G.handActive(st)) assert.equal(G.totalChips(st), total, 'fichas no meio da mão');
      }
      assert.equal(G.totalChips(st), total, 'fichas após a mão');
      if (st.board.length === 5 && st.seats.filter((x) => x && x.shown).length > 1) showdowns++;
      if (st.results.length > 1) sidepots++;
      if (st.results.some((p) => p.winners.length > 1)) splits++;
      // usado: todas as cartas distintas
      const used = [...st.board, ...Object.values(ctx.hands).flat()];
      assert.equal(new Set(used).size, used.length);
      for (const x of st.seats) if (x) { x.sitOut = false; x.timeouts = 0; }
      now = st.nextHandAt;
    }
  }
  assert.ok(showdowns > 1000 && sidepots > 100 && splits > 10, `cobertura: ${showdowns}/${sidepots}/${splits}`);
});


/* ===================== novidades ===================== */

test('padrão: torneio, 20.000 fichas, 100/200 com ante 30, 8 min, banco 60 s, reentrada até o nível 8', () => {
  const st = G.createRoomState('X', 'a', 'A', {});
  assert.equal(st.settings.mode, 'torneio');
  assert.equal(st.settings.startingStack, 20000);
  assert.deepEqual([st.blinds.sb, st.blinds.bb, st.blinds.ante, st.settings.levelMinutes], [100, 200, 30, 8]);
  assert.equal(st.settings.reentryLevels, 8);
  assert.equal(st.seats[0].timeBank, 60000);
  assert.equal(st.settings.allowRebuy, false);
});

test('estrutura igual à tabela: 8 min até 400/800, depois 5 min', () => {
  const st = G.createRoomState('X', 'a', 'A', {});
  const t = G.structure(st);
  const fmt = (l) => `${l.sb}/${l.bb}/${l.ante}/${l.ms / 60000}`;
  assert.deepEqual(t.slice(0, 11).map(fmt), [
    '100/200/30/8', '125/250/35/8', '150/300/45/8', '200/400/60/8', '250/500/75/8', '300/600/90/8',
    '350/700/100/8', '400/800/120/8', '500/1000/150/5', '600/1200/180/5', '750/1500/200/5']);
});

test('banco de tempo: entra quando os 30 s acabam e desconta o que usou', () => {
  const st = table(3, null, { timeBankSeconds: 60 });
  const ctx = G.startHand(st, 0, noShuffle());
  assert.equal(G.tick(st, ctx, 30000).type, 'bank');
  assert.equal(st.usingBank, true);
  assert.equal(st.deadline, 90000);
  assert.equal(st.seats[0].folded, false);
  G.act(st, ctx, 'u0', 'call', 0, 50000);
  assert.equal(st.seats[0].timeBank, 40000);
  assert.equal(st.usingBank, false);
  assert.equal(st.deadline, 80000);
});

test('banco de tempo esgotado: joga sozinho e fica offline', () => {
  const st = table(3, null, { timeBankSeconds: 60 });
  const ctx = G.startHand(st, 0, noShuffle());
  G.tick(st, ctx, 30000);
  G.tick(st, ctx, 90000);
  assert.equal(st.seats[0].folded, true);
  assert.equal(st.seats[0].sitOut, true);
  assert.equal(st.seats[0].timeBank, 0);
});

test('mostrar ou esconder: vencedor sem showdown pode mostrar', () => {
  const st = table(3);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'fold');
  G.act(st, ctx, 'u1', 'fold');
  assert.deepEqual(st.showOffer, { seat: 2, handNumber: 1 });
  assert.throws(() => G.showCards(st, ctx, 'u0'), /mostrar/);
  G.showCards(st, ctx, 'u2');
  assert.deepEqual(st.seats[2].shown, ctx.hands.u2);
  assert.equal(st.showOffer, null);
});

test('estatísticas: mãos vencidas, maior pote e melhor mão', () => {
  const st = table(2);
  const ctx = G.startHand(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'raise', 1000);
  G.act(st, ctx, 'u1', 'call');
  const winner = st.results[0].winners[0];
  assert.equal(st.stats[st.seats[winner.seat].uid].handsWon, 1);
  assert.equal(st.stats.u0.handsPlayed, 1);
  assert.equal(st.records.biggestPot.amount, 2000);
  assert.ok(st.records.bestHand && st.records.bestHand.by === winner.name);
});

function tourney(n, extra = {}) {
  const st = G.createRoomState('T', 'u0', 'P0', { timeBankSeconds: 0, reentryLevels: 0, ...extra });
  for (let i = 1; i < n; i++) G.addPlayer(st, 'u' + i, 'P' + i);
  return st;
}

test('torneio: antes e blinds; nível sobe pelo relógio e vale na mão seguinte', () => {
  const st = tourney(3);
  let ctx = G.startHand(st, 0, noShuffle());
  assert.equal(G.totalChips(st), 60000);
  // todos pagaram ante 30; SB 100, BB 200
  assert.deepEqual(st.seats.slice(0, 3).map((s) => s.committed), [30, 130, 230]);
  assert.equal(st.tourney.nextLevelAt, 8 * 60000);
  G.act(st, ctx, 'u0', 'fold', 0, 1000);
  G.act(st, ctx, 'u1', 'fold', 0, 1000);
  ctx = G.tick(st, ctx, 8 * 60000 + 1).ctx;
  assert.deepEqual([st.blinds.sb, st.blinds.bb, st.blinds.ante, st.blinds.level], [125, 250, 35, 1]);
  assert.ok(st.log.some((l) => l.includes('Blinds subiram para 125/250 (ante 35)')));
  // nível 9 (500/1000) começa em 64 min e dura 5 min
  G.act(st, ctx, st.seats[st.toAct].uid, 'fold', 0, 8 * 60000 + 2);
  if (G.handActive(st)) G.act(st, ctx, st.seats[st.toAct].uid, 'fold', 0, 8 * 60000 + 3);
  ctx = G.tick(st, ctx, 64 * 60000 + 1).ctx;
  assert.equal(st.blinds.bb, 1000);
  assert.equal(st.tourney.nextLevelAt, 69 * 60000);
});

test('torneio sem reentrada: eliminação, pódio, quem chega assiste, novo torneio', () => {
  const st = tourney(3);
  st.seats[1].stack = 300; st.seats[2].stack = 200;
  const ctx = G.startHand(st, 0, noShuffle());
  assert.throws(() => G.addPlayer(st, 'novo', 'Novo'), (e) => e instanceof G.SpectatorError);
  G.act(st, ctx, 'u0', 'raise', 5000);
  if (G.handActive(st)) G.act(st, ctx, 'u1', 'call');
  assert.equal(st.phase, 'showdown');
  const alive = st.seats.filter((s) => s && s.stack > 0);
  if (alive.length === 1) {
    assert.equal(st.tourney.finished, true);
    assert.deepEqual(st.tourney.places.map((p) => p.place), [1, 2, 3]);
    assert.equal(st.stats[alive[0].uid].tourneyWins, 1);
    G.newTournament(st);
    assert.ok(st.seats.every((s) => !s || (s.stack === 20000 && !s.eliminated && s.rebuys === 0)));
    G.addPlayer(st, 'novo', 'Novo');
  }
});

test('reentrada: quem quebra volta com 20.000 e conta reentradas; depois do nível 8 é eliminado', () => {
  const st = tourney(3, { reentryLevels: 8 });
  st.seats[2].stack = 230; // só dá para ante + BB
  let ctx = G.startHand(st, 0, noShuffle());
  ctx.hands.u1 = ['As', 'Ad']; ctx.hands.u2 = ['7c', '8d'];
  G.act(st, ctx, 'u0', 'fold', 0, 10);
  G.act(st, ctx, 'u1', 'raise', 1000, 10); // u2 já está all-in no BB
  assert.equal(st.phase, 'showdown');
  const u2 = st.seats[2];
  assert.equal(u2.stack, 0);
  {
    assert.equal(u2.waitingReentry, true);
    assert.equal(u2.eliminated, false);
    assert.equal(st.tourney.finished, false);
    G.reenter(st, 'u2', 20);
    assert.equal(u2.stack, 20000);
    assert.equal(u2.rebuys, 1);
    // quebra de novo depois que a reentrada fechou → eliminado
    u2.stack = 230;
    ctx = G.tick(st, ctx, 70 * 60000).ctx;
    while (G.handActive(st)) {
      const s = st.seats[st.toAct]; const la = G.legalActions(st, st.toAct);
      G.act(st, ctx, s.uid, la.canRaise && s.uid !== 'u2' ? 'raise' : 'call', la.maxRaiseTo, 70 * 60000);
    }
    if (u2.stack === 0) {
      assert.equal(u2.eliminated, true);
      assert.throws(() => G.reenter(st, 'u2', 70 * 60000), /reentrar|fechou/);
    }
  }
});

test('reentrada fecha pelo relógio com o jogo parado esperando', () => {
  const st = tourney(2, { reentryLevels: 1 });
  st.seats[1].stack = 230;
  const ctx = G.startHand(st, 0, noShuffle());
  ctx.hands.u0 = ['As', 'Ad']; ctx.hands.u1 = ['7c', '8d']; // u0 ganha com certeza
  G.act(st, ctx, 'u0', 'raise', 5000, 10);
  if (G.handActive(st)) G.act(st, ctx, 'u1', 'call', 0, 10);
  const loser = st.seats.find((s) => s && s.stack === 0);
  assert.ok(loser.waitingReentry);
  assert.equal(G.tick(st, ctx, st.nextHandAt).type, 'waiting'); // só um com fichas: espera
  assert.equal(st.tourney.finished, false);
  assert.equal(G.tick(st, ctx, 8 * 60000 + 1).type, 'reentry-closed');
  assert.equal(st.tourney.finished, true);
  assert.deepEqual(st.tourney.places.map((p) => p.place), [1, 2]);
});

test('cash: depois da recompra o jogo recomeça sozinho', () => {
  const st = table(2);
  const ctx = G.startHand(st, 0, noShuffle());
  ctx.hands.u0 = ['As', 'Ad']; ctx.hands.u1 = ['7c', '8d'];
  G.act(st, ctx, 'u0', 'raise', 1000);
  G.act(st, ctx, 'u1', 'call');
  const broke = st.seats.find((s) => s && s.stack === 0);
  assert.ok(broke);
  {
    assert.equal(G.tick(st, ctx, st.nextHandAt).type, 'waiting');
    G.rebuy(st, broke.uid);
    assert.equal(G.tick(st, ctx, st.nextHandAt + 1).type, 'nexthand');
  }
});

test('torneio offline continua recebendo cartas e desiste sozinho', () => {
  const st = tourney(3);
  G.setSitOut(st, 'u1', true);
  const ctx = G.startHand(st, 0, noShuffle());
  assert.equal(st.seats[1].inHand, true);
  G.act(st, ctx, 'u0', 'call', 0, 10);
  assert.equal(st.toAct, 1);
  G.tick(st, ctx, 11);
  assert.equal(st.seats[1].folded, true);
});

test('torneio heads-up: se os dois jogadores ficam offline, o jogo pausa (não fica queimando blind sozinho)', () => {
  const st = tourney(2);
  const ctx = G.startHand(st, 0, noShuffle());
  G.setSitOut(st, 'u0', true);
  G.setSitOut(st, 'u1', true);
  assert.equal(G.headsUpBothOffline(st), true);
  // a mão em andamento termina sozinha (auto check/fold), e aí o jogo pausa em vez de recomeçar
  let now = 0, t = null, guard = 0;
  while (st.phase !== 'waiting' && guard++ < 50) { now += 2000; t = G.tick(st, ctx, now); }
  assert.equal(st.phase, 'waiting');
  assert.equal(st.headsUpPaused, true);
  assert.equal(st.handNumber, 1); // não iniciou uma segunda mão sozinho
  // volta um dos dois: o jogo recomeça sozinho de novo
  G.setSitOut(st, 'u0', false);
  const r = G.tick(st, ctx, now + 2000);
  assert.equal(r.type, 'nexthand');
  assert.equal(st.headsUpPaused, false);
  assert.equal(st.handNumber, 2);
});

test('pausa por votação: maioria aprova, começa quando a mão termina e o relógio do torneio fica parado', () => {
  const st = tourney(3);
  let ctx = G.startHand(st, 0, noShuffle());
  assert.throws(() => G.proposePause(st, 'u0', 7, 100), /5, 10 ou 15/);
  G.proposePause(st, 'u0', 10, 100);
  assert.equal(st.pauseVote.minutes, 10);
  assert.throws(() => G.proposePause(st, 'u1', 5, 150), /votação aberta/);
  G.votePause(st, 'u1', true, 200); // 2 de 3
  assert.equal(st.pauseVote, null);
  assert.equal(st.pause.minutes, 10);
  assert.equal(st.pause.startedAt, 0); // ainda não começou: a mão está rolando
  const startedAt = st.tourney.startedAt;
  G.setSitOut(st, 'u0', true); G.setSitOut(st, 'u1', true); G.setSitOut(st, 'u2', true);
  let now = 1000, g = 0;
  while (!G.pauseActive(st) && g++ < 80) { now += 2000; const r = G.tick(st, ctx, now); if (r && r.ctx) ctx = r.ctx; }
  assert.equal(G.pauseActive(st), true);
  assert.equal(st.handNumber, 1);
  G.setSitOut(st, 'u0', false); G.setSitOut(st, 'u1', false); G.setSitOut(st, 'u2', false);
  const began = st.pause.startedAt;
  assert.equal(G.tick(st, ctx, began + 9 * 60000), null); // segue parado
  assert.equal(st.handNumber, 1);
  const r = G.tick(st, ctx, began + 10 * 60000);
  assert.equal(r.type, 'pauseend');
  assert.equal(st.pause, null);
  assert.equal(st.tourney.startedAt, startedAt + 10 * 60000);
  const r2 = G.tick(st, ctx, began + 10 * 60000 + 500);
  assert.equal(r2.type, 'nexthand');
});

test('pausa por votação: recusada pela maioria ou pelo tempo; "voltar agora" encerra antes', () => {
  const st = tourney(4);
  const ctx = G.startHand(st, 0, noShuffle());
  G.proposePause(st, 'u0', 5, 0);
  G.votePause(st, 'u1', false, 10);
  assert.ok(st.pauseVote);
  G.votePause(st, 'u2', false, 20); // 2 contra de 4: não tem mais como passar
  assert.equal(st.pauseVote, null);
  assert.equal(st.pause, undefined);
  assert.throws(() => G.proposePause(st, 'u0', 5, 1000), /Espere um pouco/);
  G.proposePause(st, 'u1', 15, 70000);
  G.tick(st, ctx, 70000 + 31000); // ninguém mais votou
  assert.equal(st.pauseVote, null);
  assert.ok(!st.pause);
  // aprovada com o jogo parado: começa na hora e acaba quando todos tocam em "voltar agora"
  const s2 = tourney(2);
  s2.started = true; s2.phase = 'waiting';
  G.proposePause(s2, 'u0', 5, 0); G.votePause(s2, 'u1', true, 1);
  G.tick(s2, {}, 10);
  assert.equal(G.pauseActive(s2), true);
  G.readyPause(s2, 'u0', 20);
  assert.equal(G.pauseActive(s2), true);
  G.readyPause(s2, 'u1', 30);
  assert.equal(s2.pause, null);
});

test('simulação de torneios (com e sem reentrada): sempre termina com campeão e pódio completo', () => {
  let seed = 777;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const randInt = (n) => Math.floor(rnd() * n);
  for (let g = 0; g < 80; g++) {
    const n = 2 + randInt(8);
    const reentry = g % 2 ? 3 : 0;
    const st = tourney(n, { levelMinutes: 1, reentryLevels: reentry });
    let total = G.totalChips(st);
    let now = 0;
    let ctx = G.startHand(st, now, randInt);
    let guard = 0;
    while (!st.tourney.finished) {
      assert.ok(guard++ < 40000, 'torneio não termina');
      now += 4000;
      for (const s of st.seats) {
        if (s && s.waitingReentry && G.reentryOpen(st, now) && rnd() < 0.5) { G.reenter(st, s.uid, now); total += 20000; }
      }
      if (G.handActive(st)) {
        const i = st.toAct; const s = st.seats[i];
        const la = G.legalActions(st, i);
        const r = rnd();
        if (r < 0.3 && la.canRaise) G.act(st, ctx, s.uid, 'raise', la.maxRaiseTo, now);
        else if (r < 0.45 && !la.canCheck) G.act(st, ctx, s.uid, 'fold', 0, now);
        else G.act(st, ctx, s.uid, 'call', 0, now);
        if (G.handActive(st)) assert.equal(G.totalChips(st), total);
      } else {
        const r = G.tick(st, ctx, Math.max(now, st.nextHandAt || 0), randInt);
        if (r && r.ctx) ctx = r.ctx;
      }
    }
    assert.equal(G.totalChips(st), total);
    const places = st.tourney.places.map((p) => p.place);
    assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1), JSON.stringify(st.tourney.places));
  }
});

test('cash começa com 5.000 fichas; torneio com 20.000', () => {
  const cash = G.createRoomState('C', 'a', 'A', { mode: 'cash' });
  assert.equal(cash.settings.startingStack, 5000);
  assert.equal(cash.seats[0].stack, 5000);
  assert.equal(cash.settings.allowRebuy, true);
  const t = G.createRoomState('T', 'a', 'A', {});
  assert.equal(t.settings.startingStack, 20000);
  const custom = G.createRoomState('C', 'a', 'A', { mode: 'cash', startingStack: 8000 });
  assert.equal(custom.settings.startingStack, 8000);
});


/* ===================== all-in: cartas abertas e porcentagem ===================== */

test('all-in: abre as cartas, vira a mesa por etapas e calcula a chance', () => {
  const st = table(3);
  const ctx = _start(st, 0, noShuffle());
  _act(st, ctx, 'u0', 'raise', 1000, 10);
  _act(st, ctx, 'u1', 'call', 0, 20);
  _act(st, ctx, 'u2', 'call', 0, 30);
  assert.ok(st.runout, 'deveria entrar no modo all-in');
  assert.equal(st.phase, 'preflop');
  assert.equal(st.board.length, 0);
  assert.equal(st.toAct, -1);
  for (const s of st.seats.slice(0, 3)) assert.deepEqual(s.shown, ctx.hands[s.uid]);
  assert.throws(() => _act(st, ctx, 'u0', 'check', 0, 40), /vez/);
  const eq = G.equity(st, ctx, 2000);
  const sum = Object.values(eq).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1, `soma ${sum}`);
  assert.equal(_tick(st, ctx, st.runout.nextAt - 1), null);
  _tick(st, ctx, st.runout.nextAt); assert.equal(st.board.length, 3);
  _tick(st, ctx, st.runout.nextAt); assert.equal(st.board.length, 4);
  _tick(st, ctx, st.runout.nextAt); assert.equal(st.board.length, 5);
  assert.ok(st.runout && G.handActive(st));
  const final = G.equity(st, ctx);
  assert.ok(Object.values(final).every((v) => v === 0 || v === 100 || v % 1 >= 0));
  _tick(st, ctx, st.runout.nextAt);
  assert.equal(st.phase, 'showdown');
  assert.equal(st.runout, null);
  assert.equal(G.totalChips(st), 3000);
});

test('porcentagem: casos conhecidos', () => {
  const mk = (board, a, b, c) => {
    const st = table(c ? 3 : 2);
    st.board = board ? board.split(' ') : [];
    st.seats.forEach((s) => { if (s) { s.inHand = true; s.folded = false; } });
    const ctx = { hands: { u0: a.split(' '), u1: b.split(' '), ...(c ? { u2: c.split(' ') } : {}) } };
    return G.equity(st, ctx, 20000);
  };
  // AA x KK pré-flop ≈ 82% (sorteio: margem de ±1,5)
  let e = mk('', 'As Ah', 'Ks Kh');
  assert.ok(Math.abs(e[0] - 82) < 1.5, JSON.stringify(e));
  // flop exato: AK x 22 em K-7-3 → AK tem ~91%
  e = mk('Kd 7c 3h', 'As Kc', '2s 2d');
  assert.ok(e[0] > 88 && e[0] < 93, JSON.stringify(e));
  // river: resultado definido
  e = mk('Kd 7c 3h 9s 4d', 'As Kc', '2s 2d');
  assert.deepEqual(e, { 0: 100, 1: 0 });
  // mesa joga para os dois: 50/50
  e = mk('As Ks Qs Js Ts', '2c 3d', '4h 5c');
  assert.deepEqual(e, { 0: 50, 1: 50 });
  // três jogadores no turn (exato), soma 100
  e = mk('Qh 8c 5d 2s', 'Ah Kh', 'Qc Jc', '8h 8d');
  assert.ok(Math.abs(e[0] + e[1] + e[2] - 100) < 0.5, JSON.stringify(e));
  assert.ok(e[2] > 90, JSON.stringify(e));
});

test('jogador sai no meio do all-in: o resto continua normalmente', () => {
  const st = table(3, [1000, 300, 1000]);
  const ctx = _start(st, 0, noShuffle());
  _act(st, ctx, 'u0', 'call', 0, 10);
  _act(st, ctx, 'u1', 'raise', 300, 20); // all-in curto
  _act(st, ctx, 'u2', 'call', 0, 30);
  _act(st, ctx, 'u0', 'call', 0, 40);
  // u0 e u2 ainda podem apostar no flop: não é runout
  assert.equal(st.runout || null, null);
  assert.equal(st.phase, 'flop');
});

test('mostrar uma carta só, depois a outra', () => {
  const st = table(3);
  const ctx = _start(st, 0, noShuffle());
  _act(st, ctx, 'u0', 'fold', 0, 1);
  _act(st, ctx, 'u1', 'fold', 0, 2);
  const [c0, c1] = ctx.hands.u2;
  assert.throws(() => G.showCards(st, ctx, 'u2', 2), /Escolha/);
  G.showCards(st, ctx, 'u2', 1);
  assert.deepEqual(st.seats[2].shown, [null, c1]);
  assert.ok(st.showOffer, 'ainda pode mostrar a outra');
  assert.ok(st.log.some((l) => l.includes('mostrou uma carta')));
  G.showCards(st, ctx, 'u2', 0);
  assert.deepEqual(st.seats[2].shown, [c0, c1]);
  assert.equal(st.showOffer, null);
  assert.throws(() => G.showCards(st, ctx, 'u2', 'both'), /mostrar agora/);
  // nova mão limpa o que foi mostrado
  _tick(st, ctx, st.nextHandAt);
  assert.equal(st.seats[2].shown, null);
});

test('todos desistem: revela automaticamente a próxima rua (sem mudar o resultado)', () => {
  // pré-flop → flop
  let st = table(3);
  let ctx = _start(st, 0, noShuffle());
  const deck = ctx.deck.slice();
  _act(st, ctx, 'u0', 'fold', 0, 1); _act(st, ctx, 'u1', 'fold', 0, 2);
  assert.deepEqual(st.board, []);
  assert.deepEqual(st.rabbit, deck.slice(1, 4)); // queima 1, mostra 3
  // flop → turn
  st = table(3); ctx = _start(st, 0, noShuffle());
  _act(st, ctx, 'u0', 'call', 0, 1); _act(st, ctx, 'u1', 'call', 0, 2); _act(st, ctx, 'u2', 'check', 0, 3);
  assert.equal(st.board.length, 3);
  const d2 = ctx.deck.slice();
  const first = st.seats[st.toAct].uid;
  _act(st, ctx, first, 'raise', 100, 4);
  for (const uid of ['u0', 'u1', 'u2']) if (G.handActive(st) && st.seats[st.toAct].uid === uid) _act(st, ctx, uid, 'fold', 0, 5);
  while (G.handActive(st)) _act(st, ctx, st.seats[st.toAct].uid, 'fold', 0, 6);
  assert.equal(st.board.length, 3);
  assert.deepEqual(st.rabbit, d2.slice(1, 2));
  // nova mão limpa
  _tick(st, ctx, st.nextHandAt);
  assert.equal(st.rabbit, null);
  // showdown normal não revela nada extra
  st = table(2); ctx = _start(st, 0, noShuffle());
  G.act(st, ctx, 'u0', 'raise', 1000, 1); G.act(st, ctx, 'u1', 'call', 0, 2);
  assert.equal(st.board.length, 5);
  assert.equal(st.rabbit, null);
});

/* ===================== Spin & Gold, straddle, bomb pot ===================== */

test('Spin & Gold: formato fixo, sorteio, começa depois da roleta e gera resultado', () => {
  const st = G.createRoomState('S', 'u0', 'P0', { mode: 'spin', startingStack: 99999, bigBlind: 999, spinPreset: 'gg' });
  for (let i = 1; i < 4; i++) G.addPlayer(st, 'u' + i, 'P' + i);
  assert.deepEqual([st.settings.startingStack, st.blinds.sb, st.blinds.bb, st.blinds.ante, st.settings.levelMinutes], [500, 10, 20, 0, 3]);
  assert.equal(st.settings.reentryLevels, 0);
  assert.equal(st.settings.spinPreset, 'gg');
  assert.equal(G.blindLevel(st, 1).bb, 30);
  const mult = G.drawSpin(st, 1000, () => 0.5);
  assert.equal(mult, 2);
  assert.equal(st.startAt, 1000 + G.SPIN.revealMs);
  assert.throws(() => G.drawSpin(st, 1000), /já começou/);
  assert.equal(G.tick(st, null, st.startAt - 1), null);
  const r = _tick(st, null, st.startAt);
  assert.equal(r.type, 'nexthand');
  assert.equal(st.started, true);
  // joga até o fim
  let ctx = r.ctx, now = st.startAt, guard = 0;
  while (!st.tourney.finished && guard++ < 5000) {
    now += 1000;
    if (G.handActive(st) && st.toAct >= 0) {
      const la = G.legalActions(st, st.toAct);
      G.act(st, ctx, st.seats[st.toAct].uid, la.canRaise ? 'raise' : 'call', la.maxRaiseTo, now);
    } else {
      const x = G.tick(st, ctx, Math.max(now, st.nextHandAt || 0));
      if (x && x.ctx) ctx = x.ctx;
    }
  }
  assert.ok(st.tourney.finished);
  const res = st.tourney.result;
  assert.equal(res.mode, 'spin');
  assert.equal(res.mult, 2);
  assert.equal(res.players.length, 4);
  assert.equal(res.players[0].place, 1);
  G.newTournament(st);
  assert.equal(st.spin, null);
});

test('sorteio do Spin segue as chances do preset', () => {
  const count = (preset) => {
    const st = G.createRoomState('S', 'a', 'A', { mode: 'spin', spinPreset: preset });
    G.addPlayer(st, 'b', 'B');
    const c = {};
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 20000; i++) { st.started = false; st.startAt = 0; const m = G.drawSpin(st, 0, rnd); c[m] = (c[m] || 0) + 1; }
    return c;
  };
  const a = count('amigos');
  assert.deepEqual(Object.keys(a).map(Number).sort((x, y) => x - y), [2, 3, 5, 10]);
  assert.ok(Math.abs(a[2] / 200 - 60) < 2 && Math.abs(a[10] / 200 - 3) < 1, JSON.stringify(a));
  const g = count('gg');
  assert.ok(Math.abs(g[2] / 200 - 75) < 2, JSON.stringify(g));
});

test('straddle: UTG põe 2 BB, a ação começa depois dele e ele fala por último', () => {
  const st = table(4); // botão 0, SB 1, BB 2, UTG 3
  G.setStraddle(st, 'u3', true);
  const ctx = _start(st, 0, noShuffle());
  assert.equal(st.seats[3].bet, 40);
  assert.equal(st.seats[3].lastAction, 'Straddle');
  assert.equal(st.currentBet, 40);
  assert.equal(st.toAct, 0); // depois do straddle
  const la = G.legalActions(st, 0);
  assert.equal(la.toCall, 40);
  assert.equal(la.minRaiseTo, 80); // mínimo 4 BB
  _act(st, ctx, 'u0', 'call', 0, 1);
  _act(st, ctx, 'u1', 'call', 0, 2);
  _act(st, ctx, 'u2', 'call', 0, 3);
  assert.equal(st.toAct, 3, 'straddle tem a opção');
  assert.equal(G.legalActions(st, 3).canCheck, true);
  _act(st, ctx, 'u3', 'check', 0, 4);
  assert.equal(st.phase, 'flop');
  assert.equal(G.totalChips(st), 4000);
});

test('straddle: desligado na mesa, com 2 jogadores ou sem fichas não acontece', () => {
  let st = table(4, null, { allowStraddle: false });
  assert.throws(() => G.setStraddle(st, 'u3', true), /desligado/);
  st = table(2); G.setStraddle(st, 'u0', true); G.setStraddle(st, 'u1', true);
  _start(st, 0, noShuffle());
  assert.equal(st.currentBet, 20);
  st = table(4, [1000, 1000, 1000, 30]); G.setStraddle(st, 'u3', true);
  _start(st, 0, noShuffle());
  assert.equal(st.currentBet, 20);
});

test('bomb pot: todos põem 2 BB, sem blinds, a mão começa no flop', () => {
  const st = table(3, null, { bomb: { on: true, every: 0, bb: 2 } });
  G.callBomb(st, true);
  const ctx = _start(st, 0, noShuffle());
  assert.equal(st.bomb, true);
  assert.equal(st.phase, 'flop');
  assert.equal(st.board.length, 3);
  assert.deepEqual(st.seats.slice(0, 3).map((s) => [s.committed, s.bet]), [[40, 0], [40, 0], [40, 0]]);
  assert.equal(st.currentBet, 0);
  assert.equal(st.toAct, 1); // primeiro depois do botão
  _act(st, ctx, 'u1', 'check', 0, 1); _act(st, ctx, 'u2', 'check', 0, 2); _act(st, ctx, 'u0', 'check', 0, 3);
  assert.equal(st.phase, 'turn');
  // próxima mão volta ao normal
  while (G.handActive(st)) { const s = st.seats[st.toAct]; _act(st, ctx, s.uid, 'check', 0, 4); }
  G.tick(st, ctx, st.nextHandAt);
  assert.equal(st.bomb, false);
  assert.equal(st.phase, 'preflop');
});

test('bomb pot automático a cada N mãos e desligado quando a chave está off', () => {
  const st = table(3, null, { bomb: { on: true, every: 3, bb: 1 } });
  let ctx = _start(st, 0, noShuffle());
  const bombs = [];
  for (let h = 0; h < 6; h++) {
    bombs.push(st.bomb);
    while (G.handActive(st)) { const s = st.seats[st.toAct]; G.act(st, ctx, s.uid, G.legalActions(st, st.toAct).canCheck ? 'check' : 'fold', 0, 1); }
    const r = G.tick(st, ctx, st.nextHandAt); ctx = r.ctx;
  }
  assert.deepEqual(bombs, [false, false, true, false, false, true]);
  const off = table(3, null, { bomb: { on: false } });
  assert.throws(() => G.callBomb(off), /desligado/);
});
