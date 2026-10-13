import {z} from 'zod';

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const number = z.number().finite();
const palette = ['#799c83','#739db4','#b795ba','#cfb774','#c68770','#89aeb0','#b7a589','#8c91b5','#bd8e9d','#94a875'];
const strokeSchema = z.object({id,tool:z.enum(['pen','line','highlight']),color,width:number.min(.001).max(.07),points:z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(2).max(1500)}).passthrough();
const elementSchema = z.object({id,x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:number.min(.04).max(1),h:number.min(.03).max(1),kind:z.enum(['text','sticky','image'])}).passthrough();
const surfaceSchema = z.object({strokes:z.array(strokeSchema).max(160),elements:z.array(elementSchema).max(80),showTitle:z.boolean()}).passthrough();
const appearanceSchema = z.object({color,material:z.enum(['linen','leather','paper']),cover:surfaceSchema,spine:surfaceSchema}).passthrough();
const pageSchema = z.object({id,title:z.string().max(200),text:z.string().max(100000),font:z.enum(['serif','sans','hand','mono']),fontSize:z.number().min(12).max(32),ink:color,paper:color,ruled:z.boolean(),strokes:z.array(strokeSchema).max(160),elements:z.array(elementSchema).max(80),memoId:id.optional(),cover:appearanceSchema.optional(),tags:z.array(id).max(100).optional(),createdAt:z.string().datetime().optional()}).passthrough();
const objectSchema = z.object({id,kind:z.enum(['memo','book']),title:z.string().max(200),content:z.string().max(100000),tags:z.array(id).max(100),archived:z.boolean(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),pages:z.array(pageSchema).min(1).max(300).optional(),appearance:appearanceSchema.optional()}).passthrough().transform(o=>({...o,pages:o.pages??[{id:o.id.slice(0,80)+'-page-1',title:'',text:o.content,font:'serif' as const,fontSize:18,ink:'#3c443c',paper:'#fcf8ed',ruled:false,strokes:[],elements:[]}],appearance:o.appearance??{color:o.kind==='book'?'#739184':'#eee4ce',material:o.kind==='book'?'linen' as const:'paper' as const,cover:{strokes:[],elements:[],showTitle:true},spine:{strokes:[],elements:[],showTitle:true}}}));
const tagSchema = z.object({id,name:z.string().trim().min(1).max(60),color,important:z.boolean(),region:z.number().int().min(0).max(9).nullable()}).passthrough();
const roomSchema = z.object({id,name:z.string().trim().min(1).max(80),kind:z.enum(['mansion','house']),slots:z.array(z.number().int().min(0).max(11)).max(12),x:number.min(-80).max(80),z:number.min(-80).max(80),color}).passthrough();
const furnitureSchema = z.object({id,roomId:id.nullable(),kind:z.enum(['shelf','wall','desk','box','chair','sofa','bed','lamp','plant','rug']),name:z.string().trim().min(1).max(80),x:number.min(-80).max(80),z:number.min(-80).max(80),coordinateSpace:z.enum(['room','world']).optional(),y:number.min(0).max(18).optional(),rotation:number.min(-3600).max(3600).optional(),scale:number.min(.5).max(2).optional(),color:color.optional()}).passthrough();
const placementPositionSchema = z.object({u:number.min(-1).max(1),v:number.min(-1).max(1)}).passthrough();
const placementSchema = z.object({id,objectId:id,furnitureId:id,position:placementPositionSchema.optional()}).passthrough();
const partSchema = z.object({id,kind:z.enum(['wall','door','window','column','floor','ceiling','stairs','beam','fence','frame']),x:number.min(-80).max(80),y:number.min(0).max(18),z:number.min(-80).max(80),rotation:number.min(-3600).max(3600),width:number.min(.1).max(12),height:number.min(.05).max(8),depth:number.min(.05).max(12),color,open:z.boolean().optional(),image:z.unknown().optional()}).passthrough();
const worldSchema = z.object({schemaVersion:z.literal(2),layout:z.enum(['free','legacy']),parts:z.array(partSchema).max(3000),name:z.string().trim().min(1).max(80),objects:z.array(objectSchema).max(5000),tags:z.array(tagSchema).max(100),rooms:z.array(roomSchema).max(112),furniture:z.array(furnitureSchema).max(2000),placements:z.array(placementSchema).max(20000),matureCount:z.number().int().nonnegative()}).passthrough();
const movePosition = placementPositionSchema;
const commandSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('object.put'),object:objectSchema}),z.object({type:z.literal('object.archive'),id,archived:z.boolean()}),z.object({type:z.literal('object.delete'),id}),
 z.object({type:z.literal('tag.put'),tag:tagSchema}),z.object({type:z.literal('tag.delete'),id}),z.object({type:z.literal('room.put'),room:roomSchema}),z.object({type:z.literal('room.merge'),targetId:id,sourceId:id}),z.object({type:z.literal('room.delete'),id}),
 z.object({type:z.literal('furniture.put'),furniture:furnitureSchema}),z.object({type:z.literal('furniture.delete'),id}),z.object({type:z.literal('placement.put'),placement:placementSchema}),z.object({type:z.literal('placement.delete'),id}),
 z.object({type:z.literal('furniture.move'),id,x:number.min(-80).max(80),z:number.min(-80).max(80),y:number.min(0).max(18).optional(),rotation:number.min(-3600).max(3600).optional(),coordinateSpace:z.enum(['room','world']).optional()}),
 z.object({type:z.literal('room.move'),id,x:number.min(-80).max(80),z:number.min(-80).max(80)}),z.object({type:z.literal('placement.move'),id,position:movePosition}),
 z.object({type:z.literal('part.put'),part:partSchema}),z.object({type:z.literal('part.delete'),id}),z.object({type:z.literal('part.move'),id,x:number.min(-80).max(80),z:number.min(-80).max(80),y:number.min(0).max(18).optional(),rotation:number.min(-3600).max(3600).optional()}),
 z.object({type:z.literal('book.combine'),memoIds:z.array(id).min(1).max(300),bookId:id,title:z.string().max(200)}),z.object({type:z.literal('book.insert'),bookId:id,memoIds:z.array(id).min(1).max(300),index:z.number().int().min(0).max(300)}),z.object({type:z.literal('book.split'),bookId:id,memoIds:z.array(id).min(1).max(300)}),
 z.object({type:z.literal('world.reset'),requestId:z.literal('fresh-garden-2026-10-07').optional()}),z.object({type:z.literal('world.rename'),name:z.string().trim().min(1).max(80)}),z.object({type:z.literal('world.restore'),world:z.unknown()})
]);
export type V2World = z.infer<typeof worldSchema>;
export type V2Command = z.infer<typeof commandSchema>;
export {commandSchema};

export function emptyWorld(): V2World {return {schemaVersion:2,layout:'free',parts:[],name:'My Grove',objects:[],tags:[],rooms:[],furniture:[],placements:[],matureCount:0};}
function assert(ok:unknown,message:string):asserts ok {if(!ok) throw new Error(message);}
function migrateWorld(input: any): V2World {
 if(input && input.schemaVersion===2) return worldSchema.parse(input);
 if(!input || input.schemaVersion!==1) return emptyWorld();
 const objects=(input.objects??[]).map((o:any)=>({...o,pages:o.pages??[{id:String(o.id).slice(0,80)+'-page-1',title:'',text:o.content??'',font:'serif',fontSize:18,ink:'#3c443c',paper:'#fcf8ed',ruled:false,strokes:[],elements:[]}],appearance:o.appearance??{color:o.kind==='book'?'#739184':'#eee4ce',material:o.kind==='book'?'linen':'paper',cover:{strokes:[],elements:[],showTitle:true},spine:{strokes:[],elements:[],showTitle:true}}}));
 const furniture=(input.furniture??[]).map((f:any)=>({...f,coordinateSpace:f.coordinateSpace??'room',y:f.y??0,rotation:f.rotation??0,scale:f.scale??1}));
 return worldSchema.parse({schemaVersion:2,layout:'legacy',parts:[],name:input.name??'My Grove',objects,tags:input.tags??[],rooms:input.rooms??[],furniture,placements:input.placements??[],matureCount:input.matureCount??objects.length});
}
export function validateWorld(input:unknown):V2World {
 const w=migrateWorld(input);
 for(const list of [w.objects,w.tags,w.rooms,w.furniture,w.placements,w.parts]) assert(new Set(list.map(x=>x.id)).size===list.length,'Duplicate IDs are not allowed.');
 const slots=w.rooms.filter(r=>r.kind==='mansion').flatMap(r=>r.slots);
 assert(w.layout==='free'||slots.length===12&&new Set(slots).size===12,'The mansion must retain all twelve fixed slots.');
 assert(w.rooms.every(r=>r.kind==='house'?r.slots.length===0&&Math.hypot(r.x,r.z)>=18:r.slots.length>0),'Place houses outside the mansion.');
 for(const r of w.rooms.filter(r=>r.kind==='mansion')) {const s=new Set(r.slots);assert(r.slots.length===12||r.slots.filter(v=>!s.has((v+11)%12)).length===1,'Only adjacent slots can be merged.');}
 const important=w.tags.filter(t=>t.important);
 assert(important.length<=10&&important.every(t=>t.region!==null)&&new Set(important.map(t=>t.region)).size===important.length,'Up to ten important tags, each with its own canopy region.');
 assert(w.tags.every(t=>t.important||t.region===null),'Regular tags do not have canopy regions.');
 assert(new Set(w.tags.map(t=>t.name.toLocaleLowerCase())).size===w.tags.length,'A tag with that name already exists.');
 assert(w.objects.every(o=>o.tags.every(t=>w.tags.some(v=>v.id===t))&&new Set(o.tags).size===o.tags.length),'Unknown or duplicate tag.');
 assert(w.furniture.every(f=>(f.roomId===null&&f.coordinateSpace==='world')||w.rooms.some(r=>r.id===f.roomId)),'Furniture must belong to an existing space.');
 assert(w.furniture.every(f=>f.coordinateSpace==='world'||(Math.abs(f.x)<=4&&Math.abs(f.z)<=4)),'Legacy room positions must be between -4 and 4.');
 const pages=w.objects.flatMap(o=>o.pages);
 assert(new Set(pages.map(p=>p.id)).size===pages.length,'Each page must have its own identity.');
 assert(w.objects.every(o=>o.kind==='book'||o.pages.length===1),'A memo contains exactly one page.');
 assert(w.placements.every(p=>w.objects.some(o=>o.id===p.objectId)&&w.furniture.some(f=>f.id===p.furnitureId)),'A placement refers to missing content or furniture.');
 assert(new Set(w.placements.map(p=>p.objectId+'|'+p.furnitureId)).size===w.placements.length,'This thought is already placed here.');
 assert(w.matureCount>=w.objects.length,'Lifetime count cannot be smaller than the saved thought count.');
 return w;
}
export function applyCommands(before:unknown,commands:V2Command[],now:string):V2World {
 let w=validateWorld(before);
 for(const raw of commands) {
  const c=commandSchema.parse(raw);
  switch(c.type) {
   case 'object.put': {const old=w.objects.find(o=>o.id===c.object.id),o={...c.object,tags:[...new Set(c.object.tags)],createdAt:old?.createdAt??c.object.createdAt,updatedAt:now};w.objects=old?w.objects.map(v=>v.id===o.id?o:v):[...w.objects,o];if(!old)w.matureCount++;break;}
   case 'object.archive': assert(w.objects.some(o=>o.id===c.id),'Thought not found.');w.objects=w.objects.map(o=>o.id===c.id?{...o,archived:c.archived,updatedAt:now}:o);break;
   case 'object.delete': w.objects=w.objects.filter(o=>o.id!==c.id);w.placements=w.placements.filter(p=>p.objectId!==c.id);break;
   case 'tag.put': {const old=w.tags.find(t=>t.id===c.tag.id);let region:number|null=null;if(c.tag.important){region=old?.important?old.region:null;if(region===null)region=Array.from({length:10},(_,i)=>i).find(i=>!w.tags.some(t=>t.important&&t.id!==c.tag.id&&t.region===i))??null;assert(region!==null,'You can have up to ten important tags.');}const tag={...c.tag,region};w.tags=old?w.tags.map(v=>v.id===tag.id?tag:v):[...w.tags,tag];break;}
   case 'tag.delete': w.tags=w.tags.filter(t=>t.id!==c.id);w.objects=w.objects.map(o=>({...o,tags:o.tags.filter(t=>t!==c.id)}));break;
   case 'room.put': {const old=w.rooms.find(r=>r.id===c.room.id);assert(old?old.kind===c.room.kind:c.room.kind==='house','The mansion has twelve fixed slots.');const room={...c.room,slots:old?.slots??[]};w.rooms=old?w.rooms.map(r=>r.id===room.id?room:r):[...w.rooms,room];break;}
   case 'room.merge': {const a=w.rooms.find(r=>r.id===c.targetId),b=w.rooms.find(r=>r.id===c.sourceId);assert(a&&b&&a!==b&&a.kind==='mansion'&&b.kind==='mansion','Choose adjacent mansion rooms.');assert(a.slots.some(s=>b.slots.includes((s+1)%12)||b.slots.includes((s+11)%12)),'The slots must be adjacent.');a.slots=[...a.slots,...b.slots].sort((x,y)=>x-y);w.rooms=w.rooms.filter(r=>r.id!==b.id);w.furniture=w.furniture.map(f=>f.roomId===b.id?{...f,roomId:a.id}:f);break;}
   case 'room.delete': {const room=w.rooms.find(r=>r.id===c.id);assert(room?.kind==='house','Fixed mansion slots cannot be deleted.');const ids=w.furniture.filter(f=>f.roomId===c.id).map(f=>f.id);w.placements=w.placements.filter(p=>!ids.includes(p.furnitureId));w.furniture=w.furniture.filter(f=>f.roomId!==c.id);w.rooms=w.rooms.filter(r=>r.id!==c.id);break;}
   case 'furniture.put': w.furniture=w.furniture.some(f=>f.id===c.furniture.id)?w.furniture.map(f=>f.id===c.furniture.id?c.furniture:f):[...w.furniture,c.furniture];break;
   case 'furniture.move': {const f=w.furniture.find(f=>f.id===c.id);assert(f,'Furniture not found.');w.furniture=w.furniture.map(v=>v.id===f.id?{...v,x:c.x,z:c.z,...(c.y===undefined?{}:{y:c.y}),...(c.rotation===undefined?{}:{rotation:c.rotation}),...(c.coordinateSpace===undefined?{}:{coordinateSpace:c.coordinateSpace})}:v);break;}
   case 'room.move': {const room=w.rooms.find(r=>r.id===c.id);assert(room?.kind==='house','Only outer houses can be moved.');w.rooms=w.rooms.map(v=>v.id===room.id?{...v,x:c.x,z:c.z}:v);break;}
   case 'furniture.delete': w.furniture=w.furniture.filter(f=>f.id!==c.id);w.placements=w.placements.filter(p=>p.furnitureId!==c.id);break;
   case 'placement.put': assert(!w.placements.some(p=>p.objectId===c.placement.objectId&&p.furnitureId===c.placement.furnitureId&&p.id!==c.placement.id),'Already placed here.');w.placements=w.placements.some(p=>p.id===c.placement.id)?w.placements.map(p=>p.id===c.placement.id?c.placement:p):[...w.placements,c.placement];break;
   case 'placement.delete': w.placements=w.placements.filter(p=>p.id!==c.id);break;
   case 'placement.move': {assert(w.placements.some(p=>p.id===c.id),'Placement not found.');w.placements=w.placements.map(p=>p.id===c.id?{...p,position:c.position}:p);break;}
   case 'part.put': w.parts=w.parts.some(p=>p.id===c.part.id)?w.parts.map(p=>p.id===c.part.id?c.part:p):[...w.parts,c.part];break;
   case 'part.delete': w.parts=w.parts.filter(p=>p.id!==c.id);break;
   case 'part.move': {assert(w.parts.some(p=>p.id===c.id),'Part not found.');w.parts=w.parts.map(p=>p.id===c.id?{...p,x:c.x,z:c.z,...(c.y===undefined?{}:{y:c.y}),...(c.rotation===undefined?{}:{rotation:c.rotation})}:p);break;}
   case 'book.combine': {const memos=w.objects.filter(o=>c.memoIds.includes(o.id)&&o.kind==='memo');assert(memos.length===c.memoIds.length,'One or more thoughts were not found.');const first=memos[0];const pages=memos.map(o=>({...o.pages[0],id:o.pages[0].id,memoId:o.id,tags:[...o.tags]}));const book={id:c.bookId,kind:'book' as const,title:c.title,content:memos.map(o=>o.content).join('\n\n'),tags:[...new Set(memos.flatMap(o=>o.tags))],archived:false,createdAt:first.createdAt,updatedAt:now,pages,appearance:first.appearance};w.objects=[...w.objects.filter(o=>!c.memoIds.includes(o.id)),book];const oldPlacements=w.placements.filter(p=>c.memoIds.includes(p.objectId));w.placements=w.placements.filter(p=>!c.memoIds.includes(p.objectId));for(const p of oldPlacements)if(!w.placements.some(q=>q.objectId===book.id&&q.furnitureId===p.furnitureId))w.placements.push({...p,id:p.id+'-book',objectId:book.id});break;}
   case 'book.insert': {const book=w.objects.find(o=>o.id===c.bookId&&o.kind==='book');assert(book,'Book not found.');const memos=w.objects.filter(o=>c.memoIds.includes(o.id)&&o.kind==='memo');assert(memos.length===c.memoIds.length,'One or more thoughts were not found.');const pages=[...book.pages];pages.splice(c.index,0,...memos.map(o=>({...o.pages[0],memoId:o.id,tags:[...o.tags]})));w.objects=w.objects.filter(o=>!c.memoIds.includes(o.id)).map(o=>o.id===book.id?{...o,pages,content:pages.map(p=>p.text).join('\n\n'),tags:[...new Set([...o.tags,...memos.flatMap(m=>m.tags)])],updatedAt:now}:o);break;}
   case 'book.split': {const book=w.objects.find(o=>o.id===c.bookId&&o.kind==='book');assert(book,'Book not found.');const pages=book.pages;const memos=pages.map((p,i)=>({id:c.memoIds[i]??p.memoId??p.id,kind:'memo' as const,title:p.title||'Untitled',content:p.text,tags:p.tags??book.tags,archived:book.archived,createdAt:p.createdAt??book.createdAt,updatedAt:now,pages:[{...p,memoId:undefined}],appearance:p.cover??{color:'#eee4ce',material:'paper' as const,cover:{strokes:[],elements:[],showTitle:true},spine:{strokes:[],elements:[],showTitle:true}}}));w.objects=[...w.objects.filter(o=>o.id!==book.id),...memos];w.placements=w.placements.filter(p=>p.objectId!==book.id);break;}
   case 'world.reset': {const count=w.matureCount;w=emptyWorld();w.matureCount=count;break;}
   case 'world.rename': w.name=c.name;break;
   case 'world.restore': w=validateWorld(c.world);break;
  }
 }
 return validateWorld(w);
}
export function eventLabel(commands:V2Command[]):string {
 const labels:Record<V2Command['type'],string>={'object.put':'Saved a thought','object.archive':'Changed archive status','object.delete':'Deleted a thought','tag.put':'Edited a tag','tag.delete':'Deleted a tag','room.put':'Edited a space','room.merge':'Merged slots','room.delete':'Deleted a house','furniture.put':'Placed furniture','furniture.delete':'Removed furniture','furniture.move':'Moved furniture','room.move':'Moved a house','placement.move':'Moved a thought','placement.put':'Placed a thought','placement.delete':'Removed a placement','part.put':'Placed structure','part.delete':'Removed structure','part.move':'Moved structure','book.combine':'Collected thoughts into a book','book.insert':'Inserted thoughts into a book','book.split':'Split a book into thoughts','world.reset':'Reset the grove','world.rename':'Renamed the grove','world.restore':'Restored a backup'};
 return commands.length===1?labels[commands[0].type]:`${labels[commands[0].type]} · ${commands.length} changes`;
}
