import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/21_graphs.md');
for(const i of [0,4,5,6,9,11,12]){ await b.rectOf('#dg'+i); await sleep(900); await b.shot(`verify/out/g3d-${i}.png`); }
await b.close();
