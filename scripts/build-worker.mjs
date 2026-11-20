import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createRuntime}=require('../tests/runtime.cjs');
const runtime=createRuntime();
const catalog=JSON.parse(runtime.run(`JSON.stringify({
 types, weapons:WEAPONS, damage:DAMAGE_TYPES, ammo:AMMUNITION, goods:GOODS, regions:REGIONS,
 places:PLACES, enemyInfo:ENEMY_INFO, enemies:s.enemies, rocksByType:ROCKS, techs:TECHS,
 starters:Object.fromEntries(Object.entries(STARTER_SHIPS).map(([id,ship])=>[id,ship.modules()])),
 rocks:s.asteroids.filter((a,i)=>i%5===0||Math.hypot(a.x,a.y)<850||a.id.startsWith('industry-')||a.id.startsWith('massive-'))
})`));
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const assets={};
async function list(directory,prefix='') {
 for (const entry of await readdir(directory,{withFileTypes:true})) {
  if (entry.isDirectory()&&entry.name!=='server'&&entry.name!=='.openai') await list(resolve(directory,entry.name),prefix+'/'+entry.name);
  if (!entry.isFile()||!Object.hasOwn(types,extname(entry.name))) continue;
  const binary=entry.name.endsWith('.png');
  assets[prefix+'/'+entry.name]={type:types[extname(entry.name)],binary,content:await readFile(resolve(directory,entry.name),binary?'base64':'utf8')};
 }
}
await list(root);
assets['/']=assets['/index.html'];
const sources=await Promise.all(['dist/flight-core.js','server/simulation.mjs','server/api.mjs'].map(file=>readFile(file,'utf8')));
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',[
 'const STATIC_ASSETS = '+JSON.stringify(assets)+';',
 'const CATALOG = '+JSON.stringify(catalog)+';',
 ...sources,
 'export { FlightCore, CATALOG, makeShip, makePilot, makeRoom, stepRoom, useDock, spawnFragments };',
].join('\n'));
