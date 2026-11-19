import {start} from './r13lib.mjs'; import fs from 'node:fs';
const t=await start({}); const {b}=t;
const src=fs.readFileSync('verify/md/41_r8e.md','utf8'); const L=src.split('\n');
const idx=L.map((l,i)=>l==='~~~'?i:-1).filter(i=>i>=0);
for(const [nm,k] of [['1つ目の図の閉じ',0],['2つ目の図の閉じ',1],['最後の図の閉じ',idx.length-1]]){
  const M=L.slice(); M.splice(idx[k],1); fs.writeFileSync('verify/md/tmp_fence.md',M.join('\n'));
  await t.fresh('verify/md/tmp_fence.md');
  console.log(nm,'を消した md：帯',await t.lock(),'| 図',await t.nDia(),'| 知らせ',(await t.warn()).slice(0,140));
}
await b.close();
