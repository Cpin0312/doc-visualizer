// 直し a〜b・d：＋箱の取り消し・Esc、消した名前の位置、名前を直すと位置が付いていく、日本語入力の Enter
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const [,,SC]=process.argv; const ok=c=>c?'○':'×';
const t=await start({SC:+SC||0}); const {b}=t; const sleep=t.sleep;
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
const lab=async d=>JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg${d} .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`));
const addBtn=async d=>{await b.rectOf(`#dg${d} .add-box`);await sleep(150);const r=await b.rectOf(`#dg${d} .add-box`);await b.mouse(r.cx,r.cy);await sleep(500);};
const hasInp=()=>b.ev(`!!document.querySelector('input.rename')`);
const fresh=async f=>{await b.goto(process.env.DV_HTML||'dist/DocVisualizer.html');b.dialogs.length=0;b.accept=true;await t.load(f||'verify/md/25_move.md');};
const lay=tx=>{const m=tx.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/);return m?m[1]:''};
if(process.argv[3]!=='skipa'&&process.argv[3]!=='onlyd'){
console.log('== a ＋箱：Ctrl+Z 1回・Esc・ほかを押したとき');
for(const [d,nm] of [[0,'flow'],[1,'lanes'],[2,'tree'],[3,'flowchart']]){
  await fresh(); const o=await t.T(); const n0=(await lab(d)).length, u0=await b.ev('DocVisualizer.canUndo()');
  await addBtn(d); const inp=await hasInp(); await selAll(); await t.typeEnter('新しい名前');
  const after=await t.T(); const n1=(await lab(d)).length;
  await b.keyMod('z','ctrl'); const back=await t.T(); console.log(` ${nm}：入力欄',${ok(inp)} 名前を入れて箱が増える ${ok(n1===n0+1)} Ctrl+Z 1回で元の md ${ok(back===o)} 箱の数 ${(await lab(d)).length===n0?'元':'違う'}`.replace("',",' '));
  await b.keyMod('y','ctrl'); console.log(`    Ctrl+Y で名前入りに戻る ${ok((await t.T())===after)}`);
  await fresh(); await addBtn(d); await b.key('Escape'); await sleep(300); const e1=await t.T(); console.log(`    Esc：箱が残らない ${ok(e1===o&&(await lab(d)).length===n0)} 入力欄が閉じる ${ok(!(await hasInp()))} 取り消し履歴 ${JSON.stringify(await b.ev('DocVisualizer.canUndo()'))} 元は ${JSON.stringify(u0)} 印 ${(await t.dirty())?'出る×':'出ない○'}`);
  await fresh(); await addBtn(d); await b.mouse(5,300); await sleep(500); const e2=await t.T(); console.log(`    入力欄を開いたままほかを押す（blur）：箱の数 ${(await lab(d)).length} md が元と同じ ${ok(e2===o)} 取り消し履歴 ${JSON.stringify(await b.ev('DocVisualizer.canUndo()'))}`);
  await fresh(); await addBtn(d); await selAll(); await t.typeEnter(''); const e3=await t.T(); console.log(`    空の名前で Enter：箱 ${(await lab(d)).length===n0?'残らない○':'残る'} md 同じ ${ok(e3===o)}`);
}
}
if(process.argv[3]!=='onlyd'){
console.log('== b 位置');
await fresh(); let i=await t.idxOf(0,'確認'); const rx=async nm=>b.ev(`(()=>{const g=[...document.querySelectorAll('#dg0 .svg-wrap svg .item')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(nm)});if(!g)return null;const r=g.querySelector('.box').getBBox();return [Math.round(r.x),Math.round(r.y)]})()`);
const p0=await rx('確認'); const r=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await sleep(200); const rr=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await b.drag(rr.cx,rr.cy,60,50); await sleep(500);
const p1=await rx('確認'); const L1=lay(await t.T()); console.log(` 動かした 確認：${p0} → ${p1}  layout に「確認」のキー ${ok(L1.includes('"確認"'))}`);
i=await t.idxOf(0,'確認'); await t.click(0,i); await t.act('del'); const L2=lay(await t.T()); console.log(` 消した後：layout に「確認」のキーが残らない ${ok(!L2.includes('"確認"'))} md の layout 抜粋 ${L2.replace(/\s+/g,'').slice(0,90)}`);
await addBtn(0); await selAll(); await t.typeEnter('確認'); const p2=await rx('確認'); const L3=lay(await t.T());
console.log(` 同じ名前を足し直す：位置 ${p2}  前の動かした位置 ${p1} と違う ${ok(p2&&(p2[0]!==p1[0]||p2[1]!==p1[1]))}  layout に「確認」の古い位置が戻っていない ${ok(!L3.includes('"確認"'))}`);
await b.shot('verify/out/r12/b_readd.png');
await fresh(); i=await t.idxOf(0,'見積'); const q0=await rx('見積'); const rq=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await sleep(200); const rq2=await b.rectOf(`#dg0 .item[data-i="${i}"] .box`); await b.drag(rq2.cx,rq2.cy,-40,70); await sleep(500);
const q1=await rx('見積'); const Lb=lay(await t.T()); i=await t.idxOf(0,'見積'); await t.click(0,i); await t.act('rename'); await selAll(); await t.typeEnter('見積書');
const q2=await rx('見積書'); const La=lay(await t.T());
console.log(` 動かした 見積：${q0} → ${q1}。名前を 見積書 に直す：${q2} 位置が付いていく ${ok(q2&&q2[0]===q1[0]&&q2[1]===q1[1])} layout のキー 前 ${ok(Lb.includes('"見積"'))}→ 後 旧キーなし ${ok(!La.includes('"見積"'))} 新キーあり ${ok(La.includes('"見積書"'))}`);
await b.keyMod('z','ctrl'); const q3=await rx('見積'); console.log(` Ctrl+Z で名前も位置も戻る ${ok(q3&&q3[0]===q1[0]&&q3[1]===q1[1])}`);
const lt=await t.T(); await t.load((()=>{fs.writeFileSync('verify/md/tmp_rt.md',lt);return 'verify/md/tmp_rt.md'})()); const q4=await rx('見積'); console.log(` 読み直しても位置が同じ ${ok(q4&&q4[0]===q1[0]&&q4[1]===q1[1])}`);
}
console.log('== d 日本語入力（変換を確定する Enter）');
let i; await fresh(); i=await t.idxOf(0,'確認'); await t.click(0,i); await t.act('rename'); await selAll();
await b.send('Input.imeSetComposition',{text:'にほん',selectionStart:3,selectionEnd:3}); await sleep(200);
console.log(' 変換中の入力欄',ok(await hasInp()),'値',await b.ev(`document.querySelector('input.rename').value`));
await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:229,nativeVirtualKeyCode:13}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await sleep(400);
console.log(' 変換を確定する Enter（keyCode 229）：名前が決まらない（入力欄が残る）',ok(await hasInp()),'md 変化なし',ok(!(await t.dirty())));
await b.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0}); await b.send('Input.insertText',{text:'日本'}); await sleep(200); console.log(' 確定後の値',await b.ev(`document.querySelector('input.rename').value`));
await b.key('Enter'); await sleep(400); console.log(' 2回目の Enter で決まる：入力欄',ok(!(await hasInp())),'箱の名前',(await lab(0)).includes('日本')?'日本 ○':JSON.stringify(await lab(0)));
// isComposing だけが立つ型（keyCode 13 のまま）
await fresh(); i=await t.idxOf(0,'確認'); await t.click(0,i); await t.act('rename'); await selAll();
await b.send('Input.imeSetComposition',{text:'かんじ',selectionStart:3,selectionEnd:3}); await sleep(200);
await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await sleep(400);
console.log(' composition 中の Enter（keyCode 13・isComposing だけ）：決まらない',ok(await hasInp()||!(await t.dirty())),'入力欄',await hasInp(),'名前',JSON.stringify((await lab(0))));
console.log(' ＋箱の名前入力でも同じか：');
await fresh(); await addBtn(0); await selAll(); await b.send('Input.imeSetComposition',{text:'あたらしい',selectionStart:5,selectionEnd:5}); await sleep(200);
await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:229,nativeVirtualKeyCode:13}); await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await sleep(400);
console.log('   確定の Enter で入力欄が残る',ok(await hasInp()));
await b.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0}); await b.send('Input.insertText',{text:'新規'}); await sleep(100); await b.key('Enter'); console.log('   2回目で決まる',(await lab(0)).includes('新規')?'○':'×');
console.log('外',b.external(),'errors',b.logs); await b.close();
