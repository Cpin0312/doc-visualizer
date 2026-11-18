import {openBrowser,sleep} from './h.mjs';
import fs from 'node:fs';
const D='dist/DocVisualizer.html', O='verify/out/r2/';
for(const [w,h] of [[1400,900],[1920,1080]]){
 const b=await openBrowser({offline:true,w,h}); await b.goto(D);
 await b.send('Browser.grantPermissions',{permissions:['clipboardReadWrite','clipboardSanitizedWrite']}).catch(e=>console.log('grant失敗',e.message));
 await b.pick('verify/md/01_copilot_wrapped.md');
 if(w===1400){
  await b.clickSel('#copyPrompt');
  const clip=await b.ev(`navigator.clipboard.readText().catch(e=>'READ失敗:'+e.name)`);
  const f=fs.readFileSync('copilot-prompt.md','utf8');
  console.log('toast',await b.ev(`document.getElementById('toast').innerText`),'\nクリップボード',clip.length,'字 / ファイル',f.length,'字 / 一致',clip===f,' 改行をそろえて一致',clip.replace(/\r\n/g,'\n').trim()===f.replace(/\r\n/g,'\n').trim());
  if(clip!==f){let i=0;while(i<clip.length&&clip[i]===f[i])i++;console.log('最初の違い',i,JSON.stringify(clip.slice(i-10,i+30)),JSON.stringify(f.slice(i-10,i+30)));}
 }
 const r=await b.rectOf('#dg2 canvas'); await sleep(500);
 await b.shot(`${O}timeline3d-${w}.png`,{clip:{x:Math.max(0,r.x-10),y:Math.max(0,r.y-10),width:r.w+20,height:r.h+20,scale:1}}).catch(async()=>{});
 console.log(w,'canvas',JSON.stringify(r)); await b.close();
}
