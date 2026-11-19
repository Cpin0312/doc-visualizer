// R8e：PDF・PowerPoint・発表・3D・付箋だけの図・読み直し。R8d-8：Shift_JIS の 〜 ‖ — ¢ £ ¬
import {start} from './r13lib.mjs'; import fs from 'node:fs'; import path from 'node:path'; import {execSync} from 'node:child_process';
const [,,SC]=process.argv;
const DL='verify/out/dl_g'; const t=await start({SC:+SC||0,dl:DL}); const {b,check,fresh,diff,T,sleep,clickS,nDia,dirty,warn,center}=t;
const NOTES=['見積を急ぐ','期限を確かめる','全体のメモ','4月は多い'];
const pdfText=async tag=>{const r=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true});const p=`verify/out/r13_${tag}.pdf`;fs.writeFileSync(p,Buffer.from(r.data,'base64'));return execSync(`node verify/pdffull.mjs ${p}`,{encoding:'utf8'});};
const doPptx=async tag=>{fs.rmSync(DL,{recursive:true,force:true});fs.mkdirSync(DL,{recursive:true});await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(DL),eventsEnabled:true});await clickS('#pptx');for(let i=0;i<40;i++){await sleep(500);if(fs.readdirSync(DL).some(f=>f.endsWith('.pptx')))break;}const f=fs.readdirSync(DL).find(x=>x.endsWith('.pptx'));if(!f)return null;const o=`verify/out/r13_${tag}.pptx`;fs.copyFileSync(path.join(DL,f),o);return o;};
console.log('拡大',SC||1);
await fresh('verify/md/41_r8e.md'); const orig=await T();
// PDF
let tx=await pdfText('show'); check('PDF：付箋の文が出る（'+NOTES.map(n=>tx.includes(n)?'○':'×').join('')+'）',NOTES.every(n=>tx.includes(n)),'');
// PowerPoint
let pp=await doPptx('show'); check('PowerPoint：ファイルができる',!!pp);
if(pp){ const o=execSync(`python3 verify/pptx_notes.py ${pp} ${NOTES.join(' ')}`,{encoding:'utf8'}); console.log(o.trim().split('\n').map(l=>'    '+l).join('\n')); check('  付箋の文がすべて図形の文字として入っている（直せる）',NOTES.every(n=>o.includes('FOUND '+n)),''); const cols=new Set([...o.matchAll(/bg ([0-9A-F]{6})/g)].map(m=>m[1])); check('  付箋の下に色つきの四角がある（黄・ピンク・水色・緑の 4 色）',cols.size>=3&&NOTES.every(n=>new RegExp('FOUND '+n+'.*bg [0-9A-F]{6}').test(o)),'色 '+[...cols].join(',')); }
// 隠す
await clickS('#hideNotes'); check('「付箋を隠す」：画面から付箋が消え、ボタンが「付箋を出す」になる',(await b.ev(`document.querySelectorAll('.sticky').length`))===0&&(await b.ev(`document.getElementById('hideNotes').innerText`))==='付箋を出す');
check('  md は変わらず、「未保存」も出ない',(await T())===orig&&!(await dirty()));
tx=await pdfText('hide'); check('  隠している間は PDF に出ない',!NOTES.some(n=>tx.includes(n)),NOTES.map(n=>tx.includes(n)?'有':'無').join());
pp=await doPptx('hide'); if(pp){const o=execSync(`python3 verify/pptx_notes.py ${pp} ${NOTES.join(' ')}`,{encoding:'utf8'}); check('  隠している間は PowerPoint に出ない',!/^FOUND/m.test(o),o.trim().replace(/\n/g,' / ').slice(0,100));} else check('  隠している間の PowerPoint ができる',false);
// 発表
await b.key('p'); await sleep(900); let pst=await b.ev(`({on:!document.getElementById('present').hidden,sticky:document.querySelectorAll('#pStage .sticky').length})`); check('発表（隠している間）：付箋が出ない',pst.on&&pst.sticky===0,JSON.stringify(pst)); await b.key('Escape'); await sleep(400);
await clickS('#hideNotes'); check('「付箋を出す」で付箋が戻る',(await b.ev(`document.querySelectorAll('#dg0 .sticky').length`))===4);
await b.key('p'); await sleep(900); const gotoStep=async n=>{for(let i=0;i<n;i++){await b.key(' ');}}; 
let found=false,info=null; for(let k=0;k<12&&!found;k++){ info=await b.ev(`({sticky:document.querySelectorAll('#pStage .sticky').length,cap:document.getElementById('pCaption').innerText.slice(0,30),cnt:(document.getElementById('pCap')||document.querySelector('.p-count')||{}).innerText})`); if(info.sticky>0)found=true; else await b.key(' '); }
check('発表：付箋が出る（開発役は未確認の項目）',found,JSON.stringify(info)); if(found){ await b.shot('verify/out/r13_present_sticky.png'); check('  発表の付箋が画面の中に収まる',await b.ev(`(()=>{const s=document.querySelector('#pStage .sticky').getBoundingClientRect(),w=document.getElementById('pStage').getBoundingClientRect();return s.left>=w.left-2&&s.right<=w.right+2&&s.top>=w.top-2&&s.bottom<=w.bottom+2})()`)); }
await b.key('Escape'); await sleep(400);
// 3D
const m=await b.ev(`DocVisualizer.mode()`); if(m!=='3d'){await clickS('#mode');await sleep(1500);} await b.rectOf('#dg0 canvas'); await sleep(1200); await b.shot('verify/out/r13_sticky3d.png');
check('3D：図が描かれ、エラーなし（付箋は板に平らに描く仕様）',(await b.ev(`DocVisualizer.mode()`))==='3d'&&(await b.ev(`document.querySelectorAll('#dg0 canvas').length`))>=1&&b.logs.length===0,JSON.stringify(b.logs).slice(0,100));
await clickS('#mode'); await sleep(600);
// 付箋だけの図
await fresh('verify/md/42_notes_only.md'); const s42=await b.ev(`({svg:document.querySelectorAll('#dg0 svg').length,stk:document.querySelectorAll('#dg0 .sticky').length,items:document.querySelectorAll('#dg0 .item').length,err:document.getElementById('error').innerText})`);
check('付箋だけの図：図として出る（付箋 2・箱 0・エラーなし）',s42.svg===1&&s42.stk===2&&s42.items===0&&!s42.err,JSON.stringify(s42)); await b.shot('verify/out/r13_notes_only.png');
// 付箋だけの図に貼る
const b42=await T(); await clickS('#dg0 .add-note'); await t.sel(); await b.send('Input.insertText',{text:'3つ目'}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500);
check('  付箋だけの図にも貼れる（付箋 3・Ctrl+Z 1回で戻る）',(await b.ev(`document.querySelectorAll('#dg0 .sticky').length`))===3&&await t.undo1(b42));
// 読み直し
await fresh('verify/md/41_r8e.md'); const snap=async()=>JSON.stringify(await b.ev(`[...document.querySelectorAll('#diagrams .sticky')].map(g=>[g.dataset.d,g.textContent.replace(/\\s+/g,' ').trim(),getComputedStyle(g.querySelector('.box')).fill,!!g.parentNode.querySelector('line.note-link')])`));
await clickS('#dg0 .add-note'); await t.sel(); await b.send('Input.insertText',{text:'貼った付箋'}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500);
const gs=(await b.ev(`[...document.querySelectorAll('#dg0 .sticky')].map(g=>g.textContent.replace(/\\s+/g,' ').trim())`)).findIndex(x=>x.includes('貼った付箋')); const gr=await center(`#dg0 .sticky[data-n="${gs}"]`); await b.mouse(gr.cx,gr.cy); await sleep(400); await clickS('#panel [data-act=note-color][data-v=blue]');
const gr2=await center(`#dg0 .sticky[data-n="${gs}"]`); await b.drag(gr2.cx,gr2.cy,30,20); await sleep(400);
const before=await snap(), txt=await T(); fs.writeFileSync('verify/md/tmp_rt.md',txt); await t.load('verify/md/tmp_rt.md'); const after=await snap();
check('画面で貼る・色を変える・動かした md を読み直すと、同じ付箋（文・色・付け先・位置）になる',before===after&&(await T())===txt,before===after?'':before.slice(0,200)+' ≠ '+after.slice(0,200)); console.log('   書いた note の行:',JSON.stringify(txt.split('\n').filter(l=>l.startsWith('note')).slice(-2)));
// Shift_JIS の字
console.log('--- Shift_JIS：〜 ‖ — ¢ £ ¬');
await fresh('verify/md/34_enc_sjis_crlf.md'); const names=['9時〜17時','a‖b','c—d','¢e','£f','¬g'];
const targets=['受付','確認','見積','承認','請求','入金確認'];
const labs=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`).then(JSON.parse); const use=labs.slice(0,4); const nm4=names.slice(0,4);
for(let k=0;k<use.length;k++){const i=await t.idxOf(0,use[k]);await t.dblSel(`#dg0 .item[data-i="${i}"] .box`);await t.fill(nm4[k]);}
// 残り 2 つは lanes の箱
for(let k=0;k<2;k++){const lb=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg1 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`).then(JSON.parse);const i=await t.idxOf(1,lb[k]);await t.dblSel(`#dg1 .item[data-i="${i}"] .box`);await t.fill(names[4+k]);}
const scr=await T(); b.dialogs.length=0; await t.clickSave(); const sv=await t.saves(); fs.writeFileSync('verify/out/r13_sjis_saved.md',sv[0].bytes); fs.writeFileSync('verify/out/r13_sjis_screen.txt',scr);
check('保存：確かめの窓が出ない（表せない字として扱われない）',b.dialogs.length===0,b.dialogs.join('|').slice(0,100)); check('  警告・赤い帯が出ない',!(await t.err()));
const by=sv[0].bytes; const dec=(()=>{try{return new TextDecoder('shift_jis',{fatal:true}).decode(by)}catch(e){return null}})(); check('  Shift_JIS のまま書かれた（UTF-8 ではない・BOM なし）',!!dec&&by[0]!==0xEF&&!/�/.test(dec)); 
const hexOf=s=>Buffer.from(s,'binary'); 
check('  書いたバイトの対応：〜=81 60、‖=81 61、—=81 5C、¢=81 91、£=81 92、¬=81 CA',['〜','‖','—','¢','£','¬'].length===6&&(()=>{const h=by.toString('hex');return h.includes('8160')&&h.includes('8161')&&h.includes('815c')&&h.includes('8191')&&h.includes('8192')&&h.includes('81ca')})(),'');
await t.load('verify/out/r13_sjis_saved.md'); const re=await T(); const rl=await b.ev(`JSON.stringify([...document.querySelectorAll('.item')].map(g=>g.getAttribute('aria-label')))`);
check('  開き直して読める（文字化けなし・「未保存」なし・知らせなし）',!re.includes('�')&&!(await dirty())&&/（0 件）/.test(await warn()),(await warn()).slice(0,60)+' | '+rl.slice(0,160));
console.log('   読み直した名前（Windows の字に寄る）:',rl.slice(0,200));
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
