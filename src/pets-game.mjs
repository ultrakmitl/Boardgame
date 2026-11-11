import {randomBytes, randomInt} from 'node:crypto';
import {cards} from '../public/pets-cards.js';

const rooms = new Map();
const deck = cards.flatMap(([,count], rank) => Array(count).fill(rank));
const shuffle = cards => {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
};
const eligible = (room, actor) => room.players.filter(p => p !== actor && p.alive && !p.shield);
const active = room => room.players[room.turn];
const goal = room => room.players.length <= 3 ? 3 : 2;
const log = (room, message) => room.log.unshift(message);

function startRound(room, turn) {
  room.pile = shuffle([...deck]);
  room.round++;
  room.turn = turn;
  room.phase = 'draw';
  room.effect = null;
  room.winner = null;
  room.log = [];
  for (const p of room.players) {
    Object.assign(p, {hand:[room.pile.pop()], played:[], alive:true, shield:false, secret:'', secretRank:undefined});
  }
  room.reserve = room.pile.pop();
  room.open = room.players.length === 2 ? [room.pile.pop(), room.pile.pop()] : [];
}

function eliminate(room, player) {
  player.played.push(...player.hand.splice(0));
  player.alive = false;
  player.shield = false;
  log(room, player.name + ' ตกรอบ');
}

function finishTurn(room) {
  room.effect = null;
  const survivors = room.players.filter(p => p.alive);
  if (survivors.length === 1 || !room.pile.length) {
    let winners = survivors;
    if (survivors.length > 1) {
      const highest = Math.max(...survivors.map(p => p.hand[0]));
      winners = survivors.filter(p => p.hand[0] === (highest === 10 && survivors.some(p => p.hand[0] === 0) ? 0 : highest));
      if (winners.length > 1) {
        const bestPlayed = Math.max(-1, ...winners.flatMap(p => p.played));
        winners = winners.filter(p => Math.max(-1, ...p.played) === bestPlayed);
      }
    }
    if (winners.length === 1) {
      room.winner = room.players.indexOf(winners[0]);
      winners[0].score++;
      log(room, winners[0].name + ' ชนะรอบนี้');
    } else {
      log(room, 'เสมอ ไม่มีใครได้แต้ม');
    }
    room.showdown = survivors.length > 1;
    room.phase = winners.length === 1 && winners[0].score >= goal(room) ? 'over' : 'result';
    return;
  }
  do { room.turn = (room.turn + 1) % room.players.length; } while (!active(room).alive);
  active(room).shield = false;
  room.phase = 'draw';
}

function play(room, actor, index) {
  const [rank] = actor.hand.splice(index, 1);
  actor.played.push(rank);
  log(room, actor.name + ' ลง ' + rank + ' ' + cards[rank][0]);
  if ([1,3,5,8].includes(rank) && eligible(room,actor).length ||
      rank === 2 && room.pile.length || rank === 6 && room.reserve !== undefined) {
    room.effect = rank;
    room.phase = 'effect';
    return;
  }
  if (rank === 4) actor.shield = true;
  if (rank === 7) {
    const group = [actor, ...eligible(room, actor)];
    room.pile.push(...group.map(p => p.hand.pop()));
    shuffle(room.pile);
    for (const p of group) p.hand.push(room.pile.pop());
  }
  if (rank === 9) {
    const king = eligible(room, actor).find(p => p.hand[0] === 10);
    if (king) {
      [actor.hand, king.hand] = [king.hand, actor.hand];
      const message = actor.name + ' สลับไพ่กับ ' + king.name + ' ด้วยพลังแพนด้าแดง';
      actor.secret = king.secret = message;
      actor.secretRank = king.secretRank = undefined;
    }
  }
  if (rank === 10) eliminate(room, actor);
  finishTurn(room);
}

function resolveEffect(room, actor, input) {
  const rank = room.effect;
  if (rank === 2) {
    if (!Number.isInteger(input.position) || input.position < 0 || input.position >= room.pile.length) {
      throw Error('เลือกตำแหน่งในกองจั่ว');
    }
    room.pile.splice(room.pile.length - 1 - input.position, 0, room.pile.pop());
  } else if (rank === 6) {
    if (typeof input.swap !== 'boolean') throw Error('เลือกว่าจะสลับไพ่หรือไม่');
    if (input.swap) [actor.hand[0], room.reserve] = [room.reserve, actor.hand[0]];
  } else {
    const target = room.players[input.target];
    if (!Number.isInteger(input.target) || !eligible(room, actor).includes(target)) {
      throw Error('เลือกคู่แข่งที่ยังอยู่และไม่มีโล่');
    }
    if (rank === 1) {
      if (!Number.isInteger(input.guess) || input.guess < 0 || input.guess > 10 || input.guess === 1) {
        throw Error('เลือกเลข 0–10 ยกเว้น 1');
      }
      log(room, actor.name + ' ทายไพ่ของ ' + target.name + ' เป็น ' + input.guess);
      if (target.hand[0] === input.guess) eliminate(room, target);
      else log(room, 'ทายผิด');
    }
    if (rank === 3) {
      const [own] = actor.hand;
      const [other] = target.hand;
      actor.secret = 'ดวลกับ ' + target.name;
      actor.secretRank = other;
      target.secret = 'ดวลกับ ' + actor.name;
      target.secretRank = own;
      if (own !== other) eliminate(room, own < other ? actor : target);
      else log(room, actor.name + ' ดวลกับ ' + target.name + ' แล้วเสมอ');
    }
    if (rank === 5) {
      if (target.hand[0] === 10) eliminate(room, target);
      else {
        target.played.push(target.hand.pop());
        if (room.pile.length) target.hand.push(room.pile.pop());
        else {
          target.hand.push(room.reserve);
          room.reserve = undefined;
        }
      }
    }
    if (rank === 8) {
      [actor.hand, target.hand] = [target.hand, actor.hand];
      log(room, actor.name + ' สลับไพ่กับ ' + target.name);
    }
  }
  finishTurn(room);
}

export function petsEnter(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 24) throw Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = rooms.get(input.code);
  if (input.create === true) {
    if (rooms.size >= 500) throw Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
    room = {code, players:[], phase:'lobby', version:0, round:0};
    rooms.set(code, room);
  }
  if (!room) throw Error('ไม่พบห้องนี้');
  if (room.phase !== 'lobby' || room.players.length >= 6) throw Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.players.some(p => p.name === name)) throw Error('ชื่อนี้มีคนใช้แล้ว');
  const token = randomBytes(24).toString('base64url');
  room.players.push({name, token, score:0});
  room.version++;
  room.updated = Date.now();
  return {code:room.code, token};
}

export function petsRoom(code, authorization, input) {
  const room = rooms.get(code);
  const player = room?.players.find(p => 'Bearer ' + p.token === authorization);
  if (!player) return null;
  const self = room.players.indexOf(player);
  room.updated = Date.now();
  if (input) {
    if (input.version !== room.version) throw Error('สถานะโต๊ะเปลี่ยนแล้ว ลองอีกครั้ง');
    const {action} = input;
    if (action === 'start' && room.phase === 'lobby' && self === 0 && room.players.length >= 2) {
      startRound(room, randomInt(room.players.length));
    } else if (action === 'next' && room.phase === 'result') {
      startRound(room, room.winner ?? (room.turn + 1) % room.players.length);
    } else if (player === active(room) && room.phase === 'draw' && action === 'draw') {
      player.hand.push(room.pile.pop());
      room.phase = 'play';
    } else if (player === active(room) && room.phase === 'play' && action === 'play' && [0,1].includes(input.index)) {
      play(room, player, input.index);
    } else if (player === active(room) && room.phase === 'effect' && action === 'effect') {
      resolveEffect(room, player, input);
    } else throw Error('คำสั่งนี้ใช้ไม่ได้ในตอนนี้');
    room.version++;
  }
  const yourEffect = room.phase === 'effect' && self === room.turn ? room.effect : null;
  const finished = ['result','over'].includes(room.phase);
  return {
    code, self, version:room.version, phase:room.phase, turn:room.turn, round:room.round,
    winner:room.winner, goal:goal(room), pile:room.pile?.length, open:room.open, log:room.log,
    hand:player.hand, secret:player.secret, secretRank:player.secretRank, effect:yourEffect,
    peek:yourEffect === 2 ? room.pile.at(-1) : yourEffect === 6 ? room.reserve : undefined,
    targets:yourEffect === null ? [] : eligible(room, player).map(p => room.players.indexOf(p)),
    players:room.players.map(p => ({name:p.name, score:p.score, alive:p.alive,
      shield:p.shield, played:p.played, reveal:finished && room.showdown ? p.hand[0] : undefined})),
  };
}

export function maintainPetsRooms(now) {
  for (const [code, room] of rooms) if (now - room.updated > 3600000) rooms.delete(code);
}
