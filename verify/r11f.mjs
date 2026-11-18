import {start} from './r11lib.mjs';
const {b,T,labels,warns,load,idxOf,dbl,sleep,writeTmp}=await start({});
const selAll=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
for(const [nm,w] of [['長'.repeat(120),'120字'],['受付','同じ名前(受付に直す)']]){
  await load('verify/md/25_move.md'); const i=await idxOf(0,'確認'); await dbl(0,i); await selAll(); await b.send('Input.insertText',{text:nm}); await sleep(100); await b.key('Enter'); await sleep(600);
  const lb=await labels(); const t=await T(); const len=(JSON.parse(lb)[0].find(x=>x.length>50)||'').length; const boxW=await b.ev(`(()=>{const e=document.querySelector('#dg0 .svg-wrap svg');return Math.round(e.getBoundingClientRect().width)})()`);
  await load(writeTmp(t,'tmp_f.md')); console.log(w,'| 図の名前の長さ',len,'| 図の幅(px)',boxW,'| 読み直して同じ図',lb===await labels()?'○':'×','| 知らせ',(await warns()).slice(0,50),'| 箱数',JSON.parse(lb)[0].length);
}
await b.close();
