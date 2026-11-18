// 直し c：3D で箱をドラッグ中、落とす帯が光るか（画像の差で見分ける）
import {start} from './r12lib.mjs'; import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const [,,SC]=process.argv; const ok=c=>c?'○':'×';
const t=await start({SC:+SC||0}); const {b}=t; const sleep=t.sleep;
await t.load('verify/md/25_move.md'); // to2d は呼ばれる→3D に戻す
if((await b.ev(`DocVisualizer.mode()`))!=='3d'){await b.clickSel('#mode');await sleep(1500);}
console.log('モード',await b.ev('DocVisualizer.mode()'));
await b.rectOf('#dg1 canvas'); await sleep(1500);
const W=async(d,i)=>JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(${d},${i}))`));
const labs=JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg1 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`));
console.log('lanes の箱',labs);
const iSeikyu=labs.indexOf('請求'), iUke=labs.indexOf('受付');
const pa=await W(1,iSeikyu), pu=await W(1,iUke);
console.log('請求',pa,'受付(営業の帯)',pu);
const cv=await b.rectOf('#dg1 canvas'); await sleep(300);
const shotImg=async()=>{const r=await b.send('Page.captureScreenshot',{format:'png'});return loadImage(Buffer.from(r.data,'base64'));};
const px=img=>{const c=createCanvas(img.width,img.height);const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,img.width,img.height);};
const diff=(A,Bm,box)=>{let n=0,tot=0,sum=0;const [x0,y0,x1,y1]=box.map(v=>Math.round(v));for(let y=Math.max(0,y0);y<Math.min(A.height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(A.width,x1);x++){const i=(y*A.width+x)*4;const d=Math.abs(A.data[i]-Bm.data[i])+Math.abs(A.data[i+1]-Bm.data[i+1])+Math.abs(A.data[i+2]-Bm.data[i+2]);tot++;sum+=d;if(d>30)n++;}return {frac:+(n/tot).toFixed(3),mean:+(sum/tot).toFixed(2)};};
const dsf=+SC||1; 
const A=px(await shotImg()); fs.writeFileSync('verify/out/r12/c_before.png',Buffer.from((await b.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
async function dragTo(x0,y0,x1,y1,hold){await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x0,y:y0});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:x0,y:y0,button:'left',buttons:1,clickCount:1});for(let k=1;k<=10;k++)await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x0+(x1-x0)*k/10,y:y0+(y1-y0)*k/10,button:'left',buttons:1});await sleep(500);}
// 1) 自分の帯の上で止める（光らないはず）
await dragTo(pa.x,pa.y,pa.x+8,pa.y+4); const own=await b.ev('DocVisualizer.drop3d(1)'); const Bown=px(await shotImg());
await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pa.x+8,y:pa.y+4,button:'left',clickCount:1}); await sleep(500); await b.keyMod('z','ctrl').catch(()=>{});
// 2) 別の帯の上で止める
const pa2=await W(1,iSeikyu); await dragTo(pa2.x,pa2.y,pu.x,pu.y+10); const other=await b.ev('DocVisualizer.drop3d(1)'); const imgO=await shotImg(); const Bot=px(imgO);
fs.writeFileSync('verify/out/r12/c_during.png',Buffer.from((await b.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const box=[pu.x-250,pu.y-90,pu.x+250,pu.y+90]; const ctrl=[20,cv.y>200?cv.y+20:300,220,420];
console.log('光らせている帯（hook）：自分の帯の上',JSON.stringify(own),'| 別の帯の上',JSON.stringify(other));
console.log('画像の差（落とし先の周り）：自分の帯',JSON.stringify(diff(A,Bown,box.map(v=>v*dsf))),'別の帯',JSON.stringify(diff(A,Bot,box.map(v=>v*dsf))));
console.log('画像の差（離れた対照）：別の帯のとき',JSON.stringify(diff(A,Bot,[...ctrl].map(v=>v*dsf))));
await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pu.x,y:pu.y+10,button:'left',clickCount:1}); await sleep(600);
console.log('離したあと：光が消える',ok((await b.ev('DocVisualizer.drop3d(1)'))===''||(await b.ev('DocVisualizer.drop3d(1)'))===null),'md の変化',(await t.T()).split('\n').filter(l=>/請求/.test(l)).slice(0,2));
console.log('外',b.external(),'errors',b.logs); await b.close();
