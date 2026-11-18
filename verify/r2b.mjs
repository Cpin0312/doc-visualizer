import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs';
const D='dist/DocVisualizer.html', O='verify/out/r2/';
const b=await openBrowser({offline:true});
await b.goto(D);
const minPx=`(()=>{const out=[];document.querySelectorAll('#diagrams .svg-wrap svg').forEach((s,i)=>{const vb=s.viewBox.baseVal;const sc=vb&&vb.width?s.getBoundingClientRect().width/vb.width:1;let m=1e9;s.querySelectorAll('text').forEach(t=>{const fs=parseFloat(getComputedStyle(t).fontSize);if(fs&&t.textContent.trim())m=Math.min(m,fs*sc)});out.push([i,+m.toFixed(1),Math.round(s.getBoundingClientRect().width),Math.round(vb.width)])});return JSON.stringify(out)})()`;
const go=async md=>{await b.pick(md);};
// 2D にする
async function to2d(){const t=await b.ev(`document.getElementById('mode').innerText`);if(t.includes('2D'))await b.clickSel('#mode');await sleep(800);}
await go('verify/md/14_over200.md');
console.log('14:',await b.ev(`document.getElementById('warnings').innerText`));
await go('verify/md/08_broken.md');
console.log('08 知らせ:',await b.ev(`document.getElementById('warnings').innerText`));
console.log('08 図の箱の名前:',await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.textContent))`));
await go('verify/md/01_copilot_wrapped.md');
console.log('01 flow 名前だけ行の箱(承認):',await b.ev(`[...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.textContent.trim()).join(',')`));
await go('verify/md/18_lanes_back.md'); await to2d();
console.log('18 minpx(2D):',await b.ev(minPx));
await b.shot(O+'18-2d.png',{captureBeyondViewport:true,clip:{x:0,y:0,width:1385,height:800,scale:1}});
// 文字の重なり：lanes の言葉の箱どうしの交差
console.log('18 言葉の重なり:',await b.ev(`(()=>{const L=[...document.querySelectorAll('#dg0 .svg-wrap svg .elabel, #dg0 .svg-wrap svg [class*=label]')].map(e=>e.getBoundingClientRect());let n=0;for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++){const a=L[i],c=L[j];if(a.width&&c.width&&a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom)n++}return L.length+'個中、重なり '+n})()`));
await b.close();
