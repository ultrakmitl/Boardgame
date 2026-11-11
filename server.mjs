import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {start,nextRound,resolve,view} from './src/game.mjs';
import {bossEnter,bossRoom,maintainBossRooms} from './src/boss-game.mjs';
import {skullEnter,skullRoom,maintainSkullRooms} from './src/skull-game.mjs';
import {petsEnter,petsRoom,maintainPetsRooms} from './src/pets-game.mjs';

const rooms = new Map();
const token = () => randomBytes(24).toString('base64url');
const assets = new Map(Object.entries({
  '/games/power-hungry-pets':'pets.html','/pets.js':'pets.js','/pets.css':'pets.css',
  '/pets-cards.js':'pets-cards.js','/assets/pets/characters.png':'assets/pets/characters.png',
  '/assets/pets/cover.png':'assets/pets/cover.png',
  '/':'hub.html','/games/incan-gold':'index.html','/app.js':'app.js','/style.css':'style.css',
  '/games/im-the-boss':'boss-online.html','/games/im-the-boss/demo':'boss.html',
  '/games/skull':'skull.html','/skull.css':'skull.css','/skull.js':'skull.js',
  '/skull-online.css':'skull-online.css',
  '/boss-online.js':'boss-online.js','/boss-online.css':'boss-online.css','/boss-rules.js':'boss-rules.js',
  '/assets/machu.jpg':'assets/machu.jpg'
}));
const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
const incanArtwork = /^\/assets\/incan\/(?:cover|lobby|treasure|hazard|artifact)\.webp$/;
const bossArtwork = /^\/assets\/boss\/(?:cards\/[a-z]+(?:-[a-z]+)?(?:-v2)?|investors\/investor-[a-z]+|deals\/deal-(?:0[1-9]|1[0-5])-(?:front|back))\.png$/;
const skullArtwork = /^\/assets\/skull\/(?:cover|set-[1-6])\.png$/;
function send(res,status,value) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length>4096) throw Error('คำขอยาวเกินไป');
  }
  return JSON.parse(data);
}
function enter(input) {
  const name = typeof input.name==='string' ? input.name.trim() : '';
  if (!name || name.length>24) throw Error('กรอกชื่อเล่น 1–24 ตัวอักษร');
  let room = rooms.get(input.code);
  if (input.create===true) {
    if (rooms.size>=500) throw Error('เซิร์ฟเวอร์มีห้องเต็มแล้ว');
    let code;
    do { code=randomBytes(4).toString('hex').toUpperCase(); } while(rooms.has(code));
    room = {code,players:[],phase:'lobby',turn:0,decisions:new Map(),updated:Date.now()};
    rooms.set(code,room);
  }
  if (!room) throw Error('ไม่พบห้องนี้');
  if (room.phase!=='lobby' || room.players.length>=8) throw Error('ห้องเต็มหรือเริ่มเกมแล้ว');
  if (room.players.some(p=>p.name===name)) throw Error('ชื่อนี้มีคนใช้แล้ว');
  const player = {id:token(),name,seen:Date.now()};
  room.players.push(player);
  room.host ??= player.id;
  room.updated = Date.now();
  return {code:room.code,token:player.id};
}
export const server = createServer(async (req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if (req.method==='GET' && url.pathname==='/games/im-the-boss/') {
    res.writeHead(302,{Location:'/games/im-the-boss'+url.search});
    return res.end();
  }
  if (req.method==='GET' && (url.pathname==='/games/incan-gold/' ||
      (url.pathname==='/' && url.searchParams.has('room')))) {
    res.writeHead(302,{Location:'/games/incan-gold'+url.search});
    return res.end();
  }
  const file = assets.get(url.pathname) ??
    (incanArtwork.test(url.pathname) || bossArtwork.test(url.pathname) || skullArtwork.test(url.pathname) ?
      url.pathname.slice(1) : undefined);
  if (file && req.method==='GET') {
    try {
      const bytes = await readFile(new URL('./public/'+file,import.meta.url));
      res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff'});
      return res.end(bytes);
    } catch { return send(res,404,{error:'ไม่พบไฟล์'}); }
  }
  try {
    if (url.pathname==='/api/pets/enter' && req.method==='POST') return send(res,200,petsEnter(await body(req)));
    if (url.pathname==='/api/pets/room' && ['GET','POST'].includes(req.method)) {
      const input=req.method==='POST' ? await body(req) : null;
      const state=petsRoom(url.searchParams.get('code'),req.headers.authorization,input);
      return state ? send(res,200,state) : send(res,401,{error:'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'});
    }
    if (url.pathname==='/api/skull/enter' && req.method==='POST') return send(res,200,skullEnter(await body(req)));
    if (url.pathname==='/api/skull/room' && ['GET','POST'].includes(req.method)) {
      const input=req.method==='POST' ? await body(req) : null;
      const state=skullRoom(url.searchParams.get('code'),req.headers.authorization,input);
      return state ? send(res,200,state) : send(res,401,{error:'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'});
    }
    if (url.pathname==='/api/boss/enter' && req.method==='POST') return send(res,200,bossEnter(await body(req)));
    if (url.pathname==='/api/boss/room' && ['GET','POST'].includes(req.method)) {
      const input=req.method==='POST' ? await body(req) : null;
      const state=bossRoom(url.searchParams.get('code'),req.headers.authorization,input);
      return state ? send(res,200,state) : send(res,401,{error:'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'});
    }
    if (url.pathname==='/api/enter' && req.method==='POST') return send(res,200,enter(await body(req)));
    if (url.pathname!=='/api/room' || !['GET','POST'].includes(req.method)) return send(res,404,{error:'ไม่พบหน้า'});
    const input = req.method==='POST' ? await body(req) : {};
    const room = rooms.get(url.searchParams.get('code'));
    const player = room?.players.find(p=>'Bearer '+p.id===req.headers.authorization);
    if (!player) return send(res,401,{error:'เซสชันหมดอายุ กรุณาเข้าห้องใหม่'});
    room.updated = player.seen = Date.now();
    if (req.method==='POST') {
      if (room.phase==='playing' && Date.now()>=room.deadline) resolve(room);
      if (input.turn!==room.turn) return send(res,409,{error:'ตานี้จบแล้ว'});
      if (input.action==='choose' && room.phase==='playing' && player.active &&
          !room.decisions.has(player.id) && ['exit','explore'].includes(input.choice)) {
        room.decisions.set(player.id,input.choice);
        if (room.players.every(p=>!p.active || room.decisions.has(p.id))) resolve(room);
      } else if (room.host===player.id && input.action==='start' &&
          ['lobby','finished'].includes(room.phase) && room.players.length>=3) {
        start(room);
      } else if (room.host===player.id && input.action==='next' && room.phase==='intermission') {
        nextRound(room);
      } else return send(res,409,{error:'คำสั่งนี้ใช้ไม่ได้ในตอนนี้'});
    }
    send(res,200,view(room,player));
  } catch (error) { send(res,400,{error:error instanceof SyntaxError ? 'คำขอไม่ถูกต้อง' : error.message}); }
});
setInterval(()=>{
  const now = Date.now();
  maintainBossRooms(now);
  maintainSkullRooms(now);
  maintainPetsRooms(now);
  for (const [code,room] of rooms) {
    if (now-room.updated>3600000) { rooms.delete(code); continue; }
    const host = room.players.find(p=>p.id===room.host);
    if (now-host.seen>45000) {
      const replacement = room.players.find(p=>now-p.seen<12000);
      if (replacement) room.host = replacement.id;
    }
    if (room.phase==='playing' && now>=room.deadline) resolve(room);
  }
},1000).unref();

server.listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>{
  console.log('Local URL http://127.0.0.1:'+server.address().port);
});
