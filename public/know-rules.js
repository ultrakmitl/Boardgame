export const animals = ['หมู', 'หมา', 'กา', 'ไก่'];
export const colors = ['ชมพู', 'เหลือง', 'ฟ้า'];

export const deck = colors.flatMap((_, color) =>
  animals.flatMap((_, animal) =>
    Array.from({length: 6}, (_, rank) => ({
      id: color * 24 + animal * 6 + rank,
      color,
      number: rank + 1,
      animal,
    })),
  ),
);

const has = (card, animal) => card.animal === animal;
const bird = card => card.animal >= 2;
const mammal = card => card.animal < 2;

export const levels = ['ง่าย', 'กลาง', 'ยาก'];
const byLevel = [
  [
    ...colors.map((name, i) => [`พื้นไพ่สี${name}`, card => card.color === i]),
    ...animals.map((name, i) => [`มี${name}อย่างน้อยหนึ่งตัว`, card => has(card, i)]),
    ['เลขบนไพ่เป็นเลขคี่', card => card.number % 2 === 1],
    ['เลขบนไพ่เป็นเลขคู่', card => card.number % 2 === 0],
    ['เลขบนไพ่ไม่เกิน 3', card => card.number <= 3],
    ['เลขบนไพ่คือ 1', card => card.number === 1],
    ...animals.map((name, i) => [`ไม่มี${name}`, card => !has(card, i)]),
    ['เลขบนไพ่คือ 6', card => card.number === 6],
    ['เลขบนไพ่เป็น 2 หรือ 5', card => [2, 5].includes(card.number)],
    ['เป็นสัตว์ปีก', bird],
    ['เป็นสัตว์สี่ขา', mammal],
    ['เลขบนไพ่เป็น 3 หรือ 4', card => [3, 4].includes(card.number)],
  ],
  [
    ['เป็นสัตว์ปีกบนพื้นสีฟ้า', card => bird(card) && card.color === 2],
    ['มีหมูหรือไก่อย่างน้อยหนึ่งชนิด', card => has(card, 0) || has(card, 3)],
    ['เป็นสัตว์ปีกและเลขไม่เกิน 3', card => bird(card) && card.number <= 3],
    ['เป็นหมาหรือกา', card => has(card, 1) || has(card, 2)],
    ['เป็นสีฟ้าหรือมีไก่', card => card.color === 2 || has(card, 3)],
    ['เป็นสีเหลืองหรือมีหมู', card => card.color === 1 || has(card, 0)],
    ['เป็นเลขคู่หรือมีกา', card => card.number % 2 === 0 || has(card, 2)],
    ['เป็นเลขคี่หรือมีหมา', card => card.number % 2 === 1 || has(card, 1)],
    ['พื้นไพ่เป็นสีชมพูหรือเหลือง', card => card.color < 2],
    ['พื้นสีชมพูและเลขเป็นคู่', card => card.color === 0 && card.number % 2 === 0],
    ['พื้นสีเหลืองและเลขตั้งแต่ 4 ขึ้นไป', card => card.color === 1 && card.number >= 4],
    ['สัตว์ปีกต้องเป็นเลขคู่ สัตว์สี่ขาต้องเป็นเลขคี่', card => bird(card) === (card.number % 2 === 0)],
    ['เป็นหมูและเลขไม่เกิน 3', card => has(card, 0) && card.number <= 3],
    ['เป็นกาหรือหมู', card => has(card, 2) || has(card, 0)],
    ['เป็นไพ่สีชมพูหรือสัตว์สี่ขา', card => card.color === 0 || mammal(card)],
    ['เป็นไพ่สีฟ้าและเลขเป็นคี่', card => card.color === 2 && card.number % 2 === 1],
    ['เป็นหมาหรือไก่', card => has(card, 1) || has(card, 3)],
    ['เป็นไพ่สีฟ้าหรือเลขไม่เกิน 3', card => card.color === 2 || card.number <= 3],
    ['มีไก่และเลขเป็นคี่', card => has(card, 3) && card.number % 2 === 1],
    ['มีกาและเลขเป็นคู่', card => has(card, 2) && card.number % 2 === 0],
  ],
  [
    ['สีพื้นต้องต่างจากใบก่อน', (card, prev) => card.color !== prev.color],
    ['สีพื้นต้องเหมือนใบก่อน', (card, prev) => card.color === prev.color],
    ['เลขต้องต่างจากใบก่อน', (card, prev) => card.number !== prev.number],
    ['เลขต้องเป็นคู่สลับคี่กับใบก่อน', (card, prev) => card.number % 2 !== prev.number % 2],
    ['เลขต้องห่างจากใบก่อน 1 หรือ 2', (card, prev) => [1, 2].includes(Math.abs(card.number - prev.number))],
    ['สัตว์ต้องเป็นชนิดเดียวกับใบก่อน', (card, prev) => card.animal === prev.animal],
    ['ชนิดสัตว์หรือเลขต้องเหมือนใบก่อนอย่างน้อยหนึ่งอย่าง', (card, prev) => card.animal === prev.animal || card.number === prev.number],
    ['สัตว์ต้องต่างชนิดจากใบก่อน', (card, prev) => card.animal !== prev.animal],
    ['สัตว์ปีกสลับกับสัตว์สี่ขา', (card, prev) => bird(card) !== bird(prev)],
    ['สัตว์ต้องอยู่กลุ่มเดียวกับใบก่อน (สัตว์ปีกหรือสัตว์สี่ขา)', (card, prev) => bird(card) === bird(prev)],
    ['ถ้าเลขเป็นคู่ สีต้องเหมือนใบก่อน ถ้าเป็นคี่ สีต้องต่าง', (card, prev) => (card.color === prev.color) === (card.number % 2 === 0)],
    ['สีต้องต่างจากใบก่อน และสัตว์ต้องเป็นชนิดเดียวกัน', (card, prev) => card.color !== prev.color && card.animal === prev.animal],
    ['เลขต้องเท่ากับใบก่อน', (card, prev) => card.number === prev.number],
    ['เลขต้องห่างจากใบก่อนพอดี 1', (card, prev) => Math.abs(card.number - prev.number) === 1],
    ['ผลรวมเลขของไพ่สองใบต้องหาร 3 ลงตัว', (card, prev) => (card.number + prev.number) % 3 === 0],
    ['เลขและสีต้องต่างจากใบก่อนทั้งคู่', (card, prev) => card.number !== prev.number && card.color !== prev.color],
    ['เลขหรือสีต้องเหมือนใบก่อนอย่างน้อยหนึ่งอย่าง', (card, prev) => card.number === prev.number || card.color === prev.color],
    ['มีหมูสลับกับไม่มีหมู', (card, prev) => has(card, 0) !== has(prev, 0)],
    ['มีหมาสลับกับไม่มีหมา', (card, prev) => has(card, 1) !== has(prev, 1)],
    ['สีและชนิดสัตว์ต้องต่างจากใบก่อนทั้งคู่', (card, prev) => card.color !== prev.color && card.animal !== prev.animal],
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

export function nextPlayer(game) {
  const next = (game.turn + 1) % game.players.length;
  return next === game.keeper ? (next + 1) % game.players.length : next;
}

export function startGame(names, previous = null) {
  const keeper = previous ? (previous.keeper + 1) % names.length : 0;
  const round = previous ? previous.round + 1 : 1;

  const usedRuleIds = previous?.usedRuleIds ?? [];
  const ruleOptions = shuffle(rules.filter(candidate => !usedRuleIds.includes(candidate.id))).slice(0, 3);
  return {
    players: names.map((name, index) => ({
      name, hand: [],
      score: previous?.players[index]?.score ?? 0, roundScore: 0,
    })),
    rule: null, ruleOptions, choices: [], keeper, round, usedRuleIds,
    draw: shuffle(deck), discard: [], clue: null, last: null, log: [],
    turn: (keeper + 1) % names.length, phase: 'keeper', winner: null, matchWinners: [],
  };
}

export function selectRule(game, ruleId) {
  const rule = game.ruleOptions.find(option => option.id === ruleId);
  if (game.phase !== 'keeper' || game.rule || !rule) throw Error('เลือกกฎจากตัวเลือกของรอบนี้');

  const dealCount = (game.players.length - 1) * 7;
  const qualifies = card => rule.level === 2 || rule.matches(card);
  if (!game.draw.slice(dealCount).some(qualifies)) {
    const index = game.draw.findIndex(qualifies);
    [game.draw[index], game.draw[dealCount]] = [game.draw[dealCount], game.draw[index]];
  }
  for (const [index, player] of game.players.entries()) {
    if (index !== game.keeper) player.hand = game.draw.splice(0, 7);
  }
  game.rule = rule;
  game.usedRuleIds = [...game.usedRuleIds, rule.id];
}

export function clueOptions(game) {
  if (game.phase !== 'keeper' || !game.rule) return [];
  return game.draw.filter(card => game.rule.level === 2 || game.rule.matches(card))
    .sort((a, b) => a.id - b.id);
}

export function beginRound(game, cardId) {
  if (!clueOptions(game).some(card => card.id === cardId)) throw Error('เลือกไพ่ตั้งต้นที่ใช้ได้จากกองจั่ว');
  const index = game.draw.findIndex(card => card.id === cardId);
  [game.clue] = game.draw.splice(index, 1);
  game.last = game.clue;
  game.phase = 'play';
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
  else game.turn = nextPlayer(game);
}

export function guessRule(game, id) {
  if (game.phase !== 'guess' || !game.choices.some(rule => rule.id === id)) return;
  if (game.rule.id === id) {
    const mostCards = Math.max(...game.players.filter((_, index) => index !== game.keeper)
      .map(player => player.hand.length));
    for (const [index, player] of game.players.entries()) {
      if (index === game.keeper) continue;
      player.roundScore = Number(index === game.turn) - Number(player.hand.length === mostCards);
      player.score += player.roundScore;
    }
    game.winner = game.players[game.turn].name;
    finishRound(game);
  } else {
    game.turn = nextPlayer(game);
  }
}

function finishRound(game) {
  game.phase = 'finished';
  if (game.round === game.players.length) {
    const bestScore = Math.max(...game.players.map(player => player.score));
    game.matchWinners = game.players.filter(player => player.score === bestScore).map(player => player.name);
  }
}
