import {randomBytes, randomInt} from 'node:crypto';

export const market = {
  blue: {faces: [-1,-1,0,0,1,1], track: [20,20,20,30,30,30,40,40]},
  green: {faces: [-2,-1,0,1,2,2], track: [0,10,20,30,30,40,50,60]},
  yellow: {faces: [-3,-2,-1,1,2,3], track: [-10,0,0,30,40,40,60,60]},
  red: {faces: [-7,-3,-2,2,3,7], track: [-20,-10,0,30,40,50,60,70]}
};

const sectors = {
  blue: ['Hudson Water','Liberty Electric','Union Rail','Atlantic Gas','Borough Transit','Empire Post','Civic Telegraph','Pioneer Power','East River Ferry','Harbor Waterworks','Central Light','Metro Telephone','National Grid'],
  green: ['Astor Foods','Crown Textile','Orchard Dairy','Anchor Flour','Mercury Shoes','Broadway Press','Elm Furniture','Grand Tobacco','Sterling Soap','Parkside Mills','Riverside Paper','Liberty Canning','Union Markets'],
  yellow: ['Atlas Motors','Continental Steel','Horizon Radio','Titan Machinery','Vanguard Rubber','Keystone Glass','Northstar Oil','Summit Cement','Meridian Shipping','Liberty Tractors','York Foundry','Imperial Aviation','Monarch Chemical'],
  red: ['Aurora Airship','Pacific Gold','Frontier Film','Red Rock Petroleum','Skyline Aeronautics','Comet Laboratories','Eclipse Mining']
};

export const companies = Object.entries(sectors).flatMap(([color,names]) =>
  names.map((name,index) => ({id: color + (index + 1), name, color, multiple: index >= (color === 'red' ? 6 : 11) ? 2 : 1})));

const rooms = new Map();
const pick = list => list[randomInt(list.length)];
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i],result[j]] = [result[j],result[i]];
  }
  return result;
}
function check(condition,message) {
  if (!condition) throw new Error(message);
}

export function wallEnter(input, roomStore = rooms, createCode = null) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  check(name && name.length <= 24,'กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = roomStore.get(input.code);
  if (input.create === true) {
    check(roomStore.size < 500,'ห้องเต็มแล้ว');
    let code;
    do { code = createCode?.() ?? randomBytes(4).toString('hex').toUpperCase(); } while (roomStore.has(code));
    room = {code, phase:'lobby', players:[], version:0, messages:[]};
    roomStore.set(code,room);
  }
  check(room?.phase === 'lobby' && room.players.length < 11,'ไม่พบห้อง ห้องเต็ม หรือเกมเริ่มแล้ว');
  check(!room.players.some(player => player.name === name),'ชื่อนี้มีคนใช้แล้ว');
  const token = randomBytes(24).toString('base64url');
  room.players.push({id:room.players.length,name,token,cash:120});
  room.updated = Date.now();
  room.version++;
  return {code:room.code,token};
}

function beginPricing(room,now) {
  room.phase = 'pricing';
  room.deadline = now + 60_000;
  room.offers = [];
  room.rolls = null;
  room.rollingColor = null;
  room.report = [];
  room.debts = [];
  room.auction = null;
  room.tiles.forEach(tile => {
    tile.askingPrice = null;
    if (tile.deal) {
      tile.deal.closed = false;
      delete tile.deal.lockRequestedBy;
    }
  });
  room.players.forEach(player => { player.pricingReady = false; });
  if (!room.players.some(player => player.manager)) trade(room,now);
}

function trade(room,now) {
  room.phase = 'trade';
  room.deadline = now + 120_000;
}

function start(room,now) {
  room.dual = room.players.length < 5;
  const roles = shuffle(room.players).map(player => ({player,roll:pick(market.red.faces)}))
    .sort((a,b) => b.roll-a.roll);
  roles.forEach(({player,roll},i) => {
    player.roleRoll = roll;
    player.manager = room.dual || i < Math.floor(roles.length/2);
    player.investor = room.dual || !player.manager;
  });
  const normal = shuffle(companies.filter(tile => tile.multiple === 1));
  room.tiles = room.players.filter(p => p.manager).flatMap(p =>
    normal.splice(0,3).map(tile => ({...tile,owner:p.id,deal:null})));
  room.reserve = shuffle([...normal,...companies.filter(tile => tile.multiple === 2)]);
  room.positions = Object.fromEntries(Object.keys(market).map(color => [color,3]));
  room.round = 1;
  beginPricing(room,now);
}

function beginMarketRoll(room) {
  room.phase = 'market-roll';
  room.rolls = {};
  room.deadline = null;
}

function revealMarketDie(room,now) {
  const color = room.rollingColor;
  const {track,faces} = market[color];
  const roll = pick(faces);
  room.positions[color] = Math.min(track.length-1,Math.max(0,room.positions[color]+roll));
  room.rolls[color] = roll;
  room.rollingColor = null;
  room.deadline = Object.keys(room.rolls).length === Object.keys(market).length ? now + 1400 : null;
}

function settleMarket(room) {
  room.report = room.players.map(() => ({dividend:0,received:0,paid:0,fees:0,sold:0}));
  room.debts = [];
  for (const tile of room.tiles) {
    if (!tile.deal) continue;
    const {investor,price} = tile.deal;
    const dividend = market[tile.color].track[room.positions[tile.color]] * tile.multiple;
    room.report[investor].dividend += dividend;
    room.players[investor].cash += dividend;
    const existing = room.debts.find(debt => debt.investor === investor && debt.manager === tile.owner);
    if (existing) existing.total += price;
    else room.debts.push({investor,manager:tile.owner,total:price});
  }
  room.debts.sort((a,b) => a.manager-b.manager || a.investor-b.investor);
  room.phase = 'settle';
  room.deadline = null;
  collect(room);
}

function pay(room,debt,amount) {
  room.players[debt.investor].cash -= amount;
  room.players[debt.manager].cash += amount;
  room.report[debt.investor].paid += amount;
  room.report[debt.manager].received += amount;
}

function collect(room) {
  while (room.debts.length) {
    const debt = room.debts[0];
    const investor = room.players[debt.investor];
    if (investor.investor && investor.cash < debt.total) return;
    if (investor.investor) pay(room,debt,debt.total);
    room.debts.shift();
  }
  room.phase = 'fees';
  for (const player of room.players.filter(p => p.manager)) {
    player.fee = room.tiles.filter(tile => tile.owner === player.id).length * 10;
  }
  chargeFees(room);
}

function chargeFees(room) {
  for (const player of room.players.filter(p => p.manager)) {
    if (player.cash >= player.fee) {
      player.cash -= player.fee;
      room.report[player.id].fees += player.fee;
      player.fee = 0;
    } else if (!room.tiles.some(tile => tile.owner === player.id)) {
      player.manager = false;
      player.cash = Math.max(0,player.cash);
      player.fee = 0;
    }
  }
  if (!room.players.some(player => player.fee > 0)) {
    room.phase = room.round === 5 ? 'done' : 'review';
  }
}

function auctionNext(room,now) {
  const card = room.queue.shift();
  if (!card) {
    room.round++;
    beginPricing(room,now);
    return;
  }
  room.phase = 'auction';
  room.auction = {card,bid:0,bidder:null,passes:[]};
  room.deadline = now + 25_000;
}

function closeAuction(room,now) {
  const {card,bid,bidder} = room.auction;
  if (bidder !== null) {
    room.players[bidder].cash -= bid;
    room.tiles.push({...card,owner:bidder,deal:null});
  }
  auctionNext(room,now);
}

function maintain(room,now) {
  if (room.deadline == null || room.deadline > now) return;
  if (room.phase === 'pricing') trade(room,now);
  else if (room.phase === 'trade') beginMarketRoll(room);
  else if (room.phase === 'market-roll') {
    if (room.rollingColor) revealMarketDie(room,now);
    else settleMarket(room);
  }
  else if (room.phase === 'auction') closeAuction(room,now);
  room.version++;
}

function negotiate(room,player,input) {
  const tile = room.tiles.find(tile => tile.id === input.tile);
  check(tile && !tile.deal?.closed,'บริษัทนี้ไม่มีอยู่หรือปิดดีลแล้ว');
  const owned = tile.owner === player.id;
  const index = room.offers.findIndex(offer => offer.tile === tile.id && offer.investor === player.id);
  if (input.action === 'offer') {
    check(player.investor && !owned,'ส่งราคาให้บริษัทของผู้อื่นเท่านั้น');
    check(Number.isSafeInteger(input.price) && input.price >= 0 && input.price <= 10000,'กรอกราคาเป็นจำนวนเต็มในหน่วยพันดอลลาร์');
    if (index >= 0) room.offers.splice(index,1);
    room.offers.push({tile:tile.id,investor:player.id,price:input.price});
  } else if (input.action === 'accept') {
    check(owned,'รับข้อเสนอได้เฉพาะบริษัทของคุณ');
    const offer = room.offers.find(offer => offer.tile === tile.id && offer.investor === input.investor);
    check(offer,'ข้อเสนอนี้ถูกถอนหรือรับไปแล้ว');
    check(offer.price === input.price,'ผู้ซื้อเปลี่ยนราคาแล้ว กรุณาตรวจราคาล่าสุดก่อนกดรับ');
    check(room.tiles.filter(other => other !== tile && other.deal?.investor === offer.investor).length < 10,'นักลงทุนใช้โทเคนครบ 10 ชิ้นแล้ว');
    tile.deal = {investor:offer.investor,price:offer.price,closed:false,revision:room.version};
    room.offers = room.offers.filter(candidate => candidate !== offer);
  } else if (input.action === 'cancel-offer') {
    check(index >= 0,'ไม่มีข้อเสนอให้ถอน');
    room.offers.splice(index,1);
  } else if (input.action === 'close-deal') {
    const deal = tile.deal;
    check(deal && (owned || deal.investor === player.id),'ดีลนี้ไม่ได้เป็นของคุณ');
    check(deal.revision === input.revision,'ดีลเปลี่ยนแล้ว กรุณาตรวจราคาอีกครั้ง');
    if (deal.lockRequestedBy == null) {
      deal.lockRequestedBy = player.id;
    } else if (deal.lockRequestedBy !== player.id) {
      deal.closed = true;
      delete deal.lockRequestedBy;
    }
  } else {
    check(tile.deal && (owned || tile.deal.investor === player.id),'ดีลนี้ไม่ได้เป็นของคุณ');
    tile.deal = null;
  }
}

function act(room,player,input,now) {
  if (input.action === 'chat') {
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    check(message && message.length <= 240,'ข้อความยาวได้ไม่เกิน 240 ตัวอักษร');
    room.messages.push({player:player.id,message});
    if (room.messages.length > 60) room.messages.shift();
    return;
  }
  check(input.round === (room.round ?? null) && input.phase === room.phase,'ช่วงนี้จบแล้ว');
  if (input.action === 'start') {
    check(player.id === 0 && room.phase === 'lobby' && room.players.length >= 3,'เจ้าห้องเริ่มได้เมื่อมีผู้เล่นอย่างน้อย 3 คน');
    start(room,now);
  } else if (room.phase === 'pricing') {
    check(player.manager && !player.pricingReady,'ให้ผู้จัดการที่ยังไม่ได้กดพร้อมตั้งราคา');
    if (input.action === 'set-price') {
      const tile = room.tiles.find(tile => tile.id === input.tile && tile.owner === player.id);
      check(tile,'ตั้งราคาได้เฉพาะการ์ดของคุณ');
      check(Number.isSafeInteger(input.price) && input.price >= 0 && input.price <= 10000,'กรอกราคาเป็นจำนวนเต็มในหน่วยพันดอลลาร์');
      tile.askingPrice = input.price;
    } else {
      check(input.action === 'pricing-ready','คำสั่งนี้ใช้ไม่ได้ในช่วงตั้งราคา');
      player.pricingReady = true;
      if (room.players.every(player => !player.manager || player.pricingReady)) trade(room,now);
    }
  } else if (room.phase === 'trade') {
    // Tabs left open across an update can still send the former lock actions.
    if (input.action === 'request-lock' || input.action === 'confirm-lock') {
      input = {...input,action:'close-deal'};
    }
    check(['offer','accept','withdraw','cancel-offer','close-deal'].includes(input.action),'คำสั่งนี้ใช้ไม่ได้ในช่วงเจรจา');
    negotiate(room,player,input);
  } else if (room.phase === 'market-roll') {
    check(input.action === 'roll-die' && player.id === 0,'ให้เจ้าห้องเลือกสีลูกเต๋า');
    check(!room.rollingColor && room.deadline == null,'รอให้ลูกเต๋าหยุดก่อน');
    check(Object.hasOwn(market,input.color) && !Object.hasOwn(room.rolls,input.color),'เลือกสีที่ยังไม่ได้ทอย');
    room.rollingColor = input.color;
    room.deadline = now + 1800;
  } else if (room.phase === 'settle') {
    const debt = room.debts[0];
    check(debt?.manager === player.id && input.investor === debt.investor,'ผู้จัดการเจ้าหนี้เป็นผู้ตัดสินใจ');
    check(['defer','bankrupt'].includes(input.action),'เลือกวิธีจัดการหนี้');
    if (input.action === 'bankrupt') {
      const investor = room.players[debt.investor];
      investor.investor = false;
      investor.cash = Math.max(0,investor.cash);
      room.tiles.forEach(tile => { if (tile.deal?.investor === investor.id) tile.deal = null; });
    }
    room.debts.shift();
    collect(room);
  } else if (room.phase === 'fees') {
    const index = room.tiles.findIndex(tile => tile.id === input.tile && tile.owner === player.id);
    check(input.action === 'liquidate' && player.fee > 0 && index >= 0,'ขายได้เฉพาะบริษัทของคุณเมื่อค้างค่าบริหาร');
    const [{owner,deal,...tile}] = room.tiles.splice(index,1);
    room.reserve.push(tile);
    player.cash += 5;
    room.report[player.id].sold += 5;
    chargeFees(room);
  } else if (room.phase === 'review') {
    check(input.action === 'next' && player.id === 0,'ให้เจ้าห้องเริ่มการประมูล');
    const managers = room.players.filter(p => p.manager);
    room.reserve = shuffle(room.reserve);
    room.queue = room.reserve.splice(0,Math.max(0,managers.length*2-1));
    auctionNext(room,now);
  } else if (room.phase === 'auction') {
    const auction = room.auction;
    check(input.tile === auction.card.id && player.manager && !auction.passes.includes(player.id),'คุณเข้าร่วมประมูลใบนี้ไม่ได้');
    if (input.action === 'bid') {
      check(auction.bidder !== player.id,'คุณนำประมูลอยู่ รอให้มีคนเสนอราคาสูงกว่าก่อน');
      check(Number.isSafeInteger(input.price) && input.price > auction.bid && input.price <= player.cash,'เสนอให้สูงกว่าราคาล่าสุดและไม่เกินเงินสด');
      auction.bid = input.price;
      auction.bidder = player.id;
      room.deadline = now + 25_000;
    } else {
      check(input.action === 'pass' && auction.bidder !== player.id,'ผู้ที่นำประมูลอยู่กดผ่านไม่ได้');
      auction.passes.push(player.id);
    }
    if (room.players.filter(p => p.manager && p.id !== auction.bidder).every(p => auction.passes.includes(p.id))) closeAuction(room,now);
  } else {
    throw new Error('เกมจบแล้ว');
  }
}

function view(room,you) {
  const {phase,version,round,deadline,positions,rolls,rollingColor,tiles,offers,auction,messages,report,dual} = room;
  const players = room.players.map(({token,cash,...player}) => ({
    ...player,...(phase === 'done' || player.id === you ? {cash} : {})
  }));
  const debt = phase === 'settle' ? room.debts[0] : null;
  return {you,phase,version,round:round ?? null,deadline,positions,rolls,rollingColor,tiles,offers,auction,messages,players,report,dual,debt,
    reserve:room.reserve?.length,remaining:room.queue?.length,now:Date.now()};
}

export function wallRoom(code,authorization,input, roomStore = rooms) {
  const room = roomStore.get(code);
  const player = room?.players.find(player => 'Bearer ' + player.token === authorization);
  if (!player) return null;
  const now = Date.now();
  room.updated = now;
  maintain(room,now);
  if (input !== undefined) {
    act(room,player,input,now);
    room.version++;
  }
  return view(room,player.id);
}

export function maintainWallRooms(now, roomStore = rooms) {
  for (const [code,room] of roomStore) {
    if (now-room.updated > 7_200_000) roomStore.delete(code);
    else maintain(room,now);
  }
}
