import {openBrowser,sleep} from './h.mjs';
const md=process.argv[2]||'verify/md/01_copilot_wrapped.md';
const SC=+(process.env.SCALE||0),SB=+(process.env.SB||0);
const b=await openBrowser({offline:true,w:1400,h:900,scale:SC,sb:SB});console.log('設定 拡大',SC||1,'スクロールバー指定',SB||'既定'); await b.goto('dist/DocVisualizer.html'); await b.pick(md);
await b.clickSel('#mode'); // 2D（既定は 3D）
console.log('モード',await b.ev(`DocVisualizer.mode()`),'下の画面のスクロールバー幅=',await b.ev(`window.innerWidth-document.documentElement.clientWidth`));
const M=`(()=>{const st=document.getElementById('pStage'),s=st.querySelector('svg');if(!s)return null;const r=s.getBoundingClientRect();const cw=st.clientWidth-32,ch=st.clientHeight-32;const w=+s.getAttribute('data-w'),h=+s.getAttribute('data-h');const k=Math.min(cw/w,ch/h);const ew=w*k,eh=h*k;let m=1e9;const vb=s.viewBox.baseVal;s.querySelectorAll('text').forEach(t=>{if(t.textContent.trim())m=Math.min(m,parseFloat(getComputedStyle(t).fontSize)*r.width/vb.width)});return JSON.stringify({stage:[st.clientWidth,st.clientHeight],svg:[+r.width.toFixed(1),+r.height.toFixed(1)],want:[+ew.toFixed(1),+eh.toFixed(1)],dW:+(r.width-ew).toFixed(1),dH:+(r.height-eh).toFixed(1),bind:cw/w<ch/h?'幅':'高さ',minFont:+m.toFixed(1),over:r.width>cw+2||r.height>ch+2})})()`;
const ok=s=>{const o=JSON.parse(s);const d=o.bind==='幅'?o.dW:o.dH;return (Math.abs(d)<=2&&!o.over)?'○':'×'};
await b.key('p','KeyP'); let a=await b.ev(M); console.log('開いた直後',a,ok(a));
await sleep(2000); a=await b.ev(M); console.log('2秒後',a,ok(a));
// 次の図・箱に進んでも
await b.key('ArrowRight'); await b.key('ArrowRight'); await sleep(500); a=await b.ev(M); console.log('2歩進めた後',a,ok(a));
// 下の画面のスクロールバーを消す
await b.ev(`document.documentElement.style.overflow='hidden'`); await sleep(800);
console.log('スクロールバー幅(消した後)=',await b.ev(`window.innerWidth-document.documentElement.clientWidth`)); a=await b.ev(M); console.log('スクロールバーを消した後',a,ok(a));
await b.ev(`document.documentElement.style.overflow=''`); await sleep(800); a=await b.ev(M); console.log('スクロールバーが戻った後',a,ok(a));
// 窓を細く／広く
for(const [w,h] of [[600,700],[380,640],[1920,1080],[1400,900]]){await b.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await sleep(700);a=await b.ev(M);console.log(`窓 ${w}x${h}`,a,ok(a));}
await b.shot('verify/out/r5-present.png');
// 図の種類を変えて（別の図：最後まで進めて timeline・chart など）
for(let i=0;i<12;i++)await b.key('ArrowRight'); a=await b.ev(M); console.log('12歩先',a,ok(a));
console.log('外',b.external(),'errors',b.logs); await b.close();
