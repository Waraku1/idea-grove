import test, {after} from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {brotliCompressSync, brotliDecompressSync} from 'node:zlib';
import {PGlite} from '@electric-sql/pglite';
import {createNeonDatabase, validateDatabaseURL} from '../deployment/render/database.ts';
import {handleRenderRequest, validateRenderOrigin, renderEnvironment, verifyRenderDatabase} from '../deployment/render/server.ts';
import {signClaims, SESSION_COOKIE} from '../deployment/auth.ts';
import {postWorld} from '../lib/api-handlers.ts';

const pg = await PGlite.create();
await pg.exec(readFileSync('deployment/render/schema.sql', 'utf8'));
const db = createNeonDatabase('postgresql://test:test@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require', async (query, values) => (await pg.query(query, values)).rows);
const root = await mkdtemp(join(tmpdir(), 'grove-render-'));
await mkdir(join(root, 'assets'));
await writeFile(join(root, 'index.html'), '<!doctype html><html lang="en">Idea Grove</html>');
await writeFile(join(root, 'assets/app.js'), '/* public application */');
await writeFile(join(root, 'assets/recovered-entry.js'), '/* bootstrap entry */');
await writeFile(join(root, 'assets/app.js.br'), brotliCompressSync(Buffer.from('/* public application */')));
await writeFile(join(root, 'secret.txt'), 'not a public asset');
await symlink(join(root, 'secret.txt'), join(root, 'assets/private.js'));
const outside = await mkdtemp(join(tmpdir(), 'grove-private-'));
await writeFile(join(outside, 'secret.js'), 'private');
await symlink(join(outside, 'secret.js'), join(root, 'assets/escape.js'));
after(async () => {await pg.close(); await rm(root, {recursive:true, force:true}); await rm(outside, {recursive:true, force:true});});
const origin = 'https://idea-grove-test.onrender.com', now = Math.floor(Date.now()/1000);
const env = {PUBLIC_ORIGIN:origin, GITHUB_CLIENT_ID:'test-client', GITHUB_CLIENT_SECRET:'test-secret', SESSION_SECRET:'test-session-key-with-more-than-43-characters-0000000000', OWNER_GITHUB_ID:'153403020', HOSTING_PROVIDER:'render', APP_VERSION:'0.6', DB:db};
const cookie = async (id='153403020') => SESSION_COOKIE + '=' + await signClaims({v:1,purpose:'session',iss:origin,iat:now,exp:now+3600,githubId:id,login:id==='153403020'?'Waraku1':'other',name:null}, env.SESSION_SECRET);
const req = (path, init={}) => new Request(origin+path, init);
const write = (revision, commands, headers={}) => req('/api/world', {method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify({revision,commands})});
const thought = {id:'private',kind:'memo',title:'My thought',content:'first account private content',tags:[],archived:false,createdAt:'2026-10-06T00:00:00Z',updatedAt:'2026-10-06T00:00:00Z'};

test('recovered Render bootstrap script parses and invokes its startup function',()=>{
 const source=readFileSync('deployment/render/public/assets/recovered-entry.js','utf8');
 assert.match(source, /\bstart\(\);\s*$/);
 assert.doesNotMatch(source, /\}\)\(\);\s*$/);
 execFileSync(process.execPath, ['--check', 'deployment/render/public/assets/recovered-entry.js']);
});
test('Render configuration accepts only an actual free-host origin and a private TLS Neon connection',()=>{
 assert.equal(validateRenderOrigin(origin), origin);
 for(const url of ['http://idea-grove.onrender.com','https://other.example','https://idea-grove.onrender.com/path','https://user:pass@idea-grove.onrender.com','https://idea-grove.onrender.com:8443'])assert.throws(()=>validateRenderOrigin(url));
 for(const url of ['postgresql://test:test@other.example/db?sslmode=require','postgresql://test:test@ep-test.neon.tech/db?sslmode=disable','postgresql://ep-test.neon.tech/db?sslmode=require'])assert.throws(()=>validateDatabaseURL(url));
 assert.throws(()=>renderEnvironment({RENDER_EXTERNAL_URL:origin}));
 const blueprint=readFileSync('render.yaml','utf8');assert.match(blueprint,/plan: free/);assert.match(blueprint,/autoDeployTrigger: "off"/);assert.doesNotMatch(blueprint,/^databases:|\bdisks:|\bmaxInstances:/m);
});
test('the public session bootstrap never accepts forged identity headers or discloses credentials',async()=>{
 let response=await handleRenderRequest(req('/session',{headers:{'oai-authenticated-user-id':'github:153403020','grove-auth-provider':'github','grove-auth-login':'Waraku1'}}),env,root);
 assert.deepEqual(await response.json(),{signedIn:false,userKey:'guest'});
 response=await handleRenderRequest(req('/session',{headers:{cookie:await cookie()}}),env,root);
 assert.deepEqual(await response.json(),{signedIn:true,userKey:'github:153403020'});assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await handleRenderRequest(req('/api/world'),env,root)).status,401);
});
test('startup checks the actual database schema and refuses an incomplete installation',async()=>{
 await verifyRenderDatabase(db);
 await pg.exec('ALTER FUNCTION grove_erase(text,text) RENAME TO unavailable_erase');
 try {await assert.rejects(verifyRenderDatabase(db),/schema is incomplete/);} finally {await pg.exec('ALTER FUNCTION unavailable_erase(text,text) RENAME TO grove_erase');}
 await assert.rejects(verifyRenderDatabase(undefined),/schema is incomplete/);
});
test('the same gateway preserves owner isolation, history casing and PostgreSQL persistence',async()=>{
 const ownerCookie=await cookie(),otherCookie=await cookie('2');
 let response=await handleRenderRequest(write(0,[{type:'object.put',object:thought}],{cookie:ownerCookie}),env,root);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 const own=await(await handleRenderRequest(req('/api/world',{headers:{cookie:ownerCookie}}),env,root)).json();assert.equal(own.world.objects[0].content,thought.content);
 const other=await(await handleRenderRequest(req('/api/world',{headers:{cookie:otherCookie}}),env,root)).json();assert.equal(other.revision,0);assert.equal(other.world.objects.length,0);
 const history=await(await handleRenderRequest(req('/api/history',{headers:{cookie:ownerCookie}}),env,root)).json();assert.equal(history.events.length,1);assert.equal(typeof history.events[0].occurredAt,'string');
 assert.equal((await handleRenderRequest(req('/api/history?revision=1',{headers:{cookie:otherCookie}}),env,root)).status,404);
});
test('two concurrent PostgreSQL saves have one winner and leave no partial history',async()=>{
 const c=await cookie();const responses=await Promise.all(['A','B'].map(name=>handleRenderRequest(write(1,[{type:'world.rename',name}],{cookie:c}),env,root)));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const rows=await pg.query('SELECT revision FROM world_events WHERE owner_id=$1 ORDER BY revision',['github:153403020']);assert.deepEqual(rows.rows.map(r=>r.revision),[1,2]);
});
test('database failure rolls back the PostgreSQL world and event together',async()=>{
 await pg.exec("CREATE FUNCTION reject_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.label = 'fail' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_event BEFORE INSERT ON world_events FOR EACH ROW EXECUTE FUNCTION reject_test_event();");
 const before=(await pg.query('SELECT data_json,revision FROM worlds WHERE owner_id=$1',['github:153403020'])).rows[0];
 await assert.rejects(db.saveWorld({owner:'github:153403020',revision:2,world:'{}',events:'[]',at:new Date().toISOString(),label:'fail'}));
 assert.deepEqual((await pg.query('SELECT data_json,revision FROM worlds WHERE owner_id=$1',['github:153403020'])).rows[0],before);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM world_events WHERE owner_id=$1',['github:153403020'])).rows[0].n,2);
});
test('owner-only erasure is atomic, removes history and rejects a stale save after deletion',async()=>{
 const otherCookie=await cookie('2');assert.equal((await handleRenderRequest(write(0,[{type:'world.rename',name:'Other grove'}],{cookie:otherCookie}),env,root)).status,200);
 const before=(await pg.query('SELECT data_json FROM worlds WHERE owner_id=$1',['github:153403020'])).rows[0];
 const c=await cookie();const response=await handleRenderRequest(req('/api/account',{method:'DELETE',headers:{cookie:c,Origin:origin,'x-grove-confirm-delete':'delete-world-and-history'}}),env,root);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM worlds WHERE owner_id=$1',['github:153403020'])).rows[0].n,0);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM world_events WHERE owner_id=$1',['github:153403020'])).rows[0].n,0);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM account_erasures WHERE owner_id=$1',['github:153403020'])).rows[0].n,1);
 await assert.rejects(db.saveWorld({owner:'github:153403020',revision:2,world:before.data_json,events:'[]',at:new Date().toISOString(),label:'stale'}),e=>e.code==='23505');
 assert.equal((await pg.query('SELECT revision FROM worlds WHERE owner_id=$1',['github:2'])).rows[0].revision,1);
});
test('read-only mode, unsafe origins and non-owner administration remain blocked on Render',async()=>{
 const c=await cookie('2');assert.equal((await handleRenderRequest(write(1,[{type:'world.rename',name:'No write'}],{cookie:c}),{...env,APP_READ_ONLY:'true'},root)).status,503);
 assert.equal((await handleRenderRequest(write(1,[{type:'world.rename',name:'Cross site'}],{cookie:c,Origin:'https://evil.example'}),env,root)).status,403);
 assert.equal((await handleRenderRequest(req('/admin',{headers:{cookie:c}}),env,root)).status,403);
 const admin=await handleRenderRequest(req('/admin',{headers:{cookie:await cookie()}}),env,root);assert.equal(admin.status,200);assert.match(await admin.text(),/Render dashboard/);
});
test('static delivery supports compression and prevents traversal, source exposure and external symlinks',async()=>{
 const result=await handleRenderRequest(req('/assets/app.js',{headers:{'Accept-Encoding':'br, gzip'}}),env,root);assert.equal(result.status,200);assert.equal(result.headers.get('content-encoding'),'br');assert.equal(result.headers.get('cache-control'),'public, max-age=31536000, immutable');assert.equal(brotliDecompressSync(Buffer.from(await result.arrayBuffer())).toString(),'/* public application */');
 for(const path of ['/deployment/auth.ts','/secret.txt','/assets/%2e%2e%2fsecret.txt','/assets/escape.js','/assets/private.js'])assert.equal((await handleRenderRequest(req(path),env,root)).status,404);
 for(const path of ['/','/privacy','/terms']){const r=await handleRenderRequest(req(path),env,root);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');}
 assert.equal((await handleRenderRequest(req('/assets/app.js',{method:'HEAD'}),env,root)).body,null);
 const bootstrap=await handleRenderRequest(req('/assets/recovered-entry.js'),env,root);assert.equal(bootstrap.status,200);assert.equal(bootstrap.headers.get('cache-control'),'private, no-store');
});
test('PostgreSQL unavailability never leaks connection details into API responses',async()=>{
 const broken=createNeonDatabase('postgresql://test:test@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',async()=>{throw new Error('DATABASE_URL and private upstream details');});
 const response=await postWorld(write(0,[{type:'world.rename',name:'Try'}]),'github:99',broken);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/DATABASE_URL|upstream details/);
});
