'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../www/engine.js');

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
function table(n, stacks) {
  const st = G.createRoomState('ABCDE', 'u0', 'P0', { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
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
      if (st.seats.filter(G.canPlayNextHand).length < 2) {
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
