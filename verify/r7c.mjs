import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/23_flowchart.md');
const pr=`JSON.stringify({on:!document.getElementById('present').hidden,cnt:document.getElementById('pCount').innerText.slice(0,8),cap:document.getElementById('pCaption').innerText.replace(/\\n/g,'|').slice(0,70)})`;
for(const m of ['3d','2d']){
 if(m==='2d') await b.clickSel('#mode');
 await b.key('p','KeyP'); console.log(m,'P',await b.ev(pr)); await b.shot(`verify/out/fc-present-${m}.png`);
 for(let i=0;i<4;i++) await b.key('ArrowRight'); console.log(m,'→×4',await b.ev(pr));
 await b.key('ArrowLeft'); console.log(m,'←',await b.ev(pr)); await b.key('Escape'); console.log(m,'Esc',await b.ev(pr));
}
console.log('外',b.external(),'errors',b.logs); await b.close();
