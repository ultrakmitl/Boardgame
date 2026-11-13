import {randomBytes} from 'node:crypto';
import {createGame, auction, sell, advance, ranking} from '../public/for-sale-game.js';

const rooms = new Map();

export function forSaleEnter(input, roomStore = rooms, createCode = null) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 24) throw new Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = roomStore.get(input.code);
  if (input.create === true) {
    if (roomStore.size >= 500) throw new Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code = createCode?.() ?? randomBytes(4).toString('hex').toUpperCase(); } while (roomStore.has(code));
    room = {code, seats: [], game: null, version: 0};
    roomStore.set(code, room);
  }
  if (!room) throw new Error('ไม่พบห้องนี้');
  if (room.game || room.seats.length >= 6) throw new Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.seats.some(seat => seat.name === name)) throw new Error('ชื่อนี้มีคนใช้แล้ว');
  const token = randomBytes(24).toString('base64url');
  room.seats.push({name, token});
  room.updated = Date.now();
  room.version++;
  return {code: room.code, token};
}

function view(room, you) {
  const game = room.game;
  const seats = room.seats.map(seat => seat.name);
  if (!game) return {seats, you, version: room.version, game: null};
  const {phase, round, rounds, market, high, turn, lastSale} = game;
  const players = game.players.map(player => ({
    id: player.id, bid: player.bid, passed: player.passed, acquired: player.acquired,
    chosen: player.chosen === null ? null : true,
    handCount: player.hand.length,
    ...(player.id === you ? {hand: player.hand, cash: player.cash} : {})
  }));
  return {
    seats, you, version: room.version, match: room.match,
    game: {phase, round, rounds, market, high, turn, players,
      lastSale: phase === 'sold' ? lastSale : [],
      results: phase === 'done' ? ranking(game) : []}
  };
}

export function forSaleRoom(code, authorization, input, roomStore = rooms) {
  const room = roomStore.get(code);
  const you = room?.seats.findIndex(seat => 'Bearer ' + seat.token === authorization);
  if (you == null || you < 0) return null;
  room.updated = Date.now();
  if (input === undefined) return view(room, you);
  const game = room.game;
  if (input?.action === 'sell') {
    if (game?.phase !== 'sell' || input.round !== game.round || input.match !== room.match) throw new Error('รอบนี้จบแล้ว');
    sell(game, you, input.card);
  } else {
    if (input?.version !== room.version) throw new Error('สถานะห้องเปลี่ยนแล้ว ลองอีกครั้ง');
    switch (input.action) {
      case 'start':
        if (you !== 0 || (game && game.phase !== 'done')) throw new Error('เจ้าห้องเริ่มเกมได้จากห้องรอหรือหน้าคะแนน');
        room.game = createGame(room.seats.length);
        room.match = room.version + 1;
        break;
      case 'bid':
      case 'pass':
        if (game?.phase !== 'buy' || game.turn !== you) throw new Error('ยังไม่ถึงตาประมูลของคุณ');
        if (input.action === 'bid' && !Number.isInteger(input.bid)) throw new Error('ระบุยอดบิดเป็นจำนวนเต็ม');
        auction(game, input.action === 'pass' ? null : input.bid);
        break;
      case 'advance':
        if (!['bought', 'sold'].includes(game?.phase)) throw new Error('ยังไปต่อไม่ได้');
        advance(game);
        break;
      case 'leave':
        if (game) throw new Error('กลับเข้าห้องจากแท็บเดิมได้');
        room.seats.splice(you, 1);
        room.version++;
        if (!room.seats.length) roomStore.delete(code);
        return {left: true};
      default:
        throw new Error('คำสั่งไม่ถูกต้อง');
    }
  }
  room.version++;
  return view(room, you);
}

export function maintainForSaleRooms(now, roomStore = rooms) {
  for (const [code, room] of roomStore) {
    if (now - room.updated > 2 * 60 * 60 * 1000) roomStore.delete(code);
  }
}
