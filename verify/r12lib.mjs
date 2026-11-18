import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs'; import path from 'node:path';
// 保存の窓（showSaveFilePicker）の代わり：アプリの writeHandle（本物）が呼ぶ createWritable/write/close を受けて、バイトを集める
export const STUB=`(()=>{window.__saves=[];window.__picks=[];window.__mode='ok';window.__perm='granted';window.__fail=0;
window.showSaveFilePicker=async(o)=>{window.__picks.push(o&&o.suggestedName);
 if(window.__mode==='abort')throw new DOMException('x','AbortError');
 if(window.__mode==='deny')throw new DOMException('denied','NotAllowedError');
 return window.__mkHandle(o.suggestedName)};
window.__dropStub=0;const _g=DataTransferItem.prototype.getAsFileSystemHandle;DataTransferItem.prototype.getAsFileSystemHandle=function(){if(window.__dropStub){const f=this.getAsFile();return Promise.resolve(window.__mkHandle(f?f.name:'x'))}return _g.call(this)};
window.__mkHandle=(name)=>({kind:'file',name,queryPermission:async()=>window.__perm,requestPermission:async()=>window.__perm,
 createWritable:async()=>{if(window.__fail)throw new Error('書けない（試験）');const ch=[];return {write:async d=>{ch.push(d)},close:async()=>{if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay));const ab=await new Blob(ch).arrayBuffer();window.__saves.push({name,bytes:Array.from(new Uint8Array(ab))});}}}});
})()`;
export async function start({SC=0,W=1400,H=900,stub=true,dl=null}={}){
  const b=await openBrowser({offline:true,w:W,h:H,scale:SC});
  if(stub)await b.send('Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  if(dl){fs.rmSync(dl,{recursive:true,force:true});fs.mkdirSync(dl,{recursive:true});await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(dl),eventsEnabled:true});}
  await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});   // 頭なしで窓のフォーカスが落ちると入力欄が閉じる（道具側の事情）
  await b.goto(process.env.DV_HTML||'dist/DocVisualizer.html');
  const T=()=>b.ev(`DocVisualizer.text()`);
  const dirty=()=>b.ev(`!document.getElementById('dirty').hidden`);
  const saves=()=>b.ev(`window.__saves`).then(a=>(a||[]).map(s=>({name:s.name,bytes:Buffer.from(s.bytes)})));
  const toast=()=>b.ev(`(document.getElementById('toast')||{}).innerText||''`);
  const err=()=>b.ev(`(document.getElementById('error')||{}).innerText||''`);
  const to2d=async()=>{ if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(400); };
  const load=async f=>{ await b.pick(f); await to2d(); };
  const idxOf=async(d,name)=>b.ev(`(()=>{const a=[...document.querySelectorAll('#dg${d} .svg-wrap svg .item')];const g=a.find(x=>x.getAttribute('aria-label')===${JSON.stringify(name)});return g?+g.getAttribute('data-i'):-1})()`);
  const click=async(d,i)=>{ const pt=JSON.parse(await b.ev(`(()=>{const e=document.querySelector('#dg${d} .item[data-i="${i}"] .box');e.scrollIntoView({block:'start'});const bar=document.querySelector('.bar').getBoundingClientRect().bottom;let r=e.getBoundingClientRect();scrollBy(0,r.top-(bar+60));r=e.getBoundingClientRect();return JSON.stringify([r.left+r.width/2,r.top+r.height/2])})()`)); await sleep(200); await b.mouse(pt[0],pt[1]); await sleep(300); return pt; };
  const act=async(a,v)=>{ const sel=`#panel .act[data-act="${a}"]`+(v!==undefined?`[data-v="${v}"]`:''); const r=await b.rectOf(sel); if(!r) throw new Error('ボタンなし '+sel); await sleep(150); const r2=await b.rectOf(sel); await b.mouse(r2.cx,r2.cy); await sleep(500); };
  const typeEnter=async s=>{ await b.send('Input.insertText',{text:s}); await sleep(100); await b.key('Enter'); await sleep(500); };
  const clickSave=async()=>{await b.clickSel('#save');await sleep(900);};
  const dropFile=async f=>{const abs=path.resolve(f);const dd={items:[],files:[abs],dragOperationsMask:1};for(const t of ['dragEnter','dragOver','drop'])await b.send('Input.dispatchDragEvent',{type:t,x:400,y:300,data:dd});await sleep(2500);};
  return {b,T,dirty,saves,toast,err,to2d,load,idxOf,click,act,typeEnter,clickSave,dropFile,sleep};
}
