import {randomBytes, randomInt} from 'node:crypto';

const rooms = new Map();
const faces = ['flower', 'skull'];
const fail = () => { throw Error('คำสั่งนี้ใช้ไม่ได้ในตอนนี้'); };
const live = room => room.players.filter(player => player.hand.length + player.pile.length);
const top = player => player.pile.findLast(disc => !disc.revealed);
const total = room => room.players.reduce((sum, player) => sum + player.pile.length, 0);

export function maintainSkullRooms(now = Date.now(), roomStore = rooms) {
  for (const [code, room] of roomStore) {
    if (now - room.updated > 3600000) roomStore.delete(code);
  }
}

export function skullEnter(input, roomStore = rooms, createCode = null) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 24) throw Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = roomStore.get(String(input.code ?? '').trim().toUpperCase());
  if (input.create === true) {
    if (roomStore.size >= 500) throw Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code = createCode?.() ?? randomBytes(4).toString('hex').toUpperCase(); } while (roomStore.has(code));
    room = {code, phase:'lobby', players:[], revision:0, updated:Date.now()};
    roomStore.set(code, room);
  }
  if (!room) throw Error('ไม่พบห้องนี้');
  if (room.phase !== 'lobby' || room.players.length >= 6) throw Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.players.some(player => player.name === name)) throw Error('ชื่อนี้มีคนใช้แล้ว');
  const player = {name, token:randomBytes(24).toString('base64url'), id:room.players.length};
  room.players.push(player);
  room.revision++;
  room.updated = Date.now();
  return {code:room.code, token:player.token};
}

function newRound(room) {
  room.round++;
  for (const player of room.players) {
    player.hand.push(...player.pile.map(disc => disc.face));
    player.pile = [];
    if (player.loss) {
      player.hand.splice(player.hand.indexOf(player.loss), 1);
      delete player.loss;
    }
  }
  const active = live(room);
  room.order = [
    ...active.filter(player => player.id >= room.starter),
    ...active.filter(player => player.id < room.starter),
  ].map(player => player.id);
  Object.assign(room, {phase:'setup', setupRevision:room.revision, turn:null, bid:0, bidder:null, opened:0, passed:new Set(), message:''});
}

function advance(room) {
  const eligible = live(room).filter(player => !room.passed.has(player.id));
  room.turn = (eligible.find(player => player.id > room.turn) ?? eligible[0]).id;
}

function finish(room, winner, starter) {
  room.starter = starter;
  room.phase = winner ? 'over' : 'result';
  if (winner) room.message += ` • ${winner.name} ชนะเกม!`;
}

function discard(room, player, face, skullOwner) {
  player.loss = face;
  const out = player.hand.length + player.pile.length === 1;
  const survivors = live(room).filter(other => other !== player || !out);
  room.message += out ? ' เสีย 1 แผ่นและตกรอบ' : ' เสีย 1 แผ่น';
  finish(room, survivors.length === 1 ? survivors[0] : null,
    out ? (skullOwner === player ? survivors[0].id : skullOwner.id) : player.id);
}

function canPlace(room, player) {
  if (!player.hand.length) return false;
  if (room.phase === 'place') return room.turn === player.id;
  if (room.phase !== 'setup' || player.pile.length) return false;
  return room.starter !== player.id || live(room).every(other => other === player || other.pile.length);
}

function targets(room, player) {
  if (room.phase !== 'reveal' || room.turn !== player.id) return [];
  return top(player) ? [player.id] : live(room).filter(top).map(other => other.id);
}

function apply(room, player, input) {
  if (input.revision !== room.revision && !['style','place'].includes(input.action)) fail();
  const isHost = player.id === 0;
  const myTurn = player.id === room.turn;
  switch (input.action) {
    case 'style':
      if (room.phase !== 'lobby' || !Number.isInteger(input.style) || input.style < 1 || input.style > 6 ||
          room.players.some(other => other !== player && other.style === input.style)) fail();
      player.style = input.style;
      break;
    case 'start':
      if (!isHost || room.phase !== 'lobby' || room.players.length < 3 || room.players.some(other => !other.style)) fail();
      room.players.forEach(other => Object.assign(other, {hand:['flower','flower','flower','skull'], pile:[], score:0, loss:null}));
      room.round = room.starter = 0;
      newRound(room);
      break;
    case 'lobby':
      if (!isHost || room.phase !== 'over') fail();
      room.phase = 'lobby';
      break;
    case 'place':
      if ((room.phase !== 'setup' && input.revision !== room.revision) ||
          (room.phase === 'setup' && (!Number.isInteger(input.revision) || input.revision < room.setupRevision)) ||
          input.round !== room.round || input.phase !== room.phase || !canPlace(room, player) ||
          !faces.includes(input.face) || !player.hand.includes(input.face)) fail();
      player.hand.splice(player.hand.indexOf(input.face), 1);
      player.pile.push({face:input.face, revealed:false});
      if (room.phase === 'place') advance(room);
      else if (live(room).every(other => other.pile.length)) {
        room.phase = 'place';
        room.turn = room.starter;
      }
      break;
    case 'bid':
      if (!myTurn || !['place','bid'].includes(room.phase) ||
          !Number.isInteger(input.value) || input.value <= room.bid || input.value > total(room)) fail();
      room.bid = input.value;
      room.bidder = player.id;
      room.phase = 'bid';
      if (room.bid === total(room)) room.phase = 'reveal';
      else advance(room);
      break;
    case 'pass':
      if (!myTurn || room.phase !== 'bid') fail();
      room.passed.add(player.id);
      if (live(room).length - room.passed.size === 1) {
        room.phase = 'reveal';
        room.turn = room.bidder;
      } else advance(room);
      break;
    case 'reveal': {
      if (!targets(room, player).includes(input.target)) fail();
      const owner = room.players[input.target];
      const disc = top(owner);
      disc.revealed = true;
      if (disc.face === 'skull') {
        room.message = `${player.name} เปิดเจอหัวกะโหลกของ${owner === player ? 'ตัวเอง' : owner.name}`;
        if (owner === player) room.phase = 'discard';
        else {
          const choices = [...player.hand, ...player.pile.map(card => card.face)];
          discard(room, player, choices[randomInt(choices.length)], owner);
        }
      } else if (++room.opened === room.bid) {
        player.score++;
        room.message = `${player.name} เปิดดอกไม้ครบ ${room.bid} แผ่น ชนะรอบนี้`;
        finish(room, player.score === 2 ? player : null, player.id);
      }
      break;
    }
    case 'discard':
      if (!myTurn || room.phase !== 'discard' || !faces.includes(input.face) ||
          ![...player.hand, ...player.pile.map(card => card.face)].includes(input.face)) fail();
      discard(room, player, input.face, player);
      break;
    case 'next':
      if (room.phase !== 'result' || (!isHost && player.id !== room.starter)) fail();
      newRound(room);
      break;
    default: fail();
  }
  room.revision++;
}

export function skullRoom(code, authorization, input, roomStore = rooms) {
  const room = roomStore.get(code);
  const player = room?.players.find(other => authorization === 'Bearer ' + other.token);
  if (!player) return null;
  room.updated = Date.now();
  if (input) apply(room, player, input);
  const lobby = room.phase === 'lobby';
  return {
    code, phase:room.phase, revision:room.revision, me:player.id, host:0,
    round:room.round, order:lobby ? [] : room.order, turn:room.turn, starter:room.starter, bid:room.bid, bidder:room.bidder,
    opened:room.opened, message:room.message, total:lobby ? 0 : total(room),
    hand:lobby ? [] : player.hand, canPlace:!lobby && canPlace(room, player),
    targets:lobby ? [] : targets(room, player),
    players:room.players.map(other => {
      const mine = other === player;
      return {
        id:other.id, name:other.name, style:other.style, score:lobby ? 0 : other.score,
        handCount:lobby ? 0 : other.hand.length,
        eliminated:!lobby && other.hand.length + other.pile.length - Number(Boolean(other.loss)) === 0,
        pile:lobby ? [] : other.pile.map(disc => ({
          face:mine || disc.revealed ? disc.face : 'back', revealed:disc.revealed,
        })),
        ...(mine && !lobby ? {loss:other.loss} : {}),
      };
    }),
  };
}
