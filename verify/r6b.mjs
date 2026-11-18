// ポップアップ：本物のマウスで全部の押せるもの（.item）を押し、窓の位置・中身を確かめる
import {openBrowser,sleep} from './h.mjs';
const [,,md,label,W,Hh,SC,mode]=process.argv; // mode: 2d|3d
const b=await openBrowser({offline:true,w:+W||1400,h:+Hh||900,scale:+SC||0});
await b.goto('dist/DocVisualizer.html'); await b.pick(md);
if(mode==='2d'){ if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);}
const info=`(()=>{const p=document.getElementById('panel');const r=p.getBoundingClientRect();return JSON.stringify({hidden:p.hidden,r:[r.left,r.top,r.right,r.bottom].map(Math.round),vw:document.documentElement.clientWidth,vh:innerHeight,txt:p.innerText.replace(/\\n+/g,' / ').slice(0,160)})})()`;
const res={n:0,open:0,clipped:[],overlap:[],empty:[],hidden:[]};
const nd=await b.ev(`document.querySelectorAll('.diagram-box').length`);
for(let d=0;d<nd;d++){
  const items=await b.ev(`(()=>{const out=[];document.querySelectorAll('#dg${d} .item').forEach(g=>out.push(+g.getAttribute('data-i')));return out})()`);
  for(const i of items){
    for(const pos of ['mid','top','bottom']){
      let pt;
      if(mode==='2d'){
        pt=JSON.parse(await b.ev(`(()=>{const g=document.querySelector('#dg${d} .item[data-i="${i}"]');const bx=(g.querySelector('.box')||g);bx.scrollIntoView({block:'center'});const r0=bx.getBoundingClientRect();const pos='${pos}';const bar=document.querySelector('.bar').getBoundingClientRect().bottom;let want=pos==='mid'?(bar+innerHeight)/2:pos==='top'?bar+40:innerHeight-40;scrollBy(0,r0.top+r0.height/2-want);const r=bx.getBoundingClientRect();let x=r.left+r.width/2,y=r.top+r.height/2;const pth=g.querySelector('path');if(pth&&pth.getTotalLength&&g.closest('svg')){const m=pth.getPointAtLength(pth.getTotalLength()*0.5);const q=g.closest('svg').createSVGPoint();q.x=m.x;q.y=m.y;const c=q.matrixTransform(pth.getScreenCTM());/* 扇の外側の縁に近い点を内側へ */ const cx=r.left+r.width/2,cy=r.top+r.height/2;x=(c.x*0.6+cx*0.4);y=(c.y*0.6+cy*0.4);}return JSON.stringify({x:x,y:y,a:[r.left,r.top,r.right,r.bottom],ok:r.width>0})})()`));
      } else {
        await b.ev(`document.querySelector('#dg${d} canvas').scrollIntoView({block:'center'})`); await sleep(120);
        const w=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(${d},${i}))`)); if(!w){continue;} pt={x:w.x,y:w.y,a:[w.x-8,w.y-8,w.x+8,w.y+8],ok:true};
        if(pos!=='mid')continue;
      }
      const barB=await b.ev(`document.querySelector('.bar').getBoundingClientRect().bottom`); if(mode==='3d'&&(pt.y<barB+5)){res.skip=(res.skip||0)+1;continue;}
      const hit=await b.ev(`(()=>{const e=document.elementFromPoint(${pt.x},${pt.y});return e?(e.closest('.item')?'item':(e.tagName==='CANVAS'?'canvas':e.tagName)):'none'})()`); if(hit!=='item'&&hit!=='canvas'){res.skip=(res.skip||0)+1;continue;}
      if(!pt.ok||pt.x<0||pt.y<0||pt.y>(+Hh||900)){res.skip=(res.skip||0)+1;continue;}
      res.n++;
      await b.mouse(pt.x,pt.y); await sleep(250);
      const o=JSON.parse(await b.ev(info));
      if(o.hidden){res.hidden.push(`d${d}i${i}${pos}`);}
      else{res.open++;
        const [l,t,r,bm]=o.r; if(l<0||t<0||r>o.vw||bm>o.vh) res.clipped.push(`d${d}i${i}${pos} ${o.r} vw${o.vw}vh${o.vh}`);
        const [al,at,ar,ab]=pt.a; if(!(r<=al||l>=ar||bm<=at||t>=ab)) res.overlap.push(`d${d}i${i}${pos}`); if(pt.x>=l&&pt.x<=r&&pt.y>=t&&pt.y<=bm) res.covered=(res.covered||[]).concat(`d${d}i${i}${pos}`);
        if(o.txt.length<8) res.empty.push(`d${d}i${i}`);
        if(res.open<=0) {}
        res.sample=res.sample||{}; if(pos==='mid'&&i<=1) res.sample[`d${d}i${i}`]=o.txt;
      }
      await b.key('Escape');
    }
  }
}
console.log(label,mode,`押した ${res.n} / 開いた ${res.open}`,'閉じたまま',res.hidden.length,res.hidden.slice(0,6).join(','),'| 画面から切れた',res.clipped.length,res.clipped.slice(0,4).join(';'),'| 外接の四角と重なる',res.overlap.length,'| 押した点を隠した',(res.covered||[]).length,(res.covered||[]).slice(0,6).join(','),'| 中身が空',res.empty.length,'| 見えず飛ばした',res.skip||0);
if(process.env.SAMPLE)for(const k in res.sample)console.log('  ',k,res.sample[k]);
console.log('外',b.external(),'errors',b.logs);
await b.close();
