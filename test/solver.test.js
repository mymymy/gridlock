'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Solver = require('../js/solver.js');

test('parses vehicles and orientation', () => {
  const { vehicles, pos } = Solver.parse(
    '..B...' +
    '..B...' +
    'AAB...' +
    '......' +
    '......' +
    '...CC.'
  );
  assert.deepStrictEqual(vehicles.map((v) => [v.id, v.horiz, v.len]), [['A', true, 2], ['B', false, 3], ['C', true, 2]]);
  assert.deepStrictEqual(pos, [0, 0, 3]);
});

test('solves a small puzzle optimally', () => {
  // The truck must drop down before the red car can leave: 2 moves.
  const { vehicles, pos } = Solver.parse(
    '......' +
    '......' +
    'AA.B..' +
    '...B..' +
    '...B..' +
    '......'
  );
  const moves = Solver.solve(vehicles, pos);
  assert.strictEqual(moves.length, 2);
});

test('rejects a red car off the exit row', () => {
  assert.throws(() => Solver.parse('AA' + '.'.repeat(34)));
});

test('every level is solvable in exactly its minimum moves', () => {
  global.window = {};
  require('../js/levels.js');
  const levels = global.window.GRIDLOCK_LEVELS;
  assert.ok(levels.length > 0);
  for (const { board, minMoves } of levels) {
    const { vehicles, pos } = Solver.parse(board);
    assert.strictEqual(Solver.solve(vehicles, pos).length, minMoves, board);
  }
});

test('every daily puzzle is solvable in exactly its minimum moves, and none repeats', () => {
  // The levels file may already be loaded (and cached) by the test above.
  global.window = global.window || {};
  require('../js/levels.js');
  require('../js/daily.js');
  const { start, puzzles } = global.window.GRIDLOCK_DAILY;
  assert.match(start, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(puzzles.length >= 365);
  const seen = new Set(global.window.GRIDLOCK_LEVELS.map((l) => l.board));
  for (const [board, minMoves] of puzzles) {
    assert.ok(!seen.has(board), `repeated: ${board}`);
    seen.add(board);
    const { vehicles, pos } = Solver.parse(board);
    assert.strictEqual(Solver.solve(vehicles, pos).length, minMoves, board);
  }
});
