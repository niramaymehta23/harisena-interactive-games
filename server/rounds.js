'use strict';

const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = { pairhunt: 2, shout: 2, maths: 3 };

function roundCount(value, fallback) {
  if (value === undefined) value = fallback;
  const count = Number(value);
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isInteger(count) || count < 1 || count > MAX_ROUNDS) {
    throw new Error(`Choose between 1 and ${MAX_ROUNDS} rounds.`);
  }
  return count;
}

// Keep practice and team-turn descriptors intact; extend using the last round's
// existing rules, with a new logical round number (and therefore a new seed).
function roundPlan(mod, opts = {}) {
  const base = mod.rounds(opts);
  const scored = base.filter(r => !r.practice);
  const last = Math.max(...scored.map(r => r.n));
  const count = roundCount(opts.roundCount, last);
  const rounds = base.filter(r => r.practice);
  for (let n = 1; n <= count; n++) {
    for (const template of scored.filter(r => r.n === Math.min(n, last))) {
      rounds.push({ ...template, n, label: `Round ${n}` });
    }
  }
  return rounds;
}

module.exports = { MAX_ROUNDS, DEFAULT_ROUNDS, roundCount, roundPlan };
