import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:700,h:520}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/01_copilot_wrapped.md');
await b.clickSel('#mode'); await sleep(400);
await b.ev(`(()=>{const g=document.querySelector('#dg0 .item[data-i="1"] .box');g.scrollIntoView({block:'center'})})()`); await sleep(300);
const r=await b.rectOf('#dg0 .item[data-i="1"] .box'); await b.mouse(r.cx,r.cy); await sleep(400);
console.log(await b.ev(`(()=>{const p=document.getElementById('panel').getBoundingClientRect();const bar=document.querySelector('.bar').getBoundingClientRect();return JSON.stringify({panel:[p.left,p.top,p.right,p.bottom].map(Math.round),bar:Math.round(bar.bottom),vw:document.documentElement.clientWidth,vh:innerHeight})})()`),'押した箱',JSON.stringify([r.x,r.y,r.w,r.h].map(Math.round)));
await b.shot('verify/out/popup-700.png'); await b.close();
