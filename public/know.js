import {animals, colors, levels, rules, startGame, beginRound, playTurn, guessRule} from './know-rules.js';

const byId = id => document.getElementById(id);
let game;
let open = false;
let selected = [];
let feedback = '';
let pending = null;
let session = null;
let remote = null;
let busy = false;
let polling = false;
const storageKey = 'know-online-session';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, onClick, primary = false) {
  const node = element('button', text, primary ? 'primary' : '');
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function cardFace(card, interactive = false) {
  const label = `สี${colors[card.color]} เลข ${card.number} ${animals[card.animal]}`;
  const face = element(interactive ? 'button' : 'div', '', `card color-${card.color}`);
  face.setAttribute('aria-label', label);
  const top = element('span', String(card.number), 'rank');
  top.append(element('small', colors[card.color]));
  const figures = element('span', '', 'figures figures-' + card.number);
  for (let copy = 0; copy < card.number; copy++) {
    const figure = element('span', '', `animal animal-${card.animal}`);
    figures.append(figure);
  }
  figures.setAttribute('aria-hidden', 'true');
  face.append(top, figures, element('small', animals[card.animal], 'species'));
  if (interactive) {
    face.type = 'button';
    face.addEventListener('click', () => {
      selected = selected.includes(card.id) ? selected.filter(id => id !== card.id) : [...selected, card.id];
      updateSelection();
    });
    face.dataset.id = card.id;
    face.append(element('span', '', 'order'));
  }
  return face;
}

function updateSelection() {
  for (const face of byId('actions').querySelectorAll('[data-id]')) {
    const index = selected.indexOf(Number(face.dataset.id));
    face.setAttribute('aria-pressed', String(index >= 0));
    face.querySelector('.order').textContent = index >= 0 ? index + 1 : '';
  }
  const submit = byId('submit-cards');
  submit.disabled = !selected.length;
  submit.textContent = selected.length ? `ส่งไพ่ ${selected.length} ใบให้ตรวจ` : 'ส่งไพ่ให้ตรวจ';
}

function render(focus = true) {
  const player = game.players[game.turn];
  const keeper = game.players[game.keeper];
  byId('round').textContent = `รอบ ${game.round} / ${game.players.length}`;
  byId('board').hidden = game.phase === 'keeper';
  byId('history').hidden = game.phase === 'keeper';
  byId('players').replaceChildren(...game.players.map((seat, index) => {
    const isKeeper = index === game.keeper;
    const isCurrent = !isKeeper && game.phase !== 'keeper' && game.phase !== 'finished' && index === game.turn;
    const row = element('div', '', isCurrent ? 'seat active-seat' : 'seat');
    const name = element('div', '', 'seat-name');
    const role = isKeeper ? 'ผู้คุมกฎ' : `${isCurrent ? 'กำลังเล่น · ' : ''}ไพ่ ${seat.count ?? seat.hand.length} ใบ`;
    name.append(element('strong', seat.name), element('small', role));
    row.append(name, element('span', `${seat.score} แต้ม`, 'seat-score'));
    return row;
  }));
  const trail = game.phase === 'keeper' ? [] : [game.clue, ...game.log.flatMap(record =>
    record.played ? [record.played] : record.accepted && !record.trade ? record.cards : [],
  )];
  const line = byId('last');
  byId('clue-count').textContent = `${trail.length} ใบ`;
  line.replaceChildren(...trail.map((card, index) => {
    const tile = element('div', '', 'clue-tile');
    const label = index === 0 ? 'ใบตั้งต้น' : index === trail.length - 1 ? 'ใบล่าสุด' : '';
    tile.append(cardFace(card), element('small', label));
    return tile;
  }));
  line.scrollLeft = line.scrollWidth;
  const log = byId('log');
  log.replaceChildren(...game.log.slice().reverse().map(record => {
    const rejected = !record.accepted && !record.trade;
    const item = element(rejected ? 'div' : 'details', '', rejected ? 'rejected-play' : '');
    item.append(element(rejected ? 'strong' : 'summary', `${record.name} · ${record.text}`));
    const faces = element('div', '', 'log-cards');
    if (record.played) faces.append(element('p', 'ไพ่ที่ผู้คุมกฎลงให้'), cardFace(record.played));
    if (record.trade) faces.append(element('p', 'ไพ่ที่เปิดตอนขอเปลี่ยน'));
    faces.append(...record.cards.map(card => cardFace(card)));
    item.append(faces);
    return item;
  }));
  if (!game.log.length) log.append(element('p', 'ยังไม่มีการลงไพ่'));

  const title = byId('turn-title');
  const actions = byId('actions');
  actions.replaceChildren();
  byId('notice').textContent = feedback;
  if (game.phase === 'finished') {
    renderResult(title, actions);
  } else if (remote) {
    renderOnlineActions(title, actions, player, keeper);
  } else if (game.phase === 'keeper' || pending) {
    title.textContent = open ? `${keeper.name} · ผู้คุมกฎ` : `ส่งเครื่องให้ ${keeper.name}`;
    if (!open) {
      byId('notice').textContent = 'ให้ผู้คุมกฎดูหน้าจอคนเดียว';
      actions.append(button('เปิดหน้าผู้คุมกฎ', () => { open = true; render(); }, true));
    } else {
      actions.append(element('p', game.rule.label, 'secret-rule'));
      if (game.phase === 'keeper') {
        actions.append(button('ซ่อนกฎและเริ่มรอบ', () => { beginRound(game); endTurn(''); }, true));
      } else if (pending.guess !== undefined) {
        const choice = game.choices.find(rule => rule.id === pending.guess);
        actions.append(element('p', `${player.name} เลือก “${choice.label}”`));
        actions.append(button('ยืนยันผลการทายและซ่อนกฎ', () => {
          guessRule(game, choice.id);
          endTurn(game.phase === 'finished' ? '' : `${player.name} ตอบยังไม่ถูก ส่งสิทธิ์ให้คนถัดไป`);
        }, true));
      } else {
        const candidates = pending.trade ? player.hand : pending.ids.map(id => player.hand.find(card => card.id === id));
        const tray = element('div', '', 'hand');
        tray.append(...candidates.map(card => cardFace(card)));
        actions.append(tray);
        const controls = element('div', '', 'controls');
        if (pending.trade) {
          const passing = candidates.filter(card => game.rule.matches(card, game.last));
          if (passing.length) {
            passing.forEach(card => {
              const label = `ลง ${colors[card.color]} ${card.number} · ${animals[card.animal]}`;
              controls.append(button(label, () => resolvePlay(card.id), true));
            });
          } else {
            controls.append(button('ยืนยันว่าไม่มีไพ่ที่ผ่าน', () => resolvePlay(), true));
          }
        } else {
          controls.append(button('ตรวจไพ่และซ่อนกฎ', () => resolvePlay(), true));
        }
        actions.append(controls);
      }
    }
  } else if (!open) {
    title.textContent = `ส่งเครื่องให้ ${player.name}`;
    actions.append(button(game.phase === 'guess' ? 'เปิดตัวเลือกกฎ' : 'เปิดไพ่ของฉัน', () => {
      open = true;
      feedback = '';
      render();
    }, true));
  } else if (game.phase === 'guess') {
    title.textContent = `${player.name} คิดว่ากฎลับคือข้อไหน?`;
    const options = element('div', '', 'options');
    options.append(...game.choices.map(rule => button(rule.label, () => {
      handToKeeper({guess: rule.id});
    })));
    actions.append(options);
  } else {
    title.textContent = `ตาของ ${player.name}`;
    byId('notice').textContent = 'เลือกไพ่ตามลำดับที่ต้องการลง';
    renderHand(actions, player, () => handToKeeper({ids: selected, trade: false}),
      () => handToKeeper({ids: [], trade: true}));
  }
  if (focus) title.focus();
}

function renderHand(actions, player, submitPlay, submitTrade) {
  const hand = element('div', '', 'hand');
  hand.append(...player.hand.map(card => cardFace(card, true)));
  const controls = element('div', '', 'controls hand-controls');
  const submit = button('ส่งไพ่ให้ตรวจ', submitPlay, true);
  submit.id = 'submit-cards';
  controls.append(submit, button('ขอเปลี่ยนไพ่ทั้งมือ', submitTrade));
  actions.append(hand, controls);
  updateSelection();
}

function handToKeeper(action) {
  pending = action;
  open = false;
  feedback = '';
  render();
}

function resolvePlay(keeperPick = null) {
  playTurn(game, pending.ids, pending.trade, keeperPick);
  const record = game.log.at(-1);
  endTurn(`${record.name} · ${record.text}`);
}

function endTurn(message) {
  pending = null;
  open = false;
  selected = [];
  feedback = message;
  render();
}

function lobby() {
  game = undefined;
  byId('game').hidden = true;
  byId('lobby').hidden = false;
  byId('names').focus();
}

byId('setup').addEventListener('submit', event => {
  event.preventDefault();
  const names = byId('names').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  const error = byId('error');
  if (names.length < 3 || names.length > 7 || new Set(names).size !== names.length || names.some(name => name.length > 24)) {
    error.textContent = 'กรอกชื่อไม่ซ้ำกัน 3–7 คน ชื่อละไม่เกิน 24 ตัวอักษร';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  game = startGame(names);
  byId('lobby').hidden = true;
  byId('game').hidden = false;
  endTurn('');
});
byId('leave').addEventListener('click', () => {
  if (game.phase === 'finished' || window.confirm('จบรอบนี้และกลับหน้าเริ่มหรือไม่?')) lobby();
});

const catalog = byId('rule-list');
for (const [level, label] of levels.entries()) {
  const list = element('ul');
  list.append(...rules.filter(rule => rule.level === level).map(rule => element('li', rule.label)));
  catalog.append(element('h3', label), list);
}
byId('toggle-history').addEventListener('click', event => {
  const log = byId('log');
  log.hidden = !log.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!log.hidden));
  event.currentTarget.textContent = log.hidden ? 'แสดงประวัติ' : 'ซ่อนประวัติ';
});

byId('help').addEventListener('click', () => {
  catalog.parentElement.hidden = Boolean(game && game.phase !== 'finished');
  catalog.parentElement.open = false;
  byId('instructions').showModal();
});

function renderResult(title, actions) {
  const winners = game.matchWinners;
  const matchOver = winners.length > 0;
  title.textContent = matchOver
    ? `${winners.join(' และ ')} ${winners.length > 1 ? 'ชนะร่วมกัน' : 'ชนะทั้งเกม'}`
    : `${game.winner} ไขกฎสำเร็จ!`;
  const scores = element('ul');
  for (const [index, seat] of game.players.entries()) {
    const change = seat.roundScore > 0 ? `+${seat.roundScore}` : seat.roundScore;
    const detail = index === game.keeper ? 'ผู้คุมกฎ' : `เหลือ ${seat.count ?? seat.hand.length} ใบ`;
    scores.append(element('li', `${seat.name} · ${detail} · รอบนี้ ${change} · รวม ${seat.score} คะแนน`));
  }
  actions.append(element('p', game.rule.label, 'answer'), scores);
  if (matchOver) actions.prepend(element('p', `${game.winner} ทายกฎลับถูกในรอบสุดท้าย`));

  const label = matchOver ? 'เริ่มเกมใหม่' : 'เริ่มรอบถัดไป';
  if (remote && !remote.host) {
    actions.append(element('p', `รอเจ้าของห้อง${label}`));
  } else {
    actions.append(button(label, () => {
      if (remote) {
        sendAction(matchOver ? 'rematch' : 'next');
      } else {
        game = startGame(game.players.map(seat => seat.name), matchOver ? null : game);
        endTurn('');
      }
    }, true));
  }
}

function renderOnlineActions(title, actions, player, keeper) {
  const isKeeper = remote.me === game.keeper;

  if (isKeeper) {
    title.textContent = 'คุณเป็นผู้คุมกฎ';
    actions.append(element('p', game.rule.label, 'secret-rule'));
    if (game.phase === 'keeper') {
      actions.append(button('เปิดไพ่ตั้งต้นและเริ่มรอบ', () => sendAction('begin'), true));
    } else if (!remote.pending) {
      actions.append(element('p', `รอ ${player.name}`));
    } else if (remote.pending.guess !== undefined) {
      const choice = game.choices.find(rule => rule.id === remote.pending.guess);
      actions.append(element('p', `${player.name} เลือก “${choice.label}”`),
        button('ยืนยันผลการทาย', () => sendAction('resolve'), true));
    } else {
      const {cards, passing, trade} = remote.pending;
      const tray = element('div', '', 'hand');
      tray.append(...cards.map(card => cardFace(card)));
      const controls = element('div', '', 'controls');
      if (passing.length) {
        passing.forEach(card => {
          const label = `ลง ${colors[card.color]} ${card.number} · ${animals[card.animal]}`;
          controls.append(button(label, () => sendAction('resolve', {pick: card.id}), true));
        });
      } else {
        controls.append(button(trade ? 'ยืนยันว่าไม่มีไพ่ที่ผ่าน' : 'ตรวจไพ่',
          () => sendAction('resolve'), true));
      }
      actions.append(tray, controls);
    }
    return;
  }

  if (game.phase === 'keeper' || remote.waiting) {
    title.textContent = `รอ ${keeper.name} · ผู้คุมกฎ`;
  } else if (remote.me !== game.turn) {
    title.textContent = `ตาของ ${player.name}`;
  } else if (game.phase === 'guess') {
    title.textContent = 'เลือกกฎลับ';
    const options = element('div', '', 'options');
    options.append(...game.choices.map(rule => button(rule.label, () => sendAction('guess', {choice: rule.id}))));
    actions.append(options);
  } else {
    title.textContent = 'ตาของคุณ';
    actions.append(element('p', 'เลือกไพ่ตามลำดับที่ต้องการลง', 'hand-hint'));
    renderHand(actions, player, () => sendAction('play', {ids: selected}), () => sendAction('trade'));
    return;
  }

  const ownHand = game.players[remote.me].hand;
  if (ownHand.length) {
    const tray = element('div', '', 'hand');
    tray.append(...ownHand.map(card => cardFace(card)));
    actions.append(tray);
  }
}

function connection(message) {
  byId('connection').textContent = message;
  byId('connection').hidden = !message;
}

async function request(path, {payload, current} = {}) {
  const headers = {};
  if (payload) headers['Content-Type'] = 'application/json';
  if (current) headers.Authorization = 'Bearer ' + current.token;
  const response = await fetch(path, {
    method: payload ? 'POST' : 'GET',
    headers, body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error);
    error.status = response.status;
    throw error;
  }
  return result;
}

function roomPath(current) {
  return '/api/know/room?code=' + encodeURIComponent(current.code);
}

function displayRoom(state) {
  if (remote && state.revision <= remote.revision) return;
  remote = state;
  game = state.game;
  feedback = state.notice;
  selected = [];
  byId('waiting-room').hidden = Boolean(game);
  byId('disconnect').hidden = Boolean(game);
  byId('game').hidden = !game;
  byId('leave').hidden = true;
  if (game) {
    render(false);
    return;
  }
  byId('waiting-seats').replaceChildren(...state.seats.map((name, index) =>
    element('span', index === 0 ? `${name} · เจ้าของห้อง` : name)));
  byId('waiting-note').textContent = `${state.seats.length}/7 คน · เริ่มได้เมื่อมีอย่างน้อย 3 คน`;
  byId('start-online').hidden = !state.host;
  byId('start-online').disabled = state.seats.length < 3;
}

function attach(current) {
  session = current;
  sessionStorage.setItem(storageKey, JSON.stringify(current));
  const url = new URL(location.href);
  url.searchParams.set('room', current.code);
  history.replaceState(null, '', url);
  byId('invite-link').href = url.href;
  byId('room-label').textContent = 'ห้อง ' + current.code;
  byId('lobby').hidden = true;
  byId('online-room').hidden = false;
}

function detach(message = '') {
  session = null;
  remote = null;
  sessionStorage.removeItem(storageKey);
  byId('online-room').hidden = true;
  byId('waiting-room').hidden = true;
  byId('leave').hidden = false;
  lobby();
  connection(message);
}

async function sync(action, fields = {}) {
  if (!session || busy || (action ? !remote : polling)) return;
  const current = session;
  if (action) busy = true;
  else polling = true;
  try {
    const payload = action ? {action, revision: remote.revision, ...fields} : undefined;
    const state = await request(roomPath(current), {payload, current});
    if (session !== current) return;
    if (action === 'leave') {
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
      detach();
      byId('online-name').focus();
      return;
    }
    displayRoom(state);
    if (action || !busy) connection('');
  } catch (error) {
    if (session !== current) return;
    if (error.status === 401) detach(error.message);
    else connection(error.status ? error.message : 'เชื่อมต่อห้องไม่ได้ กำลังลองใหม่');
  } finally {
    if (action) busy = false;
    else polling = false;
  }
}

function sendAction(action, fields) {
  return sync(action, fields);
}

byId('online-setup').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const create = event.submitter?.value === 'create';
  const name = byId('online-name').value.trim();
  const code = byId('room-code').value.trim().toUpperCase();
  if (!create && !/^[A-F0-9]{8}$/.test(code)) {
    connection('กรอกรหัสห้อง 8 ตัว หรือเปิดลิงก์เชิญ');
    return;
  }
  busy = true;
  try {
    attach(await request('/api/know/enter', {payload: {create, name, code}}));
  } catch (error) {
    connection(error.status ? error.message : 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้ง');
  } finally {
    busy = false;
  }
  if (session) sync();
});

byId('start-online').addEventListener('click', () => sendAction('start'));
byId('disconnect').addEventListener('click', () => sendAction('leave'));
byId('copy-invite').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(byId('invite-link').href);
    byId('copy-invite').textContent = 'คัดลอกแล้ว';
  } catch {
    connection('คลิกขวาที่ลิงก์เชิญแล้วเลือกคัดลอกที่อยู่ลิงก์');
  }
});

const inviteCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
byId('room-code').value = inviteCode;
const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
if (saved?.code === inviteCode && saved.token) {
  attach(saved);
  sync();
}
setInterval(() => sync(), 900);
