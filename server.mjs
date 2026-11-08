import {gzipSync} from 'node:zlib';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roomsAPI } from './rooms.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
const data=resolve(process.env.DATA_DIR||join(root,'data'));
await mkdir(join(data,'audio'),{recursive:true});
const sql=new DatabaseSync(join(data,'rooms.sqlite'));
sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
if(!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get())sql.exec(await readFile(join(root,'schema.sql'),'utf8'));
function prepared(query,args=[]){return{bind(...values){return prepared(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},run(){const info=sql.prepare(query).run(...args);return{meta:{changes:info.changes}}}}}
const objectPath=key=>join(data,'audio',createHash('sha256').update(key).digest('hex'));
const env={DB:{prepare:prepared,async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}},BUCKET:{async put(key,bytes){const path=objectPath(key),tmp=path+'.'+crypto.randomUUID();await writeFile(tmp,new Uint8Array(bytes));await rename(tmp,path)},async get(key){try{return{body:await readFile(objectPath(key))}}catch(e){if(e.code==='ENOENT')return null;throw e}},async delete(keys){await Promise.all((Array.isArray(keys)?keys:[keys]).map(key=>rm(objectPath(key),{force:true})))}}};
const html=await readFile(join(root,'index.html'));
const catalog=JSON.parse(await readFile(join(root,'sample-catalog.json'),'utf8'));
const sampleIndex=new Map(catalog.map(x=>[x.file,x]));
const sampleDirectory=resolve(process.env.SAMPLE_DIR||join(root,'samples'));
const samplePublic=catalog.map(({url,sha256,bytes,...rest})=>rest);
const catalogJSON=Buffer.from(JSON.stringify(samplePublic));
const htmlGzip=gzipSync(html),catalogGzip=gzipSync(catalogJSON);
function sendText(req,res,plain,compressed,type,cache){const gzip=(req.headers['accept-encoding']||'').split(',').some(part=>{const [name,...params]=part.trim().split(';');return name==='gzip'&&!params.some(p=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(p))});const body=gzip?compressed:plain;res.writeHead(200,{'Content-Type':type,'Cache-Control':cache,'Vary':'Accept-Encoding','Content-Length':body.length,'X-Content-Type-Options':'nosniff',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(body)}
async function cleanup(){const expired=sql.prepare('SELECT code,queue FROM rooms WHERE expires<?').all(Date.now());for(const room of expired){const ids=new Set([...sql.prepare('SELECT id FROM players WHERE room=?').all(room.code).map(p=>p.id),...JSON.parse(room.queue).map(p=>p.id)]);await env.BUCKET.delete([...ids].flatMap(id=>[`${room.code}/sound/${id}`,...Array.from({length:5},(_,i)=>`${room.code}/take/${i+1}/${id}`)]));await env.DB.batch([prepared('DELETE FROM players WHERE room=?',[room.code]),prepared('DELETE FROM rooms WHERE code=?',[room.code])])}}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
if(req.method==='GET'&&url.pathname==='/api/samples'){sendText(req,res,catalogJSON,catalogGzip,'application/json; charset=utf-8','public, max-age=300');return}
if(req.method==='GET'&&url.pathname.startsWith('/samples/')){const key=url.pathname.slice('/samples/'.length);if(!sampleIndex.has(key)){res.writeHead(404);res.end('Sample not found');return}try{const bytes=await readFile(join(sampleDirectory,key));res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':bytes.length,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(bytes)}catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'音声を準備できませんでした。少し待って再試行してください。'}))}return}
if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return}if(url.pathname==='/'&&req.method==='GET'){sendText(req,res,html,htmlGzip,'text/html; charset=utf-8','no-store');return}if(!url.pathname.startsWith('/api/rooms')){res.writeHead(404);res.end('Not found');return}const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>3100000){res.writeHead(413);res.end('{"error":"音声ファイルが大きすぎます。"}');return}parts.push(chunk)}const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});const response=await roomsAPI(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'通信処理に失敗しました。もう一度試してください。'}))}});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('MIMIC STAGE is listening on port '+(process.env.PORT||3000)));
setInterval(()=>cleanup().catch(console.error),600000).unref();
await cleanup();

export { server };
