import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true,w:1400,h:900}); await b.goto('dist/DocVisualizer.html'); await b.pick(process.argv[2]);
await b.clickSel('#mode'); await sleep(600);
const r=JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('.diagram-box')].map(d=>({h:d.querySelector('h2').innerText.replace(/\\n/g,' ').slice(0,30),t:[...d.querySelectorAll('.svg-wrap svg text')].map(t=>t.textContent.trim()).filter(Boolean).join(' | ').slice(0,330),minpx:(()=>{const s=d.querySelector('.svg-wrap svg');const vb=s.viewBox.baseVal;let m=1e9;s.querySelectorAll('text').forEach(t=>{if(t.textContent.trim())m=Math.min(m,parseFloat(getComputedStyle(t).fontSize)*s.getBoundingClientRect().width/vb.width)});return +m.toFixed(1)})()})))`));
r.forEach((x,i)=>console.log(i+1,x.h,'| minpx',x.minpx,'\n    ',x.t));
await b.close();
