const MAX_ROOM_MS = 2 * 60 * 60 * 1000;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const SECRET_PATTERN = /^[a-f0-9]{64}$/;
const ACTION_PATTERN = /^[a-zA-Z0-9-]{8,50}$/;
const ROOM_ROUTES = /^\/api\/v2\/rooms\/([A-HJ-NP-Z2-9]{6})\/(join|sync|leave)$/;
const POWERS = ['balanced','engines','weapons','shields'];

class FlightError extends Error {
 constructor(status,message) {super(message);this.status=status;}
}
function reject(status,message) {throw new FlightError(status,message);}
function payload(value, status=200) {
 return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
const randomBytes = count => crypto.getRandomValues(new Uint8Array(count));
const hex = array => Array.from(array,byte=>byte.toString(16).padStart(2,'0')).join('');
async function fingerprint(value) {
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return hex(new Uint8Array(hash));
}
async function readInput(request) {
 if (request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') reject(415,'Ожидается JSON.');
 if (!request.body) reject(400,'Пустой запрос.');
 const reader=request.body.getReader(), decoder=new TextDecoder();
 let bytes=0, raw='';
 while (true) {
  const {value,done}=await reader.read();
  if (done) break;
  bytes+=value.byteLength;
  if (bytes>8192) {await reader.cancel();reject(413,'Запрос слишком большой.');}
  raw+=decoder.decode(value,{stream:true});
 }
 try {
  const data=JSON.parse(raw+decoder.decode());
  if (!data||Array.isArray(data)||typeof data!=='object') throw new Error();
  return data;
 } catch {reject(400,'Некорректный запрос.');}
}
const query = (db,sql,...args) => db.prepare(sql).bind(...args);
const profileRow = (db,id) => query(db,'SELECT * FROM pilot_profiles WHERE id=?',id).first();
function profileView(profile) {
 return {id:profile.id,name:profile.name,ship:JSON.parse(profile.ship),room:profile.room_code,lease:profile.lease};
}
async function createProfile(db,input) {
 const name=typeof input.name==='string'?input.name.normalize('NFC').trim().replace(/\s+/g,' '):'';
 if (!/^[\p{L}\p{N} _.-]{1,20}$/u.test(name)) reject(400,'Позывной должен содержать от 1 до 20 букв, цифр, пробелов или знаков «_ . -».');
 const layout=Object.hasOwn(CATALOG.starters,input.layout)?input.layout:'wanderer';
 const secret=hex(randomBytes(32)), id=hex(randomBytes(12)), recoveryHash=await fingerprint(secret);
 const ship=makeShip(layout);
 await query(db,'INSERT INTO pilot_profiles (id,recovery_hash,name,ship) VALUES(?,?,?,?)',id,recoveryHash,name,JSON.stringify(ship)).run();
 return payload({id,name,ship,room:null,lease:null,secret},201);
}
async function authorize(db,request) {
 const header=request.headers.get('authorization')||'';
 const secret=header.startsWith('Bearer ')?header.slice(7):'';
 if (!SECRET_PATTERN.test(secret)) reject(401,'Откройте профиль пилота.');
 const profile=await query(db,'SELECT * FROM pilot_profiles WHERE recovery_hash=?',await fingerprint(secret)).first();
 if (!profile) reject(401,'Ключ восстановления не найден.');
 return profile;
}
async function loadRoom(db,code,now) {
 const row=await query(db,'SELECT revision,state FROM flight_rooms WHERE code=? AND expires_at>?',code,now).first();
 if (!row) reject(404,'Комната не найдена или уже закрылась.');
 return {revision:row.revision,state:JSON.parse(row.state)};
}
async function activeLeases(db,code) {
 const result=await query(db,'SELECT id, lease FROM pilot_profiles WHERE room_code=?',code).all();
 return new Map(result.results.map(player=>[player.id,player.lease]));
}
function keepPilots(world, leases, now) {
 world.players=world.players.filter(player=>leases.get(player.id)===player.lease&&now-player.seen<=PLAYER_IDLE_MS);
}
function encode(world) {
 return JSON.stringify(world);
}
function actorView(pilot, now) {
 const {id,name,slot,ship,seen}=pilot;
 return {id,name,slot,online:now-seen<=10_000,x:ship.x,y:ship.y,vx:ship.vx,vy:ship.vy,angle:ship.angle,
  angularVelocity:ship.angularVelocity,modules:ship.modules,dead:ship.dead,shield:ship.systems.shield,mined:ship.mined};
}
function view(code,player,world,now) {
 const ship=player.ship;
 return {
  code,you:player.id,lease:player.lease,inputSeq:player.inputSeq,time:world.time,goal:ROOM_GOAL,total:stockSize(world.stock),cargo:world.stock,
  players:world.players.map(pilot=>actorView(pilot,now)),
  ship,hold:usedCargo(ship),maxHold:capacityOf(ship),docked:canDock(ship),target:player.target,
  course:player.course,aim:player.aim,dashCooldown:player.dashCooldown,cruise:player.cruise,
  cargoItems:CARGO_ITEMS,places:DOCKS,rocks:world.rocks,enemies:world.enemies,fragments:world.fragments,shots:world.shots,
  events:world.events,actions:player.handled.slice(-12),feedback:player.feedback,
 };
}
const newRoomCode = () => Array.from(randomBytes(6),byte=>ROOM_CHARS[byte&31]).join('');
async function enterRoom(db,id,code,creating) {
 for (let attempt=0;attempt<9;attempt++) {
  const now=Date.now(), isNew=creating, roomCode=isNew?newRoomCode():code;
  const profile=await profileRow(db,id);
  const picked=isNew?{state:makeRoom(now)}:await loadRoom(db,roomCode,now);
  const world=picked.state;
  if (!isNew) {
   keepPilots(world,await activeLeases(db,roomCode),now);
   stepRoom(world,now);
   world.players=world.players.filter(player=>player.id!==id);
  }
  if (world.players.length>=MAX_ROOM_PLAYERS) reject(409,'В комнате уже пять пилотов.');
  const lease=hex(randomBytes(16)), writeId=crypto.randomUUID();
  const player=makePilot(profile,world,now,lease);
  world.players.push(player);
  const saveRoom=isNew?query(db,
   'INSERT OR IGNORE INTO flight_rooms (code,write_id,expires_at,state) SELECT ?,?,?,? FROM pilot_profiles WHERE id=? AND revision=?',
   roomCode,writeId,now+MAX_ROOM_MS,encode(world),id,profile.revision):query(db,
   'UPDATE flight_rooms SET state=?,revision=revision+1,expires_at=?,write_id=? WHERE code=? AND revision=? AND EXISTS (SELECT 1 FROM pilot_profiles WHERE id=? AND revision=?)',
   encode(world),now+MAX_ROOM_MS,writeId,roomCode,picked.revision,id,profile.revision);
  const savePilot=query(db,'UPDATE pilot_profiles SET room_code=?,lease=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM flight_rooms WHERE code=? AND write_id=?)',
   roomCode,lease,id,profile.revision,roomCode,writeId);
  const [written,assigned]=await db.batch([saveRoom,savePilot]);
  if (written.meta.changes>0 && assigned.meta.changes>0) return payload(view(roomCode,player,world,now),isNew?201:200);
 }
 reject(503,'Комната обновляется. Попробуйте ещё раз.');
}
function takeInput(player,input,now) {
 if (!Number.isSafeInteger(input.seq)||input.seq<=player.inputSeq) return;
 const value=n=>typeof n==='number'&&Number.isFinite(n)?bound(n,-1,1):0;
 const rawX=value(input.x),rawY=value(input.y), norm=Math.max(1,Math.hypot(rawX,rawY));
 const heading=typeof input.heading==='number'&&Number.isFinite(input.heading)?Math.atan2(Math.sin(input.heading),Math.cos(input.heading)):null;
 player.input={x:rawX/norm,y:rawY/norm,heading,fire:input.fire===true};
 player.inputSeq=input.seq;
 player.seen=now;
}
function findCell(ship,action) {
 const {x,y}=action;
 if (!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>6||Math.abs(y)>5) reject(400,'Выберите клетку корпуса.');
 return ship.modules.find(module=>module.x===x&&module.y===y);
}
function moveToDock(player) {
 const ship=player.ship, dock=DOCKS.reduce((nearest,next)=>gap(ship,next)<gap(ship,nearest)?next:nearest);
 const distance=gap(ship,dock)||1;
 player.course={x:dock.x+(ship.x-dock.x)/distance*165,y:dock.y+(ship.y-dock.y)/distance*165};
 player.target=null;
 return 'Курс на '+dock.name+'.';
}
function useDock(world,player,action) {
 const ship=player.ship;
 if (!canDock(ship)) reject(409,'Подлетите к станции и снизьте скорость до 55 м/с.');
 if (action.type==='deposit') {
  const item=action.item, amount=action.amount;
  if (!CARGO_ITEMS.includes(item)||!Number.isSafeInteger(amount)||amount<1||amount>ship.cargo[item]) reject(400,'Выберите имеющийся ресурс и количество.');
  ship.cargo[item]-=amount;
  world.stock[item]+=amount;
  return resourceLabel(item)+' передан на склад · '+amount;
 }
 if (action.type==='repair') {
  const damage=ship.modules.reduce((total,module)=>total+maxModuleHp(module)-module.hp,0);
  const cost=Math.ceil(damage/7);
  if (!cost) return 'Установленные модули целы.';
  if (ship.cargo.ore<cost) reject(409,'Не хватает сплава для ремонта · '+cost);
  ship.cargo.ore-=cost;
  for (const module of ship.modules) module.hp=maxModuleHp(module);
  return 'Корпус отремонтирован · −'+cost+' сплава.';
 }
 if (action.type==='rearm') {
  if (!Object.hasOwn(RESUPPLY,action.item)) reject(400,'Выберите боеприпасы.');
  const ammo=RESUPPLY[action.item], item=CATALOG.ammo[action.item];
  const max=item.baseCap+ship.modules.filter(module=>module.type==='magazine').length*item.perMagazine;
  const amount=Math.min(ammo.amount,max-ship.systems[action.item]);
  if (amount<=0) return 'Боезапас полон.';
  const cost=Math.ceil(ammo.credits*amount/ammo.amount);
  if (ship.credit<cost) reject(409,'Не хватает кредитов.');
  ship.credit-=cost;
  ship.systems[action.item]+=amount;
  return item.name+' · +'+amount;
 }
 if (action.type==='research') {
  const tech=CATALOG.techs.find(tech=>tech.id===action.item);
  if (!tech||hasTechOn(ship,tech.id)||!tech.requires.every(id=>hasTechOn(ship,id))) reject(409,'Технология пока недоступна.');
  if (ship.data<tech.data||ship.cargo.crystal<tech.crystal||ship.credit<tech.credits) reject(409,'Нужны данные, кристаллы и кредиты.');
  ship.data-=tech.data;ship.cargo.crystal-=tech.crystal;ship.credit-=tech.credits;
  ship.systems.tech.push(tech.id);
  return 'Изучено · '+tech.name;
 }
 if (action.type==='build') {
  const module=findCell(ship,action);
  const type=Object.hasOwn(CATALOG.types,action.item)?CATALOG.types[action.item]:null;
  if (module||!type||type.npcOnly||(type.tech&&!hasTechOn(ship,type.tech))) reject(409,'Выберите доступный модуль и свободную клетку.');
  if (ship.modules.length>=36||!ship.modules.some(part=>Math.abs(part.x-action.x)+Math.abs(part.y-action.y)===1)) reject(409,'Модуль должен примыкать к корпусу. Лимит — 36 модулей.');
  if (ship.cargo.ore<type.cost) reject(409,'Не хватает сплава.');
  ship.cargo.ore-=type.cost;
  ship.modules.push({x:action.x,y:action.y,type:action.item,hp:type.hp});
  ship.lostModules=ship.lostModules.filter(part=>part.x!==action.x||part.y!==action.y);
  return 'Установлен · '+type.name;
 }
 if (action.type==='upgrade') {
  const module=findCell(ship,action);
  if (!module||module.mk===2||!hasTechOn(ship,'fieldService')) reject(409,'Для Mk II изучите «Полевой сервис» и выберите модуль.');
  const quote=FlightCore.upgradeQuote(CATALOG.types[module.type].cost);
  if (ship.cargo.ore<quote.alloy||ship.credit<quote.credits) reject(409,'Не хватает сплава или кредитов.');
  const oldHp=maxModuleHp(module);
  ship.cargo.ore-=quote.alloy;ship.credit-=quote.credits;
  module.mk=2;module.hp+=maxModuleHp(module)-oldHp;
  return 'Модуль улучшен до Mk II.';
 }
 reject(400,'Неизвестное действие.');
}
function perform(world,player,action) {
 const ship=player.ship;
 if (action.type==='replace') {
  if (!ship.dead||!Object.hasOwn(CATALOG.starters,action.item)) reject(409,'Выберите новый корпус после потери корабля.');
  const next=makeShip(action.item);
  next.actorId=player.id;next.cargo=ship.cargo;next.credit=ship.credit;next.data=ship.data;next.mined=ship.mined;
  Object.assign(next.systems,ship.systems,{shield:0,shieldDelay:0});
  player.ship=next;
  player.input=blankInput();player.course=player.target=player.aim=player.dash=null;player.dashCooldown=0;
  return 'Выдан бесплатный стартовый корпус.';
 }
 if (ship.dead) reject(409,'Сначала выберите новый корпус.');
 switch (action.type) {
  case 'mine': {
   if (action.item===null) {player.target=null;player.course=null;return 'Добыча остановлена.';}
   const rock=world.rocks.find(rock=>rock.id===action.item&&rock.ore>0);
   if (!rock) reject(409,'Залежь исчерпана.');
   player.target=rock.id;player.course=null;
   return 'Курс на залежь.';
  }
  case 'course':
   if (![action.x,action.y].every(Number.isFinite)) reject(400,'Выберите точку сектора.');
   player.target=null;
   player.course={x:bound(action.x,-WORLD_LIMIT,WORLD_LIMIT),y:bound(action.y,-WORLD_LIMIT,WORLD_LIMIT)};
   return 'Курс задан.';
  case 'aim': {
   const target=world.enemies.find(enemy=>enemy.id===action.item&&!enemy.dead);
   if (target&&target.modules.some(module=>module.x===action.x&&module.y===action.y)) player.aim={id:target.id,x:action.x,y:action.y};
   return 'Модуль выбран.';
  }
  case 'dock':
   return moveToDock(player);
  case 'dash': {
   if (player.dashCooldown>0||ship.energy<25||ship.overheated) reject(409,'Рывок ещё недоступен.');
   const input=player.input, length=Math.hypot(input.x,input.y);
   const angle=ship.angle+Math.atan2(length?input.y:-1,length?input.x:0);
   ship.energy-=25;ship.heat=Math.min(100,ship.heat+15);
   player.target=player.course=null;player.cruise=false;
   player.dash={x:Math.cos(angle),y:Math.sin(angle),left:.25};player.dashCooldown=4;
   return 'Рывок.';
  }
  case 'cruise':
   player.cruise=action.value===true;
   return player.cruise?'Импульсный ход готов.':'Импульсный ход отключён.';
  case 'settings':
   if (['assist','autoAim','boost'].includes(action.item)&&typeof action.value==='boolean') ship.systems[action.item]=action.value;
   else if (action.item==='power'&&POWERS.includes(action.value)) ship.systems.power=action.value;
   else if (action.item==='weaponGroup'&&['all','kinetic','energy','rockets'].includes(action.value)) ship.systems.weaponGroup=action.value;
   else reject(400,'Неизвестная настройка.');
   return 'Настройка сохранена.';
  default:
   return useDock(world,player,action);
 }
}
function applyActions(world,player,list) {
 if (!Array.isArray(list)) return;
 for (const action of list.slice(0,8)) {
  if (!action||typeof action.id!=='string'||!ACTION_PATTERN.test(action.id)||player.handled.some(item=>item.id===action.id)) continue;
  let message, ok=true;
  try {message=perform(world,player,action);}
  catch (error) {
   if (!(error instanceof FlightError)) throw error;
   ok=false;message=error.message;
  }
  player.handled.push({id:action.id,ok,message});
  if (player.handled.length>55) player.handled.shift();
 }
}
async function syncRoom(db,id,code,input,leaving) {
 if (!/^[0-9a-f]{32}$/.test(input.lease||'')) reject(401,'Сеанс комнаты истёк.');
 for (let attempt=0;attempt<9;attempt++) {
  const now=Date.now();
  const picked=await loadRoom(db,code,now), world=picked.state;
  const leases=await activeLeases(db,code);
  keepPilots(world,leases,now);
  const player=world.players.find(player=>player.id===id&&player.lease===input.lease);
  if (!player) reject(409,'Сеанс комнаты завершён. Войдите снова, корабль сохранён.');
  stepRoom(world,now);
  const batch=[];
  const writeId=crypto.randomUUID();
  if (leaving) world.players=world.players.filter(member=>member!==player);
  else {
   takeInput(player,input,now);
   applyActions(world,player,input.actions);
  }
  // The lease check and room revision are evaluated in the same write as the simulation.
  batch.push(query(db,'UPDATE flight_rooms SET state=?,revision=revision+1,expires_at=?,write_id=? WHERE code=? AND revision=? AND EXISTS (SELECT 1 FROM pilot_profiles WHERE id=? AND room_code=? AND lease=?)',
   encode(world),now+MAX_ROOM_MS,writeId,code,picked.revision,id,code,input.lease));
  if (leaving) batch.push(query(db,'UPDATE pilot_profiles SET ship=?,room_code=NULL,lease=NULL,revision=revision+1 WHERE id=? AND room_code=? AND lease=? AND EXISTS (SELECT 1 FROM flight_rooms WHERE code=? AND write_id=?)',
   JSON.stringify(player.ship),id,code,input.lease,code,writeId));
  const [written]=await db.batch(batch);
  // Profile updates from the trigger may also count as changed rows in D1.
  if (written.meta.changes>0) return payload(leaving?{left:true}:view(code,player,world,now));
 }
 reject(503,'Комната обновляется. Повторяем запрос.');
}
async function route(request,env,path) {
 if (!env.DB) reject(503,'Хранилище полётов недоступно.');
 const db=env.DB;
 if (path==='/api/v2/health'&&request.method==='GET') {
  await query(db,'SELECT revision FROM flight_rooms LIMIT 1').first();
  await query(db,'SELECT revision FROM pilot_profiles LIMIT 1').first();
  return payload({ready:true,capacity:MAX_ROOM_PLAYERS,protocol:2});
 }
 if (path==='/api/v2/profile'&&request.method==='GET') return payload(profileView(await authorize(db,request)));
 if (request.method!=='POST') reject(405,'Метод не поддерживается.');
 if (path==='/api/v2/profile') return createProfile(db,await readInput(request));
 const profile=await authorize(db,request);
 const input=await readInput(request);
 if (path==='/api/v2/rooms') {
  await query(db,'DELETE FROM flight_rooms WHERE code IN (SELECT code FROM flight_rooms WHERE expires_at<=? LIMIT 20)',Date.now()).run();
  return enterRoom(db,profile.id,null,true);
 }
 const match=ROOM_ROUTES.exec(path);
 if (!match||!ROOM_PATTERN.test(match[1])) reject(404,'Комната не найдена.');
 const [,code,action]=match;
 return action==='join'?enterRoom(db,profile.id,code,false):syncRoom(db,profile.id,code,input,action==='leave');
}
function serveAsset(request,path) {
 const asset=STATIC_ASSETS[path];
 if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
 const headers={'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
 const body=request.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.content),char=>char.charCodeAt(0)):asset.content;
 return new Response(body,{headers});
}
export default {
 async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/api/')) return serveAsset(request,path);
  try {return await route(request,env,path);}
  catch (error) {
   if (error instanceof FlightError) return payload({error:error.message},error.status);
   console.error('VOIDFORGE room:',error);
   return payload({error:'Сервер полётов временно недоступен.'},503);
  }
 },
};
