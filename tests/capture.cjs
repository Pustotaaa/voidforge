'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const {createRuntime}=require('./runtime.cjs');

async function capture(directory){
 fs.mkdirSync(directory,{recursive:true});
 GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf','monospace');
 const sprite=await loadImage(fs.readFileSync('dist/icons.png'));
 const artImages={
  sectorAtlas:await loadImage(fs.readFileSync('dist/art/sector-atlas.png')),
  lunarBackdrop:await loadImage(fs.readFileSync('dist/art/lunar-parallax.png'))
 };
 for(const img of Object.values(artImages)){
  if(!img.naturalWidth)Object.defineProperties(img,{naturalWidth:{get:()=>img.width},naturalHeight:{get:()=>img.height}});
  assert.ok(img.complete&&img.naturalWidth);
 }
 const desktop=createRuntime({width:1440,height:900,makeCanvas:createCanvas,loadSprite:()=>sprite,artImages});
 const mobile=createRuntime({width:390,height:844,makeCanvas:createCanvas,loadSprite:()=>sprite,artImages});
 for(const screen of [desktop,mobile])screen.run("startPrologue();finishPrologue();launchShip('wanderer');");
 function write(vf,id,filename,prepare){
  vf.run(prepare+';draw()');
  const canvas=vf.canvases[id],context=canvas.getContext('2d');
  assert.ok(context.getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4!==3&&v>128),filename+' is blank');
  fs.writeFileSync(path.join(directory,filename),canvas.toBuffer('image/png'));
  console.log(filename, canvas.width+'×'+canvas.height);
 }
 write(mobile,'space','01-dock-mobile.png','tickLaunch();function tickLaunch(){ for(let i=0;i<40;i++)update(SIM_STEP);updatePresentation(.14); }');
 write(desktop,'space','02-scout.png',`
  actState().starterOre=30;refreshAct(SIM_STEP);
  const scout=s.enemies.find(e=>e.id==='scout');
  s.x=365;s.y=85;s.angle=.8;view={x:450,y:-55,zoom:1.15};scout.angle=-2.4;
  aimedCell={id:scout.id,x:0,y:1};targetLock=scout;fire(s,false,weaponTarget(scout));
  for(let i=0;i<6;i++)updateProjectiles(SIM_STEP);
  effectBurst(scout,'kinetic',-1.8);effectBurst({x:565,y:-173},'shield',-.3);tickEffects(.09);
 `);
 write(mobile,'sectorMap','03-radar-map.png',`
  actState().stage=3;recordRadar(900,true);s.x=1600;s.y=-720;recordRadar(900,true);s.x=940;s.y=-1060;recordRadar(600,true);
  setDestination(1350,-1550);followCourse(shipPhysics(),260,SIM_STEP);
  sectorCanvas.getBoundingClientRect=()=>({left:0,top:0,width:390,height:390});
  openModal('mapModal');setMapObject(signals().find(p=>p.signature==='anomaly'),'signal');
 `);
 write(desktop,'editor','04-shipyard.png',`
  toggleBuild();s.ore=1000;s.campaign.tech.push('capacitors','shields','railgun','fieldService');
  for(const [type,x,y] of [['armor',0,-2],['rail',0,-3],['shield',-2,0],['shield',2,0],['reactor',0,2],['cooler',-2,1],['cooler',2,1],['gun',-2,-1]]){
   selected=type;editAt(x,y,false);
  }
  selected='rail';editAt(0,-3,false);upgradeModule();renderEditor();closeModal();
 `);
 write(desktop,'space','05-watcher.png',`
  actState().stage=7;s.campaign.scanned=['relic1','relic2','relic3'];
  for(const e of s.enemies)if(e.id!==BOSS_ID)e.dead=true;
  s.kills=3;const watcher=bossShip();
  watcher.active=true;watcher.introPlayed=true;watcher.angle=-Math.PI/2;
  watcher.windup=.5;watcher.maxWindup=1.12;watcher.beamAngle=Math.PI-.12;
  s.x=1810;s.y=160;s.angle=1.73;view={x:1990,y:260,zoom:1.12};
  s.modules.push(makeModule(-2,0,'pointDefense'));
  deploySwarm(watcher,4,true);targetLock=watcher;actState().threat=4.2;
  effectBurst({x:2155,y:192},'explosive');effectBurst({x:2070,y:280},'core');tickEffects(.11);
  bullets.push({x:1990,y:272,vx:265,vy:150,kind:'plasma'},{x:2220,y:357,vx:620,vy:-135,rail:true});
  watcher.flash=.2;
  spawnActor('layer',s,1.3);deployMine({x:1780,y:490});drawEncounterMarkers();
 `);
}
capture(process.argv[2]||'../vf31-captures').catch(error=>{console.error(error);process.exitCode=1;});
