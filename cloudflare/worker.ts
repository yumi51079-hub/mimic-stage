import {roomsAPI} from '../rooms';
import {audioStore} from './audio-store.mjs';
import schema from './schema.sql';
const initialized=new WeakMap<object,Promise<void>>();
async function initialize(db:any){
 let pending=initialized.get(db);
 if(!pending){pending=db.exec(schema).then(()=>{});initialized.set(db,pending);pending.catch(()=>initialized.delete(db));}
 await pending;
}
export default {
 async fetch(req:Request,env:any){
  const url=new URL(req.url);
  if(url.pathname==='/health')return new Response('ok');
  if(!url.pathname.startsWith('/api/rooms'))return env.ASSETS.fetch(req);
  try{
   await initialize(env.DB);
   if(req.method==='POST'&&url.pathname==='/api/rooms') await env.DB.prepare('DELETE FROM audio_chunks WHERE expires<?').bind(Date.now()).run();
   return roomsAPI(req,{DB:env.DB,BUCKET:audioStore(env.DB)} as any);
  }catch(e){console.error('Storage unavailable',e);return Response.json({error:'接続できませんでした。少し待って再試行してください。'},{status:503});}
 }
};
