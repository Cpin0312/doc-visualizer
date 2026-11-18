// ポップアップの閉じ方・キーボード・印・3D の何もない所
import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/01_copilot_wrapped.md');
const H=`document.getElementById('panel').hidden`;
const st=async l=>console.log(l.padEnd(34),'窓',(await b.ev(H))?'閉':'開',await b.ev(`'sel='+document.querySelectorAll('.item.sel').length+' focus='+(document.activeElement.className&&document.activeElement.className.baseVal!==undefined?document.activeElement.className.baseVal:document.activeElement.tagName+'#'+document.activeElement.id)`));
if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);
// 印を押す
await b.clickSel('#dg0 .mark'); await st('印(期限)を押す'); console.log('   中身:',(await b.ev(`document.getElementById('panel').innerText`)).replace(/\n+/g,' / ').slice(0,80));
await b.key('Escape'); await st('Esc');
await b.clickSel('#dg0 .item rect.box'); await st('箱を押す');
await b.clickSel('#panelClose'); await st('×');
await b.clickSel('#dg0 .item rect.box'); await b.clickSel('#dg0 .item rect.box'); await st('同じ箱をもう1回');
await b.clickSel('#dg0 .item rect.box'); await b.clickSel('#title'); await st('窓の外（題名）を押す');
await b.clickSel('#dg0 .item rect.box'); await b.clickSel('#cards'); await st('窓の外（カード）');
await b.clickSel('#dg1 .item rect.box'); await st('別の図の箱');
await b.key('Escape');
// キーボード：Tab で .item へ。Enter で開く、Esc/× で閉じて元に戻る
await b.ev(`document.activeElement.blur();window.scrollTo(0,0)`);
let n=0; for(;n<40;n++){await b.key('Tab','Tab');if(await b.ev(`!!(document.activeElement.classList&&document.activeElement.classList.contains('item'))`))break;} console.log('Tab を',n+1,'回で最初の箱に届く');
await b.key('Enter'); await st('Enter で開く'); console.log('   フォーカスは×か',await b.ev(`document.activeElement.id`));
await b.key('Escape'); await st('Esc で閉じる（元の箱に戻るか）'); console.log('   戻った先は箱か',await b.ev(`document.activeElement.classList.contains('item')+' '+document.activeElement.getAttribute('aria-label')`));
await b.key('Tab','Tab'); await b.key('Enter'); await st('次の箱を Enter'); await b.key('Enter'); await st('(×にフォーカス)Enter で閉じる'); console.log('   戻った先',await b.ev(`document.activeElement.getAttribute('aria-label')||document.activeElement.id`));
await b.key(' '); await st('スペース（箱が選ばれていれば開く）');
await b.key('Escape');
// 3D
await b.clickSel('#mode'); await sleep(900);
const r=await b.rectOf('#dg0 canvas'); await sleep(300);
const p=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(0,1))`)); await b.mouse(p.x,p.y); await sleep(500); await st('3D 箱を押す');
await b.mouse(r.x+40,r.y+40); await sleep(500); await st('3D の何もない所（左上）');
await b.mouse(p.x,p.y); await sleep(400); await b.mouse(p.x,p.y); await sleep(400); await st('3D 同じ箱をもう1回');
await b.mouse(p.x,p.y); await sleep(400); await b.key('Escape'); await st('3D Esc');
await b.mouse(p.x,p.y); await sleep(400); await b.clickSel('#title'); await st('3D 窓の外（題名）');
// 発表モードが前のまま
await b.key('p','KeyP'); await sleep(500); await b.key('ArrowRight'); await b.key('ArrowRight');
console.log('発表',await b.ev(`document.getElementById('pCount').innerText.slice(0,10)+' | 窓='+(document.getElementById('panel').hidden?'なし':'あり')+' | '+document.getElementById('pCaption').innerText.replace(/\\n/g,'|').slice(0,60)`));
await b.key('Escape');
console.log('外',b.external(),'errors',b.logs); await b.close();
