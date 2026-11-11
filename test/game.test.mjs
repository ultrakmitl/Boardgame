import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {draw,resolve,view} from '../src/game.mjs';

test('treasure remainder, simultaneous exits, solo artifact and repeated hazard',()=>{
  const players = Array.from({length:4},(_,i)=>({id:i,active:true,carry:0,bank:0,bonus:0,artifacts:0}));
  const artifact = {kind:'artifact',value:5};
  const hazard = {kind:'hazard',value:'งู'};
  const room = {players,round:1,turn:0,leftovers:0,path:[artifact],
    deck:[hazard,hazard,{kind:'treasure',value:11}],decisions:new Map(),phase:'playing'};
  draw(room);
  assert.equal(room.leftovers,3);
  assert.deepEqual(players.map(p=>p.carry),[2,2,2,2]);
  room.decisions = new Map([[0,'exit'],[1,'exit'],[2,'explore'],[3,'explore']]);
  assert.equal(view(room,players[1]).revealed,undefined);
  assert.equal(view(room,players[1]).players[0].bank,undefined);
  resolve(room);
  assert.equal(room.leftovers,1);
  assert.equal(players[0].bank,3);
  assert.equal(artifact.claimed,undefined);
  room.decisions = new Map([[2,'exit'],[3,'explore']]);
  resolve(room);
  assert.equal(players[2].bank,3);
  assert.equal(players[2].bonus,5);
  assert.equal(players[3].bank,0);
  assert.equal(players[3].carry,0);
  const publicPlayers = view(room,players[3]).players;
  assert.deepEqual(publicPlayers[0].outcome,{kind:'exit',carried:2,share:1});
  assert.deepEqual(publicPlayers[3].outcome,{kind:'hazard',lost:2});
  assert.equal(publicPlayers[0].bank,undefined);
  assert.deepEqual(players[2].roundScores,[{gems:3,artifacts:5}]);
  assert.deepEqual(players[3].roundScores,[{gems:0,artifacts:0}]);
  assert.deepEqual(view(room,players[3]).deckInfo,{treasures:1,removedHazards:{'งู':1}});
  assert.equal(room.deck.filter(c=>c.kind==='hazard').length,1);
  assert.equal(room.phase,'intermission');
});

test('three independent sessions use one invite, reload and finish five rounds',async t=>{
  const processServer = spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'}});
  t.after(()=>processServer.kill());
  const [output] = await once(processServer.stdout,'data');
  const base = output.toString().trim().split(' ').at(-1);
  async function request(route,input,token) {
    const response = await fetch(base+route,{
      headers:token?{Authorization:'Bearer '+token}:{},
      ...(input?{method:'POST',body:JSON.stringify(input)}:{})
    });
    return {status:response.status,data:await response.json()};
  }
  const {data:host} = await request('/api/enter',{name:'หนึ่ง',create:true});
  const invite = '/games/incan-gold?room='+host.code;
  assert.match(await (await fetch(base)).text(), /href="\/games\/incan-gold"/);
  assert.match(await (await fetch(base+invite)).text(), /id="entry"/);
  assert.equal((await fetch(base+'/?room='+host.code)).url,base+invite);
  const sessions = [host];
  for (const name of ['สอง','สาม']) {
    const {data} = await request('/api/enter',{name,code:new URL(invite,base).searchParams.get('room')});
    sessions.push(data);
  }
  const route = '/api/room?code='+host.code;
  const read = async player=>(await request(route,null,player.token)).data;
  const act = (player,turn,action,choice)=>request(route,{turn,action,choice},player.token);
  assert.equal((await act(sessions[1],0,'start')).status,409);
  assert.equal((await act(host,0,'start')).status,200);
  for(let round=1;round<=5;round++) {
    const state = await read(host);
    assert.equal(state.round,round);
    assert.ok([14,15].includes(state.deckInfo.treasures));
    assert.equal(state.standings,undefined);
    assert.ok(state.players.every(player=>player.outcome===null));
    assert.equal(state.introduced.value,[5,7,8,10,12][round-1]);
    assert.equal(state.deck,undefined);
    assert.equal((await act(host,state.turn,'choose','exit')).status,200);
    assert.equal((await read(host)).you.choice,'exit');
    assert.equal((await act(host,state.turn,'choose','explore')).status,409);
    const otherView = await read(sessions[1]);
    assert.deepEqual(otherView.revealed,[]);
    assert.equal(otherView.you.choice,undefined);
    for(const player of sessions.slice(1)) assert.equal((await act(player,state.turn,'choose','exit')).status,200);
    assert.equal((await act(host,state.turn,'choose','exit')).status,409);
    const end = await read(host);
    assert.equal(end.phase,round===5?'finished':'intermission');
    if(round<5) assert.equal((await act(host,end.turn,'next')).status,200);
    else {
      assert.equal(end.standings.length,3);
      for (const player of end.standings) {
        assert.equal(player.rounds.length,5);
        assert.equal(player.gems,player.rounds.reduce((sum,round)=>sum+round.gems,0));
        assert.equal(player.artifactPoints,player.rounds.reduce((sum,round)=>sum+round.artifacts,0));
        assert.equal(player.score,player.gems+player.artifactPoints);
      }
    }
  }
});
