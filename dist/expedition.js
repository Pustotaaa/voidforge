'use strict';
// One persistent world. All economy and progression state is stored with the ship.
const REGIONS=[
 {id:'harbor',name:'ПРИЧАЛ',x:0,y:0,r:520,tag:'Свободный порт',text:'Безопасная гавань, торговля и отправная точка экспедиции.',pattern:'rings'},
 {id:'rust',name:'РЖАВЫЙ ПОЯС',x:-1500,y:-650,r:820,tag:'Промышленная зона',text:'Плотные залежи руды. Здесь дешевле металл и детали, но тесно для тяжёлого корабля.',pattern:'stripes'},
 {id:'nebula',name:'СТЕКЛЯННАЯ ТУМАННОСТЬ',x:1350,y:-1550,r:780,tag:'Ионные возмущения',text:'Богата кристаллами. Ионные всплески нагревают корпус, щиты не восстанавливаются.',pattern:'cloud'},
 {id:'grave',name:'КЛАДБИЩЕ КОРАБЛЕЙ',x:-1600,y:1450,r:820,tag:'Реликты и обломки',text:'Остовы погибшего флота. Их разборка приносит сплав и исследовательские данные.',pattern:'wreck'},
 {id:'ice',name:'БЕЛЫЙ САД',x:1500,y:1450,r:760,tag:'Ледяной пояс',text:'Лёд, кристаллические глыбы и холодная пыль. Радиаторы здесь работают на 50% эффективнее.',pattern:'ice'},
 {id:'rift',name:'РАЗЛОМ',x:1950,y:150,r:640,tag:'Гравитационная аномалия',text:'Слабое гравитационное поле затягивает корабль к разлому. Пиратский флагман охраняет древние врата.',pattern:'rift'}
];
REGIONS.push(
 {id:'storm',name:'ИОННЫЙ ГРЕБЕНЬ',x:545,y:-2240,r:445,tag:'Штормовой фронт',text:'Всплески нагревают корпус и снижают выработку энергии.',pattern:'cloud'},
 {id:'silence',name:'ТИХИЙ КРАЙ',x:-220,y:2350,r:470,tag:'Сенсорная тень',text:'Пассивный обзор сокращён. Для дальних отметок используйте импульс.',pattern:'wreck'}
);
const PLACES=[
 {id:'home',kind:'station',name:'ПРИЧАЛ',x:-140,y:80,npc:'Лея Восс',role:'Диспетчер Свободного порта',text:'Смотритель перекрыл врата. Найдите три реликта и снимите блокаду. Ключ к вратам останется в его обломках. Ваш маршрут — в журнале.',market:'home'},
 {id:'forge',kind:'station',name:'ЛИТЕЙНАЯ',x:-1650,y:-650,npc:'ОРС-4',role:'Промышленный координатор',text:'Линии производства работают. Нам нужен сплав, а исследовательской станции — наши детали. За доставку платят лучше, чем за простой сбор металлолома.',market:'forge'},
 {id:'atlas',kind:'station',name:'АТЛАС',x:1150,y:-1680,npc:'Доктор Нил',role:'Хранитель архива',text:'Врата не создают новый мир. Они соединяют две точки этого сектора. Три реликта хранят фрагменты настройки. Изучите резонанс, и мы сможем восстановить связь.',market:'atlas'},
 {id:'relic1',kind:'relic',name:'ОСТОВ «ОРИОНА»',x:-2050,y:1750,region:'grave',lore:'Бортовой архив: флот пытался эвакуироваться через западные врата. Первый фрагмент координат восстановлен.'},
 {id:'relic2',kind:'relic',name:'МАЯК «ЭХО»',x:1600,y:-2150,region:'nebula',lore:'В журнале маяка найден стабильный резонанс. Туманность нарушает работу щитов, но не уничтожает сам канал.'},
 {id:'relic3',kind:'relic',name:'ЗАБЫТЫЙ КОВЧЕГ',x:1850,y:1950,region:'ice',lore:'Ковчег сохранил третью часть координат. Обе точки перехода лежат в Чёрном секторе. Сеть можно запустить снова.'},
 {id:'gateEast',kind:'gate',name:'ВОСТОЧНЫЕ ВРАТА',x:2100,y:300,peer:'gateWest'},
 {id:'gateWest',kind:'gate',name:'ЗАПАДНЫЕ ВРАТА',x:-2200,y:1250,peer:'gateEast'}
];
const TECHS=[
 {id:'survey',name:'Бортовой сканер',icon:'target',row:0,col:2,requires:[],data:0,crystal:0,credits:0,desc:'Различает руду, кристаллы и военные обломки. Показывает состав залежей на карте.'},
 {id:'geology',name:'Спектральная добыча',icon:'mine',row:1,col:1,requires:['survey'],data:15,crystal:8,credits:80,desc:'+4 ресурса за импульс добычи. Открывает глубокое бурение.'},
 {id:'capacitors',name:'Энергоконтуры',icon:'reactor',row:1,col:2,requires:['survey'],data:20,crystal:10,credits:110,desc:'+25% выработки энергии. Даёт доступ к щитам и рельсотрону.'},
 {id:'ionDrive',name:'Ионная тяга',icon:'ion',row:1,col:3,requires:['survey'],data:25,crystal:14,credits:150,desc:'Открывает ионный двигатель. Больше тяги при меньшей массе.'},
 {id:'drilling',name:'Глубокое бурение',icon:'build',row:2,col:1,requires:['geology'],data:24,crystal:12,credits:100,desc:'Открывает модуль «Бур». С ним можно вскрывать плотные жилы и получать данные с глубоких кристаллических залежей.'},
 {id:'shields',name:'Полевой щит',icon:'shield',row:2,col:2,requires:['capacitors'],data:30,crystal:16,credits:170,desc:'Открывает генератор щита. Он защищает корпус и потребляет энергию при восстановлении.'},
 {id:'railgun',name:'Рельсотрон',icon:'rail',row:2,col:3,requires:['capacitors'],data:35,crystal:20,credits:210,desc:'Открывает дальнобойное орудие. 65 урона, выстрел требует 14 энергии.'},
 {id:'warp',name:'Резонанс врат',icon:'gate',row:3,col:2,requires:['geology','ionDrive'],data:45,crystal:25,credits:230,desc:'Позволяет восстановить врата с командным ключом Смотрителя, сплавом и кристаллами.'}
];
const CONTRACTS=[
 {id:'metal',issuer:'forge',title:'Сырьё для верфи',desc:'Доставить 80 сплава на Литейную.',item:'ore',amount:80,credits:280,data:20},
 {id:'parts',issuer:'atlas',title:'Научная посылка',desc:'Доставить 4 детали на Атлас. Их выгодно покупать на Литейной.',item:'parts',amount:4,credits:320,data:25},
 {id:'bounty',issuer:'home',title:'Разорвать блокаду',desc:'Устранить Клинка, Бастиона и Стража врат. Отчитаться на Причале.',kills:3,credits:550,data:35}
];
const GOODS={ore:{name:'Сплав',unit:'ед.',mass:.025,space:1,stock:350,restock:50,icon:'mine'},crystal:{name:'Кристаллы',unit:'ед.',mass:.04,space:1,stock:120,restock:15,icon:'crystal'},parts:{name:'Детали',unit:'шт.',mass:.5,space:10,stock:25,restock:4,icon:'parts'}};
const PRICES={home:{ore:[4,2],crystal:[10,7],parts:[45,33]},forge:{ore:[3,2],crystal:[12,9],parts:[30,22]},atlas:{ore:[6,4],crystal:[8,5],parts:[50,38]},merchant:{ore:[5,3],crystal:[11,7],parts:[42,30]}};
Object.assign(types,{
 cargo:{name:'Грузовой отсек',cost:50,hp:95,symbol:'▣',mass:7,desc:'+200 единиц трюма. Груз увеличивает массу корабля: перегруженный транспорт медленнее разгоняется.'},
 ion:{name:'Ионный двигатель',cost:95,hp:85,symbol:'»',mass:5,tech:'ionDrive',desc:'10 000 единиц тяги при массе 5 т. Работает вместе с обычными двигателями.'},
 shield:{name:'Генератор щита',cost:110,hp:85,symbol:'◌',mass:10,tech:'shields',desc:'+90 щита. Восстанавливается спустя 3 секунды без попаданий, расходуя энергию. Не заряжается в ионной туманности.'},
 drill:{name:'Бур',cost:75,hp:70,symbol:'▧',mass:8,tech:'drilling',desc:'Открывает плотные жилы и ускоряет добычу. Держите в запасе энергию и радиаторы.'},
 pylon:{name:'Излучатель',cost:0,hp:135,mass:14,npcOnly:true},
 bossCore:{name:'Ядро Смотрителя',cost:0,hp:285,mass:32,npcOnly:true},
 rail:{name:'Рельсотрон',cost:140,hp:95,symbol:'⇈',mass:15,tech:'railgun',desc:'65 урона, 1400 м дальности. Выстрел требует 14 энергии, даёт 20 тепла и отдачу.'}
});
Object.assign(types.armor,{mass:12});Object.assign(types.gun,{mass:8});Object.assign(types.engine,{mass:8});Object.assign(types.reactor,{mass:15});Object.assign(types.cooler,{mass:5});
let currentContact=null,journalTab='mission',tradeQty=10,contactTab='trade';
const zoneAt=p=>REGIONS.find(r=>r.id!=='harbor'&&(!['storm','silence'].includes(r.id)||isStory())&&distance(p,r)<r.r)||(distance(p,REGIONS[0])<520?REGIONS[0]:{id:'void',name:'ОТКРЫТЫЙ КОСМОС',tag:'Нейтральное пространство'});
const hasTech=id=>s.campaign?.tech.includes(id);
const resourceAmount=key=>key==='ore'?s.ore:s.campaign[key];
function changeResource(key,n){if(key==='ore')s.ore+=n;else s.campaign[key]+=n;}
const cargoUsed=()=>Object.entries(GOODS).reduce((n,[item,good])=>n+resourceAmount(item)*good.space,0)+s.campaign.spareModules.length*SALVAGE_SPACE;
const cargoMax=()=>500+count('cargo')*200+(s.campaign.legacyCargo||0);
const isSafe=p=>PLACES.some(o=>o.kind==='station'&&distance(o,p)<280);
function shipPhysics(ship=s){
 const cargoMass=ship===s&&s.campaign?Object.entries(GOODS).reduce((n,[item,good])=>n+resourceAmount(item)*good.mass,0):0;
 return FlightCore.shipPhysics(ship,types,cargoMass,ship===s?s.campaign?.power:undefined);
}
function defaultNpcs(){return [
 {id:'merchant1',name:'МЕРИДИАН',kind:'merchant',x:-500,y:-300,route:['home','forge','atlas'],leg:1,angle:0,text:'Везу детали между портами. Могу продать запас прямо здесь, но на станциях обычно дешевле.'},
 {id:'merchant2',name:'ПИЛИГРИМ',kind:'merchant',x:800,y:-900,route:['atlas','home','forge'],leg:0,angle:0,text:'Пустой трюм не приносит прибыли. На Атласе готовы переплачивать за детали и металл.'},
 {id:'patrol',name:'ДОЗОР–7',kind:'patrol',x:180,y:200,route:['home','forge'],leg:0,angle:0,text:'Патрулирую торговую трассу. Если пираты приблизятся, открою огонь. Внутри станционного периметра вы под защитой.',cool:0},
 {id:'salvager',name:'ИСКРА',kind:'salvager',x:-1450,y:1400,route:['gateWest','relic1'],leg:0,angle:0,text:'Старые остовы хранят не только сплав. Разбирайте обломки — в них остаются исследовательские данные.'}
];}
function makeCampaign(d,upgradeWorld){
 const previous=d.campaign||{};
 d.campaign={version:1,credits:300+(d.kills||0)*150,crystal:0,parts:0,data:0,tech:[],discovered:['harbor'],scanned:[],contracts:{},gateReady:false,completed:false,gateCooldown:0,power:'balanced',assist:true,shield:0,shieldDelay:0,markets:{},npcs:defaultNpcs(),legacyCargo:Math.max(0,d.ore-500),...previous};
 const cc=d.campaign;
 for(const k of ['credits','crystal','parts','data','gateCooldown','shield','shieldDelay','legacyCargo'])if(!Number.isFinite(cc[k])||cc[k]<0)cc[k]=0;
 cc.tech=Array.isArray(cc.tech)?cc.tech.filter(id=>TECHS.some(t=>t.id===id)):[];cc.scanned=Array.isArray(cc.scanned)?cc.scanned.filter(id=>PLACES.some(p=>p.id===id&&p.kind==='relic')):[];cc.discovered=Array.isArray(cc.discovered)?cc.discovered.filter(id=>REGIONS.some(r=>r.id===id)):['harbor'];cc.contracts=cc.contracts&&typeof cc.contracts==='object'?cc.contracts:{};cc.markets=cc.markets&&typeof cc.markets==='object'?cc.markets:{};
 if(!Array.isArray(cc.npcs)||cc.npcs.length!==4||cc.npcs.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y)||!Array.isArray(n.route)))cc.npcs=defaultNpcs();
 if(!['balanced','engines','weapons','shields'].includes(cc.power))cc.power='balanced';
 d.angularVelocity=Number.isFinite(d.angularVelocity)?d.angularVelocity:0;d.braking=false;d.impactCooldown=0;delete cc.scan;d.won=!!cc.completed;
 if(upgradeWorld){
  for(const a of d.asteroids){const region=zoneAt(a);a.material=a.wreck?'salvage':region.id==='ice'||region.id==='nebula'?'crystal':'ore';}
  for(let z=1;z<REGIONS.length;z++){const region=REGIONS[z];for(let i=0;i<19;i++){const angle=(i*2.399+z),r=180+(i*73%480),x=clamp(region.x+Math.cos(angle)*r,-2550,2550),y=clamp(region.y+Math.sin(angle)*r,-2550,2550);if(PLACES.some(p=>distance(p,{x,y})<150))continue;d.asteroids.push({id:'zone-'+z+'-'+i,x,y,r:19+i%5*5,ore:45+i%6*10,seed:i+z,material:region.id==='ice'||region.id==='nebula'?'crystal':region.id==='grave'?'salvage':'ore',wreck:region.id==='grave'});}}
  d.enemies.forEach((e,i)=>{e.archetype=['skirmisher','tank','sniper'][i];e.home=[{x:-1250,y:-1150},{x:-1300,y:1450},{x:2050,y:100}][i];e.name=['КЛИНОК','БАСТИОН','СТРАЖ ВРАТ'][i];if(!e.dead){e.x=e.home.x;e.y=e.home.y;if(i===1){for(const m of [makeModule(-2,1,'armor'),makeModule(2,1,'armor'),makeModule(-2,-1,'armor'),makeModule(2,-1,'armor')])if(!e.modules.some(n=>n.x===m.x&&n.y===m.y))e.modules.push(m);}if(i===2){const gun=e.modules.find(m=>m.type==='gun');if(gun){gun.type='rail';gun.hp=95;}}}});
 }
 for(const a of d.asteroids)if(!a.material)a.material=a.wreck?'salvage':'ore';
 d.enemies.forEach((e,i)=>{e.archetype=e.archetype||['skirmisher','tank','sniper'][i];e.home=e.home||{x:e.x,y:e.y};e.vx=e.vx||0;e.vy=e.vy||0;});
 return restoreDepth(d);
}
function allContacts(){return [...PLACES,...s.campaign.npcs,...signals()];}
function nearestContact(){return allContacts().filter(p=>distance(s,p)<(p.kind==='gate'?260:235)).sort((a,b)=>distance(s,a)-distance(s,b))[0]||null;}
function canInteract(p){return p&&!s.dead&&distance(s,p)<(p.kind==='gate'?260:235);}
function approach(p){const dist=distance(s,p),margin=p.kind==='gate'?200:170;if(canInteract(p)&&Math.hypot(s.vx,s.vy)<=55){openContact(p);return;}const dx=s.x-p.x,dy=s.y-p.y,n=Math.hypot(dx,dy)||1;setDestination(p.x+dx/n*margin,p.y+dy/n*margin);s.campaign.approach=p.id;toast('Курс: '+p.name+'. Вблизи нажмите «Связь».');}
function doTrade(item,side,quantity) {
 const place=allContacts().find(p=>p.id===currentContact);
 if(!canInteract(place)||!['station','merchant'].includes(place.kind)||!Object.hasOwn(GOODS,item))return false;
 const stock=stationMarket(place.id),total=marketOrder(place,item,side,quantity,stock[item]);
 let payment=0;
 if(!Number.isFinite(total))return false;
 if(side==='buy') {
  if(stock[item]<quantity||s.campaign.credits<total||freeFor(item)<quantity)return false;
  s.campaign.credits-=total;spendAct('credits',total);changeResource(item,quantity);stock[item]-=quantity;
 } else {
  if(resourceAmount(item)<quantity)return false;
  payment=applyDebtPayment(total);
  s.campaign.credits+=total-payment;changeResource(item,-quantity);stock[item]+=quantity;
 }
 save(false);renderContact();toast((side==='buy'?'Куплено: ':'Продано: ')+quantity+' · '+GOODS[item].name+' · '+total+' кр.'+(payment?(debtBalance()?' · в счёт долга '+payment+' кр.':' · долг погашен'):''));return true;
}
function researchTech(id){const t=TECHS.find(t=>t.id===id),cc=s.campaign;if(!t||hasTech(id)||!t.requires.every(hasTech)||cc.data<t.data||cc.crystal<t.crystal||cc.credits<t.credits)return false;cc.data-=t.data;cc.crystal-=t.crystal;cc.credits-=t.credits;spendAct('data',t.data);spendAct('crystal',t.crystal);spendAct('credits',t.credits);cc.tech.push(id);save(false);renderResearch();toast('Исследовано: '+t.name);log('Новая технология: '+t.name);return true;}
function contractStatus(q){return s.campaign.contracts[q.id]||'available';}
function contractReady(q){return q.kills?s.kills>=q.kills:resourceAmount(q.item)>=q.amount;}
function acceptContract(id){const q=CONTRACTS.find(q=>q.id===id);if(!q||contractStatus(q)!=='available'||!canInteract(PLACES.find(p=>p.id===q.issuer)))return false;s.campaign.contracts[id]='active';save(false);renderContact();toast('Контракт принят: '+q.title);return true;}
function completeContract(id){const q=CONTRACTS.find(q=>q.id===id),p=PLACES.find(p=>p.id===q?.issuer);if(!q||contractStatus(q)!=='active'||!contractReady(q)||!canInteract(p))return false;if(q.item)changeResource(q.item,-q.amount);s.campaign.credits+=q.credits;s.campaign.data+=q.data;s.campaign.contracts[q.id]='done';save(false);renderContact();toast('Контракт выполнен · +'+q.credits+' кр. · +'+q.data+' данных');return true;}
function startScan(id){const p=PLACES.find(p=>p.id===id&&p.kind==='relic');if(!canInteract(p)||!actCanScan(p)||s.campaign.scanned.includes(id))return false;cancelPilot();actScanStart(p);s.campaign.scan={id,progress:0,duration:isStory()&&id==='relic2'?20:isStory()?9:5};s.braking=true;closeModal();toast('Сканирование · '+s.campaign.scan.duration+' с. Оставайтесь в контуре.');return true;}
const gateCost=()=>isStory()?{ore:250,crystal:75,fee:180}:{ore:180,crystal:60,fee:0};
function gateRequirements() {
 const cost=gateCost(),check=[
  {label:'Резонанс врат исследован',ok:hasTech('warp')},{label:'Три реликта просканированы',ok:s.campaign.scanned.length===3},
  {label:'Блокада снята: '+s.kills+' / 3',ok:s.kills===3},{label:'Ключ Смотрителя извлечён',ok:s.campaign.commandCore},
  {label:cost.ore+' сплава',ok:s.ore>=cost.ore},{label:(cost.crystal+5)+' кристаллов с учётом перехода',ok:s.campaign.crystal>=cost.crystal+5}
 ];
 if(cost.fee)check.push({label:cost.fee+' кр. за разгон сети',ok:s.campaign.credits>=cost.fee});
 return check;
}
function repairGates() {
 const p=PLACES.find(p=>p.id===currentContact&&p.kind==='gate'),cost=gateCost();
 if(!canInteract(p)||s.campaign.gateReady||!gateRequirements().every(r=>r.ok))return false;
 s.ore-=cost.ore;s.campaign.crystal-=cost.crystal;s.campaign.credits-=cost.fee;
 for(const [key,value] of Object.entries(cost))spendAct(key==='fee'?'credits':key,value);
 s.campaign.gateReady=true;recordAct('gate:repair');save(false);renderContact();
 toast('Сеть врат восстановлена. Доступен переход.');
 return true;
}
function jumpGate() {
 const p=PLACES.find(p=>p.id===currentContact&&p.kind==='gate');
 if(!canInteract(p)||!s.campaign.gateReady||s.campaign.gateCooldown>0||s.campaign.crystal<5||s.energy<30)return false;
 const dest=PLACES.find(g=>g.id===p.peer),first=!s.campaign.completed;
 s.campaign.crystal-=5;spendAct('crystal',5);s.energy-=30;
 s.campaign.gateCooldown=12;s.x=dest.x+180;s.y=dest.y;s.vx=s.vy=0;s.braking=false;
 cancelPilot();bullets=[];fx=[];closeModal();jumpFeedback();
 s.campaign.completed=true;s.won=true;recordAct('gate:jump');save(false);
 if(first)showResult();else toast('Переход завершён: '+dest.name);
 return true;
}

const escapeHtml=t=>String(t).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function button(label,fn,disabled=false){const b=document.createElement('button');b.textContent=label;b.onclick=fn;b.disabled=disabled;return b;}
function balanceMarkup(){return '<span><b>'+s.campaign.credits+'</b> кредитов</span><span><b>'+s.ore+'</b> сплава</span><span><b>'+s.campaign.crystal+'</b> кристаллов</span><span><b>'+s.campaign.data+'</b> данных</span>';}
function routeTo(p){closeModal();approach(p);}
function renderJournal(){document.querySelectorAll('[data-journal]').forEach(b=>b.classList.toggle('active',b.dataset.journal===journalTab));const out=$('journalContent');out.replaceChildren();
 if(journalTab==='mission')renderMission(out);
 if(journalTab==='contracts'){for(const q of CONTRACTS){const card=document.createElement('article');card.className='contractCard';const status=contractStatus(q),p=PLACES.find(p=>p.id===q.issuer);card.innerHTML='<div class="eyebrow">'+p.name+' / '+({available:'ДОСТУПЕН',active:'ПРИНЯТ',done:'ВЫПОЛНЕН'}[status])+'</div><h3>'+q.title+'</h3><p>'+q.desc+'</p><p>Награда: '+q.credits+' кр. и '+q.data+' данных.</p>';if(status!=='done')card.appendChild(button(status==='active'&&contractReady(q)?'К месту сдачи':'Связаться с заказчиком',()=>routeTo(p)));out.appendChild(card);}}
 if(journalTab==='atlas'){const grid=document.createElement('div');grid.className='destinationGrid';for(const r of REGIONS){const el=document.createElement('article'),known=s.campaign.discovered.includes(r.id);el.className='destinationCard';el.innerHTML='<div class="eyebrow">'+(known?'РАЗВЕДАНО':'ИЗВЕСТНО ПО КАРТЕ')+' / '+r.tag+'</div><h3>'+r.name+'</h3><p>'+r.text+'</p>';el.appendChild(button('Курс в область',()=>{closeModal();setDestination(r.x,r.y);}));grid.appendChild(el);}out.appendChild(grid);}
}
function cargoGoods() {
 return Object.entries(GOODS).filter(([, good])=>good.space>0);
}
function cargoRow(icon, label, amount, item='') {
 return '<li data-material="'+item+'">'+iconMarkup(icon)+'<span>'+label+'</span><b>'+amount+'</b></li>';
}
function cargoGoodsRows(goods) {
 return goods.map(([item, good])=>cargoRow(good.icon, good.name, resourceAmount(item), item)).join('');
}
function renderCargoInventory() {
 const {credits, data, spareModules, commandCore}=s.campaign;
 const incoming=reservedCargo();
 $('cargoInventoryBalance').innerHTML=
  '<div class="cargoBar"><label>Трюм <b>'+cargoUsed()+' / '+cargoMax()+'</b></label>'+
  '<progress aria-label="Заполнение трюма" max="'+cargoMax()+'" value="'+cargoUsed()+'"></progress></div>'+
  '<div class="systemAccount"><span>Кредиты <b>'+credits+'</b></span><span>Данные <b>'+data+'</b></span>'+
  (incoming?'<span>Зарезервировано под доставку <b>'+incoming+'</b></span>':'')+'</div>';
 $('cargoInventoryGoods').innerHTML=cargoGoodsRows(cargoGoods());
 $('cargoInventoryAmmo').innerHTML=cargoGoodsRows(Object.entries(AMMUNITION));
 $('cargoInventoryTrophies').innerHTML=spareModules.map(module=>
  cargoRow('parts', escapeHtml(moduleName(module)), Math.ceil(module.hp)+' / '+moduleMaxHp(module)+' прочн.')
 ).join('')+(commandCore?cargoRow('relic', 'Командный ключ Смотрителя', '1'):'');
 $('cargoInventoryEmpty').hidden=Boolean(spareModules.length||commandCore);
}
$('holdHud').onclick=()=>{
 if(modal||s.dead)return;
 openModal('cargoModal');
 renderCargoInventory();
};
$('closeCargo').onclick=closeModal;

function renderSystems(){
 const ship=STARTER_SHIPS[launchState()?.ship];
 $('systemsShip').textContent=ship?ship.name+' / БОРТОВЫЕ СИСТЕМЫ':'БОРТОВЫЕ СИСТЕМЫ';
 renderIndustrialSystems();
 const p=shipPhysics(),boost=s.campaign.miningMode==='boost';
 $('miningMode').textContent=boost?'Форсаж':'Баланс';
 $('miningMode').setAttribute('aria-pressed',String(boost));
 $('miningModeInfo').textContent=boost?'Больше добычи, двойной нагрев и расход.':'Равномерная добыча с умеренным нагревом.';
 const countLine=cargoGoodsRows(cargoGoods());
 const metrics=[['Масса',p.mass.toFixed(1)+' т'],['Ускорение',Math.round(p.accel)+' м/с²'],['Скорость',Math.round(Math.hypot(s.vx,s.vy))+' м/с'],
  ['Модули',s.modules.length],['Макс. щит',count('shield')*90],['Груз в пути',reservedCargo()]];
 $('cargoSummary').innerHTML='<div class="systemAccount"><span>Кредиты <b>'+s.campaign.credits+'</b></span><span>Данные <b>'+s.campaign.data+'</b></span></div>'+
  '<div class="cargoBar"><label>Трюм <b>'+cargoUsed()+' / '+cargoMax()+'</b></label><progress max="'+cargoMax()+'" value="'+cargoUsed()+'"></progress></div>'+
  '<ul class="cargoManifest">'+countLine+'</ul><div class="systemMetrics">'+metrics.map(([label,value])=>'<span>'+label+'<b>'+value+'</b></span>').join('')+'</div>';
 const desc={balanced:'Стандартная тяга, стрельба и восстановление щита.',engines:'Тяга +30%. Пушки перезаряжаются медленнее (0,40 с).',weapons:'Урон +20%, интервал стрельбы 0,24 с. Восстановление щита вдвое медленнее.',shields:'Восстановление щита +60%. Интервал стрельбы увеличен до 0,42 с.'};$('powerDescription').textContent=desc[s.campaign.power];document.querySelectorAll('[data-power]').forEach(b=>b.classList.toggle('active',b.dataset.power===s.campaign.power));$('flightAssist').textContent='Стабилизация: '+(s.campaign.assist?'вкл':'выкл');$('flightAssist').setAttribute('aria-pressed',String(s.campaign.assist));}
function openContact(p){if(Math.hypot(s.vx,s.vy)>55){if(modal==='mapModal'||modal==='journalModal')closeModal();brake();toast('Торможение. Для связи снизьте скорость до 55 м/с и нажмите снова.');return;}if(!canInteract(p)){toast('Подлетите ближе к станции, NPC, руинам или вратам');return;}currentContact=p.id;contactTab='trade';cancelPilot();s.vx=s.vy=0;openModal('contactModal');if(p.kind==='station'){lockDockSecurity();save(false);}renderContact();}
function renderContact(){if(!currentContact)return;const p=allContacts().find(x=>x.id===currentContact);if(!p)return;$('contactTitle').textContent=p.name;$('contactSubtitle').textContent=p.kind==='station'?'СТАНЦИОННАЯ СВЯЗЬ':p.kind==='gate'?'ДРЕВНЯЯ ТРАНЗИТНАЯ СЕТЬ':p.kind==='relic'?'АРХЕОЛОГИЧЕСКИЙ ОБЪЕКТ':'БЛИЖНЯЯ СВЯЗЬ / NPC';const intro=$('contactIntro'),out=$('contactContent'),items=$('contactItems');
 const commercial=p.kind==='station'||p.kind==='merchant';
 $('contactGrid').classList.toggle('stationLayout',commercial);
 items.hidden=!commercial;out.replaceChildren();items.replaceChildren();
 if(p.kind==='signal') {
  actState().revealed[p.id]=true;
  const profile=SIGNAL_TYPES[p.signature];$('contactTitle').textContent=profile.title;$('contactSubtitle').textContent='ДАЛЬНИЙ СИГНАЛ';
  intro.innerHTML='<div class="npcPortrait">'+iconMarkup(profile.icon)+'</div><p>'+escapeHtml(profile.text)+'</p>';
  out.appendChild(button('Исследовать сигнал',()=>inspectSignal(p)));
  return;
 }
 if(p.kind==='station'||p.kind==='merchant'||p.kind==='patrol'||p.kind==='salvager')intro.innerHTML='<div class="npcPortrait">'+(p.kind==='station'?'◇':p.kind==='patrol'?'✳':'△')+'</div><div><b>'+escapeHtml(p.npc||p.name)+'</b><small>'+escapeHtml(p.role||({merchant:'Независимый торговец',patrol:'Патруль Союза',salvager:'Сборщик обломков'}[p.kind]))+'</small><p>«'+escapeHtml(p.text)+'»</p></div>';
 else intro.innerHTML='<div class="npcPortrait">'+(p.kind==='gate'?'◎':'⌘')+'</div><p>'+(p.kind==='gate'?'Парные врата связывают запад и восток этого мира. Сначала восстановите сеть, затем потратьте 5 кристаллов и 30 энергии на переход.':s.campaign.scanned.includes(p.id)?p.lore:'Реликт содержит фрагмент координат, 50 данных и 15 кристаллов. Оставайтесь в контуре до завершения сканирования.')+'</p>';
 if(p.kind==='station'||p.kind==='merchant'){
  const bal=document.createElement('div');bal.className='panelBalance';bal.innerHTML=balanceMarkup();out.appendChild(bal);
  if(p.kind==='station'){
   const services=document.createElement('div');services.className='dockServices';
   const dockAction=button('Ремонт корпуса',repair);
   dockAction.innerHTML=iconMarkup('repair')+'<span>Ремонт корпуса</span>';
   services.appendChild(dockAction);
   const status=document.createElement('small');
   status.textContent=dockSave?'Полёт сохранён в доке':'Контрольная точка в доке будет создана при сохранении';
   services.appendChild(status);out.appendChild(services);
  }
  renderDockDebt(p,out);
  const toolbar=document.createElement('div');toolbar.className='panelTabs stationTabs';
  toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Службы станции');
  for(const [tab,label,icon] of [['trade','Рынок','cargo'],['refinery','Переработка','build'],['contracts','Контракты','journal']]) {
   if(tab!=='trade'&&p.kind!=='station')continue;
   const b=button(label,()=>{contactTab=tab;renderContact();$('contact-'+tab)?.focus({preventScroll:true});});
   b.id='contact-'+tab;b.innerHTML=iconMarkup(icon)+'<span>'+label+'</span>';
   b.setAttribute('aria-pressed',String(contactTab===tab));b.classList.toggle('active',contactTab===tab);
   toolbar.appendChild(b);
  }
  out.appendChild(toolbar);
  if(contactTab==='trade'){
   if(p.kind==='merchant'&&(isStory()||actState().patrolsEnabled)&&!actState().resolved['trade:'+p.id]){
    const special=button('Редкая поставка · плазменная турель · 210 кр.',()=>{
     if(s.campaign.credits<210||actState().resolved['trade:'+p.id])return;
     actState().resolved['trade:'+p.id]=true;s.campaign.credits-=210;spendAct('credits',210);grantCacheTrophy('plasma',13);
     save(false);renderContact();
    },s.campaign.credits<210);special.classList.add('rareCargo');out.appendChild(special);
   }
   renderMarket(p,out,items);
  }
  else if(contactTab==='refinery')renderRefinery(p,items);
  else {for(const q of CONTRACTS.filter(q=>q.issuer===p.id)){const status=contractStatus(q),row=document.createElement('article');row.className='contractCard';row.innerHTML='<h3>'+q.title+'</h3><p>'+q.desc+'</p><p>'+q.credits+' кр. · '+q.data+' данных</p>';row.appendChild(button(status==='done'?'Выполнен':status==='available'?'Принять контракт':contractReady(q)?'Сдать контракт':'Условия ещё не выполнены',()=>status==='available'?acceptContract(q.id):completeContract(q.id),status==='done'||status==='active'&&!contractReady(q)));items.appendChild(row);}}
 }else if(p.kind==='relic'){const done=s.campaign.scanned.includes(p.id),room=freeCargo()>=15,allowed=actCanScan(p);
  if(done&&isStory()&&!actState().boons[p.id])out.appendChild(button('Выбрать протокол для Смотрителя',()=>showRelicReward(p)));
  else out.appendChild(button(done?'Архив изучен':!allowed?'Доступ откроется по сюжету':!room?'Освободите 15 мест в трюме':'Начать сканирование · '+(isStory()?(p.id==='relic2'?20:9):5)+' с',()=>startScan(p.id),done||!room||!allowed));}
 else if(p.kind==='gate'){if(!s.campaign.gateReady){const list=document.createElement('div');list.className='missionChecks';list.innerHTML=gateRequirements().map(r=>'<div><span>'+ (r.ok?'■':'□')+'</span>'+r.label+'</div>').join('');out.appendChild(list);out.appendChild(button('Восстановить сеть врат',repairGates,!gateRequirements().every(r=>r.ok)));}else{const text=document.createElement('p');text.textContent='Назначение: '+PLACES.find(x=>x.id===p.peer).name+'. '+(s.campaign.gateCooldown>0?'Охлаждение: '+Math.ceil(s.campaign.gateCooldown)+' с полёта. Закройте окно, чтобы продолжить время.':'Канал стабилен.');out.appendChild(text);out.appendChild(button('Совершить переход · 5 крист. / 30 энергии',jumpGate,s.campaign.gateCooldown>0||s.campaign.crystal<5||s.energy<30));}}
 else out.appendChild(button('Принято. Завершить связь',closeModal));
}
$('research').onclick=()=>{if(s.dead)return;openModal('researchModal');resetResearchView();renderResearch();};$('journal').onclick=()=>{if(s.dead)return;openModal('journalModal');renderJournal();};$('systems').onclick=()=>{if(s.dead)return;openModal('systemsModal');renderSystems();};
$('closeResearch').onclick=$('closeJournal').onclick=$('closeSystems').onclick=$('closeContact').onclick=closeModal;
$('interact').onclick=()=>{if(s.dead)return;const p=nearestContact();if(p)openContact(p);else openModal('mapModal');};
$('systemsHelp').onclick=()=>openModal('helpModal');$('flightAssist').onclick=()=>{s.campaign.assist=!s.campaign.assist;save(false);renderSystems();};
document.querySelectorAll('[data-power]').forEach(b=>b.onclick=()=>{s.campaign.power=b.dataset.power;save(false);renderSystems();});
document.querySelectorAll('[data-journal]').forEach(b=>b.onclick=()=>{journalTab=b.dataset.journal;renderJournal();});
addEventListener('keydown',e=>{if(e.repeat||modal||s.dead)return;if(e.code==='KeyF')$('interact').click();if(e.code==='KeyT')$('research').click();if(e.code==='KeyJ')$('journal').click();if(e.code==='KeyC')$('systems').click();});
// Force-limited steering, angular inertia, recoil and swept projectile collisions.
function turnTowards(ship,angle,dt,rate=shipPhysics(ship).turn){return FlightCore.turnTowards(ship,angle,dt,rate);}
const accelerate=FlightCore.accelerate;
function collidePlayer(dt){
 const objects=[...s.asteroids.filter(isExtractable),...PLACES.filter(p=>p.kind==='station').map(p=>({...p,r:65}))];
 FlightCore.collide(s,shipPhysics(),objects,dt,(module,damage)=>{
  hit(s,module,damage);
  if(!s.dead)toast('Столкновение! Снизьте скорость.');
 });
}
const turretBearing=FlightCore.targetBearing;
const leadInCone=FlightCore.leadInCone;
function canTrackTarget(enemy) {
 const target=weaponTarget(enemy),velocity={x:s.vx,y:s.vy};
 return s.modules.some(m=>WEAPONS[m.type]&&operational(m)&&groupAllows(WEAPONS[m.type])&&leadInCone(s,position(s,m),WEAPONS[m.type],target,velocity)!==null);
}
function fire(ship,enemy,lock=null) {
 const pressure=enemy&&isStory()?(ship.archetype==='scout'?1.52:ship.archetype==='sniper'?1.60:1.48):1;
 const shots=FlightCore.fire(ship,ship===s?s.campaign:ship,WEAPONS,shipPhysics(ship).mass,{
  enemy,lock,pressure,onShot:(point,gun,angle)=>fireFeedback(point,gun,angle,ship)
 });
 bullets.push(...shots);
 if(!enemy&&shots.length){s.stats.shots+=shots.length;playSound(shots.some(shot=>shot.rail)?'rail':'shot');}
 return shots.length;
}
function updateEnergy(ship,dt,region){
 FlightCore.updateEnergy(ship,ship===s?s.campaign:ship,dt,region.id,clock,ship===s&&hasTech('capacitors'));
}
function updateEnemies(dt) {
 const engaged=new Set(s.enemies.filter(e=>e.squad&&!e.dead&&distance(s,e)<810).map(e=>e.squad));
 for(const e of s.enemies) {
  if(e.dead||!actEnemyReady(e))continue;
  if(e.archetype==='drone'){moveDrone(e,dt);continue;}
  if(e.archetype==='boss') {updateBoss(e,dt);continue;}
  const order=ENEMY_INFO[e.archetype]??ENEMY_INFO.skirmisher, d=distance(s,e), home=e.home||e;
  updateEnergy(e,dt,zoneAt(e));
  const coordinated=Boolean(e.squad&&engaged.has(e.squad));
  const leash=e.archetype==='scout'?1200:820;
  const fromHome=distance(e,home);
  if(fromHome>leash)e.withdrawing=true;
  if(fromHome<leash*.65)e.withdrawing=false;
  const alert=!e.withdrawing&&d<(coordinated?1350:Math.max(900,order.attack+150))&&!isSafe(s);
  let vx=0,vy=0,aim=e.angle;
  enemySystems(e,dt,alert);
  const unarmed=!e.modules.some(m=>WEAPONS[m.type]&&operational(m))&&!activeCount('mineRack',e)&&!activeCount('repairBeam',e);
  const propulsion=activeCount('engine',e)+activeCount('ion',e);
  if(!propulsion&&(isStory()||e.patrolActor)){e.x=clamp(e.x+e.vx*dt,-LIMIT,LIMIT);e.y=clamp(e.y+e.vy*dt,-LIMIT,LIMIT);e.vx*=1-dt*.08;e.vy*=1-dt*.08;continue;}
  if(alert) {
   const nx=(s.x-e.x)/(d||1),ny=(s.y-e.y)/(d||1);
   const retreat=unarmed||(e.archetype==='scout'&&e.modules.length<=2)||(coordinated&&e.modules.length<=4);
   const radial=retreat?-order.speed:clamp((d-order.range)*.55,-order.speed,order.speed);
   const strafe=e.archetype==='scout'?70:e.archetype==='skirmisher'?45*Math.sin(clock*.8+e.home.x):coordinated?(e.wing||0)*32:0;
   vx=nx*radial-ny*strafe; vy=ny*radial+nx*strafe;
   aim=turretBearing(e,s,{x:e.vx,y:e.vy},e.archetype==='sniper'?1000:e.archetype==='bomber'?380:e.archetype==='striker'?530:620)+Math.PI/2;
  } else if(fromHome>90) {
   const speed=e.withdrawing?Math.max(60,order.speed):50;
   vx=(home.x-e.x)/fromHome*speed;vy=(home.y-e.y)/fromHome*speed;
   aim=Math.atan2(vy,vx)+Math.PI/2;
  }
  const physics=shipPhysics(e);
  accelerate(e,vx,vy,physics.accel*.55,dt);
  e.x=clamp(e.x+e.vx*dt,-LIMIT,LIMIT); e.y=clamp(e.y+e.vy*dt,-LIMIT,LIMIT);
  const error=turnTowards(e,aim,dt,physics.turn*.7);
  e.cool-=dt;
  if(alert&&!unarmed&&d<order.attack&&error<.18&&e.cool<=0) {fire(e,true);e.cool=order.cool*(isStory()?.9:1);}
 }
}
function updateNpcs(dt){for(const n of s.campaign.npcs){const goal=PLACES.find(p=>p.id===n.route[n.leg%n.route.length]);if(!goal)continue;const d=distance(n,goal);if(d<120){n.leg=(n.leg+1)%n.route.length;continue;}const speed=n.kind==='patrol'?65:n.kind==='merchant'?48:30;n.x+=(goal.x-n.x)/d*speed*dt;n.y+=(goal.y-n.y)/d*speed*dt;n.angle=Math.atan2(goal.y-n.y,goal.x-n.x)+Math.PI/2;if(n.kind==='patrol'){n.cool=(n.cool||0)-dt;const target=s.enemies.find(e=>!e.dead&&distance(e,n)<550);if(target&&n.cool<=0){const a=Math.atan2(target.y-n.y,target.x-n.x);bullets.push({x:n.x,y:n.y,vx:Math.cos(a)*600,vy:Math.sin(a)*600,life:1.1,enemy:false,npc:true,damage:10});n.cool=.8;}}}}
function manualInput() {
 const x=Number(!!(keys.KeyD||keys.ArrowRight))-Number(!!(keys.KeyA||keys.ArrowLeft))+stick.x;
 const y=Number(!!(keys.KeyS||keys.ArrowDown))-Number(!!(keys.KeyW||keys.ArrowUp))+stick.y;
 const scale=Math.max(1,Math.hypot(x,y));
 return {x:x/scale,y:y/scale};
}
function manualHeading() {
 if (mouse.seen) {
  const at=viewAt(mouse.x,mouse.y);
  const dx=at.x-flightPose.x,dy=at.y-flightPose.y;
  if(Math.hypot(dx,dy)*view.zoom>12)return Math.atan2(dy,dx)+Math.PI/2;
 }
 return touchHeading ?? s.angle;
}
function followCourse(phys, maxSpeed, dt) {
 const point=courseWaypoint(s.destination,phys);
 if(!point) {
  cancelPilot();s.braking=true;
  toast('Маршрут перекрыт. Выберите другую точку на карте.');
  return;
 }
 const range=distance(s,point);
 if (range<12 && Math.hypot(s.vx,s.vy)<12) {
  s.x=point.x; s.y=point.y; s.vx=s.vy=0;
  flightRoute=null;delete s.destination;
   const task=courseTask();
  if(task&&distance(s,task.center)>=task.range) {
   cancelPilot();toast('Цель закрыта препятствиями. Попробуйте подлететь с другой стороны.');
  } else if(!task)toast('Точка назначения достигнута');
  return;
 }
 FlightCore.followPoint(s,point,phys,maxSpeed,dt);
}
function applyManualFlight(input,phys,maxSpeed,dt) {
 FlightCore.applyManualFlight(s,input,manualHeading(),s.campaign.assist,phys,maxSpeed,dt);
}
function update(dt) {
 clock+=dt;
 if (paused||modal||s.dead) return;
 s.stats.time+=dt;
 if(checkDebtDeadline())return;
 s.hitFlash=Math.max(0,(s.hitFlash||0)-dt);
 mining-=dt;
 const cc=s.campaign, region=zoneAt(s), phys=shipPhysics();
 cc.gateCooldown=Math.max(0,cc.gateCooldown-dt);
 updateEnergy(s,dt,region);
 updateIndustry(dt);
 if (region.id!=='void'&&!cc.discovered.includes(region.id)) {
  cc.discovered.push(region.id); cc.data+=8; cc.credits+=60;
  toast('Открыто: '+region.name+' · +8 данных · +60 кр.');
  log('Новая область: '+region.name);
 }
 const input=manualInput(), manual=Math.hypot(input.x,input.y)>.02;
 if (manual) {const scan=isStory()?cc.scan:undefined;cancelPilot();if(scan)cc.scan=scan; s.braking=false;}
 if (cc.approach) {
  const p=allContacts().find(p=>p.id===cc.approach);
  if (p) {
   if (canInteract(p)&&Math.hypot(s.vx,s.vy)<55) { flightRoute=null;delete s.destination; delete cc.approach; s.braking=true; toast('Связь доступна: '+p.name); }
   else if (!s.destination || !PLACES.includes(p)) { const d=distance(s,p); s.destination={x:p.x+(s.x-p.x)/d*170,y:p.y+(s.y-p.y)/d*170}; }
  }
 }
 const resource=s.asteroids.find(a=>a.id===s.miningId&&isExtractable(a));
 if (resource) {
  const d=distance(s,resource);
  if (d<MINE_RANGE) {
   flightRoute=null;delete s.destination; s.braking=true;
   if(Math.hypot(s.vx,s.vy)<35)updateMining(resource,dt);
  }
  else if (!s.destination&&d>=MINE_RANGE) {
   s.destination={x:resource.x+(s.x-resource.x)/(d||1)*225,y:resource.y+(s.y-resource.y)/(d||1)*225};
   s.braking=false;
  }
 }
 const maxSpeed=cruiseLimit(dt,manual,FlightCore.speedLimit(phys));
 if (s.destination) followCourse(phys,maxSpeed,dt);
 else if (s.braking) {
  accelerate(s,0,0,phys.accel*1.4,dt);
  if (Math.hypot(s.vx,s.vy)<1.5) { s.vx=s.vy=0; s.braking=false; }
  if (!s.miningId&&!cc.scan) turnTowards(s,manualHeading(),dt,phys.turn);
 } else applyManualFlight(input,phys,maxSpeed,dt);

 if (region.id==='rift'&&!cc.gateReady) {
  const r=distance(s,region)||1;
  s.vx+=(region.x-s.x)/r*9*dt; s.vy+=(region.y-s.y)/r*9*dt;
 }
 updateDash(dt);
 FlightCore.integrate(s,dt);
 updateTargetedFire();
 targetLock=autoAim?nearestTarget(true):null;
 targetInRange=Boolean(targetLock||autoAim&&nearestTarget());
 if((mouse.down||keys.fire)&&!s.overheated)fire(s,false,weaponTarget(targetLock));
 collidePlayer(dt);if(s.dead)return;updateEnemies(dt);updateNpcs(dt);updateProjectiles(dt);if(s.dead)return;
 refreshAct(dt);if(s.dead)return;
 if(cc.scan) {
  const scan=cc.scan,p=PLACES.find(p=>p.id===scan.id);
  if(!p||distance(s,p)>(isStory()?265:235)) {
   delete cc.scan;toast('Сканирование прервано. Вернитесь в контур.');
  } else if(isStory()||Math.hypot(s.vx,s.vy)<25) {
   scan.progress+=dt;
   if(scan.progress>=scan.duration) {
    delete cc.scan;
    if(!cc.scanned.includes(p.id)&&freeCargo()>=15) {
     cc.scanned.push(p.id);cc.data+=50;cc.crystal+=15;
     actScanned(p);save(false);log(p.lore);toast('Архив изучен · +50 данных · +15 кристаллов');
    } else toast('Освободите 15 мест в трюме и повторите сканирование.');
   }
  }
 }
 fx.forEach(f=>f.t-=dt);fx=fx.filter(f=>f.t>0);
}


function placeSymbol(p){return p.kind==='gate'?'◎':p.kind==='relic'?'⌘':p.kind==='station'?'◇':'△';}
function drawExpeditionWorld(){if(!s.campaign)return;const region=zoneAt(s);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=1;
 if(region.id==='nebula'||region.id==='storm'){for(let i=0;i<14;i++){const x=region.x+Math.sin(i*2.4)*region.r*.75,y=region.y+Math.cos(i*3.1)*region.r*.7;ctx.setLineDash([1,7]);ctx.beginPath();ctx.ellipse(x,y,100+i%4*35,60+i%3*30,i*.8,0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);}
 if(region.id==='ice'){for(let i=0;i<24;i++){const x=region.x+Math.sin(i*4.7)*region.r,y=region.y+Math.cos(i*1.7)*region.r;ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();}}
 if(region.id==='grave'){for(let i=0;i<12;i++){const x=region.x+Math.sin(i*2.7)*region.r,y=region.y+Math.cos(i*1.9)*region.r;ctx.save();ctx.translate(x,y);ctx.rotate(i);ctx.setLineDash([5,8]);ctx.strokeRect(-26,-60,52,120);ctx.strokeRect(-45,-20,90,40);ctx.restore();}}
 if(region.id==='rift'){ctx.save();ctx.translate(region.x,region.y);ctx.rotate(clock*.025);for(let i=0;i<5;i++){ctx.setLineDash([2+i*2,16]);ctx.beginPath();ctx.ellipse(0,0,90+i*65,40+i*30,i*.3,0,Math.PI*2);ctx.stroke();}ctx.restore();}
 ctx.setLineDash([]);
 for(const p of PLACES) {
  if(Math.abs(p.x-view.x)>W/view.zoom/2+290||Math.abs(p.y-view.y)>H/view.zoom/2+290)continue;
  ctx.save();ctx.translate(p.x,p.y);
  if(!drawPortArtwork(p)){
   ctx.strokeRect(-43,-43,86,86);ctx.strokeRect(-23,-23,46,46);
   ctx.fillRect(-5,-5,10,10);
  }
  if(p.kind==='station'){
   ctx.setLineDash([1,12]);ctx.beginPath();ctx.arc(0,0,280,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  if(p.kind==='gate')drawGateOrbit(s.campaign.gateReady);
  if(p.kind==='relic'&&!s.campaign.scanned.includes(p.id)){
   const spin=reduceMotion?0:renderTime*.34;
   ctx.setLineDash([1,7]);ctx.beginPath();ctx.arc(0,0,72,spin,spin+Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText(placeSymbol(p)+' '+p.name,p.x-67,p.y+111);
  if(distance(s,p)<235){ctx.font='10px monospace';ctx.fillText('[F] СВЯЗЬ',p.x-30,p.y+128);}
 }
 for(const n of s.campaign.npcs){if(Math.abs(n.x-s.x)>W/2+70||Math.abs(n.y-s.y)>H/2+70)continue;ctx.save();ctx.translate(n.x,n.y);ctx.rotate(n.angle);ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(18,17);ctx.lineTo(0,10);ctx.lineTo(-18,17);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeRect(-5,-6,10,18);ctx.restore();ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.fillText('△ '+n.name,n.x-32,n.y+36);}
 if(count('shield')&&s.campaign.shield>0){ctx.setLineDash([3,7]);ctx.beginPath();ctx.arc(s.x,s.y,shipPhysics().radius+12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
 if(s.campaign.scan){const p=PLACES.find(p=>p.id===s.campaign.scan.id);if(p){ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeRect(p.x-45,p.y-85,90,5);ctx.fillRect(p.x-45,p.y-85,90*clamp(s.campaign.scan.progress/s.campaign.scan.duration,0,1),5);}}
 const dest=s.destination;if(dest){ctx.font='10px monospace';ctx.fillText(Math.round(distance(s,dest))+' М',s.x+25,s.y+55);}
}
function drawExpeditionMini(){if(!s.campaign)return;mini.fillStyle='#fff';mini.strokeStyle='#fff';for(const p of PLACES){const x=95+p.x/32,y=90+p.y/32;if(p.kind==='gate'){mini.beginPath();mini.arc(x,y,4,0,Math.PI*2);mini.stroke();}else if(p.kind==='relic'){mini.strokeRect(x-2,y-2,4,4);}else{mini.fillRect(x-2,y-2,5,5);}}for(const n of s.campaign.npcs){mini.fillRect(95+n.x/32,90+n.y/32,2,2);}}
