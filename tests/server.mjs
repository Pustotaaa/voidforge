import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker,{FlightCore,CATALOG,makeShip,makeRoom,makePilot,stepRoom} from '../dist/server/index.js';

function database() {
 const sqlite=new DatabaseSync(':memory:');
 const db={
  prepare(sql) {
   const statement=sqlite.prepare(sql);
   return {bind(...args) {
    const execute=()=>{
     const before=sqlite.prepare('SELECT total_changes() AS count').get().count;
     statement.run(...args);
     return {meta:{changes:sqlite.prepare('SELECT total_changes() AS count').get().count-before}};
    };
    return {
     execute, async run(){return execute();}, async first(){return statement.get(...args)??null;},
     async all(){return {results:statement.all(...args)};},
    };
   }};
  },
  async batch(requests) {
   sqlite.exec('BEGIN');
   try {
    const results=requests.map(request=>request.execute());
    sqlite.exec('COMMIT');
    return results;
   } catch (error) {sqlite.exec('ROLLBACK');throw error;}
  },
 };
 return {db,sqlite};
}
async function call(db,method,path,key,body) {
 const headers={};
 if(key)headers.authorization='Bearer '+key;
 if(body!==undefined)headers['content-type']='application/json';
 const response=await worker.fetch(new Request('https://voidforge.example/api/v2'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{DB:db});
 const data=await response.json();
 return {status:response.status,data};
}

test('room uses the flight engine at the same simulation cadence',()=>{
 const world=makeRoom(1_000);
 world.rocks=[];world.enemies=[];
 const ship=makeShip('courier');
 const p=makePilot({id:'test',name:'Кварц',ship:JSON.stringify(ship)},world,1000,'test');
 const input={x:.52,y:-.85,heading:1.3,fire:false};
 p.input=input;world.players.push(p);
 const solo=structuredClone(p.ship);
 for(let tick=1;tick<=24;tick++){
  const cargo=Object.entries(CATALOG.goods).reduce((sum,[item,good])=>sum+(solo.cargo[item]??solo.systems[item]??0)*good.mass,0);
  const phys=FlightCore.shipPhysics(solo,CATALOG.types,cargo,solo.systems.power);
  FlightCore.applyManualFlight(solo,input,input.heading,true,phys,FlightCore.speedLimit(phys),FlightCore.STEP);
  FlightCore.integrate(solo,FlightCore.STEP);
  stepRoom(world,1000+tick*1000/60);
 }
 for(const key of ['x','y','vx','vy','angle','angularVelocity'])assert.ok(Math.abs(solo[key]-p.ship[key])<1e-8,key);
});

test('gameplay updates the shared battle, conserves cargo, and saves the pilot through room changes',async()=>{
 const {db,sqlite}=database();
 sqlite.exec(await readFile(new URL('../drizzle/0000_flight.sql',import.meta.url),'utf8'));
 const original=Date.now;
 let now=200_000;
 Date.now=()=>now;
 try {
  assert.equal((await call(db,'GET','/health')).data.protocol,2);
  const one=(await call(db,'POST','/profile',null,{name:'Игла',layout:'courier'})).data;
  const two=(await call(db,'POST','/profile',null,{name:'Кварц'})).data;
  assert.equal(one.ship.layout,'courier');
  assert.equal((await call(db,'GET','/profile','d'.repeat(64))).status,401);
  const creation=await call(db,'POST','/rooms',one.secret,{});
  assert.equal(creation.status,201);
  let host=creation.data;
  const path='/rooms/'+host.code;
  const joined=await call(db,'POST',path+'/join',two.secret,{});
  assert.equal(joined.status,200);
  let guest=joined.data;
  assert.equal(guest.players.length,2);
  assert.ok(!JSON.stringify(guest).includes(one.secret));
  async function sync(key,player,input={}){
   const next=await call(db,'POST',path+'/sync',key,{lease:player.lease,seq:player.inputSeq+1,...input});
   assert.equal(next.status,200,JSON.stringify(next.data));
   return next.data;
  }
  const transactions=[
   {id:'take-cargo-1',type:'deposit',item:'ore',amount:18},
   {id:'mount-cargo-1',type:'build',item:'cargo',x:2,y:0}
  ];
  host=await sync(one.secret,host,{actions:transactions});
  assert.equal(host.ship.cargo.ore,112);
  assert.equal(host.hold,112);
  assert.equal(host.maxHold,700);
  guest=await sync(two.secret,guest);
  assert.equal(guest.cargo.ore,18);
  host=await sync(one.secret,host,{actions:transactions});
  assert.equal(host.ship.cargo.ore,112);
  assert.equal(host.cargo.ore,18);
  host=await sync(one.secret,host,{actions:[{id:'bad-ammo-1',type:'rearm',item:'__proto__'}]});
  assert.equal(host.ship.credit,300);
  assert.equal(host.actions.find(action=>action.id==='bad-ammo-1').ok,false);

  const row=sqlite.prepare('SELECT state FROM flight_rooms WHERE code=?').get(host.code);
  const world=JSON.parse(row.state), ship=world.players[0].ship, visitor=world.players[1].ship;
  Object.assign(ship,{x:800,y:1000,angle:0});
  Object.assign(visitor,{x:880,y:1040,angle:0});
  world.enemies=world.enemies.filter(enemy=>enemy.id==='scout');
  const enemy=world.enemies[0];
  Object.assign(enemy,{x:800,y:830,home:{x:800,y:830},angle:Math.PI,shield:0});
  world.rocks=[];
  sqlite.prepare('UPDATE flight_rooms SET state=? WHERE code=?').run(JSON.stringify(world),host.code);
  const originalHeat=enemy.modules.reduce((sum,module)=>sum+module.hp,0);
  const shells=host.ship.systems.shells;
  for(let i=0;i<10;i++){
   now+=180;
   host=await sync(one.secret,host,{heading:0,fire:true});
   guest=await sync(two.secret,guest);
  }
  assert.ok(host.ship.systems.shells<shells);
  const readEnemy=view=>view.enemies[0].modules.reduce((sum,module)=>sum+module.hp,0);
  assert.ok(readEnemy(host)<originalHeat);
  assert.equal(readEnemy(guest),readEnemy(host));

  const revised=JSON.parse(sqlite.prepare('SELECT state FROM flight_rooms WHERE code=?').get(host.code).state);
  const miner=revised.players[0].ship, other=revised.players[1].ship;
  Object.assign(miner,{x:700,y:700,vx:0,vy:0,energy:100,heat:0,angle:0});
  revised.players[0].input.fire=false;
  Object.assign(other,{x:950,y:970,vx:0,vy:0});
  revised.enemies=[];revised.shots=[];
  revised.rocks=[{id:'shared-rock',x:700,y:510,r:32,seed:2,ore:6,material:'ore'}];
  sqlite.prepare('UPDATE flight_rooms SET state=? WHERE code=?').run(JSON.stringify(revised),host.code);
  host=await sync(one.secret,host,{actions:[{id:'mine-ore-1',type:'mine',item:'shared-rock'}]});
  for(let step=0;step<12;step++){
   now+=180;
   host=await sync(one.secret,host);
   guest=await sync(two.secret,guest);
  }
  assert.equal(host.rocks[0].ore,0);
  assert.equal(guest.rocks[0].ore,0);
  assert.equal(host.ship.cargo.ore+guest.ship.cargo.ore,298);
  assert.equal(host.cargo.ore,18);
  assert.equal(host.ship.mined,6);

  const reopened=await call(db,'GET','/profile',one.secret);
  assert.equal(reopened.data.ship.cargo.ore,118);
  assert.ok(reopened.data.ship.modules.some(module=>module.type==='cargo'));
  assert.equal(reopened.data.ship.systems.shells,host.ship.systems.shells);
  assert.equal(reopened.data.room,host.code);
  const moved=await call(db,'POST','/rooms',one.secret,{});
  assert.equal(moved.status,201);
  assert.notEqual(moved.data.code,host.code);
  assert.equal(moved.data.ship.cargo.ore,118);
  assert.ok(moved.data.ship.modules.some(module=>module.type==='cargo'));
  assert.equal((await call(db,'POST',path+'/sync',one.secret,{lease:host.lease,seq:1000})).status,409);
  const exit=await call(db,'POST','/rooms/'+moved.data.code+'/leave',one.secret,{lease:moved.data.lease});
  assert.equal(exit.status,200);
  assert.equal((await call(db,'GET','/profile',one.secret)).data.room,null);
  assert.equal((await call(db,'GET','/profile',one.secret)).data.ship.cargo.ore,118);
 } finally {
  Date.now=original;
  sqlite.close();
 }
});
