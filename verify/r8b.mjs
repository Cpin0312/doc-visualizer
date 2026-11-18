import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); const REL=(d)=>`[...document.querySelectorAll('#dg${d} .item .box')].map(e=>{const sv=e.ownerSVGElement.getBoundingClientRect();const r=e.getBoundingClientRect();return [Math.round(r.x-sv.x),Math.round(r.y-sv.y)]})`; const to2d=async()=>{if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(400);};
const info=`JSON.stringify({status:document.getElementById('status').innerText,svg:document.querySelectorAll('#diagrams .svg-wrap svg').length,warn:document.getElementById('warnings').innerText.replace(/\\n/g,' / ').slice(0,400),err:document.getElementById('error').innerText,boxes:${REL(0)}})`;
for(const f of ['26_layout_broken','27_layout_unknown']){ await b.pick(`verify/md/${f}.md`); await to2d(); console.log(f,await b.ev(info)); }
// 自動の位置と同じか（layout なしの 25_move と箱の位置を比べる）
await b.pick('verify/md/25_move.md'); await to2d(); const auto=await b.ev(`JSON.stringify(${REL(0)})`);
await b.pick('verify/md/26_layout_broken.md'); await to2d(); const br=await b.ev(`JSON.stringify(${REL(0)})`);
console.log('壊れた layout の図の位置が自動と同じ:',auto===br?'○':'×',auto,br);
// 往復：動かして保存相当（text を書き出し）→ 読み直して同じ位置
await b.pick('verify/md/25_move.md'); await to2d();
let r=await b.rectOf('#dg0 .item[data-i="1"] .box'); await b.drag(r.cx,r.cy,70,15);
r=await b.rectOf('#dg2 .item[data-i="1"] .box'); await b.drag(r.cx,r.cy,40,20);
const after=await b.ev(`JSON.stringify([${REL(0)},${REL(2)}])`);
const text=await b.ev(`DocVisualizer.text()`); fs.writeFileSync('verify/md/28_with_layout.md',text);
await b.pick('verify/md/28_with_layout.md'); await to2d();
const reload=await b.ev(`JSON.stringify([${REL(0)},${REL(2)}])`);
console.log('保存した形の md を読み直すと同じ位置:',after===reload?'○':'×'); if(after!==reload)console.log(after,reload);
console.log('  読み直しの知らせ',await b.ev(`document.getElementById('warnings').innerText.slice(0,80)`));
console.log('外',b.external(),'errors',b.logs); await b.close();
