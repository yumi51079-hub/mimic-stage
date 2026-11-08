import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {audioStore} from './audio-store.mjs';
import {roomsAPI} from '../rooms.ts';
const sql=new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
sql.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
function prepare(query,args=[]){return {bind(...values){return prepare(query,values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v))},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:sql.prepare(query).run(...args)}}};}
const DB={prepare,async batch(list){sql.exec('BEGIN');try{const res=[];for(const item of list)res.push(await item.run());sql.exec('COMMIT');return res;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const BUCKET=audioStore(DB),env={DB,BUCKET},realNow=Date.now;
let clock=realNow();Date.now=()=>clock;
async function call(path,player,body={},method='POST',status=200){const r=await roomsAPI(new Request('https://test.invalid'+path,{method,headers:{...(player?{'X-Player-Token':player.token}:{}),'Content-Type':'application/json'},...(method==='GET'?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})}),env);assert.equal(r.status,status,await r.clone().text());return r;}
try{
 const large=new Uint8Array(2500000);crypto.getRandomValues(large.subarray(0,65000));
 await BUCKET.put('test/large',large);assert.deepEqual(new Uint8Array((await BUCKET.get('test/large')).body),large);
 await BUCKET.put('test/large',new Uint8Array([1,2,3]));assert.deepEqual((await BUCKET.get('test/large')).body,new Uint8Array([1,2,3]));
 clock+=7200001;assert.equal(await BUCKET.get('test/large'),null);clock=realNow();await BUCKET.delete('test/large');
 const wav=new Uint8Array(13274);wav.set(new TextEncoder().encode('RIFF')); // API validates the RIFF marker and size.
 for(const count of [1,2]){
  const host=await (await call('/api/rooms',null,{name:'Host'})).json();const root='/api/rooms/'+host.code,players=[host];
  if(count===2)players.push(await(await call(root+'/join',null,{name:'Guest'})).json());
  await call(root, null,null,'GET',401);
  for(const [i,p] of players.entries())await call(root+'/clip?duration=0.3&title=Sound'+i,p,wav,'PUT');
  await call(root+'/begin',host);
  let state=await(await call(root,host,null,'GET')).json();assert.equal(state.players.length,count);assert.equal(state.phase,'lobby');
  assert.deepEqual(new Uint8Array(await(await call(root+'/clip?round=1',host,null,'GET')).arrayBuffer()),wav);
  for(let round=1;round<=count;round++){
   for(const p of players)await call(root+'/ready',p,{round});
   await call(root+'/start',host);clock+=11000;
   for(const p of players){await call(root+'/score',p,{round,score:80,pitch:78,rhythm:82});await call(root+'/recording?round='+round,p,wav,'PUT');}
   assert.deepEqual(new Uint8Array(await(await call(root+'/recording/'+host.id,host,null,'GET')).arrayBuffer()),wav);
   await call(root+'/next',host);
  }
  state=await(await call(root,host,null,'GET')).json();assert.equal(state.phase,'finished');assert.equal(state.players[0].total,count*80);
  await call(root+'/reset',host);state=await(await call(root,host,null,'GET')).json();assert.equal(state.phase,'setup');
  await call(root+'/leave',host);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM audio_chunks WHERE key LIKE ?').get(host.code+'/%').n,0);
 }
 console.log('PASS: D1 audio chunk roundtrip, overwrite, expiry, auth, solo and two-player complete games, recordings, reset, cleanup.');
}finally{Date.now=realNow;sql.close();}
