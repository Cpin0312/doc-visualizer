import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1920,h:1080}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/01_copilot_wrapped.md');
const r=await b.rectOf('#dg2'); await sleep(600);
console.log(JSON.stringify(r), await b.ev(`(()=>{const s=document.querySelector('#dg2 .scroll3d, #dg2 [class*=scroll]');return s?[s.scrollWidth,s.clientWidth,s.className]:'noscroll'})()`));
await b.shot('verify/out/r2/timeline3d-view.png'); await b.close();
