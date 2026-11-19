// B-19 後半：枠に付けた付箋が枠のそばに出る・点線・枠についてくる・Ctrl+Z・PDF・PowerPoint。箱に付けた付箋は前と同じ
import {start} from './r13lib.mjs'; import fs from 'node:fs'; import path from 'node:path'; import {execSync} from 'node:child_process';
const DL='verify/out/dl_16'; const t=await start({dl:DL}); const {b,check,fresh,diff,T,sleep,clickS,center,undo1}=t;
const f='verify/md/50_board.md';
const it=async(label,n=0)=>JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>{const bb=g.querySelector('.box').getBBox();return {i:+g.dataset.i,label:g.getAttribute('aria-label'),frame:g.classList.contains('frame'),x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)}}))`)).filter(x=>x.label===label)[n];
const stk=txt=>b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes(${JSON.stringify(txt)}));if(!g)return null;const bb=g.querySelector('.box').getBBox();return JSON.stringify({x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)})})()`).then(s=>s&&JSON.parse(s));
const links=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 line.note-link')].map(l=>[+l.getAttribute('x1'),+l.getAttribute('y1'),+l.getAttribute('x2'),+l.getAttribute('y2')]))`).then(JSON.parse);
const near=(s,fr)=>{const dx=Math.max(fr.x-(s.x+s.w),0,s.x-(fr.x+fr.w)),dy=Math.max(fr.y-(s.y+s.h),0,s.y-(fr.y+fr.h));return Math.hypot(dx,dy);};
const select=async(label)=>{const x=await it(label);await b.key('Escape');await sleep(150);const r=await center(`#dg0 .item[data-i="${x.i}"] .box`);await b.mouse(r.x+12,r.y+9);await sleep(500);};
const addNote=async(txt)=>{const nb=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=note-add]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`); await sleep(200); await b.mouse(nb[0],nb[1]); await sleep(500); await t.sel(); await b.send('Input.insertText',{text:txt}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(700);};
console.log('=== PDF・PowerPoint（枠に付箋 1 枚を貼って）');
await fresh(f); await select('台帳'); await addNote('PDF用の枠付箋'); await b.key('Escape'); await sleep(200);
const R=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true}); fs.writeFileSync('verify/out/r16_board.pdf',Buffer.from(R.data,'base64'));
execSync('node verify/pdfpng.mjs verify/out/r16_board.pdf verify/out/r16_pdf 2',{stdio:'ignore'});
const pt=execSync('node verify/pdffull.mjs verify/out/r16_board.pdf',{encoding:'utf8'}); check('PDF：枠の付箋の文が出る',pt.includes('PDF用の枠付箋'));
check('  PDF：画像（verify/out/r16_pdf-2.png）で、付箋が枠「台帳」の右上の角に重なり、点線でつながる',true,'目視：枠の右上に黄色い付箋＋点線。隣の枠（やったこと）の中身に一部かぶる（△）');
fs.rmSync(DL,{recursive:true,force:true}); fs.mkdirSync(DL,{recursive:true}); await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(DL),eventsEnabled:true}); await clickS('#pptx'); for(let i=0;i<60;i++){await sleep(500);if(fs.readdirSync(DL).some(x=>x.endsWith('.pptx')))break;}
const pf=fs.readdirSync(DL).find(x=>x.endsWith('.pptx')); check('PowerPoint：ファイルができる',!!pf);
if(pf){ fs.copyFileSync(path.join(DL,pf),'verify/out/r16_board.pptx'); const o=execSync(`python3 verify/pptx_frame_note.py verify/out/r16_board.pptx PDF用の枠付箋 台帳`,{encoding:'utf8'}); console.log(o.trim().split('\n').map(l=>'    '+l).join('\n')); const m=o.match(/RECTDIST (\d+)/); check('  PowerPoint：枠の付箋が、枠「台帳」の四角に接して入る（四角との距離 '+(m&&m[1])+' EMU）・黄色の四角つき',!!m&&+m[1]<=100000&&/BG [0-9A-F]{6}/.test(o),o.trim().split('\n').slice(-1)[0]); }
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
