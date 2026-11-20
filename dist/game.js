'use strict';
const $ = id => document.getElementById(id);
const c = $('space'), ctx = c.getContext('2d'), mini = $('map').getContext('2d');
const editor = $('editor'), ec = editor.getContext('2d');
const sectorCanvas = $('sectorMap'), sg = sectorCanvas.getContext('2d');
const STORAGE = 'voidforge-v1', DOCK_STORAGE = 'voidforge-dock-v1', SAVE_VERSION = 10, LIMIT = FlightCore.LIMIT, MINE_RANGE = FlightCore.MINE_RANGE, AIM_RANGE = 700;
const AIM_HALF_ANGLE=FlightCore.AIM_HALF_ANGLE, SIM_STEP=FlightCore.STEP;
const angleDifference=(angle,heading)=>Math.atan2(Math.sin(angle-heading),Math.cos(angle-heading));
const types = {
  armor: {name:'Броня', cost:15, hp:160, symbol:'▧', desc:'160 прочности. Защищает внутренние модули. Любой дополнительный модуль увеличивает массу.'},
  gun: {name:'Импульсная пушка', cost:60, hp:75, symbol:'↑', desc:'24 урона за попадание. Требует 5 энергии и выделяет 8 тепла за выстрел. Дальность — 990 м.'},
  engine: {name:'Двигатель', cost:40, hp:85, symbol:'≋', desc:'Увеличивает тягу и скорость. Компенсирует массу корпуса. Встроенные маневровые двигатели сохраняют минимальную подвижность.'},
  reactor: {name:'Реактор', cost:80, hp:110, symbol:'◈', desc:'+11 энергии в секунду. Потеря центрального реактора означает поражение. Дополнительные реакторы питают оружие.'},
  cooler: {name:'Радиатор', cost:35, hp:60, symbol:'╪', desc:'Отводит 9 тепла в секунду. При 100% нагрева пушки блокируются, пока температура не опустится до 45%.'}
};
const makeModule = (x,y,type) => ({x,y,type,hp:types[type].hp});
function base() { return [makeModule(0,0,'reactor'),makeModule(-1,0,'armor'),makeModule(1,0,'armor'),makeModule(0,-1,'gun'),makeModule(-1,-1,'gun'),makeModule(1,-1,'armor'),makeModule(0,1,'cooler'),makeModule(-1,1,'engine'),makeModule(1,1,'engine')]; }
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const count = (type,ship=s) => ship.modules.filter(m=>m.type===type&&m.hp>0).length;
const capacity = ship => ship.modules.reduce((n,m)=>n+moduleMaxHp(m),0);
const core = ship => ship.modules.find(m=>m.x===0&&m.y===0);
const position = FlightCore.position;
let s, W=0,H=0,clock=0,last=null,frameDebt=0,mining=0,paused=false,modal=null,selected='armor',removeMode=false;
let sharedFlight=null;
let bullets=[],fx=[],keys={},logs=[],buildHistory=[],hoverCell=null,toastTimer,dockSave=null,saveBlocked=false;
let targetLock=null,targetInRange=false,autoAim=true,worldPointer=null,touchHeading=null;
const mouse={x:0,y:0,down:false,seen:false};
const stick={x:0,y:0,id:null};
const mapView={x:0,y:0,zoom:1};
const mapPointers=new Map();
let mapGesture=null, dialogOpener=null;

function fresh() {
 aimedCell=null;selectedSalvage=null;flightRoute=null;
 s={version:SAVE_VERSION,lostModules:[],x:0,y:0,vx:0,vy:0,angle:0,energy:100,heat:0,ore:180,kills:0,dead:false,won:false,overheated:false,modules:base(),asteroids:[],enemies:[],stats:{time:0,mined:0,lost:0,shots:0,hits:0,bossHits:0},hullCapacity:0};
 s.hullCapacity=capacity(s);
 let seed=41;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let i=0;i<65;i++){const a=rand()*Math.PI*2,r=350+rand()*2200;s.asteroids.push({id:'ore-'+i,x:Math.cos(a)*r,y:Math.sin(a)*r,r:18+rand()*28,ore:30+Math.floor(rand()*40),seed:rand()*10});}
 [[850,-650],[-1000,-900],[400,1500]].forEach(([x,y],i)=>{const modules=base();if(i===1){modules.push(makeModule(2,0,'armor'),makeModule(-2,0,'armor'));}if(i===2){modules.push(makeModule(1,-2,'gun'),makeModule(0,-2,'armor'),makeModule(0,2,'cooler'));}s.enemies.push({id:'pirate-'+i,name:['РЕЙДЕР','СТРАЖ','КОРСАР'][i],x,y,angle:0,modules,cool:1+i,dead:false});});
 makeCampaign(s,true);
 configureIndustry(s,true);
 configureCombat(s);
 configureAct(s);
 resetPresentation();
 currentContact=null;

}
const tileKey = ({x,y})=>x+','+y;
const isModuleTile = m=>m&&Object.hasOwn(types,m.type)&&Number.isInteger(m.x)&&Number.isInteger(m.y)&&Math.abs(m.x)<=6&&Math.abs(m.y)<=5;
function validModules(modules) {
 return Array.isArray(modules)&&modules.length<=143&&modules.every(m=>isModuleTile(m)&&Number.isFinite(m.hp)&&m.hp>0&&m.hp<=moduleMaxHp(m))
  &&new Set(modules.map(tileKey)).size===modules.length;
}
function validState(d) {
 if(!d||typeof d!=='object'||(d.version!=null&&(!Number.isInteger(d.version)||d.version<1||d.version>SAVE_VERSION)))return false;
 if(!['x','y','vx','vy','angle','energy','heat','ore','kills'].every(k=>Number.isFinite(d[k]))||d.ore<0||(d.dead&&d.launch?.phase!=='replacement'))return false;
 if(!validModules(d.modules)||!connected(d.modules)||core(d)?.type!=='reactor'||d.modules.some(m=>types[m.type].npcOnly))return false;
 if(!Array.isArray(d.asteroids)||!d.asteroids.every(a=>a&&['x','y','r','ore','seed'].every(k=>Number.isFinite(a[k]))&&a.ore>=0&&a.r>0))return false;
 return Array.isArray(d.enemies)&&d.enemies.length>=3&&d.enemies.every(e=>e&&['x','y','angle','cool'].every(k=>Number.isFinite(e[k]))&&validModules(e.modules));
}
function normalizeState(d) {
 const upgradeWorld=!d.campaign;
 d.x=clamp(d.x,-LIMIT,LIMIT);d.y=clamp(d.y,-LIMIT,LIMIT);
 d.energy=clamp(d.energy,0,100);d.heat=clamp(d.heat,0,100);d.overheated=!!d.overheated;
 const names=['РЕЙДЕР','СТРАЖ','КОРСАР'];
 d.enemies.forEach((e,i)=>{e.id=e.id||'pirate-'+i;e.name=e.name||names[i]||e.id;});
 d.asteroids.forEach((a,i)=>{a.id=a.id||'ore-'+i;});
 d.kills=d.enemies.filter(e=>GUARD_IDS.includes(e.id)&&e.dead).length;
 const stats={time:0,mined:0,lost:0,shots:0,hits:0,bossHits:0};
 for(const k of Object.keys(stats))if(Number.isFinite(d.stats?.[k])&&d.stats[k]>=0)stats[k]=d.stats[k];
 d.stats=stats;
 if(d.destination) {
  if(!['x','y'].every(k=>Number.isFinite(d.destination[k])))delete d.destination;
  else d.destination={x:clamp(d.destination.x,-LIMIT,LIMIT),y:clamp(d.destination.y,-LIMIT,LIMIT)};
 }
 // Releases before schema 6 counted losses without recording cells. Preserve that count.
 const seen=new Set(d.modules.map(tileKey));
 const lost=Array.isArray(d.lostModules)?d.lostModules:[];
 d.lostModules=[];
 for(const m of lost) {
  if(!isModuleTile(m)||types[m.type].npcOnly||seen.has(tileKey(m)))continue;
  seen.add(tileKey(m));d.lostModules.push({x:m.x,y:m.y,type:m.type});
 }
 const knownCapacity=capacity(d)+d.lostModules.reduce((n,m)=>n+types[m.type].hp,0);
 d.hullCapacity=Math.max(knownCapacity,Number.isFinite(d.hullCapacity)?d.hullCapacity:0);
 makeCampaign(d,upgradeWorld);
 configureIndustry(d);
 configureCombat(d);
 configureAct(d);
 normalizeLaunch(d);
 if(!d.asteroids.some(a=>a.id===d.miningId&&isExtractable(a)))delete d.miningId;
 d.version=SAVE_VERSION;
 return d;
}
function readFlight(raw) {
 try {
  const data=JSON.parse(raw);
  return validState(data)?normalizeState(data):null;
 } catch {return null;}
}
function load() {
 dockSave=null;
 try {
  const raw=localStorage.getItem(DOCK_STORAGE),backup=readFlight(raw);
  if(backup)dockSave=raw;
  const active=readFlight(localStorage.getItem(STORAGE))||backup;
  if(active){s=active;return true;}
 } catch {}
 fresh();return false;
}
function save(notify=true) {
 const awaitingReplacement=s.dead&&launchState()?.phase==='replacement';
 if(s.dead&&!awaitingReplacement)return false;
 // Keep a valid chassis in the persistent snapshot while the destroyed ship remains visible in memory.
 const modules=awaitingReplacement?base():s.modules;
 const state=awaitingReplacement?{...s,modules,lostModules:[],hullCapacity:capacity({modules})}:s;
 const raw=JSON.stringify(state);
 const atDock=!awaitingReplacement&&(!s.launch||s.launch.phase==='flying')
  &&Math.hypot(s.vx,s.vy)<=55&&PLACES.some(p=>p.kind==='station'&&canInteract(p));
 if(atDock)dockSave=raw;
 try{localStorage.setItem(STORAGE,raw);if(atDock)localStorage.setItem(DOCK_STORAGE,raw);saveBlocked=false;$('saveState').textContent='ПОЛЁТ СОХРАНЁН';if(notify)toast('Полёт сохранён в этом браузере');return true;}
 catch{if(!saveBlocked||notify)toast('Браузер не разрешает сохранение. Не закрывайте вкладку.');saveBlocked=true;$('saveState').textContent='СОХРАНЕНИЕ НЕДОСТУПНО';return false;}
}
function toast(message) {$('toast').textContent=message;$('toastStatus').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',3600);}
function log(message){logs.unshift(message);logs=logs.slice(0,4);$('log').replaceChildren(...logs.map(t=>{const el=document.createElement('div');el.textContent='› '+t;return el;}));}
function resetInput(){resetMiningAim();keys={};firePointer=null;mouse.down=false;worldPointer=null;stick.x=stick.y=0;stick.id=null;$('joyKnob').style.transform='translate(0px,0px)';mapPointers.clear();mapGesture=null;}
function openModal(id) {
 if(!id){closeModal();return;}
 if(!modal)dialogOpener=document.activeElement;
 else {if(modal==='builder'&&id!=='builder')save(false);$(modal).classList.add('hidden');}
 modal=id;resetInput();
 $('flightHud').inert=true;
 $(id).classList.remove('hidden');
 const panel=$(id).querySelector('section');
 if(panel)panel.scrollTop=0;
 if(id==='mapModal')resetMapSelection();
 $(id).querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
function closeModal() {
 if(modal==='builder')save(false);
 if(modal)$(modal).classList.add('hidden');
 modal=null;resetInput();
 $('flightHud').inert=false;
 if(!dialogOpener?.hidden)dialogOpener?.focus({preventScroll:true});
 dialogOpener=null;
}
function toggleMap(){if(s.dead||modal==='resultModal'||modal==='confirmModal')return;if(modal==='mapModal'){closeModal();return;}openModal('mapModal');}
function toggleBuild(){if(s.dead||modal==='resultModal'||modal==='confirmModal')return;if(modal==='builder'){closeModal();return;}buildHistory=[];hoverCell=null;removeMode=false;selectedSalvage=null;upgradeTile=null;openModal('builder');renderEditor();renderUpgrade();}
function togglePause(){if(modal||s.dead)return;paused=!paused;resetInput();renderPauseButton();$('pause').setAttribute('aria-label',paused?'Продолжить':'Пауза');}
function cancelPilot(notify=false) {
 resetMiningAim();
 const had=Boolean(s.destination||s.miningId);
 flightRoute=null;delete s.destination;delete s.miningId;delete s.miningWait;
 if(s.campaign){delete s.campaign.scan;delete s.campaign.approach;}
 if(had&&notify)toast('Автопилот и добыча отключены');
}
function brake() {
 if(s.dead||modal)return;
 cancelPilot();resetInput();actState().cruise=false;s.braking=true;
 toast('Тормозные двигатели включены');
}
function setDestination(x,y){if(s.dead)return;cancelPilot();s.destination={x:clamp(x,-LIMIT,LIMIT),y:clamp(y,-LIMIT,LIMIT)};mouse.seen=false;touchHeading=null;if(modal==='mapModal')closeModal();toast(paused?'Маршрут задан. Снимите паузу для полёта.':'Курс задан · движение или «Стоп» отменяют маршрут');}
function startMining(a) {
 if(s.dead||!a||!isExtractable(a))return;
 if(!canDrill(a)){toast('Для плотной жилы установите бур.');return;}
 const portable=a.loot&&(a.loot.commandCore||a.loot.data)&&a.ore<=15;
 if(freeCargo()===0&&!portable){toast('Трюм заполнен. Разгрузите корабль на станции.');return;}
 cancelPilot();s.miningId=a.id;
 const d=distance(s,a);
 if(d>=MINE_RANGE-20) {
  const range=225/(d||1);
  s.destination={x:clamp(a.x+(s.x-a.x)*range,-LIMIT,LIMIT),y:clamp(a.y+(s.y-a.y)*range,-LIMIT,LIMIT)};
 }
 mouse.seen=false;touchHeading=null;
 if(modal==='mapModal')closeModal();
 toast(paused?'Добыча выбрана. Снимите паузу для подлёта.':d<MINE_RANGE?'Добыча начата · движение отменяет задачу':'Курс на астероид · добыча начнётся после подлёта');
}
function toggleMining(){if(s.dead||modal)return;if(s.miningId){cancelPilot(true);return;}const a=(isStory()&&actState().stage===0?s.asteroids.find(a=>a.id==='first-vein'&&isExtractable(a)):null)||s.asteroids.filter(a=>isExtractable(a)&&canDrill(a)).sort((a,b)=>distance(s,a)-distance(s,b))[0];if(a)startMining(a);else toast('В этом секторе больше нет доступного сплава');}
function nearestTarget(inSector=false) {
 const profiles=activeWeapons();
 if(!profiles.length)return null;
 const range=Math.max(...profiles.map(gun=>gun.speed*gun.life*.81));
 return s.enemies.filter(enemy=>!enemy.dead&&actEnemyReady(enemy)&&(enemy.archetype!=='boss'||bossUnlocked())&&distance(s,enemy)<=range&&(!inSector||canTrackTarget(enemy)))
  .sort((a,b)=>Number(b.id===aimedCell?.id)-Number(a.id===aimedCell?.id)||distance(s,a)-distance(s,b))[0]||null;
}
function setAutoAim(value){autoAim=value;$('autoAim').textContent='⌖ Автоприцел ±35°: '+(value?'вкл':'выкл');$('autoAim').setAttribute('aria-pressed',String(value));try{localStorage.setItem('voidforge-autoaim',String(value));}catch{}}
function connected(ms){return ms.length>0&&remainingConnected(ms).length===ms.length;}
const remainingConnected=FlightCore.remainingConnected;
function snapshotBuild(){buildHistory.push({modules:JSON.parse(JSON.stringify(s.modules)),ore:s.ore,credits:s.campaign.credits,spent:{...actState().spent},trophyFitted:actState().trophyFitted,hullCapacity:s.hullCapacity,lostModules:s.lostModules.slice(),spareModules:s.campaign.spareModules.slice(),selectedSalvage});if(buildHistory.length>30)buildHistory.shift();}
function editAt(x,y,remove=removeMode){if(Math.abs(x)>6||Math.abs(y)>5||types[selected].npcOnly)return;const trophy=selectedTrophy();if(!remove&&!trophy&&types[selected].tech&&!hasTech(types[selected].tech)){toast('Сначала исследуйте технологию в разделе «Наука»');return;}const old=s.modules.find(m=>m.x===x&&m.y===y);let message;
 if(remove){if(!old)return;if(x===0&&y===0){toast('Центральное ядро нельзя разобрать');return;}const rest=s.modules.filter(m=>m!==old);if(!connected(rest)){toast('Этот модуль соединяет части корабля');return;}snapshotBuild();const refund=old.issued?0:Math.floor(types[old.type].cost*.5*old.hp/moduleMaxHp(old));s.modules=rest;s.ore+=refund;s.hullCapacity=Math.max(capacity(s),s.hullCapacity-moduleMaxHp(old));message='Разобрано: '+types[old.type].name+(old.issued?' · выданный модуль':' · +'+refund+' сплава');}
 else{if(old){upgradeTile=tileKey(old);renderUpgrade();$('buildStatus').textContent=moduleName(old)+' · '+Math.ceil(old.hp)+' / '+moduleMaxHp(old)+' прочности';return;}const price=trophy?0:types[selected].cost;if(s.ore<price){toast('Недостаточно сплава');return;}const placed=makeModule(x,y,selected);if(trophy){placed.origin='trophy';placed.quality=trophy.quality;placed.hp=Math.min(trophy.hp,moduleMaxHp(placed));}const next=[...s.modules,placed];if(!connected(next)){toast('Установите модуль рядом с корпусом');return;}snapshotBuild();s.ore-=price;spendAct('ore',price);if(trophy){s.campaign.spareModules=s.campaign.spareModules.filter(m=>m!==trophy);actState().trophyFitted=true;selectedSalvage=null;}s.modules=next;const replaced=s.lostModules.find(m=>m.x===x&&m.y===y);if(replaced)s.lostModules=s.lostModules.filter(m=>m!==replaced);upgradeTile=tileKey(placed);s.hullCapacity+=moduleMaxHp(placed)-(replaced?types[replaced.type].hp:0);message='Установлено: '+types[selected].name;}
 renderEditor();renderUpgrade();$('buildStatus').textContent=message;
}
function showResult() {
 $('resultEyebrow').textContent='ЭКСПЕДИЦИЯ «ПОРОГ» / ЗАВЕРШЕНА';
 $('resultGlyph').textContent='✳';
 $('resultTitle').textContent='Связь восстановлена.';
 $('resultText').textContent='Смотритель повержен, командный ключ извлечён, и врата снова соединяют края Чёрного сектора.';
 $('resultContinue').textContent='Продолжить исследование';
 const minutes=Math.floor(s.stats.time/60),seconds=Math.floor(s.stats.time%60);
 $('resultStats').innerHTML='<span>ВРЕМЯ ПОЛЁТА<b>'+minutes+':'+String(seconds).padStart(2,'0')+'</b></span><span>ДОБЫТО СПЛАВА<b>'+s.stats.mined+'</b></span><span>ПИРАТЫ<b>'+s.kills+' / 3</b></span><span>ПОТЕРЯНО МОДУЛЕЙ<b>'+s.stats.lost+'</b></span>';
 openModal('resultModal');
}
function hit(ship, module, damage, kind) {
 if(ship.dead||!ship.modules.includes(module)||damage<=0)return;
 const point=position(ship,module);
 if(ship!==s&&!ship.hullCapacity)ship.hullCapacity=capacity(ship);
 if(ship.archetype==='boss'&&(!bossUnlocked()||isBehindShield(ship,module))) {
  fx.push({...point,t:.22});shieldFeedback(ship,point,damage);
  return;
 }
 const shield=ship===s?s.campaign:ship;
 const profile=DAMAGE_TYPES[kind];
 const shieldResult=FlightCore.shieldHit(ship,shield,damage,profile);
 damage=shieldResult.damage;
 if(shieldResult.absorbed)shieldFeedback(ship,point,shieldResult.absorbed);
 if(actProtects(ship,module))damage=0;
 if(module.type==='armor')damage*=profile?.armor??1;
 fx.push({...point,t:.25});
 playSound('hit');
 if(damage<=0)return;
 disableModule(ship,module,kind);
 impactFeedback(ship,point,damage,kind);
 module.hp-=damage;
 if(ship===s)s.hitFlash=.15;
 if(module.hp>0)return;
 detachFeedback(ship,module,point);playSound('break');
 const before=ship.modules;
 const remaining=before.filter(m=>m!==module);
 if(module.x===0&&module.y===0) {
  shipBurst(point);ship.dead=true;ship.modules=remaining;
  if(ship!==s)reactorScatter(ship,point);
  if(ship===s) {
   s.stats.lost+=before.length;incrementDeath();cancelPilot();log('Центральный реактор уничтожен.');returnToShipyard();
  } else onEnemyDestroyed(ship);
  return;
 }
 ship.modules=remainingConnected(remaining);
 for(const loose of remaining)if(!ship.modules.includes(loose)){
  detachFeedback(ship,loose,position(ship,loose));ejectTrophy(ship,loose);
 }
 if(ship===s) {
  const aboard=new Set(ship.modules);
  const lost=before.filter(m=>!aboard.has(m));
  s.stats.lost+=lost.length;
  s.lostModules.push(...lost.map(({x,y,type})=>({x,y,type})));
 }
 if(ship.archetype==='boss'&&module.type==='pylon') {
  const left=count('pylon',ship);
  log(left?'Один излучатель Смотрителя уничтожен.':'Щит Смотрителя отключён. Флагман сменил тактику.');
  toast(left?'Излучатель уничтожен · остался ещё один':'Фаза 2 · опасайтесь залпа веером');
 }
 dischargeModule(ship,module,point);
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
// The map uses one world-to-canvas transform for drawing, taps, dragging and zoom anchors.
function mapToWorld(p){return {x:mapView.x+(p.x-360)*6000/(720*mapView.zoom),y:mapView.y+(p.y-360)*6000/(720*mapView.zoom)};}
function worldToMap(p){return {x:360+(p.x-mapView.x)/6000*720*mapView.zoom,y:360+(p.y-mapView.y)/6000*720*mapView.zoom};}
function mapPoint(e){const r=sectorCanvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*720,y:(e.clientY-r.top)/r.height*720};}
function boundMap(){const limit=3000-3000/mapView.zoom;mapView.x=clamp(mapView.x,-limit,limit);mapView.y=clamp(mapView.y,-limit,limit);}
function zoomMap(factor,anchor={x:360,y:360}){const before=mapToWorld(anchor);mapView.zoom=clamp(mapView.zoom*factor,1,6);const after=mapToWorld(anchor);mapView.x+=before.x-after.x;mapView.y+=before.y-after.y;boundMap();}
function beginMapGesture(){const ps=[...mapPointers.values()];if(ps.length>=2){const a=ps[0],b=ps[1];mapGesture={type:'pinch',distance:Math.max(1,distance(a,b)),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},moved:true};}else if(ps.length===1){mapGesture={type:'drag',last:ps[0],start:ps[0],moved:true};}else mapGesture=null;}
sectorCanvas.onpointerdown=e=>{if(modal!=='mapModal')return;e.preventDefault();sectorCanvas.setPointerCapture(e.pointerId);const p=mapPoint(e);mapPointers.set(e.pointerId,p);if(mapPointers.size===1)mapGesture={type:'drag',last:p,start:p,moved:false};else beginMapGesture();};
sectorCanvas.onpointermove=e=>{if(!mapPointers.has(e.pointerId)||!mapGesture)return;e.preventDefault();const p=mapPoint(e);mapPointers.set(e.pointerId,p);const ps=[...mapPointers.values()];if(ps.length>=2){const a=ps[0],b=ps[1],d=Math.max(1,distance(a,b)),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(mapGesture.type!=='pinch'){beginMapGesture();return;}const held=mapToWorld(mapGesture.mid);mapView.zoom=clamp(mapView.zoom*d/mapGesture.distance,1,6);const next=mapToWorld(mid);mapView.x+=held.x-next.x;mapView.y+=held.y-next.y;boundMap();mapGesture={type:'pinch',distance:d,mid,moved:true};}else{const g=mapGesture,r=sectorCanvas.getBoundingClientRect();if(distance(p,g.start)*r.width/720>8)g.moved=true;if(g.moved){mapView.x-=(p.x-g.last.x)*6000/(720*mapView.zoom);mapView.y-=(p.y-g.last.y)*6000/(720*mapView.zoom);boundMap();}g.last=p;}};
function endMapPointer(e,cancelled=false){if(!mapPointers.has(e.pointerId))return;const p=mapPoint(e),tap=!cancelled&&mapPointers.size===1&&mapGesture?.type==='drag'&&!mapGesture.moved;mapPointers.delete(e.pointerId);if(sectorCanvas.hasPointerCapture(e.pointerId))sectorCanvas.releasePointerCapture(e.pointerId);beginMapGesture();if(tap)chooseMapPoint(p);}
sectorCanvas.onpointerup=e=>endMapPointer(e);sectorCanvas.onpointercancel=e=>endMapPointer(e,true);
sectorCanvas.addEventListener('wheel',e=>{e.preventDefault();zoomMap(Math.exp(-clamp(e.deltaY,-200,200)*.002),mapPoint(e));},{passive:false});
$('zoomIn').onclick=()=>zoomMap(1.35);$('zoomOut').onclick=()=>zoomMap(1/1.35);$('resetMap').onclick=()=>{mapView.x=mapView.y=0;mapView.zoom=1;};$('centerMap').onclick=()=>{mapView.zoom=Math.max(2,mapView.zoom);mapView.x=s.x;mapView.y=s.y;boundMap();};

function setStick(e){const r=$('joystick').getBoundingClientRect(),radius=r.width*.32,dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,d=Math.hypot(dx,dy),scale=d>radius?radius/d:1;stick.x=dx*scale/radius;stick.y=dy*scale/radius;if(d<radius*.12)stick.x=stick.y=0;$('joyKnob').style.transform='translate('+stick.x*radius+'px,'+stick.y*radius+'px)';}
$('joystick').onpointerdown=e=>{if(modal||s.dead||stick.id!==null)return;e.preventDefault();stick.id=e.pointerId;$('joystick').setPointerCapture(e.pointerId);setStick(e);};
$('joystick').onpointermove=e=>{if(e.pointerId===stick.id){e.preventDefault();setStick(e);}};
function releaseStick(e){if(e.pointerId!==stick.id)return;stick.id=null;stick.x=stick.y=0;$('joyKnob').style.transform='translate(0px,0px)';}
$('joystick').onpointerup=releaseStick;$('joystick').onpointercancel=releaseStick;$('joystick').onlostpointercapture=releaseStick;
let firePointer=null;
$('fire').onpointerdown=e=>{if(modal||s.dead||firePointer!==null)return;e.preventDefault();firePointer=e.pointerId;keys.fire=true;$('fire').setPointerCapture(e.pointerId);};
function releaseFire(e){if(e.pointerId===firePointer){keys.fire=false;firePointer=null;}}
$('fire').onpointerup=releaseFire;$('fire').onpointercancel=releaseFire;$('fire').onlostpointercapture=releaseFire;
function worldAt(e){return viewAt(e.clientX,e.clientY);}
const hitsAsteroid=(a,point)=>isExtractable(a)&&distance(a,point)<a.r+14;
const hitsContact=(p,point)=>distance(p,point)<(p.kind==='gate'?85:p.kind==='station'?75:45);
function updateWorldCursor(e) {
 const point=worldAt(e);
 const actionable=!worldPointer&&!manualMiningTarget()&&(
  s.asteroids.some(a=>hitsAsteroid(a,point))||
  allContacts().some(p=>hitsContact(p,point))||pointAtEnemy(point)
 );
 c.classList.toggle('world-action',Boolean(actionable));
}
c.onpointerdown = e => {
 if (sharedFlight?.active()) { sharedFlight.pointerDown(e); return; }
 if (modal || s.dead || worldPointer || e.button === 2) return;
 e.preventDefault();
 if(manualMiningTarget()) {
  beamPointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  worldPointer={id:e.pointerId,beam:true};mouse.down=false;
  c.setPointerCapture(e.pointerId);return;
 }
 const point = worldAt(e);
 const asteroid = s.asteroids.filter(a => hitsAsteroid(a, point))
  .sort((a,b) => distance(a, point) - distance(b, point))[0];
 const contact = allContacts().filter(p => hitsContact(p, point))
  .sort((a,b) => distance(a, point) - distance(b, point))[0];
 const touch = e.pointerType !== 'mouse' && e.pointerType !== undefined;
 const targeted=pointAtEnemy(point);
 worldPointer = {id:e.pointerId, x:e.clientX, y:e.clientY, asteroid, contact, targeted, touch, startsAt:clock, swiped:false};
 if (!touch) {
  mouse.x=e.clientX; mouse.y=e.clientY; mouse.seen=true; touchHeading=null;
  mouse.down=!asteroid&&!contact&&!targeted;
 }
 c.setPointerCapture(e.pointerId);
};
c.onpointermove = e => {
 if(sharedFlight?.active()){sharedFlight.pointerMove(e);return;}
 if (modal || s.dead) return;
 if(beamPointer?.id===e.pointerId) {beamPointer.x=e.clientX;beamPointer.y=e.clientY;c.classList.remove('world-action');return;}
 if (e.pointerType === 'mouse' || e.pointerType === undefined) {
  mouse.x=e.clientX; mouse.y=e.clientY; mouse.seen=true; touchHeading=null;
  updateWorldCursor(e);
  return;
 }
 const start = worldPointer;
 if (!start || start.id !== e.pointerId || !start.touch || start.x < W/2) return;
 const dx = e.clientX - start.x, dy = e.clientY - start.y;
 if (Math.hypot(dx,dy) < 12) return;
 start.swiped=true;
 if (s.destination || s.miningId || (!isStory()&&s.campaign.scan)) cancelPilot();
 mouse.seen=false;
 touchHeading=Math.atan2(dy,dx)+Math.PI/2;
};
c.onpointerup = e => {
 if(sharedFlight?.active()){sharedFlight.pointerUp(e);return;}
 const start=worldPointer;
 if (!start || start.id !== e.pointerId) return;
 worldPointer=null; mouse.down=false;
 if(start.beam){beamPointer=null;return;}
 if (start.swiped || Math.hypot(e.clientX-start.x,e.clientY-start.y)>=12) return;
 if(start.targeted){if(!start.engaged)selectTargetCell(start.targeted);}
 else if (start.contact) approach(start.contact);
 else if (start.asteroid) startMining(start.asteroid);
};
c.onpointercancel = c.onlostpointercapture = e => {
 if(sharedFlight?.active()){sharedFlight.pointerUp(e,true);return;}
 if (worldPointer?.id === e.pointerId) { worldPointer=null; mouse.down=false;if(beamPointer?.id===e.pointerId)beamPointer=null; }
};
c.oncontextmenu=e=>e.preventDefault();
c.addEventListener('wheel',event=>{
 if(event.ctrlKey||event.metaKey||!event.deltaY)return;
 if(!sharedFlight?.active()&&(modal||s.dead))return;
 event.preventDefault();
 const unit=event.deltaMode===1?16:event.deltaMode===2?H:1;
 setCameraScale(cameraScale-clamp(event.deltaY*unit,-160,160)*.0015);
},{passive:false});

$('pause').onclick=togglePause;$('build').onclick=toggleBuild;$('closeBuild').onclick=closeModal;$('openMap').onclick=toggleMap;$('closeMap').onclick=closeModal;
$('help').onclick=()=>{if(modal==='resultModal'||modal==='confirmModal')return;openModal('helpModal');};$('closeHelp').onclick=closeModal;
$('autoAim').onclick=()=>setAutoAim(!autoAim);$('mine').onclick=toggleMining;$('repair').onclick=()=>repair();$('save').onclick=()=>save();
$('target').onclick=()=>{if(modal==='journalModal')closeModal();const e=s.enemies.filter(e=>!e.dead&&actEnemyReady(e)&&(e.archetype!=='boss'||bossUnlocked())).sort((a,b)=>distance(s,a)-distance(s,b))[0];if(e){s.nav=e.id;toast('Направление на ближайшего пирата отмечено');}else toast('Радар не видит активных пиратов.');};
let confirmReturn='helpModal';
function confirmNew(){confirmReturn=modal;openModal('confirmModal');}
$('reset').onclick=confirmNew;$('resultRestart').onclick=confirmNew;$('cancelReset').onclick=()=>openModal(confirmReturn);
function newFlight() {
 fresh();cancelPilot();restoreDeathRecord(true);
 dockSave=null;
 try{localStorage.setItem(DOCK_STORAGE,'');}catch{}
 touchHeading=null;mouse.seen=false;bullets=[];fx=[];mining=0;
 targetLock=null;targetInRange=false;logs=[];$('log').replaceChildren();paused=false;
 mapView.zoom=1;mapView.x=mapView.y=0;
 renderPauseButton();
 initLaunch(false);
}
$('confirmReset').onclick=newFlight;
$('resultContinue').onclick=()=>{closeModal();save(false);};
$('removeModule').onclick=()=>{removeMode=!removeMode;renderEditor();};
$('undoBuild').onclick=()=>{const last=buildHistory.pop();if(last){s.modules=last.modules;s.ore=last.ore;s.campaign.credits=last.credits;actState().spent=last.spent;actState().trophyFitted=last.trophyFitted;s.stats.resourcesSpent=last.spent;s.hullCapacity=last.hullCapacity;s.lostModules=last.lostModules;s.campaign.spareModules=last.spareModules;selectedSalvage=last.selectedSalvage;if(selectedSalvage!=null){const trophy=s.campaign.spareModules.find(m=>m.id===selectedSalvage);if(trophy)selected=trophy.type;}renderEditor();$('buildStatus').textContent='Последнее изменение отменено';}};
function buildModulePalette() {
 for(const [key,t] of Object.entries(types)) {
  if(t.npcOnly)continue;
  const b=document.createElement('button');b.dataset.part=key;
  b.onclick=()=>{selected=key;selectedSalvage=null;removeMode=false;renderEditor();};
  $('parts').appendChild(b);
 }
}
function editorCell(e){const r=editor.getBoundingClientRect();return {x:Math.round(((e.clientX-r.left)/r.width*540-270)/40),y:Math.round(((e.clientY-r.top)/r.height*440-220)/40)};}
editor.onpointerdown=e=>{e.preventDefault();const p=editorCell(e);editAt(p.x,p.y,e.button===2||removeMode);};editor.oncontextmenu=e=>e.preventDefault();editor.onpointermove=e=>{if(e.pointerType==='touch')return;hoverCell=editorCell(e);renderEditor();};editor.onpointerleave=()=>{hoverCell=null;renderEditor();};
addEventListener('keydown',e=>{
 if(sharedFlight?.active()){sharedFlight.keyDown(e);return;}
 if(e.code==='Space'&&e.target?.closest?.('.hudZoom button, .cargoHud button, #openSettings'))return;
 if(e.code==='Tab'&&modal){const items=[...$(modal).querySelectorAll('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
 if(modal&&e.code!=='Escape'&&!((modal==='builder'&&['KeyB','KeyZ'].includes(e.code))||(modal==='mapModal'&&e.code==='KeyM')))return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'){if(modal==='coopModal')sharedFlight?.closeLobby();else if(modal==='repairModal')closeRepair();else if(modal==='confirmModal')openModal(confirmReturn);else if(modal&&modal!=='resultModal'&&modal!=='launchModal')closeModal();else if(!modal)togglePause();return;}
 if(e.repeat)return;
 if(modal){if(modal==='mapModal'&&e.code==='KeyM')closeModal();else if(modal==='builder'&&e.code==='KeyB')closeModal();else if(modal==='builder'&&e.ctrlKey&&e.code==='KeyZ'){e.preventDefault();$('undoBuild').click();}return;}
 if(/^Digit[1-4]$/.test(e.code)){setWeaponGroup(Object.keys(GROUP_NAMES)[Number(e.code.slice(-1))-1]);return;}
 if(e.code==='KeyM'){toggleMap();return;}if(e.code==='KeyB'){toggleBuild();return;}if(e.code==='Space'){togglePause();return;}if(e.code==='KeyX'){brake();return;}if(e.code==='KeyE'||e.code==='NumpadAdd'||e.key==='+'){toggleMining();return;}if(e.code==='KeyR'){repair();return;}keys[e.code]=true;
});
addEventListener('keyup',e=>{if(sharedFlight?.active())sharedFlight.keyUp(e);else keys[e.code]=false;});addEventListener('blur',()=>{sharedFlight?.clearInput();resetInput();if(!paused&&!modal&&!s.dead)togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save(false);resetInput();if(!paused&&!modal&&!s.dead)togglePause();}});addEventListener('pagehide',()=>save(false));

function drawModule(g,x,y,m,size=18){g.fillStyle='#000';g.fillRect(x-size/2,y-size/2,size,size);g.strokeStyle='#fff';g.lineWidth=1;g.strokeRect(Math.round(x-size/2),Math.round(y-size/2),size,size);g.fillStyle='#fff';if(m.type==='armor'){for(let i=-size/2+4;i<size/2-2;i+=5){g.beginPath();g.moveTo(x+i,y-size/2+3);g.lineTo(x+Math.min(i+size/2,size/2-3),y+Math.min(size/2-3,size/2-i-5));g.stroke();}}else if(m.type==='reactor'||m.type==='bossCore'){if(!(g===ctx&&drawSectorSprite(g,'core',x,y,size-1))){g.strokeRect(x-size*.23,y-size*.23,size*.46,size*.46);g.fillRect(x-2,y-2,4,4);}}else if(m.type==='gun'){g.fillRect(x-3,y-size/2-5,6,size*.7);g.strokeRect(x-5,y,10,size*.3);}else if(m.type==='engine'){for(let i=-1;i<=1;i++)g.fillRect(x+i*4-1,y-size*.25,2,size*.5);}else if(m.type==='cargo'){g.strokeRect(x-size*.28,y-size*.28,size*.56,size*.56);g.fillRect(x-1,y-size*.28,2,size*.56);}else if(m.type==='shield'){g.beginPath();g.arc(x,y,size*.29,0,Math.PI*2);g.stroke();}else if(m.type==='ion'){g.beginPath();g.moveTo(x-size*.25,y-size*.2);g.lineTo(x,y+size*.3);g.lineTo(x+size*.25,y-size*.2);g.stroke();}else if(m.type==='tractor'){g.beginPath();g.arc(x,y,size*.29,0,Math.PI*2);g.stroke();g.fillRect(x-2,y-2,4,4);}else if(m.type==='rail'){g.fillRect(x-4,y-size*.5-5,2,size);g.fillRect(x+2,y-size*.5-5,2,size);}else{for(let i=-1;i<=1;i++)g.fillRect(x-size*.3,y+i*4,size*.6,1);}if(m.hp<moduleMaxHp(m)*.5){g.beginPath();g.moveTo(x-size/2,y);g.lineTo(x+3,y+3);g.lineTo(x,y+size/2);g.stroke();}if(!operational(m)){g.beginPath();g.moveTo(x-size*.25,y+size*.25);g.lineTo(x+size*.25,y-size*.25);g.stroke();}}
function renderEditor(){
 ec.clearRect(0,0,540,440);ec.strokeStyle='#fff';ec.lineWidth=1;ec.setLineDash([1,7]);
 for(let x=10;x<540;x+=40){ec.beginPath();ec.moveTo(x,0);ec.lineTo(x,440);ec.stroke();}for(let y=0;y<440;y+=40){ec.beginPath();ec.moveTo(0,y);ec.lineTo(540,y);ec.stroke();}ec.setLineDash([]);
 s.modules.forEach(m=>drawModule(ec,270+m.x*40,220+m.y*40,m,38));
 if(hoverCell&&Math.abs(hoverCell.x)<=6&&Math.abs(hoverCell.y)<=5){const {x,y}=hoverCell,old=s.modules.find(m=>m.x===x&&m.y===y);const valid=removeMode?old&&!(x===0&&y===0)&&connected(s.modules.filter(m=>m!==old)):!old&&(selectedTrophy()||s.ore>=types[selected].cost&&(!types[selected].tech||hasTech(types[selected].tech)))&&connected([...s.modules,makeModule(x,y,selected)]);ec.strokeStyle='#fff';ec.setLineDash(valid?[5,3]:[1,3]);ec.strokeRect(250+x*40,200+y*40,40,40);ec.setLineDash([]);if(!valid){ec.beginPath();ec.moveTo(256+x*40,206+y*40);ec.lineTo(284+x*40,234+y*40);ec.moveTo(284+x*40,206+y*40);ec.lineTo(256+x*40,234+y*40);ec.stroke();}}
 $('buildOre').textContent=s.ore;$('partName').textContent=types[selected].name;$('partDesc').textContent=types[selected].desc;
 const p=shipPhysics();
 $('shipStats').innerHTML=['Масса '+p.mass.toFixed(1)+' т','Тяга '+Math.round(p.accel)+' м/с²','Пушки '+count('gun')+' / Рельс. '+count('rail'),'Щиты '+count('shield')*90,'Трюм '+cargoUsed()+' / '+cargoMax()].map(line=>'<span>'+line+'</span>').join('');
 $('removeModule').textContent=removeMode?'Разборка · 50%':'Установка';$('removeModule').setAttribute('aria-pressed',String(removeMode));$('removeModule').classList.toggle('active',removeMode);$('undoBuild').disabled=!buildHistory.length;
 for(const b of document.querySelectorAll('[data-part]')) {
  const key=b.dataset.part,t=types[key],locked=t.tech&&!hasTech(t.tech);
  b.classList.toggle('active',key===selected&&!removeMode&&!selectedSalvage);
  b.classList.toggle('locked',Boolean(locked));
  b.setAttribute('aria-pressed',String(key===selected&&!removeMode&&!selectedSalvage));
  b.innerHTML=iconMarkup(t.icon||(key==='drill'?'build':key==='tractor'?'target':key))+'<strong>'+t.name+'</strong><small>'+ (locked?'Закрыто':t.cost+' сплава')+'</small>';
  b.title=locked?'Открывается в разделе «Наука»':t.mass+' т';
 }
 renderSalvage();
 if(selectedTrophy()&&!removeMode)$('buildStatus').textContent='Выберите свободную клетку. Трофей ставится бесплатно с текущей прочностью.';
 else if(types[selected].tech&&!hasTech(types[selected].tech)&&!removeMode)$('buildStatus').textContent='Технология не изучена. Откройте раздел «Наука».';
 else if(!s.modules.some(m=>WEAPONS[m.type]))$('buildStatus').textContent='Нет орудий. Установите хотя бы одну пушку для боя.';else $('buildStatus').textContent=removeMode?'Нажмите на модуль, чтобы разобрать. Ядро защищено.':'Нажмите на свободную клетку рядом с корпусом.';
}
function polygon(x,y,r,seed){ctx.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=r*(.8+.2*Math.sin(i*7+seed)),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();}
function drawShip(ship) {
 const player=ship===s,pose=player?flightPose:ship;
 ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);
 if(player&&!paused&&!modal) {
  const plume=clamp((Math.hypot(pose.vx,pose.vy)-20)/80,0,1);
  if(plume>0) {
   const pulse=reduceMotion?0:Math.sin(renderTime*21)*1.5;
   ctx.fillStyle='#fff';
   for(const m of ship.modules) {
    if(m.type!=='engine'||!operational(m))continue;
    ctx.fillRect(m.x*20-4,m.y*20+9,3,(8+pulse)*plume);
    ctx.fillRect(m.x*20+2,m.y*20+9,3,(10-pulse)*plume);
   }
  }
 }
 if(player) {
  ctx.strokeStyle='#bfbfbf';ctx.lineWidth=2;
  for(const m of ship.modules)ctx.strokeRect(m.x*20-11,m.y*20-11,22,22);
  const nose=Math.min(...ship.modules.map(m=>m.y))*20-16;
  ctx.fillStyle='#fff';ctx.beginPath();
  ctx.moveTo(0,nose-6);ctx.lineTo(-5,nose);ctx.lineTo(5,nose);ctx.closePath();ctx.fill();
  ctx.lineWidth=1;
 }
 ship.modules.forEach(m=>drawModule(ctx,m.x*20,m.y*20,m));
 if(player) {
  const m=cargoModule(),x=(m?.x||0)*20,y=m?m.y*20+8.4:9.6;
  ctx.fillStyle='#fff';ctx.fillRect(x-4,y-1,8,2);
 }
 ctx.restore();
 if(player||ship.archetype==='drone')return;
 ctx.font='10px monospace';ctx.fillStyle='#fff';
 ctx.fillText(ship.archetype==='boss'?'◉ '+ship.name:'× '+ship.name,ship.x-30,ship.y-83);
 const current=ship.modules.reduce((n,m)=>n+m.hp,0),max=ship.hullCapacity||capacity(ship)||1;
 ctx.strokeRect(ship.x-30,ship.y-57,60,3);ctx.fillRect(ship.x-30,ship.y-57,60*current/max,3);
}
function drawMini(){mini.clearRect(0,0,190,180);mini.strokeStyle='#fff';mini.fillStyle='#fff';mini.setLineDash([1,5]);mini.beginPath();mini.moveTo(95,0);mini.lineTo(95,180);mini.moveTo(0,90);mini.lineTo(190,90);mini.stroke();mini.setLineDash([]);const p=o=>({x:95+o.x/32,y:90+o.y/32});for(const a of s.asteroids)if(isExtractable(a)&&isCharted(a)){const q=p(a);mini.fillRect(q.x,q.y,1,1);}for(const e of s.enemies)if(!e.dead&&actEnemyReady(e)&&isCharted(e)){const q=p(e);mini.beginPath();mini.moveTo(q.x-3,q.y-3);mini.lineTo(q.x+3,q.y+3);mini.moveTo(q.x+3,q.y-3);mini.lineTo(q.x-3,q.y+3);mini.stroke();}mini.strokeRect(90,87,5,5);const q=p(s);mini.fillRect(q.x-2,q.y-2,4,4);mini.strokeRect(q.x-8,q.y-6,16,12);const dest=s.destination||s.asteroids.find(a=>a.id===s.miningId);if(dest){const d=p(dest);mini.beginPath();mini.moveTo(q.x,q.y);mini.lineTo(d.x,d.y);mini.stroke();mini.strokeRect(d.x-3,d.y-3,6,6);}}
function draw(){shadeSpace();ctx.save();flightInk();ctx.strokeStyle='#fff';ctx.lineWidth=1;
 drawExpeditionWorld();drawEncounterMarkers();drawBossTelegraph();
 for(const a of s.asteroids) {
  if(!isExtractable(a)||Math.abs(a.x-view.x)>W/view.zoom/2+a.r+20||Math.abs(a.y-view.y)>H/view.zoom/2+a.r+20)continue;
  drawAsteroidArtwork(a);
  const focused=a.id===s.miningId;
  if((distance(a,s)<145&&!s.miningId)||focused) {
   const label=mineralLabel(a)+' · '+a.ore;
   ctx.save();ctx.font='12px monospace';ctx.textAlign='center';
   ctx.strokeStyle='#000';ctx.lineWidth=4;ctx.strokeText(label,a.x,a.y+a.r+16);
   ctx.fillStyle='#fff';ctx.fillText(label,a.x,a.y+a.r+16);ctx.restore();
  }
  if(focused) {
   ctx.setLineDash([3,5]);ctx.strokeRect(a.x-a.r-7,a.y-a.r-7,a.r*2+14,a.r*2+14);ctx.setLineDash([]);
  }
 }
 drawIndustry();drawDashEchoes();
 for(const e of s.enemies)if(!e.dead&&actEnemyReady(e))drawShip(e);if(!s.dead){drawAimCone();drawFlightVector();drawShip(s);}
 drawTacticalPin();drawHoveredSystem();
 if(targetLock&&!targetLock.dead&&autoAim){const e=targetLock;ctx.setLineDash([7,5]);ctx.strokeRect(e.x-55,e.y-75,110,135);ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.fillText('ЗАХВАТ · '+Math.round(distance(s,e))+' М',e.x-55,e.y+74);}
 drawShots();drawFlightEffects();
 for(const f of fx) {
  if(f.mine){drawMiningFilament(f);continue;}
  if(f.rockHit){drawRockImpact(f);continue;}
  if(f.intake){drawCargoIntake(f);continue;}
  if(f.defenseFrom){traceFilament(f.defenseFrom,f,renderTime*43,reduceMotion?0:3,7);continue;}
  ctx.beginPath();ctx.arc(f.x,f.y,Math.max(1,(.3-f.t)*52),0,Math.PI*2);ctx.stroke();
 }
 if(s.destination){const points=remainingCourse(), dest=points.at(-1);ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(flightPose.x,flightPose.y);for(const p of points)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeRect(dest.x-10,dest.y-10,20,20);}ctx.restore();ctx.strokeStyle='#fff';drawJumpStreaks();
 if(s.nav){const e=s.enemies.find(e=>e.id===s.nav&&!e.dead);if(e){const a=Math.atan2(e.y-s.y,e.x-s.x),x=W/2+Math.cos(a)*Math.min(W*.26,230),y=H/2+Math.sin(a)*Math.min(H*.23,200);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,-6);ctx.lineTo(-6,6);ctx.closePath();ctx.stroke();ctx.restore();ctx.fillStyle='#fff';ctx.font='11px monospace';ctx.fillText(Math.round(distance(s,e))+' м',x+15,y+4);}}
 if(s.hitFlash>0){ctx.lineWidth=2;ctx.strokeRect(4,4,W-8,H-8);ctx.lineWidth=1;}
 drawMini();drawExpeditionMini();drawSectorMap();updateHud();drawRadioHud();drawTargetDiagram();
}
function resize(){W=innerWidth;H=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;mouse.seen=false;resetInput();}
function advanceFrame(t) {
 const elapsed=last===null?0:clamp((t-last)/1000,0,.1);
 last=t;
 if(launchState()?.phase==='intro')advancePrologue(elapsed);
 const flying=!paused&&!modal&&!s.dead&&introFor<=0;
 updatePresentation(elapsed);
 if(flying) {
  frameDebt+=elapsed;
  while(frameDebt+1e-9>=SIM_STEP) {
   frameDebt-=SIM_STEP;
   recordFlightPose();
   update(SIM_STEP);
   if(paused||modal||s.dead||introFor>0){frameDebt=0;recordFlightPose();break;}
  }
  // Draw between consecutive physics ticks, including frames without a new tick.
  interpolateFlight(clamp(frameDebt/SIM_STEP,0,1));
 }
 updateCamera(elapsed);
}
function loop(t) {
 if(sharedFlight?.active()){
  last=t;frameDebt=0;
  sharedFlight.draw(t);
 } else {
  advanceFrame(t);
  if(launchState()?.phase==='intro')drawPrologue();else draw();
 }
 requestAnimationFrame(loop);
}
addEventListener('resize',resize);
