import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
const catalog=JSON.parse(await readFile(new URL('./sample-catalog.json',import.meta.url),'utf8'));
const dir=resolve(process.env.SAMPLE_DIR||new URL('./samples/',import.meta.url).pathname);await mkdir(dir,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const queue=[...catalog];let count=0;
async function worker(){for(let item;item=queue.shift();){const target=join(dir,item.file);try{const b=await readFile(target);if(digest(b)===item.sha256){count++;continue}}catch{}
 let last;for(let attempt=0;attempt<3;attempt++){try{const url=new URL(item.url);if(url.origin!=='https://raw.githubusercontent.com'||!url.pathname.startsWith('/3kh0/soundboard/'))throw Error('Unexpected sample source');const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);const bytes=new Uint8Array(await r.arrayBuffer());if(digest(bytes)!==item.sha256||bytes.length!==item.bytes)throw Error('Audio checksum mismatch: '+item.id);const tmp=target+'.tmp';await writeFile(tmp,bytes);await rename(tmp,target);last=null;break}catch(e){last=e;if(attempt<2)await new Promise(r=>setTimeout(r,800*(attempt+1)))}}
 if(last)throw last;count++;console.log('Audio ready '+count+'/'+catalog.length+': '+item.id)}}
await Promise.all(Array.from({length:4},worker));console.log('Verified '+count+' real meme audio files.');
