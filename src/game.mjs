import {randomInt} from 'node:crypto';
export const treasures = [1,2,3,4,5,5,7,7,9,11,11,13,14,15,17];
export const hazards = ['งู','ไฟ','หินถล่ม','มัมมี่','แมงมุม'];
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export function start(room) {
  Object.assign(room, {phase:'playing',round:0,
    artifacts:[5,7,8,10,12].map(value=>({kind:'artifact',value})),
    deck:[...treasures.map(value=>({kind:'treasure',value})),
      ...hazards.flatMap(value=>Array.from({length:3},()=>({kind:'hazard',value})))]});
  for (const p of room.players) Object.assign(p,{bank:0,bonus:0,artifacts:0});
  nextRound(room);
}
export function nextRound(room) {
  room.round++;
  room.path = [];
  room.leftovers = 0;
  room.decisions = new Map();
  room.revealed = [];
  room.turn++;
  for (const p of room.players) Object.assign(p,{active:true,carry:0,outcome:null});
  room.introduced = room.artifacts[room.round-1];
  room.deck.push(room.introduced);
  shuffle(room.deck);
  room.phase = 'playing';
  draw(room);
}
function endRound(room, reason) {
  room.deck.push(...room.path.filter(card=>card.kind!=='artifact' && !card.removed));
  for (const p of room.players) Object.assign(p,{carry:0,active:false});
  room.leftovers = 0;
  room.reason = reason;
  room.deadline = null;
  room.phase = room.round === 5 ? 'finished' : 'intermission';
}
export function draw(room) {
  const card = room.deck.pop();
  if (!card) return endRound(room,'สำรับหมด');
  const repeated = card.kind==='hazard' && room.path.some(c=>c.kind==='hazard' && c.value===card.value);
  const entry = {...card};
  room.path.push(entry);
  if (repeated) {
    entry.removed = true;
    for (const p of room.players.filter(player=>player.active)) {
      p.outcome = {kind:'hazard',lost:p.carry};
    }
    return endRound(room, 'ภัยซ้ำ · '+card.value);
  }
  if (card.kind==='treasure') {
    const active = room.players.filter(p=>p.active);
    for (const p of active) p.carry += Math.floor(card.value / active.length);
    room.leftovers += card.value % active.length;
  }
  room.deadline = Date.now()+45000;
}
export function resolve(room) {
  const active = room.players.filter(p=>p.active);
  room.revealed = active.map(p=>({name:p.name,choice:room.decisions.get(p.id) ?? 'exit'}));
  const leaving = active.filter(p=>room.decisions.get(p.id)!=='explore');
  const share = leaving.length ? Math.floor(room.leftovers/leaving.length) : 0;
  room.leftovers -= share * leaving.length;
  for (const p of leaving) {
    p.outcome = {kind:'exit',carried:p.carry,share};
    p.bank += p.carry+share;
    p.active = false;
    p.carry = 0;
  }
  if (leaving.length===1) {
    for (const card of room.path.filter(c=>c.kind==='artifact' && !c.claimed)) {
      card.claimed = true;
      leaving[0].artifacts++;
      leaving[0].bonus += card.value;
    }
  }
  room.decisions.clear();
  room.turn++;
  if (leaving.length===active.length) return endRound(room,'ทุกคนกลับแคมป์แล้ว');
  draw(room);
}
export function view(room, player) {
  const {code,phase,round,turn,path,leftovers,deadline,revealed,reason,introduced} = room;
  const standings = phase==='finished' ? room.players.map(p=>({
    name:p.name,score:p.bank+p.bonus,artifacts:p.artifacts
  })).sort((a,b)=>b.score-a.score || b.artifacts-a.artifacts) : undefined;
  return {code,phase,round,turn,path,leftovers,deadline,revealed,reason,introduced,standings,
    host:room.host===player.id, you:{active:player.active,carry:player.carry,
      bank:player.bank,bonus:player.bonus,choice:room.decisions.get(player.id)},
    players:room.players.map(p=>({name:p.name,active:p.active,artifacts:p.artifacts,outcome:p.outcome,
      online:Date.now()-p.seen<12000}))};
}
