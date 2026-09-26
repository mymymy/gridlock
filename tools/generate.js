#!/usr/bin/env node
// Generates js/levels.js: a set of puzzles with rising par (minimum moves).
//
// Method: place vehicles at random, explore every position reachable from
// that layout, then walk backwards from the solved positions to find how far
// each position is from a solution. Picking a position at a chosen distance
// gives a puzzle of known difficulty.
//
// Random layouts rarely give puzzles above about 25 moves, so the harder
// targets come from hill climbing: repeatedly add, remove or move a vehicle,
// keeping the change whenever the hardest reachable position gets no easier.
//
// Usage: node tools/generate.js [seed]
'use strict';

const fs = require('fs');
const path = require('path');
const RH = require('../js/solver.js');

const TARGETS = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
  44,
];
const RANDOM_BUDGET_MS = 20000;
const TIME_BUDGET_MS = 180000;
const RESTART_AFTER = 400; // hill-climbing steps without improvement
const MAX_COMPONENT = 50000;

// Small seeded PRNG (mulberry32) so a seed always gives the same levels.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLayout(rand) {
  const { SIZE, EXIT_ROW } = RH;
  const grid = new Array(SIZE * SIZE).fill('.');
  const put = (id, horiz, len, r, c) => {
    const cells = [];
    for (let k = 0; k < len; k++) {
      const i = horiz ? r * SIZE + c + k : (r + k) * SIZE + c;
      if (grid[i] !== '.') return false;
      cells.push(i);
    }
    cells.forEach((i) => (grid[i] = id));
    return true;
  };
  put('A', true, 2, EXIT_ROW, Math.floor(rand() * 3));
  const want = 11 + Math.floor(rand() * 5);
  const letters = 'BCDEFGHIJKLMNOPQ';
  let placed = 0;
  for (let attempt = 0; attempt < 200 && placed < want; attempt++) {
    const horiz = rand() < 0.5;
    const len = rand() < 0.75 ? 2 : 3;
    const r = Math.floor(rand() * (horiz ? SIZE : SIZE - len + 1));
    const c = Math.floor(rand() * (horiz ? SIZE - len + 1 : SIZE));
    // A horizontal vehicle on the exit row would block the red car for good.
    if (horiz && r === EXIT_ROW) continue;
    if (put(letters[placed], horiz, len, r, c)) placed++;
  }
  return grid.join('');
}

// Distance to the nearest solved position for every position in the component.
// Moves are reversible, so a breadth-first search from all solved positions works.
function distances(vehicles, start) {
  const seen = new Map([[RH.key(start), start]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      for (const n of RH.neighbours(vehicles, p)) {
        const k = RH.key(n.pos);
        if (seen.has(k)) continue;
        if (seen.size >= MAX_COMPONENT) return null;
        seen.set(k, n.pos);
        next.push(n.pos);
      }
    }
    frontier = next;
  }
  const dist = new Map();
  frontier = [];
  for (const [k, p] of seen) {
    if (RH.isSolved(p)) {
      dist.set(k, 0);
      frontier.push(p);
    }
  }
  if (!frontier.length) return null;
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const p of frontier) {
      for (const n of RH.neighbours(vehicles, p)) {
        const k = RH.key(n.pos);
        if (dist.has(k)) continue;
        dist.set(k, d);
        next.push(n.pos);
      }
    }
    frontier = next;
  }
  return { seen, dist };
}

// Rename vehicles B, C, D… in reading order so boards look tidy.
function relabel(board) {
  const map = { '.': '.', A: 'A' };
  let next = 'B'.charCodeAt(0);
  return [...board]
    .map((c) => {
      if (!(c in map)) map[c] = String.fromCharCode(next++);
      return map[c];
    })
    .join('');
}

// Fill the hardest open target this component can reach, if any.
function harvest(result, vehicles, open, byPar, rand, note) {
  const target = [...open].filter((t) => t <= result.max).sort((a, b) => b - a)[0];
  if (target === undefined) return;
  const matches = [];
  for (const [k, d] of result.dist) if (d === target) matches.push(k);
  const k = matches[Math.floor(rand() * matches.length)];
  byPar.set(target, relabel(RH.stringify(vehicles, result.seen.get(k))));
  open.delete(target);
  console.log(`par ${String(target).padStart(2)} found ${note}`);
}

function evaluate(board) {
  const { vehicles, pos } = RH.parse(board);
  const result = distances(vehicles, pos);
  if (!result) return null;
  let max = 0;
  let hardest = null;
  for (const [k, d] of result.dist) {
    if (d > max) {
      max = d;
      hardest = k;
    }
  }
  result.max = max;
  result.hardest = RH.stringify(vehicles, result.seen.get(hardest));
  return { vehicles, result };
}

const LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';

function removeVehicle(board, rand) {
  const ids = [...new Set(board)].filter((c) => c !== '.' && c !== 'A');
  if (!ids.length) return board;
  const id = ids[Math.floor(rand() * ids.length)];
  return board.split(id).join('.');
}

function addVehicle(board, rand) {
  const { SIZE, EXIT_ROW } = RH;
  const id = [...LETTERS].find((c) => !board.includes(c));
  if (!id) return board;
  const grid = [...board];
  for (let attempt = 0; attempt < 50; attempt++) {
    const horiz = rand() < 0.5;
    const len = rand() < 0.75 ? 2 : 3;
    const r = Math.floor(rand() * (horiz ? SIZE : SIZE - len + 1));
    const c = Math.floor(rand() * (horiz ? SIZE - len + 1 : SIZE));
    if (horiz && r === EXIT_ROW) continue;
    const cells = [];
    for (let k = 0; k < len; k++) cells.push(horiz ? r * SIZE + c + k : (r + k) * SIZE + c);
    if (cells.some((i) => grid[i] !== '.')) continue;
    cells.forEach((i) => (grid[i] = id));
    return grid.join('');
  }
  return board;
}

function mutate(board, rand) {
  const roll = rand();
  if (roll < 0.3) return removeVehicle(board, rand);
  if (roll < 0.6) return addVehicle(board, rand);
  return addVehicle(removeVehicle(board, rand), rand);
}

function main() {
  const seed = Number(process.argv[2] || 2026);
  const rand = rng(seed);
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const byPar = new Map(); // par -> board
  const open = new Set(TARGETS);

  // Phase 1: random layouts. Each fills the hardest target it can still
  // reach, so easy and hard puzzles come from different layouts.
  for (let tries = 0; open.size && elapsed() < RANDOM_BUDGET_MS; tries++) {
    const e = evaluate(randomLayout(rand));
    if (e) harvest(e.result, e.vehicles, open, byPar, rand, `after ${tries} random layouts`);
  }

  // Phase 2: hill climbing towards the remaining (harder) targets.
  let current = null;
  let stale = 0;
  let best = 0;
  for (let steps = 0; open.size && elapsed() < TIME_BUDGET_MS; steps++) {
    if (!current || stale > RESTART_AFTER) {
      const e = evaluate(randomLayout(rand));
      if (!e) continue;
      current = { board: e.result.hardest, max: e.result.max };
      stale = 0;
    }
    const e = evaluate(mutate(current.board, rand));
    if (!e || e.result.max < current.max) {
      stale++;
      continue;
    }
    stale = e.result.max > current.max ? 0 : stale + 1;
    current = { board: e.result.hardest, max: e.result.max };
    if (current.max > best) best = current.max;
    harvest(e.result, e.vehicles, open, byPar, rand, `by hill climbing (${(elapsed() / 1000).toFixed(0)}s)`);
  }
  if (open.size) console.warn(`Not found in time: ${[...open].join(', ')} (hardest seen: ${best})`);

  const levels = [];
  for (const target of TARGETS) {
    const board = byPar.get(target);
    if (!board) continue;
    // Check the par independently with the solver the game uses.
    const p = RH.parse(board);
    const par = RH.solve(p.vehicles, p.pos).length;
    if (par !== target) throw new Error(`Par mismatch for ${board}: ${par} vs ${target}`);
    levels.push({ board, par });
  }

  const out =
    '// Generated by tools/generate.js (seed ' + seed + '). Do not edit by hand.\n' +
    '// board: 36 cells row by row, "." empty, "A" red car. par: minimum moves.\n' +
    'window.RUSH_HOUR_LEVELS = [\n' +
    levels.map((l) => `  { board: '${l.board}', par: ${l.par} },`).join('\n') +
    '\n];\n';
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels.js'), out);
  console.log(`Wrote ${levels.length} levels in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
