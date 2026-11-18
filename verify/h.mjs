// 確かめ用の部品：Chrome を使い捨てプロファイルで起動し、CDP で本物の入力（ファイル選び・マウス・キー）を送る。
import {spawn} from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function openBrowser({nogl=false,offline=false,reduced=false,w=1400,h=900,scale=0,sb=0}={}){
  const cands=[process.env.CHROME_PATH,process.env.EDGE_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome'].filter(Boolean);
  const chrome=cands.find(p=>fs.existsSync(p)); if(!chrome) throw new Error('Chrome/Edge なし');
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'dv-prof-'));
  const a=['--headless=new','--remote-debugging-port=0','--user-data-dir='+prof,'--no-first-run','--no-default-browser-check',`--window-size=${w},${h}`];
  if(scale)a.push('--force-device-scale-factor='+scale);
  if(nogl)a.push('--disable-gpu','--disable-3d-apis','--disable-webgl');
  const proc=spawn(chrome,[...a,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<100&&!port;i++){await sleep(100);try{port=fs.readFileSync(path.join(prof,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{}}
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pend=new Map();const B={net:[],logs:[],dialogs:[]};
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
    if(m.method==='Network.requestWillBeSent')B.net.push(m.params.request.url);
    if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))B.logs.push(m.params.type+': '+m.params.args.map(x=>x.value??x.description).join(' '));
    if(m.method==='Runtime.exceptionThrown')B.logs.push('exception: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')B.logs.push('log: '+m.params.entry.text);
    if(m.method==='Page.javascriptDialogOpening'){B.dialogs.push(m.params.message);send('Page.handleJavaScriptDialog',{accept:true});}};
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,m=>m.error?rej(new Error(method+': '+m.error.message)):res(m.result));ws.send(JSON.stringify({id:i,method,params}));});
  B.send=send;
  B.ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('eval: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value;};
  for(const d of ['Page','Network','Runtime','Log','DOM'])await send(d+'.enable');
  if(reduced)await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  if(offline)await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  // Windows らしい太いスクロールバー（17px）を、ページを開く前に差しこむ（アプリは触らない）
  if(sb)await send('Page.addScriptToEvaluateOnNewDocument',{source:`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='::-webkit-scrollbar{width:${sb}px;height:${sb}px}::-webkit-scrollbar-thumb{background:#999}::-webkit-scrollbar-track{background:#eee}';document.head.appendChild(s)})`});
  B.goto=async html=>{await send('Page.navigate',{url:pathToFileURL(path.resolve(html)).href});await sleep(1500);};
  B.pick=async md=>{const d=await send('DOM.getDocument',{depth:-1});const q=await send('DOM.querySelector',{nodeId:d.root.nodeId,selector:'input[type=file]'});await send('DOM.setFileInputFiles',{files:[path.resolve(md)],nodeId:q.nodeId});await sleep(2500);};
  B.mouse=async(x,y,type='click')=>{if(type==='click'){for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});}};
  B.drag=async(x,y,dx,dy)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});for(let i=1;i<=8;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx*i/8,y:y+dy*i/8,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',clickCount:1});await sleep(400);};
  B.key=async(key,code)=>{const text=key.length===1?key:undefined;await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:code||key,text,windowsVirtualKeyCode:({ArrowRight:39,ArrowLeft:37,Escape:27,' ':32,F5:116}[key])||key.toUpperCase().charCodeAt(0)});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:code||key});await sleep(600);};
  B.shot=async(file,opt={})=>{fs.mkdirSync(path.dirname(file),{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',...opt});fs.writeFileSync(file,Buffer.from(r.data,'base64'));};
  B.rectOf=async sel=>B.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
  B.clickSel=async sel=>{const r=await B.rectOf(sel);if(!r)throw new Error('見つからない '+sel);await sleep(200);const r2=await B.rectOf(sel);await B.mouse(r2.cx,r2.cy);await sleep(600);return r2;};
  B.close=async()=>{try{ws.close();}catch{}proc.kill();await sleep(800);try{fs.rmSync(prof,{recursive:true,force:true,maxRetries:5,retryDelay:300});}catch{}};
  B.external=()=>[...new Set(B.net)].filter(u=>!/^(file|data|blob|about|chrome|devtools):/i.test(u));
  return B;
}
