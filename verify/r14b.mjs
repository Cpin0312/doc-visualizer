// 直し2：付箋の行の直し。名前を直すと note の行も直る／箱を消すと付箋は残り、確かめの文に枚数
import {start} from './r13lib.mjs'; import fs from 'node:fs';
const [,,SC]=process.argv;
const t=await start({SC:+SC||0}); const {b,check,fresh,diff,T,sleep,clickS,dblSel,center,undo1}=t;
const f='verify/md/43_notes_all.md';
// 付箋をつないだ点線がちょうど箱の中心を通るので、中心でなく少しずらした所を押す（中心を押すと点線に当たる：記録済みの△）
const spot=async sel=>{const r=await center(sel);return [r.x+r.w*0.2,r.y+r.h*0.78];};
const dblAt=async sel=>{const p=await spot(sel);await t.dbl(p[0],p[1]);};
const clickAt=async sel=>{const p=await spot(sel);await b.mouse(p[0],p[1]);await sleep(400);};
const noteLines=s=>t.lines(s).filter(l=>l.startsWith('note '));
const cnt=(d)=>b.ev(`JSON.stringify({st:document.querySelectorAll('#dg${d} .sticky').length,ln:document.querySelectorAll('#dg${d} line.note-link').length})`).then(JSON.parse);
const cases=[
 ['flow',0,'確認','確認B',2],['flow',0,'受付','受付B',1],['lanes',1,'請求','請求B',1],['flowchart',2,'出荷する','出荷B',1],['tree',3,'経理課','経理B',2],['board',8,'申込','申込B',1]];
console.log('=== 画面から（本物の2回押し・ポップアップの「この箱を消す」）');
for(const [ty,d,nm,nn,expN] of cases){
  await fresh(f); const o=await T(); const c0=await cnt(d); const i=await t.idxOf(d,nm);
  if(i<0){check(ty+'：箱「'+nm+'」が見つかる',false);continue;}
  await dblAt(`#dg${d} .item[data-i="${i}"] .box`); await t.fill(nn); let a=await T(); const c1=await cnt(d);
  const was=noteLines(o).filter(l=>l.startsWith('note '+nm+' : ')), now=noteLines(a);
  check(ty+'：名前を「'+nm+'」→「'+nn+'」に直すと、その箱に付けた note の行 '+was.length+' 行の名前も直る',was.length>=1&&was.every(l=>now.includes(l.replace('note '+nm+' : ','note '+nn+' : ')))&&!now.some(l=>l.startsWith('note '+nm+' : ')),JSON.stringify(now.filter(l=>l.includes(nn)).slice(0,3)));
  check('  付箋の数も箱への線も変わらない（付けたまま）',JSON.stringify(c0)===JSON.stringify(c1),JSON.stringify(c0)+'→'+JSON.stringify(c1)); check('  Ctrl+Z 1回で md が1文字も違わず戻る',await undo1(o));
  b.dialogs.length=0; await clickAt(`#dg${d} .item[data-i="${i}"] .box`); const dl=await b.ev(`(()=>{const e=document.querySelector('#panel [data-act=del]');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  if(!dl){check('  「この箱を消す」が出る',false);continue;} await sleep(200); await b.mouse(dl[0],dl[1]); await sleep(700); a=await T(); const c2=await cnt(d); const msg=b.dialogs[b.dialogs.length-1]||'';
  check('  消す：確かめの文に付箋の枚数が出る（'+expN+' 枚）',new RegExp('付箋[^0-9０-９]*'+expN+'|'+expN+'[^0-9]{0,3}枚').test(msg),msg.slice(0,110));
  const removedNotes=noteLines(a);
  check('  消したあと：付けていた付箋は残り（付箋の数は同じ）、行は「note 文 @色」に（箱の名前を外す）',c2.st===c0.st&&!removedNotes.some(l=>l.startsWith('note '+nm+' : '))&&noteLines(a).length===noteLines(o).length,'付箋 '+c0.st+'→'+c2.st+' note の行 '+noteLines(o).length+'→'+noteLines(a).length+' '+JSON.stringify(was.map(l=>l.replace('note '+nm+' : ','note '))));
  check('  知らせ・確かめの文に「付箋」の語が出る',/付箋/.test(msg+(await t.toast())),(await t.toast()).slice(0,70)); check('  Ctrl+Z 1回で戻る',await undo1(o));
}
console.log('=== 全部の種類（アプリが呼ぶ renameItem・removeItem を直接呼ぶ。画面から名前を直せない種類もあるため）');
const res=await b.ev(`(()=>{const P=DocParse;const text=DocVisualizer.text();const doc=P.parseDoc(text);const out=[];
 doc.diagrams.forEach((d,di)=>{const attached=n=>(n.stickies||[]).filter(s=>s.to!=null).length;const a0=attached(d);const st0=(d.stickies||[]).length;
  d.items.forEach((it,i)=>{ if(!(d.stickies||[]).some(s=>s.to===it.id)) return;
    let r={type:d.type,name:it.label,rename:null,remove:null};
    try{const t2=P.renameItem(text,doc,di,it.id,'新名'+i);const d2=P.parseDoc(t2).diagrams[di];r.rename={st:(d2.stickies||[]).length===st0,att:attached(d2)===a0,txt:t2.split('\\n').filter(l=>/^note /.test(l)&&l.includes('新名'+i)).length};}catch(e){r.rename='ERR '+e.message}
    if(P.EDITABLE[d.type]){try{const t3=P.removeItem(text,doc,di,it.id);const d3=P.parseDoc(t3).diagrams[di];r.remove={st:(d3.stickies||[]).length===st0,att:attached(d3)<a0,lines:t3.split('\\n').filter(l=>/^note /.test(l)).length===text.split('\\n').filter(l=>/^note /.test(l)).length};}catch(e){r.remove='ERR '+e.message}}
    out.push(r);});});
 return out;})()`);
for(const r of res){ const rn=r.rename&&typeof r.rename==='object'?(r.rename.st&&r.rename.att&&r.rename.txt>=1):false; const rm=r.remove==null?'-':(typeof r.remove==='object'?(r.remove.st&&r.remove.att&&r.remove.lines):false);
  check(r.type+'「'+r.name+'」：名前を直しても付箋は付いたまま・note の行の名前も直る'+(r.remove==null?'':'／消しても付箋は残る（箱から外れる）'),rn&&(rm===true||rm==='-'),JSON.stringify(r).slice(0,150)); }
console.log('外',b.external(),'errors',b.logs,'集計',JSON.stringify({ok:t.tally().ok,ng:t.tally().ng})); await b.close();
