import assert from 'node:assert/strict';
import test from 'node:test';
import {forSaleEnter, forSaleRoom} from '../src/for-sale-online.mjs';

test('three online seats share the auction and sell privately through the final scores', () => {
  const host = forSaleEnter({create: true, name: 'Host'});
  const {code} = host;
  const sessions = [host, forSaleEnter({code, name: 'Guest 1'})];
  const call = (seat, input) => forSaleRoom(code, 'Bearer ' + sessions[seat].token, input);
  const act = (seat, action, data) => call(seat, {action, version: call(seat).version, ...data});
  assert.equal(forSaleRoom(code, 'Bearer unknown'), null);
  assert.throws(() => act(0, 'start'));
  sessions.push(forSaleEnter({code, name: 'Guest 2'}));
  assert.throws(() => act(1, 'start'));
  let state = act(0, 'start');
  assert.throws(() => forSaleEnter({code, name: 'Late guest'}));
  assert.throws(() => act((state.game.turn + 1) % 3, 'pass'));
  assert.throws(() => act(state.game.turn, 'bid', {bid: null}));
  state = act(state.game.turn, 'bid', {bid: 3});
  while (state.game.phase === 'buy') {
    while (state.game.phase === 'buy') state = act(state.game.turn, 'pass');
    const oldVersion = state.version;
    state = act(1, 'advance');
    assert.throws(() => call(0, {action: 'advance', version: oldVersion}));
  }
  assert.equal(state.game.phase, 'sell');
  for (let round = 1; round <= 10; round++) {
    const snapshots = sessions.map((_, seat) => call(seat));
    const cards = snapshots.map((snapshot, seat) => {
      assert.equal(snapshot.you, seat);
      assert(!('houses' in snapshot.game) && !('checks' in snapshot.game));
      assert(snapshot.game.players.every((player, id) => id === seat || (!('hand' in player) && !('cash' in player))));
      return snapshot.game.players[seat].hand[0];
    });
    for (let seat = 0; seat < 3; seat++) {
      const selection = {action: 'sell', match: snapshots[seat].match, round, card: cards[seat]};
      assert.throws(() => call(seat, {...selection, match: 0}));
      state = call(seat, selection);
      if (seat < 2) {
        assert.deepEqual(state.game.lastSale, []);
        assert.equal(call(seat + 1).game.players[seat].chosen, true);
        assert.throws(() => call(seat, selection));
      }
    }
    assert.equal(state.game.phase, 'sold');
    assert.deepEqual(state.game.lastSale.map(entry => entry.house), cards.slice().sort((a, b) => b - a));
    state = act(2, 'advance');
  }
  assert.equal(state.game.phase, 'done');
  assert.equal(state.game.results.length, 3);
  assert.throws(() => act(2, 'start'));
  assert.equal(act(0, 'start').game.phase, 'buy');
});
