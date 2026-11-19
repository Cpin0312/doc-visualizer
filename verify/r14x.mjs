import {start} from './r13lib.mjs';
const [,,f]=process.argv; const t=await start({}); const {b,sleep}=t;
await t.fresh(f||'verify/md/50_board.md');
console.log(await b.ev(`JSON.stringify({dg:document.querySelectorAll('#diagrams .diagram-box').length,kind:document.querySelector('#dg0 .kind').innerText,svg:[...document.querySelectorAll('#dg0 svg')].length,items:[...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>[g.getAttribute('class'),g.dataset.i,g.getAttribute('aria-label'),g.dataset.p||''].join('|')),edges:[...document.querySelectorAll('#dg0 path.edge')].map(p=>p.dataset.ek+(p.getAttribute('stroke')||'')),warn:document.getElementById('warnings').innerText.replace(/\\n/g,' / ').slice(0,600),lock:!document.getElementById('lockbar').hidden})`));
await b.rectOf('#dg0 .svg-wrap'); await sleep(400); await b.shot('verify/out/r14_board2d.png');
await b.close();
