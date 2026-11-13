import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {companies,market,wallEnter,wallRoom} from '../src/wall-street.mjs';

test('company deck matches the documented mix', () => {
  assert.equal(companies.length,46);
  assert.equal(new Set(companies.map(tile => tile.id)).size,46);
  for (const color of Object.keys(market)) {
    assert.equal(companies.filter(tile => tile.color === color && tile.multiple === 1).length,color === 'red' ? 6 : 11);
    assert.equal(companies.filter(tile => tile.color === color && tile.multiple === 2).length,color === 'red' ? 1 : 2);
  }
});

function playRoom(t,count) {
  let now = Date.now();
  t.mock.method(Date,'now',() => now);
  const host = wallEnter({name:'Host',create:true});
  const seats = [host,...Array.from({length:count-1},(_,index) => wallEnter({name:'Guest '+index,code:host.code}))];
  const read = (id = 0) => wallRoom(host.code,'Bearer '+seats[id].token);
  const act = (id,action,data = {}) => {
    const {round,phase} = read(id);
    return wallRoom(host.code,'Bearer '+seats[id].token,{round,phase,action,...data});
  };
  const expire = () => {
    now = read().deadline;
    return read();
  };
  const finishMarket = () => {
    expire();
    for (const color of Object.keys(market)) {
      act(0,'roll-die',{color});
      expire();
    }
    return expire();
  };
  return {read,act,expire,finishMarket,code:host.code};
}

for (const count of [3,5,11]) {
  test('completes five months with ' + count + ' players',t => {
    const {read,act,expire,finishMarket,code} = playRoom(t,count);
    assert.equal(wallRoom(code,'Bearer invalid'),null);
    assert.throws(() => act(1,'start'),/เจ้าห้อง/);
    const game = act(0,'start');
    const managers = game.players.filter(player => player.manager);
    const investors = game.players.filter(player => player.investor);
    assert.equal(managers.length,count < 5 ? count : Math.floor(count/2));
    assert.equal(investors.length,count < 5 ? count : Math.ceil(count/2));
    assert.equal(game.tiles.length,managers.length * 3);
    assert.ok(game.tiles.every(tile => tile.multiple === 1));
    assert.equal(game.players.filter(player => 'cash' in player).length,1);
    assert.equal(game.phase,'pricing');
    expire();
    const tile = game.tiles[0];
    const buyer = investors.find(player => player.id !== tile.owner).id;
    const terms = {tile:tile.id,price:20};
    if (count < 5) assert.throws(() => act(tile.owner,'offer',terms),/ผู้อื่น/);
    act(buyer,'offer',terms);
    assert.throws(() => act(tile.owner,'accept',{...terms,price:19,investor:buyer}),/ผู้ซื้อเปลี่ยนราคาแล้ว/);
    const accepted = act(tile.owner,'accept',{...terms,investor:buyer});
    const close = {tile:tile.id,revision:accepted.tiles.find(company => company.id === tile.id).deal.revision};
    act(tile.owner,'close-deal',close);
    act(buyer,'close-deal',close);
    assert.throws(() => act(buyer,'withdraw',{tile:tile.id}),/ปิดดีล/);

    for (let round = 1; round <= 5; round++) {
      assert.equal(read().round,round);
      let summary = finishMarket();
      while (summary.phase === 'fees') {
        const owing = summary.players.find(player => player.fee > 0);
        const property = summary.tiles.find(tile => tile.owner === owing.id);
        summary = act(owing.id,'liquidate',{tile:property.id});
      }
      assert.equal(summary.phase,round === 5 ? 'done' : 'review');
      if (round === 1) {
        const expected = market[tile.color].track[summary.positions[tile.color]];
        assert.equal(summary.report[buyer].dividend,expected);
        assert.equal(summary.report[buyer].paid,20);
        assert.equal(summary.report[tile.owner].received,20);
      }
      if (round === 5) break;
      let auction = act(0,'next');
      if (round === 1) {
        const card = auction.auction.card;
        act(tile.owner,'bid',{tile:card.id,price:1});
        assert.throws(() => act(tile.owner,'bid',{tile:card.id,price:2}),/คุณนำประมูลอยู่/);
        assert.equal(read().auction.bid,1);
        const rival = managers.find(player => player.id !== tile.owner);
        act(rival.id,'bid',{tile:card.id,price:2});
        act(tile.owner,'bid',{tile:card.id,price:3});
        auction = expire();
        assert.equal(auction.tiles.find(property => property.id === card.id).owner,tile.owner);
      }
      while (auction.phase === 'auction') auction = expire();
      assert.equal(auction.phase,'pricing');
      expire();
      if (round === 1) {
        assert.equal(auction.tiles.find(property => property.id === tile.id).deal.closed,false);
        act(buyer,'withdraw',{tile:tile.id});
      }
    }
    assert.equal(read().players.filter(player => 'cash' in player).length,count);
  });
}

test('insufficient cash pauses settlement for the creditor',t => {
  const {act,expire,finishMarket} = playRoom(t,3);
  const game = act(0,'start');
  expire();
  const tile = game.tiles.find(tile => tile.owner === 1);
  const terms = {tile:tile.id,price:999};
  act(0,'offer',terms);
  act(1,'accept',{...terms,investor:0});
  const pending = finishMarket();
  assert.deepEqual(pending.debt,{investor:0,manager:1,total:999});
  assert.throws(() => act(0,'bankrupt',{investor:0}),/เจ้าหนี้/);
  const settled = act(1,'bankrupt',{investor:0});
  assert.equal(settled.phase,'review');
  assert.equal(settled.players[0].manager,true);
  assert.equal(settled.players[0].investor,false);
  assert.equal(settled.tiles.find(property => property.id === tile.id).deal,null);
});

test('both parties must press close on the same accepted deal',t => {
  const {act,expire} = playRoom(t,3);
  const game = act(0,'start');
  expire();
  const tile = game.tiles.find(tile => tile.owner === 0).id;
  act(1,'offer',{tile,price:3,closed:true});
  const accepted = act(0,'accept',{tile,investor:1,price:3,closed:true});
  const deal = accepted.tiles.find(company => company.id === tile).deal;
  assert.equal(deal.closed,false);
  const {revision} = deal;
  act(0,'request-lock',{tile,revision});
  const repeated = act(0,'close-deal',{tile,revision}).tiles.find(company => company.id === tile).deal;
  assert.equal(repeated.closed,false);
  assert.equal(repeated.lockRequestedBy,0);
  assert.throws(() => act(2,'close-deal',{tile,revision}),/ไม่ได้เป็นของคุณ/);
  act(1,'offer',{tile,price:5});
  const replaced = act(0,'accept',{tile,investor:1,price:5});
  assert.throws(() => act(1,'confirm-lock',{tile,revision}),/ดีลเปลี่ยนแล้ว/);
  const current = {tile,revision:replaced.tiles.find(company => company.id === tile).deal.revision};
  act(1,'close-deal',current);
  const locked = act(0,'confirm-lock',current).tiles.find(company => company.id === tile).deal;
  assert.equal(locked.closed,true);
  assert.equal(locked.price,5);
  assert.throws(() => act(1,'withdraw',{tile}),/ปิดดีล/);
});

test('opening prices are visible to investors and only managers count toward readiness',t => {
  const {read,act} = playRoom(t,5);
  const game = act(0,'start');
  assert.equal(game.deadline-game.now,60_000);
  const [first,second] = game.players.filter(player => player.manager);
  const investor = game.players.find(player => !player.manager);
  const tile = game.tiles.find(tile => tile.owner === first.id).id;
  const terms = {tile,price:15};
  assert.throws(() => act(second.id,'set-price',terms),/การ์ดของคุณ/);
  assert.throws(() => act(investor.id,'pricing-ready'),/ให้ผู้จัดการ/);
  act(first.id,'set-price',terms);
  act(first.id,'set-price',{tile,price:18});
  assert.equal(read(investor.id).tiles.find(company => company.id === tile).askingPrice,18);
  assert.equal(act(first.id,'pricing-ready').phase,'pricing');
  const trade = act(second.id,'pricing-ready');
  assert.equal(trade.phase,'trade');
  assert.equal(trade.deadline-trade.now,120_000);
  assert.equal(trade.tiles.find(company => company.id === tile).askingPrice,18);
});

test('host chooses the market dice order and each result is revealed before settlement',t => {
  const {read,act,expire} = playRoom(t,3);
  act(0,'start');
  expire();
  assert.equal(expire().phase,'market-roll');
  assert.throws(() => act(1,'roll-die',{color:'red'}),/เจ้าห้อง/);
  for (const color of ['red','green','blue','yellow']) {
    act(0,'roll-die',{color});
    assert.equal(read(1).rollingColor,color);
    assert.equal(read(1).rolls[color],undefined);
    assert.throws(() => act(0,'roll-die',{color}),/หยุดก่อน/);
    assert.ok(market[color].faces.includes(expire().rolls[color]));
  }
  assert.deepEqual(Object.keys(read().rolls),['red','green','blue','yellow']);
  assert.equal(expire().phase,'review');
});

test('Hub links the game and the server serves its UI, artwork and room API',async t => {
  const child = spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'}});
  t.after(() => child.kill());
  const [output] = await once(child.stdout,'data');
  const base = output.toString().trim().split(' ').at(-1);
  const get = async path => {
    const response = await fetch(base+path);
    assert.equal(response.status,200,path);
    return response;
  };
  assert.match(await (await get('/')).text(),/href="\/games\/panic-on-wall-street"/);
  const page = await get('/games/panic-on-wall-street');
  assert.equal(page.headers.get('cache-control'),'no-store');
  const html = await page.text();
  assert.match(html,/id="tile-filter"/);
  for (const asset of html.matchAll(/(?:src|href)="(\/wall-street\.(?:js|css)\?v=[^"]+)"/g)) {
    assert.equal((await get(asset[1])).headers.get('cache-control'),'no-store');
  }
  assert.match(html,/src="\/wall-street\.js\?v=/);
  assert.equal((await get('/assets/wall-street/cover.webp')).headers.get('content-type'),'image/webp');
  for (const color of Object.keys(market)) {
    const response = await get('/assets/wall-street/company-'+color+'.webp');
    assert.equal(response.headers.get('content-type'),'image/webp');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii',8,12),'WEBP');
  }
  const result = await fetch(base+'/api/wall-street/enter',{method:'POST',body:JSON.stringify({name:'Host',create:true})});
  assert.equal(result.status,200);
  const {code,token} = await result.json();
  const joined = await fetch(base+'/api/wall-street/room?code='+code,{headers:{Authorization:'Bearer '+token}});
  assert.equal(joined.status,200);
  assert.equal((await joined.json()).phase,'lobby');
});
