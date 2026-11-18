// PowerPoint ボタンを本物のマウスで押し、ダウンロードされた .pptx を verify/out/r3/dl/<名前>/ に受ける
import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs'; import path from 'node:path';
const [,,name,md,nogl,deny]=process.argv;
const dir=path.resolve('verify/out/r3/dl',name); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
const b=await openBrowser({offline:true,nogl:nogl==='nogl'});
await b.goto('dist/DocVisualizer.html');
await b.send('Browser.setDownloadBehavior',{behavior:deny==='deny'?'deny':'allow',downloadPath:dir,eventsEnabled:true}).catch(e=>console.log('dl設定失敗',e.message));
await b.pick(md);
console.log(name,'PowerPoint ボタン disabled=',await b.ev(`document.getElementById('pptx').disabled`));
await b.clickSel('#pptx');
for(let i=0;i<40;i++){await sleep(500);if(fs.readdirSync(dir).some(f=>f.endsWith('.pptx')))break;if(await b.ev(`document.getElementById('error').innerText`))break;}
console.log('保存:',JSON.stringify(fs.readdirSync(dir)),'| error:',await b.ev(`document.getElementById('error').innerText`),'| toast:',await b.ev(`document.getElementById('toast').innerText`));
console.log('外',b.external(),'errors',b.logs);
await b.close();
