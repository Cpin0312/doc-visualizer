import {openBrowser,sleep} from './h.mjs';
const D='dist/DocVisualizer.html', O='verify/out/r2/';
const hash=`(()=>{const c=document.querySelector('#dg0 canvas');const o=document.createElement('canvas');o.width=200;o.height=120;const x=o.getContext('2d');x.drawImage(c,0,0,200,120);const d=x.getImageData(0,0,200,120).data;let h=0;for(let i=0;i<d.length;i+=4)h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)>>>0;return h})()`;
const pr=`JSON.stringify({on:!document.getElementById('present').hidden,cap:document.getElementById('pCaption').innerText.replace(/\\n/g,'|').slice(0,70),cnt:document.getElementById('pCount').innerText,canv:!!document.querySelector('#present canvas'),svg:!!document.querySelector('#pStage svg')})`;
async function present(b,label){
  await b.key('p','KeyP'); console.log(label,'P →',await b.ev(pr));
  await b.shot(O+'present-'+label+'.png');
  const seq=[];
  for(let i=0;i<9;i++){await b.key('ArrowRight');seq.push(await b.ev(`document.getElementById('pCount').innerText+':'+document.getElementById('pCaption').innerText.split('\\n')[0]`));}
  console.log(label,'→ ×9',seq.join(' / '));
  await b.key(' '); console.log(label,'スペース',await b.ev(`document.getElementById('pCount').innerText`));
  await b.key('ArrowLeft'); console.log(label,'←',await b.ev(`document.getElementById('pCount').innerText`));
  // 最後まで進める
  for(let i=0;i<40;i++)await b.key('ArrowRight'); console.log(label,'最後まで',await b.ev(pr));
  await b.key('Escape'); console.log(label,'Esc',await b.ev(pr));
}
{ const b=await openBrowser({offline:true}); await b.goto(D); await b.pick('verify/md/01_copilot_wrapped.md');
  // 動き：普通
  const a=await b.ev(hash); await sleep(1500); const c=await b.ev(hash); console.log('普通：画が動く',a!==c);
  console.log('hidden?',await b.ev('document.hidden'));
  // F5
  await b.key('F5'); await sleep(1500); console.log('F5後 まだ図がある',await b.ev(`document.querySelectorAll('#diagrams svg').length+' 発表='+!document.getElementById('present').hidden`));
  await present(b,'3d');
  await b.clickSel('#mode'); await present(b,'2d');
  // 図の途中でボタン
  console.log('外',b.external(),'errors',b.logs); await b.close(); }
{ const b=await openBrowser({offline:true,reduced:true}); await b.goto(D); await b.pick('verify/md/01_copilot_wrapped.md');
  const a=await b.ev(hash); await sleep(1500); const c=await b.ev(hash); console.log('動きを減らす：画が止まる',a===c,'| reduced=',await b.ev('DocScene.reduced')); await b.shot(O+'reduced.png'); await b.close(); }
{ const b=await openBrowser({offline:true}); await b.goto(D); await b.pick('verify/md/01_copilot_wrapped.md');
  const t=await b.send('Target.createTarget',{url:'about:blank'}); await b.send('Target.activateTarget',{targetId:t.targetId}); await sleep(1200);
  console.log('別タブを前に出した後 hidden=',await b.ev('document.hidden')); 
  const a=await b.ev(hash); await sleep(1500); const c=await b.ev(hash); console.log('隠れたタブで画が止まる',a===c); await b.close(); }
