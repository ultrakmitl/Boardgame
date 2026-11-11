const $ = id => document.getElementById(id);
const board = $('board');
const names = [
  'สกูตเตอร์ไม้', 'จักรยาน', 'สเกตบอร์ด', 'ตั๊กแตนขี่ได้', 'รถจิ๊ป',
  'สามล้อถีบ', 'นกกระสา', 'เรือหางยาว', 'มอเตอร์ไซค์', 'รถตุ๊กตุ๊ก',
  'แท็กซี่', 'รถสองแถว', 'รถจิ๋ว', 'รถขายอาหาร', 'รถล้อโต',
  'รถโกคาร์ต', 'รถสปอร์ต', 'เรือสปีดโบ๊ต', 'พรมวิเศษ', 'บอลลูน',
  'เรือดำน้ำฉลาม', 'เครื่องบินใบพัด', 'เฮลิคอปเตอร์', 'รถไฟหัวกระสุน', 'เรือเหาะ',
  'มังกรบิน', 'เรือเดินสมุทร', 'จานบิน', 'เครื่องบินไอพ่น', 'จรวด'
];
const money = value => '$' + (value * 1000).toLocaleString('en-US');
let game;
let session;
let room;
let pending = false;
let polling = false;

const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function name(id) {
  return escapeHtml(room.seats[id]);
}
function vehicle(value, button = false) {
  const index = value - 1;
  const art = '<span class="art" aria-hidden="true" style="--x:' + (index % 6) * 20 + '%;--y:' + Math.floor(index / 6) * 25 + '%"></span>';
  const content = '<b>' + value + '</b>' + art + '<span class="card-label">' + names[index] + '</span>';
  return button ? '<button class="vehicle" data-sell="' + value + '">' + content + '</button>' : '<div class="vehicle">' + content + '</div>';
}
function bidControls(minimum, maximum) {
  if (minimum > maximum) return '<p>เงินไม่พอเพิ่มยอดบิด</p>';
  return '<form id="bid-form" data-min="' + minimum + '" data-max="' + maximum + '">' +
    '<div class="bid-stepper" role="group" aria-label="ปรับยอดบิดทีละหนึ่งพันดอลลาร์">' +
    '<button type="button" data-bid-step="-1" aria-label="ลดยอดบิด 1,000 ดอลลาร์" disabled>−</button>' +
    '<button type="button" data-bid-step="1" aria-label="เพิ่มยอดบิด 1,000 ดอลลาร์"' +
    (minimum === maximum ? ' disabled' : '') + '>+</button></div>' +
    '<button class="primary" type="submit" name="bid" value="' + minimum +
    '" aria-live="polite">บิด ' + money(minimum) + '</button></form>';
}

function render() {
  if (!game) return;
  const {phase, round, rounds, players, turn, market, high} = game;
  const buying = phase === 'buy' || phase === 'bought';
  const active = phase === 'buy' ? players[turn] : phase === 'sell' ? players[room.you] : null;
  const canPlay = active?.id === room.you && (phase === 'buy' || active.chosen === null);
  const cash = buying && canPlay ? active.cash - active.bid : null;
  const seats = players.map(player => {
    const state = phase === 'buy' && !player.passed ? 'บิด ' + money(player.bid)
      : buying ? 'ได้การ์ด ' + player.acquired
      : phase === 'sell' ? (player.chosen === null ? 'กำลังเลือก' : 'เลือกแล้ว')
      : (player.handCount) + ' การ์ดในมือ';
    return '<li class="' + (active === player ? 'active' : '') + '"><strong>' + name(player.id) + '</strong><span>' + state + '</span></li>';
  }).join('');
  let content;
  if (phase === 'done') {
    const results = game.results;
    const winners = results.filter(row => row.total === results[0].total && row.cash === results[0].cash);
    content = '<div class="result"><h2>' + winners.map(row => name(row.id)).join(' และ ') + ' ชนะ!</h2><table><thead><tr><th>ผู้เล่น</th><th>เงินสด</th><th>เช็ค</th><th>รวม</th></tr></thead><tbody>' +
      results.map(row => '<tr><th scope="row">' + name(row.id) + '</th><td>' + money(row.cash) + '</td><td>' + money(row.proceeds) + '</td><td><strong>' + money(row.total) + '</strong></td></tr>').join('') +
      '</tbody></table>' + (room.you !== 0 ? '<p>รอเจ้าห้องเริ่มเกมใหม่</p>'
        : '<button class="primary" data-action="start">เล่นเกมใหม่</button>') + '</div>';
  } else {
    const title = buying ? 'ประมูลยานพาหนะ' : 'ขายยานพาหนะ';
    const cards = phase === 'bought' ? players.slice().sort((a, b) => a.acquired - b.acquired).map(player => '<div class="awarded">' + vehicle(player.acquired) + '<span>' + name(player.id) + '</span></div>').join('')
      : buying ? market.map(value => vehicle(value)).join('')
      : market.map(value => '<div class="check"><span>เช็ค</span><b>' + money(value) + '</b>' + (value === 0 ? '<small>เช็คเปล่า</small>' : '') + '</div>').join('');
    content = '<div class="tabletop"><div class="table-head"><div><p>ช่วง ' + (buying ? '1' : '2') + ' · รอบ ' + round + '/' + rounds + '</p><h2>' + title + '</h2></div>' +
      (phase === 'buy' ? '<strong>ยอดสูงสุด ' + money(high) + '</strong>' : '') +
      '</div><ul class="seats">' + seats + '</ul><div class="cards">' + cards + '</div></div>';
    if (phase === 'bought' || phase === 'sold') {
      const report = phase === 'sold' ? '<ul class="sale-results">' + game.lastSale.map(row => '<li><strong>' + name(row.id) + '</strong> การ์ด ' + row.house + ' → ' + money(row.check) + '</li>').join('') + '</ul>'
        : '<p>' + name(turn) + ' ได้การ์ดเลขสูงสุดและจ่าย ' + money(players[turn].bid) + '</p>';
      const next = phase === 'bought' && round === rounds ? 'เริ่มขายยานพาหนะ' : phase === 'sold' && round === rounds ? 'ดูผลคะแนน' : 'รอบถัดไป';
      content += '<div class="actions">' + report + '<button class="primary" data-action="advance">' + next + '</button></div>';
    } else if (!canPlay) {
      const message = buying ? 'รอ ' + name(turn) + ' ประมูล' : 'ล็อกการ์ดแล้ว รอผู้เล่นคนอื่นเลือก';
      content += '<div class="actions" role="status">' + message + '</div>';
    } else if (buying) {
      content += '<div class="actions"><div><h3>ตาของ ' + name(active.id) + '</h3><p>เงินที่ยังไม่ลงบิด ' + money(cash) + ' · ลงบิดไว้ ' + money(active.bid) + '</p></div>' + bidControls(high + 1, active.cash) +
        '<button data-action="pass">ผ่าน · รับการ์ด ' + market[0] + ' · จ่าย ' + money(Math.ceil(active.bid / 2)) + '</button></div>' +
        (active.hand.length ? '<div class="hand"><h3>การ์ดในมือ</h3><div class="cards">' + [...active.hand].sort((a, b) => a - b).map(value => vehicle(value)).join('') + '</div></div>' : '');
    } else {
      content += '<div class="hand"><h3>' + name(active.id) + ' เลือกยานพาหนะที่จะขาย</h3><div class="cards">' + [...active.hand].sort((a, b) => a - b).map(value => vehicle(value, true)).join('') + '</div></div>';
    }
  }
  board.innerHTML = content + '<button class="leave outline" data-action="exit">กลับหน้าเริ่มเกม</button>';
}

board.addEventListener('submit', event => {
  event.preventDefault();
  const bid = Number(event.target.elements.bid.value);
  act('bid', {bid});
});
board.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.bidStep) {
    const form = button.form;
    const {min, max} = form.dataset;
    const submit = form.elements.bid;
    const bid = Math.max(Number(min), Math.min(Number(max), Number(submit.value) + Number(button.dataset.bidStep)));
    submit.value = bid;
    submit.textContent = 'บิด ' + money(bid);
    form.querySelector('[data-bid-step="-1"]').disabled = bid === Number(min);
    form.querySelector('[data-bid-step="1"]').disabled = bid === Number(max);
    if (button.disabled) submit.focus();
    return;
  }
  const {action, sell} = button.dataset;
  if (action === 'copy') return copyInvite();
  if (action === 'exit') return game ? leaveOnline() : act('leave');
  if (sell) return act('sell', {card: Number(sell)});
  act(action);
});
$('catalog').innerHTML = names.map((_, index) => vehicle(index + 1)).join('');
$('open-rules').addEventListener('click', () => $('rules').showModal());

const inviteCode = new URL(location.href).searchParams.get('room')?.trim().toUpperCase();
const validCode = code => /^[A-F0-9]{8}$/.test(code);
const sessionKey = code => 'for-sale-room:' + code;

function showStatus(message = '') {
  const status = $('online-status');
  status.textContent = message;
  status.hidden = !message;
}

function roomUrl(code) {
  const url = new URL(location.href);
  url.searchParams.delete('room');
  if (code) url.searchParams.set('room', code);
  return url;
}

async function request(path, body, token) {
  const response = await fetch('/api/for-sale/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      ...(token ? {Authorization: 'Bearer ' + token} : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.status = response.status;
    throw error;
  }
  return data;
}

function applyRoom(state) {
  if (room && state.version <= room.version) return;
  room = state;
  game = state.game;
  $('lobby').hidden = true;
  board.hidden = false;
  if (game) return render();
  const invite = escapeHtml(roomUrl(session.code).href);
  const start = room.you === 0
    ? '<button class="primary" data-action="start"' + (room.seats.length < 3 ? ' disabled' : '') + '>เริ่มเกม</button>'
    : '<p>รอเจ้าห้องเริ่มเกม</p>';
  board.innerHTML = '<div class="tabletop"><div class="table-head"><div><p>ห้องออนไลน์</p><h2>ห้อง ' + session.code +
    '</h2></div><strong>' + room.seats.length + '/6 คน</strong></div><ul class="seats">' +
    room.seats.map((seat, id) => '<li' + (id === room.you ? ' class="active"' : '') + '><strong>' +
      escapeHtml(seat) + '</strong>' + (id === 0 ? '<span>เจ้าห้อง</span>' : '') + '</li>').join('') +
    '</ul><p>เริ่มได้เมื่อมีผู้เล่นอย่างน้อย 3 คน</p></div>' +
    '<div class="actions room-info"><label>ลิงก์ชวนเพื่อน<input id="invite-link" readonly value="' + invite +
    '"></label><button data-action="copy">คัดลอกลิงก์</button>' + start +
    '</div><button class="leave outline" data-action="exit">ออกจากห้องรอ</button>';
}

function leaveOnline(message = '') {
  session = room = game = null;
  board.hidden = true;
  board.replaceChildren();
  $('lobby').hidden = false;
  $('create-room').hidden = false;
  history.replaceState(null, '', roomUrl());
  showStatus(message);
}

function handleRoomError(error, current) {
  if (session !== current) return;
  if (error.status === 401) {
    sessionStorage.removeItem(sessionKey(current.code));
    leaveOnline(error.message);
  } else {
    showStatus(error.status ? error.message : 'เชื่อมต่อขัดข้อง กำลังลองใหม่');
  }
}

async function refreshRoom() {
  if (!session || pending || polling) return;
  const current = session;
  polling = true;
  try {
    const state = await request('room?code=' + current.code, undefined, current.token);
    if (session === current && !pending) {
      const reconnecting = $('online-status').textContent === 'เชื่อมต่อขัดข้อง กำลังลองใหม่';
      applyRoom(state);
      if (reconnecting) showStatus();
    }
  } catch (error) {
    handleRoomError(error, current);
  } finally {
    polling = false;
  }
}

async function act(action, data = {}) {
  if (!action || pending) return;
  const current = session;
  pending = true;
  showStatus();
  try {
    const state = await request('room?code=' + current.code,
      {action, version: room.version, match: room.match, round: game?.round, ...data}, current.token);
    if (state.left) {
      sessionStorage.removeItem(sessionKey(current.code));
      leaveOnline();
    } else applyRoom(state);
  } catch (error) {
    handleRoomError(error, current);
  } finally {
    pending = false;
  }
}

async function copyInvite() {
  const input = $('invite-link');
  try {
    await navigator.clipboard.writeText(input.value);
    showStatus('คัดลอกลิงก์แล้ว');
  } catch {
    input.focus();
    input.select();
    showStatus('เลือกลิงก์ให้แล้ว กดคัดลอกเพื่อส่งให้เพื่อน');
  }
}

$('online-setup').addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || session) return;
  const create = event.submitter?.id === 'create-room' && !$('create-room').hidden;
  const code = $('online-code').value.trim().toUpperCase();
  if (!create && !validCode(code)) return showStatus('กรอกรหัสห้อง 8 ตัวจากลิงก์ชวนเพื่อน');
  pending = true;
  showStatus('กำลังเข้าห้อง…');
  try {
    const token = create ? null : sessionStorage.getItem(sessionKey(code));
    session = token ? {code, token} : await request('enter', {name: $('online-name').value, create, code});
    sessionStorage.setItem(sessionKey(session.code), session.token);
    history.replaceState(null, '', roomUrl(session.code));
    showStatus();
  } catch (error) {
    showStatus(error.status ? error.message : 'เชื่อมต่อไม่ได้ ลองอีกครั้ง');
  } finally {
    pending = false;
  }
  await refreshRoom();
});

if (validCode(inviteCode)) {
  $('online-code').value = inviteCode;
  $('create-room').hidden = true;
  const token = sessionStorage.getItem(sessionKey(inviteCode));
  if (token) {
    session = {code: inviteCode, token};
    refreshRoom();
  }
}
setInterval(refreshRoom, 850);
