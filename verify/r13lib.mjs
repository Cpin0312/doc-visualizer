import {start as start12} from './r12lib.mjs'; import fs from 'node:fs';
export async function start(o={}){
  const t=await start12(o); const {b}=t; const sleep=t.sleep; let ok=0,ng=0; const rows=[];
  const sel=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',modifiers:2,windowsVirtualKeyCode:65,code:'KeyA',commands:['selectAll']});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',modifiers:2,code:'KeyA'});};
  const check=(name,c,detail='')=>{const m=c?'○':'×';c?ok++:ng++;rows.push([m,name,detail]);console.log(' ',m,name,detail);return c;};
  const center=async s=>{const r=await b.rectOf(s);if(!r)throw new Error('見つからない '+s);await sleep(250);return b.rectOf(s);};
  const dbl=async(x,y)=>{await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});for(const n of [1,2]){await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:n});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:n});}await sleep(500);};
  const dblSel=async s=>{const r=await center(s);await dbl(r.cx,r.cy);return r;};
  const clickS=async s=>{const r=await center(s);await b.mouse(r.cx,r.cy);await sleep(400);return r;};
  const hasInp=()=>b.ev(`!!document.querySelector('.rename')`);
  const fill=async(v,key='Enter')=>{await sel();await b.send('Input.insertText',{text:v});await sleep(150);if(key==='ctrl-enter'){await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});}else await b.key('Enter');await sleep(500);};
  const bs=async()=>{await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await sleep(150);};
  const emptyEnter=async()=>{await sel();await bs();await b.key('Enter');await sleep(500);};
  const fresh=async f=>{await b.goto(process.env.DV_HTML||'dist/DocVisualizer.html');await b.ev(`window.__saves.length=0;window.__picks.length=0`);b.dialogs.length=0;b.accept=true;await t.load(f);};
  const lines=s=>s.split(/\r\n|\r|\n/);
  const diff=(a,c)=>{const x=lines(a),y=lines(c);const sa=new Set(x),sb=new Set(y);return {removed:x.filter(l=>!sb.has(l)),added:y.filter(l=>!sa.has(l)),n:[x.length,y.length]};};
  const undo1=async orig=>{await b.keyMod('z','ctrl');await sleep(400);return (await t.T())===orig;};
  const nDia=()=>b.ev(`document.querySelectorAll('#diagrams .diagram-box').length`);
  const dgTitles=()=>b.ev(`JSON.stringify([...document.querySelectorAll('#diagrams .diagram-box h2')].map(h=>h.firstChild.textContent))`).then(JSON.parse);
  const warn=()=>b.ev(`document.getElementById('warnings').innerText.replace(/\\n/g,' / ').slice(0,200)`);
  const lock=()=>b.ev(`!document.getElementById('lockbar').hidden`);
  return {...t,bs,emptyEnter,sel,check,center,dbl,dblSel,clickS,hasInp,fill,fresh,lines,diff,undo1,nDia,dgTitles,warn,lock,tally:()=>({ok,ng,rows})};
}
