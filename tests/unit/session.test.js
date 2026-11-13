'use strict';
// Session escape hatches: host PIN takeover, ending a session, leaving, bringing back removed players, unlocking teams.
const { setup, assert } = require('../harness');
const { Room } = require('../../server/room');

let n = 0; const test = (name, fn) => { fn(); n++; };

test('a room has a 4-digit host PIN that survives a restart', () => {
  const t = setup({ red: 1, blue: 1 });
  assert.match(t.room.hostPin, /^\d{4}$/);
  t.room.flush();
  const r2 = Room.fromJSON(JSON.parse(JSON.stringify(t.room.toJSON())), {});
  assert.strictEqual(r2.hostPin, t.room.hostPin);
  assert.strictEqual(r2.hostState().pin, t.room.hostPin);
});

test('takeover gives the host token for the right PIN and locks after five wrong ones', () => {
  const t = setup({ red: 1, blue: 1 });
  const wrong = t.room.hostPin === '0000' ? '1111' : '0000';
  assert.strictEqual(t.room.takeover(t.room.hostPin).hostToken, t.room.hostToken);
  for (let i = 0; i < 5; i++) assert.strictEqual(t.room.takeover(wrong).error, 'Wrong PIN.');
  assert.match(t.room.takeover(t.room.hostPin).error, /Too many/);
  t.advance(61000);
  assert.strictEqual(t.room.takeover(t.room.hostPin).hostToken, t.room.hostToken);
  assert.ok(t.room.takeover('').error);
});

test('an ended room saves nothing more', () => {
  let saves = 0;
  const room = new Room('ENDS', { save: () => saves++ });
  room.save(); assert.strictEqual(saves, 1);
  room.end(); room.save(); room.saveSoon();
  assert.strictEqual(saves, 1);
  assert.strictEqual(room._saveTimer, null);
});

test('leaving before lock removes the player; after lock they stay on the team, offline', () => {
  const t = setup({ red: 2, blue: 1, lock: false });
  const a = t.ids.red[0];
  t.room.leave(a);
  assert.strictEqual(t.room.players[a], undefined);
  assert.deepStrictEqual(t.room.teamCounts(), { red: 1, blue: 1 });
  t.host({ cmd: 'lock' });
  const b = t.ids.red[1];
  t.room.leave(b);
  assert.strictEqual(t.room.players[b].team, 'red');
  assert.strictEqual(t.room.players[b].online, false);
  t.room.leave('nobody'); // unknown ids are ignored
});

test('host can bring back a removed player, renaming them if their name was taken', () => {
  const t = setup({ red: 2, blue: 2 });
  const p = t.room.players[t.ids.red[0]];
  t.host({ cmd: 'remove', pid: p.id });
  assert.strictEqual(t.state(p.id).phase, 'removed');
  const same = t.room.join(p.name).player; // after lock: a new waiting player with the freed name
  assert.strictEqual(same.name, p.name);
  t.host({ cmd: 'restore', pid: p.id });
  assert.strictEqual(p.removed, false);
  assert.strictEqual(p.team, 'red');
  assert.notStrictEqual(p.name, same.name);
  assert.notStrictEqual(t.state(p.id).phase, 'removed');
  assert.ok(t.events.some(e => e.type === 'host_restore'));
  assert.ok(t.hostTry({ cmd: 'restore', pid: p.id }).error);
});

test('teams can be unlocked only before the first game', () => {
  const t = setup({ red: 2, blue: 2 });
  const late = t.room.join('Late').player;
  assert.ok(late.waiting);
  assert.strictEqual(t.room.hostState().canUnlock, true);
  t.host({ cmd: 'unlock' });
  assert.strictEqual(t.room.locked, false);
  assert.strictEqual(t.room.phase, 'lobby');
  assert.strictEqual(late.waiting, false);
  assert.ok(Object.values(t.room.players).every(p => p.seat === null));
  assert.ok(!t.room.pickTeam(late.id, 'blue').error);
  t.host({ cmd: 'lock' });
  assert.strictEqual(t.room.players[late.id].seat, 3);
  t.startGame('demo');
  assert.strictEqual(t.room.hostState().canUnlock, false);
  assert.match(t.hostTry({ cmd: 'unlock' }).error, /before the first game/);
});

console.log(`session: ${n} tests passed`);
