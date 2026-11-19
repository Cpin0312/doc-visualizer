// 図解(board)：発表・3D・PDF・PowerPoint
import {start} from './r13lib.mjs'; import fs from 'node:fs'; import path from 'node:path'; import {execSync} from 'node:child_process';
const [,,SC,PART]=process.argv; const DL='verify/out/dl_14d';
const t=await start({SC:+SC||0,dl:DL}); const {b,check,fresh,T,sleep,clickS,warn}=t;
const N=['受付','台帳','申込.xlsx','問い合わせ.xlsx','台帳を分ける','担当ごとの箱を作る','増えた手間は1つ','1件あたり -40%'];
console.log('拡大',SC||1);
await fresh('verify/md/50_board.md');
if(!PART||PART==='present'){
console.log('=== 発表');
await b.key('p'); await sleep(900); let found=null;
for(let k=0;k<6;k++){ const info=await b.ev(`(()=>{const st=document.getElementById('pStage');const sv=st.querySelector('svg');if(!sv)return null;const r=sv.getBoundingClientRect(),w=st.getBoundingClientRect();return {items:sv.querySelectorAll('.item').length,frames:sv.querySelectorAll('.item.frame').length,w:Math.round(r.width),h:Math.round(r.height),stW:Math.round(w.width),stH:Math.round(w.height),inside:r.left>=w.left-2&&r.right<=w.right+2&&r.top>=w.top-2&&r.bottom<=w.bottom+2,cap:document.getElementById('pCaption').innerText.slice(0,40).replace(/\\n/g,'|'),minFont:Math.min(...[...sv.querySelectorAll('text')].map(x=>parseFloat(getComputedStyle(x).fontSize)*(r.width/ +sv.dataset.w)))}})()`); if(info&&info.frames>=1){found=info;break;} await b.key(' '); }
check('図解の画面が、発表の途中に出る',!!found,JSON.stringify(found));
if(found){ check('  舞台いっぱいに収まる（はみ出さない・片方の辺はほぼ満杯）',found.inside&&(found.w>=found.stW*0.9||found.h>=found.stH*0.9),`図 ${found.w}x${found.h} / 舞台 ${found.stW}x${found.stH}`); check('  いちばん小さい字が読める大きさ（11px 以上）',found.minFont>=11,'最小 '+found.minFont.toFixed(1)+'px'); await b.shot('verify/out/r14_present_board_'+(SC||1)+'.png'); }
await b.key('Escape'); await sleep(300);
}
if(!PART||PART==='3d'){
console.log('=== 3D');
const m=await b.ev('DocVisualizer.mode()'); if(m!=='3d'){await clickS('#mode');await sleep(1500);} await b.rectOf('#dg0 canvas'); await sleep(1500);
check('3D：キャンバスが出る・エラーなし',(await b.ev(`document.querySelectorAll('#dg0 canvas').length`))>=1&&b.logs.length===0,JSON.stringify(b.logs).slice(0,100)); await b.shot('verify/out/r14_board3d_front_'+(SC||1)+'.png');
const st=await b.ev(`JSON.stringify(window.DocScene&&DocScene.stats?DocScene.stats():null)`);
const pts=await b.ev(`JSON.stringify([...Array(18).keys()].map(i=>DocVisualizer.where3d(0,i)))`).then(JSON.parse); const okp=pts.filter(Boolean).length;
check('  18 個の部品すべてが画面の中に位置を持つ（where3d）',okp===18,okp+'/18 '+st);
// 台に積む：枠の中の箱の高さが枠より上（where3d の y が枠の中心より上に見える…は向きによるので、画像の差で確認）
// 回す：ドラッグで向きを変え、字が読めるか（text3d）
const t0=await b.ev(`DocVisualizer.text3d(0)`); const cv=await b.rectOf('#dg0 canvas'); await sleep(200); const cv2=await b.rectOf('#dg0 canvas'); const wv=await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`); await b.drag(cv2.cx,cv2.cy,260,-60); await sleep(900); await b.shot('verify/out/r14_board3d_turned_'+(SC||1)+'.png'); const t1=await b.ev(`DocVisualizer.text3d(0)`);
const w2=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)), w1=JSON.parse(wv); check('  回す：ドラッグで向きが変わり（部品の画面位置が 20px 以上動く）・エラーなし',Math.hypot(w2.x-w1.x,w2.y-w1.y)>20&&b.logs.length===0,'動き '+Math.round(Math.hypot(w2.x-w1.x,w2.y-w1.y))+'px / ' +'字の大きさ '+t0+'→'+t1+'px'); check('  字が読める大きさ（最小 8px 以上）',t0>=8,'前 '+t0+'px / 回した後 '+t1+'px');
await clickS('#mode'); await sleep(600);
}
if(!PART||PART==='pdf'){
console.log('=== PDF');
const r=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true}); const p='verify/out/r14_board.pdf'; fs.writeFileSync(p,Buffer.from(r.data,'base64'));
const tx=execSync(`node verify/pdffull.mjs ${p}`,{encoding:'utf8'}); const miss=N.filter(n=>!tx.includes(n)); check('PDF：箱・枠・札の文字が全部出る',miss.length===0,'足りない：'+miss.join(','));
check('  タグ（営業・窓口）・印（代償）・線の言葉も出る',['営業','窓口','代償','毎回ぜんぶ見る','合う台帳だけ見る'].every(n=>tx.includes(n)));
try{execSync(`node verify/pdfpng.mjs ${p} verify/out/r14_pdf 2`,{stdio:'ignore'});}catch(e){}
}
if(!PART||PART==='pptx'){
console.log('=== PowerPoint');
fs.rmSync(DL,{recursive:true,force:true}); fs.mkdirSync(DL,{recursive:true}); await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(DL),eventsEnabled:true});
await clickS('#pptx'); for(let i=0;i<60;i++){await sleep(500);if(fs.readdirSync(DL).some(f=>f.endsWith('.pptx')))break;}
const f=fs.readdirSync(DL).find(x=>x.endsWith('.pptx')); check('PowerPoint：ファイルができる',!!f);
if(f){ fs.copyFileSync(path.join(DL,f),'verify/out/r14_board.pptx'); const o=execSync(`python3 verify/pptx_board.py verify/out/r14_board.pptx`,{encoding:'utf8'}); console.log(o.trim().split('\\n').map(l=>'    '+l).join('\\n')); 
  const g=k=>{const m=o.match(new RegExp(k+'=([0-9]+)'));return m&&m[1]}; check('  枠も箱も札も、別々の直せる図形の文字として入っている（'+N.length+' 個の文字が全部）',!/MISSING/.test(o),(o.match(/MISSING.*/)||[''])[0]); check('  線は矢じりつきの線の図形（3 本）',Number(g('arrows'))>=3,'矢じり '+g('arrows')); check('  強調の線（=>）は青、ほかは灰色',/emph blue=1/.test(o)||/3B6FD8/i.test(o),(o.match(/lines .*/)||[''])[0]); }
}
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
