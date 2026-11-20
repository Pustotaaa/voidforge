const vm=require('vm'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('dist/index.html','utf8');const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique DOM IDs');
function createRuntime({width=390,height=844,makeCanvas=null,loadSprite=null,artImages=null,storage=null,coopFetch=null}={}) {
const els={},handlers={},stored=new Map(storage),sectorRect={left:0,top:0,width:720,height:720},drawing=new Proxy({measureText:s=>({width:s.length*7.3})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
function element(id){const classes=new Set(/Modal|builder/.test(id)?['hidden']:[]);return {id,width:136,height:88,style:{},dataset:{},children:[],textContent:'',innerHTML:'',disabled:false,parentElement:{classList:{toggle(){}}},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){const on=v===undefined?!classes.has(k):v;on?classes.add(k):classes.delete(k);return on;}},getContext:()=>drawing,addEventListener(k,f){this[k]=f;},getBoundingClientRect:()=>id==='sectorMap'?sectorRect:({left:0,top:0,width:id==='joystick'?118:id==='editor'?540:720,height:id==='joystick'?118:id==='editor'?440:720}),focus(){env.document.activeElement=this;},getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];},setAttribute(){},setPointerCapture(){},releasePointerCapture(){},hasPointerCapture:()=>false,replaceChildren(...a){this.children=a;},appendChild(a){this.children.push(a);return a;},querySelector(){return els.closeHelp;},querySelectorAll(){return [els.closeHelp];},click(){if(!this.disabled)this.onclick?.();}};}
for(const id of ids)els[id]=element(id);
if(artImages)for(const [id,asset] of Object.entries(artImages))els[id]=asset;
const canvases={};
if(makeCanvas)for(const tag of html.matchAll(/<canvas[^>]+>/g)){
 const attrs=Object.fromEntries([...tag[0].matchAll(/(id|height|width)="([^"]+)"/g)].map(([,k,v])=>[k,v]));
 const canvas=canvases[attrs.id]=makeCanvas(Number(attrs.width)||300,Number(attrs.height)||150);
 const el=els[attrs.id];
 for(const key of ['width','height'])Object.defineProperty(el,key,{get:()=>canvas[key],set:value=>{if(canvas[key]!==value)canvas[key]=value}});
 el.getContext=(...args)=>canvas.getContext(...args);
 if(attrs.id==='sectorMap')el.getBoundingClientRect=()=>sectorRect;
}
const datasets={};for(const [,key,value]of html.matchAll(/data-([a-z]+)="([^"]+)"/g)){const el=element('data');el.dataset[key]=value;(datasets[key]??=[]).push(el);}
const session=new Map();
const env={URL,AbortSignal,performance,crypto:require('node:crypto').webcrypto,fetch:coopFetch,location:{href:'https://voidforge-one-bit-7k9.lavishcoil.chatgpt.site/',pathname:'/'},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},document:{getElementById(id){if(!els[id])throw Error('Missing DOM '+id);return els[id];},createElement:tag=>tag==='canvas'&&makeCanvas?makeCanvas(1,1):tag==='img'&&loadSprite?loadSprite():element('new'),createTextNode:text=>({textContent:text}),querySelectorAll(selector){if(selector==='[data-part]')return els.parts.children;if(selector==='[data-tech]')return els.techTree.children;return datasets[selector.slice(6,-1)]||[];},addEventListener(k,f){handlers['doc-'+k]=f;},hidden:false},innerWidth:width,innerHeight:height,devicePixelRatio:makeCanvas?1:2,addEventListener(k,f){(handlers[k]??=[]).push(f);},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},setTimeout(){},clearTimeout(){},setInterval(){},requestAnimationFrame(){},console};vm.createContext(env);for(const file of ['flight-core.js','game.js','expedition.js','navigation.js','campaign.js','flight-services.js','industry.js','combat.js','act.js','sector-art.js','effects.js','presentation.js','launch.js','coop-net.js','coop.js','boot.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),env);
return {env,els,handlers,stored,sectorRect,canvases,run:code=>vm.runInContext(code,env)};
}
module.exports={createRuntime};
