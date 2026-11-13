'use strict';
const { setup, assert } = require('../harness');
const { Room } = require('../../server/room');
const scoring = require('../../server/scoring');
let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAILED:', name); throw e; } };
const end = t => { t.host({ cmd: 'endRound' }); t.advance(3000); };
const play = t => { t.startRound(); t.act(t.ids.red[0], { type: 'tap' }); end(t); };

test('host chooses a one-round game and keeps the earned score', () => {
  const t = setup();
  t.host({ cmd: 'option', game: 'demo', roundCount: 1 });
  t.startGame('demo'); play(t);
  assert.strictEqual(t.room.phase, 'gameover');
  assert.strictEqual(t.room.segments.length, 1);
  assert.strictEqual(scoring.gameTotals(t.room, 'demo').red, 3);
});

test('a configured preference controls the next new game', () => {
  const t = setup();
  t.host({ cmd: 'option', game: 'pairhunt', roundCount: 4 });
  t.startGame('pairhunt');
  assert.strictEqual(t.room.current.rounds.length, 4);
  assert.strictEqual(t.state(t.ids.red[0]).game.rounds, 4);
});

test('adding a round keeps all previous scores and uses a fresh round ID', () => {
  const t = setup(); t.startGame('demo'); play(t);
  const first = JSON.stringify(t.lastResult());
  t.host({ cmd: 'addRound' });
  assert.strictEqual(t.room.phase, 'results');
  assert.strictEqual(t.room.current.rounds.length, 2);
  play(t);
  assert.strictEqual(JSON.stringify(t.room.segments[0]), first);
  assert.deepStrictEqual(t.room.segments.map(s => s.roundId), ['demo-1', 'demo-2']);
  assert.strictEqual(scoring.gameTotals(t.room, 'demo').red, 6);
});

test('finish early then add the next round without skipping round numbers', () => {
  const t = setup(); t.startGame('demo', { roundCount: 3 }); play(t);
  t.host({ cmd: 'endGame' });
  assert.strictEqual(t.room.phase, 'gameover');
  assert.strictEqual(t.room.current.opts.roundCount, 1);
  t.host({ cmd: 'addRound' });
  assert.strictEqual(t.room.current.rounds[t.room.current.idx].n, 2);
  play(t);
  assert.strictEqual(t.room.segments.length, 2);
});

test('change the planned count between rounds without deleting played rounds', () => {
  const t = setup(); t.startGame('demo', { roundCount: 3 }); play(t);
  t.host({ cmd: 'rounds', count: 1 });
  assert.strictEqual(t.room.phase, 'gameover');
  t.host({ cmd: 'rounds', count: 3 }); play(t);
  assert.ok(t.hostTry({ cmd: 'rounds', count: 1 }).error);
  assert.strictEqual(t.room.current.opts.roundCount, 3);
  assert.strictEqual(t.room.segments.length, 2);
});

test('invalid preferences are rejected before resetting scores', () => {
  const t = setup(); t.startGame('demo'); play(t);
  for (const count of [0, -1, 21, 1.5, '', null, true, 'bad']) {
    assert.ok(t.hostTry({ cmd: 'option', game: 'demo', roundCount: count }).error, String(count));
    assert.ok(t.hostTry({ cmd: 'game', game: 'demo', opts: { roundCount: count } }).error);
  }
  assert.strictEqual(t.room.segments.length, 1);
});

test('round changes cannot interrupt a live or paused round', () => {
  const t = setup(); t.startGame('demo'); t.startRound();
  for (const command of [{ cmd: 'rounds', count: 2 }, { cmd: 'addRound' }, { cmd: 'option', game: 'demo', roundCount: 2 }]) assert.ok(t.hostTry(command).error);
  t.host({ cmd: 'pause' });
  assert.ok(t.hostTry({ cmd: 'rounds', count: 2 }).error);
  assert.strictEqual(t.room.current.rounds.length, 1);
});

test('round settings and extension survive restart including legacy saves', () => {
  const t = setup(); t.host({ cmd: 'option', game: 'pairhunt', roundCount: 4 });
  t.startGame('demo'); play(t); t.host({ cmd: 'addRound' });
  const saved = JSON.parse(JSON.stringify(t.room.toJSON()));
  const restored = Room.fromJSON(saved);
  assert.strictEqual(restored.options.roundCounts.pairhunt, 4);
  assert.strictEqual(restored.current.rounds.length, 2);
  assert.strictEqual(restored.current.idx, 1);
  assert.strictEqual(restored.segments.length, 1);
  delete saved.options.roundCounts; delete saved.current.opts.roundCount;
  const legacy = Room.fromJSON(saved);
  assert.strictEqual(legacy.options.roundCounts.maths, 3);
  assert.strictEqual(legacy.current.rounds.length, 1);
});

test('turn-based Shout adds both team turns and cannot finish after Red alone', () => {
  const t = setup(); t.host({ cmd: 'option', shoutMode: 'turn', game: 'shout', roundCount: 1 });
  t.startGame('shout'); t.startRound(); end(t); // practice
  assert.strictEqual(t.state(t.ids.red[0]).game.rounds, 1);
  t.startRound(); end(t); // Red round 1
  assert.ok(t.hostTry({ cmd: 'endGame' }).error);
  assert.strictEqual(t.room.phase, 'results');
  t.startRound(); end(t); // Blue round 1
  assert.strictEqual(t.room.phase, 'gameover');
  t.host({ cmd: 'addRound' });
  assert.deepStrictEqual(t.room.current.rounds.filter(r => r.n === 2).map(r => r.teams), [['red'], ['blue']]);
  assert.strictEqual(t.state(t.ids.red[0]).game.rounds, 2);
  t.startRound(); end(t); t.startRound(); end(t);
  assert.strictEqual(t.room.segments.length, 5);
});

test('extra Pair Hunt and Maths rounds use existing harder content safely', () => {
  const t = setup(); t.startGame('pairhunt', { roundCount: 3 });
  t.startRound(); end(t); t.startRound(); end(t); t.startRound();
  assert.strictEqual(t.view(t.ids.red[0]).lookalike, true);
  const m = setup({ red: 15, blue: 15 }); m.startGame('maths', { roundCount: 5 });
  for (let i = 0; i < 4; i++) { m.startRound(); end(m); }
  m.startRound();
  assert.strictEqual(m.inst()._debug.L, 12);
  assert.strictEqual(m.view(m.ids.red[0]).round, 5);
});

test('a played game can receive another round after switching games', () => {
  const t = setup(); t.startGame('demo'); play(t);
  t.startGame('pairhunt', { roundCount: 1 }); t.startRound(); end(t);
  t.host({ cmd: 'addRound', game: 'demo' });
  assert.strictEqual(t.room.current.game, 'demo');
  assert.strictEqual(t.room.current.rounds[t.room.current.idx].n, 2);
  assert.ok(t.room.segments.some(s => s.game === 'pairhunt'));
});

test('replaying an earlier game preserves later results from another game', () => {
  const t = setup(); t.startGame('demo'); play(t);
  t.startGame('pairhunt', { roundCount: 1 }); t.startRound(); end(t);
  const pairResult = JSON.stringify(t.lastResult());
  t.host({ cmd: 'addRound', game: 'demo' });
  t.host({ cmd: 'rounds', count: 1 });
  t.host({ cmd: 'replayRound' });
  assert.strictEqual(t.room.segments.length, 1);
  assert.strictEqual(JSON.stringify(t.room.segments[0]), pairResult);
  assert.strictEqual(t.room.current.rounds[t.room.current.idx].n, 1);
  play(t);
  assert.strictEqual(t.room.segments.filter(s => s.game === 'demo').length, 1);
  assert.strictEqual(JSON.stringify(t.room.segments[0]), pairResult);
});

test('adding beyond the round limit leaves all state intact', () => {
  const t = setup(); t.startGame('demo', { roundCount: 20 });
  for (let i = 0; i < 20; i++) play(t);
  const before = JSON.stringify(t.room.toJSON());
  assert.ok(t.hostTry({ cmd: 'addRound' }).error);
  const after = t.room.toJSON();
  const old = JSON.parse(before);
  delete after.touched; delete old.touched;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(after)), old);
});

console.log(`round controls: ${n} tests passed`);
