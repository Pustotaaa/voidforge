'use strict';

const ROCKS={
 ore:{label:'Астероид со сплавом', item:'ore', pattern:'dots', hardness:1},
 rawOre:{label:'Железистая порода', item:'rawOre', pattern:'stripes', hardness:.85},
 crystal:{label:'Кристаллическая жила', item:'crystal', pattern:'grid', hardness:1.3},
 ice:{label:'Ледяная глыба', item:'ice', pattern:'cross', hardness:.7},
 volatile:{label:'Нестабильная жила', item:'crystal', pattern:'noise', hardness:1.1, unstable:true},
 salvage:{label:'Старые обломки', item:'ore', pattern:'cross', hardness:1}
};
const INDUSTRIAL_GOODS={
 rawOre:{name:'Руда',unit:'ед.',mass:.055,space:1,icon:'mine',stock:220,restock:35},
 ice:{name:'Лёд',unit:'ед.',mass:.042,space:1,icon:'cooler',stock:180,restock:28},
 coolant:{name:'Хладагент',unit:'ед.',mass:.06,space:2,icon:'cooler',stock:65,restock:9},
 cells:{name:'Энергоячейки',unit:'ед.',mass:.07,space:2,icon:'reactor',stock:65,restock:9}
};
const INDUSTRY_PRICES={
 home:{rawOre:[3,1],ice:[4,2],coolant:[15,9],cells:[20,12]},
 forge:{rawOre:[2,1],ice:[5,3],coolant:[18,12],cells:[23,14]},
 atlas:{rawOre:[4,2],ice:[3,1],coolant:[13,8],cells:[17,10]},
 merchant:{rawOre:[3,1],ice:[5,2],coolant:[17,10],cells:[21,13]}
};
const RECIPES=[
 {id:'smelt',name:'Выплавка',input:'rawOre',inputAmount:18,output:'ore',outputAmount:12,fee:4,duration:7,icon:'armor'},
 {id:'chill',name:'Охлаждение',input:'ice',inputAmount:12,output:'coolant',outputAmount:5,fee:5,duration:9,icon:'cooler'},
 {id:'charge',name:'Сборка ячеек',input:'crystal',inputAmount:10,output:'cells',outputAmount:4,fee:8,duration:11,icon:'reactor'},
 {id:'parts',name:'Сборка деталей',input:'ore',inputAmount:24,output:'parts',outputAmount:2,fee:10,duration:12,icon:'parts'}
];
const DEPOSITS=[
 ['rawOre',340,-160,30,60],['rawOre',-1080,-455,34,78],['rawOre',-1950,-890,42,114],
 ['rawOre',-1380,-230,34,82],['ice',1250,1690,43,96],['ice',1700,1580,37,81],['ice',2140,1760,39,93],
 ['volatile',1510,-1420,40,105],['volatile',1690,-1800,37,92],['volatile',1050,-1120,42,102],
 ['crystal',680,310,29,53],['crystal',1220,1110,37,84]
];
const FIELD_RENEWAL=180;
const TRACTOR_RANGE=390;
const refineryRecipes=new Map(RECIPES.map(recipe=>[recipe.id,recipe]));
const rockProfile=a=>ROCKS[a.material]??ROCKS.ore;
const rockSize=a=>a.r>=55?'Огромный':a.r>=28?'Средний':'Малый';
const reservedCargo=()=>s.campaign.deliveries.reduce((sum,f)=>sum+f.amount*GOODS[f.item].space,0);
const freeCargo=()=>Math.max(0,cargoMax()-cargoUsed()-reservedCargo());
const freeFor=item=>Object.hasOwn(AMMUNITION,item)?Math.max(0,ammoCap(item)-resourceAmount(item)):Math.floor(freeCargo()/GOODS[item].space);

const LARGE_DEPOSITS=[
 {id:'massive-iron',x:-1880,y:-510,r:66,ore:178,seed:4.72,material:'rawOre'},
 {id:'massive-ice',x:1330,y:910,r:69,ore:192,seed:8.14,material:'ice'},
 {id:'massive-crystal',x:1860,y:-1450,r:63,ore:164,seed:6.4,material:'crystal'}
];

function addLargeDeposits(state) {
 for(const deposit of LARGE_DEPOSITS) {
  if(state.asteroids.some(a=>a.id===deposit.id))continue;
  state.asteroids.push({...deposit,initialReserve:deposit.ore,reserve:deposit.ore,
   work:{surface:Math.ceil(deposit.ore*.65),tier:deposit.material==='crystal'?2:1}});
 }
}


Object.assign(GOODS,INDUSTRIAL_GOODS);
for(const [p,prices] of Object.entries(INDUSTRY_PRICES))Object.assign(PRICES[p],prices);
types.tractor={name:'Тягач',cost:95,hp:70,symbol:'⌖',mass:9,tech:'tractor',desc:'Подтягивает отбитые куски породы с дистанции до 390 м. Ближний сбор доступен любому кораблю.'};
TECHS.push({id:'tractor',name:'Буксирный луч',icon:'target',row:3,col:1,requires:['drilling'],data:30,crystal:14,credits:115,desc:'Открывает модуль «Тягач». Подтягивайте обломки породы к кораблю, расходуя энергию.'});

function configureIndustry(state,newFlight=false) {
 const cc=state.campaign;
 for(const key of Object.keys(INDUSTRIAL_GOODS))if(!Number.isFinite(cc[key])||cc[key]<0)cc[key]=0;
 if(cc.beamMode!=='manual')cc.beamMode='auto';
 if(!cc.refining||typeof cc.refining!=='object'||Array.isArray(cc.refining))cc.refining={};
 for(const id of Object.keys(cc.refining)) {
  const job=cc.refining[id];
  if(!PLACES.some(p=>p.kind==='station'&&p.id===id)||!job||!refineryRecipes.has(job.recipe)||!Number.isFinite(job.until))delete cc.refining[id];
 }
 cc.fragments=Array.isArray(cc.fragments)?cc.fragments.filter(f=>f&&Object.hasOwn(GOODS,f.item)&&f.amount>0
  &&['x','y','vx','vy','amount','life'].every(k=>Number.isFinite(f[k]))&&f.life>0).slice(-60):[];
 cc.deliveries=Array.isArray(cc.deliveries)?cc.deliveries.filter(f=>f&&['ore','rawOre','crystal','ice'].includes(f.item)
  &&['x','y','bend','elapsed','duration','amount'].every(k=>Number.isFinite(f[k]))
  &&Number.isSafeInteger(f.amount)&&f.amount>0&&f.duration>0&&f.elapsed>=0&&f.elapsed<f.duration):[];
 let next=Number.isSafeInteger(cc.fragmentSerial)?cc.fragmentSerial:0;
 for(const chunk of cc.fragments)if(Number.isSafeInteger(chunk.id))next=Math.max(next,chunk.id);
 cc.fragmentSerial=next;
 if(!cc.industryVersion) {
  if(newFlight)for(const [i,a] of state.asteroids.entries()) {
   const zone=zoneAt(a).id;
   if(!a.wreck&&zone==='ice'&&i%3===0)a.material='ice';
   if(!a.wreck&&a.material==='ore'&&((zone==='rust'&&i%3!==0)||(zone==='void'&&i%5===0)))a.material='rawOre';
  }
  const existing=new Set(state.asteroids.map(a=>a.id));
  for(const [i,[material,x,y,r,ore]] of DEPOSITS.entries()) {
   const id='industry-'+i;
   if(!existing.has(id))state.asteroids.push({id,material,x,y,r,ore,seed:13+i*7,work:{surface:Math.ceil(ore*.65),tier:material==='ice'?1:2}});
  }
  cc.industryVersion=1;
 }
 addLargeDeposits(state);
 for(const a of state.asteroids) {
  if(a.wreck||!/^((ore|zone|industry|massive)-)/.test(a.id))continue;
  if(!a.reserve)a.reserve=Math.max(45,a.ore);
  if(a.ore<=0&&!Number.isFinite(a.renewAt))a.renewAt=state.stats.time+FIELD_RENEWAL;
 }
}

function stationMarket(id) {
 let market=s.campaign.markets[id];
 if(!market||typeof market!=='object'||!Number.isFinite(market.time))market=s.campaign.markets[id]={time:s.stats.time};
 for(const [item,good] of Object.entries(GOODS))if(!Number.isFinite(market[item])||market[item]<0)market[item]=good.stock;
 const cycles=Math.floor((s.stats.time-market.time)/90);
 if(cycles>0) {
  for(const [item,good] of Object.entries(GOODS)) {
   const difference=good.stock-market[item];
   market[item]+=Math.sign(difference)*Math.min(Math.abs(difference),cycles*good.restock);
  }
  market.time+=cycles*90;
 }
 return market;
}
function marketPrice(place,item,stock) {
 const good=GOODS[item],base=PRICES[place.market||'merchant'][item];
 const shortage=clamp((1-stock/good.stock)*.52,-.3,.56);
 const period=Math.floor(s.stats.time/180);
 const seed=Array.from(place.id).reduce((n,c)=>n+c.charCodeAt(0),0);
 const demand=period>0&&Object.keys(GOODS)[(period+seed)%Object.keys(GOODS).length]===item ? .26 : 0;
 const freight=isStory()&&item==='rockets'?1.14:1;
 const buy=Math.max(2,Math.round(base[0]*(1+shortage+demand)*freight));
 return {buy,sell:clamp(Math.round(base[1]*(1+shortage+demand)),1,buy-1),demand:demand>0};
}
function marketOrder(place,item,side,qty,stock) {
 if(!Number.isInteger(qty)||qty<1||qty>100||!['buy','sell'].includes(side))return Infinity;
 const direction=side==='buy'?-1:1;
 let sum=0;
 for(let i=0;i<qty;i++)sum+=marketPrice(place,item,stock+i*direction)[side];
 return sum;
}
const TRADE_SECTIONS={
 materials:{label:'Материалы',icon:'mine',items:['ore','crystal','parts','rawOre','ice']},
 supplies:{label:'Снабжение',icon:'cargo',items:['shells','rockets','coolant','cells']}
};
let tradeSection='materials';
function renderMarket(place,root) {
 const stock=stationMarket(place.id);
 const tabs=document.createElement('div');tabs.className='marketTabs';
 tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Категория товаров');
 for(const [id,section] of Object.entries(TRADE_SECTIONS)) {
  const tab=button(section.label,()=>{tradeSection=id;renderContact();$('market-'+id)?.focus({preventScroll:true});});
  tab.id='market-'+id;tab.innerHTML=iconMarkup(section.icon)+'<span>'+section.label+'</span>';
  tab.setAttribute('aria-pressed',String(tradeSection===id));tab.classList.toggle('active',tradeSection===id);
  tabs.appendChild(tab);
 }
 root.appendChild(tabs);
 const toolbar=document.createElement('div');toolbar.className='quantityRow';toolbar.appendChild(document.createTextNode('Партия: '));
 for(const size of [1,10,50]) {
  const b=button(String(size),()=>{tradeQty=size;renderContact();});b.classList.toggle('active',tradeQty===size);toolbar.appendChild(b);
 }
 const hold=document.createElement('span');hold.textContent='Трюм '+cargoUsed()+' / '+cargoMax();toolbar.appendChild(hold);root.appendChild(toolbar);
 for(const item of TRADE_SECTIONS[tradeSection].items) {
  const good=GOODS[item],price=marketPrice(place,item,stock[item]),row=document.createElement('article');row.className='tradeRow';
  row.innerHTML='<div><div class="tradeTitle">'+iconMarkup(good.icon)+'<h3>'+good.name+'</h3></div><p>В трюме '+resourceAmount(item)+' · В продаже '+stock[item]+'</p><small>За 1 '+good.unit+': '+price.buy+' кр. покупка / '+price.sell+' кр. продажа'+(price.demand?' · Повышенный спрос':'')+'</small></div>';
  const actions=document.createElement('div');actions.className='tradeActions';
  const buy=marketOrder(place,item,'buy',tradeQty,stock[item]),sell=marketOrder(place,item,'sell',tradeQty,stock[item]);
  actions.appendChild(button('Купить '+tradeQty+' · '+buy+' кр.',()=>doTrade(item,'buy',tradeQty),stock[item]<tradeQty||s.campaign.credits<buy||freeFor(item)<tradeQty));
  actions.appendChild(button('Продать '+tradeQty+' · '+sell+' кр.',()=>doTrade(item,'sell',tradeQty),resourceAmount(item)<tradeQty));
  row.appendChild(actions);root.appendChild(row);
 }

}
function refineryStation(place) {return place?.kind==='station'&&canInteract(place);}
function beginRefinery(place, id) {
 const recipe=refineryRecipes.get(id),cc=s.campaign;
 if(!refineryStation(place)||!recipe||cc.refining[place.id]||resourceAmount(recipe.input)<recipe.inputAmount||cc.credits<recipe.fee)return false;
 changeResource(recipe.input,-recipe.inputAmount);cc.credits-=recipe.fee;
 cc.refining[place.id]={recipe:id,until:s.stats.time+recipe.duration};
 save(false);renderContact();toast('Заказ принят. Время идёт в полёте.');return true;
}
function collectRefinery(place) {
 if(!refineryStation(place))return false;
 const job=s.campaign.refining[place.id],recipe=job&&refineryRecipes.get(job.recipe);
 if(!recipe||job.until>s.stats.time||freeFor(recipe.output)<recipe.outputAmount)return false;
 changeResource(recipe.output,recipe.outputAmount);delete s.campaign.refining[place.id];
 save(false);renderContact();toast('Получено: '+GOODS[recipe.output].name+' · '+recipe.outputAmount);return true;
}
function renderRefinery(place,root) {
 const job=s.campaign.refining[place.id];
 const note=document.createElement('p');note.className='panelIntro';
 note.textContent='Одна партия на станцию. После запуска вернитесь в полёт. Готовый груз хранится на станции, пока вы его не заберёте.';
 root.appendChild(note);
 if(job) {
  const recipe=refineryRecipes.get(job.recipe),left=Math.max(0,Math.ceil(job.until-s.stats.time));
  const card=document.createElement('article');card.className='contractCard';
  card.innerHTML='<h3>'+recipe.name+'</h3><p>'+(left?'Осталось '+left+' секунд полёта':'Готово · '+GOODS[recipe.output].name+' × '+recipe.outputAmount)+'</p>';
  card.appendChild(button('Забрать груз',()=>collectRefinery(place),left>0||freeFor(recipe.output)<recipe.outputAmount));root.appendChild(card);return;
 }
 const grid=document.createElement('div');grid.className='destinationGrid';
 for(const recipe of RECIPES) {
  const card=document.createElement('article');card.className='destinationCard';
  card.innerHTML=iconMarkup(recipe.icon)+'<h3>'+recipe.name+'</h3><p>'+GOODS[recipe.input].name+' × '+recipe.inputAmount+' → '+GOODS[recipe.output].name+' × '+recipe.outputAmount+'</p><small>'+recipe.fee+' кр. · '+recipe.duration+' с</small>';
  card.appendChild(button('Запустить',()=>beginRefinery(place,recipe.id),resourceAmount(recipe.input)<recipe.inputAmount||s.campaign.credits<recipe.fee));grid.appendChild(card);
 }
 root.appendChild(grid);
}

let beamPointer=null,beamCharge=0,beamTarget=null;
function resetMiningAim() {beamPointer=null;beamCharge=0;beamTarget=null;}
function manualMiningTarget() {
 if(s.campaign.beamMode!=='manual'||s.destination)return null;
 return s.asteroids.find(a=>a.id===s.miningId&&!a.wreck&&distance(a,s)<MINE_RANGE)||null;
}
function rockSpot(a) {
 const angle=a.seed+clock*.61;
 return {x:a.x+Math.cos(angle)*a.r*.61,y:a.y+Math.sin(angle)*a.r*.61,r:Math.max(9,Math.min(16,a.r*.32))};
}
function updateMining(a,dt) {
 if(s.campaign.beamMode!=='manual'||a.wreck){runExtraction(a);return;}
 if(beamTarget!==a.id){beamTarget=a.id;beamCharge=0;}
 const spot=rockSpot(a);
 const onSpot=beamPointer&&distance(spot,viewAt(beamPointer.x,beamPointer.y))<spot.r+3;
 beamCharge=clamp(beamCharge+(onSpot?dt:-dt*2.5),0,.18);
 if(!onSpot||beamCharge<.18) {
  s.miningWait=onSpot?'Луч набирает мощность':'Удерживайте луч на белой точке';
  return;
 }
 runExtraction(a,true);
}
function markDepleted(a) {
 if(a.reserve&&a.ore===0&&!a.wreck&&a.renewAt==null)a.renewAt=s.stats.time+FIELD_RENEWAL;
}
function breakDeposit(a, hot=false) {
 const count=Math.min(4,60-s.campaign.fragments.length,a.ore);
 if(count<=0)return false;
 const item=rockProfile(a).item;
 let remaining=a.ore;
 for(let i=0;i<count;i++) {
  const direction=i/count*Math.PI*2+a.seed,amount=Math.floor(remaining/(count-i));
  const cos=Math.cos(direction),sin=Math.sin(direction);
  s.campaign.fragments.push({id:++s.campaign.fragmentSerial,item,amount,x:a.x+cos*a.r,y:a.y+sin*a.r,vx:cos*(34+i*9),vy:sin*(34+i*9),life:55});
  remaining-=amount;
 }
 a.ore=0;if(a.work)a.work.surface=0;
 markDepleted(a);
 cancelPilot();
 if(hot&&distance(a,s)<205) {
  const surface=s.modules.filter(m=>m.x||m.y).sort((a1,b)=>distance(position(s,a1),a)-distance(position(s,b),a))[0]||core(s);
  if(surface)hit(s,surface,24);
 }
 rockImpact(a,a,true);playSound('break');
 toast(hot?'Жила раскололась от нагрева. Соберите разлетающиеся фрагменты.':'Порода разбита. Подберите куски на пролёте или подтяните тягачом.');
 save(false);return true;
}
const cargoModule=()=>s.modules.find(m=>m.type==='cargo'&&operational(m));
function cargoHatch(pose=s) {
 const module=cargoModule();
 return position(pose,module?{x:module.x,y:module.y+.42}:{x:0,y:.48});
}
function dispatchOre(a,item,amount,point) {
 const count=Math.min(amount,3), gap=distance(point,s);
 let remaining=amount;
 for(let i=0;i<count;i++) {
  const units=Math.ceil(remaining/(count-i));
  remaining-=units;
  s.campaign.deliveries.push({item,amount:units,x:point.x,y:point.y,source:a.id,
   bend:(i%2===0?1:-1)*(18+i*9),elapsed:0,duration:.30+gap/850+i*.08});
 }
}
function deliveryPoint(f,hatch) {
 const t=clamp(f.elapsed/f.duration,0,1);
 const progress=t*t*(2-t), arc=Math.sin(t*Math.PI)*f.bend;
 const dx=hatch.x-f.x,dy=hatch.y-f.y,gap=Math.hypot(dx,dy)||1;
 return {x:f.x+dx*progress-dy/gap*arc,y:f.y+dy*progress+dx/gap*arc};
}
function creditCargo(item,amount,hatch) {
 changeResource(item,amount);
 s.stats.mined+=amount;
 recordExtraction(item,amount);
 const feedback=fx.find(f=>f.intake===item);
 if(feedback){feedback.amount+=amount;feedback.t=.72;}
 else fx.push({...hatch,intake:item,amount,t:.72});
}
function updateDeliveries(dt) {
 const hatch=cargoHatch();
 const pending=[], finished=new Set();
 for(const f of s.campaign.deliveries) {
  f.elapsed+=dt;
  if(f.elapsed<f.duration){pending.push(f);continue;}
  const amount=Math.min(f.amount,Math.floor(Math.max(0,cargoMax()-cargoUsed())/GOODS[f.item].space));
  if(amount)creditCargo(f.item,amount,hatch);
  if(amount<f.amount)s.campaign.fragments.push({id:++s.campaign.fragmentSerial,item:f.item,amount:f.amount-amount,
   x:hatch.x,y:hatch.y,vx:s.vx*.45,vy:s.vy*.45,life:55});
  finished.add(f.source);
 }
 s.campaign.deliveries=pending;
 const id=s.miningId;
 if(finished.has(id)&&!pending.some(f=>f.source===id)) {
  const a=s.asteroids.find(rock=>rock.id===id);
  if(!a||!isExtractable(a)||!canDrill(a)){cancelPilot();save(false);}
 }
}
function collectionPulse(chunk,dt,hatch,tractor) {
 const gap=distance(hatch,chunk),room=freeFor(chunk.item);
 if(room>0&&gap<10) {
  const taken=Math.min(room,chunk.amount);
  creditCargo(chunk.item,taken,hatch);chunk.amount-=taken;
  playSound('mine');
 }
 if(chunk.amount<=0)return;
 const local=gap<72, remote=tractor&&gap<TRACTOR_RANGE&&s.energy>=dt*3;
 if(room>0&&gap>.01&&(local||remote)) {
  const speed=Math.min(270,75+gap),scale=speed/gap,blend=Math.min(1,dt*(local?11:7));
  chunk.vx+=((hatch.x-chunk.x)*scale-chunk.vx)*blend;
  chunk.vy+=((hatch.y-chunk.y)*scale-chunk.vy)*blend;
  if(remote&&!local)s.energy-=dt*3;
 }
 chunk.x=clamp(chunk.x+chunk.vx*dt,-LIMIT,LIMIT);chunk.y=clamp(chunk.y+chunk.vy*dt,-LIMIT,LIMIT);
 chunk.life-=dt;
}
let renewalCheck=0;
function updateIndustry(dt) {
 const cc=s.campaign;
 if(cc.deliveries.length)updateDeliveries(dt);
 if(cc.fragments.length) {
  const active=[],hatch=cargoHatch(),tractor=activeCount('tractor');
  for(const part of cc.fragments) {collectionPulse(part,dt,hatch,tractor);if(part.life>0&&part.amount>0)active.push(part);}
  cc.fragments=active;
 }
 if(renewalCheck>s.stats.time+2)renewalCheck=0;
 if(s.stats.time<renewalCheck)return;
 renewalCheck=s.stats.time+1;
 for(const a of s.asteroids) {
  if(a.ore>0||!a.reserve||a.renewAt==null||a.renewAt>s.stats.time||distance(a,s)<850)continue;
  a.ore=a.reserve;
  if(a.work)a.work.surface=Math.ceil(a.ore*.65);
  delete a.renewAt;
 }
 const scout=s.enemies.find(e=>e.archetype==='scout'&&e.dead&&e.returnAt<=s.stats.time);
 if(scout&&distance(s,scout.home)>1100) {
  const revived=makeScout();revived.patrolRound=(scout.patrolRound||0)+1;
  Object.assign(scout,revived);delete scout.returnAt;
 }
}
function drawIndustry() {
 const hatch=cargoHatch(flightPose),tractor=activeCount('tractor');
 ctx.save();
 for(const f of s.campaign.fragments) {
  if(Math.abs(f.x-view.x)>W/view.zoom/2+30||Math.abs(f.y-view.y)>H/view.zoom/2+30)continue;
  if(tractor&&distance(f,hatch)<TRACTOR_RANGE&&freeFor(f.item)>0) {
   ctx.strokeStyle='#7b7b7b';ctx.setLineDash([1,6]);ctx.beginPath();
   ctx.moveTo(hatch.x,hatch.y);ctx.lineTo(f.x,f.y);ctx.stroke();ctx.setLineDash([]);
  }
  drawMineralShard(f.item,f,4+Math.min(6,f.amount*.13),reduceMotion?f.id:renderTime*2+f.id);
 }
 for(const f of s.campaign.deliveries) {
  const point=deliveryPoint(f,hatch);
  if(!reduceMotion) {
   const trail=deliveryPoint({...f,elapsed:f.elapsed-.065},hatch);
   ctx.strokeStyle=mineralInk(f.item).line;ctx.globalAlpha=.53;
   ctx.beginPath();ctx.moveTo(trail.x,trail.y);ctx.lineTo(point.x,point.y);ctx.stroke();ctx.globalAlpha=1;
  }
  drawMineralShard(f.item,point,5+Math.min(4,f.amount*.4),reduceMotion?f.bend:renderTime*5+f.bend);
 }
 const a=manualMiningTarget();
 if(a) {
  const spot=rockSpot(a);
  ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(spot.x,spot.y,spot.r,0,2*Math.PI);ctx.stroke();
  ctx.fillRect(spot.x-2,spot.y-2,4,4);
  if(beamCharge>0) {ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(spot.x,spot.y);ctx.stroke();}
 }
 ctx.restore();
}
function renderIndustrialSystems() {
 const manual=s.campaign.beamMode==='manual';
 $('beamMode').textContent=manual?'Ручной луч':'Автодобыча';
 $('beamMode').setAttribute('aria-pressed',String(manual));
 $('beamInfo').textContent=manual?'В полёте удерживайте мышь или палец на движущейся белой точке. Быстрее, но горячее.':'Корабль добывает сам, когда остановится возле месторождения.';
 $('coolantUse').textContent='Охладить · '+s.campaign.coolant;
 $('cellUse').textContent='Энергия · '+s.campaign.cells;
 $('coolantUse').disabled=!s.campaign.coolant||s.heat<=0;
 $('cellUse').disabled=!s.campaign.cells||s.energy>=100;
}
function useSupply(key) {
 if(s.dead||!['cells','coolant'].includes(key)||s.campaign[key]<=0)return false;
 if(key==='coolant') {
  if(s.heat<=0)return false;
  s.heat=Math.max(0,s.heat-33);
  if(s.heat<=45)s.overheated=false;
 } else {
  if(s.energy>=100)return false;
  s.energy=Math.min(100,s.energy+32);
 }
 s.campaign[key]--;save(false);
 if(modal==='systemsModal')renderSystems();
 return true;
}
$('beamMode').onclick=()=>{
 s.campaign.beamMode=s.campaign.beamMode==='manual'?'auto':'manual';
 resetMiningAim();save(false);renderIndustrialSystems();
};
$('coolantUse').onclick=()=>useSupply('coolant');
$('cellUse').onclick=()=>useSupply('cells');
