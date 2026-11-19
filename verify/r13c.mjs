// R8d-3：「md を直接直す」の左右の画面・新しい md・保存
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC,FILE]=process.argv; const f=FILE||'verify/md/40_r8d.md';
const t=await start({SC:+SC||0}); const {b,check,fresh,diff,T,sleep,hasInp,clickS,dblSel,nDia,saves,dirty}=t;
const ta=s=>b.ev(`document.getElementById('src').${s}`);
const taVal=()=>ta('value');
const setSel=(a,c)=>b.ev(`(()=>{const e=document.getElementById('src');e.focus();e.setSelectionRange(${a},${c})})()`);
const boxes=async d=>b.ev(`document.querySelectorAll('#dg${d} .svg-wrap svg .item').length`);
const eolN=s=>[(s.match(/\r\n/g)||[]).length,(s.match(/(?<!\r)\n/g)||[]).length];
console.log('ファイル',f,'拡大',SC||1);
await fresh(f); const orig=await T();
await clickS('#editMd'); await sleep(500);
check('「md を直接直す」：左の欄が出て、中身が md と同じ（改行は欄の中では LF）',await b.ev(`!document.getElementById('srcPane').hidden`)&&(await taVal()).replace(/\r\n/g,'\n')===orig.replace(/\r\n/g,'\n'));
check('  ボタンが「直す画面を閉じる」に変わる',(await b.ev(`document.getElementById('editMd').innerText`)).includes('閉じる'));
check('  右の図が左右の幅に収まる（横スクロールなし）',await b.ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),String(await b.ev(`document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth`)));
// 左を直す → 右が変わる
const v=await taVal(); const at=v.indexOf('見積 -> 承認 : OK'); const n0=await boxes(0);
await setSel(at,at); await b.send('Input.insertText',{text:'承認 -> 納品\n'}); await sleep(1100);
const a=await T(); check('左で1行足す → 右の箱が1つ増える（500ms 待ちのあと）',(await boxes(0))===n0+1,n0+'→'+(await boxes(0)));
check('  md の変わった所は足した1行だけ',(()=>{const d=diff(orig,a);return d.added.length===1&&d.removed.length===0&&d.added[0]==='承認 -> 納品'})(),JSON.stringify(diff(orig,a)));
check('  改行の種類が保たれる',(eolN(orig)[0]>0)===(eolN(a)[0]>0));
// 続けて打った分は取り消し1回
const u0=(await b.ev('DocVisualizer.canUndo()'))[0];
for(const ch of ['い','う','え']){const L=(await taVal()).indexOf('承認 -> 納品')+7; await setSel(L+ (ch==='い'?0:ch==='う'?1:2),L+(ch==='い'?0:ch==='う'?1:2)); await b.send('Input.insertText',{text:ch}); await sleep(900);}
const u1=(await b.ev('DocVisualizer.canUndo()'))[0]; check('続けて打った4回（それぞれ3秒以内）は、取り消しの履歴が1つにまとまる（読み込みから 履歴 1 のまま）',u0===1&&u1===1,'履歴 '+u0+'→'+u1);
// 右の操作が左に写る：箱を2回押して名前を直す
await b.ev(`document.getElementById('src').blur()`); await sleep(300);
const idx=await t.idxOf(0,'受付'); await dblSel(`#dg0 .item[data-i="${idx}"] .box`); await t.fill('受付係'); await sleep(400);
check('右で箱の名前を直す → 左の文字に写る（「受付係」）',(await taVal()).includes('受付係 -> 確認')&&!(await taVal()).includes('受付 -> 確認'));
check('  左の文字と md が同じ',(await taVal()).replace(/\r\n/g,'\n')===(await T()).replace(/\r\n/g,'\n'));
// 右で箱を動かす → 左の layout
const r=await b.rectOf(`#dg0 .item[data-i="1"] .box`); await sleep(200); const r2=await b.rectOf(`#dg0 .item[data-i="1"] .box`); await b.drag(r2.cx,r2.cy,50,40); await sleep(500);
check('右で箱を動かす → 左に ~~~layout が出る',(await taVal()).includes('~~~layout'));
// Ctrl+Z（ページ側）で全部戻す。欄の外にフォーカスがあるとき
await b.ev(`document.getElementById('src').blur();document.activeElement&&document.activeElement.blur&&document.activeElement.blur()`);
for(let k=0;k<12;k++){await b.keyMod('z','ctrl');await sleep(150);if((await T())===orig)break;}
check('  ページ側の Ctrl+Z で元の md まで戻る（左の文字も追従）',(await T())===orig&&(await taVal()).replace(/\r\n/g,'\n')===orig.replace(/\r\n/g,'\n'));
// 左で欄の中の Ctrl+Z は欄の戻す（画面全体の戻すではない）
await setSel(0,0); await b.send('Input.insertText',{text:'X'}); await sleep(900); const withX=await T(); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90,commands:['undo']}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90}); await sleep(1200);
check('左の欄の中の Ctrl+Z は欄の中の戻す（打った X が消える）。X を打った直後に右にも入っていた',withX!==orig&&!(await taVal()).startsWith('X')&&(await T())===orig,(await taVal()).slice(0,6));
// 閉じる
await clickS('#editMd'); await sleep(500); check('「直す画面を閉じる」で左が消え、md はそのまま',await b.ev(`document.getElementById('srcPane').hidden`)&&(await T())===orig);
// 左で打った直後に右を押す（先に入れ、もう一度押してください）
await clickS('#editMd'); await sleep(400); await setSel(0,0); await b.send('Input.insertText',{text:'\n'}); 
const rr=await b.rectOf(`#dg0 .item[data-i="1"] .box`); await sleep(100); await b.mouse(rr.cx,rr.cy); await sleep(500);
check('左で打った直後に右を押す：左の直しが先に入り、「もう一度押してください」と出る（古い絵の押しは使わない）',(await b.ev(`document.getElementById('toast').innerText`)).includes('もう一度押してください')&&(await T())!==orig,(await b.ev(`document.getElementById('toast').innerText`)));
console.log('--- 新しい md');
await fresh(f); await clickS('#newMd'); await sleep(600);
check('「新しい md」：題名だけの md',(await T())==='# 新しい資料\n',JSON.stringify(await T()));
check('  左右の画面が開き、題名が選ばれている',await b.ev(`!document.getElementById('srcPane').hidden`)&&(await ta('selectionStart'))===2&&(await ta('selectionEnd'))===7);
check('  読込直後は「未保存」ではない',!(await dirty()));
await b.send('Input.insertText',{text:'月次の流れ'}); await sleep(900); check('  題名を打つと md の1行目と画面の題名が変わる',(await T())==='# 月次の流れ\n'&&(await b.ev(`document.getElementById('title').innerText`))==='月次の流れ',JSON.stringify(await T()));
await b.ev(`document.getElementById('src').blur()`); await sleep(300);
await b.ev(`(()=>{const s=document.querySelector('[data-adddg]');s.value='flow';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(700);
const fx=await T(); check('  図を足す（流れ）→ 題名の行と足した図だけの md',fx.startsWith('# 月次の流れ\n')&&fx.includes('~~~flow')&&t.lines(fx).filter(l=>l.trim()).length===4,JSON.stringify(fx));
check('  「未保存」の印が出る',await dirty());
await t.clickSave(); const s=await saves(); const nm=await b.ev('window.__picks');
check('  保存：保存先選びの名前に「（編集）」が付かない',nm.length===1&&!nm[0].includes('（編集）'),JSON.stringify(nm));
check('  書いたバイト＝画面の md（UTF-8・BOM なし）',s[0]&&Buffer.compare(s[0].bytes,Buffer.from(fx,'utf8'))===0&&s[0].bytes[0]!==0xEF); check('  保存後は「未保存」が消える',!(await dirty()));
fs.writeFileSync('verify/out/r13_new.md',s[0].bytes); await t.load('verify/out/r13_new.md'); check('  開き直して同じ md',(await T())===fx);
// 新しい md → 保存先選びなし（ダウンロード）
await fresh(f); await clickS('#newMd'); await sleep(500); await b.send('Input.insertText',{text:'題'}); await sleep(900); await b.ev(`delete window.showSaveFilePicker`); await t.clickSave(); await sleep(800);
check('  新しい md を、保存の窓がない環境で保存 → ダウンロード名（編集）なし',/新しい資料|題/.test(await t.toast())&&!(await t.toast()).includes('（編集）'),(await t.toast()).slice(0,90));
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
