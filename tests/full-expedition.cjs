'use strict';

const assert = require('node:assert/strict');
const {createRuntime} = require('./runtime.cjs');

const {run} = createRuntime();
const result = run(`(() => {
 closeModal();
 fresh();
 resetInput();

 function requireAction(ok, action) {
  if (!ok) throw Error(action + ' | ' + JSON.stringify({
   position: [Math.round(s.x), Math.round(s.y)], speed: Math.round(Math.hypot(s.vx, s.vy)),
   ore: s.ore, crystal: s.campaign.crystal, credits: s.campaign.credits, data: s.campaign.data,
   shells: s.campaign.shells, hull: s.modules.length, heat: Math.round(s.heat),
   dead: s.dead, guards: guardsDown(), living: s.enemies.filter(e=>!e.dead).map(e=>e.id),
   time: Math.round(s.stats.time), task: s.miningId, course: s.destination
  }));
 }
 function until(done, seconds, label) {
  for (let step = 0; !done() && !s.dead && step < seconds * 60; step++) update(SIM_STEP);
  requireAction(!s.dead && done(), label);
 }
 const place = id => PLACES.find(p => p.id === id);
 const enemyById = id => s.enemies.find(enemy => enemy.id === id);
 function dock(p) {
  closeModal();
  approach(p);
  if (modal === 'contactModal') return;
  until(() => canInteract(p) && Math.hypot(s.vx, s.vy) < 55, 110, 'reach ' + p.id);
  openContact(p);
  requireAction(modal === 'contactModal' && currentContact === p.id, 'contact ' + p.id);
 }
 function travel(x, y) {
  closeModal();
  setDestination(x,y);
  until(() => !s.destination, 100, 'fly waypoint ' + x + ',' + y);
 }
 function mine(rock) {
  closeModal();
  startMining(rock);
  requireAction(s.miningId === rock.id, 'start mining ' + rock.id);
  until(() => !s.miningId, 140, 'finish mining ' + rock.id);
 }
 function stock(item, amount) {
  for (let i = 0; resourceAmount(item) < amount && i < 45; i++) {
   const rock = s.asteroids.filter(a => !a.wreck && isExtractable(a) && canDrill(a) &&
    rockProfile(a).item === item && (item === 'crystal' ? zoneAt(a).id === 'ice' : isSafe(a) || s.enemies.every(e=>e.dead || distance(e,a)>900)))
    .sort((a, b) => distance(s, a) - distance(s, b))[0];
   requireAction(rock && freeFor(item) > 0, 'find cargo room and rock for ' + item);
   mine(rock);
  }
  requireAction(resourceAmount(item) >= amount, 'stock ' + item + ' ' + amount);
 }
 function fit(layout) {
  if (modal !== 'builder') toggleBuild();
  for (const [type, x, y] of layout) {
   selected = type;
   editAt(x, y, false);
   requireAction(s.modules.some(m => m.type === type && m.x === x && m.y === y), 'fit ' + type);
  }
  closeModal();
 }
 function research(ids) {
  for (const id of ids) requireAction(researchTech(id), 'research ' + id);
 }

 fit([['cargo', 0, 2]]);
 dock(place('home'));
 requireAction(acceptContract('bounty'), 'accept blockade contract');
 dock(place('forge'));
 requireAction(acceptContract('metal') && completeContract('metal'), 'deliver alloy');
 requireAction(doTrade('parts', 'buy', 4), 'buy cargo for Atlas');
 dock(place('atlas'));
 requireAction(acceptContract('parts') && completeContract('parts'), 'deliver components');

 for (const id of ['relic2', 'relic3']) {
  if (id === 'relic3') {travel(350,-1550);travel(40,170);travel(230,1790);}
  dock(place(id));
  requireAction(startScan(id), 'start scan ' + id);
  until(() => s.campaign.scanned.includes(id), 15, 'scan ' + id);
 }
 research(['geology', 'capacitors']);
 travel(230,1790);travel(40,170);
 dock(place('home'));
 requireAction(doTrade('crystal','buy',24), 'buy research crystals');
 research(['shields', 'railgun']);
 if (!count('cargo')) fit([['cargo', 0, 2]]);
 stock('ore', 285);
 fit([['shield', -2, 0], ['rail', -2, -1], ['cooler', -2, 1]]);
 stock('ore', 245);
 fit([['rail', 2, -1], ['reactor', -1, 2]]);
 
 function approachEnemy(enemy, range) {
  closeModal();
  markEnemy(enemy, range + 50);
  until(() => distance(s, enemy) < range + 120 || !s.destination, 110, 'reach ' + enemy.name);
  cancelPilot();
  resetInput();
 }
 function fight(enemy, stopDistance) {
  const sniper=enemy.archetype==='sniper',boss=enemy.archetype==='boss';
  if(boss)travel(1600,295);
  else approachEnemy(enemy, stopDistance);
  let escape = 1, strafe = 1;
  for (let step = 0; !s.dead && !enemy.dead && step < 160 * 60; step++) {
   const range = distance(s, enemy);
   const centerRail=s.modules.find(m=>m.type==='rail'&&m.x===0);
   const aimFrom=(sniper||boss)&&centerRail?position(s,centerRail):s;
   const target=boss?weaponTarget(enemy):enemy;
   const bearing=sniper||boss?turretBearing(aimFrom,target,{x:s.vx,y:s.vy},1000):Math.atan2(enemy.y-s.y,enemy.x-s.x);
   const blocked=(sniper||boss)&&s.asteroids.some(a=>isExtractable(a)&&segmentDistance(a,aimFrom,target)<a.r*.85);
   touchHeading=bearing+Math.PI/2;
   stick.y=clamp((stopDistance-range)/190,-.85,.72);
   stick.x=sniper?(blocked?-.64:-.55):.36;
   if(boss) {
    // Convert the desired escape vector to joystick coordinates at the current heading.
    if(s.y>620)strafe=-1;
    if(s.y<50)strafe=1;
    let dx=clamp((enemy.x-650-s.x)/115,-.65,.85),dy=(blocked?.62:.30)*strafe;
    if(enemy.windup>0) {
     const side=-(s.x-enemy.x)*Math.sin(enemy.beamAngle)+(s.y-enemy.y)*Math.cos(enemy.beamAngle);
     if(Math.abs(side)>4)escape=side>0?1:-1;
     dx=-Math.sin(enemy.beamAngle)*escape;
     dy=Math.cos(enemy.beamAngle)*escape;
    }
    const cos=Math.cos(s.angle),sin=Math.sin(s.angle);
    stick.x=dx*cos+dy*sin;stick.y=-dx*sin+dy*cos;
   }
   const aligned=Math.abs(angleDifference(touchHeading,s.angle))<(boss?.10:.075);
   const goodShot=!(sniper||boss)||(!blocked&&aligned);
   keys.fire=range<(sniper?1100:960)&&s.heat<88&&goodShot;
   update(SIM_STEP);
  }
  resetInput();
  requireAction(!s.dead && enemy.dead, 'defeat ' + enemy.name);
 }
 function restock(supply=160) {
  dock(place('home'));
  if(s.ore<60){stock('ore',60);dock(place('home'));}
  if (s.campaign.shells < supply - 15) {
   const needed = supply - s.campaign.shells;
   for (let left = needed; left > 0; left -= 100) requireAction(doTrade('shells', 'buy', Math.min(left, 100)), 'buy ammunition');
  }
  if (getRepairQuote().cost) {
   repair();
   requireAction(confirmRepair(), 'repair at station');
  }
  closeModal();
 }
 function loot(enemy) {
  if (cargoUsed() < cargoMax()) mine(s.asteroids.find(a => a.id === 'wreck-' + enemy.id));
 }
 restock();
 for (const id of GUARD_IDS) {
  const enemy = enemyById(id);
  if(id===GUARD_IDS[2]){
   research(['ionDrive']);
   stock('ore',270);
   fit([['shield',2,0],['cooler',2,1],['ion',1,2],['armor',0,-2]]);
   restock();
   const scout=enemyById('scout');
   if(!scout.dead){fight(scout,570);loot(scout);restock();}
  }
  const wing=s.enemies.find(e=>e.squad&&e.squad===enemy.squad&&e!==enemy&&!e.dead);
  if(wing&&id!==GUARD_IDS[2])fight(wing,610);
  if(id===GUARD_IDS[2]&&!enemy.dead){
   restock();
   stock('ore',140);
   fit([['rail',0,-3]]);
   for(const tile of [[-2,-1],[2,-1]]) {
    if(s.modules.some(m=>m.x===tile[0]&&m.y===tile[1]))continue;
    const joins=s.modules.some(m=>Math.abs(m.x-tile[0])+Math.abs(m.y-tile[1])===1);
    if(!joins){
     stock('ore',165);
     fit([['armor',Math.sign(tile[0]),tile[1]]]);
    } else stock('ore',150);
    fit([['rail',...tile]]);
   }
  }
  if(wing&&id===GUARD_IDS[2]){fight(wing,730);restock();}
  if(!enemy.dead)fight(enemy, enemy.archetype==='sniper'?820:615);
  loot(enemy);
  if(wing&&isExtractable(s.asteroids.find(a=>a.id==='wreck-'+wing.id)))loot(wing);
  if (id === GUARD_IDS[1]) {
   dock(place('relic1'));
   requireAction(startScan('relic1'), 'start scan of Orion');
   until(() => s.campaign.scanned.includes('relic1'), 15, 'scan Orion');
  }
  if (id !== GUARD_IDS.at(-1)) restock();
 }
 dock(place('home'));
 requireAction(completeContract('bounty'), 'collect bounty');
 closeModal();
 stock('crystal', 25);
 research(['warp']);
 if(!count('cargo')){stock('ore',50);fit([['cargo',0,2]]);}
 stock('ore',220);
 fit([['ion',-1,3],['magazine',0,3],['magazine',1,3]]);
 restock(400);
 document.querySelectorAll('[data-power]').find(b=>b.dataset.power==='weapons').click();
 fight(bossShip(), 660);
 loot(bossShip());
 requireAction(s.campaign.commandCore, 'extract key');
 stock('ore', 180);
 if(s.campaign.crystal<65) {
  dock(place('atlas'));
  requireAction(doTrade('crystal','buy',65-s.campaign.crystal),'buy crystals for gate restoration and jump');
 }
 dock(place('gateEast'));
 requireAction(repairGates() && jumpGate(), 'rebuild and use gate');
 requireAction(modal === 'resultModal' && s.won, 'victory screen');
 $('resultContinue').click();
 requireAction(!modal && s.won && !s.dead, 'free flight after victory');
 return {pilot:'prepared-from-start', won:s.won, dead:s.dead, relics:s.campaign.scanned.length,
  guards:guardsDown(), bossDead:bossShip().dead, key:s.campaign.commandCore, modules:s.modules.length,
  shots:s.stats.shots, hits:s.stats.hits, seconds:Math.round(s.stats.time), contracts:s.campaign.contracts};
})()`);
console.log(JSON.stringify(result));
assert.equal(result.won, true);
assert.equal(result.guards, 3);
assert.equal(result.relics, 3);
assert.ok(result.bossDead && result.key && !result.dead);
