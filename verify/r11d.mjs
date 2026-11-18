import {start} from './r11lib.mjs';
const [,,SC]=process.argv;
const {b,T,labels,warns,load,diffL,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep}=await start({SC:+SC||0});
const ok=c=>c?'○':'×';
const base='verify/md/25_move.md';
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
const posOf=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .item')].map(g=>[g.getAttribute('aria-label'),Math.round(g.querySelector('.box').getBBox().x),Math.round(g.querySelector('.box').getBBox().y)]))`);
// M 消した箱と同じ名前を足したとき
console.log('M 動かした箱を消し、同じ名前で足し直す');
await load(base); const iM=await idxOf(0,'承認'); let rr=await b.rectOf(`#dg0 .item[data-i="${iM}"] .box`); await b.drag(rr.cx,rr.cy,-120,30);
console.log('  動かした後',await posOf()); console.log('  layout',((await T()).match(/~~~layout[\s\S]*?~~~/)||[''])[0].replace(/\s+/g,'').slice(0,170));
await b.ev(`document.querySelector('#dg0 .item[data-i="${await idxOf(0,'承認')}"]').focus()`); await b.key('Delete'); console.log('  消した後',await posOf(),'| layout に「承認」が残る',/"承認"/.test(await T()),'| 確かめ',lastDlg().slice(0,40));
let r3=await b.rectOf('#dg0 .add-box'); await sleep(150); r3=await b.rectOf('#dg0 .add-box'); await b.mouse(r3.cx,r3.cy); await sleep(500); await selAll(); await typeEnter('承認');
const p2=JSON.parse(await posOf()); const q=p2.find(x=>x[0]==='承認'); console.log('  同じ名前「承認」を足した後',JSON.stringify(p2),'| 前の位置(x=326 付近)に出た',q&&Math.abs(q[1]-326)<30?'はい':'いいえ',q);
// N 別の帯へのドラッグ（lanes）
console.log('N lanes：「受付」を 営業 → 経理 の帯へドラッグ');
await load(base); const before=await T(); const iN=await idxOf(1,'受付'); await b.ev(`document.querySelector('#dg1').scrollIntoView({block:'center'})`); await sleep(300);
const r=await b.rectOf(`#dg1 .item[data-i="${iN}"] .box`); const bands=await b.ev(`(()=>{const s=document.querySelector('#dg1 .svg-wrap svg');const m=s.getScreenCTM();return JSON.stringify([...s.querySelectorAll('[class*=lane], .lane, rect.band')].map(e=>{const q=e.getBoundingClientRect();return [e.getAttribute('class'),Math.round(q.top),Math.round(q.bottom)]}).slice(0,8))})()`);
console.log('  帯の要素',bands);
const sx=r.cx, sy=r.cy; const ty=sy+95;
await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:sx,y:sy}); await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:sx,y:sy,button:'left',buttons:1,clickCount:1});
for(let k=1;k<=10;k++) await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:sx+k*3,y:sy+(ty-sy)*k/10,button:'left',buttons:1}); await sleep(300);
const glow=await b.ev(`(()=>{const s=document.querySelector('#dg1 .svg-wrap svg');const all=[...document.querySelectorAll('#dg1 *')].filter(e=>/drop|glow|hot|target/.test(e.getAttribute&&e.getAttribute('class')||''));return JSON.stringify(all.map(e=>e.tagName+'.'+e.getAttribute('class')))})()`);
console.log('  ドラッグ中に光る要素',glow); await b.shot('verify/out/r11-lane-drag.png');
await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:sx+30,y:ty,button:'left',clickCount:1}); await sleep(600);
const after=await T(); console.log('  離した後の md の変化',JSON.stringify(diffL(before,after).removed),'→',JSON.stringify(diffL(before,after).added)); await b.keyMod('z','ctrl'); console.log('  Ctrl+Z 1回で md が1文字も違わず戻る',ok((await T())===before));
// 3D でも
console.log('N2 3D で帯をまたぐドラッグ');
await b.clickSel('#mode'); await sleep(1200); await b.rectOf('#dg1 canvas'); await sleep(900);
const w=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(1,${iN}))`)); const w2=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(1,${await idxOf(1,'請求').catch(()=>1)}))`));
await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:w.x,y:w.y}); await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:w.x,y:w.y,button:'left',buttons:1,clickCount:1});
for(let k=1;k<=10;k++) await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:w.x+(w2.x-w.x)*k/10*0.3,y:w.y+(w2.y-w.y)*k/10,button:'left',buttons:1}); await sleep(400); await b.shot('verify/out/r11-lane-drag3d.png');
await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:w.x+(w2.x-w.x)*0.3,y:w2.y,button:'left',clickCount:1}); await sleep(700);
const a3=await T(); console.log('  3D：離した後の md',JSON.stringify(diffL(before,a3).removed),'→',JSON.stringify(diffL(before,a3).added)); await b.keyMod('z','ctrl'); console.log('  Ctrl+Z 1回で戻る',ok((await T())===before));
console.log('外',b.external(),'errors',b.logs); await b.close();
