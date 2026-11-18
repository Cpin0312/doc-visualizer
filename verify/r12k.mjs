// 動かして保存：layout の区画（名前入り）も、Shift_JIS・BOM・UTF-16 のまま書かれるか
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const t=await start({}); const {b}=t; const sleep=t.sleep;
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
for(const [c,dir] of [['34_enc_sjis_crlf','34_mv'],['31_enc_bom','31_mv'],['32_enc_u16le','32_mv'],['33_enc_u16be','33_mv']]){
  const out='verify/out/r12/'+dir; fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
  await b.goto('dist/DocVisualizer.html'); await b.ev(`window.__saves.length=0`); await t.load(`verify/md/${c}.md`); fs.copyFileSync(`verify/md/${c}.md`,out+'/orig.md');
  let i=await t.idxOf(0,'確認'); await t.click(0,i); await t.act('rename'); await selAll(); await t.typeEnter('㈱確認'.slice(c.includes('sjis')?0:1));
  i=await t.idxOf(0,c.includes('sjis')?'㈱確認':'確認'); const r=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await sleep(200); const r2=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await b.drag(r2.cx,r2.cy,60,40); await sleep(500);
  const txt=await t.T(); fs.writeFileSync(out+'/screen.txt',txt);
  console.log(c,'layout あり',/~~~layout/.test(txt),'名前入りキー',/"(㈱)?確認"/.test(txt));
  await t.clickSave(); const s=await t.saves(); fs.writeFileSync(out+'/saved.md',s[0].bytes);
  await t.load(out+'/saved.md'); console.log('  開き直して md が同じ',(await t.T())===txt);
}
await b.close();
