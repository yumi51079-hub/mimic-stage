import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.PORT='0';process.env.DATA_DIR=await mkdtemp(join(tmpdir(),'mimic-check-'));
const {server}=await import('./server.mjs');if(!server.listening)await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
try{
 const html=await(await fetch(base)).text();assert(html.includes('実在ミーム音声ライブラリー'));
 const make=async name=>(await(await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})).json());
 const [h,h2]=await Promise.all([make('Host'),make('Other Host')]);assert(h.code&&h.token&&h2.code);
 const g=await(await fetch(base+'/api/rooms/'+h.code+'/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Guest'})})).json();assert(g.id);
 const state=await(await fetch(base+'/api/rooms/'+h.code,{headers:{'X-Player-Token':h.token}})).json();assert.equal(state.players.length,2);
 const blocked=await fetch(base+'/api/rooms/'+h.code+'/begin',{method:'POST',headers:{'X-Player-Token':h.token,'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,409);
 for(const p of[h,h2])assert.equal((await fetch(base+'/api/rooms/'+p.code+'/leave',{method:'POST',headers:{'X-Player-Token':p.token}})).status,200);
 console.log('PASS: no-login standalone page, concurrent room creation, second player, upload gate, room deletion.');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(process.env.DATA_DIR,{recursive:true,force:true})}
