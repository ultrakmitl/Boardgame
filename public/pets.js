import {cards} from './pets-cards.js';

const byId = id => document.getElementById(id);
const entry = byId('entry');
const table = byId('table');
const errorBox = byId('error');
const roomLink = new URL(location.href);
const requestedCode = (roomLink.searchParams.get('room') ?? '').toUpperCase();
const storageKey = 'pets-room:' + requestedCode;
let session;
let state;
let busy = false;
let polling = false;
let epoch = 0;
try { session = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
entry.elements.code.value = requestedCode;

const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[c]);

function card(rank, action = '', reference = false) {
  const [name, count, detail] = cards[rank];
  return `<article class="card">
    <div class="card-art" style="--x:${rank % 4 * 100 / 3}%;--y:${Math.floor(rank / 4) * 50}%">
      <strong class="rank">${rank}</strong>${reference ? `<span class="count">${count} ใบ</span>` : ''}
    </div>
    <div class="card-text"><h3>${name}</h3><p>${detail}</p>${action}</div>
  </article>`;
}

byId('catalog-cards').innerHTML = cards.map((_, rank) => card(rank, '', true)).reverse().join('');
document.querySelectorAll('[data-dialog]').forEach(button => {
  button.addEventListener('click', () => byId(button.dataset.dialog).showModal());
});

function setError(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function request(path, input, token) {
  const response = await fetch(path, {
    method:input ? 'POST' : 'GET',
    headers:{
      ...(input && {'Content-Type':'application/json'}),
      ...(token && {Authorization:'Bearer ' + token}),
    },
    body:input ? JSON.stringify(input) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error);
    error.status = response.status;
    throw error;
  }
  return result;
}

const roomPath = () => '/api/pets/room?code=' + encodeURIComponent(session.code);
const actionButton = (action, label, extra = '') =>
  `<button type="button" class="primary" data-action="${action}" ${extra}>${label}</button>`;
const rankPill = rank => `<span class="pill" title="${cards[rank][0]}">${rank}</span>`;

function effectControls(s) {
  if (s.effect === null) return '';
  if (s.effect === 6) {
    return `<div class="effect"><h3>ไพ่ที่กันไว้</h3><div class="hand">${card(s.peek)}</div>
      <div class="buttons">${actionButton('effect','สลับไพ่','data-swap="yes"')}
      ${actionButton('effect','เก็บไพ่เดิม','data-swap="no"')}</div></div>`;
  }
  if (s.effect === 2) {
    const positions = Array.from({length:s.pile}, (_, i) =>
      `<option value="${i}">${i === 0 ? 'บนสุด' : i === s.pile - 1 ? 'ล่างสุด' : 'ลำดับที่ ' + (i + 1) + ' จากบน'}</option>`);
    return `<div class="effect"><h3>ไพ่บนสุดคือ ${s.peek} · ${cards[s.peek][0]}</h3>
      <label>วางกลับที่<select id="position">${positions.join('')}</select></label>
      ${actionButton('effect','ใส่ไพ่กลับกอง')}</div>`;
  }
  const targets = s.targets.map(i => `<option value="${i}">${escape(s.players[i].name)}</option>`).join('');
  const guesses = cards.map(([name], rank) => rank === 1 ? '' : `<option value="${rank}">${rank} · ${name}</option>`).join('');
  const verb = {1:'ทายไพ่',3:'ดวล',5:'บังคับทิ้งไพ่',8:'สลับไพ่'}[s.effect];
  return `<div class="effect"><label>เลือกคู่แข่ง<select id="target">${targets}</select></label>
    ${s.effect === 1 ? `<label>ทายเลขไพ่<select id="guess">${guesses}</select></label>` : ''}
    ${actionButton('effect',verb)}</div>`;
}

function render(s) {
  if (state && state.version >= s.version) return;
  const historyOpen = table.querySelector('.history')?.open;
  state = s;
  byId('welcome').hidden = true;
  table.hidden = false;
  const lobby = s.phase === 'lobby';
  const finished = ['result','over'].includes(s.phase);
  const myTurn = !finished && s.turn === s.self;
  const status = lobby ? 'รอเพื่อนเข้าห้อง'
    : finished ? s.winner === null ? 'รอบนี้เสมอ'
      : escape(s.players[s.winner].name) + (s.phase === 'over' ? ' ชนะเกม!' : ' ชนะรอบนี้')
    : myTurn ? {draw:'ตาคุณ · จั่วไพ่',play:'ตาคุณ · เลือกไพ่ที่จะลง',effect:'ตาคุณ · ใช้พลังไพ่'}[s.phase]
    : 'ตาของ ' + escape(s.players[s.turn].name);
  const seats = s.players.map((p, i) => `<li class="seat ${!lobby && !finished && i === s.turn ? 'current' : ''}">
    <strong>${escape(p.name)}${i === s.self ? ' (คุณ)' : ''}</strong>
    <span>★ ${p.score}/${s.goal}</span>
    ${p.shield ? '<span class="tag">มีโล่</span>' : ''}
    ${p.alive === false ? '<span class="tag">ตกรอบ</span>' : ''}
    ${p.reveal !== undefined ? `<p>ไพ่จบรอบ ${rankPill(p.reveal)}</p>` : ''}
    ${p.played?.length ? `<div class="played" aria-label="ไพ่ที่เปิดแล้ว">${p.played.map(rankPill).join('')}</div>` : ''}
  </li>`).join('');
  table.innerHTML = `
    <div class="room-bar">
      <strong>ห้อง <span class="code">${s.code}</span></strong>
      <div><button type="button" data-action="copy">คัดลอกลิงก์เชิญ</button> <a href="/games/power-hungry-pets">ออกจากโต๊ะ</a></div>
    </div>
    <label id="invite" hidden>ลิงก์เชิญ<input id="invite-url" readonly value="${escape(roomLink.href)}"></label>
    <div class="felt">
      <p class="meta">${lobby ? s.players.length + '/6 คน' : 'รอบ ' + s.round + ' · กองจั่ว ' + s.pile + ' ใบ'}</p>
      <h1 aria-live="polite">${status}</h1>
      ${s.open?.length ? `<p>ไพ่ที่กันไว้แบบเปิด ${s.open.map(rankPill).join(' ')}</p>` : ''}
      <ul class="seats">${seats}</ul>
      ${lobby && s.self === 0 ? `<p>${actionButton('start','เริ่มเกม',s.players.length < 2 ? 'disabled' : '')}</p>` : ''}
      ${myTurn && s.phase === 'draw' ? `<p>${actionButton('draw','จั่วไพ่')}</p>` : ''}
      ${s.phase === 'result' ? `<p>${actionButton('next','เล่นรอบถัดไป')}</p>` : ''}
      ${s.phase === 'over' ? '<p><a href="/games/power-hungry-pets">กลับไปสร้างห้องใหม่</a></p>' : ''}
    </div>
    ${s.secret ? `<p class="private">เฉพาะคุณ · ${escape(s.secret)}</p>` : ''}
    ${s.hand?.length && !finished ? `<section class="hand-area"><h2>ไพ่ในมือคุณ</h2><div class="hand">
      ${s.hand.map((rank,i) => card(rank, myTurn && s.phase === 'play' ? actionButton('play','ลงใบนี้',`data-index="${i}"`) : '')).join('')}
    </div></section>` : ''}
    ${effectControls(s)}
    ${s.log?.length ? `<details class="history" ${historyOpen ? 'open' : ''}><summary>เหตุการณ์ในรอบนี้</summary><ol>${s.log.map(line => `<li>${escape(line)}</li>`).join('')}</ol></details>` : ''}
  `;
}

entry.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const values = new FormData(entry);
  const create = event.submitter?.name !== 'join';
  const code = values.get('code').trim().toUpperCase();
  if (!create && !/^[A-F0-9]{6}$/.test(code)) return setError('กรอกรหัสห้อง 6 ตัวจากเพื่อน');
  busy = true;
  epoch++;
  setError();
  try {
    session = await request('/api/pets/enter', {name:values.get('name'), code, create});
    sessionStorage.setItem('pets-room:' + session.code, JSON.stringify(session));
    roomLink.searchParams.set('room',session.code);
    history.replaceState(null,'',roomLink);
    render(await request(roomPath(), null, session.token));
  } catch (error) { setError(error.message); }
  finally { busy = false; }
});

table.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  const {action, index, swap} = button.dataset;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(roomLink.href);
      button.textContent = 'คัดลอกแล้ว';
    } catch {
      byId('invite').hidden = false;
      byId('invite-url').focus();
      byId('invite-url').select();
    }
    return;
  }
  const input = {action, version:state.version};
  if (index !== undefined) input.index = Number(index);
  if (swap !== undefined) input.swap = swap === 'yes';
  for (const field of ['position','target','guess']) {
    const control = byId(field);
    if (control) input[field] = Number(control.value);
  }
  busy = true;
  epoch++;
  button.disabled = true;
  setError();
  try { render(await request(roomPath(), input, session.token)); }
  catch (error) { setError(error.message); }
  finally { busy = false; button.disabled = false; }
});

async function refresh() {
  if (!session || busy || polling) return;
  polling = true;
  const currentEpoch = epoch;
  try {
    const result = await request(roomPath(), null, session.token);
    if (currentEpoch === epoch && !busy) render(result);
  } catch (error) {
    if (currentEpoch !== epoch) return;
    setError(error.message);
    if (error.status === 401) {
      sessionStorage.removeItem('pets-room:' + session.code);
      session = null;
      state = null;
      table.hidden = true;
      byId('welcome').hidden = false;
    }
  } finally { polling = false; }
}

refresh();
setInterval(refresh, 1200);
