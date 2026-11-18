// S-7 見直し：箱を真ん中より下で押し、「形と色を変える」を開き、5 つの行が全部押せるか
import {openBrowser,sleep} from './h.mjs';
const [,,WH,HH,SC]=process.argv;
const b=await openBrowser({offline:true,w:+WH||1400,h:+HH||900,scale:+SC||0}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/25_move.md');
if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);
const vh=await b.ev('innerHeight'), vw=await b.ev('document.documentElement.clientWidth');
const L=async()=>{const t=await b.ev(`DocVisualizer.text()`);const m=t.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/);return m?m[1].replace(/\s+/g,''):''};
const geo=()=>b.ev(`(()=>{const p=document.getElementById('panel');const r=p.getBoundingClientRect();const rows={};p.querySelectorAll('.styl button').forEach(x=>{const q=x.getBoundingClientRect();const k=x.getAttribute('data-k');rows[k]=rows[k]||[1e9,-1e9];rows[k][0]=Math.min(rows[k][0],q.top);rows[k][1]=Math.max(rows[k][1],q.bottom)});return JSON.stringify({vh:innerHeight,vw:document.documentElement.clientWidth,panel:[r.left,r.top,r.right,r.bottom].map(Math.round),sc:p.scrollHeight>p.clientHeight,rows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,[Math.round(v[0]),Math.round(v[1])]]))})})()`);
const res=[];
for(const [frac,label] of [[0.5,'真ん中'],[0.75,'真ん中より下'],[0.9,'下の端']]){
  // 箱を画面の高さの frac の所に置いて押す
  const pt=JSON.parse(await b.ev(`(()=>{const e=document.querySelector('#dg3 .item[data-i="2"] .box');e.scrollIntoView({block:'center'});let r=e.getBoundingClientRect();scrollBy(0,r.top+r.height/2-innerHeight*${frac});r=e.getBoundingClientRect();return JSON.stringify([r.left+r.width/2,r.top+r.height/2,Math.round(r.top+r.height/2)])})()`));
  await sleep(250); await b.mouse(pt[0],pt[1]); await sleep(350);
  const closed=await b.ev(`document.querySelector('#panel details.styl')?.open===false`);
  if(!(await b.ev(`!document.getElementById('panel').hidden`))){console.log(label,'窓が開かない');continue;}
  const g0=JSON.parse(await geo());
  // 欄を開く（本物のクリック）。summary が画面の中に見えているか
  const sm=await b.ev(`(()=>{const s=document.querySelector('#panel details.styl summary');const q=s.getBoundingClientRect();return JSON.stringify([q.top,q.bottom,q.left+q.width/2,q.top+q.height/2])})()`); const sq=JSON.parse(sm);
  const smOk=sq[0]>=0&&sq[1]<=vh;
  await b.mouse(sq[2],sq[3]); await sleep(400);
  const g=JSON.parse(await geo());
  const rows=['shape','color','stroke','scale','font'];
  const inside=rows.map(k=>g.rows[k]&&g.rows[k][0]>=0&&g.rows[k][1]<=vh);
  // 5 行を本物のクリックで押し、layout に入るか（欄を開いたまま）
  const want={shape:'"ellipse"',color:'"green"',stroke:'4',scale:'1.4',font:'1.25'}; const did=[];
  for(const k of rows){ const sel=`#panel .styl button[data-k="${k}"][data-v='${want[k]}']`;
    let wheels=0; for(;wheels<12;wheels++){ const vis=await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'none';const r=e.getBoundingClientRect(),p=document.getElementById('panel').getBoundingClientRect();return (r.top>=p.top&&r.bottom<=p.bottom&&r.top>=0&&r.bottom<=innerHeight)?'ok':'no'})()`); if(vis==='none')break; if(vis==='ok')break; const pc=JSON.parse(await b.ev(`(()=>{const p=document.getElementById('panel').getBoundingClientRect();return JSON.stringify([p.left+p.width/2,p.top+p.height/2])})()`)); await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:pc[0],y:pc[1],deltaX:0,deltaY:90}); await sleep(150);} 
    const q=JSON.parse(await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'null';const r=e.getBoundingClientRect();return JSON.stringify([r.left+r.width/2,r.top+r.height/2,r.top>=0&&r.bottom<=innerHeight])})()`)); if(q==='null'||q===null){did.push(k+':ボタンなし');continue;}
    const hit=await b.ev(`(()=>{const e=document.elementFromPoint(${q[0]},${q[1]});return e&&e.getAttribute('data-k')`+"})()"); await b.mouse(q[0],q[1]); await sleep(400);
    const lay=await L(); did.push(k+(wheels?'(窓の中を'+wheels+'回スクロール)':'')+(hit===k?'':'(別の物に当たった:'+hit+')')+':'+(lay.includes('"'+k+'":'+want[k].replace(/"/g,'"'))?'入った':'入らない')); }
  console.log(`${label}(箱の中心 y=${pt[2]}/${vh}) 窓${JSON.stringify(g0.panel)}→欄を開いた後${JSON.stringify(g.panel)}  summary見える:${smOk?'○':'×'} 5行が画面内:${inside.every(Boolean)?'○':'×'+JSON.stringify(g.rows)} 窓の中スクロール:${g.sc} | 押した結果 ${did.join(' ')}`);
  await b.key('Escape'); for(let i=0;i<8;i++) await b.keyMod('z','ctrl');
}
console.log('設定 vh',vh,'vw',vw,'拡大',SC||1,'外',b.external(),'errors',b.logs); await b.close();
