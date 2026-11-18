import {start} from './r11lib.mjs';
const [,,SC]=process.argv;
const {b,T,labels,warns,load,diffL,idxOf,click,dbl,typeEnter,act,lastDlg,writeTmp,sleep}=await start({SC:+SC||0});
const ok=c=>c?'○':'×';
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
for(const f of ['25_move_crlf','25_move_sjis','25_move_bom_crlf','25_move_wrapped']){
  console.log('==',f); await load(`verify/md/${f}.md`); const o=await T(); const crlf=o.includes('\r\n');
  console.log('  status',await b.ev(`document.getElementById('status').innerText.slice(0,46)`),'| 先頭の文字コード',o.charCodeAt(0).toString(16),'| CRLF',crlf);
  const lineEnds=t=>{const a=(t.match(/\r\n/g)||[]).length,c=(t.match(/(^|[^\r])\n/g)||[]).length;return [a,c]};
  const steps=[ async()=>{const i=await idxOf(0,'確認'); await dbl(0,i); await selAll(); await typeEnter('照合');},
    async()=>{await click(0,await idxOf(0,'受付')); await act('mark','yellow');},
    async()=>{let r=await b.rectOf('#dg2 .add-box'); await sleep(150); r=await b.rectOf('#dg2 .add-box'); await b.mouse(r.cx,r.cy); await sleep(500); await selAll(); await typeEnter('新しい係');},
    async()=>{await click(1,await idxOf(1,'請求')); await act('lane','営業');},
    async()=>{await click(3,await idxOf(3,'発注する')); await act('del');} ];
  for(const s of steps) await s();
  const a=await T(); const d=diffL(o,a); console.log('  5 つ書きかえた後：変わった行',d.removed.length,'→',d.added.length,'| 消えた行',JSON.stringify(d.removed).slice(0,160)); console.log('  足された行',JSON.stringify(d.added).slice(0,260));
  const le=lineEnds(a); console.log('  改行：CRLF',le[0],'個・LF だけ',le[1],'個',crlf?(le[1]===0?'○(CRLF のまま)':'×(LF が混ざる)'):(le[0]===0?'○(LF のまま)':'×(CRLF が混ざる)'));
  const other=o.split(/\r?\n/).filter(l=>!d.removed.includes(l)).length; console.log('  変えていない行は全部残る',ok(o.split(/\r?\n/).filter(l=>!d.removed.includes(l)).every(l=>a.split(/\r?\n/).includes(l))));
  console.log('  先頭の文字コードが同じ',ok(a.charCodeAt(0)===o.charCodeAt(0)));
  let k=0; for(;k<12;k++){ await b.keyMod('z','ctrl'); if((await T())===o)break; } console.log('  全部 Ctrl+Z で元の md と1文字も違わない',ok((await T())===o),'('+(k+1)+'回)');
  for(let q=0;q<k+1;q++) await b.keyMod('y','ctrl'); const lb=await labels(); await load(writeTmp(a.charAt(0)==='﻿'?a:a,'tmp_e.md')); console.log('  読み直して同じ図（※UTF-8 で書いた写し。Shift_JIS 書き出しは R8c）',ok(lb===await labels()));
}
console.log('外',b.external(),'errors',b.logs); await b.close();
