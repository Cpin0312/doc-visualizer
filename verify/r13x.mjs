import {start} from './r13lib.mjs';
const t=await start({}); const {b}=t;
await t.fresh('verify/md/40_r8d.md');
console.log(await b.ev(`JSON.stringify({cards:[...document.querySelectorAll('#cards .card')].map(c=>c.dataset.k),adds:[...document.querySelectorAll('#cards [data-add]')].map(x=>x.dataset.add),paras:[...document.querySelectorAll('#body p')].map(p=>p.className+':'+p.dataset.l),dg:[...document.querySelectorAll('.dg-menu')].length,title:document.getElementById('title').innerText})`));
await b.close();
