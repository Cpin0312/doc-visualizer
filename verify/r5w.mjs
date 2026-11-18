// Windows らしい場面：画面の拡大 150%・太いスクロールバー（17px）・CRLF/Shift_JIS の md
import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs';
const b=await openBrowser({offline:true,w:1400,h:900,scale:1.5,sb:17});
await b.goto('dist/DocVisualizer.html');
console.log('dpr',await b.ev('devicePixelRatio'),'innerWidth',await b.ev('innerWidth'),'スクロールバー幅',await b.ev('innerWidth-document.documentElement.clientWidth'));
for(const f of ['07_sjis_crlf_wrapped','04_sjis','05_crlf','06_bom','01_copilot_wrapped']){
  await b.pick(`verify/md/${f}.md`);
  console.log(f,await b.ev(`JSON.stringify({s:document.getElementById('status').innerText.slice(0,48),svg:document.querySelectorAll('#diagrams .svg-wrap svg').length,boxes:document.querySelectorAll('#diagrams rect.box').length,title:document.getElementById('title').innerText})`));
}
// 3D の canvas が拡大に合っているか（ぼやけない）、箱を本物のマウスで押す
console.log('canvas',await b.ev(`(()=>{const c=document.querySelector('#dg0 canvas');return JSON.stringify({buf:[c.width,c.height],css:[Math.round(c.clientWidth),Math.round(c.clientHeight)],ratio:+(c.width/c.clientWidth).toFixed(2)})})()`));
await b.rectOf('#dg0 canvas'); await sleep(400);
const p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); await b.mouse(p.x,p.y); await sleep(600);
console.log('3D 箱を押す',await b.ev(`document.getElementById('panel').hidden+'|'+document.querySelector('#panelBody h2')?.innerText`));
await b.shot('verify/out/r5w-3d.png');
// 文字の大きさ・2D の最小文字
await b.clickSel('#mode'); await sleep(500);
console.log('2D 最小文字(実効CSS px)',await b.ev(`(()=>{const s=document.querySelector('#diagrams .svg-wrap svg');const vb=s.viewBox.baseVal;let m=1e9;s.querySelectorAll('text').forEach(t=>{if(t.textContent.trim())m=Math.min(m,parseFloat(getComputedStyle(t).fontSize)*s.getBoundingClientRect().width/vb.width)});return m.toFixed(1)})()`));
await b.shot('verify/out/r5w-2d.png');
// 発表 2D：枠いっぱい（拡大150%・太いバー）。途中でバーを消す
const M=`(()=>{const st=document.getElementById('pStage'),s=st.querySelector('svg');const r=s.getBoundingClientRect();const cw=st.clientWidth-32,ch=st.clientHeight-32;const w=+s.getAttribute('data-w'),h=+s.getAttribute('data-h');const k=Math.min(cw/w,ch/h);const d=cw/w<ch/h?r.width-w*k:r.height-h*k;return JSON.stringify({stage:[st.clientWidth,st.clientHeight],svg:[+r.width.toFixed(1),+r.height.toFixed(1)],diff:+d.toFixed(1),over:r.width>cw+2||r.height>ch+2})})()`;
await b.key('p','KeyP'); await sleep(600); let a=await b.ev(M); console.log('発表 開いた直後',a);
await sleep(1500); a=await b.ev(M); console.log('発表 1.5秒後',a);
await b.ev(`document.documentElement.style.overflow='hidden'`); await sleep(800); a=await b.ev(M); console.log('バーを消した後',a);
await b.ev(`document.documentElement.style.overflow=''`); await sleep(800); a=await b.ev(M); console.log('バーが戻った後',a);
await b.shot('verify/out/r5w-present.png'); await b.key('Escape');
// PDF
const pdf=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true});
fs.writeFileSync('verify/out/r5w.pdf',Buffer.from(pdf.data,'base64')); console.log('PDF 書いた', Buffer.from(pdf.data,'base64').length);
console.log('外',b.external(),'errors',b.logs); await b.close();
