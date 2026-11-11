import assert from 'node:assert/strict';
import test from 'node:test';
import {deck, rules, startGame, beginRound, playTurn, guessRule} from '../public/know-rules.js';

test('each rule has distinct outcomes, with passing and failing cards for every reference', () => {
  assert.equal(deck.length, 72);
  assert.equal(rules.length, 60);
  const signatures = new Set();
  for (const rule of rules) {
    const outcomes = deck.flatMap(previous => {
      const results = deck.filter(card => card !== previous).map(card => rule.matches(card, previous));
      const passes = results.filter(Boolean).length;
      assert(passes >= 5 && passes <= 67, rule.label);
      return results;
    });
    const signature = outcomes.map(Number).join('');
    assert(!signatures.has(signature), rule.label);
    signatures.add(signature);
  }
});

test('multi-card rejection is atomic and an incorrect final guess passes the turn', () => {
  const game = startGame(['A', 'B', 'C', 'D']);
  beginRound(game);
  game.rule = rules[0];
  const passing = deck.find(card => card.color === 0);
  const failing = deck.find(card => card.color !== 0);
  game.players[1].hand = [passing, failing];

  playTurn(game, [passing.id, failing.id]);
  assert.deepEqual(game.players[1].hand, [passing, failing]);
  assert.equal(game.log[0].accepted, false);
  assert.equal(game.turn, 2);

  game.players[2].hand = [passing];
  playTurn(game, [passing.id]);
  assert.equal(game.phase, 'guess');
  guessRule(game, game.choices.find(rule => rule !== game.rule).id);
  assert.equal(game.turn, 3);
  guessRule(game, rules[0].id);
  assert.equal(game.winner, 'D');
});

test('the keeper sits out, rotates each round, and gets a different rule', () => {
  const names = ['A', 'B', 'C'];
  let game = startGame(names);
  assert.equal(game.phase, 'keeper');
  for (let round = 1; round <= 12; round++) {
    assert.equal(game.round, round);
    assert.equal(game.keeper, (round - 1) % names.length);
    assert.equal(game.turn, round % names.length);
    assert.equal(game.players[game.keeper].hand.length, 0);
    assert(game.players.every((player, index) => index === game.keeper || player.hand.length === 7));
    const next = startGame(names, game);
    assert.notEqual(next.rule.id, game.rule.id);
    game = next;
  }
});

test('play and guess advance past the keeper when the seat order wraps', () => {
  const game = startGame(['A', 'B', 'C']);
  beginRound(game);
  game.rule = rules[0];
  const passing = deck.filter(card => card.color === 0);
  game.turn = 2;
  game.players[2].hand = passing.slice(0, 2);
  playTurn(game, [passing[0].id]);
  assert.equal(game.turn, 1);

  game.turn = 2;
  playTurn(game, [passing[1].id]);
  assert.equal(game.phase, 'guess');
  assert.equal(game.choices.length, 3);
  guessRule(game, game.choices.find(rule => rule !== game.rule).id);
  assert.equal(game.turn, 1);
});
test('every rule can be drawn on the first round', t => {
  for (const rule of rules) {
    let index = rules.length - 1;
    const mock = t.mock.method(Math, 'random', () => index-- === rule.id ? 0 : 0.999);
    assert.equal(startGame(['A', 'B', 'C']).rule, rule);
    mock.mock.restore();
  }
});