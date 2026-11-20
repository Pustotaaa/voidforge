'use strict';

const REPAIR_HP_PER_ALLOY=8;
let repairReturn=null;

function getRepairQuote() {
 const station=PLACES.filter(place=>place.kind==='station'&&canInteract(place))
  .sort((a,b)=>distance(s,a)-distance(s,b))[0];
 const modules=s.modules.filter(m=>m.hp<moduleMaxHp(m));
 const damage=modules.reduce((sum,m)=>sum+moduleMaxHp(m)-m.hp,0);
 return {station,modules,damage,cost:Math.ceil(damage/(isStory()?7:REPAIR_HP_PER_ALLOY))};
}
function renderRepairQuote() {
 const quote=getRepairQuote();
 $('repairStation').textContent=quote.station?prettyName(quote.station.name):'Станция вне зоны связи';
 $('repairDamage').textContent=quote.modules.length+' мод. / '+Math.ceil(quote.damage)+' прочности';
 $('repairCost').textContent=quote.cost+' сплава';
 $('repairBalance').textContent=s.ore+' сплава';
 $('confirmRepair').disabled=!quote.station||quote.cost===0||s.ore<quote.cost||Math.hypot(s.vx,s.vy)>55;
}
function repair() {
 if(s.dead||(modal&&!['systemsModal','contactModal','builder'].includes(modal)))return;
 const quote=getRepairQuote();
 if(!quote.station){toast('Ремонт доступен рядом со станцией. Подлетите к порту.');return;}
 if(Math.hypot(s.vx,s.vy)>55){toast('Сбавьте скорость до 55 м/с для ремонта.');return;}
 if(!quote.cost){toast('Установленные модули целы. Утраченные заменяются на верфи.');return;}
 repairReturn=modal;
 cancelPilot();s.braking=true;
 openModal('repairModal');renderRepairQuote();
}
function closeRepair() {
 const previous=repairReturn;repairReturn=null;
 closeModal();
 if(previous)openModal(previous);
 if(previous==='systemsModal')renderSystems();
 if(previous==='contactModal')renderContact();
 if(previous==='builder')renderEditor();
}
function confirmRepair() {
 if(modal!=='repairModal'||s.dead)return false;
 const quote=getRepairQuote();
 if(!quote.station||!quote.cost||s.ore<quote.cost||Math.hypot(s.vx,s.vy)>55){renderRepairQuote();return false;}
 s.ore-=quote.cost;spendAct('ore',quote.cost);
 for(const m of quote.modules)m.hp=moduleMaxHp(m);
 save(false);closeRepair();
 toast('Ремонт завершён · −'+quote.cost+' сплава');
 log('Станция восстановила повреждённые модули.');
 return true;
}
$('closeRepair').onclick=closeRepair;
$('confirmRepair').onclick=confirmRepair;

const damageCanvas=$('damageMap');
let lastDamageSignature='';
function updateDamageHud() {
 const signature=s.modules.map(m=>tileKey(m)+':'+(m.hp<moduleMaxHp(m)?'d':'h')+(!operational(m)?'e':'')).join('|')+'/'+s.lostModules.map(tileKey).join('|');
 if(signature===lastDamageSignature)return;
 lastDamageSignature=signature;
 const g=damageCanvas.getContext('2d');
 const width=damageCanvas.width,height=damageCanvas.height;
 const cells=[...s.modules,...s.lostModules];
 g.clearRect(0,0,width,height);
 if(!cells.length)return;
 const minX=Math.min(...cells.map(m=>m.x)),maxX=Math.max(...cells.map(m=>m.x));
 const minY=Math.min(...cells.map(m=>m.y)),maxY=Math.max(...cells.map(m=>m.y));
 const step=Math.min(17,Math.floor((width-8)/(maxX-minX+1)),Math.floor((height-8)/(maxY-minY+1)));
 const originX=Math.round((width-step*(maxX-minX+1))/2),originY=Math.round((height-step*(maxY-minY+1))/2);
 const size=step-2;
 const at=m=>[originX+(m.x-minX)*step,originY+(m.y-minY)*step];
 const damaged=s.modules.filter(m=>m.hp<moduleMaxHp(m)).length,stunned=s.modules.filter(m=>!operational(m)).length;
 g.fillStyle='#fff';g.strokeStyle='#fff';g.lineWidth=1;
 for(const m of s.modules) {
  const [x,y]=at(m);
  if(m.hp>=moduleMaxHp(m)&&operational(m)){g.fillRect(x,y,size,size);continue;}
  g.strokeRect(x+.5,y+.5,size-1,size-1);
  g.beginPath();
  if(!operational(m)){g.moveTo(x+size/2,y+2);g.lineTo(x+size/2,y+size-3);}
  else {g.moveTo(x+2,y+size-2);g.lineTo(x+size-2,y+2);}
  g.stroke();
 }
 for(const m of s.lostModules) {
  const [x,y]=at(m);
  g.beginPath();g.moveTo(x+1,y+1);g.lineTo(x+size-1,y+size-1);g.moveTo(x+size-1,y+1);g.lineTo(x+1,y+size-1);g.stroke();
 }
 const status=damaged+' повр. · '+s.lostModules.length+' утр.'+(stunned?' · ЭМИ '+stunned:'');
 setHudText('damageStatus',status);
 damageCanvas.setAttribute('aria-label','Схема корпуса. Повреждено: '+damaged+'. Утраченные клетки отмечены крестом: '+s.lostModules.length+'.');
}

const SOUND_KEY='voidforge-sound';
const SOUND_TONES={
 shot:{from:190,to:65,length:.095,type:'square',volume:.026,gap:.08},
 rail:{from:390,to:100,length:.16,type:'sawtooth',volume:.032,gap:.12},
 hit:{from:145,to:42,length:.075,type:'triangle',volume:.04,gap:.075},
 break:{from:105,to:31,length:.23,type:'sawtooth',volume:.035,gap:.15},
 mine:{from:300,to:230,length:.085,type:'triangle',volume:.025,gap:.14},
 dash:{from:160,to:52,length:.2,type:'sawtooth',volume:.038,gap:.1},
 gate:{from:52,to:240,length:.58,type:'triangle',volume:.047,gap:.3},
 scan:{from:350,to:740,length:.32,type:'sine',volume:.032,gap:.3},
 explosion:{from:87,to:23,length:.31,type:'sawtooth',volume:.08,gap:.19},
 omen:{from:35,to:58,length:1.16,type:'triangle',volume:.095,gap:.7},
 pulse:{from:69,to:44,length:.12,type:'sine',volume:.017,gap:.8},
 warning:{from:145,to:410,length:.31,type:'square',volume:.028,gap:.2}
};
let audioContext=null,soundEnabled=true;
const lastSound=new Map();
try{soundEnabled=localStorage.getItem(SOUND_KEY)!=='off';}catch{}
function unlockAudio() {
 if(!soundEnabled)return;
 const AudioEngine=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!AudioEngine)return;
 try {
  if(!audioContext)audioContext=new AudioEngine();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
 } catch {}
}
function playSound(event) {
 const tone=SOUND_TONES[event];
 if(!soundEnabled||!tone||audioContext?.state!=='running'||(blastMute&&event!=='explosion'))return;
 const now=audioContext.currentTime;
 if(now-(lastSound.get(event)??-Infinity)<tone.gap)return;
 lastSound.set(event,now);
 const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
 oscillator.type=tone.type;
 oscillator.frequency.setValueAtTime(tone.from,now);
 oscillator.frequency.exponentialRampToValueAtTime(tone.to,now+tone.length);
 gain.gain.setValueAtTime(.001,now);
 gain.gain.linearRampToValueAtTime(tone.volume,now+.008);
 gain.gain.exponentialRampToValueAtTime(.001,now+tone.length);
 oscillator.connect(gain);
 const pan=audioContext.createStereoPanner?.();
 if(pan){pan.pan.setValueAtTime(clamp((lastSoundX-s.x)/470,-.9,.9),now);gain.connect(pan);pan.connect(audioContext.destination);}
 else gain.connect(audioContext.destination);
 oscillator.start(now);oscillator.stop(now+tone.length+.01);
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();pan?.disconnect();};
}
function renderSoundButton() {
 $('sound').textContent=soundEnabled?'Звук: вкл.':'Звук: выкл.';
 $('sound').setAttribute('aria-pressed',String(soundEnabled));
}
$('sound').onclick=()=>{
 soundEnabled=!soundEnabled;
 try{localStorage.setItem(SOUND_KEY,soundEnabled?'on':'off');}catch{}
 if(soundEnabled)unlockAudio();
 else if(audioContext?.state==='running')audioContext.suspend().catch(()=>{});
 renderSoundButton();
};
addEventListener('pointerdown',unlockAudio,{passive:true});
addEventListener('keydown',unlockAudio);
renderSoundButton();
