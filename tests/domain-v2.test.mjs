import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorld, applyCommands, validateWorld} from '../lib/domain-v2.ts';

const now = '2026-10-13T12:00:00.000Z';
const memo = {id:'memo-1',kind:'memo',title:'Test note',content:'Persistent placement',tags:[],archived:false,createdAt:now,updatedAt:now};
const shelf = {id:'shelf-1',roomId:null,coordinateSpace:'world',kind:'shelf',name:'Bookshelf',x:0,z:0,y:0,rotation:0,scale:1};

test('v2 placements persist position through serialization and validation', () => {
  let world = applyCommands(emptyWorld(), [{type:'object.put',object:memo}], now);
  world = applyCommands(world, [{type:'furniture.put',furniture:shelf}], now);
  world = applyCommands(world, [{type:'placement.put',placement:{id:'placement-1',objectId:'memo-1',furnitureId:'shelf-1',position:{u:0.4,v:1}}}], now);
  world = applyCommands(world, [{type:'placement.move',id:'placement-1',position:{u:-0.35,v:0}}], now);
  const restored = validateWorld(JSON.parse(JSON.stringify(world)));
  assert.equal(restored.schemaVersion, 2);
  assert.deepEqual(restored.placements[0].position, {u:-0.35,v:0});
  assert.equal(restored.furniture[0].id, 'shelf-1');
});

test('v1 worlds migrate to the v2 legacy layout without dropping existing rooms', () => {
  const legacy = {
    schemaVersion:1,name:'Old Grove',objects:[],tags:[],
    rooms:Array.from({length:12},(_,i)=>({id:`room-${i}`,name:`Slot ${i}`,kind:'mansion',slots:[i],x:0,z:0,color:'#ded9cb'})),
    furniture:[],placements:[],matureCount:0
  };
  const migrated = validateWorld(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.layout, 'legacy');
  assert.equal(migrated.rooms.length, 12);
});
