import {openBrowser,sleep} from './h.mjs';
const D='dist/DocVisualizer.html', O='verify/out/r3/';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto(D); await b.pick('verify/md/01_copilot_wrapped.md');
// 3D のはじめ：timeline の3つ目の旗が canvas の中に見えるか（where3d で画面位置）
const g=await b.ev(`JSON.stringify([0,1,2].map(i=>{const p=DocVisualizer.where3d(2,i);const c=document.querySelector('#dg2 canvas');const sc=document.querySelector('#dg2 .v3scroll');const r=(sc||c).getBoundingClientRect();return {i,x:Math.round(p.x),y:Math.round(p.y),box:[Math.round(r.left),Math.round(r.right)],inside:p.x>r.left&&p.x<r.right}}))`);
console.log('timeline 3D 旗の位置',g);
console.log('3D 枠',await b.ev(`(()=>{const s=document.querySelector('#dg2 .v3scroll');return s?[s.scrollWidth,s.clientWidth]:'scrollなし'})()`));
await b.rectOf('#dg2'); await sleep(600); await b.shot(O+'timeline3d.png');
// 箱をもう1回押す（マウス）
await b.rectOf('#dg0 canvas'); await sleep(300);
let p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); await b.mouse(p.x,p.y); await sleep(600);
const st=`JSON.stringify({hidden:document.getElementById('panel').hidden,sel:document.querySelectorAll('.item.sel').length})`;
console.log('1回目',await b.ev(st));
p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); await b.mouse(p.x,p.y); await sleep(600); console.log('2回目(同じ箱)',await b.ev(st));
await b.mouse(p.x,p.y); await sleep(600); console.log('3回目',await b.ev(st));
// 別の箱へ
p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,0))`)); await b.mouse(p.x,p.y); await sleep(600); const a=await b.ev(`document.getElementById('panelBody').innerText.slice(0,10)+'|'+(await_=1)`).catch(()=>'');
console.log('別の箱',await b.ev(st),await b.ev(`document.querySelector('#panelBody h2').innerText`));
// 2D：マウスとキーボード
await b.clickSel('#mode'); await sleep(500);
await b.clickSel('#dg0 .item'); console.log('2D 1回目',await b.ev(st));
await b.clickSel('#dg0 .item'); console.log('2D 2回目(マウス)',await b.ev(st));
await b.ev(`document.querySelector('#dg0 .item').focus()`); await b.key('Enter'); console.log('2D キーボード Enter 1回目',await b.ev(st));
await b.ev(`document.querySelector('#dg0 .item').focus()`); await b.key('Enter'); console.log('2D キーボード Enter 2回目',await b.ev(st));
await b.ev(`document.querySelector('#dg0 .item').focus()`); await b.key(' '); console.log('2D キーボード スペース 1回目',await b.ev(st));
await b.ev(`document.querySelector('#dg0 .item').focus()`); await b.key(' '); console.log('2D キーボード スペース 2回目',await b.ev(st));
await b.key('Escape');
// 発表 2D の枠いっぱい・社外秘・文字
await b.key('p','KeyP'); await sleep(500);
console.log('発表2D',await b.ev(`(()=>{const s=document.querySelector('#pStage svg');const r=s.getBoundingClientRect(),st=document.getElementById('pStage').getBoundingClientRect();const vb=s.viewBox.baseVal;let m=1e9;s.querySelectorAll('text').forEach(t=>{const f=parseFloat(getComputedStyle(t).fontSize)*r.width/vb.width;if(t.textContent.trim())m=Math.min(m,f)});const sec=document.getElementById('secret');const q=sec.getBoundingClientRect();return JSON.stringify({svg:[Math.round(r.width),Math.round(r.height)],stage:[Math.round(st.width),Math.round(st.height)],minFont:+m.toFixed(1),secretVisible:getComputedStyle(sec).display!=='none'&&q.width>0,secretZ:getComputedStyle(sec).zIndex,secretText:sec.innerText,secretPos:[Math.round(q.right),Math.round(q.top)],presentTop:getComputedStyle(document.getElementById('present')).zIndex})})()`));
await b.shot(O+'present2d.png');
await b.key('Escape');
await b.clickSel('#mode'); await b.key('p','KeyP'); await sleep(900); await b.shot(O+'present3d.png');
console.log('発表3D 社外秘',await b.ev(`(()=>{const q=document.getElementById('secret').getBoundingClientRect();return [Math.round(q.right),Math.round(q.top),q.width>0,getComputedStyle(document.getElementById('present')).zIndex,getComputedStyle(document.getElementById('secret')).zIndex]})()`));
await b.key('Escape');
console.log('外',b.external(),'errors',b.logs); await b.close();
