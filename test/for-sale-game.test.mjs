import assert from 'node:assert/strict';
import test from 'node:test';
import {createGame, auction, sell, advance, ranking} from '../public/for-sale-game.js';

test('passing forfeits half rounded up and the auction winner opens the next round', () => {
  const game = createGame(3, () => 0);
  const [lowest, middle, highest] = game.market;
  auction(game, 3);
  assert.throws(() => auction(game, 3));
  auction(game, 5);
  auction(game, null);
  auction(game, null);
  assert.deepEqual(game.players.map(p => [p.cash, p.hand[0]]), [[26, middle], [23, highest], [28, lowest]]);
  advance(game);
  assert.equal(game.phase, 'buy');
  assert.equal(game.turn, 1);
});

for (const seats of [3, 4, 5, 6]) {
  test(`For Sale plays through both phases with ${seats} seats`, () => {
    const game = createGame(seats, () => 0.41);
    const rounds = {3: 10, 4: 7, 5: 6, 6: 5}[seats];
    for (let round = 1; round <= rounds; round++) {
      assert.equal(game.round, round);
      for (let i = 0; i < seats - 1; i++) auction(game, null);
      assert.equal(game.phase, 'bought');
      assert(game.players.every(player => player.hand.length === round));
      advance(game);
    }
    for (let round = 1; round <= rounds; round++) {
      assert.equal(game.phase, 'sell');
      const bids = game.players.map(player => ({id: player.id, house: player.hand[0]}));
      const expected = bids.slice().sort((a, b) => b.house - a.house).map((row, i) => ({
        ...row, check: game.market[seats - i - 1]
      }));
      for (const {id, house} of bids) sell(game, id, house);
      assert.deepEqual(game.lastSale, expected);
      advance(game);
    }
    assert.equal(game.phase, 'done');
    assert(game.players.every(player => player.hand.length === 0 && player.checks.length === rounds));
    const totals = ranking(game).map(row => row.total);
    assert.deepEqual(totals, totals.slice().sort((a, b) => b - a));
  });
}
