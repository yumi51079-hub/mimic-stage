// D1-backed temporary audio, avoiding R2 activation or a payment method.
export function audioStore(db) {
 return {
  async put(key, value) {
   const bytes = new Uint8Array(value), version = crypto.randomUUID(), expires = Date.now() + 7200000;
   if (bytes.byteLength > 3000000) throw new Error('Audio exceeds 3 MB');
   const writes = [db.prepare('DELETE FROM audio_chunks WHERE key=?').bind(key)];
   for (let offset=0, part=0; offset<bytes.length; offset+=500000, part++) {
    writes.push(db.prepare('INSERT INTO audio_chunks(key,part,version,data,expires) VALUES(?,?,?,?,?)').bind(key,part,version,bytes.slice(offset,offset+500000).buffer,expires));
   }
   await db.batch(writes);
  },
  async get(key) {
   const rows = (await db.prepare('SELECT data FROM audio_chunks WHERE key=? AND expires>? ORDER BY part').bind(key,Date.now()).all()).results;
   if (!rows.length) return null;
   const chunks=rows.map(r=>new Uint8Array(r.data)), body=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));
   let offset=0; for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
   return {body};
  },
  async delete(keys) {
   const list=Array.isArray(keys)?keys:[keys];
   if(list.length) await db.batch(list.map(key=>db.prepare('DELETE FROM audio_chunks WHERE key=?').bind(key)));
  }
 };
}
