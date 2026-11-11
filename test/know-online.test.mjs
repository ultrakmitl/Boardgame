import assert from 'node:assert/strict';
import test from 'node:test';
import {knowEnter, knowRoom} from '../src/know-online.mjs';
import {rules} from '../public/know-rules.js';

test('online room isolates hands, the secret rule and submissions through two rounds', () => {
  const host = knowEnter({name: 'A', create: true});
  const {code} = host;
  const sessions = [host, ...['B', 'C'].map(name => knowEnter({name, code}))];
  const auth = index => 'Bearer ' + sessions[index].token;
  const read = index => knowRoom(code, auth(index));
  const act = (index, action, fields = {}) =>
    knowRoom(code, auth(index), {action, revision: read(index).revision, ...fields});

  assert.equal(knowRoom(code, 'Bearer unknown'), null);
  assert.throws(() => act(1, 'start'));
  act(0, 'start');
  const secret = read(0).game.rule.label;
  assert.equal(read(1).game.rule, null);
  assert.equal(read(2).game.rule, null);
  assert.deepEqual(read(1).game.players.map(player => player.hand.length), [0, 7, 0]);
  assert.throws(() => act(1, 'begin'));
  act(0, 'begin');
  const rule = rules.find(candidate => candidate.label === secret);
  let last = read(0).game.clue;
  for (let i = 0; i < 100; i++) {
    const {game} = read(0);
    if (game.phase === 'guess') break;
    const {turn} = game;
    const hand = read(turn).game.players[turn].hand;
    const ids = [];
    let previous = last;
    for (const card of hand) {
      if (rule.matches(card, previous)) {
        ids.push(card.id);
        previous = card;
      }
    }
    assert.throws(() => act(turn === 1 ? 2 : 1, 'trade'));
    act(turn, ids.length ? 'play' : 'trade', {ids});
    assert.equal(read(turn === 1 ? 2 : 1).pending, undefined);
    assert(read(0).pending);
    assert.throws(() => act(turn, 'resolve'));
    act(0, 'resolve');
    last = previous;
  }

  const {game} = read(0);
  assert.equal(game.phase, 'guess');
  assert.deepEqual(read(game.turn === 1 ? 2 : 1).game.choices, []);
  act(game.turn, 'guess', {choice: rule.id});
  act(0, 'resolve');
  assert.equal(read(2).game.rule.label, secret);
  act(0, 'next');
  assert.equal(read(0).game.round, 2);
  assert.equal(read(0).game.keeper, 1);
  assert.equal(read(0).game.rule, null);
  assert.notEqual(read(1).game.rule.label, secret);
});
