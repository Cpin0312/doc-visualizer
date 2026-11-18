import {openBrowser,sleep} from './h.mjs';
const md=process.argv[2];
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick(md);
console.log(await b.ev(`JSON.stringify({status:document.getElementById('status').innerText,err:document.getElementById('error').innerText,warn:document.getElementById('warnings').innerText,n:document.querySelectorAll('.diagram-box').length,heads:[...document.querySelectorAll('.diagram-box h2')].map(h=>h.innerText.replace(/\\n/g,' '))})`));
console.log('外',b.external(),'errors',b.logs);
await b.shot('verify/out/g-3d.png',{captureBeyondViewport:true,clip:{x:0,y:0,width:1385,height:9000,scale:0.4}});
await b.clickSel('#mode'); await sleep(600);
await b.shot('verify/out/g-2d.png',{captureBeyondViewport:true});
await b.close();
