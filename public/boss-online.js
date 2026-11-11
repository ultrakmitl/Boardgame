import {art,board,cardArt,cardName,colors,dealArt,track} from '/boss-rules.js';

const get=id=>document.getElementById(id);
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const money=value=>value+' ล้าน';
const faces=['','⚀','⚁','⚂','⚃','⚄','⚅'];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const invite=new URLSearchParams(location.search).get('room')?.toUpperCase();
let session, state, busy=false, polling=false, chosenCard=null, choices=new Set(), drafts=new Map();
let animatedRoll, animation=0;
get('code').value=invite ?? '';
if (invite) {
  get('entry-form').classList.add('from-invite');
  get('join-room').classList.add('primary');
  get('create-room').classList.remove('primary');
}
function status(message='') { get('status').textContent=message; }
function button(action,label,attributes='',primary=false) {
  return '<button type="button" data-action="'+action+'" '+attributes+(primary?' class="primary"':'')+'>'+label+'</button>';
}
function chip(team) {
  const [,shade,color,,symbol]=colors[team];
  return '<span class="chip" style="--team:'+color+'" title="ทีมสี'+shade+'" aria-label="ทีมสี'+shade+'" role="img">'+symbol+'</span>';
}
function name(seat) { return escape(state.players[seat]?.name); }
function canRespond() { return state.window && !state.window.passes.includes(state.seat); }
function canPlay(card) {
  if (state.window && state.window.kind!=='close') return canRespond() && card.kind==='stop';
  if (state.window && !canRespond()) return false;
  if (state.phase==='discard' && state.actor===state.seat) return true;
  if (state.phase!=='deal' || card.kind==='stop') return false;
  if (card.kind==='boss') return state.boss!==state.seat;
  if (card.kind==='recruitment') return state.hand.filter(entry=>entry.kind==='recruitment').length>=3;
  if (card.kind==='travel') return state.reps.some(rep=>canTravel(card,rep));
  return true;
}
function canTravel(card,rep) {
  return !rep.blocked && rep.owner!==state.seat && (card.team===null || card.team===rep.team);
}
function setPawn(position) {
  const pawn=get('pawn');
  pawn.hidden=position===null;
  if (position===null) return;
  const [row,col]=track[position];
  pawn.style.setProperty('--x',(col*20-1)+'%');
  pawn.style.setProperty('--y',(row*20-10)+'%');
}
function showRoll(previous) {
  const roll=state.roll;
  if (!roll || roll.id===animatedRoll) {
    if (!get('die').classList.contains('rolling') && !animation) setPawn(state.position);
    return;
  }
  animatedRoll=roll.id;
  if (!previous || reduced.matches || !roll.path.length || previous.turn!==state.turn) {
    get('die').textContent=faces[roll.face];
    get('die').setAttribute('aria-label','ลูกเต๋า '+roll.face+' แต้ม');
    setPawn(state.position);
    return;
  }
  const id=roll.id;
  animation=id;
  get('die').classList.add('rolling');
  get('die').textContent=faces[(roll.face%6)+1];
  setTimeout(()=>{
    if (animation!==id) return;
    get('die').classList.remove('rolling');
    get('die').textContent=faces[roll.face];
    get('die').setAttribute('aria-label','ลูกเต๋า '+roll.face+' แต้ม');
    roll.path.forEach((position,i)=>setTimeout(()=>{
      if (animation!==id) return;
      setPawn(position);
      if (i===roll.path.length-1) { animation=0; setPawn(state.position); }
    },i*205));
  },300);
}
function renderBoard(previous) {
  const placing=state.phase==='place' && state.seat===(state.actor+state.players.length-1)%state.players.length;
  get('spaces').innerHTML=board.map((tile,i)=>{
    const [row,col]=track[i];
    const closed=state.closed[i];
    const tag=placing?'button':'div';
    const content=closed?'<img src="'+dealArt(closed,'back')+'" alt="ช่อง '+(i+1)+' ปิดแล้ว">':
      '<div class="tile-head"><span>'+tile.groups.reduce((sum,group)=>sum+group.count,0)+'</span><span>$ × '+tile.shares+'</span></div>'+
      '<div class="groups">'+tile.groups.map(group=>'<span class="group">'+group.teams.map(chip).join('')+' <b>'+group.count+'</b></span>').join('')+'</div>';
    return '<'+tag+' class="tile'+(closed?' closed':'')+(state.position===i?' current':'')+'" style="--row:'+row+';--col:'+col+'"'+
      (placing?' type="button" data-action="place" data-position="'+i+'" aria-label="วางตัวเดินที่ช่อง '+(i+1)+'"':'')+'>'+content+'</'+tag+'>';
  }).join('');
  get('position').textContent=state.position===null?'รอวางตัวเดิน':'ช่อง '+(state.position+1);
  const current=state.phase==='finished'?state.completed:state.completed+1;
  get('deal-art').src=dealArt(current,state.phase==='finished'?'back':'front');
  get('dividend').textContent=state.phase==='finished'?'ปิด '+state.completed+' ดีล':'#'+current+' · $ = '+money(state.rate);
  get('deck-count').textContent='กองจั่ว '+state.deckCount+' ใบ';
  showRoll(previous);
}
function renderSeats() {
  const seatMarkup=state.players.map((player,i)=>{
    const placards=state.owners.flatMap((owner,team)=>owner===i?['<img src="'+art('investors','investor-'+colors[team][0])+'" alt="นักลงทุนสี'+colors[team][1]+'">']:[]).join('');
    const title=name(i)+(i===state.seat?' (คุณ)':'')+(i===state.boss?' · บอส':'');
    return '<article class="seat'+(i===(state.boss ?? state.actor)?' active':'')+'"><strong>'+title+'</strong><small>การ์ด '+player.count+' ใบ'+(player.money===undefined?'':' · '+money(player.money))+'</small><div class="investors">'+placards+'</div></article>';
  });
  const reserve=state.owners.flatMap((owner,team)=>owner===null?[chip(team)]:[]);
  if (reserve.length) seatMarkup.push('<article class="seat"><strong>ป้ายนักลงทุนว่าง</strong><div>'+reserve.join(' ')+'</div></article>');
  get('seats').innerHTML=seatMarkup.join('');
}
function renderHand() {
  get('hand-title').textContent='การ์ดในมือ · '+state.hand.length+' ใบ';
  const available=state.hand.filter(canPlay);
  const ids=new Set(available.map(card=>card.id));
  const visible=get('playable-only').checked?available:[...available,...state.hand.filter(card=>!ids.has(card.id))];
  get('hand').innerHTML=visible.map(card=>'<button class="card" type="button" data-action="pick" data-card="'+card.id+'"'+(ids.has(card.id)?'':' disabled')+
    '><img loading="lazy" src="'+cardArt(card)+'" alt=""><strong>'+cardName(card)+'</strong></button>').join('') || '<small>ไม่มีการ์ดให้เลือก</small>';
}
function targeting(card) {
  let targets=[];
  if (card.kind==='travel') targets=state.reps.filter(rep=>canTravel(card,rep)).map(rep=>[rep.id,chip(rep.team)+' '+name(rep.owner)+(rep.id.startsWith('p')?' · ป้าย':' · Team')]);
  if (card.kind==='recruitment' && state.hand.filter(entry=>entry.kind==='recruitment').length>=3) {
    targets=state.owners.flatMap((owner,team)=>owner!==state.seat && (!state.owners.includes(null) || owner===null)?
      [[String(team),chip(team)+' '+(owner===null?'ป้ายว่าง':name(owner))]]:[]);
  }
  return '<div class="notice">เลือกเป้าหมายของ '+cardName(card)+'<div class="buttons">'+targets.map(([id,label])=>
    button('target',label,'data-target="'+id+'"')).join('')+button('cancel','ยกเลิก')+'</div></div>';
}
function negotiation() {
  const pot=board[state.position].shares*state.rate;
  const boss=state.boss===state.seat;
  const window=state.window;
  const selected=state.reps.filter(rep=>choices.has(rep.id) && !rep.blocked);
  const committed=selected.reduce((sum,rep)=>sum+(rep.owner===state.boss?0:state.offers[rep.id]?.amount ?? 0),0);
  const notice=window?'<div class="notice">'+(window.kind==='close'?'กำลังจะปิดดีล · '+window.choices.map(rep=>chip(rep.team)+' '+name(rep.owner)+' '+money(rep.amount)).join(' · '):
    name(window.actor)+' เล่น '+({boss:'Boss',travel:'Travel',recruitment:'Recruitment'}[window.kind]))+
    ' <span id="time"></span>'+(canRespond()?'<div class="buttons">'+button('pass','ผ่าน')+'</div>':'')+'</div>':'';
  const groups=board[state.position].groups.map(group=>'<section class="deal-group"><strong>เลือก '+group.count+' ทีม</strong> '+group.teams.map(chip).join(' ')+
    group.teams.map(team=>{
      const reps=state.reps.filter(rep=>rep.team===team);
      if (!reps.length) return '<div class="rep">'+chip(team)+' <small>ยังไม่มีตัวแทนทีมนี้</small></div>';
      return reps.map(rep=>{
        const offer=state.offers[rep.id];
        const own=rep.owner===state.boss;
        const canChoose=boss && !window && !rep.blocked;
        const isChecked=choices.has(rep.id);
        const label=chip(team)+' '+name(rep.owner)+' · '+(rep.id.startsWith('p')?'ป้ายนักลงทุน':'Team');
        const checkbox=canChoose?'<input type="checkbox" data-choice="'+rep.id+'" '+(isChecked?'checked':'')+'>':'';
        const reply=offer && !offer.accepted && offer.to===state.seat && !window
          ? button('accept','ตกลง','data-target="'+rep.id+'" data-offer="'+offer.id+'"')+
            button('reject','ปฏิเสธ','data-target="'+rep.id+'" data-offer="'+offer.id+'"'):'';
        const edit=!window && !own && !rep.blocked && (boss || rep.owner===state.seat);
        const offerInput=edit?'<input type="number" id="amount-'+rep.id+'" data-draft="'+rep.id+'" min="0" max="'+pot+'" step="1" aria-label="ส่วนแบ่งทีมสี'+colors[team][1]+' ของ '+name(rep.owner)+'" value="'+escape(drafts.get(rep.id) ?? offer?.amount ?? '')+'">'+
          button(boss?'offer':'counter',boss?'เสนอ':'ขอส่วนแบ่ง','data-target="'+rep.id+'"'):'';
        return '<div class="rep"><label class="rep-name">'+checkbox+label+'</label>'+
          (rep.blocked?'<small>เดินทาง</small>':own?'<small>ทีมบอส · เข้าร่วมได้</small>':offer?'<small>'+money(offer.amount)+(offer.accepted?' · ตกลงแล้ว':' · รอตอบ')+'</small>':'')+offerInput+reply+'</div>';
      }).join('');
    }).join('')+'</section>').join('');
  return '<h1>เจรจาช่อง '+(state.position+1)+'</h1><p>บอส '+name(state.boss)+' · เงินดีล <strong>'+money(pot)+'</strong></p>'+notice+groups+
    (boss && !window?'<small>ยอดที่เลือก '+money(committed)+' จาก '+money(pot)+'</small><div class="buttons">'+
      button('close','เตรียมปิดดีล','',true)+button('fail','ยุติดีล')+'</div>':'');
}
function renderDeal() {
  let markup;
  if (state.phase==='finished') {
    const max=Math.max(...state.players.map(player=>player.money));
    const winners=state.players.flatMap((player,i)=>player.money===max?[name(i)]:[]).join(' และ ');
    markup='<h1>'+winners+' ชนะ</h1><p>เงินสูงสุด '+money(max)+' · ปิดสำเร็จ '+state.completed+' ดีล</p>'+
      (state.host===state.seat?button('start','เล่นอีกครั้ง','',true):'');
  } else if (state.phase==='place') {
    const chooser=(state.actor+state.players.length-1)%state.players.length;
    markup='<h1>วางตัวเดิน</h1><p>'+(chooser===state.seat?'เลือกช่องใดก็ได้บนกระดาน': 'รอ '+name(chooser)+' เลือกช่อง')+'</p><p>คนเริ่ม '+name(state.actor)+'</p>';
  } else if (state.phase==='turn') {
    markup='<h1>ตาของ'+name(state.actor)+'</h1>'+
      (state.actor===state.seat?'<p>'+(state.rolled?'เปิดเจรจาที่ช่องนี้ หรือจั่วแล้วจบตา':'เปิดเจรจาที่ช่องนี้ หรือทอยเพื่อเดิน')+'</p><div class="buttons">'+
      button('open','เปิดเจรจา','',true)+(state.rolled?button('draw','จั่ว 3 ใบ'):button('roll','ทอยลูกเต๋า'))+'</div>':'<p>รอผู้เล่นเลือกทำรายการ</p>');
  } else if (state.phase==='discard') {
    markup='<h1>ลดการ์ดในมือ</h1><p>'+(state.actor===state.seat?'เลือกการ์ดจากมือเพื่อทิ้งให้เหลือ 12 ใบ หรือใช้ Recruitment 3 ใบ':'รอ '+name(state.actor)+' ลดจำนวนการ์ด')+'</p>'+
      (state.window?'<div class="notice">รอตอบโต้ Recruitment <span id="time"></span> '+(canRespond()?button('pass','ผ่าน'):'')+'</div>':'');
  } else markup=negotiation();
  const card=state.hand.find(entry=>entry.id===chosenCard);
  if (card && canPlay(card)) {
    markup+=state.phase==='discard' && !state.window?'<div class="notice">'+cardName(card)+' <div class="buttons">'+
      button('discard','ทิ้งใบนี้')+(card.kind==='recruitment' && state.hand.filter(entry=>entry.kind==='recruitment').length>=3?button('recruit-target','ใช้ Recruitment 3 ใบ'):'')+
      button('cancel','ยกเลิก')+'</div></div>':targeting(card);
  }
  get('deal').innerHTML=markup;
  showTime();
}
function showTime() {
  const node=get('time');
  if (node && state.window) node.textContent='· '+Math.max(0,Math.ceil((state.window.until-Date.now())/1000))+' วินาที';
}
function inviteUrl(code) {
  const url=new URL(location.href);
  url.search='?room='+code;
  return url.href;
}
function renderLobby() {
  const {players,code,host,seat}=state;
  get('lobby-count').textContent=players.length+' / 6 ที่นั่ง';
  get('lobby-code').textContent=code;
  if (get('invite-url').value!==inviteUrl(code)) get('invite-url').value=inviteUrl(code);
  get('lobby-seats').innerHTML=Array.from({length:6},(_,i)=>{
    const player=players[i];
    return '<li class="lobby-seat'+(player?'':' vacant')+'"><span class="seat-marker" aria-hidden="true">'+
      String(i+1).padStart(2,'0')+'</span><span><strong>'+(player?name(i):'ที่นั่งว่าง')+'</strong>'+
      (player && (i===host || i===seat)?'<small>'+[i===host?'เจ้าของห้อง':'',i===seat?'คุณ':''].filter(Boolean).join(' · ')+'</small>':'')+'</span></li>';
  }).join('');
  const missing=Math.max(0,3-players.length);
  get('start-room').hidden=host!==seat;
  get('start-room').disabled=missing>0;
  get('lobby-readiness').textContent=missing?'รอผู้เล่นอีก '+missing+' คน':host===seat?'พร้อมเริ่มเกม':'รอเจ้าของห้องเริ่มเกม';
}
function update(next) {
  if (state && next.version<=state.version) return;
  const previous=state;
  const previousWindow=previous?.window?.id;
  state=next;
  if (previous?.turn!==next.turn || previous?.boss!==next.boss || previous?.phase!==next.phase) {
    choices=new Set(); drafts=new Map(); chosenCard=null;
  }
  if (previousWindow!==next.window?.id) chosenCard=null;
  const active=document.activeElement;
  const focusId=active?.id;
  const selection=active?.type==='number'?null:[active?.selectionStart,active?.selectionEnd];
  get('entry').hidden=true;
  get('lobby').hidden=next.phase!=='lobby';
  get('game').hidden=next.phase==='lobby';
  get('room-label').textContent='ห้อง '+next.code;
  if (next.phase==='lobby') {
    renderLobby();
    return;
  }
  renderSeats();
  renderBoard(previous);
  renderDeal();
  renderHand();
  get('log').innerHTML=next.log.map(line=>'<li>'+escape(line)+'</li>').join('');
  const restored=focusId && get(focusId);
  if (restored && restored!==active) {
    restored.focus({preventScroll:true});
    if (selection?.[0]!=null) restored.setSelectionRange?.(...selection);
  }
}
async function request(url,body,token) {
  const options={headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})}};
  if (body) Object.assign(options,{method:'POST',body:JSON.stringify(body)});
  const response=await fetch(url,options);
  const data=await response.json();
  if (!response.ok) throw Object.assign(Error(data.error ?? 'เชื่อมต่อไม่ได้'),{status:response.status});
  return data;
}
function setSession(value) {
  session=value;
  sessionStorage.setItem('boss-room-'+value.code,value.token);
  history.replaceState(null,'','?room='+value.code);
}
function expireSession() {
  sessionStorage.removeItem('boss-room-'+session.code);
  session=null; state=null;
  get('entry').hidden=false; get('game').hidden=true; get('lobby').hidden=true;
  get('room-label').textContent='';
}
async function sync(body) {
  if (!session || busy || (!body && polling)) return false;
  const currentSession=session;
  if (body) busy=true;
  else polling=true;
  try {
    const next=await request('/api/boss/room?code='+currentSession.code,body,currentSession.token);
    if (session!==currentSession) return false;
    update(next);
    if (body) status();
    return true;
  } catch (error) {
    if (session!==currentSession) return false;
    if (error.status===401) expireSession();
    status(error.message || 'เชื่อมต่อไม่ได้');
    return false;
  } finally {
    if (body) busy=false;
    else polling=false;
  }
}
function send(action,payload={}) {
  return sync({action,turn:state.turn,window:state.window?.id,...payload});
}
async function enterRoom(create) {
  if (busy) return;
  if (!get('name').reportValidity()) return;
  busy=true;
  try {
    const value=await request('/api/boss/enter',{name:get('name').value,code:get('code').value.trim().toUpperCase(),create});
    setSession(value);
    status();
  } catch (error) { status(error.message); }
  finally { busy=false; }
  await sync();
}
get('entry-form').addEventListener('submit',event=>{
  event.preventDefault();
  void enterRoom(false);
});
get('create-room').addEventListener('click',()=>void enterRoom(true));
get('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const message=get('chat').value;
  if (await send('chat',{message}) && get('chat').value===message) get('chat').value='';
});
get('playable-only').addEventListener('change',renderHand);
get('deal').addEventListener('input',event=>{
  const {draft,choice}=event.target.dataset;
  if (draft) drafts.set(draft,event.target.value);
  if (choice) {
    if (event.target.checked) choices.add(choice);
    else choices.delete(choice);
    renderDeal();
    get('deal').querySelector('[data-choice="'+choice+'"]')?.focus({preventScroll:true});
  }
});
document.addEventListener('click',async event=>{
  const control=event.target.closest('button[data-action]');
  if (!control || control.disabled || !state) return;
  const {action,target,position,card,offer}=control.dataset;
  if (action==='copy') {
    try { await navigator.clipboard.writeText(inviteUrl(state.code)); status('คัดลอกลิงก์แล้ว'); }
    catch { get('invite-url').select(); status('เลือกลิงก์แล้ว กดคัดลอกจากช่องลิงก์เข้าห้อง'); }
    return;
  }
  if (action==='pick') {
    const entry=state.hand.find(item=>item.id===card);
    if (!entry || !canPlay(entry)) return;
    if (state.phase==='discard' && !state.window || ['travel','recruitment'].includes(entry.kind)) {
      chosenCard=card;
      renderDeal();
      get('deal').querySelector('.notice:last-child button')?.focus();
    } else await send('play',{card});
    return;
  }
  if (action==='cancel') { chosenCard=null; renderDeal(); return; }
  if (action==='recruit-target') {
    const entry=state.hand.find(item=>item.id===chosenCard);
    if (entry) get('deal').insertAdjacentHTML('beforeend',targeting(entry));
    control.disabled=true;
    return;
  }
  if (action==='target') {
    const entry=state.hand.find(item=>item.id===chosenCard);
    if (entry && await send('play',{card:entry.id,target:entry.kind==='recruitment'?Number(target):target})) {
      chosenCard=null; renderDeal();
    }
    return;
  }
  if (action==='discard') {
    if (await send('discard',{card:chosenCard})) { chosenCard=null; renderDeal(); }
    return;
  }
  if (action==='offer' || action==='counter') {
    const amount=get('amount-'+target).valueAsNumber;
    if (!Number.isInteger(amount) || amount<0) { status('ใส่ยอดเงินเป็นจำนวนเต็ม'); return; }
    await send(action,{target,amount});
    return;
  }
  if (action==='accept' || action==='reject') { await send('reply',{target,offer:Number(offer),accept:action==='accept'}); return; }
  if (action==='place') { await send(action,{position:Number(position)}); return; }
  if (action==='close') { await send(action,{choices:[...choices]}); return; }
  await send(action);
});
if (invite && sessionStorage.getItem('boss-room-'+invite)) {
  session={code:invite,token:sessionStorage.getItem('boss-room-'+invite)};
  void sync();
}
setInterval(()=>void sync(),800);
setInterval(showTime,250);
