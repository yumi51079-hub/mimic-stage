import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
process.env.PORT='0';process.env.DATA_DIR=await mkdtemp(join(tmpdir(),'mimic-solo-'));const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const {server}=await import('./server.mjs');if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
let player;
async function call(path,body={},method='POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(player?{'X-Player-Token':player.token}:{})},...(method!=='GET'?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data}
try{
 player=await call('/api/rooms',{name:'Solo Test'});const root='/api/rooms/'+player.code;
 const wav=Buffer.alloc(44+13230);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(13230,40);
 await call(root+'/clip?duration=0.3&title=Solo',wav,'PUT');
 for(let game=0;game<2;game++){
  await call(root+'/begin');let s=await call(root,null,'GET');assert.equal(s.phase,'lobby');assert.equal(s.players.length,1);assert.equal(s.rounds,1);
  await call(root+'/ready',{round:1});await call(root+'/start');s=await call(root,null,'GET');assert.equal(s.phase,'playing');clock+=11000;
  await call(root+'/score',{round:1,score:82,pitch:80,rhythm:84});s=await call(root,null,'GET');assert.equal(s.phase,'results');assert.equal(s.players[0].total,82);
  await call(root+'/next');s=await call(root,null,'GET');assert.equal(s.phase,'finished');await call(root+'/reset');s=await call(root,null,'GET');assert.equal(s.phase,'setup');assert.equal(s.players[0].total,0);
 }
 console.log('PASS: one player can start, score, finish, reset and replay; no second-player requirement.');await call('/api/rooms/'+player.code+'/leave');
}finally{Date.now=realNow;server.closeAllConnections();await new Promise(r=>server.close(r));await rm(process.env.DATA_DIR,{recursive:true,force:true})}
