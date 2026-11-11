const $ = id => document.getElementById(id);
const entry = $('entry');
const styles = ['กุหลาบป่า', 'ทิสเซิล', 'ลีลาวดี', 'กล้วยไม้', 'ดาวเรือง', 'บัวชมพู'];
const faceNames = {flower:'ดอกไม้', skull:'หัวกะโหลก', back:'แผ่นคว่ำ'};
const url = new URL(location.href);
let code = (url.searchParams.get('room') ?? '').trim().toUpperCase();
let token = code ? sessionStorage.getItem('skull:' + code) : null;
let state, pending = false, polling = false;

entry.elements.code.value = code;
const notice = text => { $('notice').textContent = text; };
const art = style => `url('/assets/skull/set-${style}.png')`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, callback, className) {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', callback);
  return node;
}

async function request(path, input, authorization) {
  const headers = {};
  if (input) headers['Content-Type'] = 'application/json';
  if (authorization) headers.Authorization = 'Bearer ' + authorization;
  const response = await fetch('/api/skull/' + path, {
    method: input ? 'POST' : 'GET',
    headers,
    body: input ? JSON.stringify(input) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    const error = Error(result.error);
    error.status = response.status;
    throw error;
  }
  return result;
}

const roomPath = () => 'room?code=' + encodeURIComponent(code);

function receive(next) {
  if (state && next.revision <= state.revision) return;
  state = next;
  render();
}

async function refresh() {
  if (!token || pending || polling) return;
  polling = true;
  try {
    receive(await request(roomPath(), null, token));
    if ($('notice').dataset.network) notice('');
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('skull:' + code);
      token = state = null;
      render();
      notice(error.message);
    } else {
      $('notice').dataset.network = 'true';
      notice('ขาดการเชื่อมต่อ กำลังลองใหม่');
    }
  } finally {
    polling = false;
  }
}

async function send(action, fields) {
  if (!state || pending) return;
  pending = true;
  delete $('notice').dataset.network;
  notice('');
  try {
    const {revision, round, phase} = state;
    receive(await request(roomPath(), {action, revision, round, phase, ...fields}, token));
  } catch (error) {
    notice(error.message);
  } finally {
    pending = false;
  }
}

entry.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  pending = true;
  notice('');
  try {
    const create = event.submitter?.value === 'create';
    const result = await request('enter', {create, name:entry.elements.name.value, code:entry.elements.code.value});
    code = result.code;
    token = result.token;
    sessionStorage.setItem('skull:' + code, token);
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
  } catch (error) {
    notice(error.message);
  } finally {
    pending = false;
  }
  refresh();
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(url.href);
    notice('คัดลอกลิงก์เชิญแล้ว');
  } catch {
    const invite = $('invite');
    invite.hidden = false;
    invite.value = url.href;
    invite.select();
  }
});
$('start').addEventListener('click', () => send('start'));
$('show-rules').addEventListener('click', () => $('rules').showModal());

function renderLobby() {
  const {players, me, host} = state;
  const unready = players.some(player => !player.style);
  $('lobby-code').textContent = state.code;
  $('seat-count').textContent = `${players.length}/6`;
  const status = players.length < 3 ? 'รอผู้เล่นอย่างน้อย 3 คน' :
    unready ? 'รอทุกคนเลือกชุดแผ่น' : me === host ? 'พร้อมเริ่มเกม' : 'รอเจ้าของห้องเริ่มเกม';
  if ($('lobby-status').textContent !== status) $('lobby-status').textContent = status;
  $('members').replaceChildren(...Array.from({length:6}, (_, index) => {
    const player = players[index];
    const member = element('li', null, player ? 'member' : 'member empty');
    const emblem = element('span', null, 'member-emblem');
    emblem.setAttribute('aria-hidden', 'true');
    if (player?.style) emblem.style.setProperty('--art', art(player.style));
    const name = player ? player.name + (player.id === me ? ' (คุณ)' : '') : 'ที่นั่งว่าง';
    const detail = player ? [
      player.id === host ? 'เจ้าของห้อง' : '',
      player.style ? styles[player.style - 1] : 'ยังไม่เลือกชุด',
    ].filter(Boolean).join(' · ') : '';
    const text = element('div', null, 'member-text');
    text.append(element('strong', name));
    if (detail) text.append(element('small', detail));
    member.append(emblem, text);
    return member;
  }));
  const focusedStyle = document.activeElement?.dataset.style;
  $('styles').replaceChildren(...styles.map((name, index) => {
    const style = index + 1;
    const owner = players.find(player => player.style === style);
    const choice = button(null, () => send('style', {style}), 'quiet style-choice');
    choice.dataset.style = style;
    choice.style.setProperty('--art', art(style));
    choice.disabled = Boolean(owner && owner.id !== me);
    choice.setAttribute('aria-pressed', String(owner?.id === me));
    choice.append(element('span', null, 'style-art'), element('strong', name),
      element('span', owner ? (owner.id === me ? 'คุณเลือกชุดนี้' : owner.name) : 'ว่าง', 'style-owner'));
    return choice;
  }));
  if (focusedStyle) $('styles').querySelector(`[data-style="${focusedStyle}"]:not(:disabled)`)?.focus();
  $('start').hidden = me !== host;
  $('start').disabled = players.length < 3 || unready;
}

function seat(player) {
  const mine = player.id === state.me;
  const active = player.id === state.turn && ['place','bid','reveal','discard'].includes(state.phase);
  const node = element('article', null, 'seat' + (active ? ' active' : '') + (player.eliminated ? ' eliminated' : ''));
  node.style.setProperty('--art', art(player.style));
  const pile = element('div', null, 'discs');
  player.pile.forEach(({face, revealed}, index) => {
    const pick = state.targets.includes(player.id) && index === player.pile.findLastIndex(disc => !disc.revealed);
    const classes = 'disc ' + face + (revealed ? ' revealed' : '') + (pick ? ' pick' : '');
    const disc = pick ? button(null, () => send('reveal', {target:player.id}), classes) : element('span', null, classes);
    if (!pick) disc.setAttribute('role', 'img');
    disc.setAttribute('aria-label', pick ? 'เปิดแผ่นของ ' + player.name : faceNames[face]);
    disc.style.zIndex = index;
    pile.append(disc);
  });
  const name = element('h2', mine ? player.name + ' (คุณ)' : player.name);
  if (active) name.append(element('span', 'กำลังเล่น', 'turn-label'));
  const counts = element('div', null, 'seat-counts');
  for (const [number, label] of [[player.pile.length, 'วางแล้ว'], [player.handCount, 'เหลือในมือ']]) {
    const count = element('span');
    count.append(element('strong', number), label);
    counts.append(count);
  }
  node.append(pile, name, counts, element('p', player.eliminated ? 'ตกรอบ' : `ชนะ ${player.score}/2`));
  return node;
}

function gameStatus() {
  const {phase, me, turn, players, bid, bidder, opened, message, canPlace} = state;
  const current = turn === me ? 'ตาคุณ' : 'ตาของ ' + players[turn]?.name;
  switch (phase) {
    case 'setup': return canPlace ? 'เลือกแผ่นแรกของคุณ' : 'รอผู้เล่นคนอื่นวางแผ่นแรก';
    case 'place': return turn === me ? 'ตาคุณ วางเพิ่มหรือเปิดประมูล' : current;
    case 'bid': return `${players[bidder].name} เสนอ ${bid} แผ่น · ${current}`;
    case 'reveal': return `${players[bidder].name} เปิดแล้ว ${opened}/${bid} แผ่น` +
      (turn === me ? (state.targets.includes(me) ? ' · เปิดกองของคุณก่อน' : ' · เลือกกองที่จะเปิด') : '');
    case 'discard': return message + (turn === me ? ' · เลือกแผ่นที่จะทิ้ง' : '');
    default: return message;
  }
}

function faceButtons(cards, verb, action) {
  for (const face of new Set(cards)) {
    const count = cards.filter(card => card === face).length;
    $('actions').append(button(`${verb}${faceNames[face]} (${count})`, () => send(action, {face})));
  }
}

function renderGame() {
  const {players, me, host, turn, phase, hand, round, bid, total, starter} = state;
  $('opponents').replaceChildren(...players.filter(player => player.id !== me).map(seat));
  $('you').replaceChildren(seat(players[me]));
  $('round').textContent = `รอบที่ ${round} · ${total} แผ่นบนโต๊ะ`;
  $('status').textContent = gameStatus();
  const actions = $('actions');
  actions.replaceChildren();
  if (state.canPlace) faceButtons(hand, 'วาง', 'place');
  if (turn === me && ['place','bid'].includes(phase)) {
    const select = element('select');
    select.setAttribute('aria-label', 'จำนวนแผ่นที่ประมูล');
    for (let count = bid + 1; count <= total; count++) select.add(new Option(count + ' แผ่น', count));
    actions.append(select, button(phase === 'place' ? 'เปิดประมูล' : 'เสนอเพิ่ม',
      () => send('bid', {value:Number(select.value)})));
    if (phase === 'bid') actions.append(button('ผ่าน', () => send('pass'), 'quiet'));
  }
  if (turn === me && phase === 'discard') faceButtons([...hand, ...players[me].pile.map(card => card.face)], 'ทิ้ง', 'discard');
  if (phase === 'result' && (me === host || me === starter)) actions.append(button('ไปรอบถัดไป', () => send('next')));
  if (phase === 'over' && me === host) actions.append(button('กลับล็อบบี้', () => send('lobby')));
}

function render() {
  $('entry-view').hidden = Boolean(state);
  $('room-heading').hidden = !state || state.phase === 'lobby';
  $('lobby').hidden = state?.phase !== 'lobby';
  $('game').hidden = !state || state.phase === 'lobby';
  $('room-label').textContent = state ? 'ห้อง ' + code : 'เล่นออนไลน์กับเพื่อน 3–6 คน';
  if (!state) return;
  if (state.phase === 'lobby') renderLobby();
  else renderGame();
}

refresh();
setInterval(refresh, 800);
