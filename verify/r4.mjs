import {openBrowser,sleep} from './h.mjs';
const [,,dist,md]=process.argv;
const b=await openBrowser({offline:true}); await b.goto(dist); await b.pick(md);
console.log(JSON.stringify(await b.ev(`({status:document.getElementById('status').innerText,svg:document.querySelectorAll('#diagrams .svg-wrap svg').length,canvas:document.querySelectorAll('canvas').length,pdfDis:document.getElementById('pdf').disabled,pptxDis:document.getElementById('pptx').disabled})`)),'外',b.external(),'errors',b.logs);
await b.shot('verify/out/r4-clone.png'); await b.close();
