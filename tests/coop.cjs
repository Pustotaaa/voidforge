const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime.cjs');

async function main() {
 const requests=[];
 const roster=[
  {id:'host',name:'Игла',slot:0,x:500,y:500,angle:0,online:true,mined:0},
  {id:'other',name:'Кварц',slot:1,x:550,y:520,angle:0,online:true,mined:8}
 ];
 const state={
  code:'N6PD4Y',token:'a'.repeat(48),you:'host',players:roster,
  field:{width:2300,height:1650,range:220,speed:265},goal:90,total:8,cargo:{iron:8,crystal:0,ice:0},
  rocks:[{id:'r0',x:580,y:620,kind:'iron',size:2,radius:34,left:24,total:32}],events:[]
 };
 const {run,els}=createRuntime({coopFetch:async (url,options)=>{
  requests.push({url,options});
  if(url.endsWith('/health'))return Response.json({ready:true});
  if(url.endsWith('/leave'))return Response.json({left:true});
  return Response.json(state);
 }});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const before=run('JSON.stringify(s)');
 assert.equal(run('launchState().phase'),'title');
 els.launchCoop.click();
 await settle();
 assert.equal(run('modal'),'coopModal');
 assert.equal(els.coopServer.textContent,'Сервер онлайн');
 els.closeCoop.click();
 assert.equal(run('modal'),'launchModal');
 els.launchCoop.click();
 els.coopName.value='Игла';
 els.coopCreate.click();
 await settle();
 assert.equal(run('sharedFlight.active()'),true);
 assert.equal(els.flightHud.hidden,true);
 assert.equal(els.coopHud.hidden,false);
 assert.equal(els.coopCount.textContent,'2 / 5');
 assert.equal(els.coopTotal.textContent,'8 / 90');
 assert.ok(requests.some(req=>req.url.endsWith('/api/rooms')&&req.options.credentials==='omit'));
 run("loop(100); c.onpointerdown({button:0,clientX:innerWidth/2+49.6,clientY:innerHeight/2+74.4,preventDefault(){}})");
 assert.equal(els.coopMine.textContent,'Стоп добычи');
 els.coopLeave.click();
 await settle();
 assert.equal(run('sharedFlight.active()'),false);
 assert.equal(els.coopHud.hidden,true);
 assert.ok(requests.some(req=>req.url.endsWith('/N6PD4Y/leave')));
 els.closeCoop.click();
 assert.equal(run('modal'),'launchModal');
 assert.equal(run('JSON.stringify(s)'),before);
 console.log('PASS built-in co-op opens from the title, uses shared cargo, draws and selects asteroids, and returns with the solo save intact');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
