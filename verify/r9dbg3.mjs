import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:+process.argv[2]||1400,h:+process.argv[3]||900,scale:+process.argv[4]||0}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/25_move.md');
await b.clickSel('#mode'); await sleep(500);
const geo=()=>b.ev(`(()=>{const p=document.getElementById('panel');const r=p.getBoundingClientRect();const bt=[...p.querySelectorAll('.styl button')].map(x=>{const q=x.getBoundingClientRect();return [x.getAttribute('data-k'),Math.round(q.top),Math.round(q.bottom)]});const last=bt[bt.length-1];return JSON.stringify({vh:innerHeight,panel:[r.left,r.top,r.right,r.bottom].map(Math.round),ovf:getComputedStyle(p).overflowY,scrollH:p.scrollHeight,clientH:p.clientHeight,maxH:p.style.maxHeight,scrollY:Math.round(scrollY),last:last,scaleBtn:bt.find(x=>x[0]==='scale'),colorBtn:bt.find(x=>x[0]==='color')})})()`);
for(const [d,i] of [[0,1],[0,1]]){
 await b.clickSel(`#dg${d} .item[data-i="${i}"] .box`); console.log('開いた直後',await geo());
 await b.clickSel('#panel details.styl summary'); console.log('欄を開いた後',await geo());
 await b.key('Escape');
}
await b.close();
