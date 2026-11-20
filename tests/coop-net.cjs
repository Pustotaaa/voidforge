const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');
const {run}=createRuntime();
const out=JSON.parse(run(`JSON.stringify((()=>{
 const link=CoopNet.newLink();
 const ship={x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,modules:base(),systems:{assist:true}};
 const physics=FlightCore.shipPhysics(ship,types);
 const remote={id:'remote',x:0,y:0,vx:160,vy:0,angle:3.04};
 const snapshot={tick:10_000,ship,players:[remote],enemies:[],rocks:[],places:[]};
 link.receive(snapshot,0,500,physics);
 let immediate=0, before=0;
 for(let t=16;t<=496;t+=16){
  const p=link.local(snapshot,{x:0,y:-1,heading:0},t,physics);
  if(t===64)immediate=p.y;
  before=p.y;
 }
 const next={...snapshot,tick:10_500,ship:{...ship,y:-36,vy:-112},players:[{...remote,x:80,angle:-3.05}]};
 link.receive(next,500,500,physics);
 const after=link.local(next,{x:0,y:-1,heading:0},501,physics).y;
 const blended=link.remoteAt(725)(next.players[0]);
 let last;
 for(let t=516;t<=1900;t+=16)last=link.local(next,{x:0,y:-1,heading:0},t,physics);
 const later=link.local(next,{x:0,y:-1,heading:0},2400,physics);
 return {immediate,before,after,remote:blended.x,angle:blended.angle,ping:link.ping(),frozen:last.y===later.y,
  active:link.cadence(true,false,0,false),idle:link.cadence(false,false,0,false),background:link.cadence(false,true,0,false),
  retry:link.cadence(true,false,4,false)};
})())`));
assert.ok(out.immediate<0,'the ship starts moving before the first reply');
assert.ok(out.before<-9);
assert.ok(Math.abs(out.after-out.before)<4,'server reconciliation does not snap the ship');
assert.ok(out.remote>0&&out.remote<80,'remote pilot is interpolated');
assert.ok(Math.abs(out.angle)>3,'angle interpolation follows the shortest arc');
assert.equal(out.ping,500);
assert.ok(out.frozen,'prediction is bounded after a connection loss');
assert.ok(out.idle>out.active&&out.background>out.idle&&out.retry>out.active);
console.log('PASS 500 ms client prediction, smoothing, offline cutoff and request cadence');
