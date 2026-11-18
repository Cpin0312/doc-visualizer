import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick(process.argv[2]||'verify/md/23_flowchart.md');
const d=+process.argv[3]||0;
const r=await b.rectOf(`#dg${d} canvas`); await sleep(900);
const angles=[[0,0],[-260,0],[260,0],[0,-120],[0,120],[-200,-100],[200,100],[260,120]];
let k=0; const cx=r.cx,cy=r.cy;
for(const [dx,dy] of angles){
  // 毎回、ダブルクリックで元の向きに戻してから回す
  for(const t of ['mousePressed','mouseReleased','mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type:t,x:cx-300,y:cy+r.h/2-30,button:'left',clickCount:2}); await sleep(300);
  if(dx||dy) await b.drag(cx-300,cy+r.h/2-30,dx,dy); await sleep(500);
  const r2=await b.rectOf(`#dg${d} canvas`); await sleep(200);
  await b.shot(`verify/out/rot${process.argv[4]||''}-${d}-${k}.png`); 
  // 点々の目安：キャンバス内の「となりの画素との差が大きい孤立点」の数
  const n=await b.ev(`(()=>{const c=document.querySelector('#dg${d} canvas');const o=document.createElement('canvas');o.width=c.width;o.height=c.height;const x=o.getContext('2d');x.drawImage(c,0,0);const W=o.width,H=o.height,D=x.getImageData(0,0,W,H).data;let n=0;for(let y=2;y<H-2;y+=1)for(let xx=2;xx<W-2;xx+=1){const i=(y*W+xx)*4,l=D[i]+D[i+1]+D[i+2];const a=(D[i-4]+D[i-3]+D[i-2]+D[i+4]+D[i+5]+D[i+6]+D[i-W*4]+D[i-W*4+1]+D[i-W*4+2]+D[i+W*4]+D[i+W*4+1]+D[i+W*4+2])/4;if(Math.abs(l-a)>150&&l>300&&l<720)n++}return n})()`);
  console.log('角度',dx,dy,'| 孤立点の目安',n); k++;
}
console.log('errors',b.logs); await b.close();
