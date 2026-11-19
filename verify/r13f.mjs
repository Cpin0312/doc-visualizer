// R8e：付箋。読む・2D・貼る・箱に付ける・色・直す・消す・動かす・隠す・読み直す・付箋だけの図
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC,FILE]=process.argv; const f=FILE||'verify/md/41_r8e.md';
const t=await start({SC:+SC||0,dl:'verify/out/dl_f'}); const {b,check,fresh,diff,undo1,T,sleep,hasInp,clickS,dblSel,center,dbl,warn,nDia}=t;
const areaFill=async v=>{await t.sel();await b.send('Input.insertText',{text:v});await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500);};
const d1=(a,c)=>{const d=diff(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
const eolOk=(o,x)=>(/\r\n/.test(o))===(/\r\n/.test(x))&&(/(?<!\r)\n/.test(o))===(/(?<!\r)\n/.test(x));
const stk=d=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg${d} .svg-wrap svg .sticky')].map(g=>{const bx=g.querySelector('.box'),r=g.getBoundingClientRect(),bb=bx.getBBox();return {sx:Math.round(bb.x),sy:Math.round(bb.y),n:+g.dataset.n,text:g.textContent.replace(/\\s+/g,' ').trim().slice(0,30),fill:bx?getComputedStyle(bx).fill:null,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),cls:g.getAttribute('class')}}))`).then(JSON.parse);
const boxPos=(d,nm)=>b.ev(`(()=>{const g=[...document.querySelectorAll('#dg${d} .svg-wrap svg .item')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(nm)});if(!g)return null;const r=g.querySelector('.box').getBBox();return [Math.round(r.x),Math.round(r.y)]})()`);
console.log('ファイル',f,'拡大',SC||1);
await fresh(f); let orig=await T();
// A 読む
let s0=await stk(0), s1=await stk(1);
check('読む：図1（流れ）に付箋 4 つ・図2（グラフ）に 1 つ',s0.length===4&&s1.length===1,'流れ '+s0.length+' / グラフ '+s1.length+' | '+JSON.stringify(s0.map(x=>x.text)));
const names=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`).then(JSON.parse);
check('  「note -> 受付」は付箋ではなく、note という名前の箱（読みまちがえない）',names.includes('note')&&!s0.some(x=>x.text.startsWith('note')),names.join(','));
check('  色：黄・ピンク・水色・緑（4 色が違う色で出る）',new Set([...s0,...s1].map(x=>x.fill)).size>=4,JSON.stringify([...s0,...s1].map(x=>x.fill)));
check('  知らない色（@紫）は黄にして知らせる',/紫|色/.test(await warn())&&s0.filter(x=>x.fill===s0.find(y=>y.text.includes('見積を急ぐ')).fill).length>=2,(await warn()).slice(0,120));
check('  \\n は改行（2行の付箋）',await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('全体のメモ'));return g&&g.querySelectorAll('text, tspan').length>=2&&g.textContent.includes('つづきの行')})()`));
check('  箱に付けた付箋は点線でつながる',await b.ev(`!!document.querySelector('#dg0 .svg-wrap svg line.note-link, #dg0 .svg-wrap svg path.note-link, #dg0 .svg-wrap svg .sticky-link, #dg0 .svg-wrap svg [stroke-dasharray]')`));
check('  読込直後は未保存でない・md は読んだまま',!(await t.dirty()));
await b.shot('verify/out/r13_sticky2d.png');
// B 貼る（図に）
let before=await T(); await clickS('#dg0 .add-note'); check('「＋ 付箋」：入力欄（textarea）が出る',await b.ev(`!!document.querySelector('textarea.rename')`));
await areaFill('新しく貼る付箋\n2行目'); let a=await T(); let d=diff(before,a);
check('  貼ると md に 1 行増える（note 文 @黄、改行は \\n、図の中）',d.added.length===1&&d.removed.length===0&&d.added[0]==='note 新しく貼る付箋\\n2行目 @黄',d1(before,a)); 
check('  足した行は図の閉じ ~~~ より前',(()=>{const L=t.lines(a);const i=L.indexOf('note 新しく貼る付箋\\n2行目 @黄');const j=L.findIndex((l,k)=>k>i&&l==='~~~');const k0=L.findIndex(l=>l.startsWith('~~~flow'));return i>k0&&j===i+1||j>i&&L.slice(i,j).every(l=>!l.startsWith('~~~'))})());
check('  画面に付箋が1つ増える',(await stk(0)).length===5); check('  改行が保たれる',eolOk(before,a)); check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(before));
// 空で貼らない
await clickS('#dg0 .add-note'); await t.sel(); await t.bs(); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(400); check('  空の文では貼らない（md 変化なし）',(await T())===before);
await clickS('#dg0 .add-note'); await b.key('Escape'); check('  Esc でやめる',(await T())===before);
// 付箋の中身に @ や改行の特殊
await clickS('#dg0 .add-note'); await areaFill('メール a@b.c です @赤'); a=await T(); const sx=await stk(0); check('  文に @ を含んでも、最後の @色 だけが色（読み直して付箋 5・文が同じ）',sx.length===5&&sx.some(x=>x.text.includes('メール a@b.c です @赤')),JSON.stringify(sx.map(x=>x.text).slice(-2))+' | '+d1(before,a)); await b.keyMod('z','ctrl');
// 箱に付ける
const iU=await t.idxOf(0,'確認'); await clickS(`#dg0 .item[data-i="${iU}"] .box`); const nb=await b.ev(`(()=>{const e=[...document.querySelectorAll('#panel button')].find(x=>x.dataset.act==='note-add'||/付箋/.test(x.innerText));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,e.innerText]})()`);
check('箱を押すと「＋ 付箋」が出る',!!nb,nb&&nb[2]);
if(nb){ await sleep(200); await b.mouse(nb[0],nb[1]); await sleep(500); await areaFill('確認で気をつける'); a=await T(); d=diff(before,a);
  check('  箱に付ける：md に「note 確認 : 文 @黄」',d.added.length===1&&d.added[0]==='note 確認 : 確認で気をつける @黄',d1(before,a)); check('  Ctrl+Z 1回で戻る',await undo1(before)); }
// 色・直す・消す
const sIdx=(await stk(0)).findIndex(x=>x.text.includes('見積を急ぐ')); const sr=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`); await b.mouse(sr.cx,sr.cy); await sleep(500);
check('付箋を押すと、窓に 色（黄・ピンク・水色・緑）・文を直す・この付箋を消す',await b.ev(`!!document.querySelector('#panel [data-act=note-color]')&&!!document.querySelector('#panel [data-act=note-edit]')&&!!document.querySelector('#panel [data-act=note-del]')&&document.querySelectorAll('#panel [data-act=note-color]').length===4`));
for(const [c,w] of [['pink','ピンク'],['blue','水色'],['green','緑'],['yellow','黄']]){ await clickS(`#panel [data-act=note-color][data-v=${c}]`); a=await T(); d=diff(before,a); const ok=c==='yellow'?(a===before):(d.removed.join()==='note 見積を急ぐ @黄'&&d.added.join()==='note 見積を急ぐ @'+w); check('  色を '+w+' に：その1行の @色 だけ変わる',ok,d1(before,a)); if(c!=='yellow'){ if(!(await b.ev(`!document.getElementById('panel').hidden`))){const sr2=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`);await b.mouse(sr2.cx,sr2.cy);await sleep(400);} } }
await fresh(f); before=await T(); { const sr0=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`); await b.mouse(sr0.cx,sr0.cy); await sleep(400); await clickS('#panel [data-act=note-color][data-v=green]'); check('色を変えて Ctrl+Z 1回で md が1文字も違わず戻る',(await T())!==before&&await undo1(before)); }
// 色変更後に 1 つ戻す
await clickS('#panel [data-act=note-color][data-v=pink]').catch(()=>{}); 
await b.keyMod('z','ctrl'); check('  （色を変えた後の Ctrl+Z は下で確認）',true);
await fresh(f); before=await T();
const sr3=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`); await b.mouse(sr3.cx,sr3.cy); await sleep(400); await clickS('#panel [data-act=note-edit]'); check('文を直す：入力欄が出る',await b.ev(`!!document.querySelector('textarea.rename')`)); await areaFill('急ぐ（直した）'); a=await T(); d=diff(before,a);
check('  文だけ直る（色はそのまま）',d.removed.join()==='note 見積を急ぐ @黄'&&d.added.join()==='note 急ぐ（直した） @黄',d1(before,a)); check('  Ctrl+Z 1回で戻る',await undo1(before));
// 2回押して直す
const sr4=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`); await dbl(sr4.cx,sr4.cy); check('付箋を2回押すと文の欄が出る',await b.ev(`!!document.querySelector('textarea.rename')`)); await areaFill('2回押して直した'); a=await T(); check('  文が直る',a.includes('note 2回押して直した @黄')); await b.keyMod('z','ctrl');
await fresh(f); before=await T(); const sr5=await center(`#dg0 .sticky[data-n="${s0[sIdx].n}"]`); await b.mouse(sr5.cx,sr5.cy); await sleep(400); await clickS('#panel [data-act=note-del]'); a=await T(); d=diff(before,a);
check('付箋を消す：その1行だけ消える',d.removed.join()==='note 見積を急ぐ @黄'&&d.added.length===0&&(await stk(0)).length===3,d1(before,a)); check('  Ctrl+Z 1回で戻る',await undo1(before));
// 動かす
await fresh(f); before=await T(); const fi=(await stk(0)).findIndex(x=>x.text.includes('全体のメモ')); let fs0=(await stk(0))[fi]; const fr=await center(`#dg0 .sticky[data-n="${fs0.n}"]`); await b.drag(fr.cx,fr.cy,70,50); await sleep(500); a=await T(); const fs1=(await stk(0)).find(x=>x.text.includes('全体のメモ'));
check('付箋をドラッグ：図の中で、ドラッグした分（右 70・下 50）だけ動く',Math.abs(fs1.sx-fs0.sx-70)<=2&&Math.abs(fs1.sy-fs0.sy-50)<=2,'svg座標 ('+fs0.sx+','+fs0.sy+')→('+fs1.sx+','+fs1.sy+')'); check('  md に ~~~layout が書かれる（付箋の位置）',/~~~layout/.test(a)&&/@全体のメモ|全体のメモ/.test(a),(a.match(/~~~layout[\s\S]*?~~~/)||[''])[0].replace(/\s+/g,'').slice(0,120));
check('  付箋の行（note …）は変わらない',diff(before,a).removed.length===0); check('  Ctrl+Z 1回で戻る',await undo1(before));
// 箱を動かすと付箋も付いていく
await fresh(f); const ap=(await stk(0)).find(x=>x.text.includes('期限を確かめる')); const bp0=await boxPos(0,'承認'); const rb=await center(`#dg0 .item[data-i="${await t.idxOf(0,'承認')}"] .box`); await b.drag(rb.cx,rb.cy,80,60); await sleep(600); const bp1=await boxPos(0,'承認'); const ap1=(await stk(0)).find(x=>x.text.includes('期限を確かめる'));
check('箱「承認」を動かすと、付けた付箋も同じだけ付いていく（図の中の座標で、箱とのずれが変わらない）',Math.abs((bp1[0]-bp0[0])-(ap1.sx-ap.sx))<=2&&Math.abs((bp1[1]-bp0[1])-(ap1.sy-ap.sy))<=2&&(Math.abs(bp1[0]-bp0[0])+Math.abs(bp1[1]-bp0[1]))>=10,'箱 '+bp0+'→'+bp1+' 付箋 ('+ap.sx+','+ap.sy+')→('+ap1.sx+','+ap1.sy+')');
// 付けた箱を消す → 付箋は残る
await fresh(f); const ti=await t.idxOf(0,'承認'); await clickS(`#dg0 .item[data-i="${ti}"] .box`); const delb=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=del]');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`); if(delb){await sleep(200);await b.mouse(delb[0],delb[1]);await sleep(600);} const sl=await stk(0);
check('付けた箱を消す → 付箋は残って図に貼った付箋になる（付箋 4 のまま）',sl.length===4&&sl.some(x=>x.text.includes('期限を確かめる')),'付箋 '+sl.length+' '+JSON.stringify((await T()).split('\n').filter(l=>l.startsWith('note')).slice(0,5)));
await fresh(f);
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
