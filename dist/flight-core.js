'use strict';

// Deterministic simulation rules shared by the browser and the room Worker.
const FlightCore = (() => {
 const STEP = 1 / 60;
 const LIMIT = 2700;
 const MINE_RANGE = 240;
 const AIM_HALF_ANGLE = 35 * Math.PI / 180;
 const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
 const bearingDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
 const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
 const operational = module => !(module.disabledFor > 0);
 const activeCount = (ship, type) => ship.modules.filter(module => module.type === type && operational(module)).length;
 const moduleMass = (module, types) => (types[module.type].mass || 8) * (module.quality === 'light' ? .72 : 1) * (module.mk === 2 ? 1.08 : 1);
 const moduleHp = (module, types) => Math.round(types[module.type].hp * (module.quality === 'light' ? .8 : 1) * (module.mk === 2 ? 1.25 : 1) * (module.reinforced === true ? 1.5 : 1));
 const position = (ship, module) => {
  const cos = Math.cos(ship.angle), sin = Math.sin(ship.angle);
  return {x: ship.x + (module.x * cos - module.y * sin) * 20, y: ship.y + (module.x * sin + module.y * cos) * 20};
 };
 const upgradeQuote = value => ({alloy: Math.max(16, Math.ceil(value * .65)), credits: 35 + Math.ceil(value * .56)});
 const groupFor = weapon => weapon.kind === 'kinetic' ? 'kinetic' : weapon.kind === 'explosive' ? 'rockets' : 'energy';

 function shipPhysics(ship, types, cargoMass = 0, power) {
  let mass = 0, cx = 0, cy = 0, moment = 0;
  for (const module of ship.modules) {
   const weight = moduleMass(module, types);
   mass += weight;
   cx += module.x * weight;
   cy += module.y * weight;
  }
  cx /= mass || 1;
  cy /= mass || 1;
  for (const module of ship.modules) {
   moment += moduleMass(module, types) * (1 + (module.x - cx) ** 2 + (module.y - cy) ** 2);
  }
  mass += cargoMass;
  const force = (1300 + activeCount(ship, 'engine') * 5500 + activeCount(ship, 'ion') * 10000) * (power === 'engines' ? 1.3 : 1);
  return {
   mass, force, accel: force / Math.max(1, mass), turn: clamp(5 / Math.sqrt(moment / 100), .45, 4),
   radius: Math.max(24, ...ship.modules.map(module => Math.hypot(module.x, module.y) * 20 + 12)),
  };
 }
 const speedLimit = physics => clamp(150 + physics.accel * .65, 170, 320);

 function turnTowards(ship, angle, dt, rate) {
  const error = bearingDifference(angle, ship.angle);
  const wanted = clamp(error * 5, -rate, rate);
  ship.angularVelocity = (ship.angularVelocity || 0) + clamp(wanted - (ship.angularVelocity || 0), -rate * 4 * dt, rate * 4 * dt);
  ship.angle += ship.angularVelocity * dt;
  return Math.abs(error);
 }
 function accelerate(ship, vx, vy, accel, dt) {
  let ax = (vx - ship.vx) * 2.4, ay = (vy - ship.vy) * 2.4;
  const length = Math.hypot(ax, ay);
  if (length > accel) {
   ax *= accel / length;
   ay *= accel / length;
  }
  ship.vx += ax * dt;
  ship.vy += ay * dt;
 }
 function applyManualFlight(ship, input, heading, assist, physics, maxSpeed, dt) {
  turnTowards(ship, heading, dt, physics.turn);
  const {x, y} = input;
  const cos = Math.cos(ship.angle), sin = Math.sin(ship.angle);
  const dx = x * cos - y * sin, dy = x * sin + y * cos;
  if (assist) accelerate(ship, dx * maxSpeed, dy * maxSpeed, physics.accel, dt);
  else {
   const drift = Math.exp(-.015 * dt);
   ship.vx = (ship.vx + dx * physics.accel * dt) * drift;
   ship.vy = (ship.vy + dy * physics.accel * dt) * drift;
  }
 }
 function followPoint(ship, point, physics, maxSpeed, dt) {
  const dx = point.x - ship.x, dy = point.y - ship.y, range = Math.hypot(dx, dy);
  const speed = Math.min(maxSpeed, Math.sqrt(2 * physics.accel * Math.max(0, range - 8)) * .7, range * 1.7);
  const vx = dx / (range || 1) * speed, vy = dy / (range || 1) * speed;
  if (Math.hypot(vx, vy) > 1) turnTowards(ship, Math.atan2(vy, vx) + Math.PI / 2, dt, physics.turn);
  accelerate(ship, vx, vy, physics.accel, dt);
 }
 function integrate(ship, dt) {
  const velocity = Math.hypot(ship.vx, ship.vy);
  if (velocity > 650) {
   ship.vx *= 650 / velocity;
   ship.vy *= 650 / velocity;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  if (Math.abs(ship.x) > LIMIT) { ship.x = clamp(ship.x, -LIMIT, LIMIT); ship.vx *= -.25; }
  if (Math.abs(ship.y) > LIMIT) { ship.y = clamp(ship.y, -LIMIT, LIMIT); ship.vy *= -.25; }
 }
 function collide(ship, physics, objects, dt, onImpact) {
  ship.impactCooldown = Math.max(0, (ship.impactCooldown || 0) - dt);
  for (const object of objects) {
   const dx = ship.x - object.x, dy = ship.y - object.y, gap = Math.hypot(dx, dy);
   const radius = object.r + physics.radius * .72;
   if (gap >= radius) continue;
   const nx = dx / (gap || 1) || 1, ny = dy / (gap || 1), impact = -(ship.vx * nx + ship.vy * ny);
   ship.x = object.x + nx * (radius + 1);
   ship.y = object.y + ny * (radius + 1);
   if (impact > 0) {
    ship.vx += nx * impact * 1.3;
    ship.vy += ny * impact * 1.3;
    ship.angularVelocity += (nx * ship.vy - ny * ship.vx) * .001;
   }
   if (impact > 65 && ship.impactCooldown <= 0) {
    const nearest = ship.modules.slice().sort((a, b) => distance(position(ship, a), object) - distance(position(ship, b), object))[0];
    if (nearest) onImpact(nearest, Math.min(50, (impact - 55) * .15));
    ship.impactCooldown = .6;
   }
   if (ship.dead) break;
  }
 }
 function updateEnergy(ship, systems, dt, regionId, clock, capacitors) {
  ship.energy = Math.min(100, (ship.energy ?? 100) + dt * (7 + activeCount(ship, 'reactor') * 11) * (capacitors ? 1.25 : 1));
  const cooling = (5 + activeCount(ship, 'cooler') * 9) * (regionId === 'ice' ? 1.5 : regionId === 'nebula' ? .45 : 1);
  ship.heat = Math.max(0, (ship.heat || 0) - cooling * dt);
  if (regionId === 'storm') ship.energy = Math.max(0, ship.energy - dt * 9);
  if ((regionId === 'nebula' || regionId === 'storm') && Math.sin(clock * .7) > .4) ship.heat = Math.min(100, ship.heat + 9 * dt);
  if (ship.heat >= 100) ship.overheated = true;
  if (ship.overheated && ship.heat <= 45) ship.overheated = false;
  for (const module of ship.modules) {
   module.cd = Math.max(0, (module.cd || 0) - dt);
   if (module.disabledFor > 0) module.disabledFor = Math.max(0, module.disabledFor - dt);
  }
  systems.shieldDelay = Math.max(0, (systems.shieldDelay || 0) - dt);
  const max = activeCount(ship, 'shield') * 90;
  systems.shield = Math.min(max, systems.shield || 0);
  if (max && systems.shieldDelay <= 0 && regionId !== 'nebula') {
   const power = systems.power === 'shields' ? 1.6 : systems.power === 'weapons' ? .5 : 1;
   const amount = Math.min(max - systems.shield, dt * 12 * power, ship.energy * 2);
   systems.shield += amount;
   ship.energy -= amount * .5;
  }
 }
 function targetBearing(origin, target, velocity, speed) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const travel = Math.hypot(dx, dy) / speed;
  return Math.atan2(dy + ((target.vy || 0) - velocity.y) * travel, dx + ((target.vx || 0) - velocity.x) * travel);
 }
 function leadInCone(ship, muzzle, weapon, target, velocity) {
  if (!target || distance(muzzle, target) > weapon.speed * weapon.life) return null;
  const angle = targetBearing(muzzle, target, velocity, weapon.speed);
  return Math.abs(bearingDifference(angle, ship.angle - Math.PI / 2)) <= AIM_HALF_ANGLE + 1e-9 ? angle : null;
 }
 function fire(ship, systems, arsenal, mass, {enemy = false, lock = null, hostileTarget = 'player', pressure = 1, onShot = () => {}} = {}) {
  const power = enemy ? 'balanced' : systems.power;
  const interval = {balanced: .32, engines: .40, weapons: .24, shields: .42}[power];
  const velocity = {x: ship.vx || 0, y: ship.vy || 0};
  const shots = [];
  for (const module of ship.modules) {
   const weapon = arsenal[module.type];
   if (!weapon || !operational(module) || module.cd > 0 || ship.overheated || ship.energy < weapon.energy) continue;
   const group = systems.weaponGroup;
   if (!enemy && ((group !== 'all' && groupFor(weapon) !== group) || (weapon.ammo && systems[weapon.ammo] < weapon.rounds))) continue;
   const muzzle = position(ship, module);
   const lead = weapon.fixed ? null : leadInCone(ship, muzzle, weapon, lock, velocity);
   const angle = lead ?? ship.angle - Math.PI / 2;
   const dx = Math.cos(angle), dy = Math.sin(angle);
   const damage = (enemy ? weapon.hostileDamage : weapon.damage) * (power === 'weapons' ? 1.2 : 1)
    * (module.quality === 'hot' ? 1.2 : 1) * (module.mk === 2 ? 1.18 : 1) * pressure;
   const guided = weapon.kind === 'explosive';
   onShot(muzzle, weapon, angle);
   shots.push({...muzzle, vx: dx * weapon.speed + velocity.x, vy: dy * weapon.speed + velocity.y,
    life: weapon.life, enemy, damage, rail: module.type === 'rail', kind: weapon.kind, pierce: weapon.pierce,
    guided, targetId: guided && (enemy ? hostileTarget : lead !== null ? lock.id : null)});
   if (!enemy && weapon.ammo) systems[weapon.ammo] -= weapon.rounds;
   ship.energy -= weapon.energy;
   ship.heat = Math.min(100, ship.heat + weapon.heat * (module.quality === 'hot' ? 1.28 : 1));
   ship.overheated = ship.heat >= 100;
   module.cd = weapon.cooldown ?? interval;
   const recoil = weapon.recoil / Math.max(1, mass);
   ship.vx -= dx * recoil;
   ship.vy -= dy * recoil;
  }
  return shots;
 }
 function shieldHit(ship, systems, damage, damageType) {
  systems.shieldDelay = 3;
  if (!activeCount(ship, 'shield') || systems.shield <= 0) return {damage, absorbed: 0};
  const rate = damageType?.shield ?? 1;
  const absorbed = Math.min(systems.shield, damage * rate);
  systems.shield -= absorbed;
  return {damage: damage - absorbed / rate, absorbed};
 }
 function remainingConnected(modules) {
  const root = modules.find(module => module.x === 0 && module.y === 0);
  if (!root) return [];
  const found = new Set([root]), queue = [root];
  for (const node of queue) {
   for (const module of modules) {
    if (!found.has(module) && Math.abs(module.x - node.x) + Math.abs(module.y - node.y) === 1) {
     found.add(module);
     queue.push(module);
    }
   }
  }
  return modules.filter(module => found.has(module));
 }
 function impactTime(from, to, center, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, x = from.x - center.x, y = from.y - center.y;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy, projection = x * dx + y * dy;
  if (!a || projection >= 0) return Infinity;
  const disc = projection * projection - a * c;
  if (disc < 0) return Infinity;
  const t = (-projection - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
 }
 function miningPulse(rock, material, layer, {boost, manual, rigs, geology, story, space}) {
  const energy = {surface: 4, deep: 9, wreck: 6}[layer] * (boost ? 2 : 1) + (manual ? 2 : 0);
  const heat = (layer === 'deep' ? 15 : layer === 'wreck' ? 9 : 5) * (boost ? 2 : 1) + (manual ? 5 : 0);
  const speed = (geology ? 11 : 7) + Math.min(rigs, 3) * 2;
  const limit = layer === 'surface' && rock.work ? rock.work.surface : rock.ore;
  const hardness = layer === 'deep' ? (rock.work.tier === 2 ? .55 : .72) : 1;
  const amount = Math.min(rock.ore, limit, space, Math.max(1, Math.floor(speed * (boost ? 1.6 : 1) * (manual ? 1.18 : 1) * hardness / material.hardness)));
  const cooldown = (boost ? .53 : layer === 'deep' ? 1.05 : .8) * (manual ? .62 : 1) * (story && !geology ? 2 : 1);
  return {energy, heat, amount, cooldown};
 }
 return {STEP, LIMIT, MINE_RANGE, AIM_HALF_ANGLE, clamp, bearingDifference, distance, operational, activeCount,
  moduleMass, moduleHp, position, upgradeQuote, groupFor, shipPhysics, speedLimit, turnTowards,
  accelerate, applyManualFlight, followPoint, integrate, collide, updateEnergy, targetBearing, leadInCone,
  fire, shieldHit, remainingConnected, impactTime, miningPulse};
})();
