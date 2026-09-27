#!/usr/bin/env node
// Generates js/levels.js: a set of puzzles of rising difficulty (minimum moves).
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
// The hardest tier needs more search than this script can do in its time
// budget, so those levels come from tools/hard-boards.txt, which
// tools/search.js fills over longer runs. Its 51-move board, the hardest
// there is, comes from Michael Fogleman's exhaustive search
// (https://github.com/fogleman/rush, MIT licence).
//
// Usage: node tools/generate.js [seed] [--keep]
//   --keep  keep levels already in js/levels.js and only search for missing ones
'use strict';

const fs = require('fs');
const path = require('path');
const Solver = require('../js/solver.js');
const { shape, difference } = require('./search.js');

// Fifteen levels per difficulty tier. Tier limits match TIERS in js/game.js.
const TARGETS = [
  3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, // Beginner (up to 7)
  8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, // Intermediate (8-14)
  15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 21, // Advanced (15-21)
  22, 23, 24, 25, 26, 27, 28, 29, 30, 30, 31, 32, 33, 34, 34, // Expert (22-34)
  35, 35, 35, 36, 36, 37, 37, 38, 38, 39, 39, 40, 40, 41, 41, // Master (35-41)
  42, 42, 42, 42, 43, 43, 44, 44, 45, 46, 46, 46, 47, 49, 51, // Grand Master (42+), from tools/hard-boards.txt
];
const RANDOM_BUDGET_MS = 20000;
const TIME_BUDGET_MS = 600000;
const RESTART_AFTER = 400; // hill-climbing steps without improvement
const PER_LINEAGE = 2; // levels taken from one climb before starting afresh
const MAX_COMPONENT = 50000;
const LEVELS_FILE = path.join(__dirname, '..', 'js', 'levels.js');
const HARD_FILE = path.join(__dirname, 'hard-boards.txt');

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
  const { SIZE, EXIT_ROW } = Solver;
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
  const seen = new Map([[Solver.key(start), start]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      for (const n of Solver.neighbours(vehicles, p)) {
        const k = Solver.key(n.pos);
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
    if (Solver.isSolved(p)) {
      dist.set(k, 0);
      frontier.push(p);
    }
  }
  if (!frontier.length) return null;
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const p of frontier) {
      for (const n of Solver.neighbours(vehicles, p)) {
        const k = Solver.key(n.pos);
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
// open is a list of targets (with repeats); found maps target -> boards.
function harvest(result, vehicles, open, found, used, rand, note) {
  const target = open.filter((t) => t <= result.max).sort((a, b) => b - a)[0];
  if (target === undefined) return false;
  const matches = [];
  for (const [k, d] of result.dist) if (d === target) matches.push(k);
  const board = relabel(Solver.stringify(vehicles, result.seen.get(matches[Math.floor(rand() * matches.length)])));
  if (used.has(board)) return false;
  used.add(board);
  if (!found.has(target)) found.set(target, []);
  found.get(target).push(board);
  open.splice(open.indexOf(target), 1);
  console.log(`${String(target).padStart(2)} moves: found ${note} (${open.length} to go)`);
  return true;
}

function evaluate(board) {
  const { vehicles, pos } = Solver.parse(board);
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
  result.hardest = Solver.stringify(vehicles, result.seen.get(hardest));
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
  const { SIZE, EXIT_ROW } = Solver;
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
  const args = process.argv.slice(2);
  const seed = Number(args.find((a) => /^\d+$/.test(a)) || 2026);
  const keep = args.includes('--keep');
  const rand = rng(seed);
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const found = new Map(); // minimum moves -> boards
  const used = new Set();
  const open = TARGETS.slice();
  if (keep) {
    const text = fs.readFileSync(LEVELS_FILE, 'utf8');
    for (const [, board, moves] of text.matchAll(/board: '([A-Z.]{36})', minMoves: (\d+)/g)) {
      const i = open.indexOf(Number(moves));
      if (i === -1 || used.has(board)) continue;
      open.splice(i, 1);
      used.add(board);
      if (!found.has(Number(moves))) found.set(Number(moves), []);
      found.get(Number(moves)).push(board);
    }
    console.log(`Kept ${used.size} levels; searching for ${open.length}`);
  }

  // Hard boards from tools/search.js. Many come from the same few climbs
  // and look alike, so for each target take the one least like the levels
  // already chosen.
  if (fs.existsSync(HARD_FILE)) {
    const pool = fs
      .readFileSync(HARD_FILE, 'utf8')
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((f) => f.length === 4)
      .map(([moves, , , board]) => ({ moves: Number(moves), board }));
    // Compare with the levels kept too, so new ones don't copy them.
    const chosen = [...used].map(shape);
    let added = 0;
    for (const target of open.slice().sort((a, b) => b - a)) {
      const options = pool.filter((p) => p.moves === target && !used.has(p.board));
      if (!options.length) continue;
      const score = (p) => Math.min(99, ...chosen.map((c) => difference(shape(p.board), c)));
      const pick = options.reduce((a, b) => (score(b) > score(a) ? b : a));
      chosen.push(shape(pick.board));
      used.add(pick.board);
      if (!found.has(target)) found.set(target, []);
      found.get(target).push(pick.board);
      open.splice(open.indexOf(target), 1);
      added++;
    }
    console.log(`Took ${added} levels from ${path.relative(process.cwd(), HARD_FILE)}; searching for ${open.length}`);
  }

  // Phase 1: random layouts. Each fills the hardest target it can still
  // reach, so easy and hard puzzles come from different layouts.
  for (let tries = 0; open.length && elapsed() < RANDOM_BUDGET_MS; tries++) {
    const e = evaluate(randomLayout(rand));
    if (e) harvest(e.result, e.vehicles, open, found, used, rand, `after ${tries} random layouts`);
  }

  // Phase 2: hill climbing towards the remaining (harder) targets. Each
  // climb gives at most PER_LINEAGE levels, so hard levels don't look alike.
  let current = null;
  let stale = 0;
  let taken = 0;
  let best = 0;
  for (let steps = 0; open.length && elapsed() < TIME_BUDGET_MS; steps++) {
    if (!current || stale > RESTART_AFTER || taken >= PER_LINEAGE) {
      const e = evaluate(randomLayout(rand));
      if (!e) continue;
      current = { board: e.result.hardest, max: e.result.max };
      stale = 0;
      taken = 0;
    }
    const e = evaluate(mutate(current.board, rand));
    if (!e || e.result.max < current.max) {
      stale++;
      continue;
    }
    stale = e.result.max > current.max ? 0 : stale + 1;
    current = { board: e.result.hardest, max: e.result.max };
    if (current.max > best) best = current.max;
    if (harvest(e.result, e.vehicles, open, found, used, rand, `by hill climbing (${(elapsed() / 1000).toFixed(0)}s)`)) taken++;
  }
  if (open.length) console.warn(`Not found in time: ${open.join(', ')} (hardest seen: ${best})`);

  const levels = [];
  for (const target of TARGETS) {
    const board = (found.get(target) || []).shift();
    if (!board) continue;
    // Check the minimum independently with the solver the game uses.
    const p = Solver.parse(board);
    const minMoves = Solver.solve(p.vehicles, p.pos).length;
    if (minMoves !== target) throw new Error(`Minimum moves mismatch for ${board}: ${minMoves} vs ${target}`);
    levels.push({ board, minMoves });
  }

  const out =
    '// Generated by tools/generate.js (seed ' + seed + (keep ? ', topping up earlier levels' : '') + '). Do not edit by hand.\n' +
    '// board: 36 cells row by row, "." empty, "A" red car. minMoves: fewest moves to solve.\n' +
    'window.GRIDLOCK_LEVELS = [\n' +
    levels.map((l) => `  { board: '${l.board}', minMoves: ${l.minMoves} },`).join('\n') +
    '\n];\n';
  fs.writeFileSync(LEVELS_FILE, out);
  console.log(`Wrote ${levels.length} levels in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
