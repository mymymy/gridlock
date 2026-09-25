#!/usr/bin/env node
// Generates js/levels.js: a set of puzzles with rising par (minimum moves).
//
// Method: place vehicles at random, explore every position reachable from
// that layout, then walk backwards from the solved positions to find how far
// each position is from a solution. Picking a position at a chosen distance
// gives a puzzle of known difficulty.
//
// Usage: node tools/generate.js [seed]
'use strict';

const fs = require('fs');
const path = require('path');
const RH = require('../js/solver.js');

const TARGETS = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  24, 26, 28, 30, 32, 34, 36, 38, 40, 43,
];
const TIME_BUDGET_MS = 60000;
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

function main() {
  const seed = Number(process.argv[2] || 2026);
  const rand = rng(seed);
  const started = Date.now();
  const byPar = new Map(); // par -> board
  const open = new Set(TARGETS);

  // Each random layout fills the hardest target it can still reach, so easy
  // and hard puzzles come from different layouts.
  for (let tries = 0; open.size && Date.now() - started < TIME_BUDGET_MS; tries++) {
    const { vehicles, pos } = RH.parse(randomLayout(rand));
    const result = distances(vehicles, pos);
    if (!result) continue;
    let max = 0;
    for (const d of result.dist.values()) if (d > max) max = d;
    const target = [...open].filter((t) => t <= max).sort((a, b) => b - a)[0];
    if (target === undefined) continue;
    const matches = [];
    for (const [k, d] of result.dist) if (d === target) matches.push(k);
    const k = matches[Math.floor(rand() * matches.length)];
    byPar.set(target, relabel(RH.stringify(vehicles, result.seen.get(k))));
    open.delete(target);
    console.log(`par ${String(target).padStart(2)} found after ${tries} layouts`);
  }
  if (open.size) console.warn(`Not found in time: ${[...open].join(', ')}`);

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
