import { startRoomPolling } from './room-polling.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const money = value => (value < 0 ? '−' : '') + '$' + (Math.abs(value)*1000).toLocaleString('en-US');
const colors = {
  blue:['น้ำเงิน',[20,20,20,30,30,30,40,40]],
  green:['เขียว',[0,10,20,30,30,40,50,60]],
  yellow:['เหลือง',[-10,0,0,30,40,40,60,60]],
  red:['แดง',[-20,-10,0,30,40,50,60,70]]
};
const phaseCopy = {
  lobby:['ห้องรอ','ส่งลิงก์เชิญให้เพื่อน เจ้าห้องเริ่มได้เมื่อมีผู้เล่น 3–11 คน'],
  pricing:['ตั้งราคาเปิด','นักลงทุนดูราคาเปิดของแต่ละบริษัทได้ก่อนเริ่มเจรจา'],
  trade:['เปิดตลาด · เจรจาราคาหุ้น','นักลงทุนส่งราคาใต้แผ่นบริษัท ผู้จัดการกดรับก่อนหมดเวลา'],
  'market-roll':['ทอยลูกเต๋าตลาด','เจ้าห้องเลือกสีที่จะทอยทีละลูก ผลแต่ละสีจะปรากฏพร้อมกันทุกหน้าจอ'],
  settle:['ชำระราคาหุ้น','ผู้จัดการเจ้าหนี้เลือกวิธีจัดการดีลที่นักลงทุนจ่ายไม่ไหว'],
  fees:['ค่าบริหารบริษัท','ผู้จัดการที่เงินไม่พอต้องเลือกบริษัทขายคืนธนาคาร'],
  review:['สรุปผลตลาด','ตรวจผลตอบแทน ราคาหุ้น และค่าบริหารก่อนเปิดประมูล'],
  auction:['ประมูลบริษัท','ผู้จัดการเสนอราคาสูงขึ้นหรือกดผ่าน ราคาล่าสุดชนะเมื่อหมดเวลา'],
  done:['ปิดตลาด','สรุปผู้ชนะหลังซื้อขายครบ 5 เดือน']
};
let room = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
let session = sessionStorage.getItem('wall:' + room);
let state, offset = 0, busy = false, polling = false;
const tileNodes = new Map();

function status(message = '') { $('status').textContent = message; }
function who(id) { return escape(state.players[id]?.name); }
function me() { return state.players[state.you]; }
function canConfirmLock(tile) {
  return state.phase === 'trade' && !tile.deal?.closed && tile.deal?.lockRequestedBy != null &&
    tile.deal.lockRequestedBy !== state.you && (tile.owner === state.you || tile.deal.investor === state.you);
}
function roleOf(player) {
  return [player.manager && 'ผู้จัดการ',player.investor && 'นักลงทุน'].filter(Boolean).join(' / ');
}

async function api(endpoint,input) {
  const headers = session ? {Authorization:'Bearer ' + session} : {};
  if (input) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/wall-street/' + endpoint,{
    method:input ? 'POST' : 'GET', headers, body:input ? JSON.stringify(input) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error),{status:response.status});
  return data;
}

function update(next) {
  if (state && next.version < state.version) return;
  offset = next.now - Date.now();
  if (next.version === state?.version) return;
  const previous = state;
  state = next;
  if (previous && previous.phase !== state.phase && ['fees','auction','done'].includes(state.phase)) {
    $('tile-filter').value = state.phase === 'fees' && me().fee ? 'owned' : 'all';
  }
  if (previous?.phase !== state.phase) {
    $('board-scroll').scrollTop = 0;
    if (state.phase === 'pricing') $('tile-filter').value = 'all';
  }
  $('entry').hidden = true;
  $('table').hidden = false;
  document.body.classList.add('in-room');
  $('room-code').textContent = room;
  $('phase').textContent = phaseCopy[state.phase][0];
  $('instruction').textContent = state.phase === 'trade' ?
    (me().manager && me().investor ? 'เสนอราคาบริษัทคนอื่น หรือรับข้อเสนอในบริษัทของคุณ' :
      me().manager ? 'เปิดตัวกรอง «ข้อเสนอรอรับ» เพื่อเลือกดีลของบริษัทคุณ' :
      me().investor ? 'เลือกบริษัทแล้วกด «เสนอราคา» ก่อนหมดเวลา' : 'รอดูผลตลาด') :
    phaseCopy[state.phase][1];
  $('wallet').hidden = !state.round;
  if (state.round) $('wallet').textContent = (roleOf(me()) || 'ออกจากการแข่งขัน') + ' · เงินสด ' + money(me().cash);
  $('rounds').textContent = state.round ? 'เดือน ' + state.round + '/5' : '';
  if (JSON.stringify([state.positions,state.rolls]) !== JSON.stringify([previous?.positions,previous?.rolls])) renderMarket();
  renderPlayers();
  const activityKey = JSON.stringify([state.phase,state.round,state.report,state.debt,state.auction,state.rolls,state.rollingColor,
    state.players.map(p => [p.cash,p.manager,p.pricingReady])]);
  if ($('activity').dataset.key !== activityKey) {
    $('activity').dataset.key = activityKey;
    renderActivity();
  }
  renderTiles();
  const incoming = state.phase === 'trade' ? state.offers.filter(offer =>
    state.tiles.some(tile => tile.id === offer.tile && tile.owner === state.you && !tile.deal?.closed)).length : 0;
  const confirmations = state.tiles?.filter(canConfirmLock).length ?? 0;
  const pending = incoming + confirmations;
  const label = confirmations ? 'ดีลที่รอคุณ' : 'ข้อเสนอรอรับ';
  $('tile-filter').querySelector('[value="offers"]').textContent = label + (pending ? ' (' + pending + ')' : '');
  $('incoming-offers').hidden = pending === 0;
  $('incoming-offers').textContent = 'ดู' + label + ' (' + pending + ')';
  if (JSON.stringify(state.messages) !== JSON.stringify(previous?.messages)) {
    $('messages').innerHTML = state.messages.map(({player,message}) =>
      '<p><strong>' + who(player) + '</strong> ' + escape(message) + '</p>').join('');
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  clock();
}

function clock() {
  $('clock').hidden = !state?.deadline;
  if (!state?.deadline) return;
  const seconds = Math.max(0,Math.ceil((state.deadline - Date.now() - offset)/1000));
  $('clock').textContent = Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0');
  $('clock').setAttribute('aria-label','เหลือ ' + seconds + ' วินาที');
  $('clock').classList.toggle('urgent',seconds <= 15);
}

function renderMarket() {
  $('market-panel').hidden = !state.positions;
  $('ticker').innerHTML = state.positions ? Object.entries(colors).map(([color,[label,track]]) => {
    const roll = state.rolls?.[color];
    const die = roll == null ? '' : '<b class="die" aria-label="ลูกเต๋า ' + roll + '">' + (roll > 0 ? '+' : '') + roll + '</b>';
    return '<div class="quote ' + color + (roll == null ? '' : ' reveal') + '"><span>' + label + '</span><strong>' +
      money(track[state.positions[color]]) + '</strong>' + die + '</div>';
  }).join('') : '';
  $('market').innerHTML = state.positions ? Object.entries(colors).map(([color,[label,track]]) => {
    const roll = state.rolls?.[color];
    const delta = roll == null ? '' : ' ' + (roll > 0 ? '+' : '') + roll;
    return '<div class="track ' + color + (roll == null ? '' : ' reveal') + '"><span>' + label +
      (roll == null ? '' : ' <b class="die" aria-label="ลูกเต๋า ' + delta.trim() + '">' + delta.trim() + '</b>') + '</span>' +
      track.map((value,i) => '<span ' + (i === state.positions[color] ? 'class="active" aria-current="true"' : '') + '>' + value + 'k</span>').join('') + '</div>';
  }).join('') : '';
}

function renderPlayers() {
  $('players').innerHTML = state.players.map(p => {
    const role = roleOf(p);
    const tokens = p.investor && p.id === state.you ? state.tiles?.filter(t => t.deal?.investor === p.id).length + '/10 ดีล' : '';
    return '<div class="players-row"><div><strong>' + who(p.id) + '</strong> ' + (p.id === state.you ? '(คุณ)' : '') +
      '<br><small>' + (role || (state.round ? 'ออกจากการแข่งขัน' : p.id === 0 ? 'เจ้าห้อง' : 'รอเริ่ม')) +
      '</small></div><div>' + (p.cash == null || !state.round ? '' : money(p.cash)) + (tokens ? '<br><small>' + tokens + '</small>' : '') + '</div></div>';
  }).join('');
}

function button(action,label,data = {}) {
  const attributes = Object.entries(data).map(([key,value]) => ' data-' + key + '="' + escape(value) + '"').join('');
  return '<button type="button" data-action="' + action + '"' + attributes + '>' + label + '</button>';
}

function report() {
  const line = state.report?.[state.you];
  if (!line) return '';
  return '<p>บัญชีเดือนนี้ · ผลตลาด <b>' + money(line.dividend) + '</b> · รับค่าหุ้น ' + money(line.received) +
    ' · จ่ายค่าหุ้น ' + money(line.paid) + ' · ค่าบริหาร ' + money(line.fees) +
    (line.sold ? ' · ขายคืน ' + money(line.sold) : '') + '</p>';
}

function ranking(title,players) {
  const ordered = [...players].sort((a,b) => b.cash-a.cash);
  return '<h2>' + title + '</h2><table class="results"><thead><tr><th>ผู้เล่น</th><th>เงินสด</th></tr></thead><tbody>' +
    ordered.map(p => '<tr><td>' + who(p.id) + (p.cash === ordered[0].cash ? ' <span class="winner">ชนะ</span>' : '') + '</td><td>' +
      money(p.cash) + '</td></tr>').join('') + '</tbody></table>';
}

function companyHeader(company,heading,caption) {
  const color = company.color;
  const multiplier = company.multiple === 2 ?
    ' <span class="multiplier" title="ผลตอบแทนและขาดทุนคูณสอง" aria-label="ผลตอบแทนและขาดทุนคูณสอง">×2</span>' : '';
  return '<header class="company-heading ' + color + '">' +
    '<img class="company-art" src="/assets/wall-street/company-' + color + '.webp" width="48" height="48" alt="" decoding="async">' +
    '<div><' + heading + '>' + escape(company.name) + '</' + heading + '><small>' +
    '<span class="sector">' + colors[color][0] + '</span>' + multiplier + ' · ' + caption + '</small></div></header>';
}

function renderActivity() {
  let html = '';
  if (state.phase === 'lobby') {
    html = '<p>ผู้เล่นพร้อมแล้ว ' + state.players.length + ' / 11 คน</p>';
    if (state.you === 0) html += state.players.length < 3 ?
      '<button disabled>เริ่มเกมเมื่อครบ 3 คน</button>' : button('start','เปิดตลาดเดือนแรก');
  } else if (state.phase === 'pricing') {
    const managers = state.players.filter(player => player.manager);
    const ready = managers.filter(player => player.pricingReady).length;
    html = '<p>ผู้จัดการพร้อม <strong>' + ready + '/' + managers.length + '</strong> คน</p>';
    if (me().manager && !me().pricingReady) {
      html += '<p>บันทึกราคาบนการ์ดของคุณ แล้วกดพร้อมเมื่อเสร็จ</p>' +
        button('pricing-ready','พร้อมเจรจา');
    } else {
      html += '<p>เริ่มเจรจาเมื่อผู้จัดการพร้อมครบหรือหมดเวลา</p>';
    }
  } else if (state.phase === 'market-roll') {
    const rolled = Object.keys(state.rolls).length;
    html = '<h2>ทอยแล้ว ' + rolled + '/4 ลูก</h2><div class="market-dice">';
    for (const [color,[label]] of Object.entries(colors)) {
      const value = state.rolls[color];
      const rolling = state.rollingColor === color;
      const face = value == null ? '⚄' : (value > 0 ? '+' : '') + value;
      html += '<div class="market-die ' + color + (rolling ? ' is-rolling' : '') + (value == null ? '' : ' is-revealed') + '">' +
        '<span class="die-face" aria-hidden="true">' + face + '</span><strong>' + label + '</strong>';
      if (state.you === 0 && !state.rollingColor && value == null) {
        html += button('roll-die','ทอยสี' + label,{color});
      } else {
        html += '<small>' + (rolling ? 'กำลังทอย…' : value == null ? 'รอทอย' : 'ผลทอย ' + face) + '</small>';
      }
      html += '</div>';
    }
    html += '</div>';
  } else if (state.phase === 'settle') {
    const debt = state.debt;
    html = '<h2>ชำระราคาหุ้น</h2><p>' + who(debt.investor) + ' ค้าง ' + who(debt.manager) + ' ' + money(debt.total) + '</p>';
    if (debt.manager === state.you) html += '<div class="actions">' +
      button('defer','ข้ามการเก็บเงินครั้งนี้',{investor:debt.investor}) + button('bankrupt','ให้ออกจากบทบาทนักลงทุน',{investor:debt.investor}) + '</div>';
  } else if (state.phase === 'fees') {
    html = report() + (me().fee ? '<p>ต้องจ่าย ' + money(me().fee) + ' เลือกขายคืนจากแผ่นบริษัทของคุณ</p>' : '<p>รอผู้จัดการที่ค้างค่าบริหาร</p>');
  } else if (state.phase === 'review') {
    html = '<h2>บัญชีหลังปิดตลาด</h2>' + report() +
      (state.you === 0 ? button('next','เริ่มประมูลบริษัท') : '<p>รอเจ้าห้องเปิดประมูล</p>');
  } else if (state.phase === 'auction') {
    const {card,bid,bidder,passes} = state.auction;
    html = companyHeader(card,'h2','ในคิวอีก ' + state.remaining + ' ใบ') +
      '<p>' + (bidder == null ? 'ยังไม่มีผู้เสนอราคา' : who(bidder) + ' นำที่ ' + money(bid)) + '</p>';
    if (bidder === state.you) {
      html += '<p>คุณนำอยู่ รอให้คนอื่นเสนอราคาสูงกว่า</p>';
    } else if (me().manager && !passes.includes(state.you)) {
      if (me().cash > bid) html += '<form class="bid-form" data-action="bid" data-tile="' + card.id +
        '"><label>ราคาประมูล (พันดอลลาร์)<input name="price" type="number" required min="' + (bid+1) + '" max="' + me().cash +
        '" value="' + (bid+1) + '" step="1"></label><button>เสนอราคา</button></form>';
      html += button('pass','ผ่านใบนี้',{tile:card.id});
    }
  } else if (state.phase === 'done') {
    html = report() + (state.dual ? ranking('อันดับเงินสดรวม',state.players) :
      ranking('อันดับผู้จัดการ',state.players.filter(p => p.manager)) +
      ranking('อันดับนักลงทุน',state.players.filter(p => p.investor)));
  }
  $('activity').innerHTML = html;
}

function tileMarkup(tile,offers) {
  const own = tile.owner === state.you;
  const deal = tile.deal;
  const marketValue = colors[tile.color][1][state.positions[tile.color]] * tile.multiple;
  const name = id => who(id) + (id === state.you ? ' (คุณ)' : '');
  let html = companyHeader(tile,'h3','เจ้าของ ' + name(tile.owner)) +
    '<p>ผลตลาดปัจจุบัน <strong>' + money(marketValue) + '</strong></p>';
  if (state.phase === 'pricing' || state.phase === 'trade') {
    html += '<p>ราคาเปิด <strong>' + (tile.askingPrice == null ? 'ยังไม่ตั้งราคา' : money(tile.askingPrice)) + '</strong></p>';
  }
  if (state.phase === 'pricing' && own && me().manager && !me().pricingReady) {
    html += '<form class="offer" data-action="set-price" data-tile="' + tile.id + '">' +
      '<label>ราคาเปิด (พันดอลลาร์)<input name="price" type="number" min="0" max="10000" step="1" required value="' +
      (tile.askingPrice ?? '') + '"></label><button>บันทึกราคาเปิด</button></form>';
  }
  if (deal) {
    const vote = id => deal.closed || deal.lockRequestedBy === id ? 'กดแล้ว' : 'ยังไม่กด';
    html += '<div class="deal-summary"><strong>' + (deal.closed ? 'ปิดดีลแล้ว ' : 'รับข้อเสนอแล้ว ') +
      money(deal.price) + '</strong><p>ผู้ซื้อ ' + name(deal.investor) + '</p>' +
      '<small>ปิดดีล · ผู้ขาย ' + vote(tile.owner) + ' · ผู้ซื้อ ' + vote(deal.investor) + '</small></div>';
  } else {
    html += '<p>ยังไม่มีดีล</p>';
  }
  if (state.phase === 'fees' && own && me().fee) return html + button('liquidate','ขายคืน $5,000',{tile:tile.id});
  if (state.phase !== 'trade' || deal?.closed) return html;
  if (own && offers.length) {
    html += offers.map(offer => '<div class="offer-row"><small>' + who(offer.investor) + ' · ' +
      money(offer.price) + ' · รอรับข้อเสนอ</small><br>' +
      button('accept','รับข้อเสนอ',{tile:tile.id,investor:offer.investor,price:offer.price,closed:offer.closed === true}) + '</div>').join('');
  }
  if (deal && (own || deal.investor === state.you)) {
    html += '<div class="actions">';
    if (deal.lockRequestedBy === state.you) html += '<button type="button" disabled>รออีกฝ่ายปิดดีล</button>';
    else html += button('close-deal','ปิดดีล',{tile:tile.id,revision:deal.revision});
    html += button('withdraw','ถอนดีล',{tile:tile.id}) + '</div>';
  }
  if (!own && me().investor) {
    const sent = offers.find(offer => offer.investor === state.you);
    if (sent) html += '<p><small>เสนอ ' + money(sent.price) + ' · รอผู้ขายรับข้อเสนอ</small></p>' +
      button('cancel-offer','ถอนข้อเสนอ',{tile:tile.id});
    html += '<details><summary>' + (sent ? 'แก้ข้อเสนอ' : 'เสนอราคา') + '</summary><form class="offer" data-action="offer" data-tile="' + tile.id +
      '"><label>ราคา (พันดอลลาร์)</label><input aria-label="ราคาในหน่วยพันดอลลาร์" name="price" type="number" required min="0" max="10000" step="1" placeholder="เช่น 20">' +
      '<button>ส่งข้อเสนอ</button></form></details>';
  }
  return html;
}

function renderTiles() {
  $('portfolio').hidden = !state.tiles || state.phase === 'done';
  if (!state.tiles) return;
  const live = new Set(state.tiles.map(tile => tile.id));
  for (const [id,node] of tileNodes) {
    if (!live.has(id)) {
      node.remove();
      tileNodes.delete(id);
    }
  }
  const ordered = [...state.tiles].sort((a,b) => Number(b.owner === state.you) - Number(a.owner === state.you) || a.owner - b.owner);
  const filter = $('tile-filter').value;
  let visible = 0;
  ordered.forEach((tile,index) => {
    const offers = (state.offers ?? []).filter(offer => offer.tile === tile.id && (tile.owner === state.you || offer.investor === state.you));
    const html = tileMarkup(tile,offers);
    let node = tileNodes.get(tile.id);
    if (!node) {
      node = document.createElement('article');
      node.className = 'tile ' + tile.color;
      tileNodes.set(tile.id,node);
    }
    if (node.dataset.html !== html) {
      const open = node.querySelector('details')?.open;
      const price = node.querySelector('input[name="price"]')?.value;
      const editing = node.contains(document.activeElement) ? document.activeElement.name : '';
      const deal = JSON.stringify(tile.deal);
      const changed = node.dataset.deal !== undefined && node.dataset.deal !== deal;
      node.dataset.deal = deal;
      node.dataset.html = html;
      node.innerHTML = html;
      const details = node.querySelector('details');
      if (details && open) {
        details.open = true;
        details.querySelector('[name="price"]').value = price;
        if (editing === 'price') details.querySelector('[name="price"]').focus();
      }
      if (changed) {
        node.classList.remove('changed');
        requestAnimationFrame(() => node.classList.add('changed'));
      }
    }
    const atIndex = $('tiles').children[index];
    if (atIndex !== node) $('tiles').insertBefore(node,atIndex ?? null);
    node.hidden = (filter === 'owned' && tile.owner !== state.you) ||
      (filter === 'buy' && !(['pricing','trade'].includes(state.phase) && me().investor && tile.owner !== state.you && !tile.deal?.closed)) ||
      (filter === 'invest' && tile.deal?.investor !== state.you) ||
      (filter === 'offers' && !canConfirmLock(tile) && !(tile.owner === state.you && state.phase === 'trade' && !tile.deal?.closed && offers.length));
    if (!node.hidden) visible++;
  });
  $('no-tiles').hidden = visible > 0;
}

function reset(forget = true) {
  if (forget) sessionStorage.removeItem('wall:' + room);
  session = null;
  state = null;
  $('entry').hidden = false;
  $('table').hidden = true;
  document.body.classList.remove('in-room');
  showSidebar(false);
  $('activity').removeAttribute('data-key');
  $('tiles').replaceChildren();
  $('tile-filter').value = 'all';
  tileNodes.clear();
  $('messages').replaceChildren();
}

function roomUrl() { return 'room?code=' + encodeURIComponent(room); }

async function poll() {
  if (!session || polling || busy) return;
  polling = true;
  const requestedSession = session;
  try {
    const next = await api(roomUrl());
    if (session === requestedSession) update(next);
  } catch (error) {
    if (session === requestedSession) {
      if (error.status === 401) reset();
      status(error.status === 401 ? error.message : 'เชื่อมต่อไม่ได้ กำลังลองใหม่');
    }
  } finally { polling = false; }
}

async function closeDeal(route,input) {
  const unsupported = error => error.status === 400 && error.message === 'คำสั่งนี้ใช้ไม่ได้ในช่วงเจรจา';
  try {
    return await api(route,input);
  } catch (error) {
    if (!unsupported(error)) throw error;
  }

  const sendLegacyVote = async () => {
    const latest = await api(route);
    update(latest);
    const deal = latest.tiles?.find(tile => tile.id === input.tile)?.deal;
    if (latest.phase !== input.phase || latest.round !== input.round || !deal ||
        deal.revision !== input.revision) {
      throw new Error('ดีลหรือช่วงเจรจาเปลี่ยนแล้ว กรุณาตรวจสถานะล่าสุด');
    }
    if (deal.closed || deal.lockRequestedBy === latest.you) return latest;
    return api(route,{...input,action:deal.lockRequestedBy == null ? 'request-lock' : 'confirm-lock'});
  };

  try {
    try {
      return await sendLegacyVote();
    } catch (error) {
      // On older servers the other side may vote between the read and the request.
      if (error.status !== 400 || error.message !== 'มีคำขอล็อกดีลแล้ว') throw error;
      return await sendLegacyVote();
    }
  } catch (error) {
    if (!unsupported(error)) throw error;
    throw new Error('เซิร์ฟเวอร์รุ่นนี้ยังไม่รองรับปุ่มปิดดีล กรุณาอัปเดตเซิร์ฟเวอร์หลังจบเกม');
  }
}

async function action(action,data = {}) {
  if (busy || !state) return false;
  busy = true;
  status();
  try {
    const route = roomUrl();
    const input = {action,phase:state.phase,round:state.round,...data};
    update(await (action === 'close-deal' ? closeDeal(route,input) : api(route,input)));
    return true;
  } catch (error) {
    status(error.message);
    if (error.status === 401) reset();
    if (action === 'accept' && error.status === 400) {
      busy = false;
      void poll();
    }
    return false;
  } finally { busy = false; }
}

$('entry-form').elements.code.value = room;
$('entry-form').addEventListener('submit',async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const form = event.currentTarget;
  const create = event.submitter?.value === 'create';
  const code = form.elements.code.value.trim().toUpperCase();
  const previousSession = !create && sessionStorage.getItem('wall:' + code);
  if (previousSession) {
    room = code;
    session = previousSession;
    history.replaceState(null,'','?room=' + room);
    busy = false;
    poll();
    return;
  }
  status();
  try {
    const result = await api('enter',{name:form.elements.name.value,code,create});
    room = result.code;
    session = result.token;
    sessionStorage.setItem('wall:' + room,session);
    history.replaceState(null,'','?room=' + room);
  } catch (error) { status(error.message); }
  finally { busy = false; }
  poll();
});

$('table').addEventListener('click',event => {
  const target = event.target.closest('button[data-action]');
  if (!target) return;
  const {action:kind,tile,investor,price,revision,closed,color} = target.dataset;
  action(kind,{tile,color,investor:investor === undefined ? undefined : Number(investor),
    price:price === undefined ? undefined : Number(price),
    revision:revision === undefined ? undefined : Number(revision),
    closed:closed === undefined ? undefined : closed === 'true'});
});

$('table').addEventListener('submit',async event => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'chat-form') {
    if (await action('chat',{message:form.elements.message.value})) form.reset();
    return;
  }
  const success = await action(form.dataset.action,{tile:form.dataset.tile,price:form.elements.price.valueAsNumber});
  if (success && form.dataset.action === 'offer') {
    const details = tileNodes.get(form.dataset.tile)?.querySelector('details');
    if (details) {
      details.querySelector('form').reset();
      details.open = false;
    }
  }
});

$('invite').addEventListener('click',async () => {
  try {
    const invite = new URL(location.pathname,location.origin);
    invite.searchParams.set('room',room);
    await navigator.clipboard.writeText(invite.href);
    status('คัดลอกลิงก์เชิญแล้ว');
  } catch {
    status('คัดลอก URL จากแถบที่อยู่เพื่อส่งให้เพื่อน');
  }
});
$('exit').addEventListener('click',() => {
  if (busy) return;
  reset(false);
  history.replaceState(null,'',location.pathname);
  $('entry-form').elements.code.value = room;
});
$('rules-open').addEventListener('click',() => $('rules').showModal());
function showSidebar(open) {
  $('table').classList.toggle('show-sidebar',open);
  $('show-board').setAttribute('aria-pressed',String(!open));
  $('show-sidebar').setAttribute('aria-pressed',String(open));
  if (open) $('messages').scrollTop = $('messages').scrollHeight;
}
$('show-board').addEventListener('click',() => showSidebar(false));
$('show-sidebar').addEventListener('click',() => showSidebar(true));
$('tile-filter').addEventListener('change',renderTiles);
$('incoming-offers').addEventListener('click',() => {
  $('tile-filter').value = 'offers';
  renderTiles();
  $('board-scroll').scrollTop = 0;
});
startRoomPolling(poll, () => Boolean(session), () => state && state.phase !== 'lobby');
setInterval(clock,200);
poll();
