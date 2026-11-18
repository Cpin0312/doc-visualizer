import {start} from './r11lib.mjs';
const [,,SC]=process.argv;
const {b,T,labels,warns,load,diffL,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep}=await start({SC:+SC||0});
const ok=c=>c?'○':'×';
const base='verify/md/25_move.md';
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
async function undoCheck(orig){ const after=await T(); await b.keyMod('z','ctrl'); const t=await T(); console.log('  Ctrl+Z 1回で md が1文字も違わず戻る',ok(t===orig)); if(t!==orig)console.log('   差',JSON.stringify(diffL(orig,t)).slice(0,200)); await b.keyMod('y','ctrl'); }
async function roundtrip(){ const t=await T(); const lb=await labels(); await load(writeTmp(t)); const lb2=await labels(); console.log('  読み直して同じ図',ok(lb===lb2),'| 知らせ',(await warns()).replace('読みとりの知らせ','').slice(0,70)); if(lb!==lb2)console.log('   前',lb.slice(0,160),'\n   後',lb2.slice(0,160)); }
const d1=(a,c)=>{const d=diffL(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
// F 担当ボタン（lanes）
console.log('F 担当のボタン：lanes の「請求」を 営業 に');
await load(base); let before=await T(); let i=await idxOf(1,'請求'); await click(1,i); console.log('  担当ボタン',await b.ev(`[...document.querySelectorAll('#panel [data-act=lane]')].map(x=>x.innerText+(x.getAttribute('aria-pressed')==='true'?'(今)':'')).join(',')`)); await act('lane','営業'); let after=await T(); console.log('  変わった行',d1(before,after),'| 図の担当',await b.ev(`document.querySelector('#dg1 .item[data-i="${i}"]')&&document.querySelector('#dg1 .item[data-i="${i}"]').getAttribute('data-band')`)); await undoCheck(before); await roundtrip();
// G 見出しの「＋ 箱」
for(const [d,nm] of [[0,'flow'],[1,'lanes'],[2,'tree'],[3,'flowchart']]){
  console.log('G',nm,'の「＋ 箱」→ 名前入力 → 「新箱」');
  await load(base); before=await T(); const n0=JSON.parse(await labels())[d].length;
  const r=await b.rectOf(`#dg${d} .add-box`); await sleep(150); const r2=await b.rectOf(`#dg${d} .add-box`); await b.mouse(r2.cx,r2.cy); await sleep(500);
  const inp=await b.ev(`!!document.querySelector('input.rename')`); after=await T(); console.log('  足された行',JSON.stringify(diffL(before,after).added),'| 入力欄がすぐ出る',ok(inp));
  if(inp){ await selAll(); await typeEnter('新箱'); after=await T(); console.log('  名前を入れたあと',d1(before,after).slice(0,160),'| 箱の数',n0,'→',JSON.parse(await labels())[d].length); }
  await undoCheck(before); }
// I tree
console.log('I tree：名前・印・足す・消す');
await load(base); before=await T(); i=await idxOf(2,'経理課'); await dbl(2,i); await selAll(); await typeEnter('経理部'); after=await T(); console.log('  名前 経理課→経理部:',d1(before,after)); await undoCheck(before);
await click(2,i); await act('mark','red'); after=await T(); console.log('  印:',d1(before,after)); await b.keyMod('z','ctrl');
await load(base); before=await T(); i=await idxOf(2,'経理課'); const subt=JSON.parse(await labels())[2]; await click(2,i); await act('del'); after=await T(); console.log('  消す（経理課）確かめの文:',lastDlg().slice(0,80),'| 図',JSON.parse(await labels())[2].join(',')); console.log('  md 差',d1(before,after)); await undoCheck(before); await roundtrip();
await load(base); before=await T(); i=await idxOf(2,'本部'); await click(2,i); await act('del'); console.log('  根「本部」を消す: 確かめの文',lastDlg().slice(0,80),'| 図',JSON.parse(await labels())[2].join(',')+'|', (await warns()).slice(0,60)); await undoCheck(before);
console.log('  tree には「線を引く」ボタンがない',ok(!(await (async()=>{await load(base);const k=await idxOf(2,'本部');await click(2,k);return b.ev(`!!document.querySelector('#panel [data-act=link]')`)})())));
console.log('外',b.external(),'errors',b.logs); await b.close();
