// R8b-2：形・色・線の太さ・大きさ・文字・線の形・矢印・点線（本物のマウスで押す）
import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs'; import path from 'node:path';
const [,,SC]=process.argv;
const dir=path.resolve('verify/out/r3/dl/r9b'); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
const b=await openBrowser({offline:true,w:1400,h:900,scale:+SC||0});
await b.goto('dist/DocVisualizer.html'); await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
await b.pick('verify/md/25_move.md');
if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);
const T=()=>b.ev(`DocVisualizer.text()`); const ok=c=>c?'○':'×'; const orig=await T();
const only=(o,t)=>{let i=0;while(i<o.length&&o[i]===t[i])i++;let j=0;while(j<o.length-i&&o[o.length-1-j]===t[t.length-1-j])j++;const add=t.slice(i,t.length-j);return i+j>=o.length&&/^(\r?\n)*~~~layout[\s\S]*~~~(\r?\n)?$/.test(add)};
const layout=async()=>{const t=await T();const m=t.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/);return m?m[1].replace(/\s+/g,''):''};
const box=(d,i)=>`#dg${d} .item[data-i="${i}"]`;
async function openStyle(d,i){ const pt=JSON.parse(await b.ev(`(()=>{const e=document.querySelector('${box(d,i)} .box');e.scrollIntoView({block:'start'});const bar=document.querySelector('.bar').getBoundingClientRect().bottom;let r=e.getBoundingClientRect();scrollBy(0,r.top-(bar+20));r=e.getBoundingClientRect();return JSON.stringify([r.left+r.width/2,r.top+r.height/2])})()`)); await sleep(200); await b.mouse(pt[0],pt[1]); await sleep(300);
  const open=await b.ev(`(()=>{const s=document.querySelector('#panel details.styl');return s?(s.open?'開':'閉'):'欄なし'})()`);
  if(open==='閉'){ await b.clickSel('#panel details.styl summary'); await sleep(200);} return open; }
async function setBtn(k,v){ const sel=`#panel .styl button[data-k="${k}"][data-v='${JSON.stringify(v)}']`; await b.clickSel(sel); await sleep(350); }
// 1 たたんだ欄：はじめは閉じている
const st0=await openStyle(0,0); console.log('1 欄のはじめの状態(たたんである=閉)',st0==='閉'||st0==='欄なし'?'(押す前は閉)':st0);
// 2 形 9 種類を 9 つの箱に
const plan=[['rect',0,0],['round',0,1],['ellipse',0,2],['diamond',0,3],['para',1,0],['hexagon',1,1],['chevron',1,2],['cylinder',2,0],['doc',2,1]];
const res=[];
for(const [shape,d,i] of plan){ await b.key('Escape'); await openStyle(d,i); await setBtn('shape',shape); 
  const ds=await b.ev(`(()=>{const e=document.querySelector('${box(d,i)} .box');return e?e.getAttribute('data-shape')+'|'+e.tagName:'none'})()`); res.push(shape+'→'+ds); await b.key('Escape'); }
console.log('2 形 9 種類 data-shape:',res.join('  '));
console.log('  layout:',(await layout()).slice(0,420)); console.log('  md の本文は1字も変わらない(layout の足しだけ)',ok(only(orig,await T())));
// 3 色 6 種類（flowchart の箱 0..5）
const colors=['blue','green','yellow','red','gray','purple'], cres=[];
const ct=[[3,0],[3,1],[3,2],[3,3],[3,4],[2,2]];
for(let k=0;k<6;k++){ const [cd,ci]=ct[k]; await b.key('Escape'); await openStyle(cd,ci); await setBtn('color',colors[k]); cres.push(colors[k]+'→'+await b.ev(`(()=>{const e=document.querySelector('${box(cd,ci)} .box');return (e.getAttribute('fill')+'/'+e.getAttribute('stroke'))})()`)); await b.key('Escape'); }
console.log('3 色 6 種類 fill/stroke:',cres.join('  '));
// 4 太さ・大きさ・文字
const w0=await b.ev(`(()=>{const bb=document.querySelector('${box(0,1)} .box').getBBox();const t=document.querySelector('${box(0,1)} text');return JSON.stringify([+bb.width.toFixed(1),+bb.height.toFixed(1),parseFloat(t.getAttribute('font-size')||getComputedStyle(t).fontSize)])})()`);
await b.key('Escape'); await openStyle(0,1); await setBtn('scale',2); const w2=await b.ev(`(()=>{const bb=document.querySelector('${box(0,1)} .box').getBBox();const t=document.querySelector('${box(0,1)} text');return JSON.stringify([+bb.width.toFixed(1),+bb.height.toFixed(1),parseFloat(t.getAttribute('font-size')||getComputedStyle(t).fontSize)])})()`);
await setBtn('scale',0.6); const w06=await b.ev(`(()=>{const bb=document.querySelector('${box(0,1)} .box').getBBox();return +bb.width.toFixed(1)})()`);
await setBtn('scale',''); await setBtn('font',1.25); const wf=await b.ev(`(()=>{const t=document.querySelector('${box(0,1)} text');return parseFloat(t.getAttribute('font-size')||getComputedStyle(t).fontSize)})()`);
await setBtn('font',0.8); const wfs=await b.ev(`(()=>{const t=document.querySelector('${box(0,1)} text');return parseFloat(t.getAttribute('font-size')||getComputedStyle(t).fontSize)})()`);
await setBtn('stroke',4); const sw=await b.ev(`document.querySelector('${box(0,1)} .box').getAttribute('stroke-width')`); await setBtn('stroke',1); const sw1=await b.ev(`document.querySelector('${box(0,1)} .box').getAttribute('stroke-width')`);
console.log('4 大きさ 100%:',w0,'200%:',w2,'60% の幅:',w06,'| 文字 大',wf,'小',wfs,'| 太さ 4→',sw,' 1→',sw1);
// 5 「自動」でその値だけ消える（確認に shape=diamond と color=red、shape だけ自動）
await setBtn('shape','diamond'); await setBtn('color','red'); const l1=await layout(); await setBtn('shape',''); const l2=await layout();
console.log('5 自動: 前',(l1.match(/"確認":\{[^}]*\}/)||[''])[0],'→ shape を自動に',(l2.match(/"確認":\{[^}]*\}/)||['(確認なし)'])[0],'| shape だけ消えて他は残る',ok(/"確認":\{[^}]*"color":"red"/.test(l2)&&!/"確認":\{[^}]*"shape"/.test(l2)));
await b.key('Escape');
// 6 線の右クリック
const mid=async(k)=>JSON.parse(await b.ev(`(()=>{const ps=[...document.querySelectorAll('#dg0 path.edge[data-ek]')];const p=ps[${k}];const L=p.getTotalLength();const m=p.getPointAtLength(L*0.35);p.scrollIntoView({block:'center'});const s=p.ownerSVGElement;const q=s.createSVGPoint();q.x=m.x;q.y=m.y;const c=q.matrixTransform(p.getScreenCTM());return JSON.stringify({x:c.x,y:c.y,k:p.getAttribute('data-ek'),d:p.getAttribute('d').slice(0,60)})})()`));
let e0=await mid(0); await sleep(200); e0=await mid(0); await b.rclick(e0.x,e0.y);
console.log('6 線を右クリック → 窓:',await b.ev(`document.getElementById('panel').hidden?'閉':document.getElementById('panel').innerText.replace(/\\n+/g,' / ').slice(0,60)`),'| 欄',await b.ev(`(()=>{const s=document.querySelector('#panel details.styl');return s?s.querySelector('summary').innerText+(s.open?'(開)':'(閉)'):'欄なし'})()`));
const pathD=async()=>b.ev(`(()=>{const p=document.querySelector('#dg0 path.edge[data-ek="${e0.k}"]');return JSON.stringify({d:p.getAttribute('d').slice(0,90),ms:p.getAttribute('marker-start'),me:p.getAttribute('marker-end'),dash:p.getAttribute('stroke-dasharray')})})()`);
const ek=e0.k; const eb=async(k,v)=>{ await b.clickSel(`#panel .styl button[data-k="${k}"][data-v='${JSON.stringify(v)}']`); await sleep(350); };
await eb('route','elbow'); console.log('  折れ線:',await pathD());
await eb('route','curve'); console.log('  曲線:',await pathD());
await eb('route','straight'); console.log('  直線:',await pathD());
await eb('head','both'); console.log('  矢印 両方:',await pathD());
await eb('head','none'); console.log('  矢印 なし:',await pathD());
await eb('head','end'); console.log('  矢印 先だけ:',await pathD());
await eb('head','both'); await eb('dash',true); console.log('  点線:',await pathD());
console.log('  layout:',(await layout()).slice(-190)); console.log('  md 本文は変わらない',ok(only(orig,await T())));
await b.key('Escape');
await b.shot('verify/out/r9b-2d.png',{captureBeyondViewport:false});
// 7 Ctrl+Z で戻る
const n0=await b.ev(`JSON.stringify(DocVisualizer.canUndo())`); for(let i=0;i<40;i++) await b.keyMod('z','ctrl'); console.log('7 Ctrl+Z を重ねて全部戻す:',n0,'→ layout なし',ok(!/~~~layout/.test(await T())),'| 元の md と同じ',ok((await T()).trimEnd()===orig.trimEnd()));
// 8 PowerPoint 用に再設定→3D→pptx
for(const [shape,d,i] of plan){ await b.key('Escape'); await openStyle(d,i); await setBtn('shape',shape); }
await b.key('Escape'); e0=await mid(0); await b.rclick(e0.x,e0.y); await eb('head','both'); await eb('dash',true); await b.key('Escape');
await b.clickSel('#mode'); await sleep(1500); console.log('8 3D（形つき）: canvas',await b.ev(`document.querySelectorAll('canvas').length`)); await b.rectOf('#dg0 canvas'); await sleep(900); await b.shot('verify/out/r9b-3d-0.png'); await b.rectOf('#dg1 canvas'); await sleep(900); await b.shot('verify/out/r9b-3d-1.png');
await b.clickSel('#pptx'); for(let i=0;i<30&&!fs.readdirSync(dir).some(f=>f.endsWith('.pptx'));i++)await sleep(500); console.log('  pptx',fs.readdirSync(dir));
console.log('外',b.external(),'errors',b.logs); await b.close();
