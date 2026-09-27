#!/usr/bin/env node
// Long-running search for very hard boards, for the top difficulty tier.
//
// A layout is a set of vehicles, each fixed to its own lane. The search
// scores a layout by its hardest puzzle: it lists every way the vehicles
// can sit in their lanes, then finds each position's distance to the
// nearest solved position with one breadth-first search backwards from all
// of them at once. Positions that can reach each other form a component,
// and each component's farthest position is a puzzle.
//
// It then climbs. A layout has only about 320 neighbours (a vehicle
// removed, added in any lane, or swapped for one in another lane), so the
// climb tries them in random order and moves to the first harder one, or
// along a plateau for a few steps. At a peak it restarts a few random steps
// away from the best board of one of the distinct families found so far,
// or from a random layout. Every layout's result is kept, so none is
// scored twice.
//
// Every puzzle of MIN_KEEP moves or more is appended to tools/hard-boards.txt
// as "moves positions climb board", which tools/generate.js reads when it
// fills the hardest tier.
//
// Usage: node tools/search.js [seconds] [seed]
// One process on one core; stop it at any time with Ctrl-C (or
// pkill -f tools/search.js). Boards found so far are already saved.
'use strict';

const fs = require('fs');
const path = require('path');
const Solver = require('../js/solver.js');

const { SIZE, EXIT_ROW, GOAL_COL } = Solver;
const MIN_KEEP = 42;
const MAX_POSITIONS = 400000; // layouts with more are too open to be hard
const MAX_LEVEL_STEPS = 3; // steps along a plateau before restarting
const OUT_FILE = path.join(__dirname, 'hard-boards.txt');
const LEVELS_FILE = path.join(__dirname, '..', 'js', 'levels.js');
const LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';

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

// Open-addressed table from packed position to index, reused between
// layouts: a slot counts as empty unless written in the current generation.
const SLOTS = 1 << 20; // over twice MAX_POSITIONS
const slotKey = new Float64Array(SLOTS);
const slotId = new Int32Array(SLOTS);
const slotGen = new Uint32Array(SLOTS);
let generation = 0;
function slotFor(k) {
  const lo = k % 4294967296;
  let h = Math.imul(lo ^ Math.imul((k - lo) / 4294967296, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 15;
  let i = h & (SLOTS - 1);
  while (slotGen[i] === generation && slotKey[i] !== k) i = (i + 1) & (SLOTS - 1);
  return i;
}

// Every component of a layout that can be solved, hardest first, as
// { moves, pos }. Positions are packed as integers, 3 bits per vehicle.
function survey(vehicles) {
  const n = vehicles.length;
  const cells = vehicles.map((v) => {
    const out = [];
    for (let p = 0; p + v.len <= SIZE; p++) {
      const cs = [];
      for (let k = 0; k < v.len; k++) cs.push(v.horiz ? v.fixed * SIZE + p + k : (p + k) * SIZE + v.fixed);
      out.push(cs);
    }
    return out;
  });
  const mult = [];
  for (let i = 0, m = 1; i < n; i++, m *= 8) mult.push(m);

  // 1. Every way the vehicles can sit in their lanes without overlapping.
  generation++;
  let cap = 65536;
  let pos = new Uint8Array(cap * n);
  let keys = new Float64Array(cap);
  let count = 0;
  const grid = new Int8Array(SIZE * SIZE).fill(-1);
  const cur = new Uint8Array(n);
  let overflow = false;
  const place = (i, key) => {
    if (overflow) return;
    if (i === n) {
      if (count === MAX_POSITIONS) {
        overflow = true;
        return;
      }
      if (count === cap) {
        cap *= 2;
        const p2 = new Uint8Array(cap * n);
        p2.set(pos);
        pos = p2;
        const k2 = new Float64Array(cap);
        k2.set(keys);
        keys = k2;
      }
      pos.set(cur, count * n);
      keys[count] = key;
      const slot = slotFor(key);
      slotGen[slot] = generation;
      slotKey[slot] = key;
      slotId[slot] = count++;
      return;
    }
    const lane = cells[i];
    for (let p = 0; p < lane.length; p++) {
      const cs = lane[p];
      let free = true;
      for (const c of cs) if (grid[c] !== -1) free = false;
      if (!free) continue;
      for (const c of cs) grid[c] = i;
      cur[i] = p;
      place(i + 1, key + p * mult[i]);
      for (const c of cs) grid[c] = -1;
    }
  };
  place(0, 0);
  if (overflow) return null;

  // 2. Distances from the nearest solved position, one search from all of
  // them. Each position inherits the solved position it was reached from;
  // when a move joins two such searches their components are one and the
  // same, so union-find merges them.
  const dist = new Int16Array(count).fill(-1);
  const from = new Int32Array(count);
  const parent = new Int32Array(count);
  const queue = new Int32Array(count);
  let tail = 0;
  for (let s = 0; s < count; s++) {
    if (pos[s * n] === GOAL_COL) {
      dist[s] = 0;
      from[s] = s;
      parent[s] = s;
      queue[tail++] = s;
    }
  }
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let h = 0; h < tail; h++) {
    const u = queue[h];
    const base = u * n;
    grid.fill(-1);
    for (let j = 0; j < n; j++) for (const c of cells[j][pos[base + j]]) grid[c] = j;
    for (let j = 0; j < n; j++) {
      const p = pos[base + j];
      const len = vehicles[j].len;
      const lane = cells[j];
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let q = p + dir; q >= 0 && q + len <= SIZE; q += dir) {
          if (grid[dir < 0 ? lane[q][0] : lane[q][len - 1]] !== -1) break;
          const v = slotId[slotFor(keys[u] + (q - p) * mult[j])];
          if (dist[v] < 0) {
            dist[v] = dist[u] + 1;
            from[v] = from[u];
            queue[tail++] = v;
          } else {
            const a = find(from[u]);
            const b = find(from[v]);
            if (a !== b) parent[a] = b;
          }
        }
      }
    }
  }

  // 3. The farthest position of each component. The queue runs in order of
  // distance, so walking it backwards meets each component's farthest first.
  const seen = new Set();
  const out = [];
  for (let h = tail - 1; h >= 0; h--) {
    const u = queue[h];
    const r = find(from[u]);
    if (seen.has(r)) continue;
    seen.add(r);
    out.push({ moves: dist[u], pos: Array.from(pos.subarray(u * n, u * n + n)) });
  }
  return { positions: count, components: out };
}

// Rename vehicles B, C, D… in reading order so boards look tidy.
function relabel(board) {
  const map = { '.': '.', A: 'A' };
  let next = 'B'.charCodeAt(0);
  return [...board].map((c) => (c in map ? map[c] : (map[c] = String.fromCharCode(next++)))).join('');
}

// ---- Random starting layouts ----
function place(grid, id, horiz, len, r, c) {
  const cells = [];
  for (let k = 0; k < len; k++) cells.push(horiz ? r * SIZE + c + k : (r + k) * SIZE + c);
  if (cells.some((i) => grid[i] !== '.')) return false;
  cells.forEach((i) => (grid[i] = id));
  return true;
}

function randomLayout(rand) {
  const grid = new Array(SIZE * SIZE).fill('.');
  place(grid, 'A', true, 2, EXIT_ROW, Math.floor(rand() * 3));
  const want = 11 + Math.floor(rand() * 5);
  let placed = 0;
  for (let attempt = 0; attempt < 200 && placed < want; attempt++) {
    const horiz = rand() < 0.5;
    const len = rand() < 0.75 ? 2 : 3;
    const r = Math.floor(rand() * (horiz ? SIZE : SIZE - len + 1));
    const c = Math.floor(rand() * (horiz ? SIZE - len + 1 : SIZE));
    if (horiz && r === EXIT_ROW) continue;
    if (place(grid, LETTERS[placed], horiz, len, r, c)) placed++;
  }
  return grid.join('');
}

// Compare layouts by which cells hold across and up-and-down vehicles.
function shape(board) {
  const out = [...board];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '.') out[i] = board[i + 1] === board[i] || board[i - 1] === board[i] ? 'h' : 'v';
  }
  return out;
}
const difference = (a, b) => a.reduce((n, c, i) => n + (c !== b[i]), 0);

// ---- Layouts as lists of lanes ----
// Every lane a vehicle other than the red car can use: across or up and
// down, two or three long, in any row or column, but never across the exit
// row, where it would block the red car for good.
const LANES = [];
for (const horiz of [true, false]) {
  for (const len of [2, 3]) {
    for (let line = 0; line < SIZE; line++) if (!(horiz && line === EXIT_ROW)) LANES.push({ horiz, len, line });
  }
}
const laneKey = (l) => (l.horiz ? 'h' : 'v') + l.len + l.line;
const layoutKey = (lanes) => lanes.map(laneKey).sort().join(' ');
const lanesOf = (board) => Solver.parse(board).vehicles.slice(1).map((v) => ({ horiz: v.horiz, len: v.len, line: v.fixed }));

// A layout's hardest puzzle, plus every puzzle of MIN_KEEP moves or more.
// Climbs revisit layouts often, so results are kept.
const cache = new Map();
function evaluate(lanes) {
  const key = layoutKey(lanes);
  if (cache.has(key)) return cache.get(key);
  const vehicles = [
    { id: 'A', horiz: true, len: 2, fixed: EXIT_ROW },
    ...lanes.map((l, i) => ({ id: LETTERS[i], horiz: l.horiz, len: l.len, fixed: l.line })),
  ];
  const s = survey(vehicles);
  let result = null;
  if (s && s.components.length) {
    const toBoard = (c) => relabel(Solver.stringify(vehicles, c.pos));
    result = {
      lanes,
      moves: s.components[0].moves,
      board: toBoard(s.components[0]),
      positions: s.positions,
      hard: s.components.filter((c) => c.moves >= MIN_KEEP).map((c) => ({ board: toBoard(c), moves: c.moves })),
    };
  }
  cache.set(key, result);
  return result;
}
const evaluateBoard = (board) => evaluate(lanesOf(board));

// Every layout one change away: a vehicle removed, added, or swapped for
// one in another lane. About 320 of them.
function neighbours(lanes) {
  const out = [];
  for (let i = 0; i < lanes.length; i++) out.push(lanes.filter((_, j) => j !== i));
  if (lanes.length < LETTERS.length) for (const l of LANES) out.push([...lanes, l]);
  for (let i = 0; i < lanes.length; i++) {
    for (const l of LANES) if (laneKey(l) !== laneKey(lanes[i])) out.push(lanes.map((x, j) => (j === i ? l : x)));
  }
  return out;
}

function main() {
  const seconds = Number(process.argv[2] || 60);
  const seed = Number(process.argv[3] || Date.now() % 100000);
  const rand = rng(seed);
  const started = Date.now();
  const elapsed = () => (Date.now() - started) / 1000;
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // Boards already on file, so a rerun adds only new ones.
  const known = new Set();
  const pool = []; // { board, moves }
  if (fs.existsSync(OUT_FILE)) {
    for (const line of fs.readFileSync(OUT_FILE, 'utf8').split('\n')) {
      const [moves, , , board] = line.trim().split(/\s+/);
      if (!board) continue;
      known.add(board);
      pool.push({ board, moves: Number(moves) });
    }
  }
  // The hardest levels already in the game make good starting points too.
  const text = fs.readFileSync(LEVELS_FILE, 'utf8');
  for (const [, board, moves] of text.matchAll(/board: '([A-Z.]{36})', minMoves: (\d+)/g)) {
    const e = Number(moves) >= 30 && evaluateBoard(board);
    if (e) pool.push({ board: e.board, moves: e.moves });
  }

  let evaluations = 0;
  let best = 0;
  let climb = 0;
  const tally = {};
  const record = (e) => {
    for (const h of e.hard) {
      if (known.has(h.board)) continue;
      known.add(h.board);
      pool.push(h);
      tally[h.moves] = (tally[h.moves] || 0) + 1;
      fs.appendFileSync(OUT_FILE, `${h.moves} ${e.positions} ${seed}-${climb} ${h.board}\n`);
    }
    if (e.moves > best) {
      best = e.moves;
      console.log(`${e.moves} moves at ${elapsed().toFixed(0)}s, climb ${climb}: ${e.board}`);
    }
  };
  let lastReport = 0;
  const report = () => {
    if (elapsed() - lastReport < 30) return;
    lastReport = elapsed();
    console.log(`… ${elapsed().toFixed(0)}s, ${evaluations} layouts scored (${(evaluations / elapsed()).toFixed(1)}/s), hardest ${best}, new puzzles by moves ${JSON.stringify(tally)}`);
  };

  // Start a few random steps away from the best board of one of the
  // distinct families found so far (near-identical boards pile up in the
  // pool, and the peaks themselves have been searched around already), or
  // from a random layout.
  const startingLanes = () => {
    if (pool.length && rand() < 0.6) {
      const families = [];
      for (const b of pool.slice().sort((a, b) => b.moves - a.moves)) {
        const sh = shape(b.board);
        if (families.every((f) => difference(f.shape, sh) >= 10)) families.push({ board: b.board, shape: sh });
        if (families.length === 12) break;
      }
      let lanes = lanesOf(families[Math.floor(rand() * families.length)].board);
      for (let k = 2 + Math.floor(rand() * 2); k > 0; k--) {
        const options = neighbours(lanes);
        lanes = options[Math.floor(rand() * options.length)];
      }
      return lanes;
    }
    return lanesOf(randomLayout(rand));
  };

  console.log(`Searching for ${seconds}s (seed ${seed}); keeping puzzles of ${MIN_KEEP}+ moves in ${path.relative(process.cwd(), OUT_FILE)}`);
  while (elapsed() < seconds) {
    climb++;
    let current = evaluate(startingLanes());
    evaluations++;
    if (!current) continue;
    record(current);
    // First improvement: take the first neighbour that is harder. At a peak,
    // walk along a level neighbour not yet visited, a few times at most.
    const visited = new Set([layoutKey(current.lanes)]);
    let level = 0;
    while (elapsed() < seconds) {
      let harder = null;
      let same = null;
      for (const lanes of shuffle(neighbours(current.lanes))) {
        if (elapsed() >= seconds) break;
        const key = layoutKey(lanes);
        const fresh = !cache.has(key);
        const e = evaluate(lanes);
        if (fresh) evaluations++;
        report();
        if (!e) continue;
        if (fresh) record(e);
        if (e.moves > current.moves) {
          harder = e;
          break;
        }
        if (!same && e.moves === current.moves && !visited.has(key)) same = e;
      }
      if (harder) {
        current = harder;
        level = 0;
      } else if (same && level < MAX_LEVEL_STEPS) {
        current = same;
        level++;
      } else break;
      visited.add(layoutKey(current.lanes));
    }
  }
  console.log(`Done: ${evaluations} layouts scored, hardest ${best}, new puzzles by moves: ${JSON.stringify(tally)}`);
}

if (require.main === module) main();
else module.exports = { survey, evaluate, evaluateBoard, neighbours, lanesOf, randomLayout, rng, shape, difference };
