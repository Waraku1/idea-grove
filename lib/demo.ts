import {emptyWorld,PALETTE,type World} from './domain.ts';
export function demoWorld(stage=6):World {
 const w=emptyWorld();w.name='A garden of connected thoughts';
 w.tags=[{id:'math',name:'Mathematics',color:PALETTE[3],important:true,region:0},{id:'physics',name:'Physics',color:PALETTE[1],important:true,region:2},{id:'philosophy',name:'Philosophy',color:PALETTE[2],important:true,region:4},{id:'computing',name:'Computing',color:PALETTE[0],important:true,region:6},{id:'creative',name:'Ideas',color:PALETTE[4],important:true,region:8},{id:'question',name:'Questions',color:PALETTE[5],important:false,region:null}];
 const names=['Mathematics Library','Physics Studio','Philosophy Room','Creative Atelier','Projects','Thought Laboratory'];
 const positions=[[0,22],[11,19],[-11,19],[21,8],[-21,8],[0,-23]] as const;
 w.rooms=names.slice(0,Math.max(1,Math.min(stage,6))).map((name,i)=>({id:`demo-house-${i}`,name,kind:'house' as const,x:positions[i][0],z:positions[i][1],color:w.tags[i%5].color}));
 if(stage>=3)w.rooms.push({id:'house-cube',name:'Cube Lab',kind:'house',x:20,z:-8,color:'#8da78b'});
 if(stage>=5)w.rooms.push({id:'house-ideas',name:'Ideas Retreat',kind:'house',x:-20,z:-8,color:'#b29b88'});
 for(const r of w.rooms.filter(r=>!r.name.startsWith('空き')))for(const [j,kind] of (['shelf','desk','wall','box'] as const).entries())w.furniture.push({id:`f-${r.id}-${j}`,roomId:r.id,kind,name:['Bookshelf','Working desk','Display wall','Archive box'][j],x:[-2,1,0,2][j],z:[-2,1,-3,2][j]});
 const titles=['Whose present moment is it?','A rotating sphere and its accelerometer','The state space of a Rubik’s Cube','When imagination becomes knowledge','A record of small discoveries','Between theory and observation','Questions without an answer yet','Programs that describe the world','An idea for a new application','Curves that connect our thoughts'];
 for(let i=0;i<stage*14;i++){
  const t=w.tags[i%5],tags=[t.id];if(i%3===0)tags.push(w.tags[(i+2)%5].id);if(i%11===0)tags.push(w.tags[(i+3)%5].id);
  const o={id:`demo-${i}`,kind:i%3===0?'book' as const:'memo' as const,title:titles[i%10]+(i>=10?` / ${Math.floor(i/10)+1}`:''),content:'This is sample content.\n\nCapture a thought before deciding how to classify it.\nAdd tags later, and place it somewhere in your grove.\n\nA question about why something happens can be the beginning of a new idea.',tags,archived:false,createdAt:new Date(Date.UTC(2026,3+Math.floor(i/14),1+i%14)).toISOString(),updatedAt:new Date(Date.UTC(2026,3+Math.floor(i/14),1+i%14)).toISOString()};
  w.objects.push(o);if(i%7!==0){const f=w.furniture[i%w.furniture.length];w.placements.push({id:`p-${i}`,objectId:o.id,furnitureId:f.id});if(i%9===0)w.placements.push({id:`p2-${i}`,objectId:o.id,furnitureId:w.furniture[(i+5)%w.furniture.length].id});}
 }w.matureCount=w.objects.length;return w;
}
