'use strict';

sharedFlight = (() => {
 const apiRoot='/api/v2';
 const codePattern=/^[A-HJ-NP-Z2-9]{6}$/;
 const secretPattern=/^[a-f0-9]{64}$/;
 const validName=/^[\p{L}\p{N} _.-]{1,20}$/u;
 const pilotKey='voidforge-pilot-v2', roomKey='voidforge-room-v2';
 const moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
 let roomCameraScale=1;
 const camera={x:0,y:0}, controls=new Set(), visibleShips=new Map(), effects=[];
 const stick={id:null,x:0,y:0};
 const mouse={seen:false,x:0,y:0};
 const groups=['all','kinetic','energy','rockets'];
 let lobby=null, room=null, world=null, profile=null, secret=null;
 let pointer=null, firePointer=null, touchHeading=null, pending=false, syncing=false, timer;
 let lastFrame=null, snapshotAt=0, lastEvent=0, noticeUntil=0, inputSeq=0, sentActions=[];
 let retryCount=0, dockKey='';

 function read(storage,key) {
  try {return globalThis[storage].getItem(key);} catch {return null;}
 }
 function write(storage,key,value) {
  try {
   if(value===null)globalThis[storage].removeItem(key);
   else globalThis[storage].setItem(key,value);
  } catch {}
 }
 function setText(id,text) {
  if($(id).textContent!==text)$(id).textContent=text;
 }
 function message(id,text='') {
  $(id).hidden=!text;
  setText(id,text);
 }
 function notice(text,time=3200) {
  noticeUntil=performance.now()+time;
  message('coopNotice',text);
 }
 function setPending(value) {
  pending=value;
  $('coopCreate').disabled=value;
  $('coopJoin').disabled=value;
  $('coopRestore').disabled=value;
 }
 async function request(path,body,key=secret) {
  const options={credentials:'same-origin',signal:AbortSignal.timeout(7500),headers:{}};
  if(key)options.headers.Authorization='Bearer '+key;
  if(body!==undefined)Object.assign(options,{
   method:'POST',body:JSON.stringify(body),headers:{...options.headers,'Content-Type':'application/json'}
  });
  let response;
  try {response=await fetch(apiRoot+path,options);}
  catch {throw new Error('Связь с сервером потеряна.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data){
   const error=new Error(data?.error||'Сервер полётов не ответил.');
   error.status=response.status;
   throw error;
  }
  return data;
 }
 const roomPath=(code,action)=>'/rooms/'+code+'/'+action;
 function saveProfile(data,key) {
  profile=data;
  secret=key;
  write('sessionStorage',pilotKey,key);
  if(key)write('localStorage',pilotKey,key);
  $('coopIdentity').hidden=Boolean(profile);
  $('coopActiveProfile').hidden=!profile;
  setText('coopPilotName',profile?profile.name+' · '+(STARTER_SHIPS[profile.ship.layout]?.name||'Корабль'):'');
 }
 async function probe(entry) {
  setText('coopServer','Проверяю соединение…');
  try {
   await request('/health',undefined,null);
   if(lobby===entry)setText('coopServer','Сервер онлайн');
  } catch {
   if(lobby===entry)setText('coopServer','Сервер недоступен');
  }
 }
 function openLobby(invite='',resume=false) {
  if(lobby)return;
  lobby={previous:modal,hidden:$('flightHud').hidden,opener:document.activeElement};
  save(false);
  $('coopCode').value=invite;
  message('coopLobbyNote');
  openModal('coopModal');
  if(!profile)$('coopName').focus({preventScroll:true});
  probe(lobby);
  const stored=read('sessionStorage',pilotKey) ?? read('localStorage',pilotKey);
  if(stored&&secretPattern.test(stored)) loadProfile(stored,resume,invite);
 }
 function closeLobby() {
  if(!lobby||room)return;
  const {previous,hidden,opener}=lobby;
  lobby=null;
  $('flightHud').hidden=hidden;
  if(previous){openModal(previous);opener?.focus({preventScroll:true});}
  else closeModal();
  const url=new URL(location.href);
  if(url.searchParams.has('room')){
   url.searchParams.delete('room');
   history.replaceState(null,'',url);
  }
 }
 async function loadProfile(key,resume=false,invite='') {
  const entry=lobby;
  setPending(true);
  try {
   const data=await request('/profile',undefined,key);
   if(lobby!==entry)return;
   saveProfile(data,key);
   if(resume&&data.room&&data.lease&&(!invite||data.room===invite)){
    $('coopCode').value=data.room;
    try {
     const result=await request(roomPath(data.room,'sync'),{lease:data.lease});
     if(lobby===entry)showFlight(result);
    } catch(error) {
     if(lobby===entry)message('coopLobbyNote',error.message);
     write('sessionStorage',roomKey,null);
    }
   }
  } catch(error) {
   if(lobby===entry)message('coopLobbyNote',error.message);
   if(error.status===401){write('sessionStorage',pilotKey,null);if(read('localStorage',pilotKey)===key)write('localStorage',pilotKey,null);}
  } finally {setPending(false);}
 }
 async function start(join) {
  if(!lobby||pending)return;
  const name=$('coopName').value.trim().normalize('NFC');
  const code=$('coopCode').value.trim().toUpperCase();
  if(join&&!codePattern.test(code)){
   message('coopLobbyNote','Введите шестизначный код комнаты.');
   $('coopCode').focus();return;
  }
  if(!profile&&!validName.test(name)){
   message('coopLobbyNote','Введите позывной от 1 до 20 символов.');
   $('coopName').focus();return;
  }
  const entry=lobby;
  setPending(true);
  message('coopLobbyNote',join?'Подключаюсь к комнате…':'Создаю комнату…');
  try {
   if(!profile){
    const data=await request('/profile',{name,layout:$('coopChassis').value||'wanderer'},null);
    if(lobby!==entry)return;
    saveProfile(data,data.secret);
   }
   const result=await request(join?roomPath(code,'join'):'/rooms',{});
   if(lobby===entry)showFlight(result);
  } catch(error) {
   if(lobby===entry)message('coopLobbyNote',error.message);
  } finally {setPending(false);}
 }
 function showFlight(data) {
  room={code:data.code,lease:data.lease};
  write('sessionStorage',roomKey,data.code);
  inputSeq=data.inputSeq;retryCount=0;sentActions=[];world=null;
  effects.length=0;visibleShips.clear();lastFrame=null;clearInput();
  lastEvent=data.events.at(-1)?.id||0;
  camera.x=data.ship.x;camera.y=data.ship.y;roomCameraScale=cameraScale;
  $('coopModal').classList.add('hidden');
  $('flightHud').hidden=true;
  $('coopHud').hidden=false;
  $('coopServices').hidden=true;
  $('coopCode').value=data.code;
  setText('coopRoomCode',data.code);
  setText('coopConnection','В сети');
  absorb(data);
  notice('Корабль и добыча сохраняются в профиле.',4000);
  $('coopInvite').focus({preventScroll:true});
  later(120);
 }
 function showLobby(text) {
  const code=room?.code;
  clearTimeout(timer);
  room=world=null;sentActions=[];clearInput();
  write('sessionStorage',roomKey,null);
  $('coopHud').hidden=true;
  $('coopModal').classList.remove('hidden');
  if(code)$('coopCode').value=code;
  if(profile)saveProfile(profile,secret);
  message('coopLobbyNote',text);
  $('coopJoin').focus({preventScroll:true});
 }
 async function leave() {
  if(!room||pending)return;
  const active=room;
  setPending(true);
  $('coopLeave').disabled=true;
  try {
   await request(roomPath(active.code,'leave'),{lease:active.lease});
   if(room===active)showLobby('Вылет завершён. Корабль сохранён.');
  } catch(error) {
   if(room===active&&[401,404,409].includes(error.status))showLobby(error.message);
   else notice(error.message,5000);
  } finally {setPending(false);$('coopLeave').disabled=false;}
 }
 async function copyValue(value,label) {
  try {await navigator.clipboard.writeText(value);return label;}
  catch {return 'Браузер не разрешил копирование.';}
 }
 async function invite() {
  if(!room)return;
  const url=new URL(location.pathname,location.href);
  url.searchParams.set('room',room.code);
  notice(await copyValue(url.href,'Ссылка на комнату скопирована.'));
 }
 function clearInput() {
  controls.clear();pointer=null;firePointer=null;touchHeading=null;mouse.seen=false;
  stick.id=null;stick.x=stick.y=0;
  $('coopStickKnob').style.transform='translate(0,0)';
 }
 function later(delay) {clearTimeout(timer);timer=setTimeout(sync,delay);}
 function selectedCourse() {return world?.target||world?.course;}
 function command(type,parameters={}) {
  if(!room)return;
  if(sentActions.length>=16){notice('Сервер обрабатывает предыдущую команду.');return;}
  sentActions.push({id:crypto.randomUUID(),type,...parameters});
  later(0);
 }
 function intent() {
  const x=Number(controls.has('KeyD')||controls.has('ArrowRight'))-Number(controls.has('KeyA')||controls.has('ArrowLeft'))+stick.x;
  const y=Number(controls.has('KeyS')||controls.has('ArrowDown'))-Number(controls.has('KeyW')||controls.has('ArrowUp'))+stick.y;
  const norm=Math.max(1,Math.hypot(x,y));
  const me=visibleShips.get(world?.you)||world?.ship;
  let heading=touchHeading;
  if(mouse.seen&&me){
   const aim=worldPoint(mouse);
   if(distance(me,aim)*scale()>12)heading=Math.atan2(aim.y-me.y,aim.x-me.x)+Math.PI/2;
  }
  const fire=firePointer!==null||controls.has('Space')||Boolean(pointer&&!pointer.touch&&(!pointer.rock&&!pointer.aim||pointer.aim&&performance.now()-pointer.at>180));
  return {x:x/norm,y:y/norm,heading,fire};
 }
 async function sync() {
  if(!room||syncing)return;
  const active=room;
  syncing=true;
  const started=performance.now();
  try {
   const data=await request(roomPath(active.code,'sync'),{lease:active.lease,seq:++inputSeq,...intent(),actions:sentActions.slice(0,8)});
   if(room!==active)return;
   retryCount=0;
   setText('coopConnection','В сети');
   absorb(data);
  } catch(error) {
   if(room!==active)return;
   if([401,404,409].includes(error.status)){showLobby(error.message);return;}
   setText('coopConnection','Переподключение');
   retryCount=Math.min(4,retryCount+1);
  } finally {
   syncing=false;
   if(room){
    const input=intent(), busy=input.x||input.y||input.fire||selectedCourse()||sentActions.length||world?.shots.length;
    const delay=retryCount?Math.min(2400,retryCount*450):busy?230:500;
    later(Math.max(50,delay-(performance.now()-started)));
   }
  }
 }
 function absorb(data) {
  const prior=world;
  world=data;snapshotAt=performance.now();
  if(profile)profile.ship=data.ship;
  setText('coopCount',data.players.filter(player=>player.online).length+' / 5');
  const roster=players=>JSON.stringify(players.map(player=>[player.id,player.online,player.dead,player.mined]));
  if(!prior||roster(prior.players)!==roster(data.players)){
   $('coopPlayers').replaceChildren(...data.players.map(player=>{
    const row=document.createElement('li'), name=document.createElement('span'), status=document.createElement('span');
    name.textContent=player.name+(player.id===data.you?' (вы)':'');
    status.textContent=player.dead?'верфь':player.online?'в сети':'офлайн';
    row.appendChild(name);row.appendChild(status);return row;
   }));
  }
  for(const event of data.events){
   if(event.id<=lastEvent)continue;
   lastEvent=event.id;effects.push({...event,born:snapshotAt});
  }
  const replies=new Map(data.actions.map(action=>[action.id,action]));
  for(const action of sentActions){
   const reply=replies.get(action.id);
   if(reply){
    notice(reply.message,reply.ok?2700:4400);
    if(!$('coopServices').hidden){
     message('coopServiceFeedback',reply.message);
    }
   }
  }
  sentActions=sentActions.filter(action=>!replies.has(action.id));
  if(data.feedback&&data.feedback!==prior?.feedback)notice(data.feedback);
  if(prior&&prior.total<data.goal&&data.total>=data.goal)notice('Склад достиг цели экипажа.',6500);
  updateHud();
 }
 function cargoText(items,contents) {
  const list=items.filter(item=>contents[item]>0).map(item=>GOODS[item].name+' '+contents[item]);
  return list.join(' · ')||'Пусто';
 }
 function updateHud() {
  const {ship}=world,{systems}=ship;
  const hp=ship.modules.reduce((sum,module)=>sum+Math.max(0,module.hp),0);
  const max=ship.modules.reduce((sum,module)=>sum+moduleMaxHp(module),0);
  setText('coopHp',(max?Math.round(100*hp/max):0)+'%');
  setText('coopStatus','Энергия '+Math.round(ship.energy)+'% · Нагрев '+Math.round(ship.heat)+'%'
   +(systems.shield?' · Щит '+Math.round(systems.shield):''));
  setText('coopAmmo','Снаряды '+systems.shells+' · Ракеты '+systems.rockets);
  setText('coopHold',world.hold+' / '+world.maxHold);
  $('coopGoal').max=world.maxHold;$('coopGoal').value=world.hold;
  setText('coopCargoContents',cargoText(world.cargoItems,ship.cargo));
  setText('coopTotal',world.total+' / '+world.goal);
  setText('coopMine',world.target?'Стоп добычи':'Добыча');
  setText('coopDock',world.docked?'Верфь':'К порту');
  $('coopDash').disabled=world.dashCooldown>0||ship.energy<25;
  $('coopDestroyed').hidden=!ship.dead;
  if(ship.dead)$('coopServices').hidden=true;
  if(!$('coopServices').hidden)updateServices();
 }
 function options(id,values) {
  const current=$(id).value;
  $(id).replaceChildren(...values.map(([value,text])=>{
   const option=document.createElement('option');option.value=value;option.textContent=text;return option;
  }));
  if(values.some(([value])=>value===current))$(id).value=current;
 }
 function updateServices() {
  const {ship,docked}=world,{systems}=ship;
  $('coopDockRequired').hidden=docked;
  $('coopDockServices').hidden=!docked;
  setText('coopAssist','Стабилизация · '+(systems.assist?'вкл.':'выкл.'));
  setText('coopAutoAim','Автоприцел · '+(systems.autoAim?'вкл.':'выкл.'));
  setText('coopBoost','Добыча · '+(systems.boost?'форсаж':'баланс'));
  $('coopPower').value=systems.power;$('coopGroup').value=systems.weaponGroup;
  if(!docked)return;
  setText('coopStockContents',cargoText(world.cargoItems,world.cargo));
  setText('coopBalance',ship.credit+' кр. · '+ship.data+' данных · '+ship.cargo.crystal+' кристаллов');
  setText('coopModulesReadout',ship.modules.map(module=>moduleName(module)+' ('+module.x+', '+module.y+') · '+Math.ceil(module.hp)+' HP').join(' · '));
  const changeKey=world.cargoItems.join(',')+'/'+systems.tech.join(',');
  if(dockKey===changeKey)return;
  dockKey=changeKey;
  options('coopDepositItem',world.cargoItems.map(key=>[key,GOODS[key].name]));
  options('coopModule',Object.entries(types).filter(([,type])=>!type.npcOnly&&(!type.tech||systems.tech.includes(type.tech)))
   .map(([key,type])=>[key,type.name+' · '+type.cost+' сплава']));
  const next=TECHS.filter(tech=>!systems.tech.includes(tech.id)&&tech.requires.every(id=>systems.tech.includes(id)));
  options('coopTech',next.map(tech=>[tech.id,tech.name+' · '+tech.data+' данных']));
  $('coopResearch').disabled=next.length===0;
 }
 function service() {
  if(!world||world.ship.dead)return;
  clearInput();later(0);
  $('coopServices').hidden=false;
  message('coopServiceFeedback');
  updateServices();
  $('coopCloseServices').focus({preventScroll:true});
 }
 function closeService(){ $('coopServices').hidden=true;$('coopSystems').focus({preventScroll:true});}
 function dock(){ if(world.docked)service();else command('dock'); }
 const scale=()=>clamp(W/650,.62,1)*roomCameraScale;
 const worldPoint=({x,y})=>({x:camera.x+(x-W/2)/scale(),y:camera.y+(y-H/2)/scale()});
 function nearestRock(point,range) {
  let result=null, best=Infinity;
  for(const rock of world.rocks){
   const gap=distance(rock,point);
   if(rock.ore>0&&gap<range(rock)&&gap<best){result=rock;best=gap;}
  }
  return result;
 }
 function toggleMine() {
  if(world.target){command('mine',{item:null});return;}
  const rock=nearestRock(world.ship,()=>Infinity);
  if(rock)command('mine',{item:rock.id});
  else notice('Все залежи исчерпаны.');
 }
 function pickTarget(point) {
  for(const enemy of world.enemies){
   if(enemy.dead||distance(point,enemy)>170)continue;
   const module=enemy.modules.find(module=>distance(point,position(enemy,module))<13);
   if(module)return {item:enemy.id,x:module.x,y:module.y};
  }
  return null;
 }
 function pointerDown(event) {
  if(event.button!==0||!world||world.ship.dead||!$('coopServices').hidden||pointer)return;
  event.preventDefault();
  const pixel={x:event.clientX,y:event.clientY}, point=worldPoint(pixel);
  const touch=event.pointerType==='touch'||event.pointerType==='pen';
  const rock=nearestRock(point,rock=>rock.r+12);
  const aim=pickTarget(point);
  pointer={id:event.pointerId,...pixel,touch,rock,aim,at:performance.now(),swiped:false};
  if(event.pointerId!=null)c.setPointerCapture(event.pointerId);
  if(!touch){Object.assign(mouse,pixel,{seen:true});if(aim)command('aim',aim);}
  later(0);
 }
 function pointerMove(event) {
  if(!world||!$('coopServices').hidden)return;
  if(event.pointerType==='mouse'||event.pointerType===undefined){
   Object.assign(mouse,{seen:true,x:event.clientX,y:event.clientY});touchHeading=null;
   return;
  }
  if(pointer?.id!==event.pointerId||pointer.x<W/2)return;
  const x=event.clientX-pointer.x,y=event.clientY-pointer.y;
  if(Math.hypot(x,y)<12)return;
  pointer.swiped=true;mouse.seen=false;
  touchHeading=Math.atan2(y,x)+Math.PI/2;
  if(world.target)command('mine',{item:null});
 }
 function pointerUp(event,cancelled=false) {
  if(!pointer||pointer.id!==event.pointerId)return;
  const held=pointer;pointer=null;later(0);
  if(cancelled||held.swiped||Math.hypot(event.clientX-held.x,event.clientY-held.y)>=12)return;
  if(held.aim&&held.touch)command('aim',held.aim);
  else if(held.rock)command('mine',{item:world.target===held.rock.id?null:held.rock.id});
  else if(held.touch)command('course',worldPoint(held));
 }
 function keyDown(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return;
  if(!$('coopServices').hidden){if(event.code==='Escape')closeService();return;}
  if(world.ship.dead)return;
  if(moveKeys.has(event.code)||event.code==='Space'){
   if(event.code==='Space'&&document.activeElement?.tagName==='BUTTON')return;
   event.preventDefault();
   if(!controls.has(event.code)){controls.add(event.code);later(0);}return;
  }
  if(event.repeat)return;
  const key=event.code;
  if(key==='KeyE'||key==='NumpadAdd')toggleMine();
  else if(key==='KeyF')dock();
  else if(key==='KeyC')service();
  else if(key==='ShiftLeft'||key==='ShiftRight')command('dash');
  else if(key==='KeyV')command('cruise',{value:!world.cruise});
  else if(/^Digit[1-4]$/.test(key))command('settings',{item:'weaponGroup',value:groups[Number(key.slice(-1))-1]});
 }
 function keyUp(event){if(controls.delete(event.code))later(0);}
 function bindTouch(){
  const joystick=$('coopStick');
  function steer(event){
   const box=joystick.getBoundingClientRect(),radius=box.width*.32;
   const dx=event.clientX-box.left-box.width/2,dy=event.clientY-box.top-box.height/2;
   const ratio=Math.max(radius,Math.hypot(dx,dy));
   stick.x=dx/ratio;stick.y=dy/ratio;
   $('coopStickKnob').style.transform='translate('+stick.x*radius+'px,'+stick.y*radius+'px)';
  }
  joystick.onpointerdown=event=>{
   if(!room||stick.id!==null)return;
   event.preventDefault();stick.id=event.pointerId;joystick.setPointerCapture(event.pointerId);
   steer(event);later(0);
  };
  joystick.onpointermove=event=>{if(event.pointerId===stick.id)steer(event);};
  joystick.onpointerup=joystick.onpointercancel=joystick.onlostpointercapture=event=>{
   if(event.pointerId!==stick.id)return;
   stick.id=null;stick.x=stick.y=0;$('coopStickKnob').style.transform='translate(0,0)';later(0);
  };
  const fire=$('coopFire');
  fire.onpointerdown=event=>{
   if(!room||firePointer!==null)return;
   event.preventDefault();firePointer=event.pointerId;fire.setPointerCapture(event.pointerId);later(0);
  };
  fire.onpointerup=fire.onpointercancel=fire.onlostpointercapture=event=>{
   if(event.pointerId===firePointer){firePointer=null;later(0);}
  };
 }
 function initialize(){
  $('launchCoop').onclick=$('openCoop').onclick=()=>openLobby();
  $('closeCoop').onclick=closeLobby;
  $('coopCreate').onclick=()=>start(false);
  $('coopForm').onsubmit=event=>{event.preventDefault();start(true);};
  $('coopCode').oninput=event=>{event.target.value=event.target.value.toUpperCase();};
  $('coopRestore').onclick=()=>{
   const key=$('coopRecoveryKey').value.trim().toLowerCase();
   if(lobby&&!pending&&secretPattern.test(key)){
    $('coopRecoveryKey').value='';
    loadProfile(key);
   }else message('coopLobbyNote','Введите ключ восстановления из 64 символов.');
  };
  $('coopCopyKey').onclick=async ()=>{
   if(secret)message('coopLobbyNote',await copyValue(secret,'Ключ пилота скопирован. Храните его в личном месте.'));
  };
  $('coopChangeProfile').onclick=()=>{
   if(!pending){saveProfile(null,null);write('sessionStorage',pilotKey,'');$('coopName').value='';$('coopName').focus();}
  };
  $('coopInvite').onclick=invite;
  $('coopLeave').onclick=leave;
  $('coopMine').onclick=toggleMine;
  $('coopDash').onclick=()=>command('dash');
  $('coopDock').onclick=dock;
  $('coopSystems').onclick=service;
  $('coopCloseServices').onclick=closeService;
  for(const [id,item] of [['coopAssist','assist'],['coopAutoAim','autoAim'],['coopBoost','boost']]){
   $(id).onclick=()=>command('settings',{item,value:!world.ship.systems[item]});
  }
  $('coopPower').onchange=event=>command('settings',{item:'power',value:event.target.value});
  $('coopGroup').onchange=event=>command('settings',{item:'weaponGroup',value:event.target.value});
  $('coopDeposit').onclick=()=>command('deposit',{item:$('coopDepositItem').value,amount:Number($('coopDepositAmount').value)});
  $('coopRepair').onclick=()=>command('repair');
  $('coopRearm').onclick=()=>command('rearm',{item:'shells'});
  $('coopRockets').onclick=()=>command('rearm',{item:'rockets'});
  const cell=()=>({x:Number($('coopModuleX').value),y:Number($('coopModuleY').value)});
  $('coopBuild').onclick=()=>command('build',{...cell(),item:$('coopModule').value});
  $('coopUpgrade').onclick=()=>command('upgrade',cell());
  $('coopResearch').onclick=()=>command('research',{item:$('coopTech').value});
  for(const [id,item] of [['coopReplaceWanderer','wanderer'],['coopReplaceCourier','courier'],['coopReplaceHauler','hauler']]){
   $(id).onclick=()=>command('replace',{item});
  }
  bindTouch();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&room){clearInput();later(0);}});
  const inviteCode=new URL(location.href).searchParams.get('room')?.toUpperCase();
  const saved=read('sessionStorage',roomKey);
  if(codePattern.test(inviteCode||''))openLobby(inviteCode,saved===inviteCode);
  else if(codePattern.test(saved||''))openLobby(saved,true);
 }
 function draw(now) {
  const elapsed=lastFrame===null?0:Math.min(80,now-lastFrame);
  const blend=lastFrame===null?1:1-Math.exp(-elapsed*.016);
  roomCameraScale=smoothCameraZoom(roomCameraScale,cameraScale,elapsed/1000);
  lastFrame=now;
  const lag=clamp((now-snapshotAt)/1000,0,.27), size=scale();
  for(const pilot of world.players){
   const ship=visibleShips.get(pilot.id)||{x:pilot.x,y:pilot.y,angle:pilot.angle};
   ship.x+=(pilot.x+pilot.vx*lag-ship.x)*blend;
   ship.y+=(pilot.y+pilot.vy*lag-ship.y)*blend;
   ship.angle+=angleDifference(pilot.angle+pilot.angularVelocity*lag,ship.angle)*blend;
   visibleShips.set(pilot.id,ship);
   if(pilot.id===world.you){camera.x+=(ship.x-camera.x)*blend;camera.y+=(ship.y-camera.y)*blend;}
  }
  for(const id of visibleShips.keys())if(!world.players.some(pilot=>pilot.id===id))visibleShips.delete(id);
  shadeSpace(camera,camera);
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(size,size);ctx.translate(-camera.x,-camera.y);
  const visible=point=>Math.abs(point.x-camera.x)<W/size/2+150&&Math.abs(point.y-camera.y)<H/size/2+150;
  for(const dock of world.places.filter(visible)){
   ctx.save();ctx.translate(dock.x,dock.y);
   drawPortArtwork(dock);
   ctx.strokeStyle='#777';ctx.setLineDash([3,7]);ctx.beginPath();ctx.arc(0,0,235,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#ddd';ctx.font='12px monospace';ctx.fillText(dock.name,-28,103);
   ctx.restore();
  }
  for(const rock of world.rocks){
   if(rock.ore<=0||!visible(rock))continue;
   drawAsteroidArtwork(rock);
   if(rock.id===world.target){
    ctx.strokeStyle='#eee';ctx.setLineDash([3,5]);ctx.strokeRect(rock.x-rock.r-7,rock.y-rock.r-7,2*rock.r+14,2*rock.r+14);ctx.setLineDash([]);
    ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(mineralLabel(rock)+' · '+rock.ore,rock.x,rock.y+rock.r+23);
   }
  }
  for(const enemy of world.enemies){
   if(!enemy.dead&&visible(enemy))drawShip(enemy);
  }
  if(world.aim){
   const marked=world.enemies.find(enemy=>enemy.id===world.aim.id&&!enemy.dead);
   if(marked){
    const point=position(marked,world.aim);
    ctx.strokeStyle='#fff';ctx.setLineDash([3,5]);ctx.strokeRect(point.x-14,point.y-14,28,28);ctx.setLineDash([]);
   }
  }
  for(const pilot of world.players){
   const pose=visibleShips.get(pilot.id), own=pilot.id===world.you;
   if(pilot.dead||!visible(pose))continue;
   ctx.save();ctx.globalAlpha=pilot.online?1:.42;
   drawShip({...pilot,...pose,archetype:'drone'});
   if(pilot.shield>0){
    ctx.strokeStyle='#bbb';ctx.setLineDash([3,7]);ctx.beginPath();ctx.arc(pose.x,pose.y,47,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
   }
   ctx.fillStyle=own?'#fff':'#bbb';ctx.font='12px monospace';ctx.textAlign='center';
   ctx.fillText(pilot.name+(own?' · вы':''),pose.x,pose.y+61,150);ctx.restore();
  }
  if(world.course){
   ctx.strokeStyle='#aaa';ctx.setLineDash([3,7]);ctx.beginPath();
   ctx.moveTo(camera.x,camera.y);ctx.lineTo(world.course.x,world.course.y);ctx.stroke();ctx.setLineDash([]);
  }
  for(const part of world.fragments.filter(visible)){
   drawMineralShard(part.item,part,part.amount>=3?5:3,reduceMotion?0:now/650+part.id);
  }
  for(const shot of world.shots.filter(visible)){
   const x=shot.x+shot.vx*lag,y=shot.y+shot.vy*lag;
   ctx.strokeStyle=shot.enemy?'#aaa':'#fff';ctx.lineWidth=shot.rail?2:1;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-shot.vx*.025,y-shot.vy*.025);ctx.stroke();
  }
  while(effects.length&&now-effects[0].born>900)effects.shift();
  for(const event of effects){
   const age=Math.max(0,now-event.born)/1000;
   if(event.type==='mine'||event.type==='fracture'){
    const time=event.type==='fracture'?.9:.43;
    if(age<time)drawRockImpact({x:event.x,y:event.y,broken:event.type==='fracture',t:time-age,duration:time,radius:30,item:event.item,seed:event.id*.53});
   } else if(event.type==='pickup'){
    ctx.save();ctx.globalAlpha=1-age;ctx.font='bold 12px monospace';ctx.fillStyle='#fff';ctx.textAlign='center';
    ctx.fillText('+'+event.amount+' '+GOODS[event.item].name,event.x,event.y-22-age*22);ctx.restore();
   } else if(age<.48||event.type==='destroy') {
    ctx.save();ctx.globalAlpha=1-age;ctx.strokeStyle='#fff';ctx.beginPath();
    ctx.arc(event.x,event.y,4+age*(event.type==='destroy'?82:45),0,Math.PI*2);ctx.stroke();ctx.restore();
   }
  }
  ctx.restore();
  if(noticeUntil&&now>noticeUntil){noticeUntil=0;message('coopNotice');}
 }
 return {initialize,closeLobby,active:()=>Boolean(world),clearInput,keyDown,keyUp,pointerDown,pointerMove,pointerUp,draw};
})();
