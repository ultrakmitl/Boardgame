import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {bossEnter,bossRoom} from '../src/boss-game.mjs';
import {art,board,colors} from '../public/boss-rules.js';

function table(count) {
  const host=bossEnter({name:'A',create:true});
  const sessions=[host,...Array.from({length:count-1},(_,i)=>bossEnter({name:String.fromCharCode(66+i),code:host.code}))];
  const auth=seat=>'Bearer '+sessions[seat].token;
  const read=(seat=0)=>bossRoom(host.code,auth(seat));
  const act=(seat,action,fields={})=>{
    const {turn,window}=read(seat);
    return bossRoom(host.code,auth(seat),{turn,window:window?.id,action,...fields});
  };
  return {host,read,act};
}

test('three sessions have private hands, starting placards, and legal roll and draw turns',()=>{
  const {host,read,act}=table(3);
  assert.equal(bossRoom(host.code,'Bearer invalid'),null);
  assert.throws(()=>act(1,'start'));
  let state=act(0,'start');
  const first=state.actor;
  const right=(first+2)%3;
  assert.equal(state.deckCount,83);
  assert.deepEqual(state.owners.map((owner,_,all)=>all.filter(value=>value===owner).length),Array(6).fill(2));
  const hands=[0,1,2].flatMap(seat=>read(seat).hand.map(card=>card.id));
  assert.equal(new Set(hands).size,15);
  assert.equal(state.players[1].money,undefined);
  assert.ok(!JSON.stringify(state).includes(host.token));
  assert.throws(()=>act(first,'place',{position:0}));
  act(right,'place',{position:0});
  assert.throws(()=>act(first,'draw'));
  state=act(first,'roll');
  assert.equal(state.roll.path.length,state.roll.face);
  assert.equal(state.position,state.roll.face);
  assert.throws(()=>act(first,'roll'));
  state=act(first,'draw');
  assert.equal(state.hand.length,8);
  assert.equal(state.actor,(first+1)%3);
});

test('six human seats negotiate from the first deal through the endgame',()=>{
  const {read,act}=table(6);
  const start=act(0,'start');
  act((start.actor+5)%6,'place',{position:0});
  let issued=0;
  while (read().phase!=='finished') {
    const before=read();
    const boss=before.actor;
    const state=act(boss,'open');
    const tile=board[state.position];
    const required=tile.groups.flatMap(group=>group.teams.slice(0,group.count));
    const choices=required.map(team=>'p'+team);
    assert.throws(()=>act(boss,'close',{choices:[]}));
    for (const team of required) {
      const seat=state.owners[team];
      if (seat===boss) continue;
      const target='p'+team;
      const offer=act(boss,'offer',{target,amount:1}).offers[target];
      assert.throws(()=>act(boss,'reply',{target,offer:offer.id,accept:true}));
      act(seat,'reply',{target,offer:offer.id,accept:true});
    }
    const closing=act(boss,'close',{choices});
    assert.equal(closing.window.kind,'close');
    assert.throws(()=>act(boss,'fail'));
    for (let seat=0;seat<6;seat++) act(seat,'pass');
    const after=read();
    issued+=tile.shares*state.rate;
    assert.equal(after.closed[state.position],after.completed);
    assert.equal([0,1,2,3,4,5].reduce((sum,seat)=>sum+read(seat).players[seat].money,0),issued);
    if (after.phase!=='finished') {
      assert.equal(after.actor,(boss+1)%6);
      assert.equal(after.closed[after.position],null);
    }
  }
  const finished=read();
  assert.ok(finished.completed>=10 && finished.completed<=15);
  assert.ok(finished.players.every(player=>Number.isInteger(player.money)));
});

test('Hub and online room routes serve the invite, scripts and artwork',async t=>{
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'}});
  t.after(()=>child.kill());
  const [output]=await once(child.stdout,'data');
  const base=output.toString().trim().split(' ').at(-1);
  const get=path=>fetch(base+path);
  const enter=async data=>{
    const response=await fetch(base+'/api/boss/enter',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
    });
    assert.equal(response.status,200);
    return response.json();
  };
  const hub=await (await get('/')).text();
  assert.match(hub,/href="\/games\/im-the-boss"/);
  assert.match(hub,/src="\/assets\/boss\/cards\/boardroom\.png"/);
  const host=await enter({name:'Host',create:true});
  const guest=await enter({name:'Guest',code:host.code});
  await enter({name:'Third',code:host.code});
  const online=await (await get('/games/im-the-boss?room='+host.code)).text();
  assert.match(online,/src="\/boss-online.js"/);
  assert.match(online,/<a class="hub-link" href="\/">← กลับโต๊ะเกม<\/a>/);
  assert.match(online,/id="invite-url" readonly/);
  for (const [color] of colors) {
    const badge=await get(art('cards','badge-'+color));
    assert.equal(badge.status,200,color);
    assert.equal(badge.headers.get('content-type'),'image/png',color);
    await badge.arrayBuffer();
  }
  for (const asset of ['/boss-online.js','/boss-rules.js','/boss-online.css','/assets/boss/cards/boardroom.png','/assets/boss/cards/influence-back.png']) {
    const response=await get(asset);
    assert.equal(response.status,200,asset);
    await response.arrayBuffer();
  }
  const path='/api/boss/room?code='+host.code;
  assert.equal((await get(path)).status,401);
  const start=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+host.token},body:JSON.stringify({turn:0,action:'start'})});
  assert.equal(start.status,200);
  const hostState=await start.json();
  const reloaded=await fetch(base+path,{headers:{Authorization:'Bearer '+guest.token}});
  const guestState=await reloaded.json();
  assert.equal(guestState.phase,'place');
  assert.equal(guestState.hand.length,5);
  assert.equal(hostState.hand.some(card=>guestState.hand.some(entry=>entry.id===card.id)),false);
});
