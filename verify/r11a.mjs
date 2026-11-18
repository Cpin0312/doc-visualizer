import {start} from './r11lib.mjs';
const [,,SC]=process.argv;
const {b,T,labels,warns,load,diffL,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep}=await start({SC:+SC||0});
const ok=c=>c?'○':'×';
const base='verify/md/25_move.md';
async function undoCheck(orig,what){ const after=await T(); await b.keyMod('z','ctrl'); const t=await T(); console.log('  Ctrl+Z 1回で md が1文字も違わず戻る',ok(t===orig),what||''); if(t!==orig){console.log('   差',JSON.stringify(diffL(orig,t)).slice(0,200));} await b.keyMod('y','ctrl'); console.log('  Ctrl+Y でやり直せる',ok((await T())===after)); }
async function roundtrip(label,expectLabels){ const t=await T(); const lb=await labels(); const f=writeTmp(t); await load(f); const lb2=await labels(); const w=await warns(); console.log('  読み直して同じ図',ok(lb===lb2),'| 知らせ',w.replace('読みとりの知らせ','').slice(0,70)); if(lb!==lb2)console.log('   前',lb.slice(0,200),'\n   後',lb2.slice(0,200)); }
// ---- A 名前を直す（2回押す） ----
console.log('A1 flow の「確認」を 2回押して「照合」に直す');
await load(base); let before=await T(); let i=await idxOf(0,'確認'); await dbl(0,i); console.log('  入力欄が出る',ok(await b.ev(`!!document.querySelector('input.rename')`))); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'}); await typeEnter('照合');
let after=await T(); let d=diffL(before,after); console.log('  変わった行',JSON.stringify(d.removed),'→',JSON.stringify(d.added),'| 行数',d.n.join('→'),'| 図の名前',await labels().then(x=>JSON.parse(x)[0].join(',')));
await undoCheck(before); await roundtrip();
// ---- A2 ポップアップの「名前を直す」ボタン ----
console.log('A2 ポップアップのボタンで「見積」を「見積書」に');
await load(base); before=await T(); i=await idxOf(0,'見積'); await click(0,i); await act('rename'); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'}); await typeEnter('見積書'); after=await T(); d=diffL(before,after); console.log('  変わった行',JSON.stringify(d.removed),'→',JSON.stringify(d.added)); await undoCheck(before);
// ---- B 印 3 つ ----
console.log('B 印：「受付」に 注意・確認・完了');
await load(base); before=await T(); i=await idxOf(0,'受付'); const hist=[];
for(const [v,nm] of [['red','注意'],['yellow','確認'],['green','完了']]){ const b0=await T(); await click(0,i); await act('mark',v); const a0=await T(); const dd=diffL(b0,a0); console.log('  印',nm,'→',JSON.stringify(dd.removed),'→',JSON.stringify(dd.added),'| 図に印が出る',ok(await b.ev(`!!document.querySelector('#dg0 .item[data-i="${i}"] .mark')`))); await b.keyMod('z','ctrl'); console.log('    Ctrl+Z で戻る',ok((await T())===b0)); await b.keyMod('y','ctrl'); }
console.log('  外す：もう1回押すと印が消える'); await click(0,i); await act('mark','green'); console.log('    ',JSON.stringify(diffL(await T(),before).added.length?'まだ差':'元と同じ(3つ付け→1つ外し後は他の2つ残る)').slice(0,60));
await roundtrip();
// ---- C 線を引く ----
console.log('C 線を引く：flow の「承認」→「受付」');
await load(base); before=await T(); i=await idxOf(0,'承認'); const j=await idxOf(0,'受付'); await click(0,i); await act('link'); const tt=await b.ev(`document.getElementById('toast').innerText`); await click(0,j); after=await T(); d=diffL(before,after); console.log('  案内の文',tt.slice(0,30),'| 足された行',JSON.stringify(d.added),'| 消えた行',JSON.stringify(d.removed),'| 線が増えた',ok(await b.ev(`document.querySelectorAll('#dg0 path.edge[data-ek]').length`)>0)); await undoCheck(before); await roundtrip();
// ---- D 箱を消す（ボタン・Delete） ----
console.log('D1 箱を消す（ボタン）：flow の「見積」');
await load(base); before=await T(); i=await idxOf(0,'見積'); await click(0,i); await act('del'); after=await T(); d=diffL(before,after); console.log('  確かめの文',lastDlg().slice(0,70),'| 消えた行',JSON.stringify(d.removed),'| 足された行',JSON.stringify(d.added),'| 図',(JSON.parse(await labels())[0]).join(',')); await undoCheck(before); await roundtrip();
console.log('D2 箱を消す（フォーカスして Delete）：flow の「承認」');
await load(base); before=await T(); i=await idxOf(0,'承認'); await b.ev(`document.querySelector('#dg0 .item[data-i="${i}"]').focus()`); await b.key('Delete'); after=await T(); d=diffL(before,after); console.log('  確かめの文',lastDlg().slice(0,70),'| 消えた行',JSON.stringify(d.removed),'| 足された',JSON.stringify(d.added)); await undoCheck(before);
// ---- E 線を消す（右クリック） ----
console.log('E 線を消す：右クリック');
await load(base); before=await T(); const pt=JSON.parse(await b.ev(`(()=>{const ps=[...document.querySelectorAll('#dg0 path.edge[data-ek]')];const p=ps[0];const L=p.getTotalLength();const m=p.getPointAtLength(L*0.4);p.scrollIntoView({block:'center'});const s=p.ownerSVGElement;const q=s.createSVGPoint();q.x=m.x;q.y=m.y;const c=q.matrixTransform(p.getScreenCTM());return JSON.stringify({x:c.x,y:c.y,k:p.getAttribute('data-ek')})})()`)); await sleep(200); await b.rclick(pt.x,pt.y); console.log('  窓',await b.ev(`document.getElementById('panel').innerText.replace(/\\n+/g,' / ').slice(0,50)`)); await act('del-edge'); after=await T(); d=diffL(before,after); console.log('  確かめの文',lastDlg().slice(0,60),'| 消えた行',JSON.stringify(d.removed),'| 足された',JSON.stringify(d.added)); await undoCheck(before); await roundtrip();
console.log('外',b.external(),'errors',b.logs); await b.close();
