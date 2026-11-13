import { randomBytes } from 'node:crypto';
import { start, nextRound, resolve, view } from './game.mjs';

const rooms = new Map();
const token = () => randomBytes(24).toString('base64url');
const result = (status, data) => ({ status, data });

export function incanEnter(input, roomStore = rooms, createCode = null) {
  const name = typeof input.name==='string' ? input.name.trim() : '';
  if (!name || name.length>24) throw Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = roomStore.get(input.code);
  if (input.create===true) {
    if (roomStore.size>=500) throw Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code=createCode?.() ?? randomBytes(4).toString('hex').toUpperCase(); } while(roomStore.has(code));
    room = {code,players:[],phase:'lobby',turn:0,decisions:new Map(),updated:Date.now()};
    roomStore.set(code,room);
  }
  if (!room) throw Error('ไม่พบห้องนี้');
  if (room.phase!=='lobby' || room.players.length>=8) throw Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.players.some(p=>p.name===name)) throw Error('ชื่อนี้มีคนใช้แล้ว');
  const player = {id:token(),name,seen:Date.now()};
  room.players.push(player);
  room.host ??= player.id;
  room.updated = Date.now();
  return {code:room.code,token:player.id};
}
export function incanRoom(code, authorization, input, roomStore = rooms) {
  const room = roomStore.get(code);
  const player = room?.players.find(p=>'Bearer '+p.id===authorization);
  if (!player) return result(401,{error:'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'});
  room.updated = player.seen = Date.now();
  if (input !== undefined) {
    if (room.phase==='playing' && Date.now()>=room.deadline) resolve(room);
    if (input.turn!==room.turn) return result(409,{error:'ตานี้จบแล้ว'});
    if (input.action==='choose' && room.phase==='playing' && player.active &&
        !room.decisions.has(player.id) && ['exit','explore'].includes(input.choice)) {
      room.decisions.set(player.id,input.choice);
      if (room.players.every(p=>!p.active || room.decisions.has(p.id))) resolve(room);
    } else if (room.host===player.id && input.action==='start' &&
        ['lobby','finished'].includes(room.phase) && room.players.length>=3) {
      start(room);
    } else if (room.host===player.id && input.action==='next' && room.phase==='intermission') {
      nextRound(room);
    } else return result(409,{error:'คำสั่งนี้ใช้ไม่ได้ในตอนนี้'});
  }
  return result(200,view(room,player));
}

export function maintainIncanRooms(now, roomStore = rooms) {
  for (const [code,room] of roomStore) {
    if (now-room.updated>3600000) { roomStore.delete(code); continue; }
    const host = room.players.find(p=>p.id===room.host);
    if (now-host.seen>45000) {
      const replacement = room.players.find(p=>now-p.seen<12000);
      if (replacement) room.host = replacement.id;
    }
    if (room.phase==='playing' && now>=room.deadline) resolve(room);
  }
}
