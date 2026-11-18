// 確かめ用：本物と同じ道（file:// で開く → input/ドロップで md を渡す → 印刷の道で PDF）。
// 使い方: node run.mjs <html> <mdファイル...> [--drop] [--nogl] [--offline] [--out out/名前]
// 環境: CHROME_PATH（なければ OS ごとの候補を探す）。中の関数は呼ばない。
import {spawn} from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2), flag=f=>args.includes(f);
const oi=args.indexOf('--out'), outBase=oi>=0?args[oi+1]:null;
const opt=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const clickSel=opt('--click'), evalJs=opt('--eval');
const pos=args.filter((a,i)=>!a.startsWith('--')&&!['--out','--click','--eval'].includes(args[i-1]));
const [html,...mds]=pos;
const cands=[process.env.CHROME_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean);
const chrome=cands.find(p=>fs.existsSync(p)); if(!chrome){console.error('Chrome/Edge なし。CHROME_PATH を指定');process.exit(2);}
const prof=fs.mkdtempSync(path.join(os.tmpdir(),'dv-prof-')); // 本物のプロファイルに触れない使い捨て
const cargs=['--headless=new','--remote-debugging-port=0','--user-data-dir='+prof,'--no-first-run','--no-default-browser-check','--window-size=1400,900'];
if(flag('--nogl')) cargs.push('--disable-gpu','--disable-3d-apis','--disable-webgl');
const proc=spawn(chrome,[...cargs,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let port; for(let i=0;i<100&&!port;i++){await sleep(100);try{port=fs.readFileSync(path.join(prof,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{}}
const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(), net=[], logs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
 if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
 if(m.method==='Network.requestWillBeSent')net.push(m.params.request.url);
 if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))logs.push(m.params.type+': '+m.params.args.map(a=>a.value??a.description).join(' '));
 if(m.method==='Runtime.exceptionThrown')logs.push('exception: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
 if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')logs.push('log: '+m.params.entry.text+' '+(m.params.entry.url||''));};
const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,m=>m.error?rej(new Error(method+': '+m.error.message)):res(m.result));ws.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});return r.result.value;};
for(const d of ['Page','Network','Runtime','Log','DOM'])await send(d+'.enable');
if(flag('--offline'))await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
const url=pathToFileURL(path.resolve(html)).href;
await send('Page.navigate',{url}); await sleep(1500);
const res={chrome,url,realPath:url.startsWith('file://'),files:[],loadedExternal:[]};
for(const md of mds){
  const abs=path.resolve(md); const t0=Date.now();
  if(flag('--drop')){ // ドロップの道
    await send('Input.dispatchDragEvent',{type:'dragEnter',x:400,y:300,data:{items:[],files:[abs],dragOperationsMask:1}});
    await send('Input.dispatchDragEvent',{type:'dragOver',x:400,y:300,data:{items:[],files:[abs],dragOperationsMask:1}});
    await send('Input.dispatchDragEvent',{type:'drop',x:400,y:300,data:{items:[],files:[abs],dragOperationsMask:1}});
  } else { // ファイル選びの道
    const doc=await send('DOM.getDocument',{depth:-1}); const q=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
    if(!q.nodeId){res.files.push({md,error:'input[type=file] がない'});continue;}
    await send('DOM.setFileInputFiles',{files:[abs],nodeId:q.nodeId});
  }
  await sleep(2500);
  if(clickSel){ // 本物のマウス操作で押す
    const c=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(clickSel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    if(!c){logs.push('click: 見つからない '+clickSel);} else {for(const t of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x:c[0],y:c[1],button:'left',clickCount:1});await sleep(800);}
  }
  if(evalJs){res.eval=await ev(evalJs);}
  const info=await ev(`JSON.stringify({text:document.body.innerText.slice(0,6000),svg:document.querySelectorAll('svg').length,canvas:document.querySelectorAll('canvas').length,title:document.title})`);
  const o=JSON.parse(info); const stem=outBase?outBase+'-'+path.basename(md):null;
  if(stem){fs.mkdirSync(path.dirname(stem),{recursive:true});
    fs.writeFileSync(stem+'.txt',o.text);
    let sc; if(flag('--full')){const m=await send('Page.getLayoutMetrics');sc=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:m.cssContentSize.width,height:Math.min(m.cssContentSize.height,6000),scale:1}});}else sc=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(stem+'.png',Buffer.from(sc.data,'base64'));
    const pdf=await send('Page.printToPDF',{landscape:true,paperWidth:11.69,paperHeight:8.27,printBackground:true,preferCSSPageSize:true});
    const buf=Buffer.from(pdf.data,'base64');fs.writeFileSync(stem+'.pdf',buf);
    o.pdfPages=(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length; o.pdfBytes=buf.length;}
  res.files.push({md,ms:Date.now()-t0,...o,text:o.text.slice(0,300)});
}
res.external=[...new Set(net)].filter(u=>!/^(file|data|blob|about|chrome|devtools):/i.test(u));
res.allRequests=[...new Set(net)].length; res.consoleErrors=logs;
console.log(JSON.stringify(res,null,1));
ws.close(); proc.kill(); await sleep(800); try{fs.rmSync(prof,{recursive:true,force:true,maxRetries:5,retryDelay:300});}catch{}
