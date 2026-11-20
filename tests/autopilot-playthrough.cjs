'use strict';
const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');

function play(script){
 const {run}=createRuntime();
 return run(`(()=>{ closeModal(); fresh(); resetInput();\n${script}\n})()`);
}
const advance=`
function report(name) {
 return {pilot:name,won:s.won,dead:s.dead,guards:guardsDown(),bossDead:bossShip().dead,
         emitters:count('pylon',bossShip()),beamHits:s.stats.bossHits||0,shots:s.stats.shots,
         hits:s.stats.hits,shells:s.campaign.shells,modules:s.modules.length,seconds:Math.round(s.stats.time),key:s.campaign.commandCore};
}
function steer(enemy, stopDistance) {
 touchHeading=Math.atan2(enemy.y-s.y,enemy.x-s.x)+Math.PI/2;
 stick.y=distance(enemy,s)>stopDistance?-1:0;
 keys.fire=true;
}
`;
const novice=play(`${advance}
 const route=GUARD_IDS.map(id=>s.enemies.find(enemy=>enemy.id===id));
 for(const enemy of route) {
  for(let ticks=0;ticks<8400&&!s.dead&&!enemy.dead;ticks++) {
   steer(enemy,290);
   update(SIM_STEP);
  }
  if(s.dead)break;
 }
 return report('novice-from-start');
`);
const checkpoint=`
 s.campaign.scanned=PLACES.filter(p=>p.kind==='relic').map(p=>p.id);
 for(const enemy of s.enemies)if(enemy.id!==BOSS_ID)enemy.dead=true;
 s.kills=guardsDown();
 s.x=1600;s.y=295;
`;
const reckless=play(`${advance}${checkpoint}
 for(let ticks=0;ticks<8400&&!s.dead&&!s.won;ticks++) {
  steer(bossShip(),360);
  update(SIM_STEP);
 }
 return report('novice-at-boss');
`);
for(const result of [novice,reckless])console.log(JSON.stringify(result));
assert.ok(novice.dead||novice.guards<3,'novice from launch must fail a required encounter');
assert.equal(reckless.won,false,'a novice who reaches the boss must not clear the boss');
assert.equal(reckless.dead,true,'reckless pilot should die in battle');
assert.ok(reckless.beamHits>0,'the boss must actually engage and hit the reckless pilot');
assert.equal(reckless.bossDead,false,'reckless pilot must not kill the boss');
