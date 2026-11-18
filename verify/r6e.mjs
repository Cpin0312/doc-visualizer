import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/21_graphs.md');
console.log('21 22警告なし？',await b.ev(`document.getElementById('warnings').innerText.slice(0,40)`));
await b.clickSel('#mode'); await sleep(400);
for(const [d,i,l] of [[0,0,'円 営業'],[1,1,'円 西(万)'],[4,3,'ドーナツ 完了'],[6,0,'折れ線 4月'],[9,0,'横棒 長い名前'],[11,0,'積み上げ 4月']]){
  const r=await b.rectOf(`#dg${d} .item[data-i="${i}"]`); await sleep(150);
  const r2=await b.rectOf(`#dg${d} .item[data-i="${i}"] ${d===4||d===0||d===1?'path':'*'}`).catch(()=>null)||r;
  await b.mouse(r2.cx,r2.cy); await sleep(300);
  console.log(l.padEnd(10),(await b.ev(`document.getElementById('panel').hidden?'(開かず)':document.getElementById('panel').innerText.replace(/\\n+/g,' / ').slice(0,150)`)));
  await b.key('Escape');
}
await b.pick('verify/md/22_thousands.md'); console.log('22 警告:',await b.ev(`document.getElementById('warnings').innerText.slice(0,200)`)); await b.close();
