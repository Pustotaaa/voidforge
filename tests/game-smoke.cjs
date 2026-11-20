const {createRuntime}=require('./runtime.cjs');
const {run,els,sectorRect}=createRuntime();
function test(name,js){run("{\n"+js+"\n}");console.log('PASS '+name);}
test('boot and expanded UI rendering',`if(modal!=='launchModal')throw Error('title missing');$('launchAction').click();$('launchAction').click();launchShip('wanderer');if(modal||!isStory()||actState().stage!==0)throw Error('onboarding');draw();$('help').click();if(modal!=='helpModal')throw Error('help inaccessible');closeModal();renderResearch();renderJournal();renderSystems();openContact(PLACES[0]);renderContact();closeModal();openModal('mapModal');draw();closeModal();renderEditor();`);
test('old saves migrate once, expanded saves reload without world duplication',`fresh();const legacy=JSON.parse(JSON.stringify(s));delete legacy.campaign;delete legacy.stats;legacy.modules=base();legacy.enemies=legacy.enemies.slice(0,3);legacy.asteroids=legacy.asteroids.slice(0,65);if(!validState(legacy))throw Error('legacy');normalizeState(legacy);const n=legacy.asteroids.length;if(n<=65)throw Error('world upgrade');normalizeState(legacy);if(legacy.asteroids.length!==n)throw Error('duplicate world');if(!legacy.campaign||!legacy.stats)throw Error('missing fields');legacy.x=NaN;if(validState(legacy)||validState(null))throw Error('bad save accepted');`);
test('mass, cargo, analog thrust, rotation inertia, force-limited braking',`fresh();closeModal();s.enemies.forEach(e=>e.dead=true);s.asteroids=[];const light=shipPhysics();s.campaign.parts=100;const heavy=shipPhysics();if(heavy.accel>=light.accel||heavy.mass<=light.mass)throw Error('mass');s.campaign.parts=0;stick.x=.2;update(.04);const low=s.vx;fresh();s.asteroids=[];stick.x=1;update(.04);if(s.vx<low)throw Error('analog');if(s.angle===Math.PI/2)throw Error('instant rotation');resetInput();s.vx=200;brake();update(.04);if(s.vx===0||s.vx>=200)throw Error('brake instant/ineffective');for(let i=0;i<500;i++)update(.016);if(Math.hypot(s.vx,s.vy)>2)throw Error('brake arrival');`);
test('drift mode preserves momentum, assist damps it',`fresh();s.asteroids=[];s.enemies.forEach(e=>e.dead=true);s.campaign.assist=false;s.vx=100;for(let i=0;i<60;i++)update(1/60);if(s.vx<95)throw Error('no inertia');s.campaign.assist=true;for(let i=0;i<180;i++)update(1/60);if(s.vx>3)throw Error('assist');`);
test('autopilot arrival and manual cancellation',`fresh();s.asteroids=[];s.enemies.forEach(e=>e.dead=true);setDestination(600,300);for(let i=0;i<3000&&s.destination;i++)update(.016);if(s.destination||Math.hypot(s.x-600,s.y-300)>15)throw Error('arrival '+s.x+','+s.y);setDestination(99999,-99999);if(s.destination.x!==2700||s.destination.y!==-2700)throw Error('clamp');stick.y=.5;update(.016);if(s.destination)throw Error('cancel');resetInput();`);
test('autopilot obstacle avoidance and physical collision',`fresh();s.enemies.forEach(e=>e.dead=true);s.asteroids=[{id:'obstacle',x:400,y:0,r:40,ore:50,seed:1,material:'ore'}];setDestination(850,0);for(let i=0;i<4000&&s.destination;i++)update(.016);if(s.destination||distance(s,{x:850,y:0})>15)throw Error('avoidance stalled '+s.x+','+s.y);s.x=340;s.y=0;s.vx=250;s.vy=0;const hp=s.modules.reduce((a,m)=>a+m.hp,0);collidePlayer(.016);if(s.modules.reduce((a,m)=>a+m.hp,0)>=hp)throw Error('collision no damage');`);
test('ore, crystal, salvage mining, capacity and mining approach',`fresh();s.enemies.forEach(e=>e.dead=true);s.asteroids=[{id:'test',x:600,y:0,r:20,ore:24,seed:1,material:'crystal'}];startMining(s.asteroids[0]);for(let i=0;i<3000&&s.miningId;i++)update(.016);if(s.miningId||s.campaign.crystal!==24)throw Error('mine approach '+s.x+','+s.y);s.asteroids[0].material='salvage';s.asteroids[0].ore=8;mining=0;const data=s.campaign.data;runExtraction(s.asteroids[0]);if(s.campaign.data<=data)throw Error('salvage data');s.ore=cargoMax();s.campaign.crystal=0;s.asteroids[0].ore=24;startMining(s.asteroids[0]);if(s.miningId)throw Error('full hold accepted');`);
test('station-only trade, prices, stock, cargo and no overspend',`fresh();currentContact='home';const credits=s.campaign.credits,ore=s.ore;if(!doTrade('ore','buy',10))throw Error('buy');if(s.ore!==ore+10||s.campaign.credits!==credits-40)throw Error('price');if(!doTrade('ore','sell',10)||s.campaign.credits!==credits-20)throw Error('spread');s.campaign.credits=0;if(doTrade('crystal','buy',10))throw Error('overspend');s.campaign.credits=10000;stationMarket('home').parts=0;if(doTrade('parts','buy',1))throw Error('no stock');s.x=2000;if(doTrade('ore','sell',1))throw Error('remote trade');`);
test('research prerequisites, costs, idempotency and build locks',`fresh();s.campaign.data=500;s.campaign.crystal=500;s.campaign.credits=5000;if(researchTech('warp'))throw Error('prereq ignored');if(!researchTech('capacitors'))throw Error('research');const cash=s.campaign.credits;if(researchTech('capacitors')||s.campaign.credits!==cash)throw Error('double research');selected='shield';const n=s.modules.length;editAt(2,0,false);if(s.modules.length!==n)throw Error('locked module');researchTech('shields');editAt(2,0,false);if(s.modules.length!==n+1)throw Error('unlock');`);
test('shield absorption and nebula/ice effects',`fresh();s.modules.push(makeModule(2,0,'shield'));s.campaign.shield=90;const m=core(s),hp=m.hp;hit(s,m,35);if(m.hp!==hp||s.campaign.shield!==55)throw Error('shield');s.campaign.shield=0;s.campaign.shieldDelay=0;s.heat=50;updateEnergy(s,1,REGIONS.find(r=>r.id==='nebula'));if(s.campaign.shield!==0)throw Error('nebula shield');const nebulaHeat=s.heat;s.heat=50;updateEnergy(s,1,REGIONS.find(r=>r.id==='ice'));if(s.heat>=nebulaHeat||s.campaign.shield<=0)throw Error('ice cooling');`);
test('NPC movement and patrol behaviour',`fresh();const n=s.campaign.npcs[0],x=n.x,y=n.y;updateNpcs(1);if(n.x===x&&n.y===y)throw Error('npc static');const patrol=s.campaign.npcs.find(n=>n.kind==='patrol');s.enemies[0].x=patrol.x+200;s.enemies[0].y=patrol.y;bullets=[];patrol.cool=0;updateNpcs(.016);if(!bullets.some(b=>b.npc))throw Error('patrol no fire');`);
test('contracts pay once and require delivery at issuer',`fresh();const q=CONTRACTS[0];if(acceptContract(q.id))throw Error('remote acceptance');s.x=-1650;s.y=-650;currentContact='forge';if(!acceptContract(q.id))throw Error('accept');s.ore=100;const money=s.campaign.credits;if(!completeContract(q.id)||s.ore!==20||s.campaign.credits!==money+q.credits)throw Error('delivery');if(completeContract(q.id))throw Error('double reward');`);
test('map pinch/drag do not create route, zoom anchors',`fresh();openModal('mapModal');mapView.zoom=2;const p={x:410,y:400},before=mapToWorld(p);zoomMap(1.5,p);if(distance(before,mapToWorld(p))>.001)throw Error('anchor');`);
const evt=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});els.sectorMap.onpointerdown(evt(1,300,300));els.sectorMap.onpointerdown(evt(2,400,400));els.sectorMap.onpointermove(evt(2,550,550));els.sectorMap.onpointerup(evt(2,550,550));els.sectorMap.onpointerup(evt(1,300,300));test('pinch release is not a tap',`if(modal!=='mapModal'||s.destination)throw Error('accidental course');closeModal();`);
test('scan, technology, gate repair and first jump complete campaign',`fresh();s.enemies.forEach(e=>e.dead=true);s.kills=3;s.asteroids=[];for(const p of PLACES.filter(p=>p.kind==='relic')){s.x=p.x;s.y=p.y;s.vx=s.vy=0;if(!startScan(p.id))throw Error('scan start');for(let i=0;i<340;i++)update(.016);}if(s.campaign.scanned.length!==3)throw Error('scan completion');s.campaign.data=500;s.campaign.crystal=300;s.campaign.credits=3000;researchTech('geology');researchTech('ionDrive');researchTech('warp');s.ore=250;s.x=2100;s.y=300;currentContact='gateEast';if(repairGates())throw Error('missing key accepted');s.campaign.commandCore=true;if(!repairGates())throw Error('gate repair');const ore=s.ore;if(repairGates()||s.ore!==ore)throw Error('double repair');s.energy=100;if(!jumpGate()||!s.campaign.completed||!s.won||s.x>-1500||modal!=='resultModal')throw Error('jump');if(jumpGate())throw Error('cooldown');$('resultContinue').click();if(modal)throw Error('continue');`);
test('loss opens the shipyard and keeps a completed campaign',`save(false);hit(s,core(s),9999);if(!s.dead||modal!=='launchModal'||launchState().phase!=='replacement')throw Error('death');launchShip('hauler');if(s.dead||!s.campaign.completed||!core(s))throw Error('replacement');draw();renderResearch();renderJournal();renderSystems();`);
test('forward and lateral thrust follow a 90° heading',`
 fresh();s.asteroids=[];s.enemies.forEach(e=>e.dead=true);mouse.seen=false;touchHeading=null;
 s.angle=Math.PI/2;keys.KeyW=true;update(.04);
 if(s.vx<1||Math.abs(s.vy)>.01)throw Error('W did not follow the nose');
 s.vx=s.vy=0;keys={};stick.y=-1;update(.04);
 if(s.vx<1||Math.abs(s.vy)>.01)throw Error('joystick did not follow the nose');
 s.vx=s.vy=0;stick.y=0;keys.KeyD=true;update(.04);
 if(s.vy<1||Math.abs(s.vx)>.01)throw Error('D did not strafe');
 resetInput();
`);
test('autoguns lead targets inside the cone and fire forward outside it',`
 fresh();s.asteroids=[];s.enemies.slice(1).forEach(e=>e.dead=true);
 const enemy=s.enemies[0];enemy.x=435;enemy.y=-150;
 s.angle=Math.PI/2;mouse.seen=false;touchHeading=null;autoAim=true;
 keys={fire:true};bullets=[];update(1/60);
 if(s.angle!==Math.PI/2||targetLock!==enemy||!bullets.some(b=>!b.enemy&&b.vy<-100))throw Error('in-cone target not tracked');
 enemy.x=0;enemy.y=-435;s.vx=s.vy=0;bullets=[];s.modules.forEach(m=>m.cd=0);
 update(1/60);
 if(s.angle!==Math.PI/2||targetLock||!bullets.some(b=>!b.enemy&&b.vx>600&&Math.abs(b.vy)<.01))throw Error('out-of-cone fallback');
 const gun=WEAPONS.gun,velocity={x:0,y:0},origin={x:0,y:0};
 for(const degrees of [34.9,35,-35,35.1,-35.1]) {
  const a=degrees*Math.PI/180,target={x:480*Math.cos(a),y:480*Math.sin(a)};
  if((leadInCone(s,origin,gun,target,velocity)!==null)!==(Math.abs(degrees)<=35))throw Error('cone boundary '+degrees);
 }
 resetInput();
`);
const touch=(id,x,y)=>({...evt(id,x,y),pointerType:'touch',button:0});
test('mobile heading gesture, joystick and fire accept separate fingers',`
 fresh();s.asteroids=[{id:'tap',x:70,y:0,r:15,seed:1,ore:24,material:'ore'}];setDestination(700,0);
`);
els.space.onpointerdown(touch(5,265,422));
els.space.onpointermove(touch(5,323,422));
els.joystick.onpointerdown(touch(6,59,24));
els.fire.onpointerdown(touch(7,370,700));
test('look gesture cancels route, holds heading, keeps thrust and fire',`
 if(touchHeading!==Math.PI/2||s.destination||stick.y>-.8||!keys.fire)throw Error('multitouch controls');
`);
els.space.onpointerup(touch(5,265,422));
els.joystick.onpointerup(touch(6,59,24));
els.fire.onpointerup(touch(7,370,700));
test('returning swipe to its origin never starts mining',`
 if(s.miningId||touchHeading!==Math.PI/2||stick.y||keys.fire)throw Error('swipe became a tap');
`);
for(const size of [240,340,570]) {
 sectorRect.width=sectorRect.height=size;
 test('map labels fit and do not overlap at '+size+' px',`
  fresh();openModal('mapModal');mapView.x=mapView.y=0;mapView.zoom=1;
  const east=PLACES.find(p=>p.id==='gateEast');setMapObject(east,east.kind);drawSectorMap();
  if(!renderedMapLabels.length||!renderedMapLabels.some(b=>b.entry?.object===east))throw Error('selected label missing');
  for(const [i,b] of renderedMapLabels.entries()) {
   if(b.x<5||b.y<5||b.x+b.w>${size}-5||b.y+b.h>${size}-5)throw Error('label clipped');
   if(renderedMapLabels.slice(i+1).some(c=>boxesIntersect(b,c,3)))throw Error('label overlap');
  }
  if(sg.font!=='600 14px system-ui, sans-serif')throw Error('font scaled with map');
  closeModal();
 `);
}
test('map object details and course are separate actions',`
 fresh();s.asteroids=[];openModal('mapModal');mapView.x=mapView.y=0;mapView.zoom=1;
 const gate=PLACES.find(p=>p.id==='gateEast');chooseMapPoint(worldToMap(gate));
 if(mapSelection.object!==gate||modal!=='mapModal'||s.destination||$('mapObject').hidden)throw Error('map selection skipped details');
 $('mapAction').click();
 if(modal||!s.destination||s.campaign.approach!==gate.id)throw Error('map action did not plot');
 openModal('mapModal');chooseMapPoint({x:20,y:20});
 if(modal||!s.destination||s.campaign.approach)throw Error('empty map tap did not set route');
`);
test('surface extraction exposes a gated dense seam and spends energy and heat',`
 fresh();mining=0;
 const vein={id:'seam',x:s.x,y:s.y,r:22,seed:1,ore:41,material:'crystal',work:{surface:5,tier:2}};
 const energy=s.energy,heat=s.heat;
 if(!runExtraction(vein)||vein.ore!==36||s.energy===energy||s.heat===heat)throw Error('surface pulse');
 mining=0;
 if(runExtraction(vein)||vein.ore!==36)throw Error('dense seam mined without drill');
 s.campaign.data=100;s.campaign.credits=700;s.campaign.crystal=60;
 if(!researchTech('geology')||!researchTech('drilling'))throw Error('drill research');
 selected='drill';editAt(2,0,false);
 s.energy=0;
 if(runExtraction(vein)||s.miningWait!=='Восстанавливаем энергию')throw Error('energy gate');
 s.energy=100;s.heat=95;
 if(runExtraction(vein)||s.miningWait!=='Охлаждаем инструмент')throw Error('thermal gate');
 s.heat=20;
 if(!runExtraction(vein)||vein.ore>=36)throw Error('installed drill failed');
`);
test('enemy loot stays in a wreck and survives a full hold',`
 fresh();
 const enemy=s.enemies.find(e=>e.id==='pirate-0'), ore=s.ore, data=s.campaign.data;
 hit(enemy,core(enemy),9999);
 const wreck=s.asteroids.find(a=>a.id==='wreck-pirate-0');
 if(!enemy.dead||!wreck||s.ore!==ore||s.campaign.data!==data)throw Error('cargo magically awarded');
 s.x=wreck.x;s.y=wreck.y;wreck.ore=12;s.ore=cargoMax();mining=0;
 runExtraction(wreck);
 if(wreck.loot.parts!==3||s.campaign.parts||wreck.loot.data!==0)throw Error('hold limit');
 const saved=normalizeState(JSON.parse(JSON.stringify(s)));
 if(saved.enemies.length!==7||saved.asteroids.find(a=>a.id===wreck.id).loot.parts!==3)throw Error('portion lost on load');
 s.ore-=100;
 if(!runExtraction(wreck)||wreck.loot.parts||s.campaign.parts!==3)throw Error('leftover not recoverable');
`);
test('boss barrier protects its core until both emitters are down',`
 fresh();const boss=bossShip(), reactor=core(boss), hp=reactor.hp;
 hit(boss,boss.modules.find(m=>m.type==='pylon'),9999);
 if(count('pylon',boss)!==2)throw Error('dormant boss damaged');
 s.enemies.filter(e=>GUARD_IDS.includes(e.id)).forEach(e=>e.dead=true);
 s.kills=3;s.campaign.scanned=['relic1','relic2','relic3'];
 hit(boss,reactor,9999);
 if(reactor.hp!==hp)throw Error('shield leaked');
 for(const p of boss.modules.filter(m=>m.type==='pylon'))hit(boss,p,9999);
 hit(boss,reactor,9999);
 const wreck=s.asteroids.find(a=>a.id==='wreck-'+BOSS_ID);
 if(!boss.dead||!wreck.loot.commandCore||s.campaign.commandCore)throw Error('boss key not in wreck');
`);
test('repair requires a station, authorization and available alloy',`
 fresh();const m=s.modules.find(m=>m.type==='armor'),max=m.hp;
 m.hp-=24;s.x=850;s.y=850;const funds=s.ore;
 repair();if(modal||m.hp!==max-24||s.ore!==funds)throw Error('field repair');
 s.x=0;s.y=0;repair();
 if(modal!=='repairModal'||getRepairQuote().cost!==3||s.ore!==funds||m.hp!==max-24)throw Error('quote spent resources');
 closeRepair();if(m.hp!==max-24||s.ore!==funds)throw Error('cancelled repair applied');
 s.ore=2;repair();if(confirmRepair()||s.ore!==2||m.hp!==max-24)throw Error('overdraw');
 closeRepair();s.ore=funds;repair();if(!confirmRepair()||m.hp!==max||s.ore!==funds-3)throw Error('dock repair failed');
`);
test('damage schematic keeps battle losses on reload and clears rebuilt tiles',`
 fresh();const armor=s.modules.find(m=>m.x===1&&m.y===0),max=s.hullCapacity;
 hit(s,armor,120);updateDamageHud();
 if(!$('damageStatus').textContent.includes('1 повр.'))throw Error('damaged module missing');
 hit(s,armor,999);updateDamageHud();
 if(s.lostModules.length!==1||!$('damageStatus').textContent.includes('1 утр.'))throw Error('lost module missing');
 s=normalizeState(JSON.parse(JSON.stringify(s)));selected='armor';
 editAt(1,0);if(s.hullCapacity!==max||s.lostModules.length)throw Error('loss not cleared by rebuild');
 $('undoBuild').click();if(s.lostModules.length!==1)throw Error('undo lost loss marker');
`);
test('schema 5 migration preserves economy, key, deposits and ships',`
 fresh();s.version=5;delete s.lostModules;
 s.campaign.credits=317;s.campaign.commandCore=true;s.campaign.scanned=['relic2'];
 s.ore=176;s.asteroids[0].ore=12;
 const pin=s.asteroids[0].id,tech=s.campaign.tech.slice();
 const copy=JSON.parse(JSON.stringify(s));
 if(!validState(copy))throw Error('previous version rejected');
 normalizeState(copy);normalizeState(copy);
 if(copy.version!==SAVE_VERSION||copy.campaign.credits!==317||copy.ore!==176||!copy.campaign.commandCore||copy.campaign.scanned[0]!=='relic2'||copy.asteroids.find(a=>a.id===pin).ore!==12||copy.enemies.length!==7||copy.campaign.tech.join()!==tech.join())throw Error('migration changed progress');
`);
test('fixed simulation step does not depend on display refresh cadence',`
 function tickAt(refresh) {
  fresh();s.asteroids=[];s.enemies.forEach(e=>e.dead=true);keys={KeyD:true};
  last=null;frameDebt=0;clock=0;
  for(let frame=0;frame<=refresh;frame++)advanceFrame(frame*1000/refresh);
  return [s.stats.time,s.x,s.vx];
 }
 const a=tickAt(30),b=tickAt(144);
 if(a.some((n,i)=>Math.abs(n-b[i])>1e-7)||Math.abs(a[0]-1)>1e-7)throw Error('refresh altered simulation');
 resetInput();
`);
test('hull and camera advance between physics ticks at 90, 120 and 144 Hz',`
 for(const refresh of [90,120,144]) {
  closeModal();fresh();setReducedMotion(false);resetInput();
  s.asteroids=[];s.enemies.forEach(e=>e.dead=true);
  s.y=-300;s.vx=200;s.angle=Math.PI/2;s.campaign.assist=false;
  mouse.seen=false;touchHeading=Math.PI/2+.65;last=null;resetPresentation();
  const translate=ctx.translate,rotate=ctx.rotate;
  let x,angle,previousX,previousAngle,previousScreenX;
  ctx.translate=value=>{x=value;};ctx.rotate=value=>{angle=value;};
  try {
   for(let frame=0;frame<=refresh;frame++) {
    advanceFrame(frame*1000/refresh);drawShip(s);
    const screenX=(x-view.x)*view.zoom;
    if(frame>refresh*.15&&(x<=previousX||x-previousX>210/refresh||
      Math.abs(screenX-previousScreenX)>1))throw Error('stepped hull or camera at '+refresh+' Hz');
    if(frame>refresh*.15&&frame<refresh*.4&&angle<=previousAngle)throw Error('stepped rotation at '+refresh+' Hz');
    previousX=x;previousAngle=angle;previousScreenX=screenX;
   }
  } finally {ctx.translate=translate;ctx.rotate=rotate;}
  brake();
  for(let frame=refresh+1;frame<=refresh*5;frame++)advanceFrame(frame*1000/refresh);
  if(Math.hypot(flightPose.vx,flightPose.vy)>.01||distance(flightPose,s)>.01)throw Error('rendered ship did not stop');
 }
 touchHeading=null;resetInput();
`);
test('render pose crosses the angular seam and resets after a gate jump',`
 fresh();s.angle=Math.PI-.1;recordFlightPose();s.angle=-Math.PI+.1;
 interpolateFlight(.5);
 if(Math.abs(flightPose.angle-Math.PI)>1e-9)throw Error('long turn across the seam');
 s.x=-2200;s.y=300;s.vx=s.vy=0;frameDebt=.01;
 jumpFeedback();updateCamera(1/120);
 if(distance(flightPose,s)||distance(view,s)||frameDebt)throw Error('stale pose after teleport');
`);
test('module loss plays its effect without interrupting flight',`
 closeModal();fresh();s.asteroids=[];s.enemies.forEach(e=>e.dead=true);
 resetInput();mouse.seen=false;last=null;
 const enemy=s.enemies[0];
 advanceFrame(0);detachFeedback(enemy,enemy.modules[0],enemy);advanceFrame(1000/60);
 if(!debris.length||Math.abs(s.stats.time-1/60)>1e-9)throw Error('module loss interrupted flight');
`);
test('audio starts after interaction and respects the mute setting',`
 let plays=0;
 const curve={setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}};
 globalThis.AudioContext=class {
  constructor(){this.state='running';this.currentTime=1;}
  createOscillator(){return {frequency:curve,connect(){},start(){plays++;},stop(){}};}
  createGain(){return {gain:curve,connect(){}};}
  suspend(){this.state='suspended';return Promise.resolve();}
  resume(){this.state='running';return Promise.resolve();}
 };
 playSound('shot');if(plays)throw Error('autoplay');
 unlockAudio();playSound('shot');playSound('shot');
 if(plays!==1)throw Error('shot sound was missing or stacked');
 $('sound').click();playSound('warning');
 if(plays!==1||localStorage.getItem(SOUND_KEY)!=='off')throw Error('mute not applied');
 $('sound').click();playSound('warning');
 if(plays!==2||localStorage.getItem(SOUND_KEY)!=='on')throw Error('sound not restored');
`);
test('manual beam must track the live spot and yields faster once aligned',`
 fresh();s.campaign.beamMode='manual';
 const a={id:'hand-test',x:120,y:0,r:35,ore:30,seed:1,material:'rawOre'};
 s.asteroids=[a];s.miningId=a.id;mining=0;
 beamPointer={id:1,x:-100,y:-100};updateMining(a,1);
 if(a.ore!==30||beamCharge!==0)throw Error('off spot mined');
 const spot=rockSpot(a);beamPointer={id:1,x:W/2+(spot.x-view.x)*view.zoom,y:H/2+(spot.y-view.y)*view.zoom};
 updateMining(a,.1);if(a.ore!==30)throw Error('no acquisition delay');
 updateMining(a,.1);
 const extracted=30-a.ore, before=cargoUsed();
 if(!extracted||s.campaign.rawOre!==0||reservedCargo()!==extracted||mining>=.8)throw Error('working beam');
 const restored=readFlight(JSON.stringify(s));
 if(!restored||restored.campaign.deliveries.reduce((sum,f)=>sum+f.amount,0)!==extracted)throw Error('in-flight cargo save');
 s=restored;updateIndustry(1);
 if(s.campaign.rawOre!==extracted||cargoUsed()!==before+extracted||reservedCargo())throw Error('cargo arrival');
 updateIndustry(1);
 if(s.campaign.rawOre!==extracted)throw Error('duplicate delivery');
`);
test('unstable fracture conserves remaining resources and the tractor collects them',`
 fresh();s.asteroids=[];s.campaign.beamMode='manual';s.heat=91;mining=0;
 const a={id:'hot-rock',x:160,y:0,r:22,ore:25,seed:3,material:'volatile',reserve:45};
 const hp=s.modules.reduce((n,m)=>n+m.hp,0);
 if(!runExtraction(a,true)||a.ore!==0||s.campaign.fragments.reduce((n,f)=>n+f.amount,0)!==25||s.campaign.crystal)throw Error('fracture duped or lost resources');
 if(!Number.isFinite(a.renewAt)||s.modules.reduce((n,m)=>n+m.hp,0)>=hp)throw Error('no hot fracture/renewal consequence');
 s.modules.push(makeModule(2,0,'tractor'));s.energy=100;
 for(let i=0;i<220;i++)updateIndustry(SIM_STEP);
 if(s.campaign.crystal!==25||s.campaign.fragments.length||s.energy>=100)throw Error('tractor did not gather the fragments');
`);
test('industrial jobs are asynchronous, use station storage, and survive reload',`
 fresh();const home=PLACES.find(p=>p.id==='home');currentContact=home.id;
 s.campaign.rawOre=36;const credits=s.campaign.credits,alloy=s.ore;
 if(!beginRefinery(home,'smelt')||beginRefinery(home,'smelt')||s.campaign.rawOre!==18||s.campaign.credits!==credits-4)throw Error('submission');
 if(collectRefinery(home))throw Error('early shipment');
 s=normalizeState(JSON.parse(JSON.stringify(s)));s.stats.time+=12;
 s.x=820;if(collectRefinery(home))throw Error('remote shipment');s.x=0;
 s.ore=cargoMax()-5;if(collectRefinery(home))throw Error('overfill');s.ore=alloy;
 if(!collectRefinery(home)||s.ore!==alloy+12||collectRefinery(home))throw Error('collection was not one-time');
 s.campaign.coolant=1;s.heat=80;s.overheated=true;
 if(!useSupply('coolant')||s.heat!==47||useSupply('coolant'))throw Error('coolant');
 s.campaign.cells=1;s.energy=20;
 if(!useSupply('cells')||s.energy!==52||s.campaign.cells)throw Error('cells');
`);
test('scarcity raises quotes, order size matters and restocking restores prices',`
 fresh();const home=PLACES.find(p=>p.id==='home'),good='crystal',market=stationMarket(home.id);
 const base=marketPrice(home,good,market[good]).buy;
 market[good]=24;
 if(marketPrice(home,good,market[good]).buy<=base||marketOrder(home,good,'buy',20,market[good])<=marketPrice(home,good,24).buy*20)throw Error('flat scarcity');
 s.stats.time=720;
 if(stationMarket(home.id)[good]!==GOODS[good].stock)throw Error('restock');
 const i=Object.keys(GOODS).indexOf(good),seed=Array.from(home.id).reduce((n,c)=>n+c.charCodeAt(0),0);
 s.stats.time=180*(Object.keys(GOODS).length*2+i-seed%Object.keys(GOODS).length);
 if(!marketPrice(home,good,350).demand)throw Error('no scheduled demand');
`);
test('fields and patrol renew only after the timer and away from the player',`
 fresh();renewalCheck=0;
 const a=s.asteroids.find(a=>a.id==='industry-0');a.ore=0;markDepleted(a);
 s.stats.time=FIELD_RENEWAL+2;updateIndustry(SIM_STEP);
 if(a.ore)throw Error('rock spawned beside ship');
 s.x=-900;s.stats.time+=2;updateIndustry(SIM_STEP);
 if(a.ore!==a.reserve||a.renewAt!=null)throw Error('depleted field not renewed');
 const scout=s.enemies.find(e=>e.archetype==='scout'), guard=s.enemies[0];
 hit(scout,core(scout),9000);hit(guard,core(guard),9000);
 s.stats.time+=FIELD_RENEWAL+1;updateIndustry(SIM_STEP);
 if(scout.dead||scout.patrolRound!==1||!guard.dead)throw Error('wrong enemy renewal');
`);
test('weapon groups spend their own supplies and reserve more with a magazine',`
 fresh();s.angle=Math.PI/2;s.modules.push(makeModule(2,0,'plasma'),makeModule(2,1,'launcher'));
 const shells=s.campaign.shells,rockets=s.campaign.rockets;
 setWeaponGroup('energy');bullets=[];fire(s,false);
 if(bullets.length!==1||bullets[0].kind!=='plasma'||s.campaign.shells!==shells)throw Error('energy group');
 setWeaponGroup('rockets');fire(s,false,{id:'scout',x:s.x+430,y:s.y,vx:0,vy:0});
 if(s.campaign.rockets!==rockets-1||!bullets.at(-1).guided||bullets.at(-1).targetId!=='scout')throw Error('rocket supply');
 setWeaponGroup('kinetic');fire(s,false);
 if(s.campaign.shells!==shells-2)throw Error('gun supply');
 s.campaign.shells=0;s.modules.forEach(m=>m.cd=0);
 if(fire(s,false))throw Error('gun fired empty');
 const cap=ammoCap('shells');s.modules.push(makeModule(2,-1,'magazine'));
 if(ammoCap('shells')!==cap+180||freeFor('shells')!==cap+180)throw Error('magazine capacity');
`);
test('plasma drains shields and EMP disables thrust until systems recover',`
 fresh();const shield=makeModule(2,0,'shield'),engine=s.modules.find(m=>m.type==='engine');s.modules.push(shield);
 s.campaign.shield=90;hit(s,engine,20,'plasma');
 if(s.campaign.shield!==60||engine.hp!==types.engine.hp)throw Error('shield plasma factor');
 hit(s,engine,15,'emp');if(!operational(engine))throw Error('EMP passed through shield');
 s.campaign.shield=0;const before=shipPhysics().force;
 hit(s,engine,15,'emp');if(operational(engine)||shipPhysics().force>=before)throw Error('EMP fell through');
 updateEnergy(s,3.1,zoneAt(s));if(!operational(engine)||shipPhysics().force!==before)throw Error('EMP did not expire');
`);
test('rail penetrates the first armor cell and rockets damage nearby systems',`
 fresh();s.asteroids=[];s.enemies.slice(1).forEach(e=>e.dead=true);
 const e=s.enemies[0];e.x=160;e.y=0;e.angle=0;
 const armor=makeModule(-1,0,'armor'),reactor=makeModule(0,0,'reactor'),gun=makeModule(0,1,'gun');e.modules=[armor,reactor,gun];
 bullets=[{x:125,y:0,vx:1000,vy:0,life:1,damage:35,enemy:false,pierce:1,kind:'kinetic'}];updateProjectiles(.05);
 if(armor.hp>=types.armor.hp||reactor.hp>=types.reactor.hp||gun.hp!==types.gun.hp)throw Error('rail partition');
 const hp=gun.hp;bullets=[{x:120,y:0,vx:450,vy:0,life:1,damage:30,enemy:false,guided:true,kind:'explosive'}];updateProjectiles(.06);
 if(gun.hp>=hp)throw Error('rocket did not splash neighbor');
`);
test('point defense intercepts a hostile missile with energy and cooldown',`
 fresh();s.x=710;s.y=0;const defense=makeModule(2,0,'pointDefense');s.modules.push(defense);
 const missile={x:850,y:0,vx:-450,vy:0,life:1,guided:true,enemy:true,targetId:'player'};
 const own={...missile,enemy:false};bullets=[missile,own];const energy=s.energy;
 runPointDefense(s);if(missile.life!==0||own.life!==1||defense.cd!==.85||s.energy!==energy-3)throw Error('interception');
`);
test('tactical pin selects an actual module and destroyed pins clear',`
 fresh();const e=s.enemies[0];e.x=300;e.y=60;const gun=e.modules.find(m=>m.type==='gun');
 const point=position(e,gun),goal=pointAtEnemy(point);selectTargetCell(goal);
 if(weaponTarget(e).id!==e.id||distance(weaponTarget(e),point)>.001)throw Error('priority target');
 hit(e,gun,400);updateCombatHud();if(aimedCell||!$('targetModuleLabel').hidden)throw Error('dead module still pinned');
`);
test('a salvaged weapon stays in the wreck when full, restores once, and fits without research',`
 fresh();const e=s.enemies.find(e=>e.id==='wing-gate');hit(e,core(e),9000);
 const wreck=s.asteroids.find(a=>a.id==='wreck-wing-gate');wreck.ore=0;wreck.loot.parts=0;wreck.loot.crystal=0;
 const hp=wreck.loot.module.hp;s.ore=cargoMax();transferWreckCache(wreck);
 if(wreck.loot.module.type!=='launcher'||s.campaign.spareModules.length)throw Error('full-cargo salvage');
 s.ore-=20;transferWreckCache(wreck);transferWreckCache(wreck);
 if(wreck.loot.module||s.campaign.spareModules.length!==1)throw Error('duped trophy');
 s=normalizeState(JSON.parse(JSON.stringify(s)));selected='launcher';selectedSalvage=s.campaign.spareModules[0].id;
 const funds=s.ore;editAt(2,0,false);
 if(s.ore!==funds||s.modules.find(m=>m.x===2&&m.y===0).hp!==hp||s.campaign.spareModules.length)throw Error('damaged trophy install');
 $('undoBuild').click();if(s.campaign.spareModules.length!==1||s.modules.some(m=>m.x===2&&m.y===0))throw Error('trophy undo');
`);
test('squad reinforcements respond to their wing without advancing the blockade count',`
 fresh();const wing=s.enemies.find(e=>e.id==='wing-bastion'),leader=s.enemies.find(e=>e.id==='pirate-1');
 s.x=0;s.y=850;wing.x=-1100;wing.y=850;wing.home={x:wing.x,y:wing.y};leader.x=-550;leader.y=900;
 updateEnemies(.08);if(wing.vx<=0)throw Error('wing did not join engagement');
 const kills=s.kills;hit(wing,core(wing),9999);if(s.kills!==kills)throw Error('wing counted as blockade');
`);

test('autopilot threads an asteroid belt with overlapping collision margins',`
 closeModal();fresh();s.x=-400;s.y=0;s.enemies.forEach(e=>e.dead=true);
 s.asteroids=[[-100,0],[10,-75],[10,75],[130,115],[130,-90],[245,0]].map(([x,y],i)=>({x,y,id:'belt-'+i,r:64,ore:50,seed:i}));
 const startHull=s.modules.reduce((sum,m)=>sum+m.hp,0);
 setDestination(550,0);
 update(SIM_STEP);
 if(!flightRoute||flightRoute.points.length<2)throw Error('blocked course must have a detour');
 for(let i=0;i<60*55&&s.destination;i++)update(SIM_STEP);
 if(s.destination||distance(s,{x:550,y:0})>15)throw Error('route failed');
 if(s.modules.reduce((sum,m)=>sum+m.hp,0)!==startHull)throw Error('autopilot struck rock');
`);
test('a later dangerous save preserves the dock but death keeps current expedition state',`
 closeModal();newFlight();$('launchAction').click();$('launchAction').click();launchShip('wanderer');
 const home=PLACES[0];openContact(home);
 const dock=localStorage.getItem(DOCK_STORAGE);
 if(!dock)throw Error('no dock checkpoint');
 closeModal();s.x=1200;s.y=-400;s.ore=90;save(false);
 if(!load()||s.x!==1200||localStorage.getItem(DOCK_STORAGE)!==dock)throw Error('dock overwritten');
 hit(s,core(s),9999);
 if(launchState().phase!=='replacement')throw Error('no replacement action');
 launchShip('courier');
 if(s.dead||modal||s.ore!==90||!canInteract(home))throw Error('replacement failed');
 if(JSON.parse(localStorage.getItem(STORAGE)).x!==s.x)throw Error('restored state not persisted');
`);
test('the initial gate repair reserves the crystals for the first jump',`
 closeModal();fresh();const cc=s.campaign,gate=PLACES.find(p=>p.id==='gateEast');
 cc.tech.push('warp');cc.scanned=['relic1','relic2','relic3'];cc.commandCore=true;
 s.enemies.filter(e=>GUARD_IDS.includes(e.id)).forEach(e=>e.dead=true);s.kills=3;
 s.x=gate.x;s.y=gate.y;currentContact=gate.id;cc.crystal=64;
 if(repairGates()||cc.gateReady||s.ore!==180)throw Error('premature charge');
 cc.crystal=65;
 if(!repairGates()||cc.crystal!==5||!jumpGate()||!s.won)throw Error('gate sequence broke');
 $('resultContinue').click();updateHud();renderJournal();
 if(!$('objective').hidden||modal)throw Error('free-flight HUD still shows campaign objective');
`);

test('visual bursts are cosmetic, bounded on small screens and cleared on restore',`
 closeModal();fresh();const before=JSON.stringify(s);
 for(let i=0;i<60;i++)effectBurst(s,'explosive');
 if(sparks.length>144||sparks.length===0||waves.length!==36)throw Error('uncapped VFX');
 if(JSON.stringify(s)!==before)throw Error('effects leaked into saved state');
 setReducedMotion(true);tickEffects(.03);
 if(sparks.length>64||echoes.length)throw Error('reduced-motion budget');
 tickEffects(1);
 if(waves.length||sparks.length)throw Error('expired effects');
 jumpFeedback();if(!jumpTime)throw Error('jump streaks missing');
 resetPresentation();if(jumpTime||sparks.length)throw Error('visual state left after reset');
 setReducedMotion(false);
`);
test('camera zoom crosses the old combat boundary smoothly',`
 closeModal();fresh();setReducedMotion(false);
 s.x=0;s.y=0;s.vx=s.vy=0;syncFlightPose();
 const enemy=s.enemies.find(e=>e.archetype==='scout');
 for(const e of s.enemies)if(e!==enemy)e.dead=true;
 enemy.y=0;enemy.x=679;view.zoom=1;updateCamera(1/60);const near=view.zoom;
 enemy.x=681;view.zoom=1;updateCamera(1/60);const far=view.zoom;
 if(near>=1||far>=1||Math.abs(near-far)>.0002)throw Error('combat zoom flips across one pixel');
 setReducedMotion(true);view.zoom=1;updateCamera(1/60);
 if(view.zoom!==1)throw Error('combat zoom remained active with reduced motion');
 setReducedMotion(false);
`);
test('manual camera zoom is smooth, bounded and separate from interface scale',`
 closeModal();fresh();s.enemies.forEach(e=>e.dead=true);setReducedMotion(false);
 setCameraScale(1);view.zoom=1;
 $('cameraSmaller').click();
 if(cameraScale!==.75||$('cameraDefault').textContent!=='75%')throw Error('expected a 25-point camera step');
 updateCamera(1/60);
 if(view.zoom<=.75||view.zoom>=1)throw Error('camera jumped to its target');
 const point=viewAt(W/2+view.zoom*40,H/2-view.zoom*25);
 if(Math.abs(point.x-view.x-40)>1e-8||Math.abs(point.y-view.y+25)>1e-8)throw Error('pointer projection used the wrong zoom');
 let handled=0;const wheel=deltaY=>c.wheel({deltaY,deltaMode:0,preventDefault(){handled++;}});
 for(let i=0;i<8;i++)wheel(100);
 if(cameraScale!==.5||!$('cameraSmaller').disabled)throw Error('camera minimum');
 for(let i=0;i<12;i++)wheel(-100);
 if(cameraScale!==1.25||!$('cameraLarger').disabled)throw Error('camera maximum');
 $('openSettings').click();$('uiSmaller').click();wheel(100);
 if(modal!=='settingsModal'||cameraScale!==1.25||uiScale!==75||handled!==20)throw Error('camera and UI scales mixed');
 $('closeSettings').click();$('cameraDefault').click();
 if(cameraScale!==1||uiScale!==75)throw Error('camera reset changed UI scale');
 $('uiDefault').click();
`);
console.log('All expedition checks passed.');
