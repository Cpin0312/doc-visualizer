// R8b-1：矢印キーで動かす・timeline の旗・kpi のカード
import {openBrowser,sleep} from './h.mjs';
const [,,md,SC]=process.argv;
const b=await openBrowser({offline:true,w:1400,h:900,scale:+SC||0}); await b.goto('dist/DocVisualizer.html'); await b.pick(md||'verify/md/25_move.md');
if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);
const T=()=>b.ev(`DocVisualizer.text()`); const ok=c=>c?'○':'×';
const only=(o,t)=>{let i=0;while(i<o.length&&o[i]===t[i])i++;let j=0;while(j<o.length-i&&o[o.length-1-j]===t[t.length-1-j])j++;const add=t.slice(i,t.length-j);return i+j>=o.length&&/^(\r?\n)*~~~layout[\s\S]*~~~(\r?\n)?$/.test(add)};
const orig=await T();
const bx=(d,i)=>b.ev(`(()=>{const e=document.querySelector('#dg${d} .item[data-i="${i}"] .box');const bb=e.getBBox();return JSON.stringify([+bb.x.toFixed(1),+bb.y.toFixed(1)])})()`);
const focus=async(d,i)=>{ // Tab で届かせる：図の先頭の箱へ Tab、あとは Tab で i 番目まで
  await b.ev(`document.activeElement.blur();document.querySelector('#dg${d}').scrollIntoView();`);
  await b.ev(`(()=>{const e=document.querySelector('#dg${d} .item[data-i="${i}"]');e.focus()})()`); await sleep(200);};
// 1 矢印キー 8、Shift で 1
await focus(0,1); let a=JSON.parse(await bx(0,1));
await b.keyArrow('ArrowRight'); let c=JSON.parse(await bx(0,1)); console.log('→ 1回: dx',c[0]-a[0],'(8 のはず)',ok(Math.abs(c[0]-a[0]-8)<0.6));
console.log('  フォーカスは同じ箱に残る:',ok(await b.ev(`document.activeElement.classList.contains('item')&&document.activeElement.getAttribute('aria-label')`)),await b.ev(`document.activeElement.getAttribute('aria-label')`));
await b.keyArrow('ArrowRight',true); let c2=JSON.parse(await bx(0,1)); console.log('Shift+→: dx',c2[0]-c[0],'(1 のはず)',ok(Math.abs(c2[0]-c[0]-1)<0.6));
await b.keyArrow('ArrowDown'); let c3=JSON.parse(await bx(0,1)); console.log('↓: dy',c3[1]-c2[1],'(8 か、枠でおさまる)');
await b.keyArrow('ArrowLeft'); let c4=JSON.parse(await bx(0,1)); console.log('←: dx',c4[0]-c3[0],'(−8 のはず)',ok(Math.abs(c4[0]-c3[0]+8)<0.6));
console.log('  同じ箱への続けた4回 → 取り消し [戻す,やり直す]',await b.ev(`JSON.stringify(DocVisualizer.canUndo())`));
await b.keyMod('z','ctrl'); let r=JSON.parse(await bx(0,1)); console.log('  Ctrl+Z 1回で最初の位置に戻る:',ok(Math.abs(r[0]-a[0])<0.6&&Math.abs(r[1]-a[1])<0.6),JSON.stringify(a),'→',JSON.stringify(r),'| 元の md と同じ',ok((await T()).trimEnd()===orig.trimEnd()));
console.log('  Ctrl+Z のあともフォーカスは?',await b.ev(`document.activeElement.getAttribute&&document.activeElement.getAttribute('aria-label')||document.activeElement.tagName`));
// 別の箱へ移ると別の取り消しになる
await focus(0,1); await b.keyArrow('ArrowRight'); await sleep(900); await b.keyArrow('ArrowRight'); console.log('  0.8秒より間をあけた2回 → 戻す:',await b.ev(`JSON.stringify(DocVisualizer.canUndo())`),'(2 になるはず)');
await b.keyMod('z','ctrl'); await b.keyMod('z','ctrl'); console.log('  Ctrl+Z ×2 で layout が消える',ok(!/~~~layout/.test(await T())));
// 枠の外へ：左端へ連打
await focus(0,0); for(let i=0;i<8;i++) await b.keyArrow('ArrowLeft'); console.log('左端へ 8 回:', await bx(0,0),'(x>=0 におさまる)'); await b.keyMod('z','ctrl');
// 2 timeline の旗・kpi のカード（01 のとき）
if((md||'').includes('01_')){
 const circ=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg2 svg circle')].map(c=>[c.getAttribute('cx'),c.getAttribute('cy')]))`);
 const c0=await circ(); const lines0=await b.ev(`document.querySelectorAll('#dg2 svg line').length`);
 const r1=await b.rectOf('#dg2 .item[data-i="0"] .box'); await b.drag(r1.cx,r1.cy,70,35);
 const c1=await circ(); const t=await T();
 console.log('timeline の旗を動かす: 日付の点は動かない',ok(c0===c1),'| layout に旗の x,y',/"説明会"|"x"/.test(t),'| md の日付の行は変わらない',ok(only(orig,t)));
 const link=await b.ev(`(()=>{const cs=[...document.querySelectorAll('#dg2 svg circle')].map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]);const bb=document.querySelector('#dg2 .item[data-i="0"] .box').getBBox();const ls=[...document.querySelectorAll('#dg2 svg line')].map(l=>[+l.getAttribute('x1'),+l.getAttribute('y1'),+l.getAttribute('x2'),+l.getAttribute('y2')]);const c=cs[0];const hit=ls.filter(l=>(Math.abs(l[0]-c[0])<1.5&&Math.abs(l[1]-c[1])<1.5)||(Math.abs(l[2]-c[0])<1.5&&Math.abs(l[3]-c[1])<1.5));return JSON.stringify({dot:c,box:[bb.x,bb.y,bb.x+bb.width,bb.y+bb.height].map(Math.round),stem:hit.map(h=>h.map(Math.round))})})()`);
 console.log('  点から旗への線',link);
 await b.shot('verify/out/r9a-timeline.png',{captureBeyondViewport:false});
 await b.keyMod('z','ctrl'); console.log('  Ctrl+Z で旗が戻る',ok(!/~~~layout/.test(await T())));
 const k0=await bx(5,0); const k1=await b.rectOf('#dg5 .item[data-i="0"] .box'); await b.drag(k1.cx,k1.cy,60,30); console.log('kpi カードを動かす:',k0,'→',await bx(5,0),'| md の他の行は変わらない',ok(only(orig,await T())));
 await focus(5,1); await b.keyArrow('ArrowDown'); console.log('  kpi を矢印キーで:',await bx(5,1));
 await focus(2,1); const f0=await bx(2,1); await b.keyArrow('ArrowRight'); console.log('  timeline の旗を矢印キーで:',f0,'→',await bx(2,1),'| 点',ok((await circ())===c0));
}
console.log('外',b.external(),'errors',b.logs); await b.close();
