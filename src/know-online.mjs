import {randomBytes} from 'node:crypto';
import {startGame, selectRule, clueOptions, beginRound, playTurn, guessRule, nextPlayer} from '../public/know-rules.js';

const rooms = new Map();
const reject = () => { throw Error('คำสั่งนี้ใช้ไม่ได้ในตอนนี้'); };

function expireTurn(room, now) {
  if (room.deadline === null || now < room.deadline) return;
  const {game} = room;
  room.notice = `${game.players[game.turn].name} หมดเวลาส่งไพ่ · ข้ามตา`;
  game.turn = nextPlayer(game);
  room.deadline = now + room.minutes * 60000;
  room.revision++;
}

export function maintainKnowRooms(now) {
  for (const [code, room] of rooms) {
    if (now - room.updated > 3600000) rooms.delete(code);
    else expireTurn(room, now);
  }
}

export function knowEnter(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 24) throw Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = rooms.get(String(input.code ?? '').trim().toUpperCase());
  if (input.create === true) {
    if (rooms.size >= 500) throw Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(code));
    room = {code, seats: [], revision: 0, game: null, pending: null, notice: '', minutes: 5, deadline: null};
    rooms.set(code, room);
  }
  if (!room) throw Error('ไม่พบห้องนี้');
  if (room.game || room.seats.length >= 7) throw Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.seats.some(seat => seat.name === name)) throw Error('ชื่อนี้มีคนใช้แล้ว');
  const token = randomBytes(24).toString('base64url');
  room.seats.push({name, token});
  room.updated = Date.now();
  room.revision++;
  return {code: room.code, token};
}

function act(room, me, input, now) {
  if (input.revision !== room.revision) throw Error('สถานะห้องเปลี่ยนแล้ว ลองอีกครั้ง');
  const {game, pending} = room;
  switch (input.action) {
    case 'set-time':
      if (me !== 0 || game?.phase === 'play' || game?.phase === 'guess' || !Number.isInteger(input.minutes) ||
          input.minutes < 1 || input.minutes > 30) reject();
      room.minutes = input.minutes;
      break;
    case 'kick': {
      if (me !== 0 || !Number.isInteger(input.seat) || input.seat < 1 || input.seat >= room.seats.length) reject();
      const [removed] = room.seats.splice(input.seat, 1);
      room.game = null;
      room.pending = null;
      room.deadline = null;
      room.notice = `${removed.name} ออกจากห้องแล้ว`;
      break;
    }
    case 'start':
      if (me !== 0 || game || room.seats.length < 3) reject();
      room.game = startGame(room.seats.map(seat => seat.name));
      break;
    case 'next':
      if (me !== 0 || game?.phase !== 'finished' || game.matchWinners.length) reject();
      room.game = startGame(room.seats.map(seat => seat.name), game);
      room.notice = '';
      break;
    case 'rematch':
      if (me !== 0 || !game?.matchWinners.length) reject();
      room.game = startGame(room.seats.map(seat => seat.name));
      room.notice = '';
      break;
    case 'choose-rule':
      if (game?.phase !== 'keeper' || me !== game.keeper) reject();
      selectRule(game, input.ruleId);
      break;
    case 'begin':
      if (game?.phase !== 'keeper' || me !== game.keeper) reject();
      beginRound(game, input.cardId);
      room.deadline = now + room.minutes * 60000;
      break;
    case 'play':
    case 'trade':
    case 'guess': {
      if (!game || me !== game.turn || pending) reject();
      if (input.action === 'guess') {
        if (game.phase !== 'guess' || !game.choices.some(rule => rule.id === input.choice)) reject();
        room.pending = {guess: input.choice};
      } else {
        if (game.phase !== 'play') reject();
        const trade = input.action === 'trade';
        const ids = trade ? [] : input.ids;
        const hand = game.players[me].hand;
        if (!Array.isArray(ids) || (!trade && !ids.length) || ids.length > hand.length ||
            new Set(ids).size !== ids.length || !ids.every(id => hand.some(card => card.id === id))) reject();
        room.pending = {ids, trade};
        room.deadline = null;
      }
      room.notice = '';
      break;
    }
    case 'resolve':
      if (!pending || me !== game?.keeper) reject();
      if (pending.guess !== undefined) {
        const name = game.players[game.turn].name;
        guessRule(game, pending.guess);
        room.notice = game.phase === 'finished' ? '' : `${name} ตอบยังไม่ถูก ส่งสิทธิ์ให้คนถัดไป`;
      } else {
        const pick = input.pick ?? null;
        if (pick !== null && (!pending.trade || !Number.isInteger(pick))) reject();
        playTurn(game, pending.ids, pending.trade, pick);
        if (game.phase === 'play') room.deadline = now + room.minutes * 60000;
        const record = game.log.at(-1);
        room.notice = `${record.name} · ${record.text}`;
      }
      room.pending = null;
      break;
    default:
      reject();
  }
  room.revision++;
}

function view(room, me, now) {
  const {game, pending} = room;
  const state = {
    revision: room.revision, me, host: me === 0, notice: room.notice,
    minutes: room.minutes, deadline: room.deadline, now,
    seats: room.seats.map(seat => seat.name),
  };
  if (!game) return state;
  const keeper = game.keeper === me;
  const guessing = game.phase === 'guess' && (me === game.turn || keeper);
  state.game = {
    round: game.round, phase: game.phase, keeper: game.keeper, turn: game.turn, winner: game.winner,
    matchWinners: game.matchWinners,
    clue: game.phase === 'keeper' ? null : game.clue,
    log: game.log,
    rule: game.rule && (keeper || game.phase === 'finished') ? {label: game.rule.label} : null,
    choices: guessing ? game.choices.map(({id, label}) => ({id, label})) : [],
    players: game.players.map(({name, hand, score, roundScore}, index) => ({
      name, score, roundScore, count: hand.length, hand: me === index ? hand : [],
    })),
  };
  if (keeper && game.phase === 'keeper') {
    state.setup = game.rule
      ? {cards: clueOptions(game), reference: game.rule.level === 2}
      : {rules: game.ruleOptions.map(({id, label}) => ({id, label}))};
  }
  state.waiting = Boolean(pending);
  if (pending) {
    if (pending.guess === undefined) {
      const hand = game.players[game.turn].hand;
      const cards = pending.trade ? hand : pending.ids.map(id => hand.find(card => card.id === id));
      state.submission = {trade: pending.trade, cards};
      if (keeper) {
        state.pending = {
          passing: pending.trade ? cards.filter(card => game.rule.matches(card, game.last)) : [],
        };
      }
    } else if (keeper) {
      state.pending = {guess: pending.guess};
    }
  }
  return state;
}

export function knowRoom(code, authorization, input = null) {
  const room = rooms.get(code);
  const me = room?.seats.findIndex(seat => 'Bearer ' + seat.token === authorization) ?? -1;
  if (me < 0) return null;
  const now = Date.now();
  expireTurn(room, now);
  if (input?.action === 'leave') {
    if (room.game) reject();
    room.seats.splice(me, 1);
    room.revision++;
    if (!room.seats.length) rooms.delete(code);
    return {left: true};
  }
  if (input !== null) act(room, me, input, now);
  room.updated = now;
  return view(room, me, now);
}
