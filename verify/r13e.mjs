// R8d-5/7：本文の段落・箱の説明を2回押して直す。出どころ（[元：…]）が消えない。空にすると段落が消える。＋ 説明を書く
import {start} from './r13lib.mjs';
const [,,SC,FILE]=process.argv; const f=FILE||'verify/md/40_r8d.md';
const t=await start({SC:+SC||0}); const {b,check,fresh,diff,undo1,T,sleep,hasInp,clickS,dblSel,center,dbl}=t;
const fillArea=async v=>{await t.sel();await b.send('Input.insertText',{text:v});await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500);};
const d1=(a,c)=>{const d=diff(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
const eolOk=(o,x)=>(/\r\n/.test(o))===(/\r\n/.test(x))&&(/(?<!\r)\n/.test(o))===(/(?<!\r)\n/.test(x));
const openBox=async nm=>{const i=await t.idxOf(0,nm);await clickS(`#dg0 .item[data-i="${i}"] .box`);await sleep(300);};
console.log('ファイル',f,'拡大',SC||1);
// 本文の段落
await fresh(f); let orig=await T();
const paras=await b.ev(`JSON.stringify([...document.querySelectorAll('#body p')].map(p=>[p.className,p.dataset.l||'',p.innerText.slice(0,16)]))`); console.log('本文の p',paras);
check('本文：直せる段落には「2回押すと直せます」の印（class para）',await b.ev(`!!document.querySelector('#body p.para')`));
await dblSel('#body p.para'); check('  2回押すと、欄（textarea）が出る',await b.ev(`!!document.querySelector('textarea.rename')`));
await fillArea('書きかえた段落。\n2行目も足す。'); let a=await T(); let d=diff(orig,a);
check('  段落を書きかえる：変わったのはその段落の行だけ',d.removed.length===1&&d.removed[0]==='本文の段落その2。'&&d.added.length===2&&d.added[0]==='書きかえた段落。',d1(orig,a)); check('  出どころの行（[元：…]）は元のまま残る',a.includes('[元：資料A 3ページ]')&&a.includes('[元：受注手順 2ページ]'));
check('  改行が保たれる',eolOk(orig,a)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
await dblSel('#body p.para'); await b.key('Escape'); check('  Esc でやめる（md 変化なし・欄が閉じる）',(await T())===orig&&!(await b.ev(`!!document.querySelector('textarea.rename')`)));
await dblSel('#body p.para'); await t.sel(); await t.bs(); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500); a=await T(); d=diff(orig,a);
check('  空にすると、段落の行が消える（出どころは残る）',d.removed.length===1&&d.added.length===0&&a.includes('[元：資料A 3ページ]'),d1(orig,a)); check('  空行が増えない（段落のあとの空行が2つ並ばない）',!/\n\n\n/.test(a.replace(/\r\n/g,'\n')),JSON.stringify(a.replace(/\r\n/g,'\n').slice(150,260))); check('  Ctrl+Z 1回で戻る',await undo1(orig));
// 外を押して決まる（blur）
await dblSel('#body p.para'); await t.sel(); await b.send('Input.insertText',{text:'外を押して決める'}); await b.mouse(5,300); await sleep(600); a=await T(); check('  欄の外を押すと決まる（長い文を失わない）',a.includes('外を押して決める')&&diff(orig,a).removed.length===1,d1(orig,a)); await b.keyMod('z','ctrl');
// 出どころのある段落（直せない扱い）：第1段落
const q=await b.ev(`(()=>{const p=[...document.querySelectorAll('#body p')].find(x=>x.innerText.includes('段落その1'));return p?{cls:p.className,data:p.dataset.l||''}:null})()`);
check('出どころ（[元：…]）が段落の中にある段落は、2回押して直せる対象にならない（出どころを壊さない）',q&&!q.cls.includes('para'),JSON.stringify(q));
// 箱の説明
console.log('--- 箱の説明');
await fresh(f); orig=await T(); await openBox('受付'); check('箱を押すとポップアップに説明（段落）が出る',await b.ev(`!!document.querySelector('#panelBody p.para')`)); 
const r=await center('#panelBody p.para'); await dbl(r.cx,r.cy); check('  説明を2回押すと欄が出る',await b.ev(`!!document.querySelector('textarea.rename')`));
await fillArea('書きかえた説明。\nもう1行。'); a=await T(); d=diff(orig,a);
check('  説明を書きかえる：説明の行だけ変わる',d.removed.join('|')==='お客様から電話かメールで受ける。|つづきの説明。'&&d.added.join('|')==='書きかえた説明。|もう1行。',d1(orig,a)); check('  出どころの行 [元：受注手順 2ページ] が残る',a.includes('[元：受注手順 2ページ]'));
check('  ポップアップに出どころがまだ出る',await b.ev(`document.querySelector('#panel').innerText.includes('受注手順 2ページ')`)); check('  改行が保たれる',eolOk(orig,a)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
await openBox('受付'); const r2=await center('#panelBody p.para'); await dbl(r2.cx,r2.cy); await t.sel(); await t.bs(); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500); a=await T(); d=diff(orig,a);
check('  空にすると説明の段落が消え、出どころの行は残る',d.removed.length===2&&d.added.length===0&&a.includes('[元：受注手順 2ページ]')&&a.includes('## 受付'),d1(orig,a)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
// ＋ 説明を書く（説明のない箱）
await openBox('見積'); const addb=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=note-add]');return e?e.innerText:null})()`); console.log('   説明のない箱のボタン',addb, await b.ev(`JSON.stringify([...document.querySelectorAll('#panel button')].map(x=>x.innerText+'|'+(x.dataset.act||'')))`));
const nb=await b.ev(`(()=>{const e=[...document.querySelectorAll('#panel button')].find(x=>/説明を書く/.test(x.innerText));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
check('説明のない箱に「＋ 説明を書く」が出る',!!nb);
if(nb){ await sleep(200); await b.mouse(nb[0],nb[1]); await sleep(500); check('  押すと入力欄が出る',await b.ev(`!!document.querySelector('textarea.rename, input.rename')`)); await fillArea('見積の説明を足す。\n2行目。'); a=await T(); d=diff(orig,a);
  check('  足されるのは「## 見積」と説明の行（既存の行は消えない）',d.removed.length===0&&d.added.includes('## 見積')&&d.added.includes('見積の説明を足す。'),d1(orig,a)); check('  読み直すと見積に説明がつく',await (async()=>{await openBox('見積');return b.ev(`document.querySelector('#panel').innerText.includes('見積の説明を足す')`)})()); check('  改行が保たれる',eolOk(orig,a)); check('  Ctrl+Z 1回で戻る',await undo1(orig)); }
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
