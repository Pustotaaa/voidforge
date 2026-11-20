'use strict';

sharedFlight = (() => {
 const server = 'https://voidforge-coop-lab.lavishcoil.chatgpt.site';
 const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
 const validName = /^[\p{L}\p{N} _.-]{1,20}$/u;
 const sessionKey = 'voidforge-main-coop-session';
 const nameKey = 'voidforge-main-coop-name';
 const moveKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
 const material = {iron:'rawOre',crystal:'crystal',ice:'ice'};
 const sizes = ['', 'малый', 'средний', 'крупный'];
 const layouts = ['wanderer','courier','hauler'];
 const camera = {x:0,y:0};
 const controls = new Set(), gestures = new Map(), ships = new Map();
 let lobby = null, room = null, world = null, target = null;
 let pending = false, syncing = false, timer, lastEvent = 0, noticeUntil = 0, lastFrame = null;
 let effects = [];

 function get(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
 }
 function store(key, value) {
  try {
   if(value===null)sessionStorage.removeItem(key);
   else sessionStorage.setItem(key,value);
  } catch {}
 }
 function setText(id,text) {
  if($(id).textContent!==text)$(id).textContent=text;
 }
 function lobbyNote(text='') {
  $('coopLobbyNote').hidden=!text;
  setText('coopLobbyNote',text);
 }
 function notice(text, time=3200) {
  noticeUntil=performance.now()+time;
  $('coopNotice').hidden=!text;
  setText('coopNotice',text);
 }
 function setPending(value) {
  pending=value;
  $('coopCreate').disabled=value;
  $('coopJoin').disabled=value;
 }
 async function request(path, payload) {
  const options={credentials:'omit',signal:AbortSignal.timeout(4500)};
  if(payload)Object.assign(options,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  let response;
  try { response=await fetch(server+path,options); }
  catch { throw new Error('Связь с сервером потеряна. Попробуйте ещё раз.'); }
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body){
   const error=new Error(body?.error||'Сервер комнат не ответил.');
   error.status=response.status;
   throw error;
  }
  return body;
 }
 async function probe(entry) {
  setText('coopServer','Проверяю соединение…');
  try {
   await request('/api/health');
   if(lobby===entry)setText('coopServer','Сервер онлайн');
  } catch {
   if(lobby===entry)setText('coopServer','Сервер недоступен');
  }
 }
 function openLobby(invite='') {
  if(lobby)return;
  lobby={previous:modal,hidden:$('flightHud').hidden,opener:document.activeElement};
  save(false);
  $('coopName').value=get(nameKey)||'';
  $('coopCode').value=invite;
  lobbyNote();
  openModal('coopModal');
  $('coopName').focus({preventScroll:true});
  probe(lobby);
 }
 function closeLobby() {
  if(!lobby||room)return;
  const {previous,hidden,opener}=lobby;
  lobby=null;
  $('flightHud').hidden=hidden;
  if(previous){
   openModal(previous);
   opener?.focus({preventScroll:true});
  } else closeModal();
  const url=new URL(location.href);
  if(url.searchParams.has('room')){
   url.searchParams.delete('room');
   history.replaceState(null,'',url);
  }
 }
 function path(code, action) { return '/api/rooms/'+code+'/'+action; }
 function clearInput() { controls.clear();gestures.clear(); }
 function later(delay) { clearTimeout(timer);timer=setTimeout(sync,delay); }

 function showFlight(data, token) {
  room={code:data.code,token};
  store(sessionKey,JSON.stringify(room));
  target=null;world=null;lastFrame=null;effects=[];ships.clear();clearInput();
  lastEvent=data.events.at(-1)?.id||0;
  $('coopModal').classList.add('hidden');
  $('flightHud').hidden=true;
  $('coopHud').hidden=false;
  setText('coopRoomCode',room.code);
  setText('coopConnection','В сети');
  setText('coopMine','Добыча');
  const pilot=data.players.find(p=>p.id===data.you);
  if(pilot)Object.assign(camera,{x:pilot.x,y:pilot.y});
  absorb(data);
  notice('Цель экипажа — '+data.goal+' единиц груза.',4300);
  $('coopInvite').focus({preventScroll:true});
  later(100);
 }
 function showLobby(message) {
  const code=room?.code;
  clearTimeout(timer);
  room=world=target=null;ships.clear();effects=[];clearInput();
  store(sessionKey,null);
  $('coopHud').hidden=true;
  $('coopModal').classList.remove('hidden');
  if(code)$('coopCode').value=code;
  lobbyNote(message);
  $('coopName').focus({preventScroll:true});
 }
 async function start(join) {
  if(!lobby||pending)return;
  const name=$('coopName').value.trim().normalize('NFC');
  const code=$('coopCode').value.trim().toUpperCase();
  if(!validName.test(name)){
   lobbyNote('Введите позывной от 1 до 20 символов. Используйте буквы, цифры, пробел, точку или дефис.');
   $('coopName').focus();return;
  }
  if(join&&!codePattern.test(code)){
   lobbyNote('Введите шестизначный код комнаты.');
   $('coopCode').focus();return;
  }
  const entry=lobby;
  setPending(true);
  lobbyNote(join?'Подключаюсь к комнате…':'Создаю комнату…');
  try {
   const data=await request(join?path(code,'join'):'/api/rooms',{name});
   if(lobby!==entry){
    request(path(data.code,'leave'),{token:data.token}).catch(()=>{});
    return;
   }
   store(nameKey,name);
   showFlight(data,data.token);
  } catch(error) {
   if(lobby===entry)lobbyNote(error.message);
  } finally { setPending(false); }
 }
 async function resume(saved) {
  const entry=lobby;
  setPending(true);
  lobbyNote('Восстанавливаю соединение…');
  try {
   const data=await request(path(saved.code,'sync'),{token:saved.token});
   if(lobby===entry)showFlight(data,saved.token);
  } catch(error) {
   if(error.status===401||error.status===404)store(sessionKey,null);
   if(lobby===entry)lobbyNote(error.message);
  } finally { setPending(false); }
 }
 function initialize() {
  $('launchCoop').onclick=$('openCoop').onclick=()=>openLobby();
  $('closeCoop').onclick=closeLobby;
  $('coopCreate').onclick=()=>start(false);
  $('coopForm').onsubmit=event=>{event.preventDefault();start(true);};
  $('coopCode').oninput=event=>{event.target.value=event.target.value.toUpperCase();};
  $('coopInvite').onclick=copyInvite;
  $('coopLeave').onclick=leave;
  $('coopMine').onclick=toggleMine;
  for(const button of document.querySelectorAll('[data-coop-dir]')){
   button.onpointerdown=event=>{
    if(!room)return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    gestures.set(event.pointerId,button.dataset.coopDir);
    later(0);
   };
   button.onpointerup=button.onpointercancel=button.onlostpointercapture=event=>{
    if(gestures.delete(event.pointerId)&&room)later(0);
   };
  }

  const invite=new URL(location.href).searchParams.get('room')?.toUpperCase();
  let saved;
  try { saved=JSON.parse(get(sessionKey)); } catch {}
  if(saved&&codePattern.test(saved.code)&&typeof saved.token==='string'&&(!invite||invite===saved.code)){
   openLobby(saved.code);
   resume(saved);
  } else if(invite) {
   openLobby(codePattern.test(invite)?invite:'');
   if(!codePattern.test(invite))lobbyNote('В ссылке некорректный код комнаты.');
  }
 }
 async function copyInvite() {
  if(!room)return;
  const url=new URL(location.pathname,location.origin);
  url.searchParams.set('room',room.code);
  try {
   await navigator.clipboard.writeText(url.href);
   if(room)notice('Ссылка на комнату скопирована.');
  } catch { if(room)notice('Код комнаты — '+room.code+'.',6000); }
 }
 function leave() {
  if(!room)return;
  const active=room;
  showLobby('Вы покинули комнату '+active.code+'.');
  request(path(active.code,'leave'),{token:active.token}).catch(()=>{});
 }

 function pilot() { return world?.players.find(player=>player.id===world.you); }
 function intent() {
  const pressed=new Set([...controls,...gestures.values()]);
  const dx=Number(pressed.has('KeyD')||pressed.has('ArrowRight'))-Number(pressed.has('KeyA')||pressed.has('ArrowLeft'));
  const dy=Number(pressed.has('KeyS')||pressed.has('ArrowDown'))-Number(pressed.has('KeyW')||pressed.has('ArrowUp'));
  if(dx||dy||!target)return {dx,dy,target};
  const me=pilot(), rock=world.rocks.find(a=>a.id===target);
  if(!me||!rock||rock.left<=0)return {dx,dy,target};
  const offset={x:rock.x-me.x,y:rock.y-me.y}, gap=Math.hypot(offset.x,offset.y);
  const remaining=gap-(world.field.range+rock.radius-12);
  if(remaining<=0)return {dx,dy,target};
  const scale=Math.min(1,remaining/82)/gap;
  return {dx:offset.x*scale,dy:offset.y*scale,target};
 }
 async function sync() {
  if(!room||syncing)return;
  const active=room;
  syncing=true;
  const started=performance.now();
  let retry=0;
  try {
   const data=await request(path(active.code,'sync'),{token:active.token,...intent()});
   if(room!==active)return;
   setText('coopConnection','В сети');
   absorb(data);
  } catch(error) {
   if(room!==active)return;
   if(error.status===401||error.status===404){showLobby(error.message);return;}
   setText('coopConnection','Переподключение');
   retry=1100;
  } finally {
   syncing=false;
   if(room){
    const move=intent(),delay=move.dx||move.dy||move.target?480:900;
    later(retry||Math.max(40,delay-(performance.now()-started)));
   }
  }
 }
 function absorb(data) {
  const previous=world;
  world=data;
  setText('coopCount',data.players.filter(p=>p.online).length+' / 5');
  const roster=players=>JSON.stringify(players.map(p=>[p.id,p.name,p.online,p.mined]));
  if(!previous||roster(previous.players)!==roster(data.players)){
   $('coopPlayers').replaceChildren(...data.players.map(p=>{
    const li=document.createElement('li'), name=document.createElement('span'), score=document.createElement('span');
    name.textContent=p.name+(p.id===data.you?' (вы)':'');
    score.textContent=p.online?p.mined:'офлайн';
    li.appendChild(name);li.appendChild(score);
    return li;
   }));
  }
  if(!previous||previous.total!==data.total){
   setText('coopTotal',data.total+' / '+data.goal);
   $('coopGoal').max=data.goal;
   $('coopGoal').value=data.total;
   setText('coopIron',String(data.cargo.iron));
   setText('coopCrystal',String(data.cargo.crystal));
   setText('coopIce',String(data.cargo.ice));
   if(previous&&previous.total<data.goal&&data.total>=data.goal)notice('Цель экипажа выполнена.',6500);
  }
  for(const event of data.events){
   if(event.id<=lastEvent)continue;
   lastEvent=event.id;
   effects.push({...event,born:performance.now()});
  }
  if(target&&data.rocks.find(rock=>rock.id===target)?.left===0)choose(null);
 }
 function choose(rock) {
  target=rock?.id||null;
  setText('coopMine',target?'Стоп добычи':'Добыча');
  if(rock)notice(GOODS[material[rock.kind]].name+' · '+sizes[rock.size]+' · '+rock.left);
  later(0);
 }
 function nearest(point, radius) {
  let result=null, best=Infinity;
  for(const rock of world.rocks){
   const gap=distance(rock,point);
   if(rock.left>0&&gap<radius(rock)&&gap<best){result=rock;best=gap;}
  }
  return result;
 }
 function toggleMine() {
  if(!world)return;
  if(target){choose(null);return;}
  const rock=nearest(pilot(),()=>Infinity);
  if(rock)choose(rock);
  else notice('Все залежи исчерпаны.');
 }
 const zoom=()=>clamp(W/650,.62,1);
 function selectAsteroid(event) {
  if(event.button!==0||!world)return;
  event.preventDefault();
  const point={x:camera.x+(event.clientX-W/2)/zoom(),y:camera.y+(event.clientY-H/2)/zoom()};
  const rock=nearest(point,a=>a.radius+12);
  if(rock)choose(target===rock.id?null:rock);
 }
 function keyDown(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return;
  if(moveKeys.has(event.code)){
   event.preventDefault();
   if(!controls.has(event.code)){controls.add(event.code);later(0);}
  } else if(event.code==='KeyE'&&!event.repeat) {
   event.preventDefault();toggleMine();
  }
 }
 function keyUp(event) { if(controls.delete(event.code))later(0); }

 function draw(now) {
  const blend=lastFrame===null?1:1-Math.exp(-Math.min(80,now-lastFrame)*.014);
  lastFrame=now;
  const seen=new Set();
  for(const pilot of world.players){
   seen.add(pilot.id);
   const angle=pilot.angle+Math.PI/2;
   const ship=ships.get(pilot.id)||{x:pilot.x,y:pilot.y,angle,modules:STARTER_SHIPS[layouts[pilot.slot%layouts.length]].modules()};
   ship.x+=(pilot.x-ship.x)*blend;
   ship.y+=(pilot.y-ship.y)*blend;
   ship.angle+=angleDifference(angle,ship.angle)*blend;
   ships.set(pilot.id,ship);
   if(pilot.id===world.you){
    camera.x+=(ship.x-camera.x)*blend;
    camera.y+=(ship.y-camera.y)*blend;
   }
  }
  for(const id of ships.keys())if(!seen.has(id))ships.delete(id);
  const size=zoom(), field=world.field;
  shadeSpace(camera,{x:camera.x-field.width/2,y:camera.y-field.height/2});
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(size,size);ctx.translate(-camera.x,-camera.y);
  ctx.strokeStyle='#646464';ctx.setLineDash([6,9]);ctx.strokeRect(0,0,field.width,field.height);ctx.setLineDash([]);
  for(const rock of world.rocks){
   if(rock.left<=0)continue;
   const {x,y,radius:r}=rock, seed=Number(rock.id.slice(1))*1.72+.6;
   drawAsteroidArtwork({x,y,r,seed,material:material[rock.kind],ore:rock.left,initialReserve:rock.total});
   if(rock.id===target){
    ctx.strokeStyle='#ddd';ctx.setLineDash([3,5]);ctx.strokeRect(x-r-6,y-r-6,2*r+12,2*r+12);ctx.setLineDash([]);
    ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(rock.left+' ед.',x,y+r+20);
   }
  }
  for(const pilot of world.players){
   const ship=ships.get(pilot.id), own=pilot.id===world.you;
   const rock=pilot.beam&&world.rocks.find(a=>a.id===pilot.beam);
   if(rock){
    ctx.strokeStyle='#cfcfcf';
    traceFilament(ship,rock,now/65,reduceMotion?0:2,12);
   }
   ctx.save();ctx.translate(ship.x,ship.y);ctx.scale(.76,.76);
   ctx.globalAlpha=pilot.online?1:.4;
   drawShip({...ship,x:0,y:0,archetype:'drone'});
   ctx.restore();
   ctx.fillStyle=own?'#fff':'#bbb';ctx.font='bold 12px monospace';ctx.textAlign='center';
   ctx.fillText(pilot.name+(own?' · вы':''),ship.x,ship.y+43,140);
  }
  effects=effects.filter(effect=>now-effect.born<950);
  for(const event of effects){
   const elapsed=Math.max(0,now-event.born),duration=event.depleted?.91:.43;
   const rock=world.rocks.find(a=>a.id===event.rock);
   const kind=material[event.kind], ship=ships.get(event.player);
   if(rock&&elapsed<duration*1000)drawRockImpact({x:event.x,y:event.y,broken:event.depleted,
    t:duration-elapsed/1000,duration,radius:rock.radius,item:kind,seed:event.id*.63});
   if(!ship)continue;
   const t=clamp(elapsed/700,0,1), hatch=position(ship,{x:0,y:.5});
   if(t<1){
    const x=event.x+(hatch.x-event.x)*t, y=event.y+(hatch.y-event.y)*t;
    drawMineralShard(kind,{x,y},4,reduceMotion?0:t*3);
   } else {
    ctx.save();ctx.globalAlpha=1-(elapsed-700)/250;ctx.fillStyle='#fff';ctx.font='bold 12px monospace';ctx.textAlign='center';
    ctx.fillText('+'+event.count,hatch.x,hatch.y-43);ctx.restore();
   }
  }
  ctx.restore();
  if(noticeUntil&&now>noticeUntil){noticeUntil=0;$('coopNotice').hidden=true;}
 }
 return { initialize, closeLobby, active:()=>Boolean(world), clearInput, keyDown, keyUp, selectAsteroid, draw };
})();
