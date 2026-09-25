// Rush Hour board model and breadth-first solver.
// A board is a 36-character string, row by row: '.' is empty, 'A' is the red
// car (always horizontal on the exit row), any other letter is a vehicle.
// Works in the browser (window.RushHour) and in Node (module.exports).
(function (root) {
  'use strict';

  const SIZE = 6;
  const EXIT_ROW = 2;
  const GOAL_COL = SIZE - 2; // red car's left edge when it reaches the exit

  // Parse a board string into fixed vehicle data plus a mutable position array.
  // Horizontal vehicles move along their row, vertical ones along their column.
  function parse(board) {
    if (board.length !== SIZE * SIZE) throw new Error('Board must be 36 cells');
    const cells = {};
    for (let i = 0; i < board.length; i++) {
      const c = board[i];
      if (c === '.') continue;
      (cells[c] = cells[c] || []).push(i);
    }
    const ids = Object.keys(cells).sort();
    if (ids[0] !== 'A') throw new Error('Board has no red car');
    const vehicles = [];
    const pos = [];
    for (const id of ids) {
      const list = cells[id];
      const r0 = Math.floor(list[0] / SIZE);
      const c0 = list[0] % SIZE;
      const horiz = list.length > 1 && list[1] === list[0] + 1;
      const len = list.length;
      if (len < 2 || len > 3) throw new Error(`Vehicle ${id} has length ${len}`);
      vehicles.push({ id, horiz, len, fixed: horiz ? r0 : c0 });
      pos.push(horiz ? c0 : r0);
    }
    if (!vehicles[0].horiz || vehicles[0].fixed !== EXIT_ROW) {
      throw new Error('Red car must be horizontal on the exit row');
    }
    return { vehicles, pos };
  }

  function stringify(vehicles, pos) {
    const out = new Array(SIZE * SIZE).fill('.');
    vehicles.forEach((v, i) => {
      for (let k = 0; k < v.len; k++) {
        const r = v.horiz ? v.fixed : pos[i] + k;
        const c = v.horiz ? pos[i] + k : v.fixed;
        out[r * SIZE + c] = v.id;
      }
    });
    return out.join('');
  }

  function occupancy(vehicles, pos) {
    const grid = new Int8Array(SIZE * SIZE).fill(-1);
    vehicles.forEach((v, i) => {
      for (let k = 0; k < v.len; k++) {
        const r = v.horiz ? v.fixed : pos[i] + k;
        const c = v.horiz ? pos[i] + k : v.fixed;
        grid[r * SIZE + c] = i;
      }
    });
    return grid;
  }

  // How far vehicle i can slide from its current spot: [lowest, highest] position.
  function range(vehicles, pos, i, grid) {
    grid = grid || occupancy(vehicles, pos);
    const v = vehicles[i];
    const at = (p) => (v.horiz ? v.fixed * SIZE + p : p * SIZE + v.fixed);
    let lo = pos[i];
    while (lo > 0 && grid[at(lo - 1)] === -1) lo--;
    let hi = pos[i];
    while (hi + v.len < SIZE && grid[at(hi + v.len)] === -1) hi++;
    return [lo, hi];
  }

  const isSolved = (pos) => pos[0] === GOAL_COL;
  const key = (pos) => pos.join('');

  // Every position reachable in one move. Sliding any distance counts as one move.
  function neighbours(vehicles, pos) {
    const grid = occupancy(vehicles, pos);
    const out = [];
    for (let i = 0; i < vehicles.length; i++) {
      const [lo, hi] = range(vehicles, pos, i, grid);
      for (let p = lo; p <= hi; p++) {
        if (p === pos[i]) continue;
        const next = pos.slice();
        next[i] = p;
        out.push({ vehicle: i, from: pos[i], to: p, pos: next });
      }
    }
    return out;
  }

  // Shortest solution as a list of moves, or null if the board can't be solved.
  function solve(vehicles, pos, maxStates) {
    maxStates = maxStates || 500000;
    const startKey = key(pos);
    if (isSolved(pos)) return [];
    const parent = new Map([[startKey, null]]);
    let frontier = [pos];
    while (frontier.length) {
      const next = [];
      for (const p of frontier) {
        for (const n of neighbours(vehicles, p)) {
          const k = key(n.pos);
          if (parent.has(k)) continue;
          parent.set(k, { prev: key(p), move: n });
          if (isSolved(n.pos)) return tracePath(parent, k);
          if (parent.size > maxStates) return null;
          next.push(n.pos);
        }
      }
      frontier = next;
    }
    return null;
  }

  function tracePath(parent, k) {
    const moves = [];
    for (let step = parent.get(k); step; step = parent.get(step.prev)) {
      const { vehicle, from, to } = step.move;
      moves.push({ vehicle, from, to });
    }
    return moves.reverse();
  }

  const api = { SIZE, EXIT_ROW, GOAL_COL, parse, stringify, occupancy, range, neighbours, isSolved, key, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RushHour = api;
})(typeof window !== 'undefined' ? window : globalThis);
