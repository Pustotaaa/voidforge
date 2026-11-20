'use strict';

const STARTER_DEBT=480, DEBT_TIME=20*60, PROLOGUE_LENGTH=6.4;
const STARTER_SHIPS={
 wanderer:{name:'Скиталец',role:'Универсальный',description:'Две пушки и два двигателя. Подходит для разведки и первых боёв.',modules:base},
 courier:{name:'Стриж',role:'Скоростной',description:'Три двигателя. Быстро проходит между залежами и портом.',modules:()=>[
  makeModule(0,0,'reactor'),makeModule(0,-1,'gun'),makeModule(-1,0,'armor'),makeModule(1,0,'armor'),
  makeModule(0,1,'cooler'),makeModule(-1,1,'engine'),makeModule(1,1,'engine'),makeModule(0,2,'engine')
 ]},
 hauler:{name:'Ковчежник',role:'Грузовой',description:'Грузовой отсек и тяжёлая броня. Везёт больше ресурсов за рейс.',modules:()=>[
  ...base().filter(m=>m.x!==-1||m.y!==-1),makeModule(-1,-1,'armor'),
  makeModule(-2,0,'armor'),makeModule(2,0,'armor'),makeModule(0,2,'cargo')
 ]}
};
let prologueTime=0, prologueBoss=null;
const launchState=()=>s.launch;
const debtBalance=()=>launchState()?.debt||0;
const debtRemaining=()=>Math.max(0,(launchState()?.dueAt??s.stats.time)-s.stats.time);
const formatDebtTime=seconds=>{
 const whole=Math.ceil(seconds);
 return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0');
};

function normalizeLaunch(state) {
 const launch=state.launch;
 if(!launch||!['title','intro','yard','flying','replacement','default'].includes(launch.phase)){
  state.launch={phase:'flying',debt:0,dueAt:null,ship:null};
  return;
 }
 launch.debt=Number.isInteger(launch.debt)?clamp(launch.debt,0,STARTER_DEBT):0;
 launch.dueAt=launch.debt&&Number.isFinite(launch.dueAt)
  ?clamp(launch.dueAt,state.stats.time,state.stats.time+DEBT_TIME):null;
 launch.ship=Object.hasOwn(STARTER_SHIPS,launch.ship)?launch.ship:null;
 if(launch.debt&&launch.dueAt===null)launch.dueAt=state.stats.time;
 if(launch.debt&&launch.dueAt<=state.stats.time+1e-7)launch.phase='default';
 state.dead=launch.phase==='replacement';
}

function initLaunch(continued) {
 if(!continued){
  s.launch={phase:'title',debt:0,dueAt:null,ship:null};
  save(false);
 }
 if(launchState().phase==='intro')startPrologue();
 else if(launchState().phase!=='flying')renderLaunch();
 else log('Загружен сохранённый полёт.');
}

function renderLaunch() {
 const {phase,debt}=launchState();
 const title=$('launchTitle'),text=$('launchText'),action=$('launchAction'),cards=$('starterShips');
 $('flightHud').hidden=true;
 $('launchModal').dataset.phase=phase;
 $('launchKicker').textContent=({
  title:'ЧЁРНЫЙ СЕКТОР',intro:'ЭКСПЕДИЦИЯ «ПОРОГ»',
  yard:'СВОБОДНЫЙ ПОРТ «ПРИЧАЛ»',replacement:'СВОБОДНЫЙ ПОРТ «ПРИЧАЛ»',default:'ЭКСПЕДИЦИЯ ПРЕРВАНА'
 })[phase];
 cards.hidden=phase!=='yard'&&phase!=='replacement';
 action.hidden=!cards.hidden;
 $('launchCoop').hidden=phase!=='title';
 $('launchMarketHint').hidden=phase!=='yard';
 if(phase==='title') {
  title.textContent='VOIDFORGE';
  text.textContent='Космическая экспедиция в Чёрном секторе';
  action.textContent='Старт';action.onclick=startPrologue;
 } else if(phase==='intro') {
  title.textContent='Флагман «Порог»';
  text.textContent='Обнаружен Смотритель';
  action.textContent='Пропустить';action.onclick=finishPrologue;
 } else if(phase==='default') {
  title.textContent='Срок выплаты истёк';
  text.textContent='Остаток долга — '+debt+' кр. Экспедиция проиграна.';
  action.textContent='Новая игра';action.onclick=newFlight;
 } else {
  const replacement=phase==='replacement';
  title.textContent=replacement?'Корабль потерян':'Орбитальная верфь';
  text.textContent=replacement
   ?'Выберите бесплатную замену. '+(debt?'Долг '+debt+' кр. · осталось '+formatDebtTime(debtRemaining())+'.':'Ваш груз и прогресс сохранены.')
   :'Выберите корабль в долг за '+STARTER_DEBT+' кр. С первого вылета у вас будет 20 минут полёта на выплату.';
  cards.replaceChildren(...Object.entries(STARTER_SHIPS).map(([id,ship])=>shipCard(id,ship,replacement)));
 }
 openModal('launchModal');
 if(!cards.hidden)title.focus({preventScroll:true});
}

function shipCard(id, ship, replacement) {
 const card=document.createElement('article');
 const preview=document.createElement('canvas');
 preview.width=192;preview.height=90;
 preview.setAttribute('aria-hidden','true');
 const details=document.createElement('div');
 const hull=ship.modules();
 details.innerHTML='<h3>'+ship.name+'</h3><b>'+ship.role+'</b><p>'+ship.description+'</p>';
 const stats=document.createElement('small');
 stats.textContent='Корпус '+capacity({modules:hull})+' · Трюм '+(500+hull.filter(m=>m.type==='cargo').length*200);
 const pick=button(replacement?'Вылет · бесплатно':'Взять в долг',()=>launchShip(id));
 pick.className='primary';
 pick.setAttribute('aria-label',(replacement?'Вылет бесплатно на корабле «':'Взять в долг корабль «')+ship.name+'»');
 card.appendChild(preview);card.appendChild(details);card.appendChild(stats);card.appendChild(pick);
 const g=preview.getContext('2d');
 g.fillStyle='#080808';g.fillRect(0,0,192,90);
 g.fillStyle='#454545';
 for(let x=0;x<192;x+=12)for(let y=3;y<90;y+=12)g.fillRect(x,y,1,1);
 for(const m of hull)drawModule(g,96+m.x*17,40+m.y*17,m,15);
 return card;
}

function startPrologue() {
 const launch=launchState();
 if(!['title','intro'].includes(launch.phase))return;
 unlockAudio();
 launch.phase='intro';
 prologueTime=0;
 prologueBoss=makeBoss().modules;
 renderLaunch();
 save(false);
}

function finishPrologue() {
 if(launchState().phase!=='intro')return;
 launchState().phase='yard';
 prologueBoss=null;
 renderLaunch();
 save(false);
}

function advancePrologue(dt) {
 const oldTime=prologueTime;
 prologueTime+=dt;
 if(prologueTime>=PROLOGUE_LENGTH){finishPrologue();return;}
 if(oldTime<.65&&prologueTime>=.65)playSound('omen');
 if(oldTime<2.35&&prologueTime>=2.35){
  $('launchTitle').textContent='Прямое попадание';
  $('launchText').textContent='Реактор флагмана разрушен. Сигнал потерян.';
  playSound('explosion');explosionNoise();
 }
}

const FLAGSHIP_HULL=[
 [0,0,'reactor'],[-1,0,'armor'],[1,0,'armor'],[-2,0,'armor'],[2,0,'armor'],[-3,0,'armor'],[3,0,'armor'],
 [-2,-1,'gun'],[-1,-1,'armor'],[0,-1,'armor'],[1,-1,'armor'],[2,-1,'gun'],
 [-1,-2,'armor'],[0,-2,'armor'],[1,-2,'armor'],[0,-3,'rail'],
 [-2,1,'armor'],[-1,1,'cargo'],[0,1,'reactor'],[1,1,'cargo'],[2,1,'armor'],
 [-2,2,'engine'],[-1,2,'armor'],[0,2,'cooler'],[1,2,'armor'],[2,2,'engine'],[0,3,'engine']
];

function drawPrologue() {
 shadeSpace();
 const time=prologueTime,blast=Math.max(0,time-2.35);
 const scale=clamp(Math.min(W/500,H/590),.48,1.8);
 const drift=reduceMotion?0:time;
 const boss={x:W*.72-drift*8,y:H*.29+drift*3};
 const ship={x:W*.32+drift*5,y:H*.60-drift*4};
 ctx.save();
 if(time>1.2&&time<2.35) {
  ctx.strokeStyle='#ddd';ctx.setLineDash([3,6]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(boss.x,boss.y);ctx.lineTo(ship.x,ship.y);ctx.stroke();
 }
 if(time>=2.35&&time<2.67) {
  ctx.globalAlpha=1-(time-2.35)/.32;ctx.strokeStyle='#fff';ctx.setLineDash([]);
  ctx.lineWidth=reduceMotion?3:10;
  ctx.beginPath();ctx.moveTo(boss.x,boss.y);ctx.lineTo(ship.x,ship.y);ctx.stroke();
 }
 ctx.restore();
 ctx.save();
 ctx.translate(boss.x,boss.y);ctx.rotate(-2.2);ctx.scale(scale,scale);
 for(const m of prologueBoss)drawModule(ctx,m.x*20,m.y*20,m);
 ctx.restore();
 ctx.save();
 ctx.translate(ship.x,ship.y);ctx.rotate(.78);ctx.scale(scale,scale);
 ctx.globalAlpha=1-clamp((blast-.4)/2.8,0,1);
 FLAGSHIP_HULL.forEach(([x,y,type],index)=>{
  const separation=reduceMotion?0:blast*(24+index%5*7);
  const a=index*2.4;
  drawModule(ctx,x*20+Math.cos(a)*separation,y*20+Math.sin(a)*separation,{type,hp:types[type].hp});
 });
 ctx.restore();
 if(blast>0&&blast<2.5&&!reduceMotion){
  ctx.save();ctx.translate(ship.x,ship.y);ctx.globalAlpha=1-blast/2.5;ctx.strokeStyle='#fff';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,(8+blast*(54+i*26))*scale,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#fff';
  for(let i=0;i<64;i++){
   const a=i*2.399,range=blast*(30+i%13*12)*scale;
   ctx.fillRect(Math.cos(a)*range,Math.sin(a)*range,i%4===0?3:1,i%4===0?3:1);
  }
  ctx.restore();
 }
 if(time>4.1){
  ctx.save();ctx.globalAlpha=clamp((time-4.1)/1.2,0,1);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();
 }
}

function launchShip(id) {
 const launch=launchState(),ship=STARTER_SHIPS[id];
 if(!Object.hasOwn(STARTER_SHIPS,id)||!['yard','replacement'].includes(launch.phase))return false;
 const initial=launch.phase==='yard';
 s.modules=ship.modules().map(m=>({...m,issued:true}));
 s.hullCapacity=capacity(s);s.lostModules=[];s.dead=false;
 if(initial) {
  beginAct();
  launch.debt=STARTER_DEBT;
  launch.dueAt=s.stats.time+DEBT_TIME;
 } else {
  s.energy=100;s.heat=0;s.overheated=false;s.braking=false;s.hitFlash=0;s.impactCooldown=0;
  s.campaign.shield=s.campaign.shieldDelay=0;
  delete s.nav;cancelPilot();lockDockSecurity();
  actState().cruise=false;delete actState().dash;s.dashCooldown=0;
  bullets=[];fx=[];mining=0;aimedCell=null;selectedSalvage=null;
  targetLock=null;targetInRange=false;touchHeading=null;mouse.seen=false;currentContact=null;
  resetPresentation();
 }
 launch.phase='flying';launch.ship=id;
 paused=false;renderPauseButton();
 $('flightHud').hidden=false;
 closeModal();renderDebtHud();save(false);
 log((initial?'Стартовый корабль: ':'Корабль заменён: ')+ship.name+'.');
 if(!initial)toast('Новый корабль готов к полёту');
 return true;
}

function returnToShipyard() {
 if(!s.launch)normalizeLaunch(s);
 s.dead=true;
 launchState().phase='replacement';
 const home=PLACES[0];
 s.x=home.x+150;s.y=home.y;
 s.angle=Math.PI/2;s.vx=s.vy=s.angularVelocity=0;
 s.hitFlash=0;
 resetPresentation();
 renderLaunch();
 save(false);
}

function checkDebtDeadline() {
 if(!debtBalance()||debtRemaining()>1e-7)return false;
 launchState().phase='default';
 cancelPilot();
 renderLaunch();
 save(false);
 return true;
}

function applyDebtPayment(credits) {
 if(launchState()?.phase!=='flying')return 0;
 const payment=Math.min(debtBalance(),credits);
 if(!payment)return 0;
 launchState().debt-=payment;
 if(!debtBalance()){
  launchState().dueAt=null;
  log('Долг верфи полностью погашен.');
 }
 return payment;
}

function debtStatus() {
 return debtBalance()+' кр. · '+formatDebtTime(debtRemaining());
}

function renderDebtHud() {
 const hud=$('loanHud');
 hud.hidden=!debtBalance();
 if(hud.hidden)return;
 setHudText('loanBalance',debtStatus());
 hud.classList.toggle('dueSoon',debtRemaining()<=120);
}

$('loanHud').onclick=()=>{if(!modal&&!s.dead&&debtBalance())approach(PLACES[0]);};

function renderDockDebt(place,root) {
 if(!debtBalance())return;
 const line=document.createElement('div');
 line.className='dockDebt';
 const summary=document.createElement('p');
 summary.textContent='Долг верфи '+debtStatus()+'. Выручка от продаж идёт в счёт долга.';
 const amount=Math.min(debtBalance(),s.campaign.credits);
 line.appendChild(summary);
 if(place.kind==='station')line.appendChild(button('Внести '+amount+' кр. со счёта',()=>{
  if(!canInteract(place)||currentContact!==place.id)return;
  const paid=applyDebtPayment(Math.min(amount,s.campaign.credits));
  if(!paid)return;
  s.campaign.credits-=paid;
  save(false);renderContact();renderDebtHud();
  toast(debtBalance()?'Долг уменьшен на '+paid+' кр.':'Долг верфи погашен');
 },amount===0));
 root.appendChild(line);
}
