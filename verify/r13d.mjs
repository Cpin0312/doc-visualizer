// R8d-6：関所。左で md を壊すと右からの書きかえが止まり、帯が出る。左を直すと戻る。どの入口からも md が変わらない
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC,MODE]=process.argv; const f='verify/md/41_r8e.md';
const t=await start({SC:+SC||0}); const {b,check,fresh,diff,T,sleep,hasInp,clickS,dblSel,dbl,center,warn,lock}=t;
const ta=s=>b.ev(`document.getElementById('src').${s}`); const taVal=()=>ta('value');
const setSel=(a,c)=>b.ev(`(()=>{const e=document.getElementById('src');e.focus();e.setSelectionRange(${a},${c})})()`);
const U=()=>b.ev('JSON.stringify(DocVisualizer.canUndo())');
const lockText=()=>b.ev(`document.getElementById('lockbar').innerText`);
async function breakIt(kind){
  await fresh(f); await clickS('#editMd'); await sleep(500); const v=await taVal();
  if(kind==='fence'){ const j=v.lastIndexOf('\n~~~\n')+1; await setSel(j,j+4); await b.send('Input.insertText',{text:''}); }
  else { await setSel(v.length,v.length); await b.send('Input.insertText',{text:'\n~~~layout\n{"v":1,"diagrams":[BROKEN\n~~~\n'}); }
  await sleep(1200); await b.ev(`document.getElementById('src').blur()`); await sleep(1000);
}
for(const kind of (MODE?[MODE]:['layout','fence'])){
  console.log('=== 壊し方：'+(kind==='layout'?'layout を壊す':'最後の図の「~~~」の閉じを消す'));
  await breakIt(kind); const T0=await T(), U0=await U();
  check('帯が出る：'+(await lockText()).slice(0,70),await lock()&&(await lockText()).includes('止めています'));
  check('  右の図は読めた所だけ出る（画面が空にならない）',(await b.ev(`document.querySelectorAll('#diagrams svg').length`))>=1,'図 '+await b.ev(`document.querySelectorAll('#diagrams svg').length`));
  const tries=[];const same=async(name)=>{const ok=(await T())===T0&&(await U())===U0&&!(await hasInp());tries.push([name,ok]);if(!ok)console.log('    ×',name,'md変化',(await T())!==T0,'履歴',await U(),'入力欄',await hasInp());await b.key('Escape').catch(()=>{});await sleep(150);};
  const diaWithItems=await b.ev(`[...document.querySelectorAll('#diagrams .diagram-box')].findIndex(x=>x.querySelector('.item'))`);
  const d=diaWithItems; const itemSel=`#dg${d} .item[data-i="1"] .box`;
  // ドラッグ
  if(d>=0){ const r=await center(itemSel); await b.drag(r.cx,r.cy,60,40); await same('箱をドラッグ');
    // 2回押して名前
    await dblSel(itemSel); await same('箱を2回押して名前');
    // 押す→ポップアップ→ボタン
    await clickS(itemSel); const acts=await b.ev(`JSON.stringify([...document.querySelectorAll('#panel .act')].map(x=>x.dataset.act+(x.dataset.v?':'+x.dataset.v:'')))`); console.log('    ポップアップのボタン',acts.slice(0,200));
    for(const a of JSON.parse(acts)){ const sel=`#panel .act[data-act="${a.split(':')[0]}"]`+(a.includes(':')?`[data-v="${a.split(':')[1]}"]`:''); if(await b.ev(`!document.getElementById('panel').hidden&&!!document.querySelector(${JSON.stringify(sel)})`)){ await clickS(sel).catch(()=>{}); await same('ポップアップ「'+a+'」'); if(!(await b.ev(`!document.getElementById('panel').hidden`))){ await clickS(itemSel); } } }
    // 矢印キー
    await clickS(itemSel); for(const k of ['ArrowRight','ArrowDown']) await b.keyArrow(k,false); await same('矢印キー');
    await b.keyArrow('ArrowLeft',true); await same('Shift+矢印');
    // 右クリック（形と色）
    await b.rclick((await center(itemSel)).cx,(await center(itemSel)).cy); const sa=await b.ev(`JSON.stringify([...document.querySelectorAll('#panel .act, #panel [data-k], #panel button')].slice(0,12).map(x=>x.dataset.act||x.dataset.k||x.innerText.slice(0,6)))`); 
    for(let k=0;k<6;k++){ const ok=await b.ev(`(()=>{const e=[...document.querySelectorAll('#panel button')][${k}];if(!e)return false;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();window.__pt=[r.x+r.width/2,r.y+r.height/2];return true})()`); if(!ok)break; const pt=await b.ev('window.__pt'); await b.mouse(pt[0],pt[1]); await sleep(300); }
    await same('「形と色」のボタンをいくつか'); }
  // ＋箱
  for(const dd of [0,1,2]){ if(await b.ev(`!!document.querySelector('#dg${dd} .add-box:not(.add-note)')`)){ await clickS(`#dg${dd} .add-box:not(.add-note)`); await same('＋ 箱（図'+dd+'）'); } }
  // ＋付箋
  if(await b.ev(`!!document.querySelector('.add-note')`)){ await clickS('.add-note'); if(await hasInp()){ await t.sel(); await b.send('Input.insertText',{text:'止まり中の付箋'}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(400);} await same('＋ 付箋'); }
  // 付箋を押す・2回押す・ドラッグ
  if(await b.ev(`!!document.querySelector('.sticky')`)){ const sr=await center('.sticky'); await b.mouse(sr.cx,sr.cy); await sleep(300); for(const a of ['note-color','note-edit','note-del']){ if(await b.ev(`!!document.querySelector('#panel [data-act=${a}]')`)){ await clickS(`#panel [data-act=${a}]`+(a==='note-color'?'[data-v=pink]':'')).catch(()=>{}); if(await hasInp()){await t.sel();await b.send('Input.insertText',{text:'直した'});await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(300);} await same('付箋のボタン '+a); } }
    const s2=await center('.sticky'); await dbl(s2.cx,s2.cy); if(await hasInp()){await t.sel();await b.send('Input.insertText',{text:'直した2'});await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(300);} await same('付箋を2回押す'); const s3=await center('.sticky'); await b.drag(s3.cx,s3.cy,40,30); await same('付箋をドラッグ'); }
  // 図の「…」
  for(const di of [0,1]){ if(!(await b.ev(`!!document.querySelector('#dg${di} details.dg-menu')`)))continue; await clickS(`#dg${di} details.dg-menu summary`); for(const a of ['up','down','name','type','dup','del']){ if(await b.ev(`!!document.querySelector('#dg${di} [data-dg=${a}]')`)){ await clickS(`#dg${di} [data-dg=${a}]`).catch(()=>{}); if(await hasInp()){await t.sel();await b.send('Input.insertText',{text:'改名'});await b.key('Enter');await sleep(300);} await same('「…」'+a+'（図'+di+'）'); if(!(await b.ev(`document.querySelector('#dg${di} details.dg-menu').open`)))await clickS(`#dg${di} details.dg-menu summary`).catch(()=>{}); } } await b.ev(`document.querySelectorAll('details.dg-menu').forEach(m=>m.open=false)`); }
  await b.ev(`(()=>{const s=document.querySelector('[data-adddg]');s.value='pie';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(500); await same('＋ 図を足す');
  // 題名・カード・本文
  await dblSel('#title'); if(await hasInp()){await t.fill('止まり中の題名');} await same('題名を2回押す');
  await dblSel('#cards .card[data-k=conclusion]'); if(await hasInp()){await t.fill('止まり中の結論');} await same('結論カードを2回押す');
  await clickS('#cards [data-add=todo]').catch(()=>{}); if(await hasInp()){await t.fill('止まり中');} await same('＋ すること');
  if(await b.ev(`!!document.querySelector('#body p.para')`)){ await dblSel('#body p.para'); if(await hasInp()){await t.sel();await b.send('Input.insertText',{text:'止まり中の本文'});await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(300);} await same('本文の段落を2回押す'); }
  await b.keyMod('s','ctrl').catch(()=>{});
  const okAll=tries.every(x=>x[1]); check('止まっている間、'+tries.length+' 個の入口すべてで md も履歴も変わらず・入力欄も残らない',okAll,tries.filter(x=>!x[1]).map(x=>x[0]).join('、')||tries.map(x=>x[0]).slice(0,40).join('・'));
  check('  帯はまだ出ている',await lock());
  // 左を直す → 戻る
  await clickS('#editMd').catch(()=>{}); if(await b.ev(`document.getElementById('srcPane').hidden`)) await clickS('#editMd'); await sleep(400);
  const v=await taVal(); if(kind==='layout'){ const i=v.indexOf('\n~~~layout'); await setSel(i,v.length); await b.send('Input.insertText',{text:'\n'}); } else { const j=v.indexOf('\n\n## 受付'); await setSel(j,j); await b.send('Input.insertText',{text:'\n~~~'}); }
  await sleep(1200); await b.ev(`document.getElementById('src').blur()`); await sleep(600);
  check('左を直すと帯が自動で消える',!(await lock()),(await warn()).slice(0,60));
  const T1=await T(); const nm=await t.idxOf(0,'受付'); await dblSel(`#dg0 .item[data-i="${nm>=0?nm:1}"] .box`); if(await hasInp()){await t.fill('戻った後の名前');} const T2=await T();
  check('  直ったあとは、右の操作（名前）がまた書ける',T2!==T1&&T2.includes('戻った後の名前'));
}
console.log('--- 書き途中の md を読みこむ（layout の壊れた md）');
await fresh('verify/md/26_layout_broken.md'); check('layout の壊れた md を開く → 帯が出て、右からの書きかえは止まる',await lock()); const Tb=await T(); const r=await center('#dg0 .item[data-i="1"] .box'); await b.drag(r.cx,r.cy,50,40); check('  ドラッグしても md は変わらない',(await T())===Tb);
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
