// B-19：枠に付箋（note [台帳] : …）、同じ名前のほかの箱があるとき黙って違う所に付かない
import {start} from './r13lib.mjs';
const t=await start({}); const {b,check,fresh,diff,T,sleep,clickS,center,undo1}=t;
const f='verify/md/50_board.md';
const it=async(label,n=0)=>{const a=JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>({i:+g.dataset.i,label:g.getAttribute('aria-label'),frame:g.classList.contains('frame')})))`)).filter(x=>x.label===label);return a[n];};
const select=async(label,n=0)=>{const x=await it(label,n);await b.key('Escape');await sleep(150);const r=await center(`#dg0 .item[data-i="${x.i}"] .box`);await b.mouse(x.frame?r.x+12:r.x+14,x.frame?r.y+9:r.y+r.h*0.8);await sleep(500);return x;};
const addNote=async(txt)=>{const nb=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=note-add]');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`); if(!nb)return false; await sleep(200); await b.mouse(nb[0],nb[1]); await sleep(500); await t.sel(); await b.send('Input.insertText',{text:txt}); await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await sleep(600);return true;};
const stk=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .sticky')].map(g=>g.textContent.replace(/\\s+/g,' ').trim()))`).then(JSON.parse);
const links=()=>b.ev(`document.querySelectorAll('#dg0 line.note-link').length`);
console.log('=== 枠に付箋');
for(const fr of ['台帳','変える前','担当ごと']){
  await fresh(f); const o=await T(); const l0=await links(); await select(fr); const ok=await addNote('枠「'+fr+'」の付箋'); const a=await T(); const d=diff(o,a);
  check('枠「'+fr+'」を押して「＋ 付箋」：`note ['+fr+'] : … @黄` の1行が足される（エラーなし）',ok&&d.added.join()==='note ['+fr+'] : 枠「'+fr+'」の付箋 @黄'&&d.removed.length===0&&!(await b.ev(`document.getElementById('error').innerText`)),d.added.join()+' | '+(await b.ev(`document.getElementById('error').innerText`)).slice(0,60));
  check('  付箋が出て、その枠に点線でつながる（付箋 +1・点線 +1）',(await stk()).some(x=>x.includes('枠「'+fr+'」の付箋'))&&(await links())===l0+1,'点線 '+l0+'→'+(await links()));
  check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(o));
}
await fresh(f); { const o=await T(); await select('台帳'); await addNote('動く付箋'); const sb=await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('動く付箋')).querySelector('.box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`); const x0=await it('台帳'); const r=await center(`#dg0 .item[data-i="${x0.i}"] .box`); await b.drag(r.x+12,r.y+9,30,20); await sleep(500); const sa=await b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .sticky')].find(x=>x.textContent.includes('動く付箋')).querySelector('.box').getBBox();return [Math.round(g.x),Math.round(g.y)]})()`);
  check('枠に付けた付箋は、枠を動かすとついていく',sa[0]-sb[0]>=10,'付箋 +'+(sa[0]-sb[0])+','+(sa[1]-sb[1])); const txt=await T(); const fs=await import('node:fs'); fs.writeFileSync('verify/md/tmp_rt.md',txt); await t.load('verify/md/tmp_rt.md'); check('  読み直しても、付箋は枠についたまま',(await stk()).some(x=>x.includes('動く付箋'))&&(await T())===txt); }
console.log('=== 同じ名前の箱');
await fresh(f); { const o=await T(); await select('受付',1); const ok=await addNote('2つ目の受付の付箋'); const a=await T(); const err=await b.ev(`document.getElementById('error').innerText`);
  check('2つ目の「受付」（変えた後）に付箋：黙って1つ目に付かず、赤い帯で断る（「同じ名前の箱があり、どちらに付けるか決められない」）',ok&&a===o&&/同じ名前/.test(err),'md変化 '+(a!==o)+' / '+err.slice(0,90));
  check('  md は変わらず、付箋も増えない',(await T())===o&&(await stk()).length===1); }
await fresh(f); { const o=await T(); await select('受付',0); const ok=await addNote('1つ目の受付の付箋'); const a=await T(); const d=diff(o,a);
  check('1つ目の「受付」（変える前）に付箋：付く（`note 受付 : … @黄`）',ok&&d.added.join()==='note 受付 : 1つ目の受付の付箋 @黄',d.added.join()+' | '+(await b.ev(`document.getElementById('error').innerText`)).slice(0,60)); check('  Ctrl+Z 1回で戻る',await undo1(o)); }
await fresh(f); { const o=await T(); await select('申込.xlsx'); const ok=await addNote('ふつうの箱の付箋'); const a=await T(); check('同名のない箱（申込.xlsx）には、今まで通り付く',ok&&diff(o,a).added.join()==='note 申込.xlsx : ふつうの箱の付箋 @黄',diff(o,a).added.join()); }
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
