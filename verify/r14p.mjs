// html md out.pptx：PowerPoint ボタンを本物のクリックで押し、ダウンロードされた pptx を out にコピー
import {start} from './r13lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const [,,html,md,out,hide]=process.argv; const DL='verify/out/dl_p'; const t=await start({dl:DL}); const {b,sleep,clickS}=t;
await b.goto(html); await b.send('Emulation.setFocusEmulationEnabled',{enabled:true}); await b.pick(md); await sleep(1200);
if(hide==='hide') await clickS('#hideNotes');
fs.rmSync(DL,{recursive:true,force:true}); fs.mkdirSync(DL,{recursive:true}); await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(DL),eventsEnabled:true});
await clickS('#pptx'); for(let i=0;i<60;i++){await sleep(500);if(fs.readdirSync(DL).some(f=>f.endsWith('.pptx')))break;}
const f=fs.readdirSync(DL).find(x=>x.endsWith('.pptx')); if(f) fs.copyFileSync(path.join(DL,f),out); console.log(f?'saved '+out:'NO PPTX',await b.ev(`document.getElementById('error').innerText`)); await b.close();
