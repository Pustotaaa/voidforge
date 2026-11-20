'use strict';

const mapSprite = document.createElement('img');
mapSprite.src = 'icons.png';
const spriteOrder = 'ship pause help map mine brake station build science journal target relic gate enemy repair cargo ion shield rail armor gun engine reactor cooler crystal parts npc'.split(' ');
const mapCaptions = {signal:'Сигнал',station:'Станция', relic:'Руины', gate:'Звёздные врата', merchant:'Торговец', patrol:'Патруль', salvager:'Сборщик', enemy:'Пират', asteroid:'Месторождение', rawOre:'Руда', ice:'Лёд', volatile:'Риск раскола', crystal:'Кристаллы', salvage:'Обломки'};
const iconMarkup = name => '<i class="icon icon-'+name+'" aria-hidden="true"></i>';
const prettyName = name => name[0]+name.slice(1).toLowerCase();
const mapSelection = {object:null, kind:null};
let renderedMapLabels = [];

function renderPauseButton() {
 const pause=$('pause');
 pause.innerHTML=paused?'▶':iconMarkup('pause');
 pause.setAttribute('aria-label',paused?'Продолжить':'Пауза');
 pause.title=paused?'Продолжить [Пробел]':'Пауза [Пробел]';
}

function drawFlightVector() {
 const {x,y,vx,vy,angle}=flightPose;
 const speed=Math.hypot(vx,vy), reach=shipPhysics().radius;
 ctx.fillStyle='#fff';
 if (speed>16) {
  const dx=vx/speed, dy=vy/speed;
  for (let i=0;i<Math.min(6,Math.ceil(speed/70));i++) {
   const d=reach+7+i*8;
   ctx.fillRect(x-d*dx-1,y-d*dy-1,2,2);
  }
 }
 // This marker follows the nose even on a square, symmetrical ship.
 ctx.save();
 ctx.translate(x,y);
 ctx.rotate(angle);
 ctx.beginPath(); ctx.moveTo(-4,-reach-7); ctx.lineTo(0,-reach-13); ctx.lineTo(4,-reach-7);
 ctx.stroke();
 ctx.restore();
}

function drawAimCone() {
 if(!autoAim||(!targetInRange&&!mouse.down&&!keys.fire))return;
 const {x,y,angle}=flightPose;
 const heading=angle-Math.PI/2,from=shipPhysics().radius+9;
 ctx.strokeStyle='#fff';ctx.setLineDash([4,7]);
 for(const a of [heading-AIM_HALF_ANGLE,heading+AIM_HALF_ANGLE]) {
  const dx=Math.cos(a),dy=Math.sin(a);
  ctx.beginPath();ctx.moveTo(x+dx*from,y+dy*from);
  ctx.lineTo(x+dx*(from+77),y+dy*(from+77));ctx.stroke();
 }
 ctx.setLineDash([]);
}

function setHudText(id, text) {
 const item=$(id);
 if(item.textContent!==text)item.textContent=text;
}
const UI_SCALES=[50,75,100,125];
const UI_SCALE_KEY='voidforge-ui-scale';
const CARGO_COLLAPSED_KEY='voidforge-cargo-collapsed';
let uiScale=100, cargoCollapsed=null, cargoSignature=null;

function setUiScale(percent) {
 uiScale=percent;
 $('gameUi').dataset.uiScale=String(percent);
 setHudText('uiDefault',percent+'%');
 $('uiDefault').setAttribute('aria-label','Масштаб '+percent+'%. Вернуть 100%');
 $('uiSmaller').disabled=percent===UI_SCALES[0];
 $('uiLarger').disabled=percent===UI_SCALES.at(-1);
}
function setCargoDisclosure() {
 const expanded=!(cargoCollapsed??(innerWidth<=620||innerHeight<=520));
 $('holdDetails').hidden=!expanded;
 $('holdToggle').setAttribute('aria-expanded',String(expanded));
 $('holdToggle').setAttribute('aria-label',expanded?'Свернуть список ресурсов':'Развернуть список ресурсов');
}
function changeUiScale(percent) {
 setUiScale(percent);
 try { localStorage.setItem(UI_SCALE_KEY,String(percent)); } catch {}
}
function initHudPreferences() {
 try {
  const scale=Number(localStorage.getItem(UI_SCALE_KEY));
  if(UI_SCALES.includes(scale))uiScale=scale;
  const collapsed=localStorage.getItem(CARGO_COLLAPSED_KEY);
  if(collapsed==='true'||collapsed==='false')cargoCollapsed=collapsed==='true';
 } catch {}
 setUiScale(uiScale);
 setCargoDisclosure();
}
function updateCargoHud(used, capacity) {
 setHudText('holdCapacity',used+' / '+capacity);
 if($('holdDetails').hidden)return;
 const goods=cargoGoods().filter(([item])=>resourceAmount(item)>0);
 const signature=goods.map(([item])=>item+':'+resourceAmount(item)).join('|');
 if(signature===cargoSignature)return;
 cargoSignature=signature;
 $('holdResources').innerHTML=cargoGoodsRows(goods);
 $('holdEmpty').hidden=goods.length>0;
}
$('uiSmaller').onclick=()=>changeUiScale(UI_SCALES[UI_SCALES.indexOf(uiScale)-1]??uiScale);
$('uiLarger').onclick=()=>changeUiScale(UI_SCALES[UI_SCALES.indexOf(uiScale)+1]??uiScale);
$('uiDefault').onclick=()=>changeUiScale(100);
$('holdToggle').onclick=()=>{
 cargoCollapsed=!$('holdDetails').hidden;
 setCargoDisclosure();
 updateCargoHud(cargoUsed(),cargoMax());
 try { localStorage.setItem(CARGO_COLLAPSED_KEY,String(cargoCollapsed)); } catch {}
};
addEventListener('resize',setCargoDisclosure);
initHudPreferences();

function updateHud() {
 renderDebtHud();
 const cc=s.campaign, region=zoneAt(s), contact=nearestContact();
 updateDamageHud();
 updateCombatHud();
 const hull=s.modules.reduce((n,m)=>n+m.hp,0)/(s.hullCapacity||1)*100;
 for(const [id,value] of [['hp',s.dead?0:hull],['energy',s.energy],['heat',s.heat]]) {
  $(id).value=value;
  setHudText(id+'Text',Math.round(value)+'%');
 }
 const maxShield=activeCount('shield')*90;
 $('shieldMeter').hidden=!maxShield;
 if(maxShield) {
  $('shieldBar').value=cc.shield/maxShield*100;
  setHudText('shieldText',Math.ceil(cc.shield/Math.max(1,maxShield)*100)+'%');
 }
 setHudText('regionName',prettyName(region.name));
 const used=cargoUsed(), capacity=cargoMax();
 updateCargoHud(used,capacity);
 $('interact').hidden=!contact||s.dead||Boolean(cc.scan);
 if (contact) {
  const label={station:'Торговать',merchant:'Торговать',gate:cc.gateReady?'Прыжок':'Врата',signal:'Сигнал',relic:cc.scanned.includes(contact.id)?'Архив':'Сканировать'}[contact.kind]||'Связь';
  setHudText('interactLabel',label);
  if ($('interact').dataset.kind!==contact.kind) {
   $('interact').dataset.kind=contact.kind;
   $('interact').innerHTML=iconMarkup(contactIcon(contact.kind))+'<span id="interactLabel">'+label+'</span>';
  }
 }
 const resource=s.asteroids.find(a=>a.id===s.miningId);
 $('mine').classList.toggle('active',Boolean(resource));
 setHudText('mineLabel',resource?'Стоп добычи':'Добыча');
 $('mine').setAttribute('aria-label',resource?'Остановить добычу':'Добыча');
 let mode='';
 if (paused) mode='Пауза';
 else if (s.dead) mode='Сигнал потерян';
 else if (cc.scan) mode='Скан '+Math.floor(cc.scan.progress/cc.scan.duration*100)+'% · '+Math.ceil(cc.scan.duration-cc.scan.progress)+' с';
 else if (resource) mode=s.destination?'Подлёт к цели':s.miningWait||(resource.wreck?'Разборка':'Добыча')+' · осталось '+resource.ore;
 else if (s.destination) mode='Автопилот · '+Math.round(distance(s,s.destination))+' м';
 else if (s.braking) mode='Торможение';
 let warning='';
 if (s.overheated) warning='Перегрев';
 else if (used>=capacity) warning='Трюм заполнен';
 else if (bossShip()?.active&&!bossShip().dead) warning=bossShip().windup?'СМОТРИТЕЛЬ · УХОДИТЕ С ЛИНИИ ОГНЯ':count('pylon',bossShip())?'Смотритель · излучатели '+count('pylon',bossShip())+' / 2':'Смотритель · фаза 2';
 else if (targetInRange&&!targetLock) warning='Доверните нос к цели';
 else if (!isSafe(s)&&s.enemies.some(e=>!e.dead&&actEnemyReady(e)&&e.archetype!=='boss'&&distance(s,e)<850)) warning='Пираты рядом';
 updateCampaignHud(resource);
 $('modeLabel').hidden=!mode; setHudText('modeLabel',mode);
 $('nearby').hidden=!warning; setHudText('nearby',warning);
}

function contactIcon(kind) {
 if(['station','relic','gate','enemy','crystal'].includes(kind))return kind;
 if(kind==='asteroid'||kind==='salvage'||kind==='rawOre')return 'mine';
 if(kind==='ice'||kind==='volatile')return 'crystal';
 return 'npc';
}
function contactKind(asteroid) {
 if(['crystal','salvage','rawOre','ice','volatile'].includes(asteroid.material))return asteroid.material;
 return 'asteroid';
}
function mapPoints() {
 return [...allContacts().filter(p=>p.kind==='signal'?visibleSignal(p):!isStory()||['station','relic','gate'].includes(p.kind)||isCharted(p)).map(object=>({object,kind:object.kind})),
  ...s.enemies.filter(e=>!e.dead&&actEnemyReady(e)&&isCharted(e)).map(object=>({object,kind:'enemy'})),
  ...s.asteroids.filter(a=>isExtractable(a)&&(isCharted(a)||a.id==='first-vein')).map(object=>({object,kind:contactKind(object)}))];
}
function isResource(kind) { return ['asteroid','crystal','salvage','rawOre','ice','volatile'].includes(kind); }
function setMapObject(object, kind) {
 mapSelection.object=object;
 mapSelection.kind=kind;
 $('mapObject').hidden=!object;
 $('routeInfo').hidden=Boolean(object);
 if (!object) return;
 const label=isResource(kind)?mineralLabel(object):prettyName(object.name);
 const info=[mapCaptions[kind],Math.round(distance(object,s))+' м'];
 if(isResource(kind))info.push(...(object.wreck?[]:[rockSize(object)]),object.ore+' ед.',miningDescription(object));
 if(kind==='signal'&&object.known)info.push(SIGNAL_TYPES[object.signature].title);
 if(kind==='enemy')info.push(ENEMY_INFO[object.archetype].rank+' · Угроза '+ENEMY_INFO[object.archetype].tier+' / 5 · '+ENEMY_INFO[object.archetype].tactic);
 if(kind==='enemy'&&object.archetype==='boss'&&!bossUnlocked())info.push('Спит до снятия блокады и изучения трёх реликтов');
 if(kind==='gate')info.push(s.campaign.gateReady?'Активны':'Не восстановлены');
 if(kind==='relic')info.push(s.campaign.scanned.includes(object.id)?'Изучены':'Не изучены');
 $('mapIcon').innerHTML=iconMarkup(kind==='signal'&&object.known?SIGNAL_TYPES[object.signature].icon:contactIcon(kind));
 $('mapName').textContent=label;
 $('mapMeta').textContent=info.join(' · ');
 $('mapAction').disabled=isResource(kind)&&!canDrill(object);
 $('mapAction').textContent=isResource(kind)?object.wreck?'Разобрать':'Добывать':kind==='enemy'?'К цели':canInteract(object)?'Взаимодействовать':'Подлететь';
}
function chooseMapPoint(p) {
 const rect=sectorCanvas.getBoundingClientRect();
 const screen={x:p.x*rect.width/720,y:p.y*rect.height/720};
 const label=renderedMapLabels.find(box=>box.entry&&screen.x>=box.x&&screen.x<=box.x+box.w&&screen.y>=box.y&&screen.y<=box.y+box.h);
 if(label) { setMapObject(label.entry.object,label.entry.kind); return; }
 const world=mapToWorld(p), scale=rect.width*mapView.zoom/6000;
 const closest=mapPoints().map(entry=>({...entry,dist:distance(world,entry.object)*scale}))
  .filter(entry=>entry.dist<=(isResource(entry.kind)?Math.max(6,entry.object.r*scale):16))
  .sort((a,b)=>a.dist-b.dist);
 const entry=closest.find(entry=>!isResource(entry.kind))||closest[0];
 if(entry) { setMapObject(entry.object,entry.kind); return; }
 setMapObject(null,null);
 setDestination(world.x,world.y);
}
$('mapAction').onclick=()=>{
 const {object,kind}=mapSelection;
 if(!object)return;
 if(isResource(kind)) {
  startMining(object);
 } else if(kind==='enemy') {
  const length=distance(s,object)||1;
  const x=object.x+(s.x-object.x)/length*430;
  const y=object.y+(s.y-object.y)/length*430;
  setDestination(x,y); s.nav=object.id;
 } else approach(object);
};
for(const place of PLACES) {
 const tile=button('',()=>setMapObject(place,place.kind));
 tile.innerHTML=iconMarkup(contactIcon(place.kind))+' '+prettyName(place.name);
 $('mapDestinations').appendChild(tile);
}
function resetMapSelection() {
 setMapObject(null,null);
 renderedMapLabels=[];
 $('routeInfo').textContent=s.destination?'Маршрут задан · '+Math.round(distance(s,s.destination))+' м':'Выберите объект или точку маршрута.';
}

function boxesIntersect(a,b,gap=0) {
 return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
}
function placeMapLabel(label, point, w, h, occupied, textWidth) {
 const width=Math.ceil(textWidth)+10, height=22;
 if(width>w-10||height>h-10)return null;
 const positions=[[12,-11],[-width-12,-11],[-width/2,12],[-width/2,-height-12],[14,14],[-width-14,14],[-width/2,31],[-width/2,-height-31],[22,-height-23],[-width-22,-height-23]];
 for(const [dx,dy] of positions) {
  const box={x:clamp(point.x+dx,5,w-width-5),y:clamp(point.y+dy,5,h-height-5),w:width,h:height,entry:label.entry};
  if(!occupied.some(other=>boxesIntersect(box,other,3)))return box;
 }
 return null;
}
function drawMapMarker(kind,p,chosen=false) {
 const resource=isResource(kind), size=resource?8:20;
 if(chosen)sg.strokeRect(p.x-size*.65,p.y-size*.65,size*1.3,size*1.3);
 if(resource) {
  const ink={crystal:'#fff',ice:'#ccc',volatile:'#ededed',rawOre:'#aaa'};
  sg.strokeStyle=sg.fillStyle=ink[kind]||'#bdbdbd';
  if(kind==='ice') {
   sg.strokeRect(p.x-2.5,p.y-2.5,5,5);
  } else if(kind==='crystal'||kind==='volatile') {
   sg.beginPath();sg.moveTo(p.x,p.y-4);sg.lineTo(p.x+3,p.y);
   sg.lineTo(p.x,p.y+4);sg.lineTo(p.x-3,p.y);sg.closePath();sg.stroke();
  } else if(kind==='salvage') {
   sg.beginPath();sg.moveTo(p.x-2,p.y-2);sg.lineTo(p.x+2,p.y+2);
   sg.moveTo(p.x+2,p.y-2);sg.lineTo(p.x-2,p.y+2);sg.stroke();
  } else {
   sg.fillRect(p.x-1.5,p.y-1.5,3,3);
  }
  return;
 }
 if(kind==='ship') {
  sg.save();sg.translate(p.x,p.y);sg.rotate(s.angle);sg.fillStyle='#fff';sg.strokeStyle='#000';sg.lineWidth=3;
  sg.beginPath();sg.moveTo(0,-11);sg.lineTo(7,7);sg.lineTo(0,4);sg.lineTo(-7,7);sg.closePath();sg.stroke();sg.fill();sg.restore();return;
 }
 sg.fillStyle='#000'; sg.fillRect(p.x-9,p.y-9,18,18); sg.fillStyle='#fff';
 const index=spriteOrder.indexOf(contactIcon(kind));
 if(mapSprite.naturalWidth)sg.drawImage(mapSprite,index*32,0,32,32,p.x-10,p.y-10,20,20);
 else sg.strokeRect(p.x-4,p.y-4,8,8);
}
function drawSectorMap() {
 if(modal!=='mapModal')return;
 const r=sectorCanvas.getBoundingClientRect(), w=r.width, h=r.height;
 if(w<1||h<1)return;
 const ratio=Math.min(devicePixelRatio||1,2), pixelW=Math.round(w*ratio),pixelH=Math.round(h*ratio);
 if(sectorCanvas.width!==pixelW||sectorCanvas.height!==pixelH) {sectorCanvas.width=pixelW;sectorCanvas.height=pixelH;}
 sg.setTransform(ratio,0,0,ratio,0,0);
 sg.imageSmoothingEnabled=false;
 const scale=w/6000*mapView.zoom;
 const pixel=p=>({x:w/2+(p.x-mapView.x)*scale,y:h/2+(p.y-mapView.y)*scale});
 const visible=(p,pad=0)=>p.x>=pad&&p.x<=w-pad&&p.y>=pad&&p.y<=h-pad;
 sg.clearRect(0,0,w,h);
 sg.fillStyle=sg.strokeStyle='#fff'; sg.lineWidth=1;
 const corner=pixel({x:-LIMIT,y:-LIMIT});
 sg.strokeStyle='#707070';
 sg.setLineDash([1,7]);
 for(let n=-LIMIT;n<=LIMIT;n+=900) {
  const gx=pixel({x:n,y:-LIMIT}), gy=pixel({x:-LIMIT,y:n});
  sg.beginPath(); sg.moveTo(gx.x,gx.y); sg.lineTo(gx.x,gx.y+2*LIMIT*scale);
  sg.moveTo(gy.x,gy.y); sg.lineTo(gy.x+2*LIMIT*scale,gy.y); sg.stroke();
 }
 for(const region of REGIONS) {
  const anchor=pixel(region);
  sg.beginPath(); sg.arc(anchor.x,anchor.y,region.r*scale,0,Math.PI*2); sg.stroke();
 }
 sg.setLineDash([]);sg.strokeRect(corner.x,corner.y,2*LIMIT*scale,2*LIMIT*scale);
 const player=pixel(s), destination=s.destination||s.asteroids.find(a=>a.id===s.miningId);
 if(destination) {
  const route=(s.destination?remainingCourse():[destination]).map(pixel),to=route.at(-1);
  sg.setLineDash([5,5]); sg.beginPath(); sg.moveTo(player.x,player.y); for(const p of route)sg.lineTo(p.x,p.y);sg.stroke(); sg.setLineDash([]);
  sg.strokeRect(to.x-5,to.y-5,10,10);
 }
 drawRadarFog(pixel,w,h,scale);
 const points=mapPoints().map(entry=>({...entry,p:pixel(entry.object)})).filter(entry=>visible(entry.p,6));
 const sites=points.filter(entry=>!isResource(entry.kind));
 for(const {object,kind,p} of points.filter(entry=>isResource(entry.kind)))drawMapMarker(kind,p,object===mapSelection.object);
 for(const {object,kind,p} of sites)drawMapMarker(kind,p,object===mapSelection.object);
 if(visible(player,7))drawMapMarker('ship',player);

 const occupied=sites.map(({p})=>({x:p.x-8,y:p.y-8,w:16,h:16}));
 if(visible(player,7))occupied.push({x:player.x-8,y:player.y-8,w:16,h:16});
 const labels=[];
 const selected=sites.find(site=>site.object===mapSelection.object);
 if(selected)labels.push({name:prettyName(selected.object.name),p:selected.p,entry:selected});
 for(const region of REGIONS) {
  const p=pixel({x:region.x,y:region.y-region.r*.54});
  if(visible(p,5)&&(!isStory()||s.campaign.discovered.includes(region.id)))labels.push({name:prettyName(region.name),p});
 }
 if(visible(player,14))labels.push({name:'Вы',p:player});
 if(mapView.zoom>=1.6)for(const site of sites) {
  if(site===selected||site.object.id==='home')continue;
  labels.push({name:prettyName(site.object.name),p:site.p,entry:site});
 }
 sg.font='600 14px system-ui, sans-serif'; sg.textBaseline='middle';
 renderedMapLabels=[];
 const usedNames=new Set();
 for(const label of labels) {
  if(usedNames.has(label.name))continue;
  const width=sg.measureText(label.name)?.width??label.name.length*8;
  const box=placeMapLabel(label,label.p,w,h,occupied,width);
  if(!box)continue;
  usedNames.add(label.name); occupied.push(box); renderedMapLabels.push(box);
  sg.fillStyle='#000'; sg.fillRect(box.x,box.y,box.w,box.h);
  sg.fillStyle='#fff'; sg.fillText(label.name,box.x+5,box.y+box.h/2);
 }
 $('zoomLabel').textContent=mapView.zoom.toFixed(1)+'×';
 $('zoomOut').disabled=mapView.zoom<=1; $('zoomIn').disabled=mapView.zoom>=6;
}

// Plan over obstacle clearance, then smooth the grid path into straight segments.
const ROUTE_CELL = 45;
const ROUTE_SIZE = LIMIT * 2 / ROUTE_CELL + 1;
let flightRoute = null;
const flightObstacles = phys => [
 ...s.asteroids.filter(isExtractable),
 ...PLACES.filter(p => p.kind === 'station').map(p => ({...p,r:65}))
].map(a => ({x:a.x,y:a.y,r:a.r+phys.radius*.72+13}));

function clearSegment(from, to, obstacles) {
 const dx=to.x-from.x,dy=to.y-from.y;
 return !obstacles.some(a => {
  const ox=from.x-a.x,oy=from.y-a.y;
  if(ox*ox+oy*oy<a.r*a.r && ox*dx+oy*dy>=0 && distance(a,to)>=a.r)return false;
  return segmentDistance(a,from,to)<a.r;
 });
}

function courseTask() {
 const resource=s.miningId&&s.asteroids.find(a=>a.id===s.miningId);
 if(resource)return {center:resource,range:MINE_RANGE};
 const id=s.campaign.approach, contact=id&&allContacts().find(p=>p.id===id);
 return contact?{center:contact,range:contact.kind==='gate'?260:235}:null;
}

function planCourse(goal, phys) {
 const obstacles=flightObstacles(phys),task=courseTask();
 if(clearSegment(s,goal,obstacles))return {goal,radius:phys.radius,points:[goal],next:0};
 const size=ROUTE_SIZE,total=size*size;
 const blocked=new Uint8Array(total), scores=new Float64Array(total).fill(Infinity);
 const parent=new Int32Array(total).fill(-1), closed=new Uint8Array(total);
 const index=(x,y)=>y*size+x;
 const point=i=>({x:(i%size)*ROUTE_CELL-LIMIT,y:Math.floor(i/size)*ROUTE_CELL-LIMIT});
 const cell=v=>clamp(Math.round((v+LIMIT)/ROUTE_CELL),0,size-1);
 for(const a of obstacles) {
  for(let y=cell(a.y-a.r);y<=cell(a.y+a.r);y++)for(let x=cell(a.x-a.r);x<=cell(a.x+a.r);x++) {
   const i=index(x,y);
   if(distance(a,point(i))<a.r)blocked[i]=1;
  }
 }
 function nearestCell(p, reachable, target=null) {
  const x=cell(p.x),y=cell(p.y);
  let best=-1,dist=Infinity;
  for(let j=Math.max(0,y-6);j<=Math.min(size-1,y+6);j++)for(let k=Math.max(0,x-6);k<=Math.min(size-1,x+6);k++) {
   const i=index(k,j),candidate=point(i),d=distance(p,candidate);
   if(blocked[i]||d>=dist||(target&&distance(candidate,target.center)>=target.range-10)||(reachable&&!clearSegment(p,candidate,obstacles)))continue;
   best=i;dist=d;
  }
  return best;
 }
 const start=nearestCell(s,true),end=nearestCell(goal,false,task);
 const route={goal,radius:phys.radius,points:[],next:0};
 if(start<0||end<0)return route;
 const open=new Set([start]);
 const endPoint=point(end);
 scores[start]=0;
 while(open.size) {
  let current=-1,best=Infinity;
  for(const i of open) {
   const cost=scores[i]+distance(point(i),endPoint);
   if(cost<best){best=cost;current=i;}
  }
  open.delete(current);
  if(current===end){
   const reversed=[];
   for(let i=end;i!==-1;i=parent[i])reversed.push(point(i));
   if(clearSegment(endPoint,goal,obstacles))reversed.unshift(goal);
   for(let from=s;reversed.length;) {
    let next=0;
    while(next<reversed.length-1&&!clearSegment(from,reversed[next],obstacles))next++;
    from=reversed[next];
    route.points.push(from);
    reversed.splice(next);
   }
   return route;
  }
  closed[current]=1;
  const x=current%size,y=Math.floor(current/size);
  for(let ny=Math.max(0,y-1);ny<=Math.min(size-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(size-1,x+1);nx++){
   const i=index(nx,ny),diagonal=nx!==x&&ny!==y;
   if(blocked[i]||closed[i]||(diagonal&&(blocked[index(nx,y)]||blocked[index(x,ny)])))continue;
   const cost=scores[current]+(diagonal?Math.SQRT2:1)*ROUTE_CELL;
   if(cost>=scores[i])continue;
   scores[i]=cost;parent[i]=current;open.add(i);
  }
 }
 return route;
}

function courseWaypoint(goal, phys) {
 if(!flightRoute||distance(flightRoute.goal,goal)>55||flightRoute.radius!==phys.radius)flightRoute=planCourse(goal,phys);
 const route=flightRoute;
 if(route.next<route.points.length-1&&distance(s,route.points[route.next])<13)route.next++;
 return route.points[route.next];
}

const remainingCourse = () => flightRoute?.points.length ? flightRoute.points.slice(flightRoute.next) : [s.destination];
