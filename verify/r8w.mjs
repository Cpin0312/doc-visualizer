import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true}); await b.goto('dist/DocVisualizer.html'); await b.pick(process.argv[2]);
await b.clickSel('#mode'); await sleep(400);
const o=await b.ev(`DocVisualizer.text()`);
const r=await b.rectOf('#dg0 .item[data-i="1"] .box'); await b.drag(r.cx,r.cy,80,10);
const t=await b.ev(`DocVisualizer.text()`);
const m=t.match(/(\r?\n)?(\r?\n)~~~layout\r?\n[\s\S]*?\r?\n~~~(\r?\n)/);
const back=m?t.replace(m[0],m[1]===undefined?'':'' ):t;
// 差分は「追加された区画」だけか：前後の共通部分を数える
let i=0;while(i<o.length&&o[i]===t[i])i++; let j=0;while(j<o.length-i&&o[o.length-1-j]===t[t.length-1-j])j++;
const added=t.slice(i,t.length-j);
console.log('元',o.length,'後',t.length,'| 先頭の共通',i,'末尾の共通',j,'| 元の全部が前後に残る(i+j>=元の長さ):',i+j>=o.length);
console.log('足されたもの:',JSON.stringify(added).slice(0,230));
console.log('元の末尾:',JSON.stringify(o.slice(-14)),'後の末尾:',JSON.stringify(t.slice(-14)));
await b.close();
