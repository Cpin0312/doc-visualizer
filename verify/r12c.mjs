// 保存のバイト：文字コードごとに R8b-3 の操作→保存→ out/r12/<名前>/{orig,saved,screen} に出す（検査は chk12.py）
import {start} from './r12lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const [,,SC]=process.argv;
const cases=process.argv.slice(3).length?process.argv.slice(3):['30_enc_utf8','31_enc_bom','32_enc_u16le','33_enc_u16be','34_enc_sjis_crlf','35_enc_sjis_lf','36_enc_eucjp'];
const t=await start({SC:+SC||0}); const {b}=t;
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
for(const c of cases){
  const out=`verify/out/r12/${c}${SC?'_'+SC:''}`; fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
  await b.goto('dist/DocVisualizer.html'); await b.ev(`window.__saves.length=0;window.__picks.length=0`); b.dialogs.length=0;
  await t.load(`verify/md/${c}.md`);
  fs.copyFileSync(`verify/md/${c}.md`,out+'/orig.md');
  console.log(c,'| 読込直後 dirty',await t.dirty(),'| meta',await b.ev(`document.getElementById('fileMeta')?document.getElementById('fileMeta').innerText:(document.querySelector('.meta')||{}).innerText`));
  // 操作1：名前変え 受付→受付係（箱・見出しなど複数行が変わる）
  let i=await t.idxOf(0,'受付'); await t.click(0,i); await t.act('rename'); await selAll(); await t.typeEnter('受付係');
  // 操作2：印
  i=await t.idxOf(0,'承認'); if(i>=0){await t.click(0,i); await t.act('mark','red').catch(()=>{});}
  // 操作3：＋箱
  const r=await b.rectOf('#dg0 .add-box'); await t.sleep(150); const r2=await b.rectOf('#dg0 .add-box'); await b.mouse(r2.cx,r2.cy); await t.sleep(500); await selAll(); await t.typeEnter('追加箱');
  const txt=await t.T(); fs.writeFileSync(out+'/screen.txt',txt);
  console.log('  直した後 dirty',await t.dirty());
  await t.clickSave();
  const s=await t.saves(); console.log('  保存回数',s.length,'名前',s[0]&&s[0].name,'dirty',await t.dirty(),'dialogs',b.dialogs.join('|').slice(0,100),'err',await t.err());
  if(s[0]) fs.writeFileSync(out+'/saved.md',s[0].bytes);
  // 開き直し
  if(s[0]){ await t.load(out+'/saved.md'); const t2=await t.T(); console.log('  開き直して md が画面と同じ',t2===txt,'dirty',await t.dirty()); }
}
console.log('外',b.external(),'errors',b.logs); await b.close();
