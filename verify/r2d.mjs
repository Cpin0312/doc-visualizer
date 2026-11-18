import {openBrowser,sleep} from './h.mjs';
const D='dist/DocVisualizer.html', O='verify/out/r2/';
const b=await openBrowser({offline:true});
const J=async(l,x)=>console.log(l,'→',typeof x==='string'?await b.ev(x):x);
await b.goto(D); await b.pick('verify/md/01_copilot_wrapped.md');
// --- 3D 本物のマウス：箱を押す
await b.rectOf('#dg0 canvas'); await sleep(300);
let p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); console.log('受付の画面位置',p);
await b.mouse(p.x,p.y); await sleep(700);
await J('3D クリック後パネル',`JSON.stringify({hidden:document.getElementById('panel').hidden,txt:document.getElementById('panelBody').innerText.slice(0,120)})`);
// 空き地を押す→変わらない？ 同じ箱をもう1回
p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); await b.mouse(p.x,p.y); await sleep(500);
await J('同じ箱をもう1回',`JSON.stringify({hidden:document.getElementById('panel').hidden,sel:document.querySelectorAll('.item.sel').length})`);
await b.shot(O+'3d-click.png');
// --- ドラッグで回る：キャンバスの画素が変わる／動きを止めて比べる
const hash=`(()=>{const c=document.querySelector('#dg0 canvas');const o=document.createElement('canvas');o.width=200;o.height=120;const x=o.getContext('2d');x.drawImage(c,0,0,200,120);const d=x.getImageData(0,0,200,120).data;let h=0;for(let i=0;i<d.length;i+=4)h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)>>>0;return h})()`;
const r0=await b.rectOf('#dg0 canvas'); await sleep(200);
const h0=await b.ev(hash);
await b.drag(r0.cx-200,r0.cy+100,260,-60); await sleep(300);
const h1=await b.ev(hash);
await b.shot(O+'3d-dragged.png');
console.log('ドラッグで画素が変わる',h0!==h1);
// ダブルクリックで元に戻る
for(const t of ['mousePressed','mouseReleased','mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type:t,x:r0.cx-200+260,y:r0.cy+100-60,button:'left',clickCount:(t.includes('Pressed')?2:2)});
// --- 2D⇄3D 2回
await b.clickSel('#mode'); const m1=await b.ev(`DocVisualizer.mode()+'/'+document.getElementById('mode').innerText`);
await b.shot(O+'2d-after.png');
await b.clickSel('#mode'); const m2=await b.ev(`DocVisualizer.mode()+'/'+document.getElementById('mode').innerText+' canvas可視='+[...document.querySelectorAll('canvas')].filter(c=>c.getBoundingClientRect().height>0).length`);
console.log('切りかえ 1回目',m1,'2回目',m2);
// --- 選び直し 3回：部品の数・canvas数・WebGL警告
const st=()=>b.ev(`JSON.stringify({stats:DocScene.stats&&DocScene.stats(),canvas:document.querySelectorAll('canvas').length,heapMB:Math.round(performance.memory.usedJSHeapSize/1048576)})`);
console.log('選び直し前',await st());
for(let i=0;i<4;i++){await b.pick('verify/md/01_copilot_wrapped.md');console.log(' 選び直し',i+1,await st());}
await b.pick('verify/md/09_no_diagram.md');console.log(' 図なし',await st());
console.log('外',b.external(),'errors',b.logs,'dialogs',b.dialogs);
await b.close();
