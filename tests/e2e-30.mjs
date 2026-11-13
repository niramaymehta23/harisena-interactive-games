// One host + 30 independent phone browser contexts, against an isolated real server.
// NODE_PATH=<playwright node_modules> CHROMIUM_PATH=<optional executable> node tests/e2e-30.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { playPairHunt, playShout, playMaths } from './e2e-games.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
process.env.NO_SAVE = '1';
const { start, rooms } = require('../server/index.js');
const { GAMES } = require('../server/room.js');
const scoring = require('../server/scoring.js');
const OUT = path.resolve('output/playwright/15-v-15');
mkdirSync(OUT, { recursive: true });
const report = { configuration: { host: 1, red: 15, blue: 15, browserContexts: 31, server: 'isolated local', clock: 'real time' }, rounds: [], checks: [], screenshots: [], errors: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...args) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const until = async (fn, ms = 15000, what = '') => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(80); }
  throw new Error('Timed out: ' + what);
};
const pageErrors = [];
const serverErrors = [];
const originalError = console.error;
console.error = (...args) => { serverErrors.push(args.map(String).join(' ')); originalError(...args); };
let browser, server, host, code;
const phones = [];
const room = () => rooms.get(code);
async function newPage(url, hostPage = false, context = null) {
  const ctx = context || await browser.newContext({ viewport: hostPage ? { width: 430, height: 932 } : { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(`${url}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) pageErrors.push(`${url}: ${m.text()}`); });
  page.on('dialog', d => d.accept());
  await page.goto(base + url);
  return page;
}
async function shot(page, name) {
  // Let the 450 ms feedback flash clear and the 200 ms UI clock tick render.
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png');
}
async function waitText(page, pattern, ms = 15000) {
  await until(async () => pattern.test(await page.locator('#app').innerText().catch(() => '')), ms, `${pattern} on ${page.url()}`);
}
const cmd = async c => {
  const result = await host.evaluate(c => window.cmd(c), c);
  assert(!result?.error, `Host command ${c.cmd}: ${result?.error}`);
  return result;
};
const click = async name => host.getByRole('button', { name, exact: true }).click();
const check = text => { report.checks.push(text); log('PASS', text); };
async function checkAll(phase) {
  await until(async () => (await Promise.all(phones.map(p => p.evaluate(phase => P.state?.phase === phase, phase)))).every(Boolean), 15000, `all 30 players ${phase}`);
  assert(room().activePlayers('red').length === 15 && room().activePlayers('blue').length === 15, '15 vs 15 throughout');
}
async function playGame(id, label) {
  const item = host.locator('.gitem').filter({ has: host.locator('.gname', { hasText: label }) });
  await item.getByRole('button', { name: 'Play', exact: true }).click();
  await checkAll('intro');
  await shot(phones[0], `${id}-intro-red`);
  let n = 0;
  while (room().phase !== 'gameover') {
    n++;
    await host.getByRole('button', { name: /^Start / }).first().click();
    await until(() => room().phase === 'live', 10000, `${id} round live`);
    await checkAll('live');
    const seg = room().current.seg;
    assert(seg.roster.red.length === 15 && seg.roster.blue.length === 15, `${id}: all 30 on roster`);
    const scopedShot = (p, name) => shot(p, `${name}-round-${n}`);
    if (id === 'pairhunt' && n === 1) {
      await click('Pause');
      await until(async () => (await Promise.all(phones.map(p => p.locator('.paused').count()))).every(Boolean), 5000, 'all phones paused');
      const before = room().now(); await sleep(700);
      assert(room().now() === before, 'game clock freezes while paused');
      await shot(host, 'host-paused-30-players');
      await click('Resume');
      await until(async () => (await Promise.all(phones.map(p => p.locator('.paused').count()))).every(n => n === 0), 5000, 'all phones resumed');
      check('Host pause/resume freezes game clock on all 30 phones');
      const context = phones[0].context();
      const originalId = await phones[0].evaluate(() => P.state.me.id);
      await phones[0].close();
      phones[0] = await newPage('/?as=1', false, context);
      await waitText(phones[0], /Red #1/);
      assert(await phones[0].evaluate(() => P.state.me.id) === originalId, 'reconnect restores identity');
      check('Player reconnect restores identity and live round');
    }
    await shot(host, `${id}-host-live-round-${n}`);
    if (id === 'pairhunt') {
      await playPairHunt({ phones, room, sleep, until, shot: scopedShot, rounds: 1 });
      await click('End round early');
    } else if (id === 'shout') {
      for (const [team, teamPhones] of [['red', phones.slice(0, 15)], ['blue', phones.slice(15)]]) {
        await playShout({ phones: teamPhones, room, sleep, until, shot: (p, name) => scopedShot(p, `${name}-${team}`), hits: 6 });
      }
      await click('End round early');
    } else {
      await playMaths({ phones, room, sleep, until, shot: scopedShot });
    }
    await until(() => ['results', 'gameover'].includes(room().phase), 15000, `${id} results`);
    await checkAll(room().phase);
    const result = room().segments.at(-1);
    for (const team of ['red', 'blue']) {
      assert(result.teamSize[team] === 15, 'scoring uses 15 players per team');
      const sum = room().events.filter(e => e.segId === result.segId && e.team === team).reduce((sum, e) => sum + e.points, 0);
      assert(sum === result.raw[team], `${id} ${team}: raw score reconciles`);
      const expected = result.practice ? 0 : GAMES[id].normalise ? Math.round(sum * 10 / 15) : sum;
      assert(result.score[team] === expected, `${id} ${team}: normalised score reconciles`);
    }
    if (id === 'maths') assert(result.raw.red === 100 && result.raw.blue >= 40, 'both maths teams finish');
    if (id === 'pairhunt') assert(result.raw.red > 0 && result.raw.blue > 0, 'both pair hunt teams score');
    if (id === 'shout' && !result.practice) assert(result.raw.red > 0 && result.raw.blue > 0, 'both shout teams score');
    report.rounds.push({ game: id, label: result.label, practice: result.practice, players: result.teamSize, raw: result.raw, score: result.score });
    await shot(host, `${id}-host-results-round-${n}`);
    await shot(phones[0], `${id}-player-results-round-${n}`);
    check(`${label} ${result.practice ? 'practice' : result.label}: 30 players, score reconciliation, all screens`);
  }
}
let base;
try {
  ({ server } = await start(0));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  host = await newPage('/host?as=host', true);
  await click('New Session');
  await host.waitForSelector('.bigcode');
  code = (await host.locator('.bigcode').innerText()).trim();
  report.room = code;
  await until(() => host.locator('.lobby-code img').evaluate(i => i.complete && i.naturalWidth > 0), 5000, 'QR code loaded');
  for (let i = 0; i < 30; i++) {
    const team = i < 15 ? 'Red' : 'Blue';
    const p = await newPage(`/?r=${code}&as=${i + 1}`);
    await p.fill('input.text-in', `${team} ${String(i % 15 + 1).padStart(2, '0')}`);
    await p.getByRole('button', { name: team, exact: true }).click();
    await waitText(p, /Waiting for host/i);
    phones.push(p);
    if ((i + 1) % 5 === 0) log(`${i + 1} browser players joined`);
  }
  await waitText(host, /Red 15 · Blue 15/);
  await shot(host, '00-host-lobby-15-v-15');
  await click('Lock Teams');
  await checkAll('ready');
  const seats = await Promise.all(phones.map(p => p.evaluate(() => ({ team: P.state.me.team, seat: P.state.me.seat, online: P.state.me.online }))));
  for (const team of ['red', 'blue']) assert(new Set(seats.filter(p => p.team === team).map(p => p.seat)).size === 15, `${team} unique seats`);
  await shot(host, '01-host-ready');
  await shot(phones[0], '01-red-player-ready');
  await shot(phones[15], '01-blue-player-ready');
  check('One host; 30 real browser players; 15 unique seats per team; working join QR');
  await playGame('pairhunt', 'Pair Hunt');
  await playGame('shout', 'Shout It Out');
  await playGame('maths', 'Maths Chain');
  assert(!(await host.locator('#app').innerText()).includes("Don't Say It"), 'word guessing stays offline');
  await click('Audit');
  await host.waitForSelector('.sheet .events li');
  await shot(host, 'host-audit');
  await host.getByRole('button', { name: 'Close', exact: true }).last().click();
  await click('Show final');
  await checkAll('final');
  const championship = scoring.championship(room());
  for (const team of ['red', 'blue']) assert(room().final.total[team] === championship.total[team], 'final matches championship');
  await shot(host, 'final-host');
  await shot(phones[0], 'final-red-player');
  await shot(phones[15], 'final-blue-player');
  check('Audit opens; final scores reconcile; all 30 players reach final');
  for (const p of [host, ...phones]) {
    const content = await p.locator('#app').innerText();
    assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(content), 'no broken values on final screen');
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
  }
  assert(pageErrors.length === 0, 'browser errors: ' + pageErrors.join('; '));
  assert(serverErrors.length === 0, 'server errors: ' + serverErrors.join('; '));
  assert(!room().warnings.some(w => /error/i.test(w.text)), 'no server game errors');
  check('No browser/server errors, broken final values or horizontal overflow');
  report.final = room().final;
  report.status = 'passed';
  log('30-PLAYER BROWSER TEST PASSED');
} catch (error) {
  report.status = 'failed';
  report.errors.push(error.stack, ...pageErrors, ...serverErrors);
  originalError(error);
  if (host) await shot(host, 'FAILURE-host').catch(() => {});
  if (phones[0]) await shot(phones[0], 'FAILURE-player').catch(() => {});
  process.exitCode = 1;
} finally {
  report.elapsedSeconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
