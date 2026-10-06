import { z } from 'zod';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const PALETTE=['#799c83','#739db4','#b795ba','#cfb774','#c68770','#89aeb0','#b7a589','#8c91b5','#bd8e9d','#94a875'];
export const objectSchema=z.object({id,kind:z.enum(['memo','book']),title:z.string().max(200),content:z.string().max(100000),tags:z.array(id).max(100),archived:z.boolean(),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export const tagSchema=z.object({id,name:z.string().trim().min(1).max(60),color,important:z.boolean(),region:z.number().int().min(0).max(9).nullable()});
export const roomSchema=z.object({id,name:z.string().trim().min(1).max(80),kind:z.enum(['mansion','house']),slots:z.array(z.number().int().min(0).max(11)).max(12),x:z.number().finite().min(-80).max(80),z:z.number().finite().min(-80).max(80),color});
export const furnitureSchema=z.object({id,roomId:id,kind:z.enum(['shelf','wall','desk','box']),name:z.string().trim().min(1).max(80),x:z.number().finite().min(-4).max(4),z:z.number().finite().min(-4).max(4)});
export const placementPositionSchema=z.object({u:z.number().finite().min(-1).max(1),v:z.number().finite().min(-1).max(1)});
export const placementSchema=z.object({id,objectId:id,furnitureId:id,position:placementPositionSchema.optional()});
export const worldSchema=z.object({schemaVersion:z.literal(1),name:z.string().trim().min(1).max(80),objects:z.array(objectSchema).max(5000),tags:z.array(tagSchema).max(100),rooms:z.array(roomSchema).max(112),furniture:z.array(furnitureSchema).max(2000),placements:z.array(placementSchema).max(20000),matureCount:z.number().int().nonnegative()});
export type KnowledgeObject=z.infer<typeof objectSchema>;
export type Tag=z.infer<typeof tagSchema>;
export type Room=z.infer<typeof roomSchema>;
export type Furniture=z.infer<typeof furnitureSchema>;
export type Placement=z.infer<typeof placementSchema>;
export type World=z.infer<typeof worldSchema>;
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('object.put'),object:objectSchema}),z.object({type:z.literal('object.archive'),id,archived:z.boolean()}),z.object({type:z.literal('object.delete'),id}),
 z.object({type:z.literal('tag.put'),tag:tagSchema}),z.object({type:z.literal('tag.delete'),id}),z.object({type:z.literal('room.put'),room:roomSchema}),z.object({type:z.literal('room.merge'),targetId:id,sourceId:id}),z.object({type:z.literal('room.delete'),id}),
 z.object({type:z.literal('furniture.put'),furniture:furnitureSchema}),z.object({type:z.literal('furniture.delete'),id}),z.object({type:z.literal('placement.put'),placement:placementSchema}),z.object({type:z.literal('placement.delete'),id}),
 z.object({type:z.literal('furniture.move'),id,x:z.number().finite().min(-4).max(4),z:z.number().finite().min(-4).max(4)}),
 z.object({type:z.literal('room.move'),id,x:z.number().finite().min(-80).max(80),z:z.number().finite().min(-80).max(80)}),
 z.object({type:z.literal('placement.move'),id,position:placementPositionSchema}),
 z.object({type:z.literal('world.rename'),name:z.string().trim().min(1).max(80)}),z.object({type:z.literal('world.restore'),world:worldSchema})]);
export type Command=z.infer<typeof commandSchema>;
export function emptyWorld():World {return {schemaVersion:1,name:'私の思考の庭',objects:[],tags:[],rooms:Array.from({length:12},(_,i)=>({id:`room-${i}`,name:`空き区画 ${String(i+1).padStart(2,'0')}`,kind:'mansion' as const,slots:[i],x:0,z:0,color:'#ded9cb'})),furniture:[],placements:[],matureCount:0};}
function check(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
export function validateWorld(input:unknown):World {
 const w=worldSchema.parse(input);
 for(const list of [w.objects,w.tags,w.rooms,w.furniture,w.placements])check(new Set(list.map(x=>x.id)).size===list.length,'Duplicate IDs are not allowed.');
 const occupied=w.rooms.filter(r=>r.kind==='mansion').flatMap(r=>r.slots);check(occupied.length===12&&new Set(occupied).size===12,'The mansion must retain all twelve fixed slots.');
 check(w.rooms.every(r=>r.kind==='house'?r.slots.length===0&&Math.hypot(r.x,r.z)>=18:r.slots.length>0),'Place houses outside the mansion.');
 for(const r of w.rooms.filter(r=>r.kind==='mansion')){const s=new Set(r.slots);check(r.slots.length===12||r.slots.filter(v=>!s.has((v+11)%12)).length===1,'Only adjacent slots can be merged.');}
 const important=w.tags.filter(t=>t.important);check(important.length<=10&&important.every(t=>t.region!==null)&&new Set(important.map(t=>t.region)).size===important.length,'Up to ten important tags, each with its own canopy region.');
 check(w.tags.every(t=>t.important||t.region===null),'Regular tags do not have canopy regions.');
 check(new Set(w.tags.map(t=>t.name.toLocaleLowerCase())).size===w.tags.length,'A tag with that name already exists.');
 check(w.objects.every(o=>o.tags.every(t=>w.tags.some(v=>v.id===t))&&new Set(o.tags).size===o.tags.length),'Unknown or duplicate tag.');
 check(w.furniture.every(f=>w.rooms.some(r=>r.id===f.roomId)),'Furniture must belong to an existing space.');
 check(w.placements.every(p=>w.objects.some(o=>o.id===p.objectId)&&w.furniture.some(f=>f.id===p.furnitureId)),'A placement refers to missing content or furniture.');
 check(new Set(w.placements.map(p=>p.objectId+'|'+p.furnitureId)).size===w.placements.length,'This thought is already placed here.');
 check(w.matureCount>=w.objects.length,'Lifetime count cannot be smaller than the saved thought count.');return w;
}
export function applyCommands(before:World,commands:Command[],now:string):World {
 let w=structuredClone(before);
 for(const c of commands)switch(c.type){
 case 'object.put':{const old=w.objects.find(o=>o.id===c.object.id);const o={...c.object,tags:[...new Set(c.object.tags)],createdAt:old?.createdAt??now,updatedAt:now};if(old)w.objects=w.objects.map(v=>v.id===o.id?o:v);else{w.objects.push(o);w.matureCount++;}break;}
 case 'object.archive':check(w.objects.some(o=>o.id===c.id),'Thought not found.');w.objects=w.objects.map(o=>o.id===c.id?{...o,archived:c.archived,updatedAt:now}:o);break;
 case 'object.delete':w.objects=w.objects.filter(o=>o.id!==c.id);w.placements=w.placements.filter(p=>p.objectId!==c.id);break;
 case 'tag.put':{const old=w.tags.find(t=>t.id===c.tag.id);let region:number|null=null;if(c.tag.important){region=old?.important?old.region:null;if(region===null)region=Array.from({length:10},(_,i)=>i).find(i=>!w.tags.some(t=>t.important&&t.id!==c.tag.id&&t.region===i))??null;check(region!==null,'You can have up to ten important tags.');}const t={...c.tag,region};w.tags=old?w.tags.map(v=>v.id===t.id?t:v):[...w.tags,t];break;}
 case 'tag.delete':w.tags=w.tags.filter(t=>t.id!==c.id);w.objects=w.objects.map(o=>({...o,tags:o.tags.filter(t=>t!==c.id)}));break;
 case 'room.put':{const old=w.rooms.find(r=>r.id===c.room.id);check(old?old.kind===c.room.kind:c.room.kind==='house','The mansion has twelve fixed slots.');const room={...c.room,slots:old?.slots??[]};w.rooms=old?w.rooms.map(r=>r.id===room.id?room:r):[...w.rooms,room];break;}
 case 'room.merge':{const a=w.rooms.find(r=>r.id===c.targetId),b=w.rooms.find(r=>r.id===c.sourceId);check(a&&b&&a!==b&&a.kind==='mansion'&&b.kind==='mansion','Choose adjacent mansion rooms.');check(a.slots.some(s=>b.slots.includes((s+1)%12)||b.slots.includes((s+11)%12)),'The slots must be adjacent.');a.slots=[...a.slots,...b.slots].sort((x,y)=>x-y);w.rooms=w.rooms.filter(r=>r.id!==b.id);w.furniture=w.furniture.map(f=>f.roomId===b.id?{...f,roomId:a.id}:f);break;}
 case 'room.delete':{const r=w.rooms.find(r=>r.id===c.id);check(r?.kind==='house','Fixed mansion slots cannot be deleted.');const ids=w.furniture.filter(f=>f.roomId===c.id).map(f=>f.id);w.placements=w.placements.filter(p=>!ids.includes(p.furnitureId));w.furniture=w.furniture.filter(f=>f.roomId!==c.id);w.rooms=w.rooms.filter(r=>r.id!==c.id);break;}
 case 'furniture.put':w.furniture=w.furniture.some(f=>f.id===c.furniture.id)?w.furniture.map(f=>f.id===c.furniture.id?c.furniture:f):[...w.furniture,c.furniture];break;
 case 'furniture.move':{const f=w.furniture.find(f=>f.id===c.id);check(f,'Furniture not found.');f.x=c.x;f.z=c.z;break;}
 case 'room.move':{const r=w.rooms.find(r=>r.id===c.id);check(r?.kind==='house','Only outer houses can be moved.');r.x=c.x;r.z=c.z;break;}
 case 'furniture.delete':w.furniture=w.furniture.filter(f=>f.id!==c.id);w.placements=w.placements.filter(p=>p.furnitureId!==c.id);break;
 case 'placement.put':check(!w.placements.some(p=>p.objectId===c.placement.objectId&&p.furnitureId===c.placement.furnitureId&&p.id!==c.placement.id),'Already placed here.');w.placements=w.placements.some(p=>p.id===c.placement.id)?w.placements.map(p=>p.id===c.placement.id?c.placement:p):[...w.placements,c.placement];break;
 case 'placement.delete':w.placements=w.placements.filter(p=>p.id!==c.id);break;
 case 'placement.move':{const p=w.placements.find(p=>p.id===c.id);check(p,'Placement not found.');p.position=c.position;break;}
 case 'world.rename':w.name=c.name;break;
 case 'world.restore':w=validateWorld(c.world);w.matureCount=Math.max(w.matureCount,before.matureCount);break;
 }return validateWorld(w);
}
export function statistics(w:World){
 const active=w.objects.filter(o=>!o.archived),important=w.tags.filter(t=>t.important),counts=w.tags.map(t=>({...t,count:active.filter(o=>o.tags.includes(t.id)).length}));
 const pairs:{a:string;b:string;count:number;weight:number}[]=[];
 for(let i=0;i<important.length;i++)for(let j=i+1;j<important.length;j++){let count=0,weight=0;for(const o of active){const ids=o.tags.filter(t=>important.some(v=>v.id===t));if(ids.includes(important[i].id)&&ids.includes(important[j].id)){count++;weight+=1/(ids.length*(ids.length-1)/2);}}if(count)pairs.push({a:important[i].id,b:important[j].id,count,weight});}
 return {total:active.length,archived:w.objects.length-active.length,memos:active.filter(o=>o.kind==='memo').length,books:active.filter(o=>o.kind==='book').length,unplaced:active.filter(o=>!w.placements.some(p=>p.objectId===o.id)).length,untagged:active.filter(o=>!o.tags.length).length,crossTag:active.filter(o=>o.tags.filter(t=>important.some(v=>v.id===t)).length>=2).length,counts,pairs:pairs.sort((a,b)=>b.weight-a.weight),rooms:w.rooms.map(r=>({...r,count:new Set(w.placements.filter(p=>w.furniture.some(f=>f.id===p.furnitureId&&f.roomId===r.id)&&active.some(o=>o.id===p.objectId)).map(p=>p.objectId)).size}))};
}
export const visualGrowth=(n:number)=>1-Math.exp(-Math.max(0,n)/80);
export function eventLabel(c:Command[]):string{const labels:Record<Command['type'],string>={'object.put':'Saved a thought','object.archive':'Changed archive status','object.delete':'Delete thought','tag.put':'Edited a tag','tag.delete':'Delete tag','room.put':'Edited a space','room.merge':'Merge slots','room.delete':'Delete house','furniture.put':'Placed furniture','furniture.delete':'Removed furniture','furniture.move':'Moved furniture','room.move':'Moved a house','placement.move':'Moved a thought','placement.put':'Placed a thought','placement.delete':'Removed a placement','world.rename':'Renamed the grove','world.restore':'Restored a backup'};return c.length===1?labels[c[0].type]:`${labels[c[0].type]} · ${c.length} changes`;}
