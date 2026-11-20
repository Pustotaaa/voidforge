const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');

async function main() {
 const requests=[];
 const seed=createRuntime();
 const ship=JSON.parse(seed.run(`JSON.stringify({
  layout:'wanderer',x:500,y:500,vx:0,vy:0,angle:0,angularVelocity:0,energy:100,heat:0,
  modules:base(),lostModules:[],cargo:{ore:180},systems:{assist:true,autoAim:true,shield:0,shells:160,rockets:6}
 })`));
 const roster=[
  {id:'host',name:'Игла',x:500,y:500,angle:0,vx:0,vy:0,angularVelocity:0,modules:ship.modules,online:true},
  {id:'other',name:'Кварц',x:550,y:520,angle:0,vx:0,vy:0,angularVelocity:0,modules:ship.modules,online:true}
 ];
 const state={
  code:'N6PD4Y',lease:'a'.repeat(32),you:'host',players:roster,ship,
  goal:90,total:8,cargo:{ore:8},cargoItems:['ore'],hold:180,maxHold:500,
  rocks:[{id:'r0',x:580,y:620,r:34,material:'ore',seed:1,ore:24,total:32}],events:[],actions:[],
  shots:[],places:[],fragments:[],enemies:[],inputSeq:0,
 };
 const {run,els}=createRuntime({coopFetch:async (url,options)=>{
  requests.push({url,options});
  if(url.endsWith('/health'))return Response.json({ready:true});
  if(url.endsWith('/leave'))return Response.json({left:true});
  if(url.endsWith('/profile'))return Response.json({id:'host',name:'Игла',ship,secret:'b'.repeat(64)});
  return Response.json(state);
 }});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const before=run('JSON.stringify(s)');
 assert.equal(run('launchState().phase'),'title');
 els.launchCoop.click();await settle();
 assert.equal(run('modal'),'coopModal');
 assert.equal(els.coopServer.textContent,'Сервер онлайн');
 els.closeCoop.click();assert.equal(run('modal'),'launchModal');
 els.launchCoop.click();
 els.coopName.value='Игла';els.coopCreate.click();await settle();
 assert.equal(run('sharedFlight.active()'),true);
 assert.equal(els.flightHud.hidden,true);
 assert.equal(els.coopHud.hidden,false);
 assert.equal(els.coopCount.textContent,'2 / 5');
 assert.equal(els.coopHold.textContent,'180 / 500');
 assert.equal(els.coopTotal.textContent,'8 / 90');
 assert.ok(requests.some(req=>req.url==='/api/v2/rooms'&&req.options.headers.Authorization==='Bearer '+'b'.repeat(64)));
 run('loop(100)');
 els.coopLeave.click();await settle();
 assert.equal(run('sharedFlight.active()'),false);
 assert.equal(els.coopHud.hidden,true);
 assert.ok(requests.some(req=>req.url.endsWith('/N6PD4Y/leave')));
 els.closeCoop.click();
 assert.equal(run('modal'),'launchModal');
 assert.equal(run('JSON.stringify(s)'),before);
 console.log('PASS built-in co-op creates a pilot, separates personal cargo from stock and returns to the solo save');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
