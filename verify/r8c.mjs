import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs'; import path from 'node:path';
const dir=path.resolve('verify/out/r3/dl/r8c'); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
const b=await openBrowser({offline:true,w:1400,h:900});
await b.goto('dist/DocVisualizer.html');
await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
await b.pick('verify/md/25_move.md');
const w3=async()=>JSON.parse(await b.ev(`JSON.stringify([0,1,2,3].map(i=>DocVisualizer.where3d(0,i)))`));
await b.rectOf('#dg0 canvas'); await sleep(900); const p3a=await w3();
await b.clickSel('#mode'); await sleep(400);
const r=await b.rectOf('#dg0 .item[data-i="1"] .box'); await b.drag(r.cx,r.cy,100,20);
const boxX=(sel)=>b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?+e.getAttribute('x'):null})()`);
const sx=await boxX('#dg0 .svg-wrap svg .item[data-i="1"] .box');
const px=await boxX('#print .page:nth-child(2) svg .item[data-i="1"] .box');
console.log('画面の 確認 の x(SVG単位)',sx,'| 印刷用の svg の x',px,'| 同じ',sx===px?'○':'×', '| 動かす前の自動位置は 135 付近');
// PDF（印刷用ページを画像で目視用に保存）
const pdf=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true}); fs.writeFileSync('verify/out/r2/mv.pdf',Buffer.from(pdf.data,'base64'));
// 発表
await b.key('p','KeyP'); await sleep(600); await b.key('ArrowRight'); await sleep(300);
const prx=await b.ev(`(()=>{const e=document.querySelector('#pStage svg .item[data-i="1"] .box');return e?+e.getAttribute('x'):null})()`); console.log('発表の svg の x',prx,prx===sx?'○':'×'); await b.shot('verify/out/r8c-present.png'); await b.key('Escape');
// 3D
await b.clickSel('#mode'); await sleep(1200); await b.rectOf('#dg0 canvas'); await sleep(700);
const p3b=await w3(); console.log('受付 前後',JSON.stringify(p3a[0]),JSON.stringify(p3b[0]),'見積',JSON.stringify(p3a[2]),JSON.stringify(p3b[2]));console.log('3D の 確認 の画面位置 動かす前',p3a[1].x.toFixed(0),p3a[1].y.toFixed(0),'→後',p3b[1].x.toFixed(0),p3b[1].y.toFixed(0),'| 他の箱(受付)は同じ位置',Math.abs(p3a[0].x-p3b[0].x)<3&&Math.abs(p3a[0].y-p3b[0].y)<3?'○':'×');
await b.shot('verify/out/r8c-3d.png');
// PowerPoint
await b.clickSel('#pptx'); for(let i=0;i<30&&!fs.readdirSync(dir).some(f=>f.endsWith('.pptx'));i++)await sleep(500);
console.log('pptx',fs.readdirSync(dir)); console.log('外',b.external(),'errors',b.logs); await b.close();
