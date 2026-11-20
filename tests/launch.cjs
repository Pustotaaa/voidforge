'use strict';

const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');

function check(runtime,code) {
 assert.ok(runtime.run('(()=>{'+code+'})()'),code);
}
function fly(runtime,id) {
 runtime.els.launchAction.click();
 runtime.els.launchAction.click();
 const buttons=runtime.els.starterShips.children.map(card=>card.children.at(-1));
 buttons[id].click();
}

const cinematic=createRuntime();
check(cinematic,"return modal==='launchModal'&&launchState().phase==='title'&&$('launchAction').textContent==='Старт';");
cinematic.els.launchAction.click();
const played=createRuntime({storage:cinematic.stored});
check(played,`
 if(launchState().phase!=='intro'||prologueTime!==0)return false;
 for(let frame=0;frame<160;frame++)loop(frame*16.667);
 if(!$('launchText').textContent.includes('разрушен')||!prologueBoss.length)return false;
 for(let frame=160;frame<=400;frame++)loop(frame*16.667);
 return launchState().phase==='yard'&&s.stats.time===0&&$('starterShips').children.length===3;
`);
const yard=createRuntime({storage:played.stored});
check(yard,"return launchState().phase==='yard'&&debtBalance()===0;");
for(const [index,expected] of ['wanderer','courier','hauler'].entries()) {
 const run=createRuntime();
 fly(run,index);
 check(run,`
  return !modal&&launchState().ship==='${expected}'&&isStory()
   &&validState(s)&&debtBalance()===480&&debtRemaining()===1200&&s.stats.time===0;
 `);
 if(index===1)check(run,"return count('engine')===3;");
 if(index===2)check(run,"return cargoMax()===700;");
}

const expedition=createRuntime();
fly(expedition,0);
check(expedition,`
 $('mine').click();
 for(let i=0;i<60*35&&s.miningId;i++)update(SIM_STEP);
 if(s.ore<=65||actState().stage!==1)return false;
 $('loanHud').click();
 for(let i=0;i<60*35&&!canInteract(PLACES[0]);i++)update(SIM_STEP);
 for(let i=0;i<60*15&&Math.hypot(s.vx,s.vy)>55;i++)update(SIM_STEP);
 openContact(PLACES[0]);
 const before=debtRemaining();
 update(5);
 if(modal!=='contactModal'||debtRemaining()!==before)return false;
 const cash=s.campaign.credits;
 if(!doTrade('ore','sell',100)||debtBalance()>=STARTER_DEBT||s.campaign.credits!==cash)return false;
 const status=$('contactContent').children.find(el=>el.className==='dockDebt');
 status.children.at(-1).click();
 return debtBalance()===0&&launchState().dueAt===null&&$('loanHud').hidden;
`);

const replacement=createRuntime();
fly(replacement,2);
check(replacement,`
 const duration=debtRemaining(),debt=debtBalance(),cargo=s.ore;
 actState().stage=2;actState().trophyFitted=true;s.campaign.tech.push('survey');
 s.campaign.commandCore=true;s.x=810;s.y=650;
 update(SIM_STEP);
 hit(s,core(s),10000);
 update(100);
 return s.dead&&launchState().phase==='replacement'&&debtBalance()===debt
  &&debtRemaining()<duration&&debtRemaining()>duration-1&&s.ore===cargo;
`);
const reborn=createRuntime({storage:replacement.stored});
check(reborn,`
 if(!s.dead||launchState().phase!=='replacement'||$('starterShips').children.length!==3)return false;
 const {debt,dueAt}=launchState();
 $('starterShips').children[1].children.at(-1).click();
 if(s.dead||modal||count('engine')!==3||!canInteract(PLACES[0])||!s.campaign.commandCore
  ||launchState().debt!==debt||launchState().dueAt!==dueAt||s.stats.deaths!==1)return false;
 const alloy=s.ore;
 selected='engine';editAt(0,2,true);
 return s.ore===alloy&&hasFittedTrophy();
`);

const timeout=createRuntime({storage:reborn.stored});
check(timeout,`
 const before=debtRemaining();togglePause();update(5);
 if(debtRemaining()!==before)return false;
 togglePause();
 s.stats.time=launchState().dueAt-.005;
 update(SIM_STEP);
 return launchState().phase==='default'&&modal==='launchModal';
`);
const failed=createRuntime({storage:timeout.stored});
check(failed,"return launchState().phase==='default'&&debtBalance()>0&&$('launchAction').textContent==='Новая игра';");
failed.els.launchAction.click();
check(failed,"return launchState().phase==='title'&&s.stats.time===0&&debtBalance()===0&&!s.campaign.commandCore;");

const previous=createRuntime();
check(previous,`
 fresh();s.ore=228;s.campaign.commandCore=true;const raw=JSON.parse(JSON.stringify(s));
 raw.version=9;delete raw.launch;localStorage.setItem(STORAGE,JSON.stringify(raw));return true;
`);
check(createRuntime({storage:previous.stored}),`
 return !modal&&launchState().phase==='flying'&&debtBalance()===0&&s.ore===228&&s.campaign.commandCore;
`);
console.log('PASS opening, three hulls, actual mining and debt payoff, replacement, migration, and restart');
