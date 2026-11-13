// Host page: lobby, game control, round results, audit and final.
// The host never plays. Every button sends a host command; the server answers with fresh state.
'use strict';

window.SabhaGames = window.SabhaGames || {};

const H = { room: null, token: null, state: null, key: null, sheet: null, auditOpen: false };
const happ = () => document.getElementById('app');

const PHASE_TEXT = {
  lobby: 'Lobby: players joining', ready: 'Teams locked: pick a game', intro: 'Ready to start', countdown: 'Starting…',
  live: 'Round live', time: 'Time!', results: 'Round results', gameover: 'Game over', dsi: 'Pick a game', final: 'Final',
};

function toast(text) {
  const t = h('div.toast', { text }); document.body.append(t); setTimeout(() => t.remove(), 3000);
}
async function cmd(c) {
  Sound.ensure();
  const r = await Net.call('host:cmd', c);
  if (r && r.error) toast(r.error);
  return r;
}

// ---------- boot ----------
function hboot() {
  Net.connect();
  Net.socket.on('state', s => { H.state = s; Net.setClock(s.clock); hrender(); });
  Net.on('connect', () => { if (H.room) hhello(); });
  Net.socket.on('ended', () => { forget(); toast('This session has ended.'); });
  const qs = new URLSearchParams(location.search);
  const saved = store.get(skey('host'));
  if (saved && (!qs.get('r') || qs.get('r').toUpperCase() === saved.room)) { H.room = saved.room; H.token = saved.token; }
  setInterval(htick, 200);
  hrender();
}
// drop the saved session on this phone and go back to the start screen
function forget() {
  store.del(skey('host')); H.room = null; H.token = null; H.state = null;
  closeSheet(); history.replaceState(null, '', '/host' + (AS ? '?as=' + AS : '')); hrender();
}
async function hhello() {
  const r = await Net.call('host:hello', { room: H.room, hostToken: H.token });
  if (!r) toast('Cannot reach the server. Check the connection.');
  else if (r.error) { forget(); toast('That session has ended. Start a new one.'); }
  else Wake.on();
}
function useSession(room, token) {
  H.room = room; H.token = token;
  store.set(skey('host'), { room, token });
  history.replaceState(null, '', '/host?r=' + room + (AS ? '&as=' + AS : ''));
  return hhello();
}
let creating = false;
async function newSession() {
  Sound.ensure();
  if (creating) return;
  if (!Net.connected) return toast('Not connected to the server yet. Try again in a moment.');
  creating = true;
  const r = await Net.call('host:create', null);
  creating = false;
  if (!r || !r.room) return toast('Could not start a session. Try again.');
  await useSession(r.room, r.hostToken);
}
async function takeOver(code, pin, err) {
  Sound.ensure();
  code = code.trim().toUpperCase();
  if (!code || !pin.trim()) { err.textContent = 'Type the game code and the host PIN.'; return; }
  const r = await Net.call('host:takeover', { room: code, pin: pin.trim() });
  if (!r) { err.textContent = 'Cannot reach the server. Try again.'; return; }
  if (r.error) { err.textContent = r.error; return; }
  await useSession(r.room, r.hostToken);
}
async function endSession() {
  if (!confirm(`End session ${H.room} for everyone? Every phone leaves the game and the scores are deleted. This cannot be undone.`)) return;
  const r = await Net.call('host:end', null);
  if (!r) return toast('Cannot reach the server. Try again.');
  forget();
  toast('Session ended.');
}

// ---------- render ----------
// The host screen is rebuilt on every push; a rebuild between finger-down and finger-up would swallow the
// tap, so while a finger is down the rebuild waits until just after it lifts (and the click has fired).
let pressing = false, deferred = false;
document.addEventListener('pointerdown', () => { pressing = true; }, { capture: true });
const release = () => { if (!pressing) return; pressing = false; if (deferred) { deferred = false; setTimeout(hrender, 30); } };
document.addEventListener('pointerup', release, { capture: true });
document.addEventListener('pointercancel', release, { capture: true });

function hrender() {
  if (pressing && H.state && H.room) { deferred = true; return; }
  const s = H.state;
  if (!H.room || !s) {
    if (H.key === 'start:' + H.room) return;
    H.key = 'start:' + H.room;
    return happ().replaceChildren(h('div.hsec', { style: { textAlign: 'center', paddingTop: '14vh' } },
      h('h1', { style: { fontFamily: 'var(--display)', fontWeight: 400, fontSize: '44px', margin: '0 0 10px' }, text: 'Sabha Games' }),
      h('p.muted', { text: 'This phone runs the games. The host does not play.' }),
      H.room ? [h('p', { text: 'Connecting to ' + H.room + '…' }),
        h('button.hbtn', { onclick: forget, text: 'Start a new session instead' })]
        : [h('button.hbtn.primary', { onclick: newSession, text: 'New Session' }), takeoverForm()]));
  }
  // rebuild everything on each state (host screens are small); keep open sheets and typed text
  const keep = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.keep;
  const keepVal = keep ? document.activeElement.value : null;
  H.key = 'main';
  const body = h('div');
  happ().replaceChildren(...[bar(s), handovers(s), warnings(s), body, queue(s)].filter(Boolean));
  body.append(...[PHASES[s.phase] ? PHASES[s.phase](s) : h('p', { text: s.phase })].flat(Infinity).filter(Boolean));
  if (keep) { const el = document.querySelector(`[data-keep="${keep}"]`); if (el) { el.value = keepVal; el.focus(); } }
  if (H.sheet && H.sheetLive) H.sheet();
}

function takeoverForm() {
  const qr = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  const code = h('input.hin', { maxlength: 4, value: /^[A-Z]{4}$/.test(qr) ? qr : '', placeholder: 'Code', autocapitalize: 'characters', autocomplete: 'off', 'aria-label': 'Game code', style: { width: '100px' } });
  const pin = h('input.hin', { maxlength: 4, inputmode: 'numeric', placeholder: 'PIN', autocomplete: 'off', 'aria-label': 'Host PIN', style: { width: '90px' } });
  const err = h('p.muted');
  const go = () => takeOver(code.value, pin.value, err);
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  return h('div.card', { style: { marginTop: '28px', textAlign: 'left' } },
    h('h3', { style: { marginTop: 0 }, text: 'Take over a running session' }),
    h('p.muted', { text: 'Host phone died or you switched phones? Type the game code and the host PIN shown on the old phone (under Session).' }),
    h('div.hrow', null, code, pin, h('button.hbtn', { onclick: go, text: 'Take over' })), err);
}

function openSession() {
  openSheet(() => [
    h('h2', { text: 'Session ' + H.state.room }),
    h('p', null, 'Host PIN: ', h('b', { style: { fontSize: '24px', letterSpacing: '3px' }, text: H.state.pin })),
    h('p.muted', { text: `If this phone dies, open ${location.origin}/host on another phone and take over with code ${H.state.room} and this PIN. Write it down now.` }),
    h('div.hcol', null,
      h('button.hbtn.warn', { onclick: endSession, text: 'End session for everyone' }),
      h('button.hbtn', { onclick: closeSheet, text: 'Close' })),
  ]);
}

function bar(s) {
  return h('div.hbar', null,
    h('span.code', { text: s.room }),
    h('span.phase', { text: (s.paused ? 'PAUSED · ' : '') + (PHASE_TEXT[s.phase] || s.phase) }),
    h('button.hbtn.small', { onclick: openPlayers, text: `Players ${s.counts.red + s.counts.blue}` }),
    h('button.hbtn.small', { onclick: openAudit, text: 'Audit' }),
    h('button.hbtn.small', { onclick: openSession, text: 'Session' }));
}

function handovers(s) {
  if (!s.handovers.length) return null;
  return h('div.hsec.hcol', null, s.handovers.map(ho => h('div.ho', null,
    h('p', { style: { margin: '0 0 8px', fontWeight: 800, fontSize: '18px' }, text: `Someone typed "${ho.name}" on a new phone. Is this ${ho.target}?` }),
    h('div.hrow', null,
      h('button.hbtn.primary', { onclick: () => cmd({ cmd: 'handover', id: ho.id, yes: true }), text: 'Yes, hand over' }),
      h('button.hbtn', { onclick: () => cmd({ cmd: 'handover', id: ho.id, yes: false }), text: 'No, new player' })))));
}

function warnings(s) {
  const seen = new Set();
  const recent = s.warnings.filter(w => s.serverNow - w.t < 20000).reverse().filter(w => !seen.has(w.text) && seen.add(w.text));
  if (!recent.length) return null;
  return h('div.hsec.hcol', null, recent.map(w => h('div.notice', { text: w.text })));
}

function queue(s) {
  const waiting = s.players.filter(p => p.waiting && !p.removed);
  if (!s.locked || !waiting.length) return null;
  return h('div.hsec', null, h('h2', { text: 'Waiting for a team' }),
    h('p.muted', { text: 'They play from the next round.' }),
    h('div.hcol', null, waiting.map(p => h('div.hrow', null,
      h('b', { style: { flex: 1, fontSize: '18px' }, text: p.name }),
      h('button.hbtn.red', { onclick: () => cmd({ cmd: 'assign', pid: p.id, team: 'red' }), text: 'Red' }),
      h('button.hbtn.blue', { onclick: () => cmd({ cmd: 'assign', pid: p.id, team: 'blue' }), text: 'Blue' }),
      h('button.hbtn.small.warn', { onclick: () => cmd({ cmd: 'remove', pid: p.id }), text: 'Remove' })))));
}

function teamLists(s, { tappable = true } = {}) {
  const col = team => {
    const ps = s.players.filter(p => p.team === team && !p.removed && !p.waiting).sort((a, b) => (a.seat || 99) - (b.seat || 99) || a.joinedAt - b.joinedAt);
    return h('div.tcol.' + team, null,
      h('h3', null, TEAM_NAME[team], h('span', { text: `${ps.length} · ${ps.filter(p => p.online).length} on` })),
      ps.map(p => h('button.prow', { onclick: tappable ? () => playerSheet(p) : null },
        h('i.st' + (p.online ? '' : '.off')), h('span.nm', { text: p.name }), p.seat ? h('span.seatno', { text: '#' + p.seat }) : null)));
  };
  const unteamed = s.players.filter(p => !p.team && !p.removed && !p.waiting);
  const removed = s.players.filter(p => p.removed);
  return h('div', null, h('div.teams2', null, col('red'), col('blue')),
    unteamed.length ? h('p.muted', { text: 'Not picked yet: ' + unteamed.map(p => p.name).join(', ') }) : null,
    tappable && removed.length ? h('div', null, h('h3', { text: 'Removed' }), h('div.hcol', null, removed.map(p => h('div.hrow', null,
      h('span', { style: { flex: 1 }, text: `${p.name}${p.team ? ' (' + TEAM_NAME[p.team] + ')' : ''}` }),
      h('button.hbtn.small', { onclick: () => cmd({ cmd: 'restore', pid: p.id }), text: 'Bring back' }))))) : null);
}

function playerSheet(p) {
  openSheet(() => [
    h('h2', { text: p.name }),
    h('p.muted', { text: `${p.team ? TEAM_NAME[p.team] : 'No team'}${p.seat ? ' #' + p.seat : ''} · ${p.online ? 'online' : 'offline'}` }),
    h('div.hcol', null,
      p.team !== 'red' ? h('button.hbtn.red', { onclick: () => { cmd({ cmd: 'move', pid: p.id, team: 'red' }); closeSheet(); }, text: 'Move to Red' }) : null,
      p.team !== 'blue' ? h('button.hbtn.blue', { onclick: () => { cmd({ cmd: 'move', pid: p.id, team: 'blue' }); closeSheet(); }, text: 'Move to Blue' }) : null,
      h('button.hbtn.warn', { onclick: () => { if (confirm(`Remove ${p.name}? They stop counting from the next round.`)) { cmd({ cmd: 'remove', pid: p.id }); closeSheet(); } }, text: 'Remove from the game' }),
      h('button.hbtn', { onclick: closeSheet, text: 'Close' })),
    H.state.locked ? h('p.muted', { text: 'Moves after Lock Teams are written in the audit.' }) : null,
  ]);
}

function openPlayers() {
  openSheet(() => [h('h2', { text: 'Players' }), H.state.locked ? null : h('p.muted', { text: 'Tap a name to move or remove them.' }), teamLists(H.state), h('div.hrow', { style: { marginTop: '12px' } }, h('button.hbtn', { onclick: closeSheet, text: 'Close' }))], true);
}

function openSheet(build, live = false) {
  H.sheetLive = live;
  H.sheet = () => {
    let bg = document.querySelector('.sheet-bg');
    const scroll = bg ? bg.firstChild.scrollTop : 0;
    if (bg) bg.remove();
    bg = h('div.sheet-bg', { onclick: e => { if (e.target === bg) closeSheet(); } }, h('div.sheet', null, build()));
    document.body.append(bg);
    bg.firstChild.scrollTop = scroll;
  };
  H.sheet();
}
function closeSheet() { H.sheet = null; const bg = document.querySelector('.sheet-bg'); if (bg) bg.remove(); H.auditOpen = false; }

// ---------- per phase ----------
const PHASES = {
  lobby(s) {
    const url = `${location.origin}/?r=${s.room}`;
    return [
      h('div.hsec.lobby-code', null,
        h('div.bigcode', { text: s.room }),
        h('img', { src: `/qr/${s.room}.svg`, alt: 'QR code to join' }),
        h('div.url', { text: url })),
      h('div.hsec.say', { text: '"Scan this, type your name, pick a team. Try to make it even."' }),
      h('div.counts', null, h('span.r', { text: `Red ${s.counts.red}` }), ' · ', h('span.b', { text: `Blue ${s.counts.blue}` })),
      Math.abs(s.counts.red - s.counts.blue) > 2 ? h('div.notice', { text: 'Teams differ by more than 2. Move a few people before locking.' }) : null,
      h('div.hsec', null, teamLists(s)),
      h('div.hsec', null, h('button.hbtn.primary', {
        style: { width: '100%' }, disabled: s.counts.red + s.counts.blue === 0,
        onclick: () => { if (confirm('Lock teams? After this only you can move people.')) cmd({ cmd: 'lock' }); }, text: 'Lock Teams',
      })),
    ];
  },
  ready(s) {
    return [gamePicker(s), champBox(s),
      s.canUnlock ? h('div.hsec', null, h('button.hbtn.small', { onclick: () => { if (confirm('Unlock teams? Players can pick and switch teams again, and seat numbers are given out again when you lock.')) cmd({ cmd: 'unlock' }); }, text: 'Unlock teams (locked by mistake)' })) : null];
  },
  intro(s) {
    const g = s.game;
    return [
      h('div.hsec', null, h('h2', { text: g.name }), h('div.say', { text: g.hostSays || g.rule })),
      roundsList(s),
      h('div.hsec.hrow', null,
        h('button.hbtn.primary', { onclick: () => cmd({ cmd: 'start' }), text: `Start ${roundLabel(s.next)}` }),
        h('button.hbtn', { onclick: () => cmd({ cmd: 'toReady' }), text: 'Back to games' })),
      s.game.id === 'shout' ? h('p.muted', { text: `Mode: ${s.game.opts.mode === 'turn' ? 'turn-based (Red plays, then Blue)' : 'both teams at once'}` }) : null,
    ];
  },
  countdown(s) { return PHASES.live(s); },
  live(s) {
    const seg = s.seg;
    const kids = [
      h('div.hsec', null, h('h2', { text: `${s.game.name} · ${roundLabel(seg)}` }),
        seg.teams.length === 1 ? h('p.muted', { text: `${TEAM_NAME[seg.teams[0]]} is playing; ${TEAM_NAME[other(seg.teams[0])]} watches.` }) : null),
      h('div.hclock', { 'data-hclock': '1' }),
      h('div.hsec.scorebox', null, seg.teams.map(t => h('div.' + t, null,
        h('div.s', { text: `${TEAM_NAME[t]} (${seg.teamSize[t]} players)` }),
        h('div.n', { text: String(seg.raw[t]) }), h('div.s', { text: 'raw points this round' })))),
    ];
    const mod = SabhaGames[s.game.id];
    if (seg.view) {
      if (mod && mod.host) { const el = h('div.hsec'); try { mod.host(el, seg.view, { cmd: data => cmd({ cmd: 'gameCmd', data }), h, state: s }); } catch (e) { console.error(e); } kids.push(el); }
      else kids.push(genericHostView(seg.view));
    }
    kids.push(h('div.hsec.hrow', null,
      s.paused ? h('button.hbtn.primary', { onclick: () => cmd({ cmd: 'resume' }), text: 'Resume' }) : h('button.hbtn', { onclick: () => cmd({ cmd: 'pause' }), text: 'Pause' }),
      h('button.hbtn.warn', { onclick: () => { if (confirm('End this round now?')) cmd({ cmd: 'endRound' }); }, text: 'End round early' })));
    return kids;
  },
  time(s) { return [h('div.hsec', null, h('div.hclock', { text: 'Time!' }))]; },
  results(s) {
    const last = s.results[s.results.length - 1];
    const otherTurnPending = !last.practice && s.next && s.next.n === last.n && s.next.teams && s.next.teams.length === 1;
    return [
      resultBlock(s, last),
      h('div.hsec.hrow', null,
        s.next ? h('button.hbtn.primary', { onclick: () => cmd({ cmd: 'start' }), text: `Start ${roundLabel(s.next)}` }) : null,
        h('button.hbtn', { disabled: otherTurnPending, onclick: () => { if (confirm('Finish this game now? Completed scores are kept; unplayed rounds are skipped.')) cmd({ cmd: 'endGame' }); }, text: 'Finish game and keep scores' }),
        h('button.hbtn.small', { onclick: () => { if (confirm('Throw away this round and play it again?')) cmd({ cmd: 'replayRound' }); }, text: 'Replay this round' })),
      otherTurnPending ? h('p.muted', { text: `${TEAM_NAME[s.next.teams[0]]} still has a turn in this round. Finish both teams’ turns before ending the game.` }) : null,
      roundsList(s),
    ];
  },
  gameover(s) {
    const g = s.championship.games.find(x => x.id === s.game.id);
    return [
      h('div.hsec', null, h('h2', { text: `${s.game.name}: final` }),
        g ? h('div.say', { text: g.winner ? `"${TEAM_NAME[g.winner]} wins ${s.game.name}! ${TEAM_NAME[g.winner]} ${g.points[g.winner]}, ${TEAM_NAME[other(g.winner)]} ${g.points[other(g.winner)]}."` : `"${s.game.name} is a draw!"` }) : null,
        g ? h('p.muted', { text: `Game totals: Red ${g.totals.red}, Blue ${g.totals.blue} → championship points Red ${g.points.red}, Blue ${g.points.blue}` }) : null),
      s.results.length ? resultBlock(s, s.results[s.results.length - 1]) : null,
      h('div.hsec.hrow', null,
        h('button.hbtn.primary', { disabled: !(s.results || []).some(r => !r.practice) || Math.max(...s.game.rounds.map(r => r.n)) >= s.roundLimit, onclick: () => cmd({ cmd: 'addRound' }), text: 'Add another round' }),
        h('button.hbtn.small', { onclick: () => { if (confirm('Throw away the last round and play it again?')) cmd({ cmd: 'replayRound' }); }, text: 'Replay last round' })),
      h('p.muted', { text: 'Add another round keeps these scores. Replay last round replaces only the last round.' }),
      roundsList(s),
      champBox(s),
      gamePicker(s),
    ];
  },
  // Old saved sessions may have stopped in the removed offline game's screen.
  dsi(s) { return [gamePicker(s), champBox(s)]; },
  final(s) {
    const f = s.final;
    return [
      h('div.hsec', null, h('h2', { text: 'Final' }),
        h('div.say', { text: f.champion ? `"The champion is… ${TEAM_NAME[f.champion]}! Red ${f.total.red}, Blue ${f.total.blue}."` : `"It's a tie! Red ${f.total.red}, Blue ${f.total.blue}."` }),
        f.byTiebreak ? h('p.muted', { text: 'Level on points; decided by the faster combined Maths Chain time.' }) : null),
      h('div.hsec.card', null, h('h3', { text: 'Game winners' }),
        h('ul', null, f.games.map(g => h('li', { text: `${g.name}: ${g.winner ? TEAM_NAME[g.winner] : 'draw'} (Red ${g.points.red}, Blue ${g.points.blue})` })),
          f.adjust.red || f.adjust.blue ? h('li', { text: `Manual adjustments: Red ${f.adjust.red}, Blue ${f.adjust.blue}` }) : null)),
      h('div.hsec.card', null, h('h3', { text: 'MVP shout-outs' }),
        f.mvps.length ? h('ul', null, f.mvps.map(m => h('li', { text: `${TEAM_NAME[m.team]} · ${m.label}: ${m.name} (${m.value})` }))) : h('p.muted', { text: 'No MVPs yet.' })),
      h('div.hsec.hrow', null, h('button.hbtn', { onclick: () => cmd({ cmd: 'toReady' }), text: 'Back to games' }), h('button.hbtn', { onclick: () => cmd({ cmd: 'final' }), text: 'Recalculate' })),
    ];
  },
};

function roundLabel(r) { if (!r) return ''; return (r.practice ? 'practice round' : (r.label || 'Round ' + r.n)) + (r.teams && r.teams.length === 1 ? ` (${TEAM_NAME[r.teams[0]]})` : ''); }

function roundsList(s) {
  const count = Math.max(...s.game.rounds.filter(r => !r.practice).map(r => r.n));
  const minimum = Math.max(1, ...(s.results || []).filter(r => !r.practice).map(r => r.n));
  return h('div.hsec', null, h('h3', { text: 'Rounds' }),
    roundSelector('Planned rounds', count, value => cmd({ cmd: 'rounds', count: value }), minimum),
    h('p.muted', { text: `Change this between rounds. Scores already earned are kept.${s.game.id === 'shout' && s.game.opts.mode === 'turn' ? ' Each round includes a Red turn and a Blue turn.' : ''}` }),
    h('ol', { style: { margin: 0, paddingLeft: '22px' } },
    s.game.rounds.map((r, i) => h('li', { style: { fontWeight: i === s.game.idx ? 800 : 500, opacity: i < s.game.idx ? 0.55 : 1 } },
      `${roundLabel(r)}${r.ms ? ' · ' + fmtClock(r.ms) : ''}${i < s.game.idx ? ' ✓' : ''}`))));
}

function roundSelector(label, count, onChange, minimum = 1, caption = label) {
  return h('label.hrow', null, h('span', { text: caption }),
    h('select.hin', { 'aria-label': label, onchange: e => onChange(Number(e.target.value)) },
      Array.from({ length: (H.state.roundLimit || 20) - minimum + 1 }, (_, i) => minimum + i).map(n => h('option', { value: n, selected: n === count, text: String(n) }))));
}

function genericHostView(v) {
  return h('div.hsec.card', null,
    (v.lines || []).map(l => h('p', { style: { margin: '4px 0' }, text: l })),
    v.buttons ? h('div.hrow', null, v.buttons.map(b => h('button.hbtn', { onclick: () => { if (!b.confirm || confirm(b.confirm)) cmd({ cmd: 'gameCmd', data: b.cmd }); }, text: b.label }))) : null);
}

function resultBlock(s, seg) {
  if (!seg) return null;
  const teams = seg.teams;
  const winner = !seg.practice && teams.length === 2 && seg.score.red !== seg.score.blue ? (seg.score.red > seg.score.blue ? 'red' : 'blue') : null;
  const statKeys = [...new Set(teams.flatMap(t => Object.keys(seg.stats[t] || {})))];
  const lab = k => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  return h('div.hsec', null,
    h('h2', { text: `${roundLabel(seg)} results` }),
    seg.practice ? h('div.say', { text: '"That was practice. No points. Ready for the real thing?"' }) :
      h('div.say', { text: winner ? `"${TEAM_NAME[winner]} wins ${seg.label || 'the round'}! ${teams.map(t => seg.lines[t]).filter(Boolean).join('. ')}"` : `"${teams.length === 2 ? 'A draw! ' : ''}${teams.map(t => seg.lines[t]).filter(Boolean).join('. ')}"` }),
    h('table.res-table', null,
      h('tr', null, h('th'), teams.map(t => h('th', { text: TEAM_NAME[t] }))),
      statKeys.map(k => h('tr', null, h('td', { text: lab(k) }), teams.map(t => h('td', { text: fmtStat(seg.stats[t] && seg.stats[t][k]) })))),
      h('tr', null, h('td', { text: 'Raw points' }), teams.map(t => h('td', { text: String(seg.raw[t]) }))),
      !seg.practice ? h('tr', null, h('td', { text: 'Round score' }), teams.map(t => h('td.' + t[0], { text: String(seg.score[t]) }))) : null,
      h('tr', null, h('td', { text: 'Players' }), teams.map(t => h('td', { text: String(seg.teamSize[t]) })))),
    !seg.practice && s.totals ? h('p.muted', { text: `${s.game.name} totals so far: Red ${s.totals.red}, Blue ${s.totals.blue}` }) : null,
    h('button.hbtn.small', { onclick: () => openAudit(seg.segId), text: 'How were these points earned?' }));
}
function fmtStat(v) {
  if (v == null) return '–';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

function gamePicker(s) {
  return h('div.hsec', null, h('h2', { text: 'Games' }),
    h('div.games-list', null,
      s.catalogue.map(g => h('div.gitem', { style: { flexWrap: 'wrap' } },
        h('span.gname', { text: g.name }),
        g.status === 'new' ? null : h('span.gstat', { text: g.status === 'done' ? 'played ✓' : 'unfinished' }),
        roundSelector(`${g.name} rounds`, g.rounds, count => cmd({ cmd: 'option', game: g.id, roundCount: count }), 1, 'Rounds'),
        g.status === 'done' && s.championship.games.find(x => x.id === g.id) ? h('button.hbtn', { onclick: () => cmd({ cmd: 'addRound', game: g.id }), text: 'Add round' }) : null,
        h('button.hbtn' + (g.status === 'new' ? '.primary' : ''), {
          onclick: () => { if (g.status === 'new' || confirm(`Play ${g.name} again from the start? Its old scores are replaced.`)) cmd({ cmd: 'game', game: g.id }); },
          text: g.status === 'new' ? 'Play' : 'Restart game',
        }))),
      h('div.gitem', null, h('span.gname', { text: 'Shout It Out mode' }),
        h('button.hbtn.small' + (s.options.shoutMode === 'simultaneous' ? '.primary' : ''), { onclick: () => cmd({ cmd: 'option', shoutMode: 'simultaneous' }), text: 'Both at once' }),
        h('button.hbtn.small' + (s.options.shoutMode === 'turn' ? '.primary' : ''), { onclick: () => cmd({ cmd: 'option', shoutMode: 'turn' }), text: 'Turn-based' })),
      h('div.gitem', null, h('span.gname', { text: 'Final results' }),
        h('button.hbtn', { onclick: () => { if (confirm('Show the final results on every phone?')) cmd({ cmd: 'final' }); }, text: 'Show final' }))));
}

function champBox(s) {
  const c = s.championship;
  if (!c.games.length && !c.adjust.red && !c.adjust.blue) return null;
  return h('div.hsec', null, h('h2', { text: 'Championship' }),
    h('div.say', { text: `"Red ${c.total.red} · Blue ${c.total.blue}"` }),
    h('table.res-table', null,
      h('tr', null, h('th', { text: 'Game' }), h('th', { text: 'Red' }), h('th', { text: 'Blue' })),
      c.games.map(g => h('tr', null, h('td', { text: g.name + (g.status === 'playing' ? ' (unfinished)' : '') }), h('td.r', { text: `${g.points.red} (${g.totals.red})` }), h('td.b', { text: `${g.points.blue} (${g.totals.blue})` }))),
      c.adjust.red || c.adjust.blue ? h('tr', null, h('td', { text: 'Manual adjustments' }), h('td.r', { text: String(c.adjust.red) }), h('td.b', { text: String(c.adjust.blue) })) : null),
    h('p.muted', { text: 'Points out of 100 per game; game totals in brackets.' }));
}

// ---------- audit ----------
async function openAudit(segFilter) {
  const a = await Net.call('host:audit', null);
  if (!a || a.error) return toast('Could not load the audit.');
  const names = Object.fromEntries(a.players.map(p => [p.id, p]));
  let filter = typeof segFilter === 'string' ? segFilter : '';
  const t0 = a.events.length ? a.events[0].t : 0;
  const tm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const segs = [...new Set(a.events.map(e => e.segId).filter(Boolean))];
  H.auditOpen = true;
  const build = () => {
    const evs = a.events.filter(e => !filter || e.segId === filter);
    const contrib = Object.entries(a.contributions).map(([pid, c]) => ({ p: names[pid], ...c })).filter(x => x.p).sort((x, y) => y.points - x.points);
    return [
      h('h2', { text: 'Audit' }),
      h('p.muted', { text: 'Every point, in order. Scores are always the sum of these events.' }),
      h('div.hrow', null,
        h('select.hin', { onchange: e => { filter = e.target.value; H.sheet(); } },
          h('option', { value: '', text: `All rounds (${a.events.length} events)` }),
          segs.map(sg => h('option', { value: sg, selected: sg === filter, text: sg })))),
      h('ul.events', null, evs.slice().reverse().slice(0, 400).map(e => h('li', null,
        h('span.tm', { text: tm(e.t) }),
        h('span', null, h('span.' + e.team + '-t', { text: TEAM_NAME[e.team] || '' }), ' ', h('b', { text: (e.names || []).join(' + ') }), ' ', e.type.replace(/_/g, ' '), e.detail ? h('span.muted', { text: ' · ' + e.detail }) : null, e.practice ? h('span.muted', { text: ' (practice)' }) : null),
        h('span.pts' + (e.points < 0 ? '.neg' : ''), { text: (e.points > 0 ? '+' : '') + e.points })))),
      evs.length > 400 ? h('p.muted', { text: `Showing the latest 400 of ${evs.length}.` }) : null,
      h('h3', { text: 'Per-player contribution' }),
      h('p.muted', { text: 'Points of every event the player was part of (a pair\'s points count for both).' }),
      h('ul.events', null, contrib.map(c => h('li', null, h('span.' + c.p.team + '-t', { text: `${TEAM_NAME[c.p.team] || ''} #${c.p.seat || ''}` }), h('b', { text: c.p.name }), h('span.pts', { text: String(c.points) })))),
      h('h3', { text: 'Manual adjustment' }),
      h('p.muted', { text: 'Adds championship points directly. Needs a reason; shows in the audit and the final.' }),
      h('div.hrow', null,
        h('select.hin', { id: 'adjTeam' }, h('option', { value: 'red', text: 'Red' }), h('option', { value: 'blue', text: 'Blue' })),
        h('input.hin', { id: 'adjPts', type: 'number', placeholder: '±points', style: { width: '110px' } }),
        h('input.hin', { id: 'adjWhy', placeholder: 'Reason', style: { flex: 1, minWidth: '160px' } }),
        h('button.hbtn', { onclick: async () => {
          const team = document.getElementById('adjTeam').value, points = Number(document.getElementById('adjPts').value), reason = document.getElementById('adjWhy').value;
          const r = await cmd({ cmd: 'adjust', team, points, reason });
          if (r && !r.error) { toast('Adjustment added.'); closeSheet(); }
        }, text: 'Add' })),
      h('div.hrow', { style: { marginTop: '14px' } }, h('button.hbtn', { onclick: closeSheet, text: 'Close' })),
    ];
  };
  openSheet(build);
}

// ---------- clocks ----------
function htick() {
  const s = H.state;
  if (!s) return;
  const now = Net.now();
  const c = document.querySelector('[data-hclock]');
  if (c && s.seg) {
    if (s.phase === 'countdown') c.textContent = String(Math.max(1, Math.ceil((s.seg.startsAt - now) / 1000)));
    else c.textContent = s.seg.endsAt ? fmtClock(s.seg.endsAt + 0 - now) : fmtClock(now - s.seg.startsAt);
  }
  const d = document.querySelector('[data-dsi]');
  if (d && s.dsi.turn && !s.dsi.turn.over) {
    const left = s.dsi.turn.endsAt - now;
    d.textContent = fmtClock(left);
    if (left <= 0 && !H.dsiBeeped) { H.dsiBeeped = true; Sound.time(); buzz([200, 80, 200]); }
    if (left > 0) H.dsiBeeped = false;
  }
}

document.addEventListener('DOMContentLoaded', hboot);
