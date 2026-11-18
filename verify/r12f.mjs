// Shift_JIS：NEC/IBM・¥・‾・半角カナを名前に入れて保存／表せない字（絵文字）→字と行を出す→やめる／UTF-8 で保存
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const [,,SC]=process.argv; const ok=c=>c?'○':'×';
const t=await start({SC:+SC||0}); const {b}=t;
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
const rename=async(from,to)=>{const i=await t.idxOf(0,from);await t.click(0,i);await t.act('rename');await selAll();await t.typeEnter(to);};
const fresh=async f=>{await b.goto('dist/DocVisualizer.html');await b.ev(`window.__saves.length=0;window.__picks.length=0`);b.dialogs.length=0;b.accept=true;await t.load(f);};
const out='verify/out/r12/sj'+(+SC||''); fs.mkdirSync(out,{recursive:true});
console.log('A 名前に NEC/IBM・¥・‾・半角カナ');
await fresh('verify/md/34_enc_sjis_crlf.md');
await rename('受付','㈱髙橋①'); await rename('承認','ｱｲｳ¥‾−'); await rename('確認','≒∫﨑＼～―');
const txt=await t.T(); await t.clickSave(); const s=await t.saves();
fs.writeFileSync(out+'/screen.txt',txt); fs.writeFileSync(out+'/saved.md',s[0].bytes); fs.copyFileSync('verify/md/34_enc_sjis_crlf.md',out+'/orig.md');
console.log(' 保存された',s.length,'ダイアログ',b.dialogs.length,'dirty',await t.dirty(),'err',await t.err());
await t.load(out+'/saved.md'); console.log(' 開き直して図の名前',await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`));
console.log(' 開き直した md の「受付」行',(await t.T()).split(/\r?\n/).filter(l=>l.includes('㈱')).slice(0,2));
console.log(' （A でダイアログ）',b.dialogs.length);
await fresh('verify/md/34_enc_sjis_crlf.md'); await rename('確認','9時〜17時'); b.dialogs.length=0; b.accept=false; await t.clickSave(); console.log(' 〜(U+301C) を名前に：',(b.dialogs[0]||'(確かめなし＝書けた)').slice(0,90),'保存数',(await t.saves()).length);
console.log('B 絵文字を名前に入れて保存');
for(const choice of [false,true]){
  await fresh('verify/md/34_enc_sjis_crlf.md'); await rename('受付','受付😀'); b.dialogs.length=0; b.accept=choice; const before=await t.T();
  await t.clickSave(); const s2=await t.saves();
  console.log(' 確かめに答える',choice?'はい(UTF-8 で保存)':'いいえ','| 文:',(b.dialogs[0]||'').slice(0,110));
  console.log('   保存',s2.length,'印',(await t.dirty())?'残る':'消える','赤い帯:',(await t.err()).slice(0,100));
  if(choice&&s2[0]){const bb=s2[0].bytes;console.log('   UTF-8（BOM なし）で書いた',ok(bb[0]!==0xEF&&Buffer.compare(bb,Buffer.from(before))===0),'画面の md と同じ',ok(bb.toString('utf8')===before),'CRLF のまま',ok(bb.toString().includes('\r\n')&&!/[^\r]\n/.test(bb.toString())));
    // 次の保存は UTF-8 のまま（確かめが出ない）
    b.dialogs.length=0; await rename('承認','承認B'); await t.clickSave(); console.log('   2回目の保存：確かめなし',ok(b.dialogs.length===0),'UTF-8',ok((await t.saves())[1]&&(await t.saves())[1].bytes.toString('utf8')===(await t.T())));}
  if(!choice){ await b.ev(`window.__saves.length=0`); b.accept=true; await t.clickSave(); console.log('   やり直して保存→はい',(await t.saves()).length===1?'○':'×'); }
}
console.log('C 表せない字が複数・行の位置：3か所');
await fresh('verify/md/34_enc_sjis_crlf.md'); await rename('受付','受付😀'); await rename('承認','承認🙂'); await rename('確認','確認𠮷'); b.dialogs.length=0; b.accept=false; await t.clickSave(); console.log(' 文',(b.dialogs[0]||'').slice(0,200));
console.log(' 実際の行：',(await t.T()).split('\n').map((l,i)=>[i+1,l]).filter(([i,l])=>/😀|🙂|𠮷/.test(l)).map(([i,l])=>i+'行目').join(' '));
console.log('外',b.external(),'errors',b.logs); await b.close();
