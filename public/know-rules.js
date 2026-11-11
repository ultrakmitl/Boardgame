export const animals = ['หมู', 'หมา', 'กา', 'ไก่'];
export const colors = ['ชมพู', 'เหลือง', 'ฟ้า', 'เขียว'];

export const deck = colors.flatMap((_, color) =>
  Array.from({length: 18}, (_, slot) => {
    const mask = 1 + (slot + color * 4) % 15;
    return {
      id: color * 18 + slot,
      color,
      number: 1 + (slot + color * 2) % 6,
      animals: animals.map((_, index) => index).filter(index => mask & (1 << index)),
    };
  }),
);

const has = (card, animal) => card.animals.includes(animal);
const bird = card => has(card, 2) || has(card, 3);
const mammal = card => has(card, 0) || has(card, 1);
const shared = (card, previous) => card.animals.filter(animal => has(previous, animal)).length;

export const levels = ['ง่าย', 'กลาง', 'ยาก'];
const byLevel = [
  [
    ...colors.map((name, i) => [`พื้นไพ่สี${name}`, card => card.color === i]),
    ...animals.map((name, i) => [`มี${name}อย่างน้อยหนึ่งตัว`, card => has(card, i)]),
    ['เลขบนไพ่เป็นเลขคี่', card => card.number % 2 === 1],
    ['เลขบนไพ่เป็นเลขคู่', card => card.number % 2 === 0],
    ['เลขบนไพ่ไม่เกิน 3', card => card.number <= 3],
    ['มีสัตว์อย่างน้อย 3 ชนิด', card => card.animals.length >= 3],
    ...animals.map((name, i) => [`ไม่มี${name}`, card => !has(card, i)]),
    ['มีสัตว์ชนิดเดียว', card => card.animals.length === 1],
    ['มีสัตว์พอดี 2 ชนิด', card => card.animals.length === 2],
    ['มีสัตว์ปีกอย่างน้อยหนึ่งชนิด', bird],
    ['มีสัตว์สี่ขาอย่างน้อยหนึ่งชนิด', mammal],
  ],
  [
    ['มีทั้งสัตว์ปีกและสัตว์สี่ขา', card => bird(card) && mammal(card)],
    ['มีหมูหรือไก่อย่างน้อยหนึ่งชนิด', card => has(card, 0) || has(card, 3)],
    ['มีกาหรือไก่เพียงชนิดเดียว', card => has(card, 2) !== has(card, 3)],
    ['มีหมาแต่ไม่มีหมู', card => has(card, 1) && !has(card, 0)],
    ['เป็นสีฟ้าหรือมีไก่', card => card.color === 2 || has(card, 3)],
    ['เป็นสีเหลืองหรือมีหมู', card => card.color === 1 || has(card, 0)],
    ['เป็นเลขคู่หรือมีกา', card => card.number % 2 === 0 || has(card, 2)],
    ['เป็นเลขคี่หรือมีหมา', card => card.number % 2 === 1 || has(card, 1)],
    ['พื้นไพ่เป็นสีชมพูหรือเหลือง', card => card.color < 2],
    ['จำนวนชนิดสัตว์เป็นเลขคู่', card => card.animals.length % 2 === 0],
    ['เลขบนไพ่เท่ากับหรือมากกว่าจำนวนชนิดสัตว์', card => card.number >= card.animals.length],
    ['จำนวนชนิดสัตว์กับเลขบนไพ่เป็นคู่ทั้งสองหรือคี่ทั้งสอง', card => card.number % 2 === card.animals.length % 2],
    ['มีทั้งหมูและหมา', card => has(card, 0) && has(card, 1)],
    ['มีทั้งกาและไก่', card => has(card, 2) && has(card, 3)],
    ['มีเฉพาะสัตว์ปีก', card => !mammal(card)],
    ['มีเฉพาะสัตว์สี่ขา', card => !bird(card)],
    ['มีหมูหรือหมาเพียงชนิดเดียว', card => has(card, 0) !== has(card, 1)],
    ['ไพ่สีเขียวหรือเลขไม่เกิน 3', card => card.color === 3 || card.number <= 3],
    ['มีไก่และเลขเป็นคี่', card => has(card, 3) && card.number % 2 === 1],
    ['มีกาและเลขเป็นคู่', card => has(card, 2) && card.number % 2 === 0],
  ],
  [
    ['สีพื้นต้องต่างจากใบก่อน', (card, prev) => card.color !== prev.color],
    ['สีพื้นต้องเหมือนใบก่อน', (card, prev) => card.color === prev.color],
    ['เลขต้องต่างจากใบก่อน', (card, prev) => card.number !== prev.number],
    ['เลขต้องเป็นคู่สลับคี่กับใบก่อน', (card, prev) => card.number % 2 !== prev.number % 2],
    ['เลขต้องห่างจากใบก่อน 1 หรือ 2', (card, prev) => [1, 2].includes(Math.abs(card.number - prev.number))],
    ['มีสัตว์ซ้ำกับใบก่อนพอดี 1 ชนิด', (card, prev) => shared(card, prev) === 1],
    ['จำนวนชนิดสัตว์หรือเลขบนไพ่ต้องเท่ากับใบก่อน', (card, prev) => card.animals.length === prev.animals.length || card.number === prev.number],
    ['จำนวนชนิดสัตว์ต้องต่างจากใบก่อน', (card, prev) => card.animals.length !== prev.animals.length],
    ['มีสัตว์ปีกสลับกับไม่มีสัตว์ปีก', (card, prev) => bird(card) !== bird(prev)],
    ['มีสัตว์สี่ขาสลับกับไม่มีสัตว์สี่ขา', (card, prev) => mammal(card) !== mammal(prev)],
    ['ถ้าเลขเป็นคู่ สีต้องเหมือนใบก่อน ถ้าเป็นคี่ สีต้องต่าง', (card, prev) => (card.color === prev.color) === (card.number % 2 === 0)],
    ['สีต้องต่างจากใบก่อน และมีสัตว์ซ้ำอย่างน้อย 1 ชนิด', (card, prev) => card.color !== prev.color && shared(card, prev) >= 1],
    ['เลขต้องเท่ากับใบก่อน', (card, prev) => card.number === prev.number],
    ['เลขต้องห่างจากใบก่อนพอดี 1', (card, prev) => Math.abs(card.number - prev.number) === 1],
    ['ผลรวมเลขของไพ่สองใบต้องหาร 3 ลงตัว', (card, prev) => (card.number + prev.number) % 3 === 0],
    ['เลขและสีต้องต่างจากใบก่อนทั้งคู่', (card, prev) => card.number !== prev.number && card.color !== prev.color],
    ['เลขหรือสีต้องเหมือนใบก่อนอย่างน้อยหนึ่งอย่าง', (card, prev) => card.number === prev.number || card.color === prev.color],
    ['มีหมูสลับกับไม่มีหมู', (card, prev) => has(card, 0) !== has(prev, 0)],
    ['มีหมาสลับกับไม่มีหมา', (card, prev) => has(card, 1) !== has(prev, 1)],
    ['จำนวนชนิดสัตว์ต้องเป็นคู่สลับคี่กับใบก่อน', (card, prev) => card.animals.length % 2 !== prev.animals.length % 2],
  ],
];
export const rules = byLevel.flatMap((entries, level) =>
  entries.map(([label, matches], index) => ({id: level * 20 + index, level, label, matches})),
);

export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function nextGuesser(game) {
  const next = (game.turn + 1) % game.players.length;
  return next === game.keeper ? (next + 1) % game.players.length : next;
}

export function startGame(names, previous = null) {
  const keeper = previous ? (previous.keeper + 1) % names.length : 0;
  const round = previous ? previous.round + 1 : 1;

  const [rule] = shuffle(rules.filter(candidate => candidate.id !== previous?.rule.id));
  const draw = shuffle(deck);
  // A comparison rule begins with a neutral reference card.
  const clueIndex = rule.level === 2 ? 0 : draw.findIndex(card => rule.matches(card));
  const [clue] = draw.splice(clueIndex, 1);
  return {
    players: names.map((name, index) => ({name, hand: index === keeper ? [] : draw.splice(0, 7)})),
    rule, choices: [], keeper, round,
    draw, discard: [], clue, last: clue, log: [],
    turn: (keeper + 1) % names.length, phase: 'keeper', winner: null,
  };
}

export function beginRound(game) {
  if (game.phase === 'keeper') game.phase = 'play';
}

export function playTurn(game, ids, trade = false, keeperPick = null) {
  if (game.phase !== 'play') throw Error('ตานี้จบแล้ว');
  const player = game.players[game.turn];
  const cards = ids.map(id => player.hand.find(card => card.id === id));
  if (!trade && (!cards.length || cards.includes(undefined) || new Set(ids).size !== ids.length)) {
    throw Error('เลือกไพ่จากมือก่อนลง');
  }

  const record = {name: player.name, cards, accepted: false, text: ''};
  if (trade) {
    const passing = player.hand.filter(card => game.rule.matches(card, game.last));
    const legal = keeperPick === null ? passing[0] : passing.find(card => card.id === keeperPick);
    if (keeperPick !== null && !legal) throw Error('เลือกไพ่ที่ผ่านกฎ');
    record.cards = [...player.hand];
    if (legal) {
      game.last = legal;
      player.hand = player.hand.filter(card => card !== legal);
      record.text = 'พบไพ่ที่ผ่าน ผู้คุมกฎลงให้ 1 ใบและจั่วทดแทน';
      record.played = legal;
    } else {
      game.discard.push(...player.hand);
      player.hand = [];
      record.accepted = true;
      record.text = 'ไม่มีไพ่ที่ผ่าน รับไพ่ใหม่ลดลง 1 ใบ';
    }
    const count = legal ? 1 : record.cards.length - 1;
    if (game.draw.length < count) {
      game.draw.push(...shuffle(game.discard));
      game.discard = [];
    }
    // Recycle older accepted clues only if the draw and discard piles are exhausted.
    for (const item of game.log) {
      if (game.draw.length >= count) break;
      const recyclable = item.played ? [item.played] : item.accepted && !item.trade ? item.cards : [];
      if (!item.recycled && recyclable.length && !recyclable.includes(game.last)) {
        game.draw.push(...shuffle(recyclable));
        item.recycled = true;
      }
    }
    player.hand.push(...game.draw.splice(0, count));
    record.trade = true;
  } else {
    let previous = game.last;
    record.accepted = cards.every(card => {
      const matches = game.rule.matches(card, previous);
      previous = card;
      return matches;
    });
    if (record.accepted) {
      game.last = previous;
      player.hand = player.hand.filter(card => !ids.includes(card.id));
    }
    record.text = record.accepted ? 'ผ่านกฎ' : 'ไม่ผ่านกฎ รับไพ่คืนทั้งหมด';
  }
  game.log.push(record);
  if (!player.hand.length) {
    const decoys = shuffle(rules.filter(rule => rule !== game.rule));
    game.choices = shuffle([game.rule, ...decoys.slice(0, 2)]);
    game.phase = 'guess';
  }
  else game.turn = nextGuesser(game);
}

export function guessRule(game, id) {
  if (game.phase !== 'guess' || !game.choices.some(rule => rule.id === id)) return;
  if (game.rule.id === id) {
    game.winner = game.players[game.turn].name;
    game.phase = 'finished';
  } else {
    game.turn = nextGuesser(game);
  }
}
