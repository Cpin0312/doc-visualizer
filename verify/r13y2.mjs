import {start} from './r13lib.mjs';
const t=await start({}); const {b,center,sleep}=t;
await t.fresh('verify/md/41_r8e.md');
const info=()=>b.ev(`JSON.stringify((()=>{const sv=document.querySelector('#dg0 .svg-wrap svg');const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('全体のメモ'));const bx=g.querySelector('.box').getBBox();const r=sv.getBoundingClientRect();const k=r.width/ +sv.getAttribute('data-w');return {svgTop:Math.round(r.top),svgH:sv.getAttribute('data-h'),scale:+k.toFixed(3),sx:Math.round(bx.x),sy:Math.round(bx.y),scrollY:Math.round(scrollY)}})())`);
console.log('前',await info());
const g=await center('#dg0 .sticky[data-n="2"]'); await b.drag(g.cx,g.cy,70,50); await sleep(600);
console.log('後',await info());
await b.close();
