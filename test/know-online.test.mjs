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
  const {rules: options} = read(0).setup;
  assert.equal(new Set(options.map(option => option.id)).size, 3);
  assert.equal(read(1).setup, undefined);
  assert.throws(() => act(1, 'choose-rule', {ruleId: options[0].id}));
  assert.throws(() => act(0, 'choose-rule', {ruleId: -1}));
  act(0, 'choose-rule', {ruleId: options[0].id});
  const secret = read(0).game.rule.label;
  const {cards} = read(0).setup;
  assert(cards.length > 0);
  assert.equal(read(1).setup, undefined);
  assert.equal(read(1).game.clue, null);
  assert.equal(read(1).game.rule, null);
  assert.equal(read(2).game.rule, null);
  assert.deepEqual(read(1).game.players.map(player => player.hand.length), [0, 7, 0]);
  assert.throws(() => act(1, 'begin'));
  assert.throws(() => act(0, 'begin', {cardId: -1}));
  act(0, 'begin', {cardId: cards[0].id});
  assert.deepEqual(read(1).game.clue, cards[0]);
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
    const spectator = read(turn === 1 ? 2 : 1);
    assert.equal(spectator.pending, undefined);
    assert.deepEqual(spectator.submission, {
      trade: !ids.length,
      cards: ids.length ? ids.map(id => hand.find(card => card.id === id)) : hand,
    });
    assert.deepEqual(spectator.game.players[turn].hand, []);
    assert(read(0).pending);
    assert.throws(() => act(turn, 'resolve'));
    act(0, 'resolve');
    assert.equal(read(turn).submission, undefined);
    last = previous;
  }

  const {game} = read(0);
  assert.equal(game.phase, 'guess');
  assert.deepEqual(read(game.turn === 1 ? 2 : 1).game.choices, []);
  act(game.turn, 'guess', {choice: rule.id});
  assert.equal(read(game.turn === 1 ? 2 : 1).submission, undefined);
  assert.equal(read(game.turn === 1 ? 2 : 1).pending, undefined);
  act(0, 'resolve');
  assert.equal(read(2).game.rule.label, secret);
  act(0, 'next');
  assert.equal(read(0).game.round, 2);
  assert.equal(read(0).game.keeper, 1);
  assert.equal(read(0).game.rule, null);
  assert(read(1).setup.rules.every(option => option.label !== secret));
});

test('each card turn gets a fresh deadline and keeper review stops the clock', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const host = knowEnter({name: 'Host', create: true});
  const {code} = host;
  const sessions = [host, ...['B', 'C'].map(name => knowEnter({name, code}))];
  const auth = index => 'Bearer ' + sessions[index].token;
  const read = index => knowRoom(code, auth(index));
  const act = (index, action, fields = {}) =>
    knowRoom(code, auth(index), {action, revision: read(index).revision, ...fields});

  act(0, 'set-time', {minutes: 1});
  act(0, 'start');
  act(0, 'choose-rule', {ruleId: read(0).setup.rules[0].id});
  act(0, 'begin', {cardId: read(0).setup.cards[0].id});
  const first = read(1);
  assert.equal(first.deadline, now + 60000);
  const hand = first.game.players[1].hand;

  now = first.deadline;
  assert.throws(() => knowRoom(code, auth(1), {
    action: 'play', revision: first.revision, ids: [hand[0].id],
  }));
  const second = read(2);
  assert.equal(second.game.turn, 2);
  assert.equal(second.game.phase, 'play');
  assert.equal(second.deadline, now + 60000);
  assert.deepEqual(read(1).game.players[1].hand, hand);

  now += 59000;
  act(2, 'trade');
  assert.equal(read(1).deadline, null);
  now += 120000;
  assert.equal(read(0).game.turn, 2);
  assert(read(0).pending);
  act(0, 'resolve');
  assert.equal(read(1).game.turn, 1);
  assert.equal(read(1).deadline, now + 60000);
});
