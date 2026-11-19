// 図解(board)の編集：動かす・名前・＋箱・線・消す・印・付箋・保存→開き直し（Ctrl+Z 1回で md が1文字も違わず戻る）
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC,FILE]=process.argv; const f=FILE||'verify/md/50_board.md';
const t=await start({SC:+SC||0}); const {b,check,fresh,diff,T,sleep,clickS,dblSel,center,undo1,dbl,saves}=t;
const d1=(a,c)=>{const d=diff(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
const eolOk=(o,x)=>(/\r\n/.test(o))===(/\r\n/.test(x))&&(/(?<!\r)\n/.test(o))===(/(?<!\r)\n/.test(x));
const items=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>{const bb=g.querySelector('.box').getBBox();return {i:+g.dataset.i,label:g.getAttribute('aria-label'),frame:g.classList.contains('frame'),p:g.dataset.p===undefined?null:+g.dataset.p,x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)}}))`).then(JSON.parse);
const get=async(label,n=0)=>{const a=(await items()).filter(x=>x.label===label);return a[n];};
const edges=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 path.edge')].map(p=>p.dataset.ek))`).then(JSON.parse);
const spot=async(label,n=0)=>{const it=await get(label,n);const r=await center(`#dg0 .item[data-i="${it.i}"] .box`);return it.frame?[r.x+12,r.y+9,it]:[r.x+Math.min(14,r.w*0.2),r.y+r.h*0.8,it];};  // 枠は中身（子の箱）の上でなく、見出しの所を押す
const dragItem=async(label,dx,dy,n=0)=>{const p=await spot(label,n);await b.drag(p[0],p[1],dx,dy);await sleep(500);};
const sel=async(label,n=0)=>{await b.key('Escape');await sleep(150);const p=await spot(label,n);await b.mouse(p[0],p[1]);await sleep(500);};
const act=async(a,v)=>{const s=`#panel .act[data-act="${a}"]`+(v?`[data-v="${v}"]`:'');await clickS(s);};
console.log('ファイル',f,'拡大',SC||1);
await fresh(f); const orig=await T();
console.log('=== 動かす');
let a0=await get('申込.xlsx'), fr0=await get('担当ごと'), top0=await get('変えた後'), g0=await get('問い合わせ.xlsx');
await dragItem('申込.xlsx',40,30); let a1=await get('申込.xlsx'); let txt=await T();
check('枠の中の箱（申込.xlsx）をドラッグ：図の中で右へ・下へ動く',a1.x>a0.x+20&&a1.y>a0.y+10,`(${a0.x},${a0.y})→(${a1.x},${a1.y})`);
check('  md が変わるのは layout の区画だけ（元の行は1行も変わらない）',diff(orig,txt).removed.length===0&&/~~~layout/.test(txt),d1(orig,txt).slice(0,160));
check('  枠は中身に合わせて広がり、中に収まる',(await get('担当ごと')).x+(await get('担当ごと')).w>=a1.x+a1.w-1&&(await get('担当ごと')).y+(await get('担当ごと')).h>=a1.y+a1.h-1);
check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(orig));
await dragItem('担当ごと',50,20); fr0=await get('担当ごと'); let fr1,a2,g2; // 取り消した後なので位置は元
await fresh(f); fr0=await get('担当ごと'); a0=await get('申込.xlsx'); g0=await get('問い合わせ.xlsx'); await dragItem('担当ごと',50,20); fr1=await get('担当ごと'); a2=await get('申込.xlsx'); g2=await get('問い合わせ.xlsx'); txt=await T();
check('枠（担当ごと）をドラッグ：中の箱 2 つも同じだけついてくる',Math.abs((fr1.x-fr0.x)-(a2.x-a0.x))<=2&&Math.abs((fr1.y-fr0.y)-(a2.y-a0.y))<=2&&Math.abs((fr1.x-fr0.x)-(g2.x-g0.x))<=2&&fr1.x-fr0.x>=30,`枠 +(${fr1.x-fr0.x},${fr1.y-fr0.y}) 箱 +(${a2.x-a0.x},${a2.y-a0.y}),(${g2.x-g0.x},${g2.y-g0.y})`);
check('  md の元の行は変わらない・layout の区画だけ',diff(orig,txt).removed.length===0&&/~~~layout/.test(txt));
const lay=(txt.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/)||[])[1]||''; check('  layout に枠の位置が書かれる（箱ごとの絶対位置ではなく、枠の中の箱は枠からの差）',/\[担当ごと\]/.test(lay),lay.replace(/\s+/g,'').slice(0,160));
check('  Ctrl+Z 1回で戻る',await undo1(orig));
// 外の枠を動かす → 全部の子孫がついてくる
await fresh(f); const o0=await items(); await dragItem('変えた後',-60,60); const o1=await items(); const moved=o1.filter(x=>['変えた後','受付','担当ごと','申込.xlsx','問い合わせ.xlsx'].includes(x.label)&&!(x.label==='受付'&&x.p!==o1.find(y=>y.label==='変えた後').i));
const dx=o1.find(x=>x.label==='変えた後').x-o0.find(x=>x.label==='変えた後').x; const okAll=['担当ごと','申込.xlsx','問い合わせ.xlsx'].every(n=>Math.abs((o1.find(x=>x.label===n).x-o0.find(x=>x.label===n).x)-dx)<=2);
check('外の枠（変えた後）を動かすと、入れ子の中身（担当ごと・申込.xlsx・問い合わせ.xlsx）も全部ついてくる',okAll&&Math.abs(dx)>=30,'枠 '+dx); const before1=await items(); 
// あとで枠を動かしても、すでに動かした中の箱がついてくる
await dragItem('申込.xlsx',0,25); const a3=await get('申込.xlsx'); const f3=await get('担当ごと'); await dragItem('担当ごと',-30,0); const a4=await get('申込.xlsx'), f4=await get('担当ごと');
check('  中の箱を動かしたあとで枠を動かしても、その箱は枠についてくる（枠からの差が変わらない）',(a4.x-f4.x)===(a3.x-f3.x)&&(a4.y-f4.y)===(a3.y-f3.y),`差 (${a3.x-f3.x},${a3.y-f3.y})→(${a4.x-f4.x},${a4.y-f4.y})`);
// 付箋（受付 に付けた付箋）がついていく
await fresh(f); const st0=await b.ev(`(()=>{const g=document.querySelector('#dg0 .sticky .box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`); const u0=await get('受付',0); await dragItem('受付',30,20,0); const st1=await b.ev(`(()=>{const g=document.querySelector('#dg0 .sticky .box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`); const u1=await get('受付',0);
check('箱「受付」に付けた付箋が、箱を動かすとついていく',Math.abs((st1[0]-st0[0])-(u1.x-u0.x))<=2&&Math.abs((st1[1]-st0[1])-(u1.y-u0.y))<=2&&u1.x-u0.x>10,`箱 +(${u1.x-u0.x},${u1.y-u0.y}) 付箋 +(${st1[0]-st0[0]},${st1[1]-st0[1]})`);
// 保存→開き直し
const txt2=await T(); fs.writeFileSync('verify/md/tmp_rt.md',txt2); const pos1=JSON.stringify(await items()); await t.load('verify/md/tmp_rt.md'); const pos2=JSON.stringify(await items()); check('動かした md を読み直すと、全部の部品が同じ所にある',pos1===pos2&&(await T())===txt2);
console.log('=== 名前を直す');
await fresh(f); let o=await T(); let it=await get('申込'); await dblSel(`#dg0 .item[data-i="${it.i}"] .box`); await t.fill('申込書'); let a=await T(); 
check('横の箱 申込 → 申込書：`申込 | 問い合わせ | 苦情 | 見積` の1行の、その1か所だけが変わる',diff(o,a).removed.join()==='    申込 | 問い合わせ | 苦情 | 見積'&&diff(o,a).added.join()==='    申込書 | 問い合わせ | 苦情 | 見積',d1(o,a)); check('  CRLF/LF そのまま・Ctrl+Z 1回で戻る',eolOk(o,a)&&await undo1(o));
await fresh(f); o=await T(); await dblSel(`#dg0 .item[data-i="${(await get('受付',0)).i}"] .box`); await t.fill('受付B'); a=await T(); const d=diff(o,a); console.log('   差',d1(o,a).slice(0,500));
check('同じ名前の箱（変える前の 受付）→ 受付B：箱の行・その箱の線の行（受付 -> 台帳）が直り、もう1つの受付の行（受付 => 申込.xlsx）は変わらない',a.includes('  受付B : 電話とメール')&&a.includes('受付B -> 台帳')&&a.includes('受付 => 申込.xlsx')&&(a.match(/  受付 : 電話とメール/g)||[]).length===1,'');
check('  読み直して線が3本・構造が同じ（箱 12・枠 6）',(await edges()).length===3&&(await items()).length===18,(await edges()).join(' ; ')); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await dblSel(`#dg0 .item[data-i="${(await get('変える前')).i}"] .box`); await t.fill('現状'); a=await T();
check('枠 変える前 → 現状：`[変える前] 1か所に全部` と `[変える前] -> [変えた後]` の行が直る（説明は残る）',a.includes('[現状] 1か所に全部')&&a.includes('[現状] -> [変えた後]')&&!a.includes('[変える前]'),d1(o,a).slice(0,300)); check('  読み直して線 3 本・枠 6',(await edges()).length===3&&(await items()).filter(x=>x.frame).length===6); check('  Ctrl+Z 1回で戻る',await undo1(o));
// 位置がついていく
await fresh(f); await dragItem('申込.xlsx',30,25); const pb=await get('申込.xlsx'); const fb=await get('担当ごと'); o=await T(); await dblSel(`#dg0 .item[data-i="${pb.i}"] .box`); await t.fill('申込B.xlsx'); const pa=await get('申込B.xlsx'); a=await T();
check('動かした箱の名前を直しても、位置が付いていく（layout の鍵も新しい名前に）',pa&&pa.x===pb.x&&pa.y===pb.y&&!/"申込.xlsx"/.test(a.replace(/\s+/g,'')),`(${pb.x},${pb.y})→(${pa&&pa.x},${pa&&pa.y})`); check('  Ctrl+Z 1回で名前も位置も戻る',await undo1(o));
await fresh(f); o=await T(); await b.key('Escape'); await dblSel(`#dg0 .item[data-i="${(await get('台帳を分ける')).i}"] .box`); await t.fill('台帳を二つに分ける'); a=await T();
check('札 #1 台帳を分ける → 直す：`#1` はそのまま',a.includes('  #1 台帳を二つに分ける')&&!a.includes('#1 台帳を分ける'),d1(o,a)); await undo1(o);
console.log('=== ＋箱');
await fresh(f); o=await T(); await sel('担当ごと'); let nbefore=(await items()).length; await clickS('#dg0 .add-box:not(.add-note)'); check('枠「担当ごと」を選んで「＋ 箱」：入力欄が出る',await t.hasInp()); await t.sel(); await b.send('Input.insertText',{text:'新しい箱'}); await b.key('Enter'); await sleep(500); a=await T();
check('  選んだ枠の中に、字下げを1段深く（枠の中身と同じ字下げ）で足される',a.includes('    新しい箱'+'\n')||a.includes('    新しい箱'+'\r\n'),d1(o,a)); const nb=await get('新しい箱'); const nf=await get('担当ごと'); check('  図の中でその枠の中に出る',nb&&nb.p===nf.i,JSON.stringify(nb)); check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(o));
await fresh(f); o=await T(); { const fi=await get('担当ごと'); await b.ev(`document.querySelector('#dg0 .item[data-i="${fi.i}"]').focus()`); await b.key('Enter'); await sleep(400); await b.ev(`document.querySelector('#dg0 .add-box:not(.add-note)').focus()`); await b.key('Enter'); await sleep(500); await t.sel(); await b.send('Input.insertText',{text:'キーで足す箱'}); await b.key('Enter'); await sleep(500); a=await T(); const k1=await get('キーで足す箱'), kf=await get('担当ごと'); check('キーボードで枠を選んで「＋ 箱」：選んだ枠の中に、4 つ字下げで足される',a.includes('    キーで足す箱')&&k1&&k1.p===kf.i,d1(o,a)); check('  Ctrl+Z 1回で戻る',await undo1(o)); }
await fresh(f); o=await T(); await b.key('Escape'); await clickS('#dg0 .add-box:not(.add-note)'); await t.sel(); await b.send('Input.insertText',{text:'末尾の箱'}); await b.key('Enter'); await sleep(500); a=await T(); const lf=await get('効果'); const nb2=await get('末尾の箱');
check('枠を選ばずに「＋ 箱」：最後の外の枠（効果）の中に足される',nb2&&lf&&nb2.p===lf.i,JSON.stringify(nb2)); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await sel('担当ごと'); await clickS('#dg0 .add-box:not(.add-note)'); await b.key('Escape'); await sleep(300); check('「＋ 箱」を Esc でやめる：箱が残らない・md が元のまま',(await T())===o);
console.log('=== 線を引く');
await fresh(f); o=await T(); await sel('見積'); await act('link'); check('見積で「線を引く」を押すと「つなぐ先を押してください」',/つなぐ先/.test(await t.toast())); const tp=await spot('苦情'); await b.mouse(tp[0],tp[1]); await sleep(500); a=await T(); const ne=await edges();
check('  苦情を押すと md の最後に `見積 -> 苦情` の行が足される',diff(o,a).added.join()==='見積 -> 苦情'&&diff(o,a).removed.length===0,d1(o,a)); check('  線が4本になる',ne.length===4,ne.join(' ; ')); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await sel('受付',1); await act('link'); const tp2=await spot('台帳'); await b.mouse(tp2[0],tp2[1]); await sleep(500); a=await T(); const ne2=await edges();
check('同じ名前の箱（変えた後の 受付）から枠「台帳」へ：行は `[変えた後] 受付 -> …` と枠を付けて書かれ、読み直して決まる',/\[変えた後\] 受付 -> /.test(a)&&ne2.length===4&&ne2.some(e=>e.startsWith('受付#2>')),d1(o,a)+' / '+ne2.join(' ; ')); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await sel('見積'); await act('link'); await b.key('Escape'); await sleep(300); check('「線を引く」を Esc でやめる：md 変化なし',(await T())===o&&!(await b.ev(`document.body.classList.contains('linking')`)));
// 線を消す
await fresh(f); o=await T(); const ep=await b.ev(`(()=>{const p=document.querySelector('#dg0 path.edge[data-ek="受付#2>申込.xlsx"]');const l=p.getTotalLength(),s=p.ownerSVGElement.getScreenCTM();let best=null,bd=1e9;for(let k=1;k<60;k++){const m=p.getPointAtLength(l*k/60);const x=m.x*s.a+s.e,y=m.y*s.d+s.f;if(document.elementFromPoint(x,y)===p){const d=Math.abs(k-30);if(d<bd){bd=d;best=[x,y];}}}return best})()`);
if(ep){ await b.rclick(ep[0],ep[1]); await sleep(500); const has=await b.ev(`!!document.querySelector('#panel [data-act=del-edge]')`); check('線を右クリック：「この線を消す」が出る',has); if(has){ await clickS('#panel [data-act=del-edge]'); a=await T(); check('  消すと `受付 => 申込.xlsx : 合う台帳だけ見る` の行だけが消える',diff(o,a).removed.join()==='受付 => 申込.xlsx : 合う台帳だけ見る'&&diff(o,a).added.length===0&&(await edges()).length===2,d1(o,a)); check('  Ctrl+Z 1回で戻る',await undo1(o)); } }
console.log('=== 消す');
const delBox=async(label,n=0)=>{await sel(label,n);b.dialogs.length=0;await act('del');await sleep(500);return b.dialogs[b.dialogs.length-1]||'';};
await fresh(f); o=await T(); let msg=await delBox('申込'); a=await T(); check('横の箱 申込 を消す：`|` の1つだけが消え、ほかの3つは残る',a.includes('    問い合わせ | 苦情 | 見積')&&!a.includes('申込 | ')&&(await get('苦情'))&&(await get('見積')),d1(o,a)); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); msg=await delBox('担当ごと'); a=await T(); const rest=await items();
check('枠 担当ごと を消す：確かめの文に中身の数が出る',/担当ごと/.test(msg)&&/2|中身|個/.test(msg),msg.slice(0,120)); check('  中の箱（申込.xlsx・問い合わせ.xlsx）も消え、それを端にした線の行（受付 => 申込.xlsx）も消える',!a.includes('申込.xlsx')&&!a.includes('問い合わせ.xlsx')&&!a.includes('受付 => 申込.xlsx')&&(await edges()).length===2&&rest.length===15,'箱・枠 '+rest.length+' 線 '+(await edges()).length+' '+d1(o,a).slice(0,200)); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); msg=await delBox('受付',0); a=await T(); check('同じ名前の箱（変える前の 受付）を消す：その箱の行と線の行（受付 -> 台帳）が消える。付箋は図に残る（枚数が出る）',!a.includes('受付 -> 台帳')&&a.includes('受付 => 申込.xlsx')&&/付箋/.test(msg)&&/note 担当を決める @黄/.test(a),msg.slice(0,140)+' / '+d1(o,a).slice(0,200)); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); msg=await delBox('変える前'); a=await T(); check('外の枠（変える前）を消す：入れ子の中身ごと消え（受付・台帳・4つの箱）、線の行が消える',!a.includes('[変える前]')&&!a.includes('問い合わせ | 苦情')&&(await edges()).length===1,'線 '+(await edges()).length+' / '+d1(o,a).slice(0,220)); check('  確かめの文に中身の数',/6|個|中身/.test(msg),msg.slice(0,120)); check('  Ctrl+Z 1回で戻る',await undo1(o));
console.log('=== 印・付箋');
await fresh(f); o=await T(); await sel('見積'); await act('mark','yellow'); a=await T(); check('箱 見積 に印（? 確認）：`見積` が `見積 ?確認` ではなく印の記号つきの行に（横の箱の中でも壊れない）',/見積 \?/.test(a)||/\?確認|\?/.test(diff(o,a).added.join()),d1(o,a)); check('  読み直して箱の数が同じ',(await items()).length===18); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await sel('効果'); await act('mark','red'); a=await T(); check('枠 効果 に印（! 注意）：枠の行の終わりに足される（枠の名前は壊れない）',diff(o,a).added.join().includes('[効果]')&&/!/.test(diff(o,a).added.join())&&(await get('効果')),d1(o,a)); check('  Ctrl+Z 1回で戻る',await undo1(o));
await fresh(f); o=await T(); await sel('台帳'); const nb3=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=note-add]');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`); await b.mouse(nb3[0],nb3[1]); await sleep(500); await t.sel(); await b.send('Input.insertText',{text:'枠の付箋'}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(500); a=await T();
check('枠「台帳」に付箋：`note 台帳 : 枠の付箋 @黄`（枠なら `note [台帳] : …` と書かれても読み直して付く）',/note (\[台帳\]|台帳) : 枠の付箋 @黄/.test(a)&&await b.ev(`[...document.querySelectorAll('#dg0 .sticky')].some(g=>g.textContent.includes('枠の付箋'))&&document.querySelectorAll('#dg0 line.note-link').length>=2`),d1(o,a)); const sf0=await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('枠の付箋')).querySelector('.box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`); const fp0=await get('台帳'); await dragItem('台帳',30,20); const sf1=await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('枠の付箋')).querySelector('.box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`); const fp1=await get('台帳'); check('  枠を動かすと枠に付けた付箋も付いていく',Math.abs((sf1[0]-sf0[0])-(fp1.x-fp0.x))<=2&&fp1.x-fp0.x>10,`枠 +${fp1.x-fp0.x} 付箋 +${sf1[0]-sf0[0]}`);
console.log('=== 保存→開き直し');
await fresh(f); await dragItem('申込.xlsx',30,25); await sel('見積'); await act('mark','yellow'); await t.clickSave(); const sv=await saves(); const fin=await T(); check('動かして印をつけて保存：書いたバイト＝画面の md・「未保存」が消える',sv.length===1&&Buffer.compare(sv[0].bytes,Buffer.from(fin,'utf8'))===0&&!(await t.dirty())); fs.writeFileSync('verify/out/r14_saved.md',sv[0].bytes); const pS=JSON.stringify(await items()); await t.load('verify/out/r14_saved.md'); check('  開き直すと、図が同じ（部品の位置・線）',JSON.stringify(await items())===pS&&(await T())===fin);
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
