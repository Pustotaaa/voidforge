const {STEP, LIMIT: WORLD_LIMIT, MINE_RANGE: BEAM_RANGE, clamp: bound, distance: gap, position: cell} = FlightCore;
const DOCKS = CATALOG.places.filter(place => place.kind === 'station');
const OBSTACLES = DOCKS.map(place => ({...place, r: 65}));
const MAX_ROOM_PLAYERS = 5;
const PLAYER_IDLE_MS = 45_000;
const INPUT_IDLE_MS = 850;
const ROOM_GOAL = 90;
const CARGO_ITEMS = Object.keys(CATALOG.goods).filter(item => CATALOG.goods[item].space > 0);
const RESUPPLY = {shells: {amount: 30, credits: 45}, rockets: {amount: 3, credits: 25}};

const regionOf = actor => CATALOG.regions.find(region => gap(actor, region) < region.r) || {id: 'void'};
const inSafeZone = actor => DOCKS.some(dock => gap(actor, dock) < 280);
const canDock = actor => !actor.dead && Math.hypot(actor.vx, actor.vy) <= 55 && DOCKS.some(dock => gap(actor, dock) < 235);
const installed = (ship, type) => FlightCore.activeCount(ship, type);
const massOfCargo = ship => Object.entries(CATALOG.goods).reduce((total,[key,item]) => total + (ship.cargo[key] ?? ship.systems[key] ?? 0) * item.mass, 0);
const physics = ship => FlightCore.shipPhysics(ship, CATALOG.types, ship.cargo ? massOfCargo(ship) : 0, ship.cargo ? ship.systems.power : undefined);
const hasTechOn = (ship, key) => ship.systems.tech?.includes(key);
const capacityOf = ship => 500 + ship.modules.filter(module => module.type === 'cargo').length * 200;
const usedCargo = ship => CARGO_ITEMS.reduce((total,item) => total + ship.cargo[item] * CATALOG.goods[item].space, 0);
const stockSize = stock => Object.values(stock).reduce((total, value) => total + value, 0);
const availableCargo = (ship, key) => Math.max(0, Math.floor((capacityOf(ship) - usedCargo(ship)) / CATALOG.goods[key].space));
const maxModuleHp = module => FlightCore.moduleHp(module,CATALOG.types);
const frameAt = (x, y, angle = 0) => ({x, y, angle, vx: 0, vy: 0, angularVelocity: 0, impactCooldown: 0});
const blankInput = () => ({x: 0, y: 0, heading: null, fire: false});
const resourceLabel = item => CATALOG.goods[item].name;
const emptyCargo = () => Object.fromEntries(CARGO_ITEMS.map(item => [item, 0]));

function makeShip(layout = 'wanderer') {
 return {
  ...frameAt(0, 0), layout, modules: structuredClone(CATALOG.starters[layout]), lostModules: [],
  energy: 100, heat: 0, overheated: false, dead: false,
  cargo: {...emptyCargo(), ore: 180}, credit: 300, data: 0, mined: 0,
  systems: {shield:0, shieldDelay:0, power:'balanced', assist:true, autoAim:true, boost:false, weaponGroup:'all',
   tech:['survey'], shells:CATALOG.ammo.shells.start, rockets:CATALOG.ammo.rockets.start},
 };
}
function enemyShip(source) {
 return {...source, ...frameAt(source.x, source.y, source.angle), modules: structuredClone(source.modules),
  systems: {shield:Math.max(0,source.shield||0)}, energy:100, heat:0, overheated:false, cool:source.cool||1, dead:false};
}
function makeRoom(now) {
 return {
  time: 0, lastTick: now, tickDebt: 0, players: [], rocks: structuredClone(CATALOG.rocks),
  enemies: CATALOG.enemies.map(enemyShip), fragments: [], shots: [], stock: emptyCargo(),
  events: [], serial: 0,
 };
}
function makePilot(profile, world, now, lease) {
 const slots = new Set(world.players.map(player => player.slot));
 const slot = Array.from({length:MAX_ROOM_PLAYERS},(_,i)=>i).find(index=>!slots.has(index));
 const ship = JSON.parse(profile.ship);
 const dock=DOCKS[0], spawn=-1.05+slot*.52;
 Object.assign(ship,frameAt(dock.x+Math.cos(spawn)*175,dock.y+Math.sin(spawn)*175),{actorId:profile.id});
 return {
  id: profile.id, lease, name: profile.name, ship, slot, seen: now, input: blankInput(), inputSeq: 0,
  target: null, course: null, aim: null, mining: 0, dash: null, dashCooldown: 0, cruise: false, handled: [],
 };
}
function emit(room, type, properties) {
 const item = {id: ++room.serial, type, ...properties};
 room.events.push(item);
 if (room.events.length > 34) room.events.shift();
 return item.id;
}
function spawnFragments(room, rock, item, amount, ship = null) {
 const count = Math.min(amount, ship ? 3 : 4);
 const sourceAngle = ship ? Math.atan2(ship.y-rock.y,ship.x-rock.x) : rock.seed;
 let left = amount;
 for (let i=0; i<count; i++) {
  const portion = Math.ceil(left / (count-i));
  left -= portion;
  const angle = sourceAngle + (ship ? (i-(count-1)/2)*.16 : i/count*Math.PI*2);
  const speed = ship ? 155 + i*18 : 34 + i*9;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  room.fragments.push({
   id: ++room.serial, item, amount: portion, x: rock.x + cos*rock.r*.62, y: rock.y + sin*rock.r*.62,
   vx: cos*speed, vy: sin*speed, life: 55,
  });
 }
}
function damageInRoom(room, ship, module, damage, kind, owner) {
 if (ship.dead || !ship.modules.includes(module) || damage <= 0) return;
 if (ship.archetype === 'boss' && module.type !== 'pylon' && ship.modules.some(part => part.type === 'pylon')) {
  emit(room,'shield',cell(ship,module));
  return;
 }
 const profile = CATALOG.damage[kind];
 const protection = FlightCore.shieldHit(ship,ship.systems,damage,profile);
 damage = protection.damage * (module.type === 'armor' ? (profile?.armor ?? 1) : 1);
 if (protection.absorbed) emit(room,'shield',cell(ship,module));
 if (damage <= 0) return;
 if (kind === 'emp' && (CATALOG.weapons[module.type] || ['engine','ion','shield','reactor','cooler','pointDefense','tractor','drill'].includes(module.type))) {
  module.disabledFor = 3;
 }
 module.hp -= damage;
 emit(room,'hit',{...cell(ship,module),kind});
 if (module.hp > 0) return;
 const before = ship.modules;
 const died = module.x === 0 && module.y === 0;
 ship.modules = died ? [] : FlightCore.remainingConnected(before.filter(part=>part!==module));
 if (ship.cargo) {
  ship.lostModules.push(...before.filter(part => !ship.modules.includes(part)).map(({x,y,type})=>({x,y,type})));
 }
 if (died) {
  ship.dead = true;
  emit(room,'destroy',{x:ship.x,y:ship.y,kind});
  if (!ship.cargo) {
   const rock = {id:'wreck-'+ship.id,x:ship.x,y:ship.y,r:ship.archetype==='boss'?43:28,ore:ship.archetype==='boss'?100:ship.archetype==='scout'?26:65,seed:3,wreck:true,material:'salvage'};
   room.rocks.push(rock);
   const winner=room.players.find(player=>player.id===owner);
   if (winner) {
    winner.ship.credit += ship.archetype==='boss'?550:ship.archetype==='scout'?65:150;
    winner.ship.data += ship.archetype==='boss'?60:ship.archetype==='scout'?10:25;
   }
  }
  return;
 }
 if (module.type !== 'reactor' && module.type !== 'magazine') return;
 let blast = module.type === 'reactor' ? 23 : 29;
 if (module.type === 'magazine' && ship.cargo) {
  const shells = Math.min(24, ship.systems.shells), rockets = Math.min(4, ship.systems.rockets);
  if (!shells && !rockets) return;
  ship.systems.shells -= shells;
  ship.systems.rockets -= rockets;
  blast = 12 + shells*.5 + rockets*3;
 }
 for (const adjacent of ship.modules.slice()) {
  if (Math.abs(adjacent.x-module.x)+Math.abs(adjacent.y-module.y) === 1) damageInRoom(room,ship,adjacent,blast,'explosive',owner);
 }
}
function updateFragments(room, dt, pilots) {
 const hatch = pilots.map(player=>({player, ship:player.ship, point:cargoExit(player.ship)}));
 for (const part of room.fragments) {
  let best = null;
  for (const ship of hatch) {
   const free = availableCargo(ship.ship, part.item);
   if (!free) continue;
   const dist = gap(part,ship.point);
   const tractor = installed(ship.ship,'tractor') > 0 && dist < 390 && ship.ship.energy >= dt*3;
   if ((dist < 72 || tractor) && (!best || dist < best.dist)) best = {...ship,free,dist,tractor};
  }
  if (best?.dist < 10) {
   const amount = Math.min(best.free,part.amount);
   best.ship.cargo[part.item] += amount;
   best.ship.mined += amount;
   part.amount -= amount;
   emit(room,'pickup',{...best.point,item:part.item,amount,player:best.player.id});
  } else if (best && best.dist > .01) {
   const scale = Math.min(270,75+best.dist) / best.dist;
   const blend = Math.min(1,dt*(best.dist<72?11:7));
   part.vx += ((best.point.x-part.x)*scale-part.vx)*blend;
   part.vy += ((best.point.y-part.y)*scale-part.vy)*blend;
   if (best.dist >= 72 && best.tractor) best.ship.energy -= dt*3;
  }
  part.x = bound(part.x+part.vx*dt,-WORLD_LIMIT,WORLD_LIMIT);
  part.y = bound(part.y+part.vy*dt,-WORLD_LIMIT,WORLD_LIMIT);
  part.life -= dt;
 }
 room.fragments = room.fragments.filter(part=>part.amount>0&&part.life>0);
}
function cargoExit(ship) {
 const cargo = ship.modules.find(module=>module.type==='cargo'&&FlightCore.operational(module));
 return cell(ship,cargo?{x:cargo.x,y:cargo.y+.42}:{x:0,y:.48});
}
function extract(room, player, rock) {
 const ship=player.ship;
 if (player.mining>0 || room.fragments.length>=75) return;
 const layer=rock.wreck?'wreck':rock.work&&rock.work.surface<=0?'deep':'surface';
 const rigs=installed(ship,'drill'), profile=CATALOG.rocksByType[rock.material] ?? CATALOG.rocksByType.ore;
 if (layer==='deep' && !rigs) {player.target=null;player.feedback='Нужен бур для плотной жилы.';return;}
 const pulse=FlightCore.miningPulse(rock,profile,layer,{
  boost:ship.systems.boost,manual:false,rigs,geology:hasTechOn(ship,'geology'),story:true,space:availableCargo(ship,profile.item),
 });
 if (pulse.amount<=0 || ship.energy<pulse.energy || ship.overheated) return;
 const unstable=profile.unstable && ship.systems.boost && ship.heat+pulse.heat>=95;
 if (!unstable && ship.heat+pulse.heat>=100) return;
 ship.energy-=pulse.energy;
 ship.heat=Math.min(100,ship.heat+pulse.heat);
 const amount=unstable?rock.ore:pulse.amount;
 rock.initialReserve??=rock.reserve||rock.ore;
 rock.ore-=amount;
 if (layer==='surface'&&rock.work) rock.work.surface=Math.max(0,rock.work.surface-amount);
 spawnFragments(room,rock,profile.item,amount,unstable?null:ship);
 player.mining=pulse.cooldown;
 const spot=cell({x:rock.x,y:rock.y,angle:Math.atan2(ship.y-rock.y,ship.x-rock.x)}, {x:rock.r*.71/20,y:0});
 emit(room,rock.ore?'mine':'fracture',{...spot,rock:rock.id,item:profile.item,player:player.id});
 if (!rock.ore && rock.reserve) rock.renewAt=room.time+180;
 if (unstable && gap(ship,rock)<205) {
  const closest=ship.modules.slice().sort((a,b)=>gap(cell(ship,a),rock)-gap(cell(ship,b),rock))[0];
  if (closest) damageInRoom(room,ship,closest,24,'explosive');
 }
}
function movePilot(room, player, dt, obstacles) {
 const ship=player.ship;
 const control=player.input;
 const manual=Math.hypot(control.x,control.y)>.02;
 const heading=control.heading ?? ship.angle;
 const region=regionOf(ship), phys=physics(ship);
 FlightCore.updateEnergy(ship,ship.systems,dt,region.id,room.time,hasTechOn(ship,'capacitors'));
 player.mining=Math.max(0, player.mining-dt);
 player.dashCooldown=Math.max(0, player.dashCooldown-dt);
 if (manual) {player.target=null;player.course=null;}
 const rock=player.target&&room.rocks.find(rock=>rock.id===player.target&&rock.ore>0);
 if (player.target&&!rock) player.target=null;
 const dist=rock?gap(ship,rock):Infinity;
 let course=player.course;
 if (rock&&dist>=BEAM_RANGE) {
  const margin=Math.max(225,rock.r+phys.radius*.72+5);
  course={x:rock.x+(ship.x-rock.x)/dist*margin,y:rock.y+(ship.y-rock.y)/dist*margin};
 }
 let max=FlightCore.speedLimit(phys);
 if (player.cruise && (manual||course) && !player.dash && !ship.overheated && ship.energy>=4) {
  ship.energy=Math.max(0,ship.energy-26*dt);
  ship.heat=Math.min(100,ship.heat+2.2*dt);
  max=420;
 }
 if (course) {
  if (!rock&&gap(course,ship)<12&&Math.hypot(ship.vx,ship.vy)<12) {
   Object.assign(ship,{x:course.x,y:course.y,vx:0,vy:0});
   player.course=null;
  } else FlightCore.followPoint(ship,course,phys,max,dt);
 } else if (rock) {
  FlightCore.accelerate(ship,0,0,phys.accel*1.4,dt);
  if (Math.hypot(ship.vx,ship.vy)<35) extract(room,player,rock);
 } else {
  FlightCore.applyManualFlight(ship,control,heading,ship.systems.assist,phys,max,dt);
 }
 if (region.id==='rift') {
  const r=gap(ship,region)||1;
  ship.vx+=(region.x-ship.x)/r*9*dt;
  ship.vy+=(region.y-ship.y)/r*9*dt;
 }
 if (player.dash) {
  ship.vx+=player.dash.x*1520*dt;
  ship.vy+=player.dash.y*1520*dt;
  player.dash.left-=dt;
  if (player.dash.left<=0) player.dash=null;
 }
 FlightCore.integrate(ship,dt);
 FlightCore.collide(ship,phys,obstacles,dt,(module,damage)=>damageInRoom(room,ship,module,damage));
 if (!ship.dead && control.fire && !ship.overheated) shoot(room,player,phys.mass);
}
function shoot(room, player, mass) {
 const ship=player.ship;
 const velocity={x:ship.vx,y:ship.vy};
 const weapons=ship.modules.filter(module=>FlightCore.operational(module) && CATALOG.weapons[module.type])
  .filter(module=>ship.systems.weaponGroup==='all'||FlightCore.groupFor(CATALOG.weapons[module.type])===ship.systems.weaponGroup);
 let lock=null, closest=Infinity;
 for (const enemy of room.enemies) {
  if (enemy.dead||!ship.systems.autoAim) continue;
  const specified=player.aim?.id===enemy.id&&enemy.modules.find(module=>module.x===player.aim.x&&module.y===player.aim.y);
  const point=specified?{...cell(enemy,specified),id:enemy.id,vx:enemy.vx,vy:enemy.vy}:enemy;
  const distance=gap(ship,point)-(specified?10000:0);
  if (distance>=closest || !weapons.some(module=>FlightCore.leadInCone(ship,cell(ship,module),CATALOG.weapons[module.type],point,velocity)!==null)) continue;
  lock=point;
  closest=distance;
 }
 const fired=FlightCore.fire(ship,ship.systems,CATALOG.weapons,mass,{lock});
 for (const bullet of fired) room.shots.push({...bullet,id:++room.serial,owner:player.id});
}
function updateHostiles(room, dt, pilots) {
 for (const enemy of room.enemies) {
  if (enemy.dead) continue;
  let target=null, distance=Infinity;
  for (const pilot of pilots) {
   const range=gap(enemy,pilot.ship);
   if (!pilot.ship.dead && !inSafeZone(pilot.ship) && range<distance) {target=pilot;distance=range;}
  }
  const order=CATALOG.enemyInfo[enemy.archetype]??CATALOG.enemyInfo.skirmisher;
  const atHome=gap(enemy,enemy.home);
  const alert=target && atHome<(enemy.archetype==='boss'?420:1100) && distance<Math.max(920,order.attack+160);
  const phys=physics(enemy);
  FlightCore.updateEnergy(enemy,enemy.systems,dt,regionOf(enemy).id,room.time,false);
  let dx=0,dy=0,heading=enemy.angle;
  if (alert) {
   const nx=(target.ship.x-enemy.x)/(distance||1),ny=(target.ship.y-enemy.y)/(distance||1);
   const unarmed=!enemy.modules.some(module=>CATALOG.weapons[module.type]&&FlightCore.operational(module));
   const far=enemy.archetype==='boss'?650:order.range;
   const radial=unarmed?-order.speed:bound((distance-far)*.55,-order.speed,order.speed);
   const strafe=enemy.archetype==='scout'?70:enemy.archetype==='skirmisher'?45*Math.sin(room.time*.8+enemy.home.x):(enemy.wing||0)*32;
   dx=nx*radial-ny*strafe;dy=ny*radial+nx*strafe;
   const speed=enemy.modules.some(module=>module.type==='rail')?1000:620;
   heading=FlightCore.targetBearing(enemy,target.ship,{x:enemy.vx,y:enemy.vy},speed)+Math.PI/2;
  } else if (atHome>18) {
   dx=(enemy.home.x-enemy.x)/atHome*52;dy=(enemy.home.y-enemy.y)/atHome*52;
   heading=Math.atan2(dy,dx)+Math.PI/2;
  }
  if (!installed(enemy,'engine')&&!installed(enemy,'ion')) { dx=enemy.vx*.95;dy=enemy.vy*.95; }
  FlightCore.accelerate(enemy,dx,dy,phys.accel*.55,dt);
  FlightCore.integrate(enemy,dt);
  const angle=FlightCore.turnTowards(enemy,heading,dt,phys.turn*.7);
  enemy.cool-=dt;
  if (alert && distance<order.attack && enemy.cool<=0 && angle<.18) {
   const pressure=enemy.archetype==='scout'?1.52:enemy.archetype==='sniper'?1.6:1.48;
   const fired=FlightCore.fire(enemy,enemy.systems,CATALOG.weapons,phys.mass,{enemy:true,hostileTarget:target.id,pressure});
   for (const shot of fired) room.shots.push({...shot,id:++room.serial});
   enemy.cool=order.cool*.9;
  }
 }
}
function intercept(room, ship, friendly) {
 if (ship.dead || ship.overheated || (friendly && inSafeZone(ship))) return;
 for (const module of ship.modules) {
  if (module.type!=='pointDefense'||!FlightCore.operational(module)||module.cd>0||ship.energy<3) continue;
  const origin=cell(ship,module);
  let closest=235, rocket=null;
  for (const shot of room.shots) {
   if (!shot.guided||shot.life<=0||shot.enemy!==friendly) continue;
   const distance=gap(origin,shot);
   if (distance<closest) {rocket=shot;closest=distance;}
  }
  if (rocket) {
   rocket.life=0;
   ship.energy-=3;
   module.cd=.85;
   emit(room,'hit',{x:rocket.x,y:rocket.y,kind:'explosive'});
  }
 }
}
function projectiles(room, dt, pilots, rocks) {
 const friendly=pilots.map(player=>player.ship).filter(ship=>!ship.dead&&!inSafeZone(ship));
 const hostile=room.enemies.filter(enemy=>!enemy.dead);
 for (const ship of friendly) intercept(room,ship,true);
 for (const ship of hostile) intercept(room,ship,false);
 for (const shot of room.shots) {
  if (shot.life<=0) continue;
  const target=shot.guided && (shot.enemy?pilots.find(player=>player.id===shot.targetId)?.ship:hostile.find(enemy=>enemy.id===shot.targetId));
  if (target&&!target.dead) {
   const angle=Math.atan2(shot.vy,shot.vx), desired=Math.atan2(target.y-shot.y,target.x-shot.x);
   const a=angle+bound(FlightCore.bearingDifference(desired,angle),-dt*1.15,dt*1.15);
   const speed=Math.hypot(shot.vx,shot.vy);
   shot.vx=Math.cos(a)*speed;shot.vy=Math.sin(a)*speed;
  }
  let origin={x:shot.x,y:shot.y};
  const to={x:shot.x+shot.vx*dt,y:shot.y+shot.vy*dt};
  Object.assign(shot,to);
  shot.life-=dt;
  for (let pass=0; pass<2; pass++) {
   let time=Infinity, hitShip=null, hitPart=null;
   for (const rock of rocks) {
    const t=FlightCore.impactTime(origin,to,rock,rock.r*.8);
    if (t<time)time=t;
   }
   for (const ship of shot.enemy?friendly:hostile) {
    if (ship.dead||Math.abs(ship.x-origin.x)>210||Math.abs(ship.y-origin.y)>210) continue;
    for (const module of ship.modules) {
     if (shot.ignored?.id===(ship.actorId||ship.id)&&shot.ignored.x===module.x&&shot.ignored.y===module.y) continue;
     const t=FlightCore.impactTime(origin,to,cell(ship,module),11);
     if (t<time) {hitShip=ship;hitPart=module;time=t;}
    }
   }
   if (time===Infinity) break;
   const point={x:origin.x+(to.x-origin.x)*time,y:origin.y+(to.y-origin.y)*time};
   if (!hitShip) {shot.life=0;emit(room,'hit',{...point,kind:shot.kind});break;}
   damageInRoom(room,hitShip,hitPart,shot.damage,shot.kind,shot.owner);
   if (shot.guided&&!hitShip.dead) for (const other of hitShip.modules.slice()) {
    const distance=gap(point,cell(hitShip,other));
    if (other!==hitPart&&distance<48)damageInRoom(room,hitShip,other,shot.damage*bound((48-distance)/64,.1,.46),'explosive',shot.owner);
   }
   if (shot.pierce>0&&hitPart.type==='armor'&&!hitShip.dead) {
    shot.pierce--;shot.damage*=.48;origin=point;shot.ignored={id:hitShip.actorId||hitShip.id,x:hitPart.x,y:hitPart.y};
   } else {shot.life=0;break;}
  }
 }
 room.shots=room.shots.filter(shot=>shot.life>0).slice(-160);
}
function stepRoom(room, now) {
 const elapsed = Math.max(0, Math.min(.6, (now-room.lastTick)/1000));
 room.lastTick=Math.max(now,room.lastTick);
 room.tickDebt+=elapsed;
 const pilots=room.players.filter(player=>now-player.seen<=PLAYER_IDLE_MS);
 if (!pilots.length){room.tickDebt=0;return;}
 for (const pilot of pilots) if (now-pilot.seen>INPUT_IDLE_MS) pilot.input=blankInput();
 while (room.tickDebt+1e-9>=STEP) {
  room.tickDebt-=STEP;
  room.time+=STEP;
  const activeRocks=room.rocks.filter(rock=>rock.ore>0);
  const obstacles=[...activeRocks,...OBSTACLES];
  for (const pilot of pilots) if (!pilot.ship.dead) movePilot(room,pilot,STEP,obstacles);
  const fighters=pilots.filter(player=>!player.ship.dead);
  updateHostiles(room,STEP,fighters);
  projectiles(room,STEP,fighters,activeRocks);
  updateFragments(room,STEP,fighters);
 }
 for (const rock of room.rocks) {
  if (!rock.ore&&rock.renewAt<=room.time&&pilots.every(player=>gap(player.ship,rock)>850)) {
   rock.ore=rock.reserve;
   if (rock.work)rock.work.surface=Math.ceil(rock.ore*.65);
   delete rock.renewAt;
  }
 }
}
