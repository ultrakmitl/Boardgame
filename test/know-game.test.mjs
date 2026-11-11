import assert from 'node:assert/strict';
import test from 'node:test';
import {animals, colors, deck, rules, startGame, selectRule, clueOptions, beginRound, playTurn, guessRule} from '../public/know-rules.js';

function beginWithFirstOption(game) {
  selectRule(game, game.ruleOptions[0].id);
  beginRound(game, clueOptions(game)[0].id);
}

test('each animal and rank comes in all three colors exactly once', () => {
  assert.equal(animals.length, 4);
  assert.equal(colors.length, 3);
  assert.equal(new Set(deck.map(card => card.id)).size, 72);
  for (const animal of animals.keys()) {
    for (let number = 1; number <= 6; number++) {
      const variants = deck.filter(card => card.animal === animal && card.number === number);
      assert.deepEqual(variants.map(card => card.color).sort(), [0, 1, 2]);
    }
  }
});

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
  beginWithFirstOption(game);
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
    beginWithFirstOption(game);
    assert.equal(game.players[game.keeper].hand.length, 0);
    assert(game.players.every((player, index) => index === game.keeper || player.hand.length === 7));
    const next = startGame(names, game);
    assert(next.ruleOptions.every(option => !game.usedRuleIds.includes(option.id)));
    game = next;
  }
});

test('play and guess advance past the keeper when the seat order wraps', () => {
  const game = startGame(['A', 'B', 'C']);
  beginWithFirstOption(game);
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
    assert.equal(startGame(['A', 'B', 'C']).ruleOptions[0], rule);
    mock.mock.restore();
  }
});

test('all players tied for most cards lose a point, including the correct guesser', () => {
  const game = startGame(['Keeper', 'First guess', 'Correct guess', 'Other']);
  beginWithFirstOption(game);
  game.phase = 'guess';
  game.choices = [game.rule];
  game.turn = 2;
  game.players[1].hand = [];
  game.players[2].hand = deck.slice(0, 4);
  game.players[3].hand = deck.slice(4, 8);

  guessRule(game, game.rule.id);
  guessRule(game, game.rule.id);

  assert.equal(game.winner, 'Correct guess');
  assert.deepEqual(game.players.map(player => player.roundScore), [0, 0, 0, -1]);
  assert.deepEqual(game.players.map(player => player.score), [0, 0, 0, -1]);
  assert.deepEqual(game.matchWinners, []);
});

test('scores carry over one full keeper rotation and tied leaders share the win', () => {
  const names = ['A', 'B', 'C'];
  let game = startGame(names);
  for (let round = 1; round <= names.length; round++) {
    beginWithFirstOption(game);
    game.phase = 'guess';
    game.choices = [game.rule];
    game.players[game.turn].hand = [];
    guessRule(game, game.rule.id);

    if (round < names.length) {
      assert.deepEqual(game.matchWinners, []);
      game = startGame(names, game);
    }
  }

  assert.deepEqual(game.players.map(player => player.score), [0, 0, 0]);
  assert.deepEqual(game.matchWinners, names);
  assert.deepEqual(startGame(names).players.map(player => player.score), [0, 0, 0]);
});
