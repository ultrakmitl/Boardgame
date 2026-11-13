import { DurableObject } from 'cloudflare:workers';
import { randomBytes } from 'node:crypto';
import { rules } from '../public/know-rules.js';
import { incanEnter, incanRoom, maintainIncanRooms } from './incan-online.mjs';
import { bossEnter, bossRoom, maintainBossRooms } from './boss-game.mjs';
import { skullEnter, skullRoom, maintainSkullRooms } from './skull-game.mjs';
import { petsEnter, petsRoom, maintainPetsRooms } from './pets-game.mjs';
import { knowEnter, knowRoom, maintainKnowRooms } from './know-online.mjs';
import { forSaleEnter, forSaleRoom, maintainForSaleRooms } from './for-sale-online.mjs';
import { wallEnter, wallRoom, maintainWallRooms } from './wall-street.mjs';

const HOUR = 3_600_000;
const games = new Map([
  ['incan', {enter: incanEnter, room: incanRoom, maintain: maintainIncanRooms, lifetime: HOUR}],
  ['boss', {enter: bossEnter, room: bossRoom, maintain: maintainBossRooms, lifetime: HOUR}],
  ['skull', {enter: skullEnter, room: skullRoom, maintain: maintainSkullRooms, lifetime: HOUR}],
  ['pets', {enter: petsEnter, room: petsRoom, maintain: maintainPetsRooms, lifetime: HOUR}],
  ['know', {enter: knowEnter, room: knowRoom, maintain: maintainKnowRooms, lifetime: HOUR}],
  ['for-sale', {enter: forSaleEnter, room: forSaleRoom, maintain: maintainForSaleRooms, lifetime: 2 * HOUR}],
  ['wall-street', {enter: wallEnter, room: wallRoom, maintain: maintainWallRooms, lifetime: 2 * HOUR}],
]);
const pages = new Map([
  ['/', '/hub.html'],
  ['/games/incan-gold', '/index.html'],
  ['/games/im-the-boss', '/boss-online.html'],
  ['/games/im-the-boss/demo', '/boss.html'],
  ['/games/skull', '/skull.html'],
  ['/games/i-know-you-dont', '/know.html'],
  ['/games/power-hungry-pets', '/pets.html'],
  ['/games/for-sale', '/for-sale.html'],
  ['/games/panic-on-wall-street', '/wall-street.html'],
]);

const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const expired = () => json({error: 'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'}, 401);
const missing = () => json({error: 'ไม่พบหน้า'}, 404);
const invalid = () => json({error: 'คำขอไม่ถูกต้อง'}, 400);

async function readInput(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, {stream: true});
  }
  const input = JSON.parse(text + decoder.decode());
  return input && typeof input === 'object' && !Array.isArray(input) ? input : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/' && url.searchParams.has('room')) {
        return Response.redirect(new URL('/games/incan-gold' + url.search, url), 302);
      }
      const path = url.pathname.replace(/\/$/, '') || '/';
      const page = pages.get(path);
      if (page) url.pathname = page;
      return env.ASSETS.fetch(new Request(url, request));
    }

    const match = /^\/api\/(?:(boss|skull|pets|know|for-sale|wall-street)\/)?(enter|room)$/.exec(url.pathname);
    if (!match || !['GET', 'POST'].includes(request.method)) return missing();
    const [, game = 'incan', operation] = match;
    if (operation === 'enter' && request.method !== 'POST') return missing();
    let input;
    if (request.method === 'POST') {
      try { input = await readInput(request); } catch { return invalid(); }
      if (!input) return invalid();
    }
    const create = operation === 'enter' && input.create === true;
    const length = game === 'pets' ? 6 : 8;
    if (create) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = randomBytes(length / 2).toString('hex').toUpperCase();
        const response = await env.ROOMS.getByName(game + ':' + code).handle(game, code, operation, input, null);
        if (response.status !== 409) return response;
      }
      return json({error: 'สร้างห้องไม่สำเร็จ กรุณาลองใหม่'}, 503);
    }
    const code = String((operation === 'enter' ? input.code : url.searchParams.get('code')) ?? '').trim().toUpperCase();
    if (code.length !== length || !/^[0-9A-F]+$/.test(code)) {
      return operation === 'enter' ? json({error: 'ไม่พบห้องนี้'}, 400) : expired();
    }
    return env.ROOMS.getByName(game + ':' + code).handle(game, code, operation, input, request.headers.get('authorization'));
  },
};

// The Know rule catalog contains functions. Persist its IDs and restore the
// canonical rule objects so matching and identity checks work after a reload.
function mapKnowRules(room, mapRule) {
  if (!room?.game) return room;
  const game = room.game;
  return {...room, game: {
    ...game,
    rule: game.rule === null ? null : mapRule(game.rule),
    ruleOptions: game.ruleOptions.map(mapRule),
    choices: game.choices.map(mapRule),
  }};
}

export class GameRoom extends DurableObject {
  async handle(game, code, operation, input, authorization) {
    const storage = this.ctx.storage;
    const {enter, room, maintain, lifetime} = games.get(game);
    const now = Date.now();
    const snapshot = storage.kv.get('room');
    const existing = game === 'know' ? mapKnowRules(snapshot, (id) => rules[id]) : snapshot;
    const roomStore = new Map(existing ? [[code, existing]] : []);
    maintain(now, roomStore);
    if (operation === 'enter' && input.create === true && roomStore.has(code)) return json({}, 409);

    let response;
    try {
      if (operation === 'enter') {
        response = json(enter({...input, code}, roomStore, () => code));
      } else {
        const result = room(code, authorization, input, roomStore);
        response = game === 'incan' ? json(result.data, result.status) : result ? json(result) : expired();
      }
    } catch (error) {
      response = json({error: error.message}, 400);
    }

    const updated = roomStore.get(code);
    if (updated) {
      storage.kv.put('room', game === 'know' ? mapKnowRules(updated, (rule) => rule.id) : updated);
      if (!existing) {
        storage.kv.put('lifetime', lifetime);
        await storage.setAlarm(updated.updated + lifetime + 1);
      }
    } else if (existing) {
      await storage.deleteAll();
      await storage.deleteAlarm();
    }
    return response;
  }

  async alarm() {
    const storage = this.ctx.storage;
    const room = storage.kv.get('room');
    if (!room) return;
    const deadline = room.updated + storage.kv.get('lifetime') + 1;
    if (deadline > Date.now()) await storage.setAlarm(deadline);
    else await storage.deleteAll();
  }
}
