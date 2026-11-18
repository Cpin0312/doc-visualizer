import {openBrowser,sleep} from './h.mjs';
const b=await openBrowser({offline:true}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/01_copilot_wrapped.md');
console.log('失敗を作る（write を失敗させる。ボタンの押し方は本物）',await b.ev(`(()=>{const P=window.PptxGenJS;if(!P)return 'PptxGenJS なし';P.prototype.write=()=>Promise.reject(new Error('試験用の失敗'));return 'ok'})()`));
await b.clickSel('#pptx'); await sleep(2500);
console.log('赤い帯:',await b.ev(`document.getElementById('error').innerText`),'| busy 解除後にもう一度押せるか(ボタン disabled)=',await b.ev(`document.getElementById('pptx').disabled`));
await b.shot('verify/out/r3/pptx-fail.png'); console.log('画面の図は残る',await b.ev(`document.querySelectorAll('#diagrams svg').length`));
await b.close();
