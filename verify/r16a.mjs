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
console.log('=== 画面の「＋ 付箋」');
for(const fr of ['台帳','変える前','担当ごと','効果']){
  await fresh(f); const o=await T(); const l0=(await links()).length; await select(fr); await addNote('枠付箋'+fr); const a=await T(); const F=await it(fr); const S=await stk('枠付箋'+fr); const L=await links();
  check('枠「'+fr+'」に付箋：md は `note ['+fr+'] : … @黄` の1行',diff(o,a).added.join()==='note ['+fr+'] : 枠付箋'+fr+' @黄'&&diff(o,a).removed.length===0,diff(o,a).added.join());
  check('  付箋が枠のそばに出る（枠から 40px 以内。図の下に浮かない）',!!S&&near(S,F)<=40,S&&('付箋 ('+S.x+','+S.y+') 枠 ('+F.x+','+F.y+' '+F.w+'x'+F.h+') 距離 '+Math.round(near(S,F))));
  check('  枠への点線が 1 本増える（'+l0+'→'+L.length+'）',L.length===l0+1);
  // ドラッグ
  const r=await center(`#dg0 .item[data-i="${F.i}"] .box`); await b.drag(r.x+12,r.y+9,30,20); await sleep(600); const F2=await it(fr), S2=await stk('枠付箋'+fr);
  check('  枠をドラッグすると付箋もついてくる（枠 +'+(F2.x-F.x)+','+(F2.y-F.y)+' ／付箋 +'+(S2.x-S.x)+','+(S2.y-S.y)+'）',F2.x-F.x>=10&&Math.abs((S2.x-S.x)-(F2.x-F.x))<=2&&Math.abs((S2.y-S.y)-(F2.y-F.y))<=2);
  check('  Ctrl+Z 2回（動かす・付箋）で元の md が1文字も違わず戻る',(await (async()=>{await b.keyMod('z','ctrl');await sleep(300);return undo1(o)})()));
}
console.log('=== md に直接書く');
await fresh('verify/md/43_notes_all.md'); { const F=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg8 .item.frame')].map(g=>{const bb=g.querySelector('.box').getBBox();return {label:g.getAttribute('aria-label'),x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)}}))`).then(JSON.parse); const S=await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg8 .sticky')].find(x=>x.textContent.includes('枠のメモ'));const bb=g.querySelector('.box').getBBox();return JSON.stringify({x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)})})()`).then(JSON.parse); const fr=F.find(x=>x.label==='変える前');
  check('md の `note [変える前] : 枠のメモ @水色` の付箋が、枠「変える前」のそばに出る（付箋 ('+S.x+','+S.y+')・枠 ('+fr.x+','+fr.y+' '+fr.w+'x'+fr.h+')）',near(S,fr)<=40,'距離 '+Math.round(near(S,fr))); check('  点線が付箋の数だけある（2 本：箱の付箋・枠の付箋）',(await b.ev(`document.querySelectorAll('#dg8 line.note-link').length`))===2); await b.shot('verify/out/r16_framenote_md.png'); }
console.log('=== 箱に付けた付箋は前と同じ');
await fresh(f); { const st0=await stk('担当を決める'); const U=await it('受付',0); const l=await links(); const r=await center(`#dg0 .item[data-i="${U.i}"] .box`); await b.drag(r.x+14,r.y+r.h*0.8,30,20); await sleep(500); const U2=await it('受付',0), st1=await stk('担当を決める');
  check('箱「受付」に付けた付箋（担当を決める）：点線が1本・箱を動かすと同じだけついていく（箱 +'+(U2.x-U.x)+','+(U2.y-U.y)+' ／付箋 +'+(st1.x-st0.x)+','+(st1.y-st0.y)+'）',l.length===1&&Math.abs((st1.x-st0.x)-(U2.x-U.x))<=2&&Math.abs((st1.y-st0.y)-(U2.y-U.y))<=2&&U2.x-U.x>=10); await b.keyMod('z','ctrl'); }
console.log('=== PDF・PowerPoint（枠に付箋 1 枚を貼って）');
await fresh(f); await select('台帳'); await addNote('PDF用の枠付箋'); await b.key('Escape'); await sleep(200);
const R=await b.send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true}); fs.writeFileSync('verify/out/r16_board.pdf',Buffer.from(R.data,'base64'));
execSync('node verify/pdfpng.mjs verify/out/r16_board.pdf verify/out/r16_pdf 2',{stdio:'ignore'});
const pt=execSync('node verify/pdffull.mjs verify/out/r16_board.pdf',{encoding:'utf8'}); check('PDF：枠の付箋の文が出る',pt.includes('PDF用の枠付箋'));
// 位置：PDF の文字座標で、付箋の文が「台帳」の文字の近くにあるか
fs.writeFileSync('verify/pdfpos.mjs',`import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise; const out={};
for(let i=1;i<=d.numPages;i++){const tc=await (await d.getPage(i)).getTextContent();for(const it of tc.items){const s=it.str.normalize('NFKC');for(const k of process.argv.slice(3)){if(s.includes(k)&&!out[k])out[k]=[i,Math.round(it.transform[4]),Math.round(it.transform[5])];}}}
console.log(JSON.stringify(out));`);
const pp=JSON.parse(execSync('node verify/pdfpos.mjs verify/out/r16_board.pdf 枠付箋 台帳 変える前 やったこと 効果 担当ごと',{encoding:'utf8'})); const sp=pp['枠付箋'][0]; const on=k=>(pp[k]||[]).filter(x=>x[0]===sp.valueOf()||x[0]===sp[0]);
const sPos=pp['枠付箋'][0]; const dd=(a,b)=>Math.hypot(a[1]-b[1],a[2]-b[2]); const same=k=>(pp[k]||[]).filter(x=>x[0]===sPos[0]); const dTai=Math.min(...same('台帳').map(x=>dd(sPos,x))); const dOthers=Math.min(...['変える前','やったこと','効果','担当ごと'].flatMap(k=>same(k).map(x=>dd(sPos,x))));
check('  PDF：付箋が枠「台帳」のそばにある（同じページの 台帳 の見出しから '+Math.round(dTai)+'pt。ほかの枠の見出しからは最も近くて '+Math.round(dOthers)+'pt）',same('台帳').length>0&&dTai<=dOthers+1&&dTai<250,JSON.stringify(pp['枠付箋'])+' 台帳 '+JSON.stringify(same('台帳')));
fs.rmSync(DL,{recursive:true,force:true}); fs.mkdirSync(DL,{recursive:true}); await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(DL),eventsEnabled:true}); await clickS('#pptx'); for(let i=0;i<60;i++){await sleep(500);if(fs.readdirSync(DL).some(x=>x.endsWith('.pptx')))break;}
const pf=fs.readdirSync(DL).find(x=>x.endsWith('.pptx')); check('PowerPoint：ファイルができる',!!pf);
if(pf){ fs.copyFileSync(path.join(DL,pf),'verify/out/r16_board.pptx'); const o=execSync(`python3 verify/pptx_frame_note.py verify/out/r16_board.pptx PDF用の枠付箋 台帳 変える前 やったこと 効果 担当ごと`,{encoding:'utf8'}); console.log(o.trim().split('\n').map(l=>'    '+l).join('\n')); const m=o.match(/NEAR (\d+) FAR (\d+)/); check('  PowerPoint：枠の付箋が、枠「台帳」のそばの図形として入る（台帳から '+(m&&m[1])+' EMU／ほかの枠で最も近い所から '+(m&&m[2])+' EMU）',!!m&&+m[1]<=+m[2]&&+m[1]<2500000&&/BG [0-9A-F]{6}/.test(o),o.trim().split('\n').slice(-1)[0]); }
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
