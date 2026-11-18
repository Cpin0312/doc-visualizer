import {start} from './r11lib.mjs';
const [,,SC]=process.argv;
const {b,T,labels,warns,load,diffL,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep}=await start({SC:+SC||0});
const ok=c=>c?'○':'×';
const base='verify/md/25_move.md';
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
const d1=(a,c)=>{const d=diffL(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
// G2 ＋箱→名前入力の戻し方
console.log('G2 「＋ 箱」→名前入力 → Ctrl+Z を何回で元に戻るか');
await load(base); let before=await T(); let r=await b.rectOf('#dg0 .add-box'); await sleep(150); r=await b.rectOf('#dg0 .add-box'); await b.mouse(r.cx,r.cy); await sleep(500); await selAll(); await typeEnter('新箱'); let n=0; for(;n<4;n++){ await b.keyMod('z','ctrl'); if((await T())===before)break; } console.log('  元に戻るまでの Ctrl+Z',n+1,'回', ok((await T())===before));
// J 壊れやすい名前
console.log('J 名前に記号・長い・空・同じ名前');
const tricky=[['a:b','「:」を含む'],['x->y','「->」を含む'],['p→q','「→」を含む'],['[括弧]','「[」「]」を含む'],['a|b','「|」を含む'],['#番号','「#」で始まる'],['@人','「@」を含む'],['!重要','「!」で始まる'],['?なぜ','「?」で始まる'],['','空の名前'],['   ','空白だけ'],['長'.repeat(120),'長い名前(120字)'],['受付','同じ名前の箱がもうある(受付)'],['  前後に空白  ','前後に空白'],['a\tb','タブ']];
for(const [nm,what] of tricky){
  await load(base); const before=await T(); const lb0=JSON.parse(await labels())[0]; const i=await idxOf(0,'確認'); const nd0=b.dialogs.length;
  await dbl(0,i); await selAll(); if(nm) await b.send('Input.insertText',{text:nm}); else await b.key('Delete'); await sleep(100); await b.key('Enter'); await sleep(600);
  const after=await T(); const lb1=JSON.parse(await labels())[0]; const dlg=b.dialogs.slice(nd0).join('｜').slice(0,60); const err=await b.ev(`document.getElementById('error').innerText.slice(0,70)`); const toast=await b.ev(`document.getElementById('toast').innerText.slice(0,50)`);
  const changed=after!==before;
  let rt='-'; if(changed){ const lb=await labels(); await load(writeTmp(after,'tmp_j.md')); rt=ok(lb===await labels()); }
  console.log('  ',what.padEnd(16),'→ md が変わった',changed?'はい':'いいえ','| 図の名前',lb1.join(','),'| 確かめ',dlg||'-','| 知らせ/帯',(err||toast||'-').slice(0,50),'| 読み直して同じ図',rt);
}
// M 消した箱と同じ名前を足す（layout の置き場所が残る）
console.log('M 消した箱と同じ名前を足したとき');
await load(base); await b.clickSel('#mode').catch(()=>{});
await load(base); const iM=await idxOf(0,'確認'); let rr=await b.rectOf(`#dg0 .item[data-i="${iM}"] .box`); await b.drag(rr.cx,rr.cy,100,5); const pos1=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .item')].map(g=>[g.getAttribute('aria-label'),Math.round(g.querySelector('.box').getBBox().x)]))`);
console.log('  動かした後',pos1); const lay1=((await T()).match(/~~~layout[\s\S]*?~~~/)||[''])[0].replace(/\s+/g,'').slice(0,160); console.log('  layout',lay1);
await click(0,await idxOf(0,'確認')); await act('del'); console.log('  消した後の図',JSON.parse(await labels())[0].join(','),'| layout に「確認」が残る',/"確認"/.test(await T()));
let r3=await b.rectOf('#dg0 .add-box'); await sleep(150); r3=await b.rectOf('#dg0 .add-box'); await b.mouse(r3.cx,r3.cy); await sleep(500); await selAll(); await typeEnter('確認');
const pos2=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .item')].map(g=>[g.getAttribute('aria-label'),Math.round(g.querySelector('.box').getBBox().x)]))`); console.log('  同じ名前「確認」を足した後',pos2,'→ 前の位置(x)に出た:',/"確認",3\d\d|"確認",2[4-9]\d/.test(pos2)?'はい':'いいえ（位置は'+(JSON.parse(pos2).find(x=>x[0]==='確認')||[])[1]+'）');
// K 続けて何回もやってから全部戻す
console.log('K 続けて 8 回の書きかえ→全部 Ctrl+Z');
await load(base); const o=await T(); let step=0;
const doStep=async(f)=>{await f();step++;};
await doStep(async()=>{const i=await idxOf(0,'確認'); await dbl(0,i); await selAll(); await typeEnter('照合');});
await doStep(async()=>{const i=await idxOf(0,'受付'); await click(0,i); await act('mark','red');});
await doStep(async()=>{await click(0,await idxOf(0,'承認')); await act('link'); await click(0,await idxOf(0,'受付'));});
await doStep(async()=>{await click(1,await idxOf(1,'請求')); await act('lane','営業');});
await doStep(async()=>{let rr=await b.rectOf('#dg0 .add-box'); await sleep(150); rr=await b.rectOf('#dg0 .add-box'); await b.mouse(rr.cx,rr.cy); await sleep(500); await selAll(); await typeEnter('追加');});
await doStep(async()=>{await click(2,await idxOf(2,'請求係')); await act('del');});
await doStep(async()=>{await click(3,await idxOf(3,'発注する')); await act('del');});
await doStep(async()=>{const i=await idxOf(0,'見積'); const r=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await b.drag(r.cx,r.cy,60,5);});
const mid=await T(); console.log('  8 回後の md の行数',mid.split(/\n/).length,'| 取り消しの数',await b.ev(`JSON.stringify(DocVisualizer.canUndo())`));
let k=0; for(;k<30;k++){ await b.keyMod('z','ctrl'); if((await T())===o)break; } console.log('  全部戻すまでの Ctrl+Z',k+1,'回 | 元の md と1文字も違わない',ok((await T())===o));
for(let q=0;q<k+1;q++) await b.keyMod('y','ctrl'); console.log('  全部やり直すと 8 回後と同じ',ok((await T())===mid));
console.log('外',b.external(),'errors',b.logs); await b.close();
