'use strict';

let reduceMotion=false,shake=0,blastMute=0,introFor=0;
let view={x:0,y:0,zoom:1},debris=[],bursts=[],muzzles=[],exhaust=[];
const MIN_CAMERA_SCALE=.5,MAX_CAMERA_SCALE=1.25;
let cameraScale=1;
function setCameraScale(value) {
 cameraScale=clamp(value,MIN_CAMERA_SCALE,MAX_CAMERA_SCALE);
 const percent=Math.round(cameraScale*100);
 setHudText('cameraDefault',percent+'%');
 $('cameraDefault').setAttribute('aria-label','Масштаб камеры '+percent+'%. Вернуть 100%');
 $('cameraSmaller').disabled=cameraScale<=MIN_CAMERA_SCALE;
 $('cameraLarger').disabled=cameraScale>=MAX_CAMERA_SCALE;
}
function smoothCameraZoom(current,target,dt) {
 return reduceMotion?target:current+(target-current)*(1-Math.exp(-dt*9));
}
$('cameraSmaller').onclick=()=>setCameraScale(cameraScale-.25);
$('cameraLarger').onclick=()=>setCameraScale(cameraScale+.25);
$('cameraDefault').onclick=()=>setCameraScale(1);
$('openSettings').onclick=()=>openModal('settingsModal');
$('closeSettings').onclick=closeModal;

const previousFlight={x:0,y:0,vx:0,vy:0,angle:0};
const flightPose={...previousFlight};
const cameraLead={x:0,y:0};
let ambience=null,nextPulse=0;
let lastSoundX=0;

function recordFlightPose() {
 previousFlight.x=s.x;previousFlight.y=s.y;
 previousFlight.vx=s.vx;previousFlight.vy=s.vy;
 previousFlight.angle=s.angle;
}
function interpolateFlight(alpha) {
 flightPose.x=previousFlight.x+(s.x-previousFlight.x)*alpha;
 flightPose.y=previousFlight.y+(s.y-previousFlight.y)*alpha;
 flightPose.vx=previousFlight.vx+(s.vx-previousFlight.vx)*alpha;
 flightPose.vy=previousFlight.vy+(s.vy-previousFlight.vy)*alpha;
 flightPose.angle=previousFlight.angle+angleDifference(s.angle,previousFlight.angle)*alpha;
}
function syncFlightPose() {
 frameDebt=0;
 recordFlightPose();
 interpolateFlight(1);
 cameraLead.x=cameraLead.y=0;
 view.x=s.x;view.y=s.y;
}
function resetPresentation() {
 shake=blastMute=introFor=0;
 debris=[];bursts=[];muzzles=[];exhaust=[];clearEffects();
 syncFlightPose();
 view.zoom=cameraScale;
 radioCard=null;
 $('bossIntro').hidden=true;
}
function setReducedMotion(value) {
 reduceMotion=value;
 $('bossIntro').classList.toggle('still',value);
 const b=$('reduceMotion');
 b.setAttribute('aria-pressed',String(value));b.textContent='Снижать тряску: '+(value?'да':'нет');
 try{localStorage.setItem('voidforge-low-motion',String(value));}catch{}
}
function impactFeedback(ship, point, damage, kind) {
 effectBurst(point,kind,Math.atan2(point.y-ship.y,point.x-ship.x));
 if(ship===s&&!reduceMotion)shake=Math.min(16,shake+damage*.13);
 lastSoundX=point.x;
}
function detachFeedback(ship, module, point) {
 effectBurst(point,'break',Math.atan2(point.y-ship.y,point.x-ship.x));
 const angle=Math.atan2(point.y-ship.y,point.x-ship.x),speed=58+module.x*4;
 debris.push({type:module.type,hp:moduleMaxHp(module),x:point.x,y:point.y,angle:ship.angle,
  spin:module.x%2?.7:-1.8,life:2.6,vx:Math.cos(angle)*speed+(ship.vx||0)*.6,vy:Math.sin(angle)*speed+(ship.vy||0)*.6});
 if(ship===s) {s.vx-=Math.cos(angle)*6;s.vy-=Math.sin(angle)*6;}
}
function shipBurst(point) {
 effectBurst(point,'core');
 bursts.push({x:point.x,y:point.y,life:.67});
 if(bursts.length>14)bursts.shift();
 if(distance(point,s)<550&&!reduceMotion){shake=Math.min(13,shake+8);}
 lastSoundX=point.x;playSound('explosion');explosionNoise();blastMute=.3;
}
function explosionNoise() {
 if(!soundEnabled||audioContext?.state!=='running'||!audioContext.createBuffer)return;
 const t=.21,buffer=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*t),audioContext.sampleRate);
 const data=buffer.getChannelData(0);let seed=719;
 for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/2147483648-1)*(1-i/data.length)**2;}
 const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
 source.buffer=buffer;filter.type='lowpass';filter.frequency.value=470;gain.gain.value=.27;
 source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);
 source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}
function fireFeedback(point, weapon, angle, ship) {
 if(distance(s,point)>Math.max(W,H)+200)return;
 muzzles.push({x:point.x,y:point.y,life:.1,kind:weapon.kind,angle,rail:weapon.fixed});
 if(muzzles.length>72)muzzles.shift();
 if(ship===s)lastSoundX=point.x;
}
function triggerBossIntro() {
 introFor=1.2;
 $('bossIntro').hidden=false;
 playSound('omen');
}
function updatePresentation(dt) {
 tickEffects(dt);
 for(const chunk of debris){
  chunk.x+=chunk.vx*dt;chunk.y+=chunk.vy*dt;chunk.angle+=chunk.spin*dt;chunk.life-=dt;
 }
 debris=debris.filter(x=>x.life>0).slice(-60);
 for(const group of [bursts,muzzles,exhaust])for(const p of group)p.life-=dt;
 bursts=bursts.filter(p=>p.life>0);muzzles=muzzles.filter(p=>p.life>0);exhaust=exhaust.filter(p=>p.life>0);
 shake=Math.max(0,shake-dt*44);blastMute=Math.max(0,blastMute-dt);
 if(introFor>0) {
  introFor=Math.max(0,introFor-dt);
  $('bossIntro').hidden=introFor<=0;
 }
 const act=actState();
 const speed=Math.hypot(flightPose.vx,flightPose.vy);
 if(dt>0&&!s.dead&&!paused&&!modal&&(act.dash||act.cruiseActive||speed>95)&&exhaust.length<36) {
  const scale=act.dash?2.3:act.cruiseActive?1.65:1;
  const life=.2*scale;
  exhaust.push({x:flightPose.x-Math.sin(flightPose.angle)*21,y:flightPose.y+Math.cos(flightPose.angle)*21,
   dx:flightPose.vx,dy:flightPose.vy,life,maxLife:life,length:Math.max(.04,speed/1700)*scale});
 }
 updateAmbience();
}
function updateCamera(dt) {
 let nearest=Infinity;
 if(!reduceMotion){
  for(const enemy of s.enemies){
   if(enemy.dead||!actEnemyReady(enemy)||enemy.archetype==='boss'&&!bossUnlocked())continue;
   nearest=Math.min(nearest,distance(flightPose,enemy));
  }
 }
 const proximity=clamp((820-nearest)/330,0,1);
 const tacticalZoom=1-(W<630?.11:.07)*proximity*proximity*(3-2*proximity);
 view.zoom=smoothCameraZoom(view.zoom,clamp(cameraScale*tacticalZoom,MIN_CAMERA_SCALE,MAX_CAMERA_SCALE),dt);
 const speed=Math.hypot(flightPose.vx,flightPose.vy);
 const lead=reduceMotion?0:Math.min(.08,50/(speed||1)),cameraStep=1-Math.exp(-dt*8);
 cameraLead.x+=(flightPose.vx*lead-cameraLead.x)*cameraStep;
 cameraLead.y+=(flightPose.vy*lead-cameraLead.y)*cameraStep;
 view.x=flightPose.x+cameraLead.x;
 view.y=flightPose.y+cameraLead.y;
}
function flightInk() {
 const pulse=reduceMotion?0:shake;
 ctx.translate(W/2+Math.sin(renderTime*98)*pulse,H/2+Math.cos(renderTime*79)*pulse);
 ctx.scale(view.zoom,view.zoom);ctx.translate(-view.x,-view.y);
}
function viewAt(x,y) {
 return {x:view.x+(x-W/2)/view.zoom,y:view.y+(y-H/2)/view.zoom};
}
function shadeSpace(camera=view,sectorPosition=s) {
 ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
 drawLunarParallax(camera);
 ctx.fillStyle='#fff';
 const region=zoneAt(sectorPosition).id;
 for(let layer=0;layer<3;layer++) {
  const speed=[.062,.17,.36][layer];
  ctx.fillStyle=['#444','#686868','#b2b2b2'][layer];
  for(let n=0;n<[115,55,24][layer];n++){
   const x=((n*(197.3+layer*33)-camera.x*speed)%W+W)%W,y=((n*n*(23.7+layer*6)-camera.y*speed)%H+H)%H;
   const size=layer===2&&n%4===0?2:1;ctx.fillRect(x,y,size,size);
  }
 }
 if(region==='rust'||region==='silence'||region==='grave'){
  ctx.fillStyle='#5d5d5d';
  const weights={rust:18,silence:40,grave:28};
  for(let i=0;i<weights[region];i++){
   const x=((i*167-camera.x*.17)%W+W)%W,y=((i*131-camera.y*.35)%H+H)%H;
   for(let k=0;k<6;k++)if(region==='grave'?k%2===0:region==='rust'||i%3===0)
    ctx.fillRect(x+k*(region==='rust'?-3:5),y+k,1,1);
  }
 }
 if(region==='nebula'||region==='rift'||region==='ice'||region==='storm'){
  ctx.fillStyle=region==='nebula'?'#444':'#3e3e3e';
  for(let x=0;x<W;x+=6) {
   const y=H*.57+Math.sin(x*.012+camera.x*.002)*H*.16;
   for(let j=0;j<38;j+=2){
    if((x+j)%7<4)ctx.fillRect(x,y+(j-18)*(region==='nebula'?4:2),1,1);
   }
  }
 }
}
function drawShots() {
 ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 for(const b of bullets) {
  if(b.kind==='plasma'||b.kind==='emp') {
   const count=b.kind==='plasma'?8:6;
   const size=b.kind==='plasma'?5:2;
   for(let i=0;i<count;i++) {
    const t=i*.015,phase=Math.sin(i*2+renderTime*31);
    const shift=b.kind==='emp'?phase*6:0;
    const x=b.x-b.vx*t+b.vy*.002*shift,y=b.y-b.vy*t-b.vx*.002*shift;
    ctx.fillRect(x,y,Math.max(2,size-Math.floor(i/2)),Math.max(1,size-Math.floor(i/2)));
   }
   if(b.kind==='emp'){ctx.strokeRect(b.x-4,b.y-4,8,8);}
   continue;
  }
  const trail=b.rail?.105:b.guided?.092:.027;
  ctx.lineWidth=b.rail?2:1;
  ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*trail,b.y-b.vy*trail);ctx.stroke();
  ctx.lineWidth=1;
  if(b.guided) {
   ctx.fillRect(b.x-2,b.y-2,5,5);
   for(let i=1;i<11;i++){
    const shift=Math.sin(renderTime*25+i)*i*.62,size=1+i%3;
    ctx.fillRect(b.x-b.vx*i*.019+shift,b.y-b.vy*i*.019-shift,size,size);
   }
  }
 }
 for(const p of muzzles) {
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  const length=p.rail?31:p.kind==='explosive'?22:14;
  ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(4,-5);ctx.lineTo(length*p.life*10,0);ctx.lineTo(4,5);ctx.closePath();ctx.fill();
  ctx.fillRect(4,-7,2,14);ctx.restore();
 }
 ctx.restore();
}

function drawFlightEffects() {
 ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 ctx.save();
 for(const p of exhaust){
  ctx.globalAlpha=.44*(p.life/p.maxLife);
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.dx*p.length,p.y-p.dy*p.length);ctx.stroke();
 }
 ctx.restore();
 drawImpactEffects();
 for(const d of debris){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);drawModule(ctx,0,0,d,12);ctx.restore();}
 for(const b of bursts){
  const radius=(.67-b.life)*172;
  for(let i=0;i<35;i++) {
   const angle=i*Math.PI*2/35;
   for(const r of [radius,radius*.66])ctx.fillRect(b.x+Math.cos(angle)*r,b.y+Math.sin(angle)*r,2,2);
  }
 }
}
function drawRadioHud() {
 const box=$('radioHud'),act=actState();
 box.hidden=!radioCard||s.stats.time>=radioCard.until||s.dead;
 if(!box.hidden){
  setHudText('radioSpeaker',radioCard.speaker);setHudText('radioMessage',radioCard.message);
  const portrait=radioCard.speaker==='ЛЕЯ ВОСС'?'lia':radioCard.speaker==='ИИ МАЯКА'?'ai':'watcher';
  $('radioPortrait').className='radioPortrait portrait-'+portrait;
 }
 setHudText('threatLevel','Угроза '+threatLevel()+'/5');
 $('threatLevel').dataset.level=threatLevel();
 $('dash').disabled=s.dashCooldown>0||s.energy<25;
 setHudText('dashLabel',s.dashCooldown>0?Math.ceil(s.dashCooldown)+' с':'Рывок');
 $('ping').disabled=Boolean(act.scanPulse)||s.energy<12;
 $('cruise').setAttribute('aria-pressed',String(Boolean(act.cruise)));
 $('boon').hidden=!bossShip()?.active||bossShip().dead||!Object.keys(act.boons).some(id=>!act.used.includes(id));
}
function updateAmbience() {
 if(!audioContext?.createBiquadFilter||audioContext.state==='suspended')return;
 if(!ambience) {
  const tone=audioContext.createOscillator(),filter=audioContext.createBiquadFilter(),volume=audioContext.createGain();
  tone.type='triangle';filter.type='lowpass';filter.frequency.value=130;
  tone.connect(filter);filter.connect(volume);volume.connect(audioContext.destination);tone.start();
  ambience={tone,volume};
 }
 const now=audioContext.currentTime,level=threatLevel(),frequencies={harbor:38,rust:41,nebula:48,ice:51,rift:32,storm:57};
 const audible=soundEnabled&&!modal&&!paused&&!s.dead&&!blastMute;
 ambience.tone.frequency.setTargetAtTime(frequencies[zoneAt(s).id]||36,now,.3);
 ambience.volume.gain.setTargetAtTime(audible?.016+level*.002:0,now,.2);
 if(audible&&level>=2&&now>=nextPulse){nextPulse=now+2.7-level*.32;playSound('pulse');}
}
$('reduceMotion').onclick=()=>setReducedMotion(!reduceMotion);

const targetDiagram=$('targetDiagram'),targetInk=targetDiagram.getContext('2d');
let diagramCells=[],diagramSignature='';
function drawTargetDiagram() {
 const current=targetLock||s.enemies.find(e=>e.id===s.nav&&!e.dead&&actEnemyReady(e)&&distance(e,s)<820)||nearestTarget();
 const card=$('contactTarget');
 card.hidden=!current||s.dead||Boolean(modal);
 if(card.hidden){diagramCells=[];diagramSignature='';return;}
 const hasDrive=count('engine',current)+count('ion',current)>0;
 const hasWeapons=current.modules.some(m=>WEAPONS[m.type]);
 const description=current.archetype==='tank'?(current.shield>1?'Щит':count('armor',current)>6?'Броня':'Реактор'):
  current.archetype==='boss'?count('pylon',current)?'Излучатели':'Ядро':!hasDrive?'Дрейф':!hasWeapons?'Без орудий':'Выберите модуль';
 setHudText('targetName',prettyName(current.name));
 setHudText('targetStatus',description);
 const sig=current.id+current.modules.map(m=>tileKey(m)+':'+Math.ceil(m.hp/8)).join('|')+JSON.stringify(aimedCell);
 if(sig===diagramSignature)return;
 diagramSignature=sig;
 const radius=Math.max(2,...current.modules.map(m=>Math.max(Math.abs(m.x),Math.abs(m.y)))),step=Math.min(17,40/radius);
 targetInk.clearRect(0,0,150,94);
 diagramCells=current.modules.map(m=>({x:75+m.x*step,y:47+m.y*step,m,id:current.id,step}));
 for(const cell of diagramCells) {
  const {x,y,m}=cell,weak=['reactor','bossCore','pylon','engine','ion','mineRack','repairBeam'].includes(m.type);
  drawModule(targetInk,x,y,m,step-3);
  targetInk.fillStyle='#fff';
  targetInk.fillRect(x-step/2+1,y+step/2-3,(step-2)*m.hp/moduleMaxHp(m),1);
  if(weak)targetInk.fillRect(x-1,y-1,3,3);
  if(aimedCell?.id===current.id&&aimedCell.x===m.x&&aimedCell.y===m.y)targetInk.strokeRect(x-step/2,y-step/2,step,step);
 }
}
targetDiagram.onpointerdown=e=>{
 e.preventDefault();
 const box=targetDiagram.getBoundingClientRect();
 const x=(e.clientX-box.left)/box.width*150,y=(e.clientY-box.top)/box.height*94;
 const cell=diagramCells.find(c=>Math.abs(c.x-x)<c.step/2&&Math.abs(c.y-y)<c.step/2);
 if(cell)selectTargetCell({id:cell.id,x:cell.m.x,y:cell.m.y});
};

function drawHoveredSystem() {
 if(!mouse.seen||modal||s.dead)return;
 const pick=pointAtEnemy(viewAt(mouse.x,mouse.y));
 if(!pick)return;
 const enemy=s.enemies.find(e=>e.id===pick.id),module=enemy?.modules.find(m=>m.x===pick.x&&m.y===pick.y);
 if(!module||!['engine','ion','reactor','bossCore','pylon','mineRack','repairBeam'].includes(module.type))return;
 const at=position(enemy,module);
 ctx.strokeStyle='#fff';ctx.strokeRect(at.x-13,at.y-13,26,26);
 ctx.font='11px system-ui';ctx.fillStyle='#fff';
 ctx.fillText(types[module.type].name,at.x+15,at.y-8);
}
