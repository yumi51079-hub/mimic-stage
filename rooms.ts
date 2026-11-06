type Env={DB:D1Database;BUCKET:R2Bucket};
const json=(o:unknown,status=200)=>Response.json(o,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function roomsAPI(req:Request,env:Env){
 try{
 const url=new URL(req.url),path=url.pathname.split('/').filter(Boolean),now=Date.now();
 if(!env.DB||!env.BUCKET)return json({error:'オンラインサーバーの準備中です。少し待って再接続してください。'},503);
 if(req.method==='POST'&&url.pathname==='/api/rooms'){
  const expired=(await env.DB.prepare('SELECT code,queue FROM rooms WHERE expires<? LIMIT 5').bind(now).all<any>()).results;
  for(const old of expired){const ps=(await env.DB.prepare('SELECT id FROM players WHERE room=?').bind(old.code).all<any>()).results;const ids=[...new Set([...ps.map(p=>p.id),...JSON.parse(old.queue).map((p:any)=>p.id)])];if(ids.length)await env.BUCKET.delete(ids.flatMap(id=>[`${old.code}/sound/${id}`,...Array.from({length:5},(_,i)=>`${old.code}/take/${i+1}/${id}`)]));await env.DB.batch([env.DB.prepare('DELETE FROM players WHERE room=?').bind(old.code),env.DB.prepare('DELETE FROM rooms WHERE code=?').bind(old.code)])}

  const b=await req.json() as any,name=String(b.name||'').trim().slice(0,20);if(!name)fail('プレイヤー名を入力してください。');
  const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join(''),secret=token(),id=crypto.randomUUID(),h=await hash(secret);
  await env.DB.batch([env.DB.prepare('INSERT INTO rooms(code,host,expires) VALUES(?,?,?)').bind(code,h,now+7200000),env.DB.prepare('INSERT INTO players(id,room,token,name,joined,seen) VALUES(?,?,?,?,?,?)').bind(id,code,h,name,now,now)]);
  return json({code,token:secret,id,host:true});
 }
 const code=path[2]?.toUpperCase();if(!code||!/^([A-Z2-9]){8}$/.test(code))fail('ルームコードを確認してください。');
 const room=await env.DB.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first<any>();if(!room||room.expires<now)fail('ルームが見つからないか、有効期限が切れています。',404);
 const action=path[3]||'';
 if(action==='join'&&req.method==='POST'){
  const b=await req.json() as any,name=String(b.name||'').trim().slice(0,20);if(!name)fail('プレイヤー名を入力してください。');if(room.phase!=='setup')fail('ゲーム中です。終了後に参加してください。',409);
  const secret=token(),id=crypto.randomUUID();
  const res=await env.DB.prepare('INSERT INTO players(id,room,token,name,joined,seen) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM players WHERE room=?)<5 AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase = ?)').bind(id,code,await hash(secret),name,now,now,code,code,'setup').run();if(!res.meta.changes)fail('満員か、ラウンドが始まりました。最大5人です。',409);return json({code,token:secret,id,host:false});
 }
 const secret=req.headers.get('X-Player-Token')||'';if(!secret)fail('ルームに参加し直してください。',401);const h=await hash(secret),me=await env.DB.prepare('SELECT * FROM players WHERE room=? AND token=?').bind(code,h).first<any>();if(!me)fail('参加情報が無効です。ルームに入り直してください。',401);const host=h===room.host;
 if(!action&&req.method==='GET'){
  await env.DB.prepare('UPDATE players SET seen=? WHERE id=?').bind(now,me.id).run();
  const list=(await env.DB.prepare('SELECT id,name,seen,ready,score,pitch,rhythm,audio,has_clip,title,duration,total FROM players WHERE room=? ORDER BY joined').bind(code).all()).results;
  const end=room.start_at+room.duration*2000+3500;
  if(room.phase==='playing'&&now>end+18000){await env.DB.prepare("UPDATE rooms SET phase='results' WHERE code=? AND round=? AND phase='playing'").bind(code,room.round).run();room.phase='results'}
  return json({code,host,me:me.id,phase:room.phase,round:room.round,title:room.title,duration:room.duration,startAt:room.start_at,serverNow:now,expires:room.expires,players:list,source:JSON.parse(room.queue)[room.round-1]||null,rounds:JSON.parse(room.queue).length});
 }
 const readAudio=async(key:string)=>{const obj=await env.BUCKET.get(key);if(!obj)fail('音声の準備中です。',404);return new Response(obj.body,{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store'}})};
 if(action==='clip'&&req.method==='GET'){if(Number(url.searchParams.get('round'))!==room.round)fail('新しいラウンドに更新してください。',409);return await readAudio(`${code}/sound/${JSON.parse(room.queue)[room.round-1]?.id}`)}
 if(action==='recording'&&req.method==='GET'){if(!['results','finished'].includes(room.phase))fail('全員の挑戦が終わるまで待ってください。',409);const id=path[4];const p=await env.DB.prepare('SELECT id,audio FROM players WHERE room=? AND id=?').bind(code,id).first<any>();if(!p?.audio)fail('録音はまだありません。',404);return await readAudio(`${code}/take/${room.round}/${id}`)}
 if(action==='clip'&&req.method==='PUT'){
  if(room.phase!=='setup')fail('ゲーム開始前にアップロードしてください。',409);
  const duration=Number(url.searchParams.get('duration')),title=(url.searchParams.get('title')||'カスタム音源').slice(0,100);if(!Number.isFinite(duration)||duration<.3||duration>15)fail('音声は0.3〜15秒で選んでください。');
  const bytes=await req.arrayBuffer();if(bytes.byteLength>3000000||bytes.byteLength<44)fail('音声のサイズが不正です。');if(new TextDecoder().decode(bytes.slice(0,4))!=='RIFF')fail('WAV形式で送信してください。');
  await env.BUCKET.put(`${code}/sound/${me.id}`,bytes,{httpMetadata:{contentType:'audio/wav'}});
  await env.DB.prepare('UPDATE players SET title=?,duration=?,has_clip=1 WHERE id=?').bind(title,duration,me.id).run();return json({ok:true});
 }
 if(action==='begin'&&req.method==='POST'){
  if(!host)fail('ホストのみ操作できます。',403);if(room.phase!=='setup')fail('すでにゲームが始まっています。',409);
  const list=(await env.DB.prepare('SELECT id,name,title,duration,has_clip FROM players WHERE room=? ORDER BY joined,id').bind(code).all<any>()).results;
  if(list.length<2)fail('2人以上で開始できます。友達を招待してください。');if(list.some(p=>!p.has_clip))fail('全員のMP3アップロードを待ってください。',409);
  await env.DB.batch([env.DB.prepare("UPDATE rooms SET phase='lobby',round=1,title=?,duration=?,queue=? WHERE code=? AND phase='setup'").bind(list[0].title,list[0].duration,JSON.stringify(list),code),env.DB.prepare('UPDATE players SET ready=0,score=NULL,pitch=NULL,rhythm=NULL,audio=0,total=0 WHERE room=?').bind(code)]);return json({ok:true});
 }
 if(action==='unready'&&req.method==='POST'){
  const b=await req.json() as any;if(room.phase==='lobby'&&Number(b.round)===room.round)await env.DB.prepare('UPDATE players SET ready=0 WHERE id=?').bind(me.id).run();return json({ok:true});
 }
 if(action==='ready'&&req.method==='POST'){
  const b=await req.json() as any;if(room.phase!=='lobby'||Number(b.round)!==room.round||!room.round)fail('お手本が更新されました。読み込みを待ってください。',409);
  await env.DB.prepare('UPDATE players SET ready=1,seen=? WHERE id=?').bind(now,me.id).run();return json({ok:true});
 }
 if(action==='start'&&req.method==='POST'){
  if(!host)fail('ホストのみ開始できます。',403);if(!room.round||room.phase!=='lobby')fail('お手本を送信して準備してください。',409);
  const res=await env.DB.prepare("UPDATE rooms SET phase='playing',start_at=? WHERE code=? AND phase='lobby' AND NOT EXISTS(SELECT 1 FROM players WHERE room=? AND (ready=0 OR seen<?))").bind(now+6000,code,code,now-15000).run();if(!res.meta.changes)fail('全員の準備完了を待ってください。接続が切れた人は退出させられます。',409);return json({ok:true});
 }
 if(action==='score'&&req.method==='POST'){
  const b=await req.json() as any;if(Number(b.round)!==room.round||!['playing','results'].includes(room.phase))fail('ラウンドが更新されました。',409);if(now<room.start_at+room.duration*2000+2000)fail('録音の終了を待ってください。',409);
  for(const k of ['score','pitch','rhythm'])if(!Number.isInteger(b[k])||b[k]<0||b[k]>100)fail('スコアが不正です。');
  await env.DB.prepare('UPDATE players SET score=?,pitch=?,rhythm=?,total=total+? WHERE id=? AND score IS NULL').bind(b.score,b.pitch,b.rhythm,b.score,me.id).run();
  await env.DB.prepare("UPDATE rooms SET phase='results' WHERE code=? AND phase='playing' AND NOT EXISTS(SELECT 1 FROM players WHERE room=? AND score IS NULL)").bind(code,code).run();return json({ok:true});
 }
 if(action==='recording'&&req.method==='PUT'){
  if(Number(url.searchParams.get('round'))!==room.round||!['playing','results'].includes(room.phase))fail('ラウンドが更新されました。',409);if(me.score===null)fail('先に採点を送信してください。');
  const bytes=await req.arrayBuffer();if(bytes.byteLength>3000000||bytes.byteLength<44||new TextDecoder().decode(bytes.slice(0,4))!=='RIFF')fail('録音のサイズか形式が不正です。');await env.BUCKET.put(`${code}/take/${room.round}/${me.id}`,bytes,{httpMetadata:{contentType:'audio/wav'}});await env.DB.prepare('UPDATE players SET audio=1 WHERE id=?').bind(me.id).run();return json({ok:true});
 }
 if(action==='next'&&req.method==='POST'){
  if(!host)fail('ホストのみ操作できます。',403);if(room.phase!=='results')fail('結果を待ってください。',409);const queue=JSON.parse(room.queue),next=queue[room.round];
  if(!next){await env.DB.prepare("UPDATE rooms SET phase='finished' WHERE code=?").bind(code).run();return json({ok:true})}
  await env.DB.batch([env.DB.prepare("UPDATE rooms SET phase='lobby',round=round+1,start_at=0,title=?,duration=? WHERE code=? AND phase='results'").bind(next.title,next.duration,code),env.DB.prepare('UPDATE players SET ready=0,score=NULL,pitch=NULL,rhythm=NULL,audio=0 WHERE room=?').bind(code)]);return json({ok:true});
 }
 if(action==='reset'&&req.method==='POST'){
  if(!host)fail('ホストのみ操作できます。',403);if(room.phase!=='finished')fail('ゲームの終了を待ってください。');await env.DB.batch([env.DB.prepare("UPDATE rooms SET phase='setup',round=0,queue='[]',title='',duration=0,start_at=0 WHERE code=?").bind(code),env.DB.prepare('UPDATE players SET ready=0,score=NULL,pitch=NULL,rhythm=NULL,audio=0,total=0 WHERE room=?').bind(code)]);return json({ok:true});
 }
 if(action==='leave'&&req.method==='POST'){
  if(host){const ps=(await env.DB.prepare('SELECT id FROM players WHERE room=?').bind(code).all<any>()).results;const ids=[...new Set([...ps.map(p=>p.id),...JSON.parse(room.queue).map((p:any)=>p.id)])];await env.BUCKET.delete(ids.flatMap(id=>[`${code}/sound/${id}`,...Array.from({length:5},(_,i)=>`${code}/take/${i+1}/${id}`)]));await env.DB.batch([env.DB.prepare('DELETE FROM players WHERE room=?').bind(code),env.DB.prepare('DELETE FROM rooms WHERE code=?').bind(code)])}else{if(room.phase==='setup')await env.BUCKET.delete([`${code}/${me.id}`,`${code}/sound/${me.id}`]);await env.DB.prepare('DELETE FROM players WHERE id=?').bind(me.id).run()}return json({ok:true});
 }
 if(action==='kick'&&req.method==='POST'){
  if(!host)fail('ホストのみ操作できます。',403);const b=await req.json() as any;if(b.id===me.id)fail('自分は退出ボタンで退出してください。');if(room.phase==='setup')await env.BUCKET.delete([`${code}/${b.id}`,`${code}/sound/${b.id}`]);await env.DB.prepare('DELETE FROM players WHERE room=? AND id=?').bind(code,b.id).run();return json({ok:true});
 }
 return json({error:'操作が見つかりません。'},404);
 }catch(e:any){console.error(e.message);return json({error:e.status?e.message:'通信処理に失敗しました。再接続してください。'},e.status||500)}
}
