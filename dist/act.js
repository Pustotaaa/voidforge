'use strict';

const ACT_SCENES=[
 {title:'Выход из дока',hint:'Добудьте 30 единиц сплава в облаке у Причала.',icon:'mine'},
 {title:'Первый контакт',hint:'Остановите «Иглу». Выберите двигатель на схеме цели, затем разберите остов.',icon:'target'},
 {title:'Свой первый модуль',hint:'Поставьте трофей на верфи и изучите «Полевой сервис».',icon:'build'},
 {title:'Сигнал «Эхо»',hint:'Держитесь в контуре маяка 20 секунд. Следите за нагревом и ракетами Гарпуна.',icon:'relic'},
 {title:'Бастион',hint:'Усильте корабль: три орудия и щит или орудие Mk II. Снимите щит Бастиона, проломите броню, поразите реактор.',icon:'shield'},
 {title:'По следу Смотрителя',hint:'После пролёта Смотрителя найдите Ковчег в Белом саду. Док сбрасывает угрозу.',icon:'relic'},
 {title:'Запуск сети',hint:'Победите Клинка и Стража врат. Затем восстановите архив «Ориона».',icon:'gate'},
 {title:'Смотритель',hint:'Сбейте излучатели, приготовьтесь к рою дронов и берегите рывок для луча. После боя верните ключ и запустите врата.',icon:'enemy'}
];
const SIGNAL_TYPES={
 wreck:{title:'Дрейфующий остов',icon:'parts',text:'В отсеках осталась военная электроника.'},
 cache:{title:'Грузовой контейнер',icon:'cargo',text:'Контейнер зарегистрирован как потерянный при эвакуации.'},
 anomaly:{title:'Аномалия',icon:'science',text:'Здесь можно снять показания и восстановить данные.'},
 trap:{title:'Пиратский тайник',icon:'enemy',text:'Свежий след двигателя. Кто-то оставил здесь работающие мины.'},
 sos:{title:'Сигнал SOS',icon:'npc',text:'Автоматика просит восстановить аварийный маяк.'}
};
const SIGNALS=[
 ['cache',470,180],['wreck',-520,540],['anomaly',760,-420],['trap',-1090,-590],
 ['sos',1460,-1090],['cache',2200,-1730],['wreck',1140,1230],['anomaly',2300,1530],
 ['trap',-1570,1150],['sos',-2280,-530],['wreck',-2050,2080],['cache',780,2090]
];
const RELIC_BOONS={
 trace:{label:'Показать слабое место',text:'Приоритет излучателя или ядра',icon:'target'},
 break:{label:'Отключить щит на 5 с',text:'Уязвимы все модули',icon:'shield'},
 slow:{label:'Замедлить луч',text:'Больше времени на уклонение при следующем заряде',icon:'brake'}
};
const RADIO_LINES=[
 ['ЛЕЯ ВОСС','Пилот, шлюз открыт. Выталкиваю корабль. Доверните нос и возьмите курс к залежи.'],
 ['ЛЕЯ ВОСС','Начните с тридцати единиц сплава. Касание залежи ведёт на рабочую дистанцию.'],
 ['ЛЕЯ ВОСС','Метка «Игла» у пояса. Цельтесь в двигатель. Тогда разведчик потеряет тягу.'],
 ['ЛЕЯ ВОСС','В остове ещё есть целый модуль. Подберите его и проверьте гнездо на верфи.'],
 ['ЛЕЯ ВОСС','Три сигнала на границе обзора. Импульс сканера покажет, что скрывает каждый.'],
 ['ИИ МАЯКА','Эхо на связи. Держитесь в контуре двадцать секунд. Восточный канал заблокирован.'],
 ['ИИ МАЯКА','Фрагмент восстановлен. Возьмите протокол против Смотрителя. Гарпун шёл по вашему следу.'],
 ['ЛЕЯ ВОСС','Бастион перекрывает кладбище. Сначала щит, потом броня. Док остаётся под защитой.'],
 ['СМОТРИТЕЛЬ','Обнаружен чужой резонанс. Патрулям приказано перехватить нарушителя.'],
 ['ИИ МАЯКА','Ковчег подтвердил координаты. Последний архив у «Ориона». Страж уже ждёт.']
];

const ACT_TECH={id:'fieldService',name:'Полевой сервис',icon:'repair',row:1,col:1,requires:['survey'],data:10,crystal:0,credits:40,desc:'Позволяет улучшать установленные модули до Mk II. Добавляет практику работы с трофеями.'};
for(const tech of TECHS)tech.row++;
TECHS.unshift({...ACT_TECH,row:1,col:3});
Object.assign(types,{
 droneCore:{name:'Контактный заряд',cost:0,hp:15,mass:2,icon:'target',npcOnly:true},
 mineRack:{name:'Минный разбрасыватель',cost:0,hp:54,mass:5,npcOnly:true},
 repairBeam:{name:'Ремонтный излучатель',cost:0,hp:49,mass:6,npcOnly:true}
});
Object.assign(ENEMY_INFO,{
 drone:{rank:'Дрон-камикадзе',tier:1,tactic:'Уничтожьте дрон до сближения. Точечная оборона перехватывает его автоматически.',range:0,speed:195,cool:0,attack:0},
 layer:{rank:'Минёр',tier:3,tactic:'Ставит мины на траектории. Следите за кольцами взведения.',range:380,speed:86,cool:1.5,attack:555},
 tender:{rank:'Ремонтник',tier:3,tactic:'Восстанавливает модули союзника. Уничтожьте излучатель или смените приоритет.',range:630,speed:86,cool:1.5,attack:500}
});

function configureAct(state) {
 const prior=state.campaign.act;
 state.campaign.act={
  story:false,stage:0,entries:[],deaths:0,spent:{},starterOre:0,threat:0,patrolIn:68,
  surveyed:{},revealed:{},resolved:{},boons:{},used:[],mines:[],serial:0,...prior
 };
 const act=state.campaign.act;
 act.stage=Number.isInteger(act.stage)?clamp(act.stage,0,7):0;
 act.threat=Number.isFinite(act.threat)?clamp(act.threat,0,5):0;
 if(!Array.isArray(act.entries))act.entries=[];
 state.stats.timeline=act.entries;state.stats.resourcesSpent=act.spent;state.stats.deaths=act.deaths;
 delete act.scanPulse;delete act.dash;delete act.flyby;
 state.dashCooldown=0;
}

function beginAct() {
 configureAct(s);
 const act=s.campaign.act;
 act.story=true;act.stage=0;act.noticeIn=9;restoreDeathRecord(true);act.entries.push({scene:0,time:0});
 s.ore=65;s.vx=32;s.angle=Math.PI/2;
 const alloy=s.asteroids.filter(a=>!a.wreck&&a.material==='ore');
 const multiplier=Math.min(1,1770/alloy.reduce((sum,a)=>sum+a.ore,0));
 for(const a of alloy) {
  a.ore=Math.ceil(a.ore*multiplier);
  a.reserve=a.ore;
  if(a.work)a.work.surface=Math.ceil(a.work.surface*multiplier);
 }
 s.asteroids.push({id:'first-vein',x:307,y:-135,r:23,ore:44,reserve:44,seed:7,material:'ore'});
 const scout=s.enemies.find(e=>e.id==='scout');
 scout.modules.push(makeModule(-1,0,'armor'),makeModule(1,0,'armor'),makeModule(0,-2,'gun'));
 const skirmisher=s.enemies.find(e=>e.archetype==='skirmisher');
 skirmisher.modules.push(makeModule(0,2,'shield'),makeModule(-1,-2,'armor'),makeModule(0,-2,'armor'),makeModule(1,-2,'armor'));
 for(const m of skirmisher.modules)if(m.type==='reactor'||m.type==='shield'){m.reinforced=true;m.hp=moduleMaxHp(m);}
 skirmisher.shield=90;
 const sniper=s.enemies.find(e=>e.archetype==='sniper');
 sniper.modules.push(makeModule(-2,-1,'armor'),makeModule(2,-1,'armor'),makeModule(-2,0,'armor'),makeModule(2,0,'shield'),makeModule(0,-3,'armor'));
 for(const m of sniper.modules)if(m.type==='armor'||m.type==='reactor'){m.reinforced=true;m.hp=moduleMaxHp(m);}
 sniper.shield=90;
 const bastion=s.enemies.find(e=>e.archetype==='tank');
 bastion.modules.push(makeModule(0,3,'shield'),makeModule(0,-2,'armor'),makeModule(-1,-2,'plasma'));bastion.shield=180;
 const watcher=bossShip();
 for(const m of watcher.modules)if(m.type==='bossCore'||m.type==='pylon'){
  m.reinforced=true;m.hp=moduleMaxHp(m);
 }
 syncFlightPose();
 actRadio(0);
}

const actState=()=>s.campaign.act;
const isStory=()=>Boolean(s?.campaign?.act?.story);
const threatLevel=()=>Math.min(5,Math.floor(actState().threat+1e-9));
const upgradedWing=()=>count('gun')+count('rail')+count('plasma')+count('launcher')>=3 &&
 (count('shield')>0||s.modules.some(m=>m.mk===2&&WEAPONS[m.type]));
function actRadio(index) {
 const [speaker,message]=RADIO_LINES[index];
 radioCard={speaker,message,until:s.stats.time+6.8};
 log(speaker+' · '+message);
}
let radioCard=null;
function recordAct(value) {
 const entries=actState().entries;
 entries.push({event:value,time:Math.round(s.stats.time)});
 if(entries.length>80)entries.splice(0,entries.length-80);
}
function spendAct(key,value) {
 if(value<=0)return;
 const spent=actState().spent;
 spent[key]=(spent[key]||0)+value;
}
function advanceAct(stage, line) {
 const act=actState();
 act.stage=stage;act.entries.push({scene:stage,time:Math.round(s.stats.time)});
 if(line!==undefined)actRadio(line);
 save(false);
}
function recordExtraction(item, amount) {
 const act=actState();
 if(act.story&&act.stage===0&&item==='ore')act.starterOre+=amount;
}
function lockDockSecurity() {
 const act=actState();
 act.threat=0;act.patrolIn=68;
}
function actCanScan(p) {
 if(!isStory())return true;
 const stage=actState().stage;
 return p.id==='relic2'?stage>=3:p.id==='relic3'?stage>=5:stage>=6&&guardsDown()===3;
}
function actScanStart(p) {
 if(!isStory()||p.id!=='relic2')return;
 const wing=s.enemies.find(e=>e.id==='wing-gate');
 if(!actState().echoAttack&&wing&&!wing.dead){
  actState().echoAttack=true;
  wing.home={x:p.x+470,y:p.y+260};
  wing.x=wing.home.x;wing.y=wing.home.y;
  actRadio(5);
 }
}
function actScanned(p) {
 const act=actState();
 act.threat=clamp(act.threat+1.25,0,5);recordAct('scan:'+p.id);
 if(isStory()) {
  if(p.id==='relic2') {
   grantCacheTrophy('pointDefense',6);
   advanceAct(4,6);
  } else if(p.id==='relic3')advanceAct(6,9);
  else advanceAct(7);
  showRelicReward(p);
 }
}
function actEnemyReady(enemy) {
 if(!isStory())return true;
 const stage=actState().stage;
 if(enemy.id==='scout')return stage>=1;
 if(enemy.id==='pirate-1'||enemy.id==='wing-bastion')return stage>=4;
 if(enemy.id==='wing-gate')return stage>=3&&actState().echoAttack;
 if(enemy.id==='pirate-0'||enemy.id==='pirate-2')return stage>=6||enemy.id==='pirate-0'&&stage>=4;
 return true;
}
function actEnemyDestroyed(enemy, wreck) {
 const act=actState();
 act.threat=clamp(act.threat+(enemy.archetype==='drone'?.06:.45),0,5);
 if(enemy.archetype!=='drone')recordAct('kill:'+enemy.id);
 if(act.story&&act.stage===1&&enemy.id==='scout') {
  wreck.loot.data=Math.max(15,wreck.loot.data);
  wreck.loot.module={type:'gun',hp:Math.round(types.gun.hp*.76),quality:'hot'};
  advanceAct(2,3);
 }
}
function actProtects(ship, module) {
 if(!isStory()||ship.archetype!=='tank'||module.type!=='reactor'||module!==core(ship))return false;
 if(!upgradedWing()||count('shield',ship)>0&&(ship.shield||0)>1||count('armor',ship)>6) {
  ship.deflect=.15;
  return true;
 }
 return false;
}
function refreshAct(dt) {
 const act=actState();
 advanceRadar(dt);
 if(!act.story&&!act.patrolsEnabled){updateMines(dt);return;}
 if(isSafe(s))lockDockSecurity();
 else {
  act.threat=Math.min(5,act.threat+dt*(zoneAt(s).id==='rift'?.014:.008));
  act.patrolIn-=dt;
  if(act.stage>=4&&act.patrolIn<=0&&threatLevel()>=2) {
   act.patrolIn=84-threatLevel()*10;
   if(!s.enemies.some(e=>!e.dead&&e.patrolActor))sendHunters(threatLevel());
  }
 }
 if(act.flyby) {
  act.flyby.time-=dt;
  if(act.flyby.time<=0){delete act.flyby;sendHunters(4);}
 }
 if(act.noticeIn!==undefined){
  act.noticeIn-=dt;
  if(act.noticeIn<=0){delete act.noticeIn;actRadio(1);}
 }
 if(act.stage===0&&act.starterOre>=30) {
  const scout=s.enemies.find(e=>e.id==='scout');
  scout.home={x:560,y:-190};scout.x=560;scout.y=-190;scout.angle=-Math.PI/2;scout.cool=.28;
  advanceAct(1,2);
 }
 if(act.stage===2&&hasTech('fieldService')&&hasFittedTrophy())advanceAct(3,4);
 if(act.stage===4&&s.enemies.find(e=>e.id==='pirate-1')?.dead) {
  act.threat=Math.max(2,act.threat);
  act.flyby={x:s.x,y:s.y,time:4};
  advanceAct(5,8);
 }
 updateMines(dt);
 updateLooseTrophies(dt);
}
const hasFittedTrophy=()=>actState().trophyFitted||s.modules.some(m=>m.origin==='trophy');
function actObjective() {
 if(!isStory()||s.won)return null;
 return ACT_SCENES[actState().stage];
}
function actRoute() {
 const act=actState();
 const enemy=id=>s.enemies.find(e=>e.id===id&&!e.dead);
 const relic=id=>PLACES.find(p=>p.id===id);
 closeModal();
 switch(act.stage) {
  case 0:startMining(s.asteroids.find(a=>a.id==='first-vein'&&isExtractable(a))||s.asteroids.find(a=>a.material==='ore'&&isExtractable(a)&&canDrill(a)));break;
  case 1:markEnemy(enemy('scout'),290);break;
  case 2:{
   const wreck=s.asteroids.find(a=>a.id==='wreck-scout'&&a.loot?.module);
   if(wreck)startMining(wreck);
   else if(hasFittedTrophy()){$('research').click();selectResearch(ACT_TECH,true);}
   else toggleBuild();
   break;
  }
  case 3:approach(relic('relic2'));break;
  case 4:if(upgradedWing())markEnemy(enemy('pirate-1'),620);else toggleBuild();break;
  case 5:approach(relic('relic3'));break;
  case 6:{
   const guard=enemy('pirate-0')||enemy('pirate-2');
   if(guard)markEnemy(guard,660);else approach(relic('relic1'));
   break;
  }
  case 7:if(!bossShip()?.dead)markEnemy(bossShip(),650);else if(!s.campaign.commandCore)startMining(s.asteroids.find(a=>a.loot?.commandCore));else routeTo(PLACES.filter(p=>p.kind==='gate').sort((a,b)=>distance(s,a)-distance(s,b))[0]);break;
 }
}

function showRelicReward(place) {
 const act=actState();
 if(act.boons[place.id])return;
 $('relicTitle').textContent=prettyName(place.name);
 $('relicLore').textContent=place.lore;
 const options=$('relicBoons');options.replaceChildren();
 for(const [id,boon] of Object.entries(RELIC_BOONS)) {
  const action=button(boon.label,()=>{act.boons[place.id]=id;save(false);closeModal();});
  action.innerHTML=iconMarkup(boon.icon)+'<span><b>'+boon.label+'</b><small>'+boon.text+'</small></span>';
  options.appendChild(action);
 }
 openModal('relicModal');
}
function useRelicBoon() {
 if(modal||s.dead||!bossShip()?.active||bossShip().dead)return;
 const act=actState(),boss=bossShip();
 const choice=Object.entries(act.boons).find(([place])=>!act.used.includes(place));
 if(!choice)return;
 const [place,boon]=choice;
 act.used.push(place);
 if(boon==='trace') {
  const module=boss.modules.find(m=>m.type==='pylon')||core(boss);
  aimedCell={id:boss.id,x:module.x,y:module.y};
  boss.traced=true;
 } else if(boon==='break')boss.suppressed=5;
 else if(boss.windup>0)boss.windup+=.88;
 else boss.slowBeam=true;
 toast(RELIC_BOONS[boon].label);recordAct('boon:'+boon);save(false);
}

const DASH={time:.25,energy:25,cooldown:4,heat:15};
function startDash() {
 if(modal||paused||s.dead||s.overheated||s.energy<DASH.energy||s.dashCooldown>0)return false;
 const input=manualInput();
 const cos=Math.cos(s.angle),sin=Math.sin(s.angle);
 const x=input.x||input.y?input.x:0,y=input.x||input.y?input.y:-1;
 const n=Math.hypot(x,y);
 const held=s.campaign.scan;
 cancelPilot();s.campaign.scan=held;s.braking=false;
 s.energy-=DASH.energy;s.heat=Math.min(100,s.heat+DASH.heat);s.dashCooldown=DASH.cooldown;
 actState().dash={x:(x*cos-y*sin)/n,y:(x*sin+y*cos)/n,left:DASH.time};
 dashFeedback(actState().dash);
 actState().cruise=false;
 playSound('dash');recordAct('dash');
 return true;
}
function updateDash(dt) {
 s.dashCooldown=Math.max(0,(s.dashCooldown||0)-dt);
 const dash=actState().dash;
 if(!dash)return;
 s.vx+=dash.x*1520*dt;s.vy+=dash.y*1520*dt;
 dash.left-=dt;
 if(dash.left<=0)delete actState().dash;
}
function toggleCruise() {
 if(modal||paused||s.dead)return;
 const act=actState();
 act.cruise=!act.cruise;
 toast(act.cruise?'Импульсный ход готов. Держите тягу или задайте курс.':'Импульсный ход отключён.');
}
function cruiseLimit(dt,manual,limit) {
 const act=actState();
 act.cruiseActive=Boolean(act.cruise&&(manual||s.destination)&&!act.dash&&!s.overheated&&s.energy>=4);
 if(!act.cruiseActive)return limit;
 s.energy=Math.max(0,s.energy-26*dt);
 s.heat=Math.min(100,s.heat+2.2*dt);
 return 420;
}

const RADAR_CELL=275;
const radarKey=(x,y)=>x+','+y;
function recordRadar(radius, identify=false) {
 const act=actState();
 for(let y=Math.floor((s.y-radius)/RADAR_CELL);y<=Math.floor((s.y+radius)/RADAR_CELL);y++)
  for(let x=Math.floor((s.x-radius)/RADAR_CELL);x<=Math.floor((s.x+radius)/RADAR_CELL);x++) {
   const p={x:(x+.5)*RADAR_CELL,y:(y+.5)*RADAR_CELL};
   if(distance(s,p)<=radius)act.surveyed[radarKey(x,y)]=true;
  }
 for(const signal of signals())if(distance(s,signal)<=(identify?radius:180))act.revealed[signal.id]=true;
}
function advanceRadar(dt) {
 const act=actState();
 act.radarIn=(act.radarIn||0)-dt;
 if(act.radarIn<=0){act.radarIn=.35;recordRadar(act.scanPulse?900:zoneAt(s).id==='silence'?275:460,Boolean(act.scanPulse));}
 if(act.scanPulse){
  act.scanPulse=Math.max(0,act.scanPulse-dt);
  if(!act.scanPulse)save(false);
 }
}
function startRadar() {
 if(s.dead||paused||modal||actState().scanPulse||s.energy<12)return false;
 s.energy-=12;actState().scanPulse=3;recordRadar(900,true);
 toast('Импульс сканера · 900 м');playSound('scan');recordAct('radar');
 return true;
}
function signals() {
 const act=actState();
 if(act.story&&act.stage<3)return [];
 return SIGNALS.map(([kind,baseX,baseY],i)=>{
  const id='signal-'+i,type=SIGNAL_TYPES[kind],known=Boolean(act.revealed[id]);
  const drift=kind==='wreck'?Math.sin((s.stats.time+i*12)/42)*85:0;
  return {id,kind:'signal',signature:kind,known,x:baseX+drift,y:baseY+drift*.32,
   name:known?type.title+' '+(i+1):'НЕИЗВЕСТНЫЙ СИГНАЛ '+(i+1),
   text:known?type.text:'Подлетите или используйте импульс сканера, чтобы узнать тип сигнала.'};
 }).filter(p=>!act.resolved[p.id]);
}
const isCharted=p=>!isStory()||Boolean(actState().surveyed[radarKey(Math.floor(p.x/RADAR_CELL),Math.floor(p.y/RADAR_CELL))]);
function visibleSignal(p){return p.known||Number(p.id.split('-')[1])<3;}
function ejectTrophy(ship,module) {
 if(!isStory()||ship===s||ship.debrisClaimed||module.type==='reactor'||types[module.type].npcOnly)return;
 ship.debrisClaimed=true;
 const point=position(ship,module),angle=Math.atan2(point.y-ship.y,point.x-ship.x);
 const a={id:'ejected-'+(++actState().serial),...point,r:12,ore:0,seed:3,wreck:true,material:'salvage',
  drift:{x:Math.cos(angle)*48,y:Math.sin(angle)*48,left:2.6},
  loot:{parts:0,crystal:0,data:0,module:{type:module.type,hp:Math.max(1,Math.floor(module.hp*.62)),quality:trophyQuality(module.type)}}};
 s.asteroids.push(a);
}
function updateLooseTrophies(dt) {
 for(const a of s.asteroids) {
  if(!a.drift)continue;
  a.x=clamp(a.x+a.drift.x*dt,-LIMIT,LIMIT);a.y=clamp(a.y+a.drift.y*dt,-LIMIT,LIMIT);
  a.drift.left-=dt;
  if(a.drift.left<=0)delete a.drift;
 }
}
function grantCacheTrophy(type, damage=0) {
 const act=actState();
 const module={type,quality:trophyQuality(type)};module.hp=Math.max(1,moduleMaxHp(module)-damage);
 if(freeCargo()>=SALVAGE_SPACE)s.campaign.spareModules.push({...module,id:++s.campaign.salvageSerial});
 else {
  s.asteroids.push({id:'cache-'+(++act.serial),x:s.x+92,y:s.y+35,r:12,ore:0,seed:1,wreck:true,material:'salvage',
   loot:{parts:0,crystal:0,data:0,module}});
  toast('Трофей оставлен в контейнере рядом с кораблём.');
 }
}
function inspectSignal(p) {
 const act=actState();
 if(act.resolved[p.id]||!canInteract(p))return false;
 act.revealed[p.id]=true;act.resolved[p.id]=true;
 const rewards={wreck:[18,40],cache:[7,85],anomaly:[30,25],trap:[22,135],sos:[16,100]};
 const [data,credits]=rewards[p.signature];
 s.campaign.data+=data;s.campaign.credits+=credits;
 if(p.signature==='wreck')grantCacheTrophy('armor',22);
 if(p.signature==='cache')changeResource('parts',Math.min(2,freeFor('parts')));
 if(p.signature==='trap'){act.patrolsEnabled=true;deployMine(p);act.threat=Math.min(5,act.threat+1.25);sendHunters(Math.max(2,threatLevel()));}
 if(p.signature==='anomaly'){s.energy=Math.min(100,s.energy+45);s.heat=Math.min(100,s.heat+14);}
 if(p.signature==='sos')grantCacheTrophy('engine',18);
 recordAct(p.id);closeModal();save(false);
 log(SIGNAL_TYPES[p.signature].title+' · +'+data+' данных · +'+credits+' кр.');
 toast('Сигнал исследован · +'+data+' данных · +'+credits+' кр.');
 return true;
}

function spawnActor(kind, at, angle, bossEscort=false) {
 const act=actState(),home={
  x:clamp(at.x+Math.cos(angle)*460,-LIMIT+90,LIMIT-90),
  y:clamp(at.y+Math.sin(angle)*460,-LIMIT+90,LIMIT-90)
 };
 const modules=kind==='drone'?[makeModule(0,0,'droneCore')]:base();
 if(kind==='layer')modules.push(makeModule(2,0,'mineRack'));
 if(kind==='tender')modules.push(makeModule(-2,0,'repairBeam'));
 const names={drone:'ОСКОЛОК',layer:'КЛЕЩ',tender:'ЛАТКА'};
 s.enemies.push({...home,home,id:'actor-'+(++act.serial),name:names[kind],archetype:kind,
  patrolActor:true,bossEscort,angle,modules,dead:false,vx:0,vy:0,cool:1.7});
}
function sendHunters(level) {
 s.enemies=s.enemies.filter(e=>!e.patrolActor||!e.dead);
 spawnActor('layer',s,-.45);
 if(level>=3||actState().stage>=5)spawnActor('tender',s,1.4);
 if(level>=4)deploySwarm(s,level===5?5:3);
 actRadio(8);toast('Патруль охотников · угроза '+level+'/5');
}
function deploySwarm(at, size, bossEscort=false) {
 const heading=Math.atan2(s.y-at.y,s.x-at.x);
 for(let i=0;i<size;i++)spawnActor('drone',at,heading+(i-(size-1)/2)*.64,bossEscort);
}
function deployMine(source) {
 const act=actState();
 if(act.mines.length>=18)return;
 act.mines.push({x:clamp(source.x-(source.vx||0)*.26,-LIMIT,LIMIT),y:clamp(source.y-(source.vy||0)*.26,-LIMIT,LIMIT),life:22,arming:1.1});
}
function updateMines(dt) {
 const act=actState();
 for(const mine of act.mines) {
  mine.life-=dt;mine.arming=Math.max(0,mine.arming-dt);
  if(mine.life>0&&!mine.arming&&!isSafe(s)&&distance(mine,s)<56){
   mine.life=0;encounterExplosion(mine,73,78);
  }
 }
 act.mines=act.mines.filter(m=>m.life>0);
}
function encounterExplosion(point,radius,damage) {
 shipBurst(point);
 const total=s.modules.slice().filter(m=>distance(point,position(s,m))<radius);
 for(const m of total) {
  if(s.dead)break;
  if(s.modules.includes(m))hit(s,m,damage/Math.sqrt(total.length),'explosive');
 }
}
function moveDrone(enemy, dt) {
 if(isSafe(s)){
  accelerate(enemy,0,0,220,dt);enemy.x+=enemy.vx*dt;enemy.y+=enemy.vy*dt;
  return;
 }
 const dx=s.x-enemy.x,dy=s.y-enemy.y,n=Math.hypot(dx,dy)||1;
 accelerate(enemy,dx/n*195,dy/n*195,300,dt);
 enemy.angle=Math.atan2(dy,dx)+Math.PI/2;
 enemy.x+=enemy.vx*dt;enemy.y+=enemy.vy*dt;
 if(n<shipPhysics().radius*.6+19) {
  enemy.dead=true;enemy.modules=[];
  encounterExplosion(enemy,64,69);
 }
}
function enemySystems(enemy, dt, engaged) {
 if(!engaged)return;
 if(enemy.archetype==='layer'&&activeCount('mineRack',enemy)&&distance(s,enemy)<650) {
  enemy.mineIn=(enemy.mineIn??1.4)-dt;
  if(enemy.mineIn<=0){enemy.mineIn=3.4;deployMine(enemy);}
 }
 if(enemy.archetype==='tender'&&activeCount('repairBeam',enemy)){
  const ally=s.enemies.find(e=>e!==enemy&&!e.dead&&e.archetype!=='drone'&&distance(e,enemy)<520&&e.modules.some(m=>m.hp<moduleMaxHp(m)));
  const module=ally?.modules.reduce((best,m)=>m.hp/moduleMaxHp(m)<best.hp/moduleMaxHp(best)?m:best,ally.modules[0]);
  if(module) {
   module.hp=Math.min(moduleMaxHp(module),module.hp+14*dt);
   enemy.healing={x:ally.x,y:ally.y};
  } else delete enemy.healing;
 }
}
function drawEncounterMarkers() {
 const act=actState();
 ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.font='12px monospace';
 for(const m of act.mines) {
  const r=m.arming?12:18+3*Math.sin(clock*10);
  ctx.setLineDash(m.arming?[3,3]:[]);
  ctx.beginPath();ctx.arc(m.x,m.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeRect(m.x-4,m.y-4,8,8);
 }
 for(const p of signals()) {
  if(distance(s,p)>650)continue;
  const x=p.x,y=p.y;
  ctx.strokeRect(x-12,y-12,24,24);
  ctx.fillText(p.known?'◇':'?',x-4,y+4);
 }
 for(const e of s.enemies)if(!e.dead&&e.healing) {
  ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.healing.x,e.healing.y);ctx.stroke();ctx.setLineDash([]);
 }
 if(act.scanPulse)drawRadarSweep(act.scanPulse);
 if(act.flyby) {
  const x=act.flyby.x+((4-act.flyby.time)/4-.5)*1000,y=act.flyby.y-138;
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/2);
  for(const [mx,my] of [[-2,0],[-1,-1],[0,-2],[1,-1],[2,0],[-1,0],[0,0],[1,0],[0,1]])drawModule(ctx,mx*22,my*22,{type:'armor',hp:types.armor.hp});
  ctx.restore();
  ctx.setLineDash([6,7]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+220,y+400);ctx.stroke();ctx.setLineDash([]);
 }
}
function drawRadarFog(pixel,width,height,scale) {
 if(!isStory())return;
 sg.save();
 sg.fillStyle=fogPattern(sg)||'#000';
 for(let y=-10;y<10;y++)for(let x=-10;x<10;x++) {
  if(actState().surveyed[radarKey(x,y)])continue;
  const at=pixel({x:x*RADAR_CELL,y:y*RADAR_CELL}),len=RADAR_CELL*scale;
  if(at.x+len<0||at.y+len<0||at.x>width||at.y>height)continue;
  sg.fillRect(Math.floor(at.x),Math.floor(at.y),Math.ceil(len),Math.ceil(len));
 }
 sg.restore();
}
let cachedFog=null;
function fogPattern(g) {
 if(cachedFog)return cachedFog;
 const tile=document.createElement('canvas'), ink=tile.getContext('2d');
 tile.width=8;tile.height=8;
 ink.fillStyle='#000';ink.fillRect(0,0,8,8);ink.fillStyle='#424242';
 ink.fillRect(0,0,1,1);ink.fillRect(4,4,1,1);
 cachedFog=g.createPattern?.(tile,'repeat');
 return cachedFog;
}

const TROPHY_QUALITIES={hot:'Форсировка',light:'Облегчённая рама'};
const trophyQuality=type=>WEAPONS[type]?'hot':type==='armor'?'light':undefined;
const moduleMaxHp=m=>Math.round(types[m.type].hp*(m.quality==='light'?.8:1)*(m.mk===2?1.25:1)*(m.reinforced===true?1.5:1));
const moduleName=m=>types[m.type].name+(m.mk===2?' Mk II':'')+(TROPHY_QUALITIES[m.quality]?' · '+TROPHY_QUALITIES[m.quality]:'');
const moduleMass=m=>(types[m.type].mass||8)*(m.quality==='light'?.72:1)*(m.mk===2?1.08:1);
let upgradeTile=null;
function upgradeQuote(m) {
 const value=types[m.type].cost;
 return {alloy:Math.max(16,Math.ceil(value*.65)),credits:35+Math.ceil(value*.56)};
}
function renderUpgrade() {
 const m=s.modules.find(m=>tileKey(m)===upgradeTile),control=$('upgradeModule');
 control.hidden=!m;
 if(!m)return;
 const quote=upgradeQuote(m);
 control.disabled=!hasTech('fieldService')||m.mk===2||s.ore<quote.alloy||s.campaign.credits<quote.credits;
 control.textContent=m.mk===2?'Установлен Mk II':!hasTech('fieldService')?'Mk II · изучите «Полевой сервис»':'Mk II · '+quote.alloy+' сплава / '+quote.credits+' кр.';
}
function upgradeModule() {
 if(modal!=='builder'||!hasTech('fieldService'))return false;
 const m=s.modules.find(m=>tileKey(m)===upgradeTile);
 if(!m||m.mk===2)return false;
 const quote=upgradeQuote(m);
 if(s.ore<quote.alloy||s.campaign.credits<quote.credits)return false;
 snapshotBuild();
 const previous=moduleMaxHp(m);
 m.mk=2;
 const gained=moduleMaxHp(m)-previous;
 m.hp+=gained;s.hullCapacity+=gained;
 s.ore-=quote.alloy;s.campaign.credits-=quote.credits;
 spendAct('ore',quote.alloy);spendAct('credits',quote.credits);recordAct('mk2:'+m.type);
 renderEditor();renderUpgrade();
 return true;
}

$('dash').onclick=startDash;
$('ping').onclick=startRadar;
$('cruise').onclick=toggleCruise;
$('boon').onclick=useRelicBoon;
$('upgradeModule').onclick=upgradeModule;
$('relicLater').onclick=closeModal;
addEventListener('keydown',e=>{
 if(e.repeat||modal||paused||s.dead||e.ctrlKey||e.altKey||e.metaKey)return;
 if(e.code==='ShiftLeft'||e.code==='ShiftRight')startDash();
 if(e.code==='KeyQ')startRadar();
 if(e.code==='KeyV')toggleCruise();
 if(e.code==='KeyG')useRelicBoon();
});

const DEATH_STORAGE='voidforge-expedition-deaths';
function incrementDeath() {
 const act=actState();
 act.deaths++;s.stats.deaths=act.deaths;recordAct('death');
 try{localStorage.setItem(DEATH_STORAGE,JSON.stringify({count:act.deaths,last:Math.round(s.stats.time)}));}catch{}
}
function restoreDeathRecord(reset=false) {
 try {
  if(reset){localStorage.setItem(DEATH_STORAGE,'null');return;}
  const value=JSON.parse(localStorage.getItem(DEATH_STORAGE));
  if(!value||!Number.isFinite(value.count)||value.count<=actState().deaths)return;
  actState().deaths=value.count;s.stats.deaths=value.count;
  actState().entries.push({event:'death',time:value.last});
 }catch{}
}
function reactorScatter(ship,point) {
 for(const other of ship.modules) {
  if(distance(point,position(ship,other))<34)other.hp=Math.max(1,other.hp-26);
 }
}

function renderActJournal(out) {
 const act=actState(),actInfo=actObjective();
 const hero=document.createElement('div');hero.className='actHero';
 hero.innerHTML='<div class="actHeroGlyph">'+iconMarkup(actInfo.icon)+'</div><div><div class="eyebrow">Экспедиция «Порог»</div><h2>'+actInfo.title+'</h2><p>'+actInfo.hint+'</p></div>';
 const action=button(['К залежи','К разведчику','Продолжить подготовку','К маяку','К Бастиону или на верфь','К Ковчегу','К следующей цели',s.campaign.commandCore?'Подготовить врата':'К Смотрителю'][act.stage],actRoute);
 action.classList.add('primary');hero.appendChild(action);out.appendChild(hero);
 if(act.stage===7&&s.campaign.commandCore){
  const dock=PLACES.filter(p=>p.kind==='gate').sort((a,b)=>distance(s,a)-distance(s,b))[0];
  const go=button('К вратам',()=>routeTo(dock));out.appendChild(go);
  const need=document.createElement('div');need.className='missionChecks';
  need.innerHTML=gateRequirements().map(r=>'<div><span>'+(r.ok?'■':'□')+'</span>'+r.label+'</div>').join('');
  const research=button('Исследовать резонанс',()=>{$('research').click();selectResearch(TECHS.find(x=>x.id==='warp'),true);});
  if(!hasTech('warp'))out.appendChild(research);
  out.appendChild(need);
 }
 const track=document.createElement('ol');track.className='actTrack';
 for(const [index,scene] of ACT_SCENES.entries()){
  const card=document.createElement('li');card.className=index===act.stage?'current':index<act.stage?'passed':'';
  card.innerHTML=iconMarkup(scene.icon)+'<span>'+scene.title+'</span>';
  if(index===act.stage)card.setAttribute('aria-current','step');
  track.appendChild(card);
 }
 out.appendChild(track);
 const flight=document.createElement('details');flight.className='flightTimeline';
 const time=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 flight.innerHTML='<summary>Запись полёта · '+act.deaths+' потерь</summary><ol>'+
  act.entries.filter(e=>Number.isInteger(e.scene)).map(e=>'<li>'+time(e.time)+' · '+ACT_SCENES[e.scene].title+'</li>').join('')+'</ol>'+
  '<p>Расходы · '+(act.spent.ore||0)+' сплава · '+(act.spent.credits||0)+' кр.</p>';
 out.appendChild(flight);
}
