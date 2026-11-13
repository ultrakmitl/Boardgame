import {randomBytes,randomInt} from 'node:crypto';
import {board,cardName,dividends} from '../public/boss-rules.js';

const rooms = new Map();
const responseTime = 12000;
const bad = message => { throw Error(message); };
const token = () => randomBytes(24).toString('base64url');
const die = () => randomInt(1,7);
function shuffle(items) {
  for (let i=items.length-1;i>0;i--) {
    const j=randomInt(i+1);
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}
function deck() {
  const cards = [];
  function add(kind, count, team=null) {
    for (let i=0;i<count;i++) cards.push({id:'c'+cards.length,kind,team});
  }
  for (let team=0;team<6;team++) { add('team',4,team); add('travel',3,team); }
  add('travel',3); add('recruitment',33); add('boss',10); add('stop',10);
  return shuffle(cards);
}
function draw(room, player, count) {
  while (count-- > 0) {
    if (!room.deck.length) room.deck=shuffle(room.discard.splice(0));
    if (!room.deck.length) break;
    player.hand.push(room.deck.pop());
  }
}
function event(room,text) {
  room.log.unshift(text);
  room.log.length=Math.min(room.log.length,40);
}
function tick(room) { room.version++; }
function nextOpen(room,position) {
  do { position=(position+1)%board.length; } while (room.closed[position]);
  return position;
}
function nextTurn(room,seat) {
  Object.assign(room,{phase:'turn',actor:(seat+1)%room.players.length,boss:null,rolled:false,deal:null,window:null});
  room.turn++;
}
function start(room) {
  Object.assign(room,{phase:'place',turn:room.turn+1,actor:randomInt(room.players.length),boss:null,
    position:null,closed:Array(16).fill(null),completed:0,owners:Array(6).fill(null),
    deck:deck(),discard:[],deal:null,window:null,roll:null,log:[],rolled:false});
  const teams=shuffle([0,1,2,3,4,5]);
  for (const [seat,player] of room.players.entries()) {
    player.hand=[]; player.money=0;
    draw(room,player,5);
    room.owners[teams.pop()]=seat;
    if (room.players.length===3) room.owners[teams.pop()]=seat;
  }
}
function representatives(room, availableOnly=true) {
  const list=room.owners.flatMap((owner,team)=>owner===null ? [] : [{id:'p'+team,team,owner}]);
  list.push(...room.deal.teamCards.map(({card,owner})=>({id:card.id,team:card.team,owner})));
  return list.map(rep=>({...rep,blocked:room.deal.blocked.includes(rep.id)}))
    .filter(rep=>!availableOnly || !rep.blocked);
}
function removeCards(player, cards) {
  const ids=new Set(cards.map(card=>card.id));
  player.hand=player.hand.filter(card=>!ids.has(card.id));
}
function openWindow(room, kind, data) {
  room.window={id:++room.sequence,kind,until:Date.now()+responseTime,passes:[],...data};
}
function finishDeal(room, choices=null) {
  const boss=room.boss;
  const used=new Set(choices?.map(entry=>entry.id));
  for (const {card,owner} of room.deal.teamCards) {
    if (used.has(card.id)) room.discard.push(card);
    else room.players[owner].hand.push(card);
  }
  if (choices) {
    let remaining=board[room.position].shares*dividends[room.completed];
    for (const entry of choices) {
      remaining-=entry.amount;
      room.players[entry.owner].money+=entry.amount;
    }
    room.players[boss].money+=remaining;
    room.closed[room.position]=++room.completed;
    event(room,'ปิดดีล #'+room.completed+' · '+room.players[boss].name+' รับส่วนที่เหลือ '+remaining+' ล้าน');
    if (room.completed>=10 && room.completed<15) {
      const face=die();
      room.roll={face,path:[],ending:true,id:++room.sequence};
      event(room,'ทอยจบเกมได้ '+face+' แต้ม');
    }
    if (room.completed===15 || (room.completed>=10 && room.roll.face<=room.completed-9)) {
      Object.assign(room,{phase:'finished',deal:null,window:null});
      return;
    }
    room.position=nextOpen(room,room.position);
  } else event(room,room.players[boss].name+' ยุติการเจรจา');
  nextTurn(room,boss);
}
function resolveWindow(room, stopped=false) {
  const window=room.window;
  room.window=null;
  if (window.kind==='close') { finishDeal(room,window.choices); return; }
  const {kind,actor,target,cards}=window;
  room.discard.push(...cards);
  if (!stopped) {
    if (kind==='boss') {
      room.boss=actor;
      for (const [id,offer] of Object.entries(room.deal.offers)) {
        if (!offer.accepted) delete room.deal.offers[id];
      }
      event(room,room.players[actor].name+' เป็นบอสคนใหม่');
    } else if (kind==='travel') {
      const i=room.deal.teamCards.findIndex(entry=>entry.card.id===target);
      if (i>=0) room.discard.push(room.deal.teamCards.splice(i,1)[0].card);
      else room.deal.blocked.push(target);
      delete room.deal.offers[target];
    } else {
      room.owners[target]=actor;
      if (room.deal) delete room.deal.offers['p'+target];
    }
  }
  if (room.phase==='discard' && room.players[actor].hand.length<=12) nextTurn(room,actor);
}
function expireWindow(room) {
  if (room.window && room.window.until<=Date.now()) { resolveWindow(room); tick(room); }
}
function play(room,seat,input) {
  const player=room.players[seat];
  const card=player.hand?.find(entry=>entry.id===input.card);
  if (!card) bad('การ์ดใบนี้ไม่ได้อยู่ในมือ');
  if (room.window && room.window.kind!=='close') {
    if (card.kind!=='stop' || input.window!==room.window.id || room.window.passes.includes(seat)) bad('รอจังหวะตอบโต้การ์ดก่อน');
    removeCards(player,[card]);
    room.discard.push(card);
    event(room,player.name+' เล่น Stop');
    resolveWindow(room,true);
    return;
  }
  if (card.kind==='stop') bad('ใช้ Stop ได้ทันทีหลังการ์ดที่ยกเลิกได้');
  const overflow=room.phase==='discard' && seat===room.actor;
  if (room.phase!=='deal' && !(overflow && card.kind==='recruitment')) bad('เล่นการ์ดนี้ในจังหวะนี้ไม่ได้');
  if (room.window && (input.window!==room.window.id || room.window.passes.includes(seat))) bad('จังหวะปิดดีลเปลี่ยนแล้ว');
  let target=input.target;
  let spent=[card];
  if (card.kind==='recruitment') {
    spent=player.hand.filter(entry=>entry.kind==='recruitment').slice(0,3);
    if (spent.length<3) bad('ต้องใช้ Recruitment พร้อมกัน 3 ใบ');
    if (!Number.isInteger(target) || target<0 || target>=6 || room.owners[target]===seat ||
      (room.owners.includes(null) && room.owners[target]!==null)) bad('เลือกป้ายที่ซื้อตัวได้ โดยเลือกป้ายว่างก่อน');
  } else if (card.kind==='travel') {
    const rep=representatives(room).find(entry=>entry.id===target);
    if (!rep || rep.owner===seat || (card.team!==null && card.team!==rep.team)) bad('เลือกนักลงทุนฝ่ายอื่นที่สีตรงกับ Travel');
  } else if (card.kind==='boss' && room.boss===seat) bad('คุณเป็นบอสอยู่แล้ว');
  room.window=null;
  removeCards(player,spent);
  event(room,player.name+' เล่น '+cardName(card));
  if (card.kind==='team') room.deal.teamCards.push({card,owner:seat});
  else openWindow(room,card.kind,{actor:seat,target,cards:spent});
}
function chooseTerms(room,ids) {
  if (!Array.isArray(ids) || new Set(ids).size!==ids.length) bad('เลือกตัวแทนให้ครบ');
  const reps=representatives(room);
  const choices=ids.map(id=>{
    const rep=reps.find(entry=>entry.id===id);
    if (!rep) bad('ตัวแทนที่เลือกเข้าดีลไม่ได้');
    const offer=room.deal.offers[id];
    if (rep.owner!==room.boss && (!offer?.accepted || offer.owner!==rep.owner)) bad('รอให้ตัวแทนที่เลือกตอบตกลง');
    return {...rep,amount:rep.owner===room.boss ? 0 : offer.amount};
  });
  if (new Set(choices.map(rep=>rep.team)).size!==choices.length ||
      !board[room.position].groups.every(group=>choices.filter(rep=>group.teams.includes(rep.team)).length===group.count) ||
      choices.length!==board[room.position].groups.reduce((sum,group)=>sum+group.count,0)) bad('เลือกทีมให้ตรงกับทุกกลุ่มบนกระดาน');
  if (choices.reduce((sum,entry)=>sum+entry.amount,0)>board[room.position].shares*dividends[room.completed]) bad('ยอดส่วนแบ่งเกินเงินดีล');
  return choices;
}
function action(room,seat,input) {
  const player=room.players[seat];
  if (input.action==='chat') {
    const message=typeof input.message==='string' ? input.message.trim() : '';
    if (!message || message.length>250) bad('ข้อความต้องมี 1–250 ตัวอักษร');
    event(room,player.name+': '+message);
    return;
  }
  if (input.turn!==room.turn) bad('ตานี้เปลี่ยนแล้ว');
  if (input.action==='start' && room.host===seat && ['lobby','finished'].includes(room.phase) && room.players.length>=3) { start(room); return; }
  if (input.action==='play') { play(room,seat,input); return; }
  if (input.action==='pass' && room.window?.id===input.window && !room.window.passes.includes(seat)) {
    room.window.passes.push(seat);
    if (room.window.passes.length===room.players.length) resolveWindow(room);
    return;
  }
  if (room.window) bad('รอให้จังหวะตอบโต้จบก่อน');
  if (room.phase==='place' && seat===(room.actor+room.players.length-1)%room.players.length && input.action==='place' &&
      Number.isInteger(input.position) && input.position>=0 && input.position<16) {
    room.position=input.position; room.phase='turn'; return;
  }
  if (room.phase==='turn' && room.actor===seat) {
    if (input.action==='roll' && !room.rolled) {
      const face=die(),path=[];
      for (let step=0;step<face;step++) { room.position=nextOpen(room,room.position); path.push(room.position); }
      room.roll={id:++room.sequence,face,path};
      room.rolled=true;
      event(room,player.name+' ทอยได้ '+face+' · ไปช่อง '+(room.position+1));
      return;
    }
    if (input.action==='draw' && room.rolled) {
      draw(room,player,3);
      event(room,player.name+' เลือกจั่วการ์ด');
      if (player.hand.length>12) room.phase='discard';
      else nextTurn(room,seat);
      return;
    }
    if (input.action==='open') {
      room.phase='deal'; room.boss=seat; room.deal={teamCards:[],blocked:[],offers:{}};
      event(room,player.name+' เปิดเจรจาช่อง '+(room.position+1));
      return;
    }
  }
  if (room.phase==='discard' && room.actor===seat && input.action==='discard') {
    const card=player.hand.find(entry=>entry.id===input.card);
    if (!card) bad('เลือกการ์ดในมือที่จะทิ้ง');
    removeCards(player,[card]); room.discard.push(card);
    if (player.hand.length<=12) nextTurn(room,seat);
    return;
  }
  if (room.phase==='deal') {
    if (seat===room.boss && input.action==='fail') { finishDeal(room); return; }
    if (seat===room.boss && input.action==='close') {
      openWindow(room,'close',{choices:chooseTerms(room,input.choices)});
      event(room,player.name+' เตรียมปิดดีล');
      return;
    }
    if (['offer','reply','counter'].includes(input.action)) {
      const rep=representatives(room).find(entry=>entry.id===input.target);
      if (!rep || rep.owner===room.boss) bad('เลือกตัวแทนฝ่ายอื่นที่เข้าดีลได้');
      const previous=room.deal.offers[rep.id];
      if (input.action==='reply') {
        if (!previous || previous.id!==input.offer || previous.accepted || previous.to!==seat || typeof input.accept!=='boolean') bad('ข้อเสนอนี้เปลี่ยนแล้ว');
        if (input.accept) previous.accepted=true;
        else delete room.deal.offers[rep.id];
        event(room,player.name+(input.accept?' ตกลงรับข้อเสนอ':' ปฏิเสธข้อเสนอ'));
        return;
      }
      const counter=input.action==='counter';
      if (counter ? rep.owner!==seat : seat!==room.boss) bad('คุณส่งข้อเสนอนี้ไม่ได้');
      const pot=board[room.position].shares*dividends[room.completed];
      if (!Number.isInteger(input.amount) || input.amount<0 || input.amount>pot) bad('ใส่ยอดเงินจำนวนเต็มภายในเงินกองกลาง');
      room.deal.offers[rep.id]={id:++room.sequence,owner:rep.owner,amount:input.amount,to:counter?room.boss:rep.owner,from:seat,accepted:false};
      return;
    }
  }
  bad('คำสั่งนี้ใช้ไม่ได้ในจังหวะนี้');
}
function view(room,seat) {
  const player=room.players[seat];
  return {
    code:room.code,host:room.host,seat,version:room.version,turn:room.turn,phase:room.phase,
    actor:room.actor,boss:room.boss,position:room.position,rolled:room.rolled,roll:room.roll,
    closed:room.closed,completed:room.completed,rate:dividends[room.completed],
    owners:room.owners,deckCount:room.deck?.length,log:room.log,hand:player.hand ?? [],
    players:room.players.map((entry,i)=>({name:entry.name,count:entry.hand?.length ?? 0,
      money:i===seat || room.phase==='finished' ? entry.money : undefined})),
    reps:room.deal ? representatives(room,false) : [],
    offers:room.deal?.offers ?? {},
    window:room.window && {id:room.window.id,kind:room.window.kind,until:room.window.until,
      passes:room.window.passes,actor:room.window.actor,target:room.window.target,choices:room.window.choices}
  };
}
export function bossEnter(input, roomStore = rooms, createCode = null) {
  if (!input || typeof input!=='object') bad('คำขอไม่ถูกต้อง');
  const name=typeof input.name==='string' ? input.name.trim() : '';
  if (!name || name.length>24) bad('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room=roomStore.get(input.code);
  if (input.create===true) {
    if (roomStore.size>=500) bad('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code = createCode?.() ?? randomBytes(4).toString('hex').toUpperCase(); } while (roomStore.has(code));
    room={code,players:[],host:0,turn:0,version:0,sequence:0,phase:'lobby',updated:Date.now(),log:[]};
    roomStore.set(code,room);
  }
  if (!room) bad('ไม่พบห้องนี้');
  if (room.phase!=='lobby' || room.players.length>=6) bad('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.players.some(player=>player.name===name)) bad('ชื่อนี้มีคนใช้แล้ว');
  const session=token();
  room.players.push({session,name,seen:Date.now()});
  room.updated=Date.now();
  tick(room);
  return {code:room.code,token:session};
}
export function bossRoom(code,authorization,input=null, roomStore = rooms) {
  const room=roomStore.get(code);
  const seat=room?.players.findIndex(player=>'Bearer '+player.session===authorization);
  if (seat===undefined || seat<0) return null;
  room.players[seat].seen=room.updated=Date.now();
  expireWindow(room);
  if (input!==null) {
    if (typeof input!=='object' || Array.isArray(input)) bad('คำขอไม่ถูกต้อง');
    action(room,seat,input); tick(room);
  }
  return view(room,seat);
}
export function maintainBossRooms(now, roomStore = rooms) {
  for (const [code,room] of roomStore) {
    if (now-room.updated>3600000) { roomStore.delete(code); continue; }
    expireWindow(room);
    if (now-room.players[room.host].seen>45000) {
      const replacement=room.players.findIndex(player=>now-player.seen<12000);
      if (replacement>=0) { room.host=replacement; tick(room); }
    }
  }
}
