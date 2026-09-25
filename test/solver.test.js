'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RH = require('../js/solver.js');

test('parses vehicles and orientation', () => {
  const { vehicles, pos } = RH.parse(
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
  const { vehicles, pos } = RH.parse(
    '......' +
    '......' +
    'AA.B..' +
    '...B..' +
    '...B..' +
    '......'
  );
  const moves = RH.solve(vehicles, pos);
  assert.strictEqual(moves.length, 2);
});

test('rejects a red car off the exit row', () => {
  assert.throws(() => RH.parse('AA' + '.'.repeat(34)));
});

test('every level is solvable in exactly its par', () => {
  global.window = {};
  require('../js/levels.js');
  const levels = global.window.RUSH_HOUR_LEVELS;
  assert.ok(levels.length > 0);
  for (const { board, par } of levels) {
    const { vehicles, pos } = RH.parse(board);
    assert.strictEqual(RH.solve(vehicles, pos).length, par, board);
  }
});
