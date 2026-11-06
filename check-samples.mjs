import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PORT='0';process.env.DATA_DIR=await mkdtemp(join(tmpdir(),'mimic-samples-'));
const {server}=await import('./server.mjs');if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
try{
 const expected=JSON.parse(await readFile(new URL('./sample-catalog.json',import.meta.url),'utf8'));
 const response=await fetch(base+'/api/samples');assert.equal(response.status,200);const list=await response.json();assert.equal(list.length,100);assert.equal(new Set(list.map(x=>x.id)).size,100);assert.equal(new Set(expected.map(x=>x.sha256)).size,100);
 for(const sample of expected){const r=await fetch(base+'/samples/'+sample.file);assert.equal(r.status,200,sample.name);assert.equal(r.headers.get('content-type'),'audio/mpeg');const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(bytes.length,sample.bytes,sample.id);assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256,sample.id)}
 assert.equal((await fetch(base+'/samples/unknown.mp3')).status,404);assert.equal((await fetch(base+'/samples/%2e%2e%2fserver.mjs')).status,404);
 assert.ok(list.every(x=>x.nameJa&&x.source&&x.duration>0&&['voice','game','character','effect'].includes(x.category)));assert.ok(list.every(x=>!x.url&&!x.sha256));
 console.log('PASS: 100 distinct authentic MP3s served, metadata/search fields, checksums for every file, missing/path traversal protection.');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(process.env.DATA_DIR,{recursive:true,force:true})}
