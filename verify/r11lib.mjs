import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs';
export async function start({SC=0,W=1400,H=900}={}){
  const b=await openBrowser({offline:true,w:W,h:H,scale:SC}); await b.goto('dist/DocVisualizer.html');
  const T=()=>b.ev(`DocVisualizer.text()`);
  const labels=()=>b.ev(`JSON.stringify([...document.querySelectorAll('.diagram-box')].map(d=>[...d.querySelectorAll('.svg-wrap svg .item')].map(g=>g.getAttribute('aria-label'))))`);
  const warns=()=>b.ev(`document.getElementById('warnings').innerText.replace(/\\n/g,' / ').slice(0,300)`);
  const to2d=async()=>{ if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(400); };
  const load=async f=>{ await b.pick(f); await to2d(); };
  const diffL=(a,c)=>{const x=a.split(/\r?\n/),y=c.split(/\r?\n/);const out=[];const n=Math.max(x.length,y.length);let i=0,j=0;const sa=new Set(x),sb=new Set(y);
    return {removed:x.filter(l=>!sb.has(l)),added:y.filter(l=>!sa.has(l)),n:[x.length,y.length]}};
  const boxEl=(d,i)=>`#dg${d} .item[data-i="${i}"] .box`;
  const idxOf=async(d,name)=>b.ev(`(()=>{const a=[...document.querySelectorAll('#dg${d} .svg-wrap svg .item')];const g=a.find(x=>x.getAttribute('aria-label')===${JSON.stringify(name)});return g?+g.getAttribute('data-i'):-1})()`);
  const click=async(d,i)=>{ const pt=JSON.parse(await b.ev(`(()=>{const e=document.querySelector('${boxEl(d,i)}');e.scrollIntoView({block:'start'});const bar=document.querySelector('.bar').getBoundingClientRect().bottom;let r=e.getBoundingClientRect();scrollBy(0,r.top-(bar+60));r=e.getBoundingClientRect();return JSON.stringify([r.left+r.width/2,r.top+r.height/2])})()`)); await sleep(200); await b.mouse(pt[0],pt[1]); await sleep(300); return pt; };
  const dbl=async(d,i)=>{ const pt=await click(d,i); await b.key('Escape'); await sleep(100); for(const t of ['mousePressed','mouseReleased','mousePressed','mouseReleased']) await b.send('Input.dispatchMouseEvent',{type:t,x:pt[0],y:pt[1],button:'left',clickCount:t.includes('Pressed')?2:2}); await sleep(400); return pt; };
  const typeEnter=async s=>{ await b.send('Input.insertText',{text:s}); await sleep(100); await b.key('Enter'); await sleep(500); };
  const act=async(a,v)=>{ const sel=`#panel .act[data-act="${a}"]`+(v!==undefined?`[data-v="${v}"]`:''); const r=await b.rectOf(sel); if(!r) throw new Error('ボタンなし '+sel); await sleep(150); const r2=await b.rectOf(sel); await b.mouse(r2.cx,r2.cy); await sleep(500); };
  const lastDlg=()=>b.dialogs[b.dialogs.length-1]||'';
  const writeTmp=(t,name='tmp_rt.md')=>{fs.writeFileSync('verify/md/'+name,t);return 'verify/md/'+name;};
  return {b,T,labels,warns,to2d,load,diffL,boxEl,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep};
}
