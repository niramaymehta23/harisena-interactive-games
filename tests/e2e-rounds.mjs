// Host controls through the real UI, with one host and 30 socket players.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { io: connect } = require('socket.io-client');
process.env.NO_SAVE = '1';
const { start, rooms } = require('../server/index.js');
const scoring = require('../server/scoring');
const OUT = path.resolve('output/playwright/round-controls'); mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const until = async (fn, msg) => { for (let i = 0; i < 200; i++) { if (await fn()) return; await wait(75); } throw new Error(msg); };
const call = (s, event, data) => new Promise((resolve, reject) => s.timeout(5000).emit(event, data, (e, value) => e ? reject(e) : value?.error ? reject(Error(value.error)) : resolve(value)));
let browser, server, hb, host, room;
const bots = [], errors = [], checks = [];
const check = text => { checks.push(text); console.log('PASS', text); };
const click = name => host.getByRole('button', { name, exact: true }).click();
const gameCard = name => host.locator('.gitem').filter({ has: host.locator('.gname', { hasText: name }) });
const shot = async name => { await wait(550); await host.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };
async function startRound() { await host.getByRole('button', { name: /^Start / }).first().click(); await until(() => room.phase === 'live', 'live'); }
async function endRound() { await click('End round early'); await until(() => ['results', 'gameover'].includes(room.phase), 'results'); }
async function scorePair() {
  const inst = room.current.seg.inst;
  for (const team of ['red', 'blue']) {
    const group = [...inst._state.T[team].groups.values()][0];
    const [a, b] = group.members;
    bots.find(bot => bot.id === a).socket.emit('act', { actionId: Math.random().toString(), type: 'code', code: inst._state.P[b].code });
  }
  await until(() => room.events.some(e => e.segId === room.current.seg.segId && e.points > 0), 'pair scored');
}
try {
  ({ server } = await start(0)); const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  host = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  host.on('pageerror', e => errors.push(e.message)); host.on('dialog', d => d.accept());
  await host.goto(base + '/host'); await click('New Session'); await host.waitForSelector('.bigcode');
  const code = (await host.locator('.bigcode').innerText()).trim(); room = rooms.get(code);
  for (let i = 0; i < 30; i++) {
    const socket = connect(base, { transports: ['websocket'], forceNew: true });
    await new Promise(r => socket.once('connect', r));
    let state; socket.on('state', s => { state = s; });
    const c = await call(socket, 'p:join', { room: code, name: `${i < 15 ? 'Red' : 'Blue'}${i % 15 + 1}` });
    await call(socket, 'p:hello', c); await call(socket, 'p:team', { team: i < 15 ? 'red' : 'blue' });
    bots.push({ socket, id: c.playerId, get state() { return state; } });
  }
  hb = setInterval(() => bots.forEach(b => b.socket.emit('hb')), 2000);
  await click('Lock Teams'); await until(() => room.phase === 'ready', 'teams locked');
  assert(!await host.getByText("Don't Say It", { exact: true }).count(), 'offline game absent');
  await host.getByLabel('Pair Hunt rounds', { exact: true }).selectOption('1');
  await until(() => room.options.roundCounts.pairhunt === 1, 'round preference');
  await shot('01-laptop-round-settings');
  await gameCard('Pair Hunt').getByRole('button', { name: 'Play', exact: true }).click();
  await startRound(); await scorePair(); await endRound();
  assert(room.phase === 'gameover', 'one round completes the game');
  const first = JSON.stringify(room.segments[0]);
  await shot('02-finished-one-round');
  await click('Add another round');
  assert(room.current.rounds[room.current.idx].n === 2, 'next is round 2');
  await host.getByLabel('Planned rounds', { exact: true }).selectOption('3');
  await until(() => room.current.opts.roundCount === 3, 'extended plan');
  await startRound(); await scorePair(); await endRound();
  await click('Finish game and keep scores');
  await until(() => room.phase === 'gameover', 'finished early');
  assert(room.current.opts.roundCount === 2, 'unplayed third round skipped');
  assert(JSON.stringify(room.segments[0]) === first && room.segments.length === 2, 'previous scores kept');
  check('Choose one round; add a second; finish early with both scores intact');
  await click('Add another round'); await startRound(); await scorePair(); await endRound();
  assert(room.segments.map(s => s.n).join() === '1,2,3', 'continuous round numbers');
  const pairTotal = scoring.gameTotals(room, 'pairhunt');
  await shot('03-three-rounds-scores-kept');
  check('Add a third scored round without restarting or replacing old rounds');
  await click('Turn-based'); await host.getByLabel('Shout It Out rounds', { exact: true }).selectOption('1');
  await gameCard('Shout It Out').getByRole('button', { name: 'Play', exact: true }).click();
  await startRound(); await endRound(); // practice
  await startRound(); await endRound(); // Red
  assert(await host.getByRole('button', { name: 'Finish game and keep scores', exact: true }).isDisabled(), 'cannot skip Blue');
  await shot('04-shout-both-teams-get-a-turn');
  await startRound(); await endRound(); // Blue
  assert(room.phase === 'gameover', 'both turns complete');
  await click('Add another round');
  assert(room.current.rounds.filter(r => r.n === 2).length === 2, 'extra turn pair');
  await host.getByLabel('Planned rounds', { exact: true }).selectOption('1');
  await until(() => room.phase === 'gameover', 'skip unplayed round');
  check('Shout practice stays separate; scored rounds include both Red and Blue');
  await gameCard('Pair Hunt').getByRole('button', { name: 'Add round', exact: true }).click();
  assert(room.current.game === 'pairhunt' && room.current.rounds[room.current.idx].n === 4, 'reopen earlier game');
  assert(JSON.stringify(scoring.gameTotals(room, 'pairhunt')) === JSON.stringify(pairTotal), 'reopening keeps totals');
  await host.reload(); await host.getByLabel('Planned rounds', { exact: true }).waitFor();
  assert(await host.getByLabel('Planned rounds', { exact: true }).inputValue() === '4', 'host reload keeps plan');
  await host.setViewportSize({ width: 390, height: 844 }); await shot('05-mobile-round-controls');
  assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile no overflow');
  check('Earlier games can continue with saved totals; host reload and mobile layout work');
  await click('Finish game and keep scores'); await click('Show final');
  await until(() => bots.every(b => b.state?.phase === 'final'), 'all 30 players final');
  assert(!await host.getByText(/Don't Say It/).count(), 'offline game absent from final');
  assert(errors.length === 0, errors.join('; '));
  check('All 30 players reach final; offline word game absent; no browser errors');
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ status: 'passed', host: 1, red: 15, blue: 15, checks, errors, pairTotal }, null, 2));
  console.log('Host round controls browser test passed');
} catch (e) {
  console.error(e); if (host) await shot('FAILURE-host').catch(() => {}); process.exitCode = 1;
} finally {
  clearInterval(hb); bots.forEach(b => b.socket.disconnect()); if (browser) await browser.close(); if (server) await new Promise(r => server.close(r));
}
