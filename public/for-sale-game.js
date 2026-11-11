const values = (count, start = 1) => Array.from({length: count}, (_, i) => start + i);
export const properties = values(30);
export const checks = [0, ...values(14, 2)].flatMap(value => [value, value]);
export const budgets = {3: 28, 4: 21, 5: 16, 6: 14};

function shuffle(cards, random) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function createGame(seats, random = Math.random) {
  if (!Number.isInteger(seats) || !budgets[seats]) throw new Error('เลือกผู้เล่น 3–6 คน');
  const size = seats === 4 ? 28 : 30;
  const game = {
    phase: 'buy', round: 0, rounds: size / seats, market: [], lastSale: [],
    houses: shuffle(properties, random).slice(0, size),
    checks: shuffle(checks, random).slice(0, size),
    players: values(seats, 0).map(id => ({id, cash: budgets[seats], bid: 0, hand: [], checks: [], passed: false, chosen: null}))
  };
  buyRound(game, Math.floor(random() * seats));
  return game;
}

function buyRound(game, leader) {
  game.phase = 'buy';
  game.round++;
  game.turn = leader;
  game.high = 0;
  game.market = game.houses.splice(0, game.players.length).sort((a, b) => a - b);
  for (const player of game.players) Object.assign(player, {bid: 0, passed: false, acquired: null});
}

function sellRound(game) {
  game.phase = 'sell';
  game.round++;
  game.market = game.checks.splice(0, game.players.length).sort((a, b) => a - b);
  for (const player of game.players) player.chosen = null;
}

export function auction(game, bid) {
  if (game.phase !== 'buy') throw new Error('รอบประมูลสิ้นสุดแล้ว');
  const player = game.players[game.turn];
  if (bid === null) {
    player.cash -= Math.ceil(player.bid / 2);
    player.passed = true;
    player.acquired = game.market.shift();
    player.hand.push(player.acquired);
  } else {
    if (!Number.isInteger(bid) || bid <= game.high || bid > player.cash) throw new Error('ยอดบิดต้องสูงกว่ายอดปัจจุบันและอยู่ในงบ');
    game.high = player.bid = bid;
  }
  const active = game.players.filter(seat => !seat.passed);
  if (active.length === 1) {
    const winner = active[0];
    winner.cash -= winner.bid;
    winner.acquired = game.market.shift();
    winner.hand.push(winner.acquired);
    game.turn = winner.id;
    game.phase = 'bought';
    return;
  }
  do {
    game.turn = (game.turn + 1) % game.players.length;
  } while (game.players[game.turn].passed);
}

export function sell(game, id, house) {
  const player = game.players[id];
  if (game.phase !== 'sell' || !player || player.chosen !== null || !player.hand.includes(house)) throw new Error('เลือกการ์ดที่ยังอยู่ในมือ');
  player.chosen = house;
  if (game.players.some(seat => seat.chosen === null)) return;
  game.lastSale = [...game.players].sort((a, b) => a.chosen - b.chosen).map((seat, i) => {
    const check = game.market[i];
    seat.checks.push(check);
    seat.hand.splice(seat.hand.indexOf(seat.chosen), 1);
    return {id: seat.id, house: seat.chosen, check};
  }).reverse();
  game.phase = 'sold';
}

export function advance(game) {
  if (game.phase === 'bought') {
    if (game.houses.length) buyRound(game, game.turn);
    else {
      game.round = 0;
      sellRound(game);
    }
  } else if (game.phase === 'sold') {
    if (game.checks.length) sellRound(game);
    else game.phase = 'done';
  }
}

export function ranking(game) {
  return game.players.map(player => {
    const proceeds = player.checks.reduce((sum, check) => sum + check, 0);
    return {id: player.id, cash: player.cash, proceeds, total: proceeds + player.cash};
  }).sort((a, b) => b.total - a.total || b.cash - a.cash);
}
