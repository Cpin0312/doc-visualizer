import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick(process.argv[2]);
await b.clickSel('#mode'); await sleep(500);
await b.shot('verify/out/fc-2d.png',{captureBeyondViewport:true});
await b.clickSel('#mode'); await sleep(1200);
await b.rectOf('#dg0'); await sleep(900); await b.shot('verify/out/fc-3d-0.png');
await b.rectOf('#dg1'); await sleep(900); await b.shot('verify/out/fc-3d-1.png');
await b.close();
