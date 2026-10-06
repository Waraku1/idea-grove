import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorld} from '../lib/domain.ts';
import {demoWorld} from '../lib/demo.ts';
import {buildTerrain,cliffFacesCamera,groundRadius,GROUND_HEIGHT,BEDROCK_DEPTH,TERRAIN_SEGMENTS} from '../lib/terrain.ts';
import {drawScene} from '../lib/scene.ts';
import {overviewBasis} from '../lib/arrange.ts';

test('bedrock meets the unchanged circular ground without cracks or disconnected faces',()=>{
 const w=demoWorld(),terrain=buildTerrain(w);assert.equal(terrain.radius,28);assert.equal(terrain.faces.length,TERRAIN_SEGMENTS*3);
 for(let layer=0;layer<3;layer++)for(let i=0;i<TERRAIN_SEGMENTS;i++){
  const f=terrain.faces[layer*TERRAIN_SEGMENTS+i],next=terrain.faces[layer*TERRAIN_SEGMENTS+(i+1)%TERRAIN_SEGMENTS];assert.deepEqual(f.points[1],next.points[0]);assert.deepEqual(f.points[2],next.points[3]);
  if(layer===0)for(const p of f.points.slice(0,2)){assert.equal(p[1],GROUND_HEIGHT);assert.ok(Math.abs(Math.hypot(p[0],p[2])-terrain.radius)<1e-8);}
  if(layer<2){const below=terrain.faces[(layer+1)*TERRAIN_SEGMENTS+i];assert.deepEqual(f.points[3],below.points[0]);assert.deepEqual(f.points[2],below.points[1]);}
 }
 assert.ok(Math.min(...terrain.faces.flatMap(f=>f.points.map(p=>p[1]))) < -BEDROCK_DEPTH);assert.equal(JSON.stringify(w),JSON.stringify(demoWorld()));
});
test('cliffs track the same ground radius when an outer house is moved',()=>{
 const w=emptyWorld();assert.equal(groundRadius(w),28);const moved={...w,rooms:[...w.rooms,{id:'h',kind:'house',name:'H',slots:[],x:40,z:30,color:'#aabbcc'}]};assert.equal(buildTerrain(moved).radius,54);
});
test('the lower cliff edge stays below the viewport at every supported overview angle and zoom',()=>{
 const w=emptyWorld();w.rooms.push({id:'outer',kind:'house',name:'Outer house',slots:[],x:80,z:80,color:'#aabbcc'});
 const bottom=buildTerrain(w).faces.slice(-TERRAIN_SEGMENTS).flatMap(f=>f.points.slice(2));
 for(const [width,height] of [[320,2400],[390,844],[1200,800],[3840,2160],[3440,440]])
 for(const pitch of [.25,.55,1.1])for(const zoom of [.55,1,2])for(const yaw of [0,.45,1.9,Math.PI]){
  const b=overviewBasis(width,height,{yaw,pitch,zoom},null);
  for(const p of bottom){const y=b.cy+p.reduce((sum,n,i)=>sum+n*b.down[i],0)*b.scale;assert.ok(y>height+100,`cliff bottom visible at ${width}×${height}, pitch ${pitch}, zoom ${zoom}`);}
 }
});
test('only outward faces visible to the camera are drawn',()=>{
 const t=buildTerrain(emptyWorld()),front=t.faces[0],back=t.faces[TERRAIN_SEGMENTS/2];assert.equal(cliffFacesCamera(front,null,[1,.5,0]),true);assert.equal(cliffFacesCamera(back,null,[1,.5,0]),false);assert.equal(cliffFacesCamera(front,[0,1.65,0],[0,0,0]),false);assert.equal(cliffFacesCamera(front,[50,1.65,0],[0,0,0]),true);
});
test('overview renders a solid earth profile below the top edge in the visible viewport',()=>{
 let path=[],soil=[];const ctx={fillStyle:'',clearRect(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}}),beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){if(['#b6ab8f','#bdb296','#afa58a','#c1b79d','#b9b299','#c7bda5','#a8ac98','#b1b39e','#a3a792'].includes(this.fillStyle))soil.push(path.slice());},stroke(){},ellipse(){},bezierCurveTo(){},roundRect(){},measureText:t=>({width:t.length*6}),fillText(){}};
 drawScene(ctx,demoWorld(),1200,800,{yaw:-.45,pitch:.55,zoom:1},null);assert.ok(soil.length>100);assert.ok(soil.some(points=>points.some(([x,y])=>x>400&&x<800&&y>650&&y<715)));assert.ok(soil.every(points=>points.every(p=>p.every(Number.isFinite))));
});
