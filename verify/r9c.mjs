// PDF の分け目：印刷の画面（print メディア）で、各タイルの切り口から部品までの距離（SVG 単位）を測る
import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1123,h:794}); await b.goto('dist/DocVisualizer.html');
const JS=`(()=>{const pages=[...document.querySelectorAll('#print .page')];const tiles=[];pages.forEach((pg,pi)=>{const h2=pg.querySelector('h2')?.innerText||'';const m=h2.match(/[（(](\\d+)\\/(\\d+)[)）]/);pg.querySelectorAll('.p-fig svg').forEach(s=>{const vb=s.viewBox.baseVal;if(!m||!vb||!vb.width)return;tiles.push({pi,base:h2.replace(/[（(]\\d+\\/\\d+[)）]/,''),s,vb:[vb.x,vb.y,vb.x+vb.width,vb.y+vb.height]})})});
const out=[];const groups={};tiles.forEach(t=>{(groups[t.base]=groups[t.base]||[]).push(t)});
Object.values(groups).forEach(ts=>{ts.forEach(t=>{const [x0,y0,x1,y1]=t.vb;const E=(a,b)=>Math.abs(a-b)<1.5;
 const cuts=[];ts.forEach(o=>{if(o===t)return;if(E(o.vb[0],x1))cuts.push(['x',x1]);if(E(o.vb[2],x0))cuts.push(['x',x0]);if(E(o.vb[1],y1))cuts.push(['y',y1]);if(E(o.vb[3],y0))cuts.push(['y',y0]);});
 const r=t.s.getBoundingClientRect(),sx=r.width/(x1-x0),sy=r.height/(y1-y0);
 const rects=[];t.s.querySelectorAll('.item .box, .edge-label rect, .item text, .edge-label text').forEach(e=>{const q=e.getBoundingClientRect();if(q.width||q.height)rects.push({k:e.closest('.edge-label')?'札':(e.tagName==='text'?'字':'箱'),x0:x0+(q.left-r.left)/sx,x1:x0+(q.right-r.left)/sx,y0:y0+(q.top-r.top)/sy,y1:y0+(q.bottom-r.top)/sy})});
 const edges=[...t.s.querySelectorAll('path.edge')].map(e=>{const q=e.getBoundingClientRect();return {x0:x0+(q.left-r.left)/sx,x1:x0+(q.right-r.left)/sx,y0:y0+(q.top-r.top)/sy,y1:y0+(q.bottom-r.top)/sy}});
 cuts.forEach(([ax,c])=>{let min=1e9,span=0,what='';rects.forEach(p=>{const a=ax==='x'?p.x0:p.y0,b2=ax==='x'?p.x1:p.y1;if(a<c&&b2>c){span++;what+=p.k+'['+Math.round(a)+'-'+Math.round(b2)+'] '}else{const g=Math.min(Math.abs(a-c),Math.abs(b2-c));if(g<min){min=g}}});let espan=0;edges.forEach(p=>{const a=ax==='x'?p.x0:p.y0,b2=ax==='x'?p.x1:p.y1;if(a<c&&b2>c)espan++});out.push({base:t.base.slice(0,16),page:t.pi+1,cut:ax+Math.round(c),部品との最小距離:+min.toFixed(1),箱札字をまたぐ:span,どれ:what,線がまたぐ:espan})})})});return JSON.stringify(out)})()`;
await b.send('Emulation.setEmulatedMedia',{media:'screen'});
for(const f of ['23_flowchart','18_lanes_back','14_over200','21_graphs','01_copilot_wrapped']){
  await b.send('Emulation.setEmulatedMedia',{media:'screen'}); await b.pick(`verify/md/${f}.md`); await b.send('Emulation.setEmulatedMedia',{media:'print'}); await sleep(400);
  const r=JSON.parse(await b.ev(JS));
  const mn=r.length?Math.min(...r.map(x=>x.部品との最小距離)):null, sp=r.reduce((a,x)=>a+x.箱札字をまたぐ,0);
  console.log(f,'切り口',r.length,'| 箱・札・字をまたぐ',sp,'| 部品（箱・札・字）との最小距離',mn,'| 線がまたぐ(のべ)',r.reduce((a,x)=>a+x.線がまたぐ,0)); if(f==='23_flowchart'||f==='18_lanes_back')console.log('  ',JSON.stringify(r).slice(0,420));
}
console.log('外',b.external(),'errors',b.logs); await b.close();
