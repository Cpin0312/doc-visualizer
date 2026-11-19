// R8d-1：題名・カード・「＋ カード」を本物の2回押し・キーで直す。Ctrl+Z 1回で md が1文字も違わず戻る。CRLF も
import {start} from './r13lib.mjs';
const [,,SC,FILE]=process.argv; const f=FILE||'verify/md/40_r8d.md';
const t=await start({SC:+SC||0}); const {b,check,dblSel,fill,fresh,diff,undo1,T,sleep,hasInp,dirty}=t;
const d1=(a,c)=>{const d=diff(a,c);return JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)};
const eolOk=async(orig)=>{const x=await T();const c=(orig.match(/\r\n/g)||[]).length, l=(orig.match(/(?<!\r)\n/g)||[]).length;const c2=(x.match(/\r\n/g)||[]).length,l2=(x.match(/(?<!\r)\n/g)||[]).length;return (c>0)===(c2>0)&&(l>0)===(l2>0);};
console.log('ファイル',f,'拡大',SC||1);
await fresh(f); let orig=await T();
// 題名
await dblSel('#title'); check('題名：2回押すと入力欄が出る',await hasInp());
await fill('新しい題名'); let a=await T(); check('題名を直す：変わったのは1行だけ',(()=>{const d=diff(orig,a);return d.removed.length===1&&d.added.length===1&&d.added[0].includes('新しい題名')})(),d1(orig,a));
check('  画面の題名も変わる',(await b.ev(`document.getElementById('title').innerText`))==='新しい題名');
check('  改行の種類が保たれる',await eolOk(orig)); check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(orig));
await dblSel('#title'); await b.key('Escape'); check('題名：Esc でやめる（md 変化なし）',(await T())===orig&&!(await hasInp()));
// ひとことで・結論（変える／空にする）
for(const [k,nm,line] of [['summary','ひとことで','> ひとことで：'],['conclusion','結論','> 結論：']]){
  await fresh(f); orig=await T();
  await dblSel(`#cards .card[data-k=${k}]`); check(nm+'：2回押すと入力欄',await hasInp());
  await fill(nm+'を書きかえ'); a=await T(); const d=diff(orig,a);
  check(nm+'を直す：その1行だけ変わる',d.removed.length===1&&d.added.length===1&&d.added[0]===line+nm+'を書きかえ',d1(orig,a)); check('  改行が保たれる',await eolOk(orig));
  check('  Ctrl+Z 1回で戻る',await undo1(orig));
  await b.keyMod('y','ctrl'); check('  Ctrl+Y でやり直せる',(await T())===a);
  await b.keyMod('z','ctrl');
  await dblSel(`#cards .card[data-k=${k}]`); await t.emptyEnter(); a=await T();
  check(nm+'を空にすると、そのカードの行が消える',diff(orig,a).removed.length===1&&diff(orig,a).added.length===0&&!(await b.ev(`!!document.querySelector('#cards .card[data-k=${k}]')`)),d1(orig,a));
  check('  「＋ '+nm+'」が出る',await b.ev(`!!document.querySelector('#cards [data-add=${k}]')`)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
}
// 社外秘
await fresh(f); orig=await T(); await dblSel('#secret'); check('社外秘：2回押すと入力欄',await hasInp()); await fill('極秘・試験'); a=await T();
check('社外秘を直す：1行だけ',diff(orig,a).added.length===1&&diff(orig,a).added[0].includes('極秘・試験'),d1(orig,a)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
// ＋ カード（すること）
await fresh(f); orig=await T(); await t.clickS('#cards [data-add=todo]'); check('「＋ すること」：入力欄が出る',await hasInp());
await fill('来週までに確認する'); a=await T(); const dd=diff(orig,a);
check('  足された行は1行（> すること：…）',dd.added.length===1&&dd.added[0]==='> すること：来週までに確認する'&&dd.removed.length===0,d1(orig,a));
check('  カードが出る',await b.ev(`!!document.querySelector('#cards .card[data-k=todo]')`)); check('  カードの並び（ひとこと→結論→すること）',(await b.ev(`JSON.stringify([...document.querySelectorAll('#cards .card')].map(c=>c.dataset.k))`))==='["summary","conclusion","todo"]');
check('  改行が保たれる',await eolOk(orig)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
await t.clickS('#cards [data-add=todo]'); await b.key('Escape'); check('「＋ すること」を Esc でやめる：md 変化なし・印なし',(await T())===orig&&!(await dirty()));
// 空のまま Enter（足さない）
await t.clickS('#cards [data-add=todo]'); await b.key('Enter'); check('「＋ すること」を空で Enter：何も足さない',(await T())===orig);
// 不正な字（行頭の記号・改行を含む）
await fresh(f); orig=await T(); await dblSel('#cards .card[data-k=conclusion]'); await t.sel(); await b.send('Input.insertText',{text:'行1\n行2'}); await b.key('Enter'); await sleep(500); a=await T();
check('結論に改行を含む文字を貼る：md が壊れない（行が増えない）',t.lines(a).length===t.lines(orig).length,d1(orig,a)); await b.keyMod('z','ctrl');
await fresh(f); orig=await T(); await dblSel('#title'); await fill('# 見出しの記号 ~~~ ```'); a=await T(); const nd=await t.nDia(); check('題名に # ~~~ ``` を入れても、図の数が変わらない（壊れない）',nd===3,'図 '+nd+' | '+d1(orig,a));
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
