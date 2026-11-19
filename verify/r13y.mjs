import {start} from './r13lib.mjs';
const t=await start({}); const {b}=t;
await t.fresh('verify/md/40_r8d.md');
const r=await b.rectOf('#secret'); console.log(JSON.stringify(r), await b.ev(`(()=>{const r=document.getElementById('secret').getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&(e.id||e.className||e.tagName)})()`));
await t.dbl(r.cx,r.cy); console.log('入力欄',await t.hasInp());
console.log('cardsに社外秘',await b.ev(`!!document.querySelector('#cards .card.secret, #cards .card[data-k=secret]')`));
await b.close();
