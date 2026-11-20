'use strict';

const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');

function runArena(script){
 const {run}=createRuntime();
 return run(`(()=>{
 startPrologue();finishPrologue();launchShip('wanderer');
 const boss=bossShip();
 const enemies=s.enemies;
 const aim=(target,dx,dy)=>{
  touchHeading=Math.atan2(target.y-s.y,target.x-s.x)+Math.PI/2;
  const cos=Math.cos(s.angle),sin=Math.sin(s.angle);
  stick.x=dx*cos+dy*sin;stick.y=-dx*sin+dy*cos;
 };
 const prepare=(layout)=>{
  for(const [type,x,y] of layout)s.modules.push(makeModule(x,y,type));
  s.hullCapacity=capacity(s);
  s.campaign.shells=count('magazine')?350:160;
  s.campaign.shield=count('shield')*90;
  s.campaign.power='weapons';
 };
 const result=(enemy,name)=>({
  name,won:enemy.dead&&!s.dead,dead:s.dead,seconds:Math.round(s.stats.time*10)/10,
  hull:Math.round(s.modules.reduce((n,m)=>n+m.hp,0)/s.hullCapacity*100),beamHits:s.stats.bossHits,
  modules:s.modules.length,ammo:s.campaign.shells,
  dash:actState().entries.filter(x=>x.event==='dash').length
 });
 ${script}
 })()`);
}
const outfit=[
 ['rail',-2,-1],['rail',2,-1],['rail',0,-2],['shield',-2,0],['shield',2,0],['cooler',-2,1],['cooler',2,1],
 ['reactor',0,2],['ion',-1,2],['ion',1,2],['pointDefense',2,1],['magazine',0,3]
];
const validOutfit=outfit.filter(([type,x,y])=>type!=='pointDefense');
validOutfit.push(['pointDefense',2,2]);
function bossDuel(withDash,reaction=.28,layout=validOutfit,pressure=4){
 return runArena(`
  actState().stage=7;
  s.campaign.scanned=['relic1','relic2','relic3'];
  for(const e of enemies)if(e!==boss){e.dead=true;}
  s.kills=3;s.x=1620;s.y=310;s.vx=s.vy=0;s.angle=Math.PI/2;
  prepare(${JSON.stringify(layout)});
  s.asteroids=[];
  actState().threat=${pressure};actState().patrolIn=9999;
  const canDash=${withDash};
  let side=1;
  for(let i=0;i<160*60&&!s.dead&&!boss.dead;i++){
   const target=weaponTarget(boss),p=distance(s,boss);
   if(s.y>510)side=-1;
   if(s.y<170)side=1;
   let dx=clamp((1660-s.x)/150,-.55,.55),dy=side*.20;
   // Both pilots try the same last-second sidestep. Only one can spend a dash.
   const late=boss.windup>0&&boss.windup<${reaction};
   if(late){
    const lead=-(s.x-boss.x)*Math.sin(boss.beamAngle)+(s.y-boss.y)*Math.cos(boss.beamAngle);
    const sign=Math.abs(lead)>3?Math.sign(lead):side;
    dx=-Math.sin(boss.beamAngle)*sign;dy=Math.cos(boss.beamAngle)*sign;
   }
   aim(target,dx,dy);
   if(late&&canDash&&s.dashCooldown<=0)startDash();
   keys.fire=p<860&&s.heat<88&&s.energy>78&&boss.cool>.44&&!boss.windup;
   update(SIM_STEP);
  }
  return result(boss,canDash?'watcher-with-dash':'watcher-without-dash');
 `);
}
function guardDuel(id, refit=false){
 return runArena(`
  actState().stage=6;actState().patrolIn=9999;
  const guard=enemies.find(e=>e.id===${JSON.stringify(id)});
  for(const e of enemies)if(e!==guard)e.dead=true;
  s.x=610;s.y=0;s.vx=s.vy=0;s.angle=-Math.PI/2;
  guard.x=125;guard.y=30;guard.home={x:125,y:30};
  // Move both duelists outside every dock perimeter.
  s.x+=340;s.y+=710;guard.x+=340;guard.y+=710;guard.home.x+=340;guard.home.y+=710;
  guard.angle=Math.atan2(s.y-guard.y,s.x-guard.x)+Math.PI/2;guard.cool=.12;
  s.asteroids=[];
  if(${refit})prepare(${JSON.stringify(validOutfit)}.filter(([type,x])=>guard.archetype!=='sniper'||type!=='rail'||x!==0));
  if(guard.archetype==='sniper'){
   s.asteroids.push({id:'duel-cover',x:738,y:698,r:48,ore:35,seed:7,material:'ore'});
  }
  if(guard.archetype==='tank'&&${refit}){
   const gun=s.modules.find(m=>m.type==='gun'&&m.x===-1);
   gun.type='plasma';gun.hp=types.plasma.hp;
  }
  for(let i=0;i<(guard.archetype==='tank'?105:60)*60&&!s.dead&&!guard.dead;i++){
   const dx=guard.x-s.x,dy=guard.y-s.y,range=Math.hypot(dx,dy)||1;
   const approach=clamp((range-(guard.archetype==='sniper'?730:435))/250,-.6,.6);
   const plates=guard.archetype==='tank'&&${refit}&&count('armor',guard)>6?
    guard.modules.filter(m=>m.type==='armor').sort((a,b)=>distance(position(guard,a),s)-distance(position(guard,b),s)):null;
   if(plates?.length)aimedCell={id:guard.id,x:plates[0].x,y:plates[0].y};
   else aimedCell=null;
   aim(weaponTarget(guard),(dx*approach+dy*.27)/range,(dy*approach-dx*.27)/range);
   keys.fire=range<980&&s.heat<89;
   update(SIM_STEP);
  }
  return result(guard,guard.name+(${refit}?' · перехватчик':' · стартовый корпус'));
 `);
}
const twoRails=validOutfit.filter(([type,x])=>type!=='rail'||x!==-2);
const testHull=twoRails.filter(([type,x])=>type!=='shield'||x!==2);
const outcomes=[
 guardDuel('scout'),guardDuel('pirate-0'),guardDuel('pirate-1'),guardDuel('pirate-1',true),
 guardDuel('pirate-2',true),bossDuel(false,.32,testHull),bossDuel(true,.32,testHull)
];
for(const outcome of outcomes)console.log(JSON.stringify(outcome));
assert.equal(outcomes[3].won,true,'a prepared tactician must beat the Bastion');
assert.equal(outcomes[2].won,false,'the starter ship must not beat the Bastion');
assert.equal(outcomes[5].won,false,'the delayed sidestep on its own must fail');
assert.equal(outcomes[6].won,true,'the same pilot with dash must win');
assert.ok(outcomes[6].dash>0,'the pilot must actually spend energy on evasion');
