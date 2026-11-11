const $ = id => document.getElementById(id);
const roomNode = $('room');
const notice = $('notice');
let code = (new URL(location.href).searchParams.get('room') || '').toUpperCase();
let token = localStorage.getItem('andes:'+code);
let state, busy = false, polling = false, revision = 0;
$('code').value = code;
const esc = value => String(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const invite = () => new URL('?room='+encodeURIComponent(code),location.href).href;
const artworkValues = {
  treasure: [1,2,3,4,5,7,9,11,13,14,15,17],
  hazard: ['งู','ไฟ','หินถล่ม','มัมมี่','แมงมุม'],
  artifact: [5,7,8,10,12]
};
function image(card) {
  const index = artworkValues[card.kind].indexOf(card.value);
  if (index < 0) return '';
  const treasure = card.kind==='treasure';
  const x = treasure ? [72,409,747,1084][index%4] : [17,428,830,1240,1644][index];
  const y = treasure ? [8,366,710][Math.floor(index/4)] : 8;
  const width = treasure ? 296 : 387;
  const height = treasure ? [348,334,366][Math.floor(index/4)] : 665;
  const sheetWidth = treasure ? 1448 : 2048;
  const sheetHeight = treasure ? 1086 : 683;
  const position = (offset, size, total) => 100*offset/(total-size);
  return '<span class="card-art" aria-hidden="true" style="background-size:'+
    100*sheetWidth/width+'% '+100*sheetHeight/height+'%;background-position:'+
    position(x,width,sheetWidth)+'% '+position(y,height,sheetHeight)+'%"></span>';
}
async function api(url, input) {
  const response = await fetch(url,{
    headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
    ...(input ? {method:'POST',body:JSON.stringify(input)} : {})
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error),{status:response.status});
  return data;
}
function playerToken(player) {
  const result = player.outcome;
  let reward = '';
  if (result?.kind === 'exit') {
    reward = '<strong class="reward"><i class="gem" aria-hidden="true"></i> +'+
      (result.carried+result.share)+' เพชร</strong><small>ถือมา '+result.carried+
      ' + จากกองกลาง '+result.share+'</small>'+
      (result.artifactPoints ? '<small>โบราณวัตถุ +'+result.artifactPoints+' แต้ม</small>' : '');
  } else if (result?.kind === 'hazard') {
    reward = '<strong class="reward loss">หนีภัย · เสีย '+result.lost+' เพชร</strong>';
  }
  const artifacts = player.artifacts ? '<small>โบราณวัตถุ '+player.artifacts+' ชิ้น</small>' : '';
  return '<li class="player-token"><div class="token-name">'+esc(player.name)+
    (player.online?'':' <small>ออฟไลน์</small>')+'</div>'+reward+artifacts+'</li>';
}
function expedition(players) {
  const zones = [
    {key:'temple',title:'ในวิหาร',people:players.filter(p=>p.active)},
    {key:'camp',title:'ที่แคมป์',people:players.filter(p=>!p.active)}
  ];
  return '<div class="expedition">'+zones.map(({key,title,people})=>
    '<section class="zone zone-'+key+'"><h2><i class="zone-mark" aria-hidden="true"></i>'+
    title+' <span>'+people.length+' คน</span></h2>'+
    (people.length?'<ul>'+people.map(playerToken).join('')+'</ul>':'<p class="zone-empty">ยังไม่มีผู้เล่น</p>')+
    '</section>').join('')+'</div>';
}
function scoreTable(standings) {
  return '<div class="score-scroll" tabindex="0" role="region" aria-label="ตารางคะแนนรายรอบ">'+
    '<table class="score-table"><caption>คะแนนแยกตามรอบ</caption><thead><tr><th scope="col">ผู้เล่น</th>'+
    Array.from({length:5},(_,i)=>'<th scope="col">รอบ '+(i+1)+'</th>').join('')+
    '<th scope="col">รวม</th></tr></thead><tbody>'+
    standings.map(p=>'<tr><th scope="row">'+esc(p.name)+'</th>'+
      p.rounds.map(r=>'<td><span>เพชร <b>'+r.gems+'</b></span><span>โบราณวัตถุ <b>'+r.artifacts+'</b></span></td>').join('')+
      '<td><strong>'+p.score+' แต้ม</strong><span>เพชร '+p.gems+'</span><span>โบราณวัตถุ '+p.artifactPoints+'</span></td></tr>').join('')+
    '</tbody></table></div>';
}
function tableInfo(s, active) {
  const removed = Object.entries(s.deckInfo.removedHazards);
  const estimate = s.you.active ?
    '<div class="return-estimate"><strong>ถ้ากลับแคมป์ตอนนี้</strong><span>กลับคนเดียว <b>'+
    (s.you.carry+s.leftovers)+'</b> เพชร'+
    (s.path.some(c=>c.kind==='artifact'&&!c.claimed) ? ' และโบราณวัตถุ <b>'+
      s.path.reduce((sum,c)=>sum+(c.kind==='artifact'&&!c.claimed?c.value:0),0)+' แต้ม</b>' : '')+
    '</span>'+(active>1?'<span>ถ้ากลับพร้อมกันทุกคนในวิหาร ได้คนละส่วนจากกองกลาง · คุณได้ <b>'+
    (s.you.carry+Math.floor(s.leftovers/active))+'</b> เพชร</span>':'')+'</div>' : '';
  return '<div class="table-metrics"><div><span>กองกลาง</span><strong>'+s.leftovers+
    '</strong><small>เพชร</small></div><div><span>คุณถืออยู่</span><strong>'+s.you.carry+
    '</strong><small>เพชร</small></div><div><span>คุณฝากแล้ว</span><strong>'+s.you.bank+
    '</strong><small>เพชร</small></div></div>'+estimate+
    '<div class="deck-strip"><span>การ์ดสมบัติในกองจั่ว <b>'+s.deckInfo.treasures+' ใบ</b></span>'+
    '<span>ภัยที่นำออก '+(removed.length ? removed.map(([name,count])=>
      '<b class="hazard-count">'+esc(name)+' '+count+' ใบ</b>').join(' ') : '<b>ยังไม่มี</b>')+'</span></div>';
}
function turnControls(s) {
  const intermission = s.phase==='intermission';
  const results = [
    {choice:'explore',label:'สำรวจต่อ'},
    {choice:'exit',label:'กลับแคมป์'}
  ].map(({choice,label})=>{
    const names = s.revealed.filter(p=>p.choice===choice).map(p=>esc(p.name));
    return '<div class="turn-result '+choice+'"><strong>'+label+'</strong><span>'+
      (names.join(', ') || 'ไม่มี')+'</span></div>';
  }).join('');
  const status = intermission || s.phase==='finished' ? esc(s.reason) :
    !s.you.active ? 'คุณอยู่ที่แคมป์' :
    s.you.choice ? 'เลือกแล้ว · รอผู้เล่นคนอื่น' : 'ตัดสินใจตานี้';
  return '<section class="turn-bar" aria-label="ตัดสินใจและผลการเลือก">'+
    '<div class="turn-row"><div class="turn-status"><strong>'+status+'</strong>'+
    (s.phase==='playing'?'<small id="timer"></small>':'')+'</div>'+
    (s.phase==='playing' && s.you.active && !s.you.choice ?
      '<div class="turn-buttons"><button class="primary" data-action="explore">สำรวจต่อ</button>'+
      '<button data-action="exit">กลับแคมป์</button></div>' :
      intermission && s.host ? '<button class="primary" data-action="next">เริ่มรอบถัดไป</button>' : '')+
    '</div>'+(s.revealed.length?'<div class="turn-results" aria-label="ผลการเลือกครั้งล่าสุด">'+
      results+'</div>':'')+'</section>';
}
function render() {
  const s = state;
  const focus = document.activeElement?.dataset.action;
  $('home').hidden = true;
  roomNode.hidden = false;
  const active = s.players.filter(p=>p.active).length;
  const lobby = s.phase==='lobby';
  const finished = s.phase==='finished';
  const best = s.standings?.[0];
  const winners = best && s.standings.filter(p=>p.score===best.score && p.artifacts===best.artifacts);
  roomNode.innerHTML = '<div class="room-head"><div><span class="eyebrow">ห้อง '+s.code+'</span><h1>'+
    (lobby?'แคมป์สำรวจ':finished?'ผลการสำรวจ':'วิหารชั้น '+s.round+' / 5')+
    '</h1></div><button data-action="copy">คัดลอกลิงก์เชิญ</button></div>'+
    (lobby?'':turnControls(s))+
    (lobby||finished?'':expedition(s.players))+
    '<div class="room-grid'+(lobby?'':' in-game')+'"><article class="panel">'+
    (lobby ? '<h2>รอคณะสำรวจ</h2><p>ส่งลิงก์หรือรหัส <strong>'+s.code+'</strong> ให้เพื่อน</p><p>เมื่อเริ่มเกม ทุกตาให้เวลา 45 วินาที หากยังไม่ได้เลือก ระบบจะพากลับแคมป์ เจ้าของห้องที่หลุดเกิน 45 วินาทีจะส่งสิทธิ์ให้ผู้เล่นที่ออนไลน์</p>' :
      finished ? '<h2 class="winner">'+ (winners.length>1?'ชนะร่วมกัน · ':'ผู้ชนะ · ')+winners.map(p=>esc(p.name)).join(', ')+'</h2>'+scoreTable(s.standings) :
      tableInfo(s,active)+
      '<p class="muted">โบราณวัตถุที่เพิ่มในรอบนี้ · '+s.introduced.value+' คะแนน</p>'+
      '<div class="trail" aria-label="ไพ่บนเส้นทาง">'+s.path.map(c=>'<div class="card '+c.kind+'">'+image(c)+
        '<strong>'+(c.kind==='hazard'?'':c.value+(c.kind==='artifact'?' แต้ม':''))+'</strong><small>'+
        (c.kind==='hazard'?c.value+(c.removed?' · ซ้ำ':''):c.kind==='treasure'?'สมบัติ':c.claimed?'เก็บแล้ว':'โบราณวัตถุ')+'</small></div>').join('')+'</div>')+
    '<div class="actions">'+
    (s.host && (lobby||finished)?'<button class="primary" data-action="start" '+(s.players.length<3?'disabled':'')+'>'+(finished?'เล่นอีกครั้ง':'เริ่มเกม')+'</button>':'')+
    '</div></article>'+(lobby?'<aside class="panel"><h2>คณะสำรวจ '+s.players.length+'/8</h2><ul class="players">'+
    s.players.map(p=>'<li><span>'+esc(p.name)+'</span><small>'+(p.online?'ออนไลน์':'ออฟไลน์')+'</small></li>').join('')+
    '</ul></aside>':'')+'</div>';
  if(focus) roomNode.querySelector('[data-action="'+focus+'"]')?.focus({preventScroll:true});
  tick();
}
function update(data) {
  if (JSON.stringify(data)!==JSON.stringify(state)) {
    state=data;
    render();
  }
}
function tick() {
  if ($('timer')) $('timer').textContent = 'เหลือ '+Math.max(0,Math.ceil((state.deadline-Date.now())/1000))+' วินาที';
}
const endpoint = () => '/api/room?code='+encodeURIComponent(code);
async function poll() {
  if (!token || busy || polling) return;
  polling=true;
  const requestedAt = revision;
  try {
    const data = await api(endpoint());
    if (requestedAt===revision) update(data);
  }
  catch(e) {
    notice.textContent=e.message;
    if(e.status===401) {localStorage.removeItem('andes:'+code); token=null; state=null; $('home').hidden=false; roomNode.hidden=true;}
  } finally {polling=false;}
}
$('entry').addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy) return;
  busy=true;
  try {
    const create=event.submitter?.value==='create';
    const result=await api('/api/enter',{create,name:$('name').value,code:$('code').value.trim().toUpperCase()});
    ({code,token}=result);
    localStorage.setItem('andes:'+code,token);
    history.replaceState(null,'',invite());
  } catch(e) {notice.textContent=e.message;}
  finally {busy=false; if(token) void poll();}
});
roomNode.addEventListener('click',async event=>{
  const action=event.target.closest('button')?.dataset.action;
  if(!action) return;
  if(action==='copy') {
    try {
      await navigator.clipboard.writeText(invite());
      event.target.textContent='คัดลอกแล้ว';
    } catch {window.prompt('ลิงก์เชิญ',invite());}
    return;
  }
  if(busy) return;
  busy=true;
  revision++;
  try {
    update(await api(endpoint(),{action:['exit','explore'].includes(action)?'choose':action,choice:action,turn:state.turn}));
    notice.textContent='';
  } catch(e) {notice.textContent=e.message;}
  finally {busy=false;}
});
document.querySelectorAll('[data-dialog]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.dialog).showModal()));
setInterval(poll,700);
setInterval(tick,250);
void poll();
