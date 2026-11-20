'use strict';

const BOSS_ID = 'watcher';
const GUARD_IDS = ['pirate-0', 'pirate-1', 'pirate-2'];
const BOSS_HOME = {x:2290,y:340};
const ENERGY_PER_PULSE = {surface: 4, deep: 9, wreck: 6};
const ENEMY_INFO = {
 scout:{rank:'Разведчик',tier:1,tactic:'Быстрый, держится сбоку. Сбейте двигатель, пока он не ушёл.',range:320,speed:116,cool:1.55,attack:520},
 skirmisher:{rank:'Налётчик',tier:2,tactic:'Обходит по дуге и стреляет на сближении. Держите дистанцию.',range:300,speed:92,cool:1.05,attack:650},
 tank:{rank:'Броненосец',tier:3,tactic:'Щит восстанавливается в паузах. Давите огнём, выходите на корму.',range:330,speed:44,cool:1.05,attack:610},
 sniper:{rank:'Снайпер',tier:4,tactic:'Отступает и стреляет рельсотроном. Сближайтесь по дуге или за укрытием.',range:680,speed:78,cool:1.7,attack:1030},
 boss:{rank:'Флагман',tier:5,tactic:'Сбейте боковые излучатели. Уходите поперёк размеченного коридора.'}
};
const bossShip = () => s.enemies.find(e=>e.id===BOSS_ID);
const guardsDown = () => GUARD_IDS.filter(id=>s.enemies.find(e=>e.id===id)?.dead).length;
const bossUnlocked = () => guardsDown()===3 && s.campaign.scanned.length===3&&(!isStory()||actState().stage===7);

function restoreDepth(d) {
 const cc=d.campaign, first=cc.depthVersion!==1;
 if(first) {
  cc.depthVersion=1;
  cc.miningMode='balanced';
  cc.commandCore=Boolean(cc.completed||cc.gateReady);
  cc.wrecksSalvaged=0;
  if(!cc.tech.includes('survey'))cc.tech.unshift('survey');
  for(const enemy of d.enemies) {
   if(enemy.dead)continue;
   if(enemy.archetype==='tank'&&!enemy.modules.some(m=>m.type==='shield'))enemy.modules.push(makeModule(0,2,'shield'));
   if(enemy.archetype==='sniper'&&distance(enemy, BOSS_HOME)<430) {
    enemy.home={x:1830,y:-420}; enemy.x=enemy.home.x; enemy.y=enemy.home.y;
   }
  }
  if(!d.enemies.some(e=>e.id==='scout'))d.enemies.push(makeScout());
  if(!d.enemies.some(e=>e.id===BOSS_ID))d.enemies.push(makeBoss(cc.completed||cc.gateReady));
  // Existing saves retain all previously mined deposits and loot.
  for(const a of d.asteroids) {
   if(d.stats.time===0 && distance(a,BOSS_HOME)<360 && !a.wreck) {
    const angle=Math.atan2(a.y-BOSS_HOME.y,a.x-BOSS_HOME.x)||.8;
    a.x=clamp(BOSS_HOME.x+Math.cos(angle)*410,-LIMIT+60,LIMIT-60);
    a.y=clamp(BOSS_HOME.y+Math.sin(angle)*410,-LIMIT+60,LIMIT-60);
   }
  }
 }
 if(!cc.bossLane) {
  // Keep an approach for large hulls while leaving rocks on either side as cover.
  for(const a of d.asteroids) {
   if(a.wreck||a.x<1460||a.x>BOSS_HOME.x+70||Math.abs(a.y-BOSS_HOME.y)>350)continue;
   const side=a.y<BOSS_HOME.y?-1:1;
   a.y=BOSS_HOME.y+side*(365+a.r+(Math.floor(a.seed*73)%95));
   if(d.miningId===a.id)delete d.destination;
  }
  cc.bossLane=true;
 }
 if(cc.miningMode!=='boost')cc.miningMode='balanced';
 cc.wrecksSalvaged=Number.isFinite(cc.wrecksSalvaged)?cc.wrecksSalvaged:0;
 for(const a of d.asteroids) {
  if(a.work||a.wreck||a.ore<34||a.id==='first-vein')continue;
  const tier=a.material==='crystal'?2:1;
  a.work={surface:Math.floor(a.ore*(tier===2 ? .57 : .71)),tier};
 }
 return d;
}
function makeScout() {
 const home={x:580,y:710};
 return {...home,home,id:'scout',name:'ИГЛА',archetype:'scout',angle:0,cool:1.4,dead:false,vx:0,vy:0,
  modules:[makeModule(0,0,'reactor'),makeModule(0,-1,'gun'),makeModule(0,1,'engine'),makeModule(1,1,'engine')]};
}
function makeBoss(dead=false) {
 const layout=[
  [-3,0,'pylon'],[-2,0,'armor'],[-1,0,'armor'],[0,0,'bossCore'],[1,0,'armor'],[2,0,'armor'],[3,0,'pylon'],
  [-2,-1,'rail'],[-1,-1,'armor'],[0,-1,'armor'],[1,-1,'armor'],[2,-1,'rail'],
  [-2,1,'gun'],[-1,1,'armor'],[0,1,'cooler'],[1,1,'armor'],[2,1,'gun'],
  [-1,2,'engine'],[0,2,'reactor'],[1,2,'engine']
 ];
 return {...BOSS_HOME,home:{...BOSS_HOME},id:BOSS_ID,name:'СМОТРИТЕЛЬ',archetype:'boss',angle:0,cool:2.4,dead,vx:0,vy:0,
  modules:dead?[]:layout.map(([x,y,type])=>makeModule(x,y,type))};
}
function onEnemyDestroyed(enemy) {
 const cc=s.campaign, profile=enemy.archetype;
 if(profile==='drone'){actEnemyDestroyed(enemy,null);return;}
 if(GUARD_IDS.includes(enemy.id))s.kills=guardsDown();
 const boss=profile==='boss';
 const bounty=boss?550:profile==='scout'?65:profile==='skirmisher'?150:220;
 cc.credits+=bounty;
 if(profile==='scout')enemy.returnAt=s.stats.time+FIELD_RENEWAL;
 const suffix=profile==='scout'&&enemy.patrolRound?'-'+enemy.patrolRound:'';
 const wreck={id:'wreck-'+enemy.id+suffix,x:enemy.x,y:enemy.y,r:boss?43:28,ore:boss?100:profile==='scout'?26:65,seed:3,wreck:true,material:'salvage',
  loot:{parts:boss?5:profile==='scout'?1:3,crystal:boss?25:profile==='scout'?2:8,data:boss?60:profile==='scout'?10:25,commandCore:boss}};
 const trophy=pickTrophy(enemy);
 if(trophy)wreck.loot.module={...trophy,quality:trophyQuality(trophy.type)};
 s.asteroids.push(wreck);
 actEnemyDestroyed(enemy,wreck);
 log(enemy.name+' уничтожен. Награда '+bounty+' кр. Груз остался в обломках.');
 toast(boss?'Смотритель уничтожен. Разберите остов, чтобы забрать командный ключ.':enemy.name+' уничтожен · обломки отмечены на карте.');
 save(false);
}
function miningLayer(a) {
 if(a.loot)return 'wreck';
 return a.work&&a.work.surface<=0?'deep':'surface';
}
function mineralLabel(a) {
 if(a.loot)return a.id==='wreck-'+BOSS_ID?'Остов Смотрителя':'Военные обломки';
 return rockProfile(a).label;
}
function canDrill(a) { return miningLayer(a)!=='deep'||activeCount('drill')>0; }
function miningDescription(a) {
 if(a.loot) {
  const l=a.loot, items=[l.parts&&l.parts+' деталей',l.crystal&&l.crystal+' кристаллов',l.data&&l.data+' данных',l.commandCore&&'Командный ключ',l.module&&types[l.module.type]?.name].filter(Boolean);
  return items.length?items.join(' · '):'Остался сплав';
 }
 const type=rockProfile(a);
 const risk=type.unstable?' · Раскол при перегреве':'';
 let layers='Поверхностный слой';
 if(miningLayer(a)==='deep')layers=canDrill(a)?'Плотная жила · активный бур':'Плотная жила · нужен установленный бур';
 else if(a.work)layers='Поверхность '+a.work.surface+' · Плотная жила '+(a.ore-a.work.surface);
 return layers+' · Твёрдость '+type.hardness.toFixed(1)+risk;
}
function transferWreckCache(a) {
 const loot=a.loot;
 if(!loot || a.ore>15)return false;
 let changed=false;
 for(const [key,weight] of [['parts',10],['crystal',1]]) {
  const qty=Math.min(loot[key],Math.floor(freeCargo()/weight));
  if(qty>0) {s.campaign[key]+=qty;loot[key]-=qty;changed=true;}
 }
 if(loot.data>0) {s.campaign.data+=loot.data;loot.data=0;changed=true;}
 if(loot.commandCore) {s.campaign.commandCore=true;loot.commandCore=false;changed=true;toast('Командный ключ получен. Врата можно восстановить, когда готовы ресурсы и резонанс.');}
 if(collectSpare(loot))changed=true;
 if(changed)save(false);
 return changed;
}
function isExtractable(a) {
 return a.ore>0 || Boolean(a.loot&&(a.loot.parts||a.loot.crystal||a.loot.data||a.loot.commandCore||a.loot.module));
}
function runExtraction(a,manual=false) {
 if(mining>0||!a||!isExtractable(a)||distance(s,a)>MINE_RANGE)return false;
 if(!canDrill(a)) {
  if(s.miningId===a.id&&s.campaign.deliveries.some(f=>f.source===a.id))return false;
  cancelPilot();
  toast('Поверхностный слой исчерпан. Для плотной жилы установите бур.');
  return false;
 }
 transferWreckCache(a);
 if(!isExtractable(a)) {s.campaign.wrecksSalvaged++;cancelPilot();save(false);return true;}
 const profile=rockProfile(a),space=freeFor(profile.item);
 if(space<=0&&isExtractable(a)) {cancelPilot();toast('Трюм заполнен. Остаток лута сохранился в обломках.');return false;}
 const layer=miningLayer(a), boost=s.campaign.miningMode==='boost';
 const energy=ENERGY_PER_PULSE[layer]*(boost?2:1)+(manual?2:0);
 const heat=(layer==='deep'?15:layer==='wreck'?9:5)*(boost?2:1)+(manual?5:0);
 if(profile.unstable&&(manual||boost)&&s.energy>=energy&&s.heat+heat>=95&&breakDeposit(a,true)) {
  s.heat=Math.min(100,s.heat+heat);s.energy-=energy;save(false);return true;
 }
 if(s.energy<energy||s.overheated||s.heat+heat>=100) {
  s.miningWait=s.energy<energy?'Восстанавливаем энергию':'Охлаждаем инструмент';
  return false;
 }
 delete s.miningWait;
 const rigs=activeCount('drill');
 const speed=(hasTech('geology')?11:7)+Math.min(rigs,3)*2;
 const limit=layer==='surface'&&a.work?a.work.surface:a.ore;
 const hardness=layer==='deep'?(a.work.tier===2 ? .55 : .72):1;
 const n=Math.min(a.ore,limit,space,Math.max(1,Math.floor(speed*(boost?1.6:1)*(manual?1.18:1)*hardness/profile.hardness)));
 if(n<=0) {
  if(a.loot&&(space<10||a.loot.module&&space<SALVAGE_SPACE)) {cancelPilot();toast(a.loot.module?'Для трофея нужно 12 свободных мест.':'Для каждой детали нужно 10 свободных мест.');}
  return false;
 }
 const spot=manual&&!a.wreck?rockSpot(a):miningImpactPoint(a);
 a.initialReserve??=Math.max(a.ore,a.reserve||0);
 s.energy-=energy; s.heat+=heat; a.ore-=n;
 if(layer==='surface'&&a.work)a.work.surface-=n;
 dispatchOre(a,profile.item,n,spot);
 if(a.material==='salvage'&&!a.loot)s.campaign.data+=Math.max(1,Math.floor(n/6));
 if(layer==='deep'&&a.material==='crystal')s.campaign.data+=Math.floor(n/5);
 playSound('mine');
 mining=(boost ? .53 : layer==='deep' ? 1.05 : .8)*(manual ? .62 : 1)*(isStory()&&!hasTech('geology')?2:1);
 fx.push({...spot,t:.34,mine:true});
 rockImpact(a,spot,!a.wreck&&a.ore===0);
 if(manual&&a.r>=36&&a.id.startsWith('industry-')&&layer==='deep'&&a.ore>0&&a.ore<=24&&breakDeposit(a))return true;
 transferWreckCache(a);
 if(!isExtractable(a)) {
  if(a.loot)s.campaign.wrecksSalvaged++;
  markDepleted(a);
  if(s.miningId!==a.id)save(false);
  else s.miningWait='Груз в пути';
  log('Разработка завершена: '+mineralLabel(a));
  toast(a.wreck?'Обломки разобраны.':'Месторождение исчерпано.');
 } else if(!canDrill(a)) {
  if(s.miningId===a.id)s.miningWait='Груз в пути';
  else save(false);
  toast('Плотная жила открылась. Для продолжения установите бур.');
 }
 return true;
}

function isBehindShield(boss,module) {
 return boss.archetype==='boss'&&!(boss.suppressed>0)&&module.type!=='pylon'&&count('pylon',boss)>0;
}
function weaponTarget(enemy) {
 if(!enemy)return null;
 const pinned=targetModule(enemy);
 if(pinned)return tacticalPoint(enemy,pinned);
 if(enemy.archetype!=='boss')return enemy;
 const emitters=enemy.modules.filter(m=>m.type==='pylon');
 if(!emitters.length)return enemy;
 return emitters.map(m=>tacticalPoint(enemy,m)).sort((a,b)=>distance(s,a)-distance(s,b))[0];
}
function bossBeamEnd(boss, angle) {
 const range=970, direction={x:Math.cos(angle),y:Math.sin(angle)};
 let length=range;
 for(const a of s.asteroids) {
  if(!isExtractable(a))continue;
  const dx=a.x-boss.x, dy=a.y-boss.y;
  const forward=dx*direction.x+dy*direction.y, lateral=dx*direction.y-dy*direction.x;
  if(forward<=100||forward>=length||Math.abs(lateral)>=a.r*.8)continue;
  length=Math.min(length,forward-Math.sqrt((a.r*.8)**2-lateral*lateral));
 }
 return {x:boss.x+direction.x*length,y:boss.y+direction.y*length};
}
function updateBoss(boss,dt) {
 const d=distance(s,boss);
 if(!bossUnlocked()||d>1280||isSafe(s)) {boss.windup=0;boss.active=false;return;}
 boss.active=true;
 boss.suppressed=Math.max(0,(boss.suppressed||0)-dt);
 if(isStory()&&!boss.introPlayed) {
  boss.introPlayed=true;triggerBossIntro();recordAct('boss:intro');
  return;
 }
 const phase=count('pylon',boss)>0?1:isStory()&&core(boss)?.hp<moduleMaxHp(core(boss))*.45?3:2;
 const bearing=Math.atan2(s.y-boss.y,s.x-boss.x);
 if(phase>=2&&isStory()&&!boss.swarm){boss.swarm=true;deploySwarm(boss,4,true);recordAct('boss:swarm');}
 if(phase===3){
  if(!boss.shrink){boss.shrink=1030;toast('Арена сужается. Укрытия блокируют луч.');recordAct('boss:collapse');}
  boss.shrink=Math.max(620,boss.shrink-dt*25);
  if(d>boss.shrink){s.vx+=Math.cos(bearing)*-130*dt;s.vy+=Math.sin(bearing)*-130*dt;s.heat=Math.min(100,s.heat+13*dt);}
 }
 if(!boss.windup)turnTowards(boss,bearing+Math.PI/2,dt,phase===1?1.0:1.45);
 boss.flash=Math.max(0,(boss.flash||0)-dt);
 if(boss.windup>0) {
  boss.windup=Math.max(0,boss.windup-dt);
  if(!boss.windup) {
   const end=bossBeamEnd(boss,boss.beamAngle),width=phase===1?31:44;
   boss.flash=.2;effectBurst(end,'emp',boss.beamAngle+Math.PI);
   const m=s.modules.map(module=>({module,x:segmentDistance(position(s,module),boss,end)})).filter(p=>p.x<width).sort((a,b)=>a.x-b.x)[0];
   if(m) {
    s.stats.bossHits=(s.stats.bossHits||0)+1;
    const damage=phase===1?90:phase===3?148:124;
    hit(s,m.module,damage*(isStory()?1.27:1));
   }
   boss.cool=(phase===1?2.5:phase===3?1.5:1.85)*(isStory()?1-threatLevel()*.075:1);
  }
  return;
 }
 boss.cool-=dt;
 if(boss.cool<=0&&d<950) {
  boss.beamAngle=bearing;playSound('warning');
  boss.windup=(phase===1?1.12:.94)+(boss.slowBeam?.88:0);
  boss.maxWindup=boss.windup;boss.slowBeam=false;
  return;
 }
 if(phase>=2&&d<980) {
  boss.volley=(boss.volley||0)-dt;
  if(boss.volley<=0) {
   for(const offset of [-.26,0,.26]) {
    const a=bearing+offset;
    bullets.push({x:boss.x+Math.cos(a)*58,y:boss.y+Math.sin(a)*58,vx:Math.cos(a)*520,vy:Math.sin(a)*520,life:1.85,enemy:true,damage:phase===3?34:28});
   }
   boss.volley=1.75;
  }
 }
}

function drawBossTelegraph() {
 const boss=bossShip();
 if(!boss?.active||boss.dead)return;
 if(boss.shrink){ctx.setLineDash([2,7]);ctx.beginPath();ctx.arc(boss.x,boss.y,boss.shrink,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
 if(!boss.windup&&!boss.flash)return;
 const end=bossBeamEnd(boss,boss.beamAngle), width=count('pylon',boss)?31:44;
 const offset={x:-Math.sin(boss.beamAngle)*width,y:Math.cos(boss.beamAngle)*width};
 if(boss.flash>0){
  ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=3;
  traceFilament(boss,end,renderTime*75,reduceMotion?1:7,22);
  ctx.restore();
 }
 ctx.strokeStyle='#fff';ctx.setLineDash(boss.windup>.14?[8,Math.max(1,boss.windup/(boss.maxWindup||1)*12)]:[]);
 for(const k of boss.windup?[-1,0,1]:[-1,-.5,0,.5,1]) {
  ctx.beginPath();ctx.moveTo(boss.x+offset.x*k,boss.y+offset.y*k);ctx.lineTo(end.x+offset.x*k,end.y+offset.y*k);ctx.stroke();
 }
 ctx.setLineDash([]);
}

let selectedTech='survey';
function researchStatus(tech) {
 if(hasTech(tech.id))return 'done';
 if(!tech.requires.every(hasTech))return 'locked';
 const cc=s.campaign;
 return cc.data>=tech.data&&cc.crystal>=tech.crystal&&cc.credits>=tech.credits?'ready':'funds';
}
const researchLabels={done:'Изучено',locked:'Закрыто',ready:'Доступно',funds:'Нужны ресурсы'};
function selectResearch(tech, reveal=false) {
 selectedTech=tech.id;
 for(const n of document.querySelectorAll('[data-tech]'))n.setAttribute('aria-pressed',String(n.dataset.tech===selectedTech));
 const detail=$('techDetail'), state=researchStatus(tech);
 const needs=tech.requires.map(id=>TECHS.find(x=>x.id===id).name);
 const cc=s.campaign;
 detail.innerHTML='<div class="panelMark">'+iconMarkup(tech.icon)+'<span>'+researchLabels[state]+'</span></div><h3>'+tech.name+'</h3><p>'+tech.desc+'</p>';
 if(needs.length)detail.innerHTML+='<p class="detailNote">Требуется: '+needs.join(' + ')+'</p>';
 if(state!=='done') {
  const costs=[[tech.data,cc.data,'данных'],[tech.crystal,cc.crystal,'крист.'],[tech.credits,cc.credits,'кр.']];
  detail.innerHTML+='<div class="techCost">'+costs.map(([price,have,label])=>
   '<span>'+price+' '+label+(have<price?' <b>−'+(price-have)+'</b>':'')+'</span>').join('')+'</div>';
 }
 if(state!=='done')detail.appendChild(button('Исследовать',()=>researchTech(tech.id),state!=='ready'));
 if(reveal)writeTechConnections();
}
function writeTechConnections() {
 if(modal!=='researchModal')return;
 const canvas=$('treeLinks'), box=$('treeArea').getBoundingClientRect();
 const g=canvas.getContext('2d'), ratio=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
 g.setTransform(ratio,0,0,ratio,0,0);
 g.clearRect(0,0,box.width,box.height);
 const nodes=new Map([...document.querySelectorAll('[data-tech]')].map(node=>[node.dataset.tech,node.getBoundingClientRect()]));
 g.strokeStyle='#fff';
 for(const tech of TECHS) {
  const to=nodes.get(tech.id);
  if(!to)continue;
  for(const parent of tech.requires) {
   const from=nodes.get(parent);
   if(!from)continue;
   const x1=from.left-box.left+from.width/2,x2=to.left-box.left+to.width/2;
   const y1=from.bottom-box.top,y2=to.top-box.top, step=Math.min(9,(y2-y1)/2), bend=y2-step;
   const active=tech.id===selectedTech;
   g.strokeStyle=active?'#fff':hasTech(parent)?'#848484':'#505050';
   g.lineWidth=active?2:1;
   g.setLineDash(hasTech(parent)?[]:[2,4]);
   g.beginPath();g.moveTo(x1,y1);
   if(tech.row-TECHS.find(t=>t.id===parent).row>1) {
    const lane=x1<box.width/2?3:box.width-3;
    g.lineTo(x1,y1+step);g.lineTo(lane,y1+step);g.lineTo(lane,bend);
   } else g.lineTo(x1,bend);
   g.lineTo(x2,bend);g.lineTo(x2,y2);g.stroke();
  }
 }
 g.setLineDash([]);
}
function renderResearch() {
 const tree=$('techTree');
 $('researchBalance').innerHTML=balanceMarkup();
 tree.replaceChildren();
 for(const tech of TECHS) {
  const state=researchStatus(tech);
  const node=button('',()=>selectResearch(tech,true));
  node.dataset.tech=tech.id;
  node.className='treeNode tree-'+state;
  node.style.gridRow=String(tech.row+1);node.style.gridColumn=String(tech.col);
  node.innerHTML=iconMarkup(tech.icon)+'<strong>'+tech.name+'</strong><small>'+researchLabels[state]+'</small>';
  tree.appendChild(node);
 }
 selectResearch(TECHS.find(t=>t.id===selectedTech)||TECHS[0]);
 requestAnimationFrame(writeTechConnections);
}
addEventListener('resize',writeTechConnections);

function nextRelic() {
 return PLACES.filter(p=>p.kind==='relic'&&!s.campaign.scanned.includes(p.id)).sort((a,b)=>distance(s,a)-distance(s,b))[0];
}
function nextPirate() {
 return GUARD_IDS.map(id=>s.enemies.find(e=>e.id===id)).find(e=>e&&!e.dead);
}
function markEnemy(enemy, gap=490) {
 if(!enemy||enemy.dead)return;
 closeModal();
 const d=distance(s,enemy)||1;
 setDestination(enemy.x+(s.x-enemy.x)/d*gap,enemy.y+(s.y-enemy.y)/d*gap);
 s.nav=enemy.id;
}
const escortDefeated = () => guardsDown()===3;
const battleRefit = () => count('gun')>=4 || count('rail')+count('plasma')+count('launcher')>=2 || count('shield')>=2;
function objectiveIndex() {
 const cc=s.campaign;
 if(cc.completed)return -1;
 if(cc.scanned.length<2)return 0;
 if(!battleRefit()&&!escortDefeated())return 1;
 if(!escortDefeated())return 2;
 if(cc.scanned.length<3)return 0;
 if(!bossShip()?.dead)return 3;
 if(!cc.commandCore)return 4;
 return 5;
}

function missionPlan() {
 const cc=s.campaign, boss=bossShip();
 const crystalNeeded=cc.gateReady?5:65, needsResonance=!cc.gateReady&&!hasTech('warp');
 const relic=nextRelic(), pirate=nextPirate();
 const wreck=s.asteroids.find(a=>a.loot?.commandCore);
 const gate=PLACES.filter(p=>p.kind==='gate').sort((a,b)=>distance(s,a)-distance(s,b))[0];
 const alloyDeposit=s.asteroids.filter(a=>!a.wreck&&canDrill(a)&&a.material==='ore'&&isExtractable(a))
  .sort((a,b)=>distance(s,a)-distance(s,b))[0];
 const scanOrder=['relic2','relic3','relic1'].map(id=>PLACES.find(p=>p.id===id)).find(p=>!cc.scanned.includes(p.id));
 const gateHint=cc.gateReady
  ? 'Для перехода нужны 5 кристаллов и 30 энергии.'
  : 'Нужно 180 сплава и 65 кристаллов. Пять из них уйдут на первый переход.';
 return [
  {title:'Просканируйте реликты',icon:'relic',done:cc.scanned.length===3,
   hint:cc.scanned.length<2?'Начните с «Эха» и Ковчега. Летите между ними через Причал, в стороне от вражеских врат.':'Завершите поиск на кладбище кораблей. Бастион охраняет подступы к «Ориону».',
   action:scanOrder?'К '+prettyName(scanOrder.name):null,run:scanOrder?()=>routeTo(scanOrder):null,
   side:relic&&relic!==scanOrder?{label:'К ближайшим руинам',run:()=>routeTo(relic)}:null},
  {title:'Усильте корабль',icon:'build',done:battleRefit()||escortDefeated(),
   hint:'Добавьте орудия, радиаторы и реактор. Реликты и доставка деталей дают данные и кредиты на новые технологии.',
   action:'Открыть верфь',run:()=>toggleBuild(),side:alloyDeposit?{label:'Добыть сплав',run:()=>{closeModal();startMining(alloyDeposit);}}:null},
  {title:'Снимите блокаду',icon:'target',done:escortDefeated(),
   hint:'Клинок, Бастион и Страж врат. Между боями пополняйте боезапас и ремонтируйтесь у станции.',
   action:pirate?'К цели: '+pirate.name:null,run:pirate?()=>markEnemy(pirate):null},
  {title:'Одолейте Смотрителя',icon:'enemy',done:!!boss?.dead,
   hint:'Сбейте боковые излучатели и атакуйте ядро. Когда появится разметка луча, двигайтесь поперёк неё.',
   action:'К флагману',run:bossUnlocked()&&!boss?.dead?()=>markEnemy(boss,640):null},
  {title:'Извлеките командный ключ',icon:'mine',done:cc.commandCore,
   hint:'Разберите остов Смотрителя. Для ключа и данных место в трюме не требуется. Сплав до отсека займёт до 85 мест.',
   action:'Разобрать остов',run:wreck?()=>{closeModal();startMining(wreck);}:null},
  {title:'Восстановите врата и пройдите через них',icon:'gate',done:cc.completed,
   hint:gateHint+(cc.completed?'':' Кристаллы '+cc.crystal+' / '+crystalNeeded+(cc.gateReady?'':', сплав '+s.ore+' / 180')+'.'),
   action:needsResonance?'Исследовать резонанс':'К ближайшим вратам',
   run:cc.commandCore?()=>{if(needsResonance){$('research').click();selectResearch(TECHS.find(t=>t.id==='warp'),true);}else routeTo(gate);}:null}
 ];
}

function renderMission(out) {
 if(isStory()&&!s.won){renderActJournal(out);return;}
 const list=missionPlan(),active=objectiveIndex();
 const completed=list.filter(step=>step.done).length;
 const hero=document.createElement('div');
 hero.className='missionHero campaignHero';
 hero.innerHTML='<div class="campaignArt">'+iconMarkup('gate')+'</div><div><h2>'+(s.won?'Чёрный сектор открыт':'Экспедиция «Порог»')+'</h2><p>'+(s.won?'Врата соединяют оба края сектора. Можно продолжить полёт, торговлю и исследования.':'Освободите сектор и совершите первый переход.')+'</p><div class="campaignProgress"><progress aria-label="Этапы экспедиции" max="'+list.length+'" value="'+completed+'"></progress><b>'+completed+' / '+list.length+'</b></div></div>';
 out.appendChild(hero);
 const timeline=document.createElement('div');
 timeline.className='missionTimeline';
 const order=list.map((_,n)=>n);
 if(active>=0)order.unshift(...order.splice(active,1));
 for(const n of order) {
  const stage=list[n];
  const line=document.createElement('article');
  line.className='missionStep'+(stage.done?' stageDone':n===active?' stageActive':'');
  line.innerHTML='<div class="stepMark">'+iconMarkup(stage.icon)+'</div><div>'+(n===active?'<div class="eyebrow">Текущая цель</div>':stage.done?'<div class="eyebrow">Выполнено</div>':'')+'<h3>'+stage.title+'</h3>'+(stage.done?'':'<p>'+stage.hint+'</p>')+'</div>';
  if(!stage.done&&(stage.run||stage.side)) {
   const actions=document.createElement('div');
   actions.className='stepActions';
   if(stage.run){const action=button(stage.action,stage.run);if(n===active)action.classList.add('primary');actions.appendChild(action);}
   if(stage.side)actions.appendChild(button(stage.side.label,stage.side.run));
   line.appendChild(actions);
  }
  timeline.appendChild(line);
 }
 out.appendChild(timeline);
}

$('objective').onclick=()=>{journalTab='mission';$('journal').click();};

function updateCampaignHud(resource) {
 const boss=bossShip();
 const story=actObjective(),stage=objectiveIndex(),objective=$('objective');
 objective.hidden=!story&&stage<0||s.dead||paused||Boolean(s.destination||resource||s.campaign.scan||boss?.active&&!boss.dead||targetInRange);
 if(!objective.hidden) {
  const cc=s.campaign;
  const labels=['Реликты '+cc.scanned.length+' / 3','Усильте корабль','Блокада '+guardsDown()+' / 3','Одолейте Смотрителя','Заберите ключ из остова',cc.gateReady?'Совершите переход':'Восстановите врата'];
  setHudText('objectiveText',story?story.title:labels[stage]);
 }
 const box=$('bossHud');
 box.hidden=!boss?.active||boss.dead;
 if(!box.hidden) {
  const emitters=count('pylon',boss), health=core(boss)?.hp||0;
  setHudText('bossPhase',boss.windup?'Уходите поперёк луча':emitters?'Излучатели '+emitters+' / 2':boss.shrink?'Арена сужается':'Ядро открыто');
  const max=core(boss)?moduleMaxHp(core(boss)):types.bossCore.hp;
  setHudText('bossHealth',Math.ceil(health)+' / '+max);$('bossBar').max=max;
  $('bossBar').value=health;
 }
 $('miningHud').hidden=!resource||Boolean(s.destination);
 if(resource&&!s.destination) {
  setHudText('miningTitle',mineralLabel(resource)+(resource.wreck?'':' · '+rockSize(resource).toLowerCase()));
  setHudText('miningLayer',s.miningWait||miningDescription(resource));
 }
}
$('miningHud').onclick=()=>$('systems').click();
$('miningMode').onclick=()=>{
 const cc=s.campaign;
 cc.miningMode=cc.miningMode==='boost'?'balanced':'boost';
 save(false);renderSystems();
};
