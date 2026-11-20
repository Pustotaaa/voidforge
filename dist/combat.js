'use strict';

const AMMUNITION={
 shells:{name:'Снаряды',unit:'шт.',mass:.014,space:0,icon:'rail',stock:420,restock:65,baseCap:180,perMagazine:180,start:160},
 rockets:{name:'Ракеты',unit:'шт.',mass:.073,space:0,icon:'target',stock:60,restock:9,baseCap:12,perMagazine:20,start:6}
};
const DAMAGE_TYPES={
 kinetic:{shield:.78,armor:1.16},
 plasma:{shield:1.5,armor:.72},
 explosive:{shield:1,armor:.86},
 emp:{shield:1.32,armor:.55}
};
const WEAPONS={
 gun:{kind:'kinetic',speed:620,life:1.6,energy:5,heat:8,damage:24,hostileDamage:15.6,recoil:90,ammo:'shells',rounds:1},
 rail:{kind:'kinetic',speed:1000,life:1.4,energy:14,heat:20,damage:65,hostileDamage:42.25,recoil:350,cooldown:.95,ammo:'shells',rounds:3,pierce:1,fixed:true},
 plasma:{kind:'plasma',speed:530,life:1.5,energy:7,heat:11,damage:21,hostileDamage:13.65,recoil:55,cooldown:.38},
 launcher:{kind:'explosive',speed:380,life:2.5,energy:4,heat:8,damage:39,hostileDamage:25.35,recoil:72,cooldown:1.55,ammo:'rockets',rounds:1},
 emp:{kind:'emp',speed:610,life:1.25,energy:13,heat:12,damage:16,hostileDamage:10.4,recoil:50,cooldown:1.35}
};
const GROUP_NAMES={all:'Всё',kinetic:'Кинетика',energy:'Энергия',rockets:'Ракеты'};
const SALVAGE_SPACE=12;
const tacticalPoint=(enemy,module)=>({...position(enemy,module),vx:enemy.vx,vy:enemy.vy,id:enemy.id});
const operational=FlightCore.operational;
const activeCount=(type,ship=s)=>ship.modules.filter(m=>m.type===type&&operational(m)).length;
const ammoCap=key=>AMMUNITION[key].baseCap+count('magazine')*AMMUNITION[key].perMagazine;
const weaponGroup=FlightCore.groupFor;

Object.assign(GOODS,AMMUNITION);
for(const [market,shellPrice,rocketPrice] of [['home',2,10],['forge',2,8],['atlas',3,12],['merchant',3,11]]) {
 PRICES[market].shells=[shellPrice,shellPrice-1];PRICES[market].rockets=[rocketPrice,rocketPrice-4];
}
for(const recipe of [
 {id:'shells',name:'Набивка снарядов',input:'ore',inputAmount:12,output:'shells',outputAmount:24,fee:5,duration:7,icon:'rail'},
 {id:'rockets',name:'Снаряжение ракет',input:'ore',inputAmount:10,output:'rockets',outputAmount:4,fee:8,duration:9,icon:'target'}
]) {RECIPES.push(recipe);refineryRecipes.set(recipe.id,recipe);}
Object.assign(types,{
 magazine:{name:'Склад боеприпасов',cost:60,hp:66,mass:8,symbol:'▣',icon:'cargo',desc:'+180 снарядов и +20 ракет. При разрушении повреждает соседние модули, если в трюме есть боезапас.'},
 plasma:{name:'Плазменная турель',cost:88,hp:74,mass:10,symbol:'✳',icon:'reactor',tech:'plasmaTech',desc:'Сильна против щитов, слаба против брони. Расходует только энергию. Сектор ±35°.'},
 launcher:{name:'Ракетная установка',cost:105,hp:78,mass:11,symbol:'⇈',icon:'target',tech:'missileTech',desc:'Ракета наводится на захваченную цель и повреждает соседние модули при попадании. Требуется ракета.'},
 emp:{name:'ЭМИ-излучатель',cost:125,hp:68,mass:10,symbol:'◈',icon:'reactor',tech:'empTech',desc:'Попадание за щитами отключает модуль на 3 секунды. Заряд расходует энергию.'},
 pointDefense:{name:'Точечная оборона',cost:75,hp:58,mass:7,symbol:'⌖',icon:'target',tech:'interceptTech',desc:'Перехватывает до одной ракеты за 0,85 с в радиусе 235 м. На перехват тратится энергия.'}
});
types.gun.desc+=' Расходует один снаряд.';
types.rail.desc+=' Стреляет вдоль носа, расходует три снаряда и пробивает один слой брони.';
TECHS.push(
 {id:'plasmaTech',name:'Плазменная дуга',icon:'reactor',row:3,col:3,requires:['capacitors'],data:24,crystal:15,credits:125,desc:'Открывает плазменные турели против вражеских щитов.'},
 {id:'missileTech',name:'Управляемые ракеты',icon:'target',row:4,col:1,requires:['railgun'],data:28,crystal:15,credits:130,desc:'Открывает ракетную установку. Ракеты можно купить или собрать на станции.'},
 {id:'interceptTech',name:'Точечная оборона',icon:'shield',row:4,col:2,requires:['shields'],data:23,crystal:12,credits:110,desc:'Открывает автоматический перехват ракет.'},
 {id:'empTech',name:'Глушение подсистем',icon:'reactor',row:4,col:3,requires:['plasmaTech'],data:35,crystal:22,credits:170,desc:'Открывает ЭМИ-излучатель, временно отключающий поражённый модуль.'}
);
Object.assign(ENEMY_INFO,{
 striker:{rank:'Плазменный фланкер',tier:2,tactic:'Заходит с другой стороны. Плазма быстро разряжает ваш щит.',range:420,speed:102,cool:1.0,attack:690},
 bomber:{rank:'Ракетный эскорт',tier:3,tactic:'Держится за союзником и пускает ракеты. Используйте укрытия или точечную оборону.',range:650,speed:74,cool:1.65,attack:850}
});

let aimedCell=null, selectedSalvage=null;
const salvageItem=m=>m&&Object.hasOwn(types,m.type)&&!types[m.type].npcOnly&&m.type!=='reactor'&&m.hp>0&&m.hp<=types[m.type].hp;
function configureCombat(state) {
 const cc=state.campaign;
 for(const [key,ammo] of Object.entries(AMMUNITION))if(!Number.isFinite(cc[key])||cc[key]<0)cc[key]=ammo.start;
 if(!Object.hasOwn(GROUP_NAMES,cc.weaponGroup))cc.weaponGroup='all';
 cc.spareModules=Array.isArray(cc.spareModules)?cc.spareModules.filter(m=>salvageItem(m)&&Number.isSafeInteger(m.id)):[];
 cc.salvageSerial=Math.max(0,Number.isSafeInteger(cc.salvageSerial)?cc.salvageSerial:0,...cc.spareModules.map(m=>m.id));
 if(cc.combatVersion)return;
 const patrols=[
  {id:'wing-bastion',name:'КРЕЧЕТ',archetype:'striker',squad:'bastion',wing:-1,x:-1560,y:1210,weapon:'plasma'},
  {id:'wing-gate',name:'ГАРПУН',archetype:'bomber',squad:'gate',wing:1,x:1730,y:-750,weapon:'launcher'}
 ];
 for(const [i,def] of patrols.entries()) {
  const leader=state.enemies.find(e=>e.id==='pirate-'+(i+1));
  if(leader){leader.squad=def.squad;leader.wing=-def.wing;}
  if(state.enemies.some(e=>e.id===def.id))continue;
  const modules=base().filter(m=>m.type!=='gun');
  modules.push(makeModule(0,-1,def.weapon));
  const dead=Boolean(leader?.dead);
  state.enemies.push({...def,home:{x:def.x,y:def.y},angle:0,cool:1.7,dead,vx:0,vy:0,modules:dead?[]:modules});
 }
 cc.combatVersion=1;
}
function activeWeapons() {
 return s.modules.filter(m=>WEAPONS[m.type]&&operational(m)&&groupAllows(WEAPONS[m.type])).map(m=>WEAPONS[m.type]);
}
function groupAllows(weapon) {
 const group=s.campaign.weaponGroup;
 return group==='all'||weaponGroup(weapon)===group;
}
function targetModule(enemy) {
 return aimedCell?.id===enemy.id?enemy.modules.find(m=>m.x===aimedCell.x&&m.y===aimedCell.y):null;
}
function pointAtEnemy(point) {
 let pick=null,range=13;
 for(const enemy of s.enemies) {
  if(enemy.dead||!actEnemyReady(enemy)||enemy.archetype==='boss'&&!bossUnlocked()||distance(point,enemy)>190)continue;
  for(const m of enemy.modules) {
   const gap=distance(point,position(enemy,m));
   if(gap<range){pick={id:enemy.id,x:m.x,y:m.y};range=gap;}
  }
 }
 return pick;
}
function selectTargetCell(pick) {
 if(aimedCell?.id===pick.id&&aimedCell.x===pick.x&&aimedCell.y===pick.y){aimedCell=null;toast('Приоритет снят.');return;}
 aimedCell=pick;
 const enemy=s.enemies.find(e=>e.id===pick.id),module=enemy&&targetModule(enemy);
 if(module)toast('Приоритет: '+types[module.type].name+'. Броня и укрытия могут закрывать цель.');
}
function updateTargetedFire() {
 const held=worldPointer;
 if(!held?.targeted||held.touch||held.engaged||clock-held.startsAt<.18)return;
 held.engaged=true;
 aimedCell=held.targeted;
 mouse.down=true;
}
function setWeaponGroup(group) {
 if(!Object.hasOwn(GROUP_NAMES,group))return;
 s.campaign.weaponGroup=group;
 updateCombatHud();
}
function updateCombatHud() {
 setHudText('ammoReadout','Снаряды '+s.campaign.shells+' · Ракеты '+s.campaign.rockets);
 const group=GROUP_NAMES[s.campaign.weaponGroup];
 setHudText('weaponGroupLabel',group);
 if($('weaponGroup').title!==group+' · сменить группу оружия') {
  $('weaponGroup').title=group+' · сменить группу оружия';
  $('weaponGroup').setAttribute('aria-label','Группа оружия '+group+'. Нажмите для смены.');
 }
 const enemy=aimedCell&&s.enemies.find(e=>e.id===aimedCell.id&&!e.dead);
 const module=enemy&&targetModule(enemy);
 if(aimedCell&&!module)aimedCell=null;
 $('targetModuleLabel').hidden=!module;
 if(module)setHudText('targetModuleLabel',types[module.type].name+' · '+Math.ceil(module.hp)+' HP'+(!operational(module)?' · ЭМИ':''));
 const weapons=activeWeapons();
 $('noAmmo').hidden=!weapons.length||weapons.some(w=>!w.ammo||s.campaign[w.ammo]>=w.rounds);
}
function drawTacticalPin() {
 const enemy=aimedCell&&s.enemies.find(e=>e.id===aimedCell.id&&!e.dead);
 const module=enemy&&targetModule(enemy);
 if(!module)return;
 const p=position(enemy,module);
 ctx.strokeStyle='#fff';ctx.setLineDash([2,3]);ctx.strokeRect(p.x-14,p.y-14,28,28);ctx.setLineDash([]);
}

function pickTrophy(enemy) {
 const preference=['emp','launcher','plasma','rail','shield','pointDefense','gun','engine','armor'];
 let best=null,score=Infinity;
 for(const m of enemy.modules) {
  const rank=preference.indexOf(m.type);
  if(rank>=0&&rank<score&&salvageItem(m)){best=m;score=rank;}
 }
 return best?{type:best.type,hp:Math.max(1,Math.min(Math.floor(best.hp),Math.floor(types[best.type].hp*.55)))}:null;
}
function collectSpare(loot) {
 if(!salvageItem(loot?.module)||freeCargo()<SALVAGE_SPACE)return false;
 const cc=s.campaign;
 cc.spareModules.push({...loot.module,id:++cc.salvageSerial});delete loot.module;
 return true;
}
const selectedTrophy=()=>s.campaign.spareModules.find(m=>m.id===selectedSalvage&&m.type===selected);
function renderSalvage() {
 const box=$('spareModules');box.replaceChildren();
 if(!s.campaign.spareModules.length){box.textContent='Пусто. Разбирайте остовы вражеских кораблей.';return;}
 for(const trophy of s.campaign.spareModules) {
  const item=document.createElement('div');item.className='trophyRow';
  const name=moduleName(trophy);
  const pick=button(name+' · '+trophy.hp+' HP',()=>{selected=trophy.type;selectedSalvage=trophy.id;removeMode=false;renderEditor();});
  pick.classList.toggle('active',selectedSalvage===trophy.id);item.appendChild(pick);
  item.appendChild(button('На сплав',()=>scrapTrophy(trophy)));box.appendChild(item);
 }
}
function scrapTrophy(trophy) {
 if(modal!=='builder'||!s.campaign.spareModules.includes(trophy))return;
 const yieldAlloy=Math.max(1,Math.floor(types[trophy.type].cost*.35*trophy.hp/types[trophy.type].hp));
 if(cargoUsed()+reservedCargo()-SALVAGE_SPACE+yieldAlloy>cargoMax()){toast('Недостаточно места для полученного сплава.');return;}
 snapshotBuild();s.campaign.spareModules=s.campaign.spareModules.filter(m=>m!==trophy);
 if(selectedSalvage===trophy.id)selectedSalvage=null;
 s.ore+=yieldAlloy;renderEditor();toast('Трофей разобран · '+yieldAlloy+' сплава.');
}

function disableModule(ship,module,kind) {
 if(kind!=='emp'||!WEAPONS[module.type]&&!['engine','ion','shield','reactor','cooler','pointDefense','tractor','drill'].includes(module.type))return;
 module.disabledFor=Math.max(module.disabledFor||0,3);
 if(ship===s)toast('ЭМИ: '+types[module.type].name+' отключён на 3 с.');
}
function dischargeModule(ship,module,point) {
 const volatile=module.type==='reactor'||module.type==='magazine';
 if(!volatile||ship.dead||module.type==='reactor'&&module.x===0&&module.y===0)return;
 let blast=module.type==='reactor'?23:29;
 if(module.type==='magazine'&&ship===s) {
  const cc=s.campaign;
  if(!cc.shells&&!cc.rockets)return;
  const shells=Math.min(24,cc.shells),rockets=Math.min(4,cc.rockets);
  cc.shells-=shells;cc.rockets-=rockets;
  blast=12+shells*.5+rockets*3;
 }
 fx.push({...point,t:.3});
 for(const neighbor of ship.modules.slice()) {
  const offset=Math.abs(neighbor.x-module.x)+Math.abs(neighbor.y-module.y);
  if(offset===1)hit(ship,neighbor,blast,'explosive');
 }
}
function moveRocket(b,dt) {
 if(!b.guided)return;
 const enemy=b.targetId==='player'?s:s.enemies.find(e=>e.id===b.targetId);
 if(!enemy||enemy.dead)return;
 const heading=Math.atan2(b.vy,b.vx),aim=Math.atan2(enemy.y-b.y,enemy.x-b.x);
 const a=heading+clamp(angleDifference(aim,heading),-dt*1.15,dt*1.15);
 const speed=Math.hypot(b.vx,b.vy);
 b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
}
function runPointDefense(ship) {
 if(ship.dead||ship.overheated||ship===s&&isSafe(s))return;
 const friendly=ship===s;
 for(const m of ship.modules) {
  if(m.type!=='pointDefense'||!operational(m)||m.cd>0||ship.energy<3)continue;
  const turret=position(ship,m);
  let nearest=null,range=235;
  for(const rocket of bullets) {
   if(!rocket.guided||rocket.life<=0||rocket.enemy!==friendly)continue;
   const gap=distance(rocket,turret);
   if(gap<range){nearest=rocket;range=gap;}
  }
  if(!nearest&&friendly){
   const drone=s.enemies.find(e=>e.archetype==='drone'&&!e.dead&&distance(e,turret)<range);
   if(drone){ship.energy-=3;m.cd=.85;hit(drone,core(drone),20,'kinetic');fx.push({x:drone.x,y:drone.y,t:.17,defenseFrom:turret});}
   continue;
  }
  if(!nearest)continue;
  nearest.life=0;ship.energy-=3;m.cd=.85;effectBurst(nearest,'explosive');
  fx.push({x:nearest.x,y:nearest.y,t:.17,defenseFrom:turret});
  if(friendly)playSound('hit');
 }
}
const impactTime=FlightCore.impactTime;
function firstImpact(b,from,to) {
 let time=Infinity,collision=null;
 for(const a of s.asteroids) {
  if(!isExtractable(a))continue;
  const candidate=impactTime(from,to,a,.8*a.r);
  if(candidate<time){time=candidate;collision={a,time};}
 }
 for(const ship of b.enemy?[s]:s.enemies) {
  if(ship.dead||!actEnemyReady(ship)||Math.abs(ship.x-from.x)>205||Math.abs(ship.y-from.y)>205)continue;
  for(const m of ship.modules) {
   if(b.ignored?.ship===ship&&b.ignored.module===m)continue;
   const candidate=impactTime(from,to,position(ship,m),11);
   if(candidate<time){time=candidate;collision={ship,m,time};}
  }
 }
 return collision;
}
function resolveProjectile(b,collision,point) {
 if(collision.a) {fx.push({...point,t:.2});effectBurst(point,b.kind,Math.atan2(-b.vy,-b.vx));return false;}
 const {ship,m}=collision;
 if(!b.enemy&&!b.npc)s.stats.hits++;
 const damage=b.damage||(b.enemy?9:24);
 hit(ship,m,damage,b.kind);
 if(b.guided&&!ship.dead) {
  for(const other of ship.modules.slice()) {
   if(other===m)continue;
   const d=distance(point,position(ship,other));
   if(d<48)hit(ship,other,damage*clamp((48-d)/64,.10,.46),'explosive');
  }
 }
 if(b.pierce>0&&m.type==='armor'&&!ship.dead) {
  b.pierce--;b.damage=damage*.48;b.ignored={ship,module:m};
  return true;
 }
 return false;
}
function updateProjectiles(dt) {
 runPointDefense(s);
 for(const e of s.enemies)if(!e.dead&&count('pointDefense',e))runPointDefense(e);
 for(const b of bullets) {
  if(b.life<=0)continue;
  if(b.enemy&&isSafe(s)){b.life=0;continue;}
  moveRocket(b,dt);
  let from={x:b.x,y:b.y};
  const to={x:b.x+b.vx*dt,y:b.y+b.vy*dt};
  b.x=to.x;b.y=to.y;b.life-=dt;
  for(let i=0;i<2;i++) {
   const collision=firstImpact(b,from,to);
   if(!collision)break;
   const {time}=collision;
   const point={x:from.x+(to.x-from.x)*time,y:from.y+(to.y-from.y)*time};
   if(!resolveProjectile(b,collision,point)){b.life=0;break;}
   from=point;
  }
  if(modal==='resultModal')break;
 }
 bullets=bullets.filter(b=>b.life>0);
}

$('weaponGroup').onclick=()=>{
 const groups=Object.keys(GROUP_NAMES);
 setWeaponGroup(groups[(groups.indexOf(s.campaign.weaponGroup)+1)%groups.length]);
};
