'use strict';

const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');

function test(name,script) {
 const {run}=createRuntime();
 const result=run(`(()=>{startPrologue();finishPrologue();launchShip('wanderer');${script}})()`);
 console.log('PASS '+name+(result?' '+JSON.stringify(result):''));
 return result;
}
const helpers=`
 function check(value,message){if(!value)throw Error(message);}
 function tick(seconds){for(let i=0;i<seconds*60&&!s.dead&&!modal;i++)update(SIM_STEP);}
 function warpFixture(p){s.x=p.x;s.y=p.y;s.vx=s.vy=0;resetPresentation();}
 function fit(type,x,y,trophy=null){
  const before=s.modules.length;selected=type;selectedSalvage=trophy?.id??null;editAt(x,y,false);
  check(s.modules.length===before+1,'fit '+type);
 }
`;
test('new game starts in flight, mines 30, and launches the scout',helpers+`
 check(isStory()&&!modal&&actState().stage===0,'intrusive onboarding');
 check(s.vx===32&&s.ore===65&&validState(JSON.parse(localStorage.getItem(STORAGE))),'dock launch must be recoverable');
 s.x=295;s.y=-40;updateHud();check($('nearby').hidden,'dormant pirate warning');
 s.x=0;s.y=0;closeModal();$('mine').click();
 tick(19);
 check(actState().starterOre>=30&&actState().stage===1,'first vein not mined');
 check(actEnemyReady(s.enemies.find(e=>e.id==='scout')),'scout not deployed');
 return {seconds:Math.round(s.stats.time),mined:actState().starterOre};
`);
test('live route from undock through the first trophy and first technology',helpers+`
 $('mine').click();
 tick(18);
 check(actState().stage===1,'mine did not advance');
 actRoute();
 const scout=s.enemies.find(e=>e.id==='scout');
 for(let i=0;i<55*60&&!s.dead&&!scout.dead;i++){
  if(!s.destination||distance(s,scout)<450){
   cancelPilot();const dx=scout.x-s.x,dy=scout.y-s.y,range=Math.hypot(dx,dy)||1;
   touchHeading=Math.atan2(dy,dx)+Math.PI/2;
   const v=clamp((range-290)/210,-.55,.78),x=(dx*v-dy*.16)/range,y=(dy*v+dx*.16)/range;
   const cos=Math.cos(s.angle),sin=Math.sin(s.angle);
   stick.x=x*cos+y*sin;stick.y=-x*sin+y*cos;
   keys.fire=range<670&&s.heat<88;
  }
  update(SIM_STEP);
 }
 check(!s.dead&&scout.dead&&actState().stage===2,'actual scout duel was not won: '+JSON.stringify({x:s.x,y:s.y,dead:s.dead,hp:core(scout)?.hp,shots:s.stats.shots,time:s.stats.time}));
 const killAt=Math.round(s.stats.time);
 resetInput();actRoute();tick(37);
 const trophy=s.campaign.spareModules.find(t=>t.quality==='hot');
 check(trophy&&researchTech('fieldService'),'recover trophy and first technology');
 toggleBuild();fit('gun',1,-2,trophy);closeModal();tick(.1);
 check(actState().stage===3,'observatory not open');
 return {firstKill:killAt,total:Math.round(s.stats.time),hull:Math.round(s.modules.reduce((n,m)=>n+m.hp,0)/s.hullCapacity*100)};
`);
test('scenes must occur in order, wreck trophy advances the shipyard scene, archives are transactional',helpers+`
 const echo=PLACES.find(p=>p.id==='relic2'),ark=PLACES.find(p=>p.id==='relic3'),orion=PLACES.find(p=>p.id==='relic1');
 warpFixture(echo);check(!startScan(echo.id),'Echo skipped early scenes');
 actState().starterOre=30;refreshAct(SIM_STEP);
 const scout=s.enemies.find(e=>e.id==='scout');warpFixture({x:520,y:-20});
 hit(scout,core(scout),10000,'kinetic');
 check(actState().stage===2,'first kill scene');
 const wreck=s.asteroids.find(a=>a.id==='wreck-scout');check(wreck.loot.module.quality==='hot','missing special trophy');
 warpFixture({x:wreck.x-205,y:wreck.y});startMining(wreck);tick(25);
 const trophy=s.campaign.spareModules.find(t=>t.type==='gun');
 check(trophy&&researchTech('fieldService'),'salvage field tech');
 toggleBuild();fit('gun',1,-2,trophy);
 check(upgradeModule(),'Mk II');check(s.modules.some(m=>m.mk===2&&m.origin==='trophy'),'module upgrade');
 closeModal();tick(.1);
 check(actState().stage===3,'shipyard stage');
 check(signals().length===12,'signals');
 warpFixture(echo);check(startScan(echo.id),'Echo start');
 const wing=s.enemies.find(e=>e.id==='wing-gate');
 check(wing.home.x>echo.x&&actState().echoAttack,'missing ambush');
 // Isolate scan semantics from combat while retaining the spawned ambush.
 for(const enemy of s.enemies)if(enemy!==bossShip())enemy.cool+=100;
 tick(19);
 check(!s.campaign.scanned.includes(echo.id)&&s.campaign.scan.duration===20,'short scan');
 tick(1.2);
 check(s.campaign.scanned.includes(echo.id)&&modal==='relicModal'&&actState().stage===4,'scan reward');
 $('relicBoons').children[1].click();
 check(actState().boons[echo.id]==='break'&&!modal,'protocol selection');
 const tank=s.enemies.find(e=>e.id==='pirate-1'), original=core(tank).hp;
 hit(tank,core(tank),900,'kinetic');
 check(!tank.dead&&core(tank).hp===original,'armored core vulnerable too soon');
 for(const m of tank.modules.filter(m=>m.type==='armor').slice(0,6))hit(tank,m,2000,'kinetic');
 hit(tank,core(tank),900,'kinetic');
 check(tank.dead,'tank remained invulnerable');
 tick(.25);check(actState().stage===5&&actState().flyby,'non-damaging flyby');
 delete actState().flyby;warpFixture(ark);check(startScan(ark.id),'Ark scan');
 for(const enemy of s.enemies)if(enemy!==bossShip())enemy.cool+=100;
 tick(9.2);check(actState().stage===6&&modal==='relicModal','Ark scene');
 $('relicLater').click();
 for(const id of ['pirate-0','pirate-2']){
  const guard=s.enemies.find(e=>e.id===id);hit(guard,core(guard),900,'kinetic');
 }
 warpFixture(orion);check(startScan(orion.id),'Orion scan');
 tick(9.2);check(actState().stage===7&&bossUnlocked()&&modal==='relicModal','final scene');
 $('relicBoons').children[2].click();
 return {stages:actState().entries.filter(x=>Number.isInteger(x.scene)).map(x=>x.scene),relics:s.campaign.scanned};
`);
test('dash cost, impulse, recharge; scouting and threat composition',helpers+`
 check(startDash()&&s.energy===75&&s.heat===15&&s.dashCooldown===4,'dash cost');
 check(!startDash(),'stacked dash');
 tick(.27);check(s.vx>260,'weak impulse');
 tick(4);check(!s.dashCooldown,'recharge');
 actState().stage=3;warpFixture({x:0,y:0});
 check(startRadar()&&actState().scanPulse===3,'radar activation');
 check(actState().revealed['signal-0']&&actState().revealed['signal-2'],'ping radius');
 warpFixture({x:1450,y:1050});actState().stage=5;actState().threat=5;actState().patrolIn=0;
 refreshAct(.1);
 const actors=s.enemies.filter(e=>e.patrolActor);
 check(actors.filter(e=>e.archetype==='drone').length===5&&actors.some(e=>e.archetype==='layer')&&actors.some(e=>e.archetype==='tender'),'wave composition');
 const layer=actors.find(e=>e.archetype==='layer');layer.mineIn=0;enemySystems(layer,.1,true);
 check(actState().mines.length===1,'mine drop');
 warpFixture(PLACES[0]);refreshAct(.1);check(threatLevel()===0,'no station reset');
 return {actors:actors.length,signals:signals().length};
`);
test('disabled engines coast, disarmed fighters retreat, repair ship and point defense change the fight',helpers+`
 actState().stage=7;warpFixture({x:1000,y:600});
 const scout=s.enemies.find(e=>e.id==='scout');scout.home={x:1290,y:600};scout.x=1290;scout.y=600;
 scout.modules=scout.modules.filter(m=>!WEAPONS[m.type]);
 updateEnemies(.5);check(scout.vx>0,'disarmed scout attacked');
 scout.modules=scout.modules.filter(m=>m.type!=='engine');const before=scout.vx;
 updateEnemies(.25);check(scout.vx>0&&scout.vx<before,'dead drive added thrust');
 spawnActor('tender',s,0);
 const tender=s.enemies.at(-1);tender.x=scout.x+30;tender.y=scout.y;core(scout).hp=28;
 enemySystems(tender,.5,true);check(core(scout).hp>28,'repair beam');
 s.modules.push(makeModule(-2,0,'pointDefense'));
 spawnActor('drone',s,0);const drone=s.enemies.at(-1);drone.x=s.x+90;drone.y=s.y;
 runPointDefense(s);check(drone.dead,'point defense ignored drone');
`);
test('boss intro, swarm, collapse and gate tariffs',helpers+`
 actState().stage=7;s.campaign.scanned=['relic1','relic2','relic3'];
 for(const enemy of s.enemies)if(GUARD_IDS.includes(enemy.id))enemy.dead=true;
 s.kills=3;
 warpFixture({x:1640,y:340});const boss=bossShip();
 updateBoss(boss,SIM_STEP);check(introFor===1.2&&!$('bossIntro').hidden,'missing title');
 updatePresentation(1.3);check(!introFor&&$('bossIntro').hidden,'intro never clears');
 actState().boons.relic1='break';useRelicBoon();check(boss.suppressed===5,'shield interruption');
 for(const m of boss.modules.filter(m=>m.type==='pylon'))hit(boss,m,1000,'kinetic');
 updateBoss(boss,SIM_STEP);check(s.enemies.filter(e=>e.bossEscort).length===4,'no boss swarm');
 core(boss).hp=120;updateBoss(boss,SIM_STEP);check(boss.shrink>620,'collapse missing');
 s.campaign.commandCore=true;s.campaign.tech.push('warp');warpFixture(PLACES.find(p=>p.id==='gateEast'));
 currentContact='gateEast';s.ore=250;s.campaign.crystal=80;s.campaign.credits=179;
 check(!repairGates(),'gate accepted underpaid certificate');
 s.campaign.credits=180;check(repairGates()&&jumpGate()&&s.won,'story gates');
`);
