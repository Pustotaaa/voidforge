'use strict';

// Cosmetic state belongs to the renderer. Neither the save nor the flight
// simulation uses the effect clock or its random seed.
const ACCENT_EFFECTS={
 kinetic:{count:12,speed:165,life:.22,size:2,ring:18},
 plasma:{count:19,speed:94,life:.42,size:3,ring:26},
 explosive:{count:33,speed:220,life:.57,size:4,ring:52},
 emp:{count:15,speed:128,life:.34,size:2,ring:41},
 shield:{count:19,speed:145,life:.29,size:2,ring:34},
 ore:{count:11,speed:67,life:.38,size:2,ring:13},
 break:{count:20,speed:184,life:.52,size:3,ring:36},
 core:{count:48,speed:242,life:.8,size:5,ring:112},
 dash:{count:22,speed:218,life:.36,size:2,ring:43}
};
const MAX_WAVES=36,MAX_ECHOES=5;
let sparks=[],waves=[],echoes=[],jumpTime=0,renderTime=0,fxSeed=131,echoIn=0;

const fxBudget=()=>reduceMotion?64:W<640?144:280;
function effectNoise() {
 fxSeed=(fxSeed*1664525+1013904223)>>>0;
 return fxSeed/4294967296;
}
function clearEffects() {
 sparks=[];waves=[];echoes=[];jumpTime=0;renderTime=0;echoIn=0;fxSeed=131;
}
function effectBurst(point,kind='kinetic',angle=null) {
 if(W>0&&distance(view,point)>Math.hypot(W,H)*.8+170)return;
 const profile=ACCENT_EFFECTS[kind]||ACCENT_EFFECTS.kinetic;
 const total=reduceMotion?Math.min(profile.count,5):W<640?Math.ceil(profile.count*.72):profile.count;
 const over=Math.max(0,sparks.length+total-fxBudget());
 if(over)sparks.splice(0,over);
 for(let i=0;i<total;i++){
  const bearing=angle===null?effectNoise()*Math.PI*2:angle+(effectNoise()-.5)*1.55;
  const speed=profile.speed*(.3+effectNoise()*.9);
  const life=profile.life*(.57+effectNoise()*.55);
  sparks.push({x:point.x,y:point.y,vx:Math.cos(bearing)*speed,vy:Math.sin(bearing)*speed,
   maxLife:life,life,size:1+Math.floor(effectNoise()*profile.size),kind});
 }
 const life=profile.life*.83;
 waves.push({x:point.x,y:point.y,maxLife:life,life,radius:profile.ring,kind,angle});
 if(waves.length>MAX_WAVES)waves.shift();
}
function shieldFeedback(ship,point,force) {
 if(force<2)return;
 effectBurst(point,'shield',Math.atan2(point.y-ship.y,point.x-ship.x));
}
function dashFeedback(dash) {
 effectBurst(s,'dash',Math.atan2(-dash.y,-dash.x));
 echoIn=0;
}
function jumpFeedback() {
 clearEffects();syncFlightPose();exhaust=[];
 jumpTime=.86;
 playSound('gate');
}
function tickEffects(dt) {
 renderTime+=dt;jumpTime=Math.max(0,jumpTime-dt);
 for(const p of sparks) {
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
  const drag=1-dt*(p.kind==='ore'?1.4:2.1);
  p.vx*=drag;p.vy*=drag;
 }
 for(const p of waves)p.life-=dt;
 for(const p of echoes)p.life-=dt;
 sparks=sparks.filter(p=>p.life>0).slice(-fxBudget());
 waves=waves.filter(p=>p.life>0);echoes=echoes.filter(p=>p.life>0);
 if(reduceMotion||!actState().dash||paused||modal||s.dead)return;
 echoIn-=dt;
 if(echoIn>0)return;
 echoIn=.046;
 const tiles=s.modules.map(m=>({x:m.x,y:m.y}));
 echoes.push({x:s.x,y:s.y,angle:s.angle,tiles,life:.22});
 if(echoes.length>MAX_ECHOES)echoes.shift();
}

function drawDashEchoes() {
 ctx.save();ctx.strokeStyle='#fff';ctx.setLineDash([1,3]);
 for(const ghost of echoes) {
  ctx.save();ctx.translate(ghost.x,ghost.y);ctx.rotate(ghost.angle);
  const stride=ghost.life<.085?4:ghost.life<.16?2:1;
  for(let i=0;i<ghost.tiles.length;i+=stride){
   const tile=ghost.tiles[i];
   ctx.strokeRect(tile.x*20-8,tile.y*20-8,16,16);
  }
  ctx.restore();
 }
 ctx.restore();
}

function drawImpactEffects() {
 ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 for(const w of waves) {
  const age=1-w.life/w.maxLife,radius=w.radius*Math.max(.08,age);
  if(w.kind==='shield') {
   ctx.beginPath();
   for(let j=0;j<5;j++) {
    const a=w.angle-.84+j*.42,x=w.x+Math.cos(a)*radius,y=w.y+Math.sin(a)*radius;
    if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    if(age<.75)ctx.fillRect(Math.round(x)-1,Math.round(y)-1,3,3);
   }
   ctx.stroke();
  } else {
   ctx.setLineDash(w.kind==='emp'?[2,3]:age<.4?[]:[1,6]);
   ctx.beginPath();ctx.arc(w.x,w.y,radius,0,Math.PI*2);ctx.stroke();
   if(w.kind==='core'||w.kind==='explosive'||w.kind==='emp') {
    ctx.beginPath();ctx.arc(w.x,w.y,radius*.61,0,Math.PI*2);ctx.stroke();
   }
   ctx.setLineDash([]);
  }
 }
 for(const p of sparks) {
  const life=p.life/p.maxLife;
  if(p.kind==='emp'||p.kind==='kinetic'||p.kind==='dash') {
   ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.054*life,p.y-p.vy*.054*life);ctx.stroke();
  } else {
   const size=Math.max(1,Math.ceil(p.size*life));
   ctx.fillRect(Math.round(p.x),Math.round(p.y),size,size);
  }
 }
 ctx.restore();
}

function drawJumpStreaks() {
 if(jumpTime<=0)return;
 const t=1-jumpTime/.86,strength=Math.sin(t*Math.PI);
 ctx.save();ctx.translate(W*.5,H*.5);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 const zoom=Math.hypot(W,H);
 const limit=reduceMotion?14:W<640?35:68;
 const shape=reduceMotion?.55:1;
 for(let i=0;i<limit;i++) {
  const angle=i*2.3999632297,dx=Math.cos(angle),dy=Math.sin(angle);
  const track=(i*37%101)/101;
  const distance=zoom*(t*.42+track*.22);
  const length=zoom*(.02+track*.12)*strength*shape;
  ctx.beginPath();ctx.moveTo(dx*distance,dy*distance);ctx.lineTo(dx*(distance+length),dy*(distance+length));ctx.stroke();
 }
 if(t<.52){
  ctx.setLineDash([1,6]);ctx.beginPath();ctx.ellipse(0,0,35+t*108,23+t*59,0,0,Math.PI*2);ctx.stroke();
 }
 ctx.restore();
}

function traceFilament(from,to,phase,amplitude,steps) {
 const dx=to.x-from.x,dy=to.y-from.y,n=Math.hypot(dx,dy)||1;
 ctx.beginPath();ctx.moveTo(from.x,from.y);
 for(let i=1;i<steps;i++){
  const t=i/steps,offset=Math.sin(i*2.9+phase)*Math.sin(t*Math.PI)*amplitude;
  ctx.lineTo(from.x+dx*t-dy/n*offset,from.y+dy*t+dx/n*offset);
 }
 ctx.lineTo(to.x,to.y);ctx.stroke();
}
function drawMiningFilament(point) {
 const age=1-clamp(point.t/.34,0,1);
 ctx.save();ctx.strokeStyle='#ededed';
 ctx.globalAlpha=.88-age*.62;
 traceFilament(flightPose,point,renderTime*36,reduceMotion?0:3*(1-age),14);
 ctx.restore();
}

function drawRadarSweep(remaining) {
 const radius=20+880*Math.min(1,(3-remaining)*.9);
 const bearing=reduceMotion?0:renderTime*2.35;
 ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 for(const ring of [radius,Math.max(1,radius-24)]){
  ctx.setLineDash([2,7]);ctx.beginPath();ctx.arc(s.x,s.y,ring,0,Math.PI*2);ctx.stroke();
 }
 ctx.setLineDash([]);
 for(let i=0;i<9;i++){
  const phase=bearing-i*.085,x=Math.cos(phase),y=Math.sin(phase);
  const inner=radius*(.3+i*.055),outer=radius-i*2;
  ctx.beginPath();ctx.moveTo(s.x+x*inner,s.y+y*inner);ctx.lineTo(s.x+x*outer,s.y+y*outer);ctx.stroke();
 }
 ctx.restore();
}
