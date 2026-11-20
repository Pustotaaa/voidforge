'use strict';

const CoopNet=(()=>{
 const LIMIT_HISTORY=1400;
 const {STEP,clamp,bearingDifference}=FlightCore;
 function pose(ship) {
  return {x:ship.x,y:ship.y,angle:ship.angle,vx:ship.vx||0,vy:ship.vy||0,
   angularVelocity:ship.angularVelocity||0,impactCooldown:ship.impactCooldown||0,modules:ship.modules};
 }
 function newLink() {
  let rtt=150,jitter=0,measured=false,lastTick=null,received=0,history=[],frames=[];
  let flight=null,plannedAt=0,frameDebt=0,correction={x:0,y:0,angle:0};
  let obstacleRocks,obstaclePlaces,obstacles=[];
  const updateLink=sample=>{
   if(!Number.isFinite(sample)||sample<=0)return;
   const latency=clamp(sample,20,3500);
   if(!measured){rtt=latency;measured=true;return;}
   jitter+=(Math.abs(latency-rtt)-jitter)*.2;
   rtt+=(latency-rtt)*.2;
  };
  function step(ship,input,physics,assist,rocks) {
   FlightCore.applyManualFlight(ship,input,input.heading??ship.angle,assist,physics,FlightCore.speedLimit(physics),STEP);
   FlightCore.integrate(ship,STEP);
   FlightCore.collide(ship,physics,rocks,STEP,()=>{});
  }
  function predict(snapshot, after, at, phys, rockList) {
   const next=pose(snapshot.ship);
   let index=0;
   while(index+1<history.length&&history[index+1].at<=after)index++;
   for(let time=after+STEP*1000;time<=at;time+=STEP*1000){
    while(index+1<history.length&&history[index+1].at<=time)index++;
    const input=history[index];
    if(input&&input.at<=time)step(next,input.value,phys,snapshot.ship.systems.assist,rockList);
   }
   return next;
  }
  function sceneRocks(snapshot) {
   if(obstacleRocks!==snapshot.rocks||obstaclePlaces!==snapshot.places){
    obstacleRocks=snapshot.rocks;
    obstaclePlaces=snapshot.places;
    obstacles=[...snapshot.rocks.filter(rock=>rock.ore>0),...snapshot.places.map(place=>({...place,r:65}))];
   }
   return obstacles;
  }
  const fitsManual=snapshot=>!snapshot.ship.dead&&!snapshot.dashing&&!snapshot.cruise;
  const manualFlight=snapshot=>fitsManual(snapshot)&&!snapshot.target&&!snapshot.course;
  function receive(snapshot, at, latency, phys) {
   updateLink(latency);
   const tick=Number.isFinite(snapshot.tick)?snapshot.tick:at;
   if(lastTick!==null&&tick<=lastTick)return;
   received=at;
   lastTick=tick;
   const actors=new Map([...snapshot.players,...snapshot.enemies].map(actor=>[actor.id,actor]));
   frames.push({tick,actors});
   if(frames.length>8)frames.shift();
   if(!manualFlight(snapshot)){
    flight=null;frameDebt=0;return;
   }
   const span=clamp(rtt*.5,0,320);
   const next=predict(snapshot,at-span,at,phys,sceneRocks(snapshot));
   const last=flight;
   if(last&&Math.hypot(last.x-next.x,last.y-next.y)<160){
    correction.x+=last.x-next.x;
    correction.y+=last.y-next.y;
    correction.angle=bearingDifference(last.angle+correction.angle,next.angle);
   }else correction={x:0,y:0,angle:0};
   flight=next;plannedAt=at;frameDebt=0;
  }
  function local(snapshot,input,at,phys) {
   const previous=history.at(-1);
   if(!previous||input.x!==previous.value.x||input.y!==previous.value.y||input.heading!==previous.value.heading){
    history.push({at,value:{x:input.x,y:input.y,heading:input.heading}});
   }
   while(history.length>1&&(history[1].at<at-LIMIT_HISTORY||history.length>220))history.shift();
   const interruptsCourse=Math.hypot(input.x,input.y)>.02;
   if(!fitsManual(snapshot)||(!manualFlight(snapshot)&&!interruptsCourse))return null;
   if(!flight){
    flight=pose(snapshot.ship);plannedAt=at;frameDebt=0;correction={x:0,y:0,angle:0};
   }
   flight.modules=snapshot.ship.modules;
   const elapsed=clamp(at-plannedAt,0,55)/1000;
   plannedAt=at;
   if(at-received>clamp(rtt*1.45+jitter*2+260,470,1250))return currentPose();
   frameDebt+=elapsed;
   while(frameDebt+1e-9>=STEP){
    frameDebt-=STEP;
    step(flight,input,phys,snapshot.ship.systems.assist,sceneRocks(snapshot));
   }
   const easing=Math.exp(-elapsed*9);
   correction.x*=easing;correction.y*=easing;correction.angle*=easing;
   return currentPose();
  }
  function currentPose(){
   return {x:flight.x+correction.x+flight.vx*frameDebt,
    y:flight.y+correction.y+flight.vy*frameDebt,angle:flight.angle+correction.angle+flight.angularVelocity*frameDebt};
  }
  function remoteAt(at){
   if(!frames.length)return actor=>actor;
   const delay=clamp(rtt*.79+jitter*1.8+90,230,850);
   const target=lastTick+clamp(at-received,0,1450)-delay;
   let before=frames[0],after=before;
   for(const frame of frames){
    after=frame;
    if(frame.tick>=target)break;
    before=frame;
   }
   const t=before===after?0:clamp((target-before.tick)/(after.tick-before.tick),0,1);
   const extrap=after===before?clamp((target-after.tick)/1000,0,.16):0;
   return actor=>{
    const a=before.actors.get(actor.id),b=after.actors.get(actor.id);
    if(!a||!b||a.dead!==b.dead)return actor;
    return {x:a.x+(b.x-a.x)*t+(b.vx||0)*extrap,
     y:a.y+(b.y-a.y)*t+(b.vy||0)*extrap,
     angle:a.angle+bearingDifference(b.angle,a.angle)*t+(b.angularVelocity||0)*extrap};
   };
  }
  function cadence(active,hidden,failures,wake){
   if(failures)return Math.min(5200,650*2**Math.min(failures-1,3));
   if(wake&&!hidden)return 35;
   if(hidden)return 3800;
   if(!active)return clamp(1200+jitter+rtt*.7,1250,2900);
   return clamp(Math.max(245,rtt*.95+jitter*.35),245,1050);
  }
  return {receive,local,remoteAt,cadence,ping:()=>measured?Math.round(rtt/25)*25:null};
 }
 return {newLink};
})();
