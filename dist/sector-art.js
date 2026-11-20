'use strict';

const sectorAtlas=$('sectorAtlas');
const lunarBackdrop=$('lunarBackdrop');
const ATLAS_CELL=112;
const SECTOR_SPRITES={
 home:0,forge:1,atlas:2,gate:3,rock:4,crystal:5,wreck:6,beacon:7,lia:8,ai:9,watcher:10,core:11
};
const artReady=image=>image.complete&&image.naturalWidth>0;

function drawSectorSprite(g,name,x,y,size,rotation=0) {
 if(!artReady(sectorAtlas))return false;
 const tile=SECTOR_SPRITES[name];
 const sx=tile%4*ATLAS_CELL,sy=Math.floor(tile/4)*ATLAS_CELL;
 g.save();g.translate(x,y);g.rotate(rotation);
 // The source stays 1-bit. Sampling it in screen space suppresses shimmering
 // when its fine dithering crosses fractional pixels during pan or rotation.
 g.imageSmoothingEnabled=true;
 g.imageSmoothingQuality='medium';
 g.drawImage(sectorAtlas,sx,sy,ATLAS_CELL,ATLAS_CELL,-size/2,-size/2,size,size);
 g.restore();
 return true;
}

function drawLunarParallax(camera=view) {
 if(!artReady(lunarBackdrop)||W===0||H===0)return;
 const dx=reduceMotion?0:Math.sin(camera.x/1450)*Math.min(46,W*.055);
 const dy=reduceMotion?0:Math.sin(camera.y/1300)*Math.min(28,H*.045);
 const {naturalWidth:width,naturalHeight:height}=lunarBackdrop;
 ctx.save();
 ctx.imageSmoothingEnabled=true;
 ctx.imageSmoothingQuality='medium';
 ctx.globalAlpha=.39;
 if(W/H<.85) {
  // Keep both illustrated edges visible when a narrow phone crops the sky.
  const moonWidth=Math.round(width*.47),moonHeight=Math.round(height*.41);
  const scale=Math.min(W*.62/moonWidth,H*.30/moonHeight);
  ctx.drawImage(lunarBackdrop,0,height-moonHeight,moonWidth,moonHeight,dx,H-moonHeight*scale+dy,moonWidth*scale,moonHeight*scale);
  const arcX=Math.round(width*.39),arcWidth=width-arcX,arcHeight=Math.round(height*.38);
  const arcScale=Math.min(W*.88/arcWidth,H*.29/arcHeight);
  ctx.drawImage(lunarBackdrop,arcX,0,arcWidth,arcHeight,W-arcWidth*arcScale+dx,dy,arcWidth*arcScale,arcHeight*arcScale);
 }else{
  const drawWidth=Math.max(W,width*H/height),drawHeight=drawWidth*height/width;
  ctx.drawImage(lunarBackdrop,(W-drawWidth)/2+dx,(H-drawHeight)/2+dy,drawWidth,drawHeight);
 }
 ctx.restore();
}

function drawPortArtwork(place) {
 const station=place.kind==='station',gate=place.kind==='gate';
 const tile=station?place.id:gate?'gate':place.id==='relic2'?'beacon':'wreck';
 const width=station?(place.id==='forge'?194:175):gate?214:140;
 const rotation=gate&&s.campaign.gateReady&&!reduceMotion?clock*.10:0;
 return drawSectorSprite(ctx,tile,0,0,width,rotation);
}

function drawGateOrbit(active) {
 ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
 if(active) {
  ctx.setLineDash([1,6]);
  for(let i=0;i<3;i++) {
   const radius=23+i*21;
   const angle=reduceMotion?i:clock*(i%2?.75:-.45)+i;
   ctx.beginPath();ctx.arc(0,0,radius,angle,angle+Math.PI*1.76);ctx.stroke();
   for(let j=0;j<3;j++) {
    const a=angle+j*Math.PI*2/3;
    ctx.fillRect(Math.cos(a)*radius-2,Math.sin(a)*radius-2,4,4);
   }
  }
 }else{
  ctx.setLineDash([2,12]);ctx.beginPath();ctx.arc(0,0,92,0,Math.PI*2);ctx.stroke();
 }
 ctx.setLineDash([]);
}

const MINERAL_INK={
 ore:{line:'#bdbdbd',light:'#ededed',base:'#292929',shade:'#727272'},
 rawOre:{line:'#aeaeae',light:'#ddd',base:'#212121',shade:'#636363'},
 crystal:{line:'#e8e8e8',light:'#fff',base:'#1d1d1d',shade:'#8a8a8a'},
 ice:{line:'#c8c8c8',light:'#f7f7f7',base:'#282828',shade:'#626262'}
};
const mineralInk=item=>MINERAL_INK[item]||MINERAL_INK.ore;
const sampleRock=(seed,i)=>((Math.sin(seed*47.317+i*78.233)*43758.5453)%1+1)%1;
const ROCK_SHAPES={
 ore:[[-.86,-.38],[-.38,-.94],[.36,-.78],[.92,-.33],[.86,.43],[.36,.9],[-.47,.76],[-.94,.24]],
 rawOre:[[-.92,-.25],[-.32,-.86],[.32,-.94],[.89,-.38],[.91,.47],[.24,.92],[-.72,.58]],
 crystal:[[-.81,.48],[-.94,-.18],[-.62,-.66],[-.30,-.38],[.06,-.98],[.39,-.65],[.48,-.28],[.88,-.46],[.94,.25],[.42,.88],[-.29,.85]],
 ice:[[-.65,-.75],[.27,-.95],[.89,-.43],[.73,.54],[.04,.9],[-.79,.55],[-.95,-.02]]
};
function rockPath(points,r,seed) {
 ctx.beginPath();
 points.forEach(([x,y],i)=>{
  const scale=r*(.84+.23*sampleRock(seed,i));
  if(i)ctx.lineTo(x*scale,y*scale);else ctx.moveTo(x*scale,y*scale);
 });
 ctx.closePath();
}
function mineralSurface(item,r,seed) {
 const ink=mineralInk(item);
 ctx.strokeStyle=ink.shade;ctx.fillStyle=ink.shade;ctx.lineWidth=Math.max(.7,r*.025);
 if(item==='ice') {
  for(let i=0;i<3;i++) {
   const x=(-.7+i*.7)*r;
   ctx.beginPath();ctx.moveTo(x-.5*r,-r);ctx.lineTo(x+.13*r,-.22*r);ctx.lineTo(x-.22*r,.53*r);
   ctx.lineTo(x+.18*r,r);ctx.stroke();
  }
  ctx.strokeStyle=ink.line;ctx.globalAlpha=.55;
  ctx.beginPath();ctx.moveTo(-r,-.58*r);ctx.lineTo(-.15*r,-.37*r);ctx.lineTo(.76*r,-.65*r);ctx.stroke();
 } else if(item==='crystal') {
  for(let i=0;i<5;i++) {
   const x=(-.72+i*.35)*r,top=(-.25-sampleRock(seed,i+23)*.68)*r;
   ctx.fillStyle=i%2===0?ink.shade:ink.base;
   ctx.beginPath();ctx.moveTo(x-.2*r,.74*r);ctx.lineTo(x+.03*r,top+.24*r);
   ctx.lineTo(x+.22*r,top);ctx.lineTo(x+.32*r,top+.33*r);ctx.lineTo(x+.12*r,.77*r);ctx.closePath();ctx.fill();
   ctx.strokeStyle=i%2===0?ink.line:ink.shade;ctx.stroke();
   ctx.beginPath();ctx.moveTo(x+.22*r,top);ctx.lineTo(x+.05*r,.74*r);ctx.stroke();
  }
 } else {
  const n=r<12?2:Math.round(r/3);
  for(let i=0;i<n;i++) {
   const x=(sampleRock(seed,i+30)*2-1)*r,y=(sampleRock(seed,i+62)*2-1)*r;
   ctx.fillRect(x,y,r*(.04+sampleRock(seed,i+85)*.17),Math.max(1,r*.042));
  }
  for(let i=0;i<(r<12?1:3);i++) {
   const y=(-.57+i*.57)*r;
   ctx.strokeStyle=i===1?ink.line:ink.shade;
   ctx.beginPath();ctx.moveTo(-r,y+.23*r);ctx.lineTo(-.43*r,y-.08*r);
   ctx.lineTo(.03*r,y+.02*r);ctx.lineTo(.52*r,y-.28*r);ctx.lineTo(r,y-.21*r);ctx.stroke();
  }
 }
}
function drawMineralShard(item,point,r,angle) {
 const ink=mineralInk(item);
 const shape=item==='crystal'?[[-.5,.48],[.04,-1],[.53,-.24],[.25,.8]]:
  item==='ice'?[[-.72,-.23],[-.08,-.8],[.63,-.42],[.73,.36],[.12,.65],[-.63,.44]]:
  [[-.8,.18],[-.46,-.64],[.28,-.62],[.83,-.07],[.43,.69],[-.43,.53]];
 ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle);
 if(item==='crystal') {ctx.shadowColor=ink.line;ctx.shadowBlur=8;}
 rockPath(shape,r,0);
 ctx.fillStyle=item==='ice'?'#77777788':ink.base;ctx.strokeStyle=ink.light;ctx.lineWidth=1.15;ctx.fill();ctx.stroke();
 ctx.shadowBlur=0;ctx.clip();mineralSurface(item,r,0);ctx.restore();
}
function drawRockCracks(a,item) {
 const progress=1-a.ore/(a.initialReserve||a.reserve||a.ore);
 if(progress<.18)return;
 const branches=Math.min(4,1+Math.floor(progress*4));
 const ink=mineralInk(item);
 ctx.lineWidth=1.2;
 for(let i=0;i<branches;i++) {
  const angle=a.seed+i*2.77, length=a.r*(.31+progress*.84);
  ctx.strokeStyle=i===0?ink.light:ink.line;ctx.globalAlpha=i===0?.78:.48;
  traceFilament({x:-a.r*.16,y:a.r*.08},{x:Math.cos(angle)*length,y:Math.sin(angle)*length},a.seed+i,a.r*.075,5);
 }
 ctx.globalAlpha=1;
}
function drawAsteroidArtwork(a) {
 if(a.wreck) {
  polygon(a.x,a.y,a.r,a.seed);
  ctx.fillStyle='#151515';ctx.fill();ctx.strokeStyle='#b5b5b5';ctx.stroke();
  ctx.save();ctx.clip();
  drawSectorSprite(ctx,'wreck',a.x,a.y,a.r*2.45,a.seed*.72);
  ctx.restore();return;
 }
 const item=rockProfile(a).item,ink=mineralInk(item);
 ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.seed*.79);
 rockPath(ROCK_SHAPES[item],a.r,a.seed);
 ctx.fillStyle=item==='ice'?'#41414191':ink.base;ctx.fill();
 ctx.strokeStyle=ink.line;ctx.lineWidth=1.25;ctx.stroke();
 ctx.clip();mineralSurface(item,a.r,a.seed);drawRockCracks(a,item);
 ctx.restore();
}
function miningImpactPoint(a) {
 const angle=Math.atan2(s.y-a.y,s.x-a.x);
 return {x:a.x+Math.cos(angle)*a.r*.71,y:a.y+Math.sin(angle)*a.r*.71};
}
function rockImpact(a,point,broken) {
 const t=broken?.91:.43;
 fx.push({...point,rockHit:true,broken,radius:a.r,item:rockProfile(a).item,seed:a.seed,t,duration:t});
}
function drawRockImpact(f) {
 const age=1-f.t/f.duration, ink=mineralInk(f.item);
 ctx.save();
 if(age<.34) {
  ctx.globalAlpha=(1-age/.34)*.87;
  ctx.fillStyle=ink.light;ctx.fillRect(f.x-2,f.y-2,4,4);
  ctx.strokeStyle=ink.line;ctx.beginPath();
  ctx.arc(f.x,f.y,2+age*(f.broken?f.radius*3:41),0,Math.PI*2);ctx.stroke();
 }
 const count=reduceMotion?4:f.broken?23:10;
 for(let i=0;i<count;i++) {
  const angle=i*2.399+f.seed, speed=24+sampleRock(f.seed,i+90)*89;
  const offset=(f.broken?f.radius*.46:2)+age*speed;
  const p={x:f.x+Math.cos(angle)*offset,y:f.y+Math.sin(angle)*offset};
  ctx.globalAlpha=(1-age)*(i%3===0?.9:.47);
  if(f.broken&&i%3===0)drawMineralShard(f.item,p,2+f.radius*.078,angle+age*2);
  else {ctx.fillStyle=ink.line;ctx.fillRect(p.x,p.y,i%3===0?2:1,1);}
 }
 ctx.restore();
}
function drawCargoIntake(f) {
 const hatch=cargoHatch(flightPose), age=1-f.t/.72;
 const ink=mineralInk(f.intake);
 ctx.save();ctx.globalAlpha=Math.min(1,f.t*4);ctx.strokeStyle=ink.light;
 ctx.beginPath();ctx.arc(hatch.x,hatch.y,4+age*12,0,Math.PI*2);ctx.stroke();
 const label=GOODS[f.intake].name+' +'+f.amount;
 ctx.font='bold 12px monospace';ctx.textAlign='center';
 const other=fx.filter(effect=>effect.intake);
 const y=hatch.y-48-other.indexOf(f)*14-(reduceMotion?0:age*18);
 ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.strokeText(label,hatch.x,y);
 ctx.fillStyle=ink.light;ctx.fillText(label,hatch.x,y);ctx.restore();
}
