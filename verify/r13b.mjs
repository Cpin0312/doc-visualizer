// R8d-2/4：図の「…」（上へ・下へ・複製・消す・名前・種類）と「＋ 図を足す」13 種。Ctrl+Z 1回で md が1文字も違わず戻る
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC,FILE]=process.argv; const f=FILE||'examples/全部入りの例.md';
const t=await start({SC:+SC||0}); const {b,check,dblSel,fill,fresh,diff,undo1,T,sleep,hasInp,clickS,nDia,dgTitles,warn}=t;
const openMenu=async i=>{await clickS(`#dg${i} details.dg-menu summary`);await sleep(300);};
const btn=async(i,act,extra='')=>clickS(`#dg${i} [data-dg=${act}]${extra}`);
const warnN=async()=>{const w=await warn();const m=w.match(/（(\d+) 件）/);return m?+m[1]:0};
console.log('ファイル',f,'拡大',SC||1);
await fresh(f); let orig=await T(); const n0=await nDia(); const titles=await dgTitles(); console.log('図の数',n0,titles.join('|').slice(0,200)); const w0=await warnN();
const sortL=s=>t.lines(s).slice().sort().join('\n');
// 上へ・下へ
await openMenu(2); await btn(2,'up'); let a=await T(); let tt=await dgTitles();
check('上へ：図2が図1の位置に入れかわる',tt[1]===titles[2]&&tt[2]===titles[1],tt.slice(0,4).join('|')); check('  行の中身は同じで並びだけ変わる（行の集まりが同じ）',sortL(a)===sortL(orig)); check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(orig));
await openMenu(2); await btn(2,'down'); a=await T(); tt=await dgTitles(); check('下へ：図2と図3が入れかわる',tt[2]===titles[3]&&tt[3]===titles[2]); check('  行の集まりが同じ',sortL(a)===sortL(orig)); check('  Ctrl+Z 1回で戻る',await undo1(orig));
check('先頭の図に「上へ」がない・最後の図に「下へ」がない',await b.ev(`!document.querySelector('#dg0 [data-dg=up]')&&!document.querySelector('#dg${n0-1} [data-dg=down]')`));
// 複製
await openMenu(1); await btn(1,'dup'); a=await T(); tt=await dgTitles(); check('複製：図が1つ増え、すぐ下に同じ図',(await nDia())===n0+1&&tt[2]===titles[1]&&tt[1]===titles[1]||tt[2]===titles[1],tt.slice(0,4).join('|')); check('  警告が増えない',(await warnN())===w0,String(await warn())); check('  Ctrl+Z 1回で戻る',await undo1(orig));
// 消す（確かめの文）
b.dialogs.length=0; await openMenu(1); await btn(1,'del'); a=await T(); check('消す：確かめの文に図の名前と数が出る',/を、md から中身ごと消しますか/.test(b.dialogs[b.dialogs.length-1]||'')&&(b.dialogs[b.dialogs.length-1]||'').includes('こ'),(b.dialogs[b.dialogs.length-1]||'').slice(0,80));
check('  図が1つ減る',(await nDia())===n0-1); check('  ほかの行は変わらない（消えた行だけ）',diff(orig,a).added.length===0&&diff(orig,a).removed.length>=3,'消えた行 '+diff(orig,a).removed.length); check('  Ctrl+Z 1回で戻る',await undo1(orig));
b.accept=false; await openMenu(1); await btn(1,'del'); check('消す：確かめで「いいえ」→ 何も変わらない',(await T())===orig&&(await nDia())===n0); b.accept=true;
// 名前
await openMenu(3); await btn(3,'name'); check('名前：入力欄が出る',await hasInp()); await fill('試験の新しい名前'); a=await T(); const d=diff(orig,a);
check('  変わったのは図の開きの行だけ',d.removed.length===1&&d.added.length===1&&d.added[0].includes('試験の新しい名前')&&d.added[0].startsWith('~~~'),JSON.stringify(d.removed)+'→'+JSON.stringify(d.added)); check('  見出しが変わる',(await dgTitles())[3]==='試験の新しい名前'); check('  Ctrl+Z 1回で戻る',await undo1(orig));
await openMenu(3); await btn(3,'name'); await b.key('Escape'); check('名前：Esc でやめる',(await T())===orig);
await openMenu(3); await btn(3,'name'); await t.sel(); await b.send('Input.insertText',{text:'あ\nい ~~~ x'}); await b.key('Enter'); await sleep(400); a=await T(); check('名前に改行・~~~ を入れても md の行が増えない・図の数が同じ',t.lines(a).length===t.lines(orig).length&&(await nDia())===n0,JSON.stringify(diff(orig,a).added)); await b.keyMod('z','ctrl');
// 種類：図ごとに、出る種類を全部試す
console.log('--- 種類（出るものを全部押す）');
let tot=0,bad=0; const summary=[];
for(let i=0;i<n0;i++){
  await fresh(f); orig=await T(); const ty=await b.ev(`document.querySelector('#dg${i} .kind').innerText`);
  await openMenu(i); const offered=await b.ev(`JSON.stringify([...document.querySelectorAll('#dg${i} [data-dg=type]')].map(x=>x.dataset.t))`).then(JSON.parse); summary.push(ty.split('・')[0]+'→['+offered.join(',')+']');
  for(const o of offered){
    await fresh(f); orig=await T(); await openMenu(i); await btn(i,'type',`[data-t=${o}]`); a=await T(); tot++;
    const dd=diff(orig,a), ok1=dd.removed.length===1&&dd.added.length===1&&dd.added[0].startsWith('~~~'+o)&&(await nDia())===n0&&(await warnN())<=w0&&(await b.ev(`document.querySelectorAll('#dg${i} svg').length`))===1;
    const ok2=await undo1(orig); if(!ok1||!ok2){bad++;console.log('   ×',ty,'→',o,JSON.stringify(dd.removed),JSON.stringify(dd.added),'警告',await warn(),'戻る',ok2);}
  }
}
console.log('  図ごとの出る種類：\n   '+summary.join('\n   ')); check('「…」の種類：出た組み合わせ '+tot+' 通りが、どれも開きの行だけ書きかわり・警告が増えず・描かれ・Ctrl+Z 1回で戻る',bad===0&&tot>0,'失敗 '+bad);
// 図を足す 13 種
console.log('--- ＋ 図を足す');
await fresh(f); orig=await T(); const types=await b.ev(`JSON.stringify([...document.querySelector('[data-adddg]').options].map(o=>o.value).filter(Boolean))`).then(JSON.parse); check('「＋ 図を足す」の種類 13',types.length===13,types.join(','));
let badAdd=0; for(const ty of types){
  await fresh(f); orig=await T(); await b.ev(`(()=>{const s=document.querySelector('[data-adddg]');s.value=${JSON.stringify(ty)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(700); a=await T(); const dd=diff(orig,a);
  const ok1=(await nDia())===n0+1&&dd.removed.length===0&&dd.added.some(l=>l.startsWith('~~~'+ty+' '))&&(await warnN())<=w0&&(await b.ev(`document.querySelectorAll('#dg${n0} svg').length`))===1&&(await b.ev(`document.querySelectorAll('#dg${n0} .item, #dg${n0} .box, #dg${n0} rect').length`))>0;
  const ok2=await undo1(orig); if(!ok1||!ok2){badAdd++;console.log('   ×',ty,JSON.stringify(dd.added).slice(0,100),'警告',await warn(),'戻る',ok2);}
}
check('13 種どれも：図が1つ増え・ひな形が描かれ・警告が増えず・消えた行なし・Ctrl+Z 1回で戻る',badAdd===0,'失敗 '+badAdd);
// 足した図を保存して開き直す
await fresh(f); await b.ev(`(()=>{const s=document.querySelector('[data-adddg]');s.value='pie';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(600); const txt=await T(); fs.writeFileSync('verify/md/tmp_rt.md',txt); await t.load('verify/md/tmp_rt.md'); check('足した図を含む md を読み直しても図の数が同じ',(await nDia())===n0+1&&(await T())===txt);
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
