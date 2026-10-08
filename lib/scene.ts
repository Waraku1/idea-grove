import {statistics,visualGrowth,type World,type Room} from './domain.ts';
import {viewPoint,clipNear,perspective,focalLength,EYE_HEIGHT,NEAR,type WalkPose} from './walk.ts';
import {buildArchitecture,furnitureFrame,furniturePoint,wallBlocksSegment,surfaceBlocksSegment,type Architecture,type FurnitureFrame} from './architecture.ts';
import {overviewBasis,placementPosition,placementPoint} from './arrange.ts';
import {drawSky,skyLight,type SkyEnvironment} from './sky.ts';
import {buildTerrain,cliffFacesCamera} from './terrain.ts';
type P=[number,number,number];
export type Camera={yaw:number;pitch:number;zoom:number};
export type Hit={id:string;kind:'room'|'tree'|'furniture'|'object';x:number;y:number;radius:number;placementId?:string};
type Shape={depth:number;draw:()=>void};
const mix=(h:string,f:number)=>{const rgb=h.slice(1).match(/../g)!.map(x=>Math.max(0,Math.min(255,Math.round(parseInt(x,16)*f))));return `rgb(${rgb.join(',')})`;};
const random=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
const sceneCache=new WeakMap<World,{architecture:Architecture;terrain:ReturnType<typeof buildTerrain>;frames:Map<string,FurnitureFrame>;stats:ReturnType<typeof statistics>;objects:Map<string,World['objects'][number]>;placements:Map<string,World['placements']>}>();
export function drawScene(ctx:CanvasRenderingContext2D,w:World,width:number,height:number,camera:Camera,selected:Room|null,inspect=false,highlight:string|null=null,walk:WalkPose|null=null,environment?:SkyEnvironment):Hit[]{
 ctx.clearRect(0,0,width,height);
 let model=sceneCache.get(w);if(!model){
  const objects=new Map(w.objects.filter(o=>!o.archived).map(o=>[o.id,o])),placements=new Map<string,World['placements']>();
  for(const p of w.placements)if(objects.has(p.objectId)){const list=placements.get(p.furnitureId)??[];list.push(p);placements.set(p.furnitureId,list);}
  model={architecture:buildArchitecture(w),terrain:buildTerrain(w),frames:new Map(w.furniture.map(f=>[f.id,furnitureFrame(w.rooms.find(r=>r.id===f.roomId)!,f)])),stats:statistics(w),objects,placements};sceneCache.set(w,model);
 }const {architecture,frames,objects,placements}=model;
 const basis=overviewBasis(width,height,camera,selected),{focus,scale,cx,cy}=basis,co=basis.right[0],si=-basis.right[2],cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const weatherState=environment?drawSky(ctx,width,height,basis.yaw,camera.pitch,walk,environment):null;
 if(!environment){const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#e9eee8');sky.addColorStop(.55,'#f3f2eb');sky.addColorStop(1,'#e6eadf');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);}
 const project=(p:P)=>{if(walk)return perspective(viewPoint(p,walk),width,height);const dx=p[0]-focus.x,dz=p[2]-focus.z,x=dx*co-dz*si,z=dx*si+dz*co;return {x:cx+x*scale,y:cy+(z*sp-p[1]*cp)*scale,depth:z*cp+p[1]*sp};};
 const shapes:Shape[]=[],hits:Hit[]=[],labels:{text:string;p:P;active:boolean}[]=[];
 const focal=focalLength(width);
 const polygon=(points:P[],fill:string,stroke?:string)=>{const vertices=walk?clipNear(points.map(p=>viewPoint(p,walk))):null;if(vertices&&vertices.length<3)return;const ps=vertices?vertices.map(p=>perspective(p,width,height)):points.map(project);if(ps.every(p=>p.x<0)||ps.every(p=>p.x>width)||ps.every(p=>p.y<0)||ps.every(p=>p.y>height))return;const ground=points.every(p=>p[1]<=.15&&Math.abs(p[1]-points[0][1])<1e-7);shapes.push({depth:ground?(walk?100000:-10000):ps.reduce((s,p)=>s+p.depth,0)/ps.length,draw:()=>{ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=skyLight(fill,weatherState);ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke();}}});};
 const curve=(points:P[],color:string,line:number)=>{
  if(walk){const samples:P[]=points.length===4?Array.from({length:25},(_,i)=>{const t=i/24,u=1-t;return [0,1,2].map(k=>u*u*u*points[0][k]+3*u*u*t*points[1][k]+3*u*t*t*points[2][k]+t*t*t*points[3][k]) as P;}):points;
   for(let i=0;i<samples.length-1;i++){let a=viewPoint(samples[i],walk),b=viewPoint(samples[i+1],walk);if(a[2]<NEAR&&b[2]<NEAR)continue;if(a[2]<NEAR||b[2]<NEAR){const t=(NEAR-a[2])/(b[2]-a[2]),c:P=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,NEAR];if(a[2]<NEAR)a=c;else b=c;}const qa=perspective(a,width,height),qb=perspective(b,width,height),depth=(a[2]+b[2])/2;shapes.push({depth:points.every(p=>p[1]<=.15)?100000:depth,draw:()=>{ctx.beginPath();ctx.moveTo(qa.x,qa.y);ctx.lineTo(qb.x,qb.y);ctx.strokeStyle=skyLight(color,weatherState);ctx.lineWidth=Math.min(150,Math.max(1,line*focal/depth));ctx.lineCap='round';ctx.stroke();}});}return;
  }
  const ps=points.map(project);shapes.push({depth:ps.reduce((s,p)=>s+p.depth,0)/ps.length,draw:()=>{ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);if(ps.length===4)ctx.bezierCurveTo(ps[1].x,ps[1].y,ps[2].x,ps[2].y,ps[3].x,ps[3].y);else ps.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.strokeStyle=skyLight(color,weatherState);ctx.lineWidth=Math.max(1,line*scale);ctx.lineCap='round';ctx.stroke();}});
 };
 const ellipse=(p:P,rx:number,ry:number,fill:string,angle=0)=>{const q=project(p);if(walk&&q.depth<NEAR)return;const es=walk?focal/q.depth:scale;shapes.push({depth:p[1]<=.05?(walk?100000:-9999):q.depth,draw:()=>{ctx.beginPath();ctx.ellipse(q.x,q.y,Math.min(1000,rx*es),Math.min(1000,ry*es),angle,0,Math.PI*2);ctx.fillStyle=skyLight(fill,weatherState);ctx.fill();}});};
 const worldPolygon=polygon;
 const box=(x:number,y:number,z:number,dx:number,dy:number,dz:number,fill:string,transform:(p:P)=>P=p=>p)=>{const polygon=(points:P[],color:string)=>worldPolygon(points.map(transform),color);polygon([[x,y,z],[x+dx,y,z],[x+dx,y+dy,z],[x,y+dy,z]],mix(fill,.8));polygon([[x,y,z+dz],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]],fill);polygon([[x,y,z],[x,y,z+dz],[x,y+dy,z+dz],[x,y+dy,z]],mix(fill,.75));polygon([[x+dx,y,z],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x+dx,y+dy,z]],mix(fill,.9));polygon([[x,y+dy,z],[x+dx,y+dy,z],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]],mix(fill,1.15));};
 const polar=(r:number,a:number,y=0):P=>[r*Math.cos(a),y,r*Math.sin(a)];
 const hit=(p:P,id:string,kind:Hit['kind'],radius:number,placementId?:string)=>{const q=project(p);if(walk&&q.depth<NEAR)return;hits.push({x:q.x,y:q.y,id,kind,placementId,radius:radius*(walk?focal/q.depth:scale)});};
  // The radial world geometry is fixed; record growth never moves buildings.
  const groundRadius=model.terrain.radius;
  for(const face of model.terrain.faces)if(cliffFacesCamera(face,walk?[walk.x,EYE_HEIGHT,walk.z]:null,basis.near))polygon(face.points,face.color);
  const ground=Array.from({length:96},(_,i)=>polar(groundRadius,i/96*Math.PI*2,-.2));polygon(ground,'#dbe1cb');
  polygon(Array.from({length:80},(_,i)=>polar(15.2,i/80*Math.PI*2,-.05)),'#dfdccb');
  polygon(Array.from({length:80},(_,i)=>polar(7.8,i/80*Math.PI*2,0)),'#d0d8bd');
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const tang:[number,number]=[-Math.sin(a),Math.cos(a)],a1=polar(13,a,.01),a2=polar(27,a,.01);polygon([[a1[0]+tang[0],.01,a1[2]+tang[1]],[a2[0]+tang[0],.01,a2[2]+tang[1]],[a2[0]-tang[0],.01,a2[2]-tang[1]],[a1[0]-tang[0],.01,a1[2]-tang[1]]],'#ece8d9');}
  for(let i=0;i<140;i++){const a=random(i+1)*Math.PI*2,r=16+random(i+100)*12;ellipse(polar(r,a,.02),.08+random(i+4)*.14,.06,['#c0cbb0','#bbc6a7','#cbd3bc'][i%3]);}

  for(const surface of architecture.floors)polygon(surface.points,surface.roomIds.includes(highlight??'')?'#d5dfc4':surface.color,surface.roomIds.includes(highlight??'')?'#819b78':'#c4c3af');
  for(const wall of architecture.walls){
   const owner=selected&&!walk?wall.owners.find(o=>o.roomId===selected.id):null;
   // Overview opens the near walls and roof of the selected room as a cutaway.
   if(owner&&owner.normal[0]*si+owner.normal[1]*co>.1)continue;
   for(const surface of wall.surfaces)polygon(surface.points,surface.color);
  }
  for(const roof of architecture.roofs){
   if(selected&&!walk&&roof.roomIds.includes(selected.id))continue;
   let color=roof.color;
   if(walk){const [a,b,c]=roof.points,u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.abs(normal[1])>.01){if(normal[1]<0)normal.forEach((n,i)=>normal[i]=-n);if(normal[0]*(walk.x-a[0])+normal[1]*(EYE_HEIGHT-a[1])+normal[2]*(walk.z-a[2])<0)color='#e7e1d2';}
   }
   polygon(roof.points,color);
  }
  for(let slot=0;slot<12;slot++){
   const angle=slot*Math.PI/6;
   if(slot===3){for(const x of [-1.1,1.1])box(x-.11,0,8.25,.22,2.6,.22,'#eee7d7');continue;}
   const p=polar(8.25,angle);box(p[0]-.11,0,p[2]-.11,.22,2.6,.22,'#eee7d7');
  }
  for(const room of w.rooms){
   if(room.kind==='house'){
    if(!selected){hit([room.x,2,room.z],room.id,'room',2.8);labels.push({text:room.name,p:[room.x,0,room.z+3],active:room.id===highlight});}
   }else for(const slot of Array.from({length:12},(_,i)=>i)){
    const mid=(slot+.5)*Math.PI/6;
    if(!selected){hit(polar(11,mid,2.6),room.id,'room',2.05);
     if(!walk){const q=project(polar(13.8,mid,.1));shapes.push({depth:q.depth,draw:()=>{ctx.fillStyle='#68765e';ctx.font='10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(String(slot+1).padStart(2,'0'),q.x,q.y);}});}
    }
   }
  }
  const furn=w.furniture;
  for(const f of furn){const frame=frames.get(f.id)!,point=(p:P)=>furniturePoint(frame,p);
   if(walk){const p=viewPoint([frame.x,1,frame.z],walk),radius=2;if(p[2]+radius<NEAR||Math.abs(p[0])>(p[2]+radius)*width/(2*focal)+radius||Math.abs(p[1])>(p[2]+radius)*height/(2*focal)+radius)continue;}
   const fbox=(x:number,y:number,z:number,dx:number,dy:number,dz:number,color:string)=>box(x,y,z,dx,dy,dz,color,point),fhit=(p:P,id:string,kind:Hit['kind'],radius:number,placementId?:string)=>{if(selected?.id===f.roomId)hit(point(p),id,kind,radius*frame.scale,placementId);};const x=0,z=0,c=f.id===highlight?'#b9c99b':'#b39a79',ps=placements.get(f.id)??[];
   if(f.kind==='shelf'){
    fbox(x-.9,0,z-.35,1.8,2.7,.08,c);fbox(x-.9,0,z-.35,.12,2.7,.65,c);fbox(x+.78,0,z-.35,.12,2.7,.65,c);fbox(x-.9,2.65,z-.35,1.8,.12,.65,c);
    for(let j=0;j<3;j++){fbox(x-.8,.25+j*.75,z-.27,1.6,.53,.03,'#725f49');fbox(x-.9,.24+j*.75,z-.35,1.8,.08,.65,c);}
   }else if(f.kind==='desk'){
    fbox(x-1,.9,z-.65,2,.18,1.3,c);for(const a of [-.8,.75])for(const b of [-.48,.45])fbox(x+a,0,z+b,.12,.9,.12,'#877055');
   }else if(f.kind==='wall'){
    fbox(x-.9,.2,z-.1,1.8,2.5,.12,'#bdad8d');fbox(x-.75,.36,z+.03,1.5,2.18,.05,'#f5f1e5');
   }else{fbox(x-.65,0,z-.55,1.3,.95,1.1,c);fbox(x-.7,.95,z-.6,1.4,.12,1.2,'#c0ad8a');fbox(x-.2,.25,z+.56,.4,.25,.02,'#786c56');}
   for(let i=0;i<ps.length;i++){
    const p=ps[i];if(i>=80&&p.id!==highlight&&!p.position)continue;
    const o=objects.get(p.objectId)!,t=w.tags.find(t=>o.tags.includes(t.id)),local=placementPoint(f,placementPosition(f,p,i)),[px,py,pz]=local;
    const paper=p.id===highlight?'#c1d39e':o.kind==='book'?(t?.color??'#a4ae8b'):'#f0eadb';
    if(f.kind==='shelf')fbox(px-.075,py-.225,pz-.09,.15,.45,.18,paper);
    else if(f.kind==='wall'){fbox(px-.28,py-.21,pz,.56,.42,.018,paper);fbox(px-.19,py-.02,pz+.02,.35,.018,.008,'#93a384');}
    else{fbox(px-.135,py-.025,pz-.16,.27,.05,.32,paper);fbox(px-.085,py+.028,pz-.08,.17,.008,.016,'#92a284');}
    fhit(local,o.id,'object',f.kind==='wall'?.28:.22,p.id);
    if(p.id===highlight&&selected?.id===f.roomId)labels.push({text:o.title||'Untitled thought',p:point([px,py+.4,pz]),active:true});
   }
   fhit([x,1,z],f.id,'furniture',.85);if(selected?.id===f.roomId)labels.push({text:`${f.name}${ps.length?' · '+ps.length:''}`,p:point([x,0,z+1.2]),active:f.id===highlight});
  }
  if(selected&&!furn.some(f=>f.roomId===selected.id))labels.push({text:'Place furniture to begin this room',p:[focus.x,0,focus.z],active:false});
// Solid trunk, branching canopy and deterministic leaf positions.
  const g=visualGrowth(w.matureCount),top=9.5+3.8*g;
  ellipse([0,.01,0],4.5,1.3,'#b9c5a5');
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;curve([[0,1,0],polar(1.2,a,.3),polar(2.1,a,.02)],'#98896d',.22);}
  box(-.45,0,-.4,.9,6.5+g, .8,'#9c8b6c');curve([[.05,0,-.3],[.15,4,-.1],[-.3,7,.3],[.2,top-.5,0]],'#a49372',.65);
  const stats=model.stats,centers=new Map<string,P>();
  if(!stats.counts.some(t=>t.important&&t.count)){for(let i=0;i<120;i++){const a=random(i)*Math.PI*2,r=Math.sqrt(random(i+30))*3.2;ellipse([Math.cos(a)*r,top+random(i+70)*2,Math.sin(a)*r],.28+random(i+99)*.5,.24+random(i+42)*.25,['#89a17b','#a1b591','#738e6b','#b2c39d'][i%4],random(i+10));}}
  for(const t of stats.counts.filter(t=>t.important&&t.count>0)){const a=t.region!/10*Math.PI*2,rad=3.1+visualGrowth(t.count)*1.8,c:P=polar(rad,a,top+.2);centers.set(t.id,c);
   curve([[0,5,0],polar(1.3,a,7),polar(rad*.8,a,top-.7),c],'#a18f70',.22);
   const size=1.35+visualGrowth(t.count)*1.4;
   for(let j=0;j<60+Math.floor(visualGrowth(t.count)*50);j++){const n=(t.region!+1)*97+j,angle=random(n)*Math.PI*2,r=Math.sqrt(random(n+700))*size;const p:P=[c[0]+Math.cos(angle)*r,c[1]+random(n+140)*2.1,c[2]+Math.sin(angle)*r];ellipse(p,.3+random(n+20)*.32,.2+random(n+70)*.27,mix(t.color,.85+random(n+200)*.3),random(n+55));}
   if(inspect&&!selected)labels.push({text:`${t.name} · ${t.count}`,p:[c[0],c[1]+2.8,c[2]],active:highlight===t.id});
  }
  for(const pair of (inspect?stats.pairs:stats.pairs.slice(0,8))){const a=centers.get(pair.a),b=centers.get(pair.b);if(!a||!b)continue;const sag=2.3+1.3*visualGrowth(pair.weight),weight=.04+.09*visualGrowth(pair.weight);curve([a,[a[0]*.75,top-sag,a[2]*.75],[b[0]*.75,top-sag,b[2]*.75],b],'#758967',weight);for(let j=1;j<=3;j++){const v=j/4,pt:P=[a[0]*(1-v)+b[0]*v,top-sag*.68,a[2]*(1-v)+b[2]*v];ellipse(pt,.15,.08,'#81966e',-.6);}}
  if(!selected){hit([0,top,0],'tree','tree',5.6);labels.push({text:w.name,p:[0,0,4.5],active:false});}

 if(weatherState&&(weatherState.rain||weatherState.snow)){
  const now=environment?.motion?(environment.now??Date.now()):environment?.weather?.observedAt??environment?.now??Date.now(),seconds=now/1000,step=3.2;
  const centerX=Math.floor((walk?.x??focus.x)/step),centerZ=Math.floor((walk?.z??focus.z)/step),range=walk?6:10;
  const eye:P=walk?[walk.x,EYE_HEIGHT,walk.z]:[0,0,0],occluded=(p:P)=>!!walk&&(architecture.walls.some(wall=>wallBlocksSegment(wall,eye,p))||architecture.roofs.some(roof=>surfaceBlocksSegment(roof.points,eye,p)));
  for(let ix=centerX-range;ix<=centerX+range;ix++)for(let iz=centerZ-range;iz<=centerZ+range;iz++){
   const seed=ix*193+iz*391+8000,intensity=Math.max(weatherState.rain,weatherState.snow);if(random(seed+77)>.3+intensity*.6)continue;
   const x=(ix+random(seed))*step,z=(iz+random(seed+19))*step,y=((random(seed+41)*26-seconds*(weatherState.snow?1.6:9))%26+26)%26;
   if(y<4.5&&architecture.floors.some(surface=>surface.points.every((a,i)=>{const b=surface.points[(i+1)%surface.points.length];return(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0])>=-1e-7;})))continue;
   if(weatherState.snow){if(!occluded([x,y,z]))ellipse([x,y,z],.05,.04,'rgba(242,247,235,.65)');}
   else{const wind=Math.min(.25,weatherState.wind/120),angle=weatherState.windDirection*Math.PI/180,a:P=[x,y,z],b:P=[x+Math.sin(angle)*wind,Math.max(.05,y-.55),z+Math.cos(angle)*wind];
    if(!walk)curve([a,b],weatherState.isDay?'rgba(101,142,137,.28)':'rgba(175,203,191,.3)',.012);
    else for(let j=0;j<3;j++){const c=a.map((n,i)=>n+(b[i]-n)*j/3) as P,d=a.map((n,i)=>n+(b[i]-n)*(j+1)/3) as P,mid=c.map((n,i)=>(n+d[i])/2) as P;if(!occluded(mid))curve([c,d],weatherState.isDay?'rgba(101,142,137,.28)':'rgba(175,203,191,.3)',.012);}
   }
  }
 }
 shapes.sort((a,b)=>walk?b.depth-a.depth:a.depth-b.depth);shapes.forEach(s=>s.draw());
 for(const l of labels){const lp:P=walk?[l.p[0],l.p[1]+(l.p[1]<1?1.2:0),l.p[2]]:l.p;if(walk&&architecture.walls.some(wall=>wallBlocksSegment(wall,[walk.x,EYE_HEIGHT,walk.z],lp)))continue;const q=project(lp);if(walk&&(q.depth<NEAR||q.x<-200||q.x>width+200||q.y<-40||q.y>height+40))continue;ctx.font='11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';const tw=ctx.measureText(l.text).width;ctx.fillStyle=l.active?'#3c5946':'rgba(248,248,240,.9)';ctx.beginPath();ctx.roundRect(q.x-tw/2-10,q.y-10,tw+20,23,7);ctx.fill();ctx.fillStyle=l.active?'#fff':'#59634f';ctx.textAlign='center';ctx.fillText(l.text,q.x,q.y+5);}
 return hits;
}
