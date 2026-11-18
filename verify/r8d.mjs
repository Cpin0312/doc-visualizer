import {openBrowser,sleep} from './h.mjs';
const [,,SC]=process.argv;
const b=await openBrowser({offline:true,w:1400,h:900,scale:+SC||0}); await b.goto('dist/DocVisualizer.html'); await b.pick('verify/md/25_move.md');
console.log('設定 拡大',SC||1,'モード',await b.ev(`DocVisualizer.mode()`));
const T=()=>b.ev(`DocVisualizer.text()`); const lay=t=>{const m=t.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/);return m?m[1].replace(/\s+/g,''):null};
const names=['flow(床)','lanes(床)','tree(立てた板)','flowchart(立てた板)'];
for(let d=0;d<4;d++){
  await b.rectOf(`#dg${d} canvas`); await sleep(800);
  const w=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(${d},1))`));
  const before=await T();
  await b.drag(w.x,w.y,90,35); await sleep(600);
  const after=await T(); const w2=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(${d},1))`));
  const l=lay(after)||'';
  const key=['"確認"','"請求"','"営業課"','"在庫ある?"'][d];
  console.log(names[d],'| 画面位置',Math.round(w.x),Math.round(w.y),'→',Math.round(w2.x),Math.round(w2.y),'| layout に書かれた',l.includes('"x"')?'あり':'なし','| 高さ(z など)のキー',/"z"|"h"|"height"/.test(l)?'あり×':'なし○','| 動いた',(Math.abs(w2.x-w.x)>20)?'○':'×');
  // 4px 未満：ポップアップ
  const ww=JSON.parse(await b.ev(`JSON.stringify(DocVisualizer.where3d(${d},0))`)); const t0=await T(); await b.drag(ww.x,ww.y,2,1); await sleep(400);
  console.log('   2px で離す: 窓',await b.ev(`document.getElementById('panel').hidden?'閉':'開'`),'| md 変化なし',(await T())===t0?'○':'×'); await b.key('Escape');
}
// 3D で動かした後 2D にすると同じ位置か：layout 値を text から読み、2D の svg 座標と一致
await b.clickSel('#mode'); await sleep(500);
const x2=await b.ev(`+document.querySelector('#dg0 .item[data-i="1"] .box').getAttribute('x')`); const l0=lay(await T()); console.log('2D の 確認 x',x2,'| layout',(l0.match(/"確認":\{"x":(\d+)/)||[])[1]);
await b.keyMod('z','ctrl'); await b.keyMod('z','ctrl'); await b.keyMod('z','ctrl'); await b.keyMod('z','ctrl'); console.log('Ctrl+Z ×4 で layout が消える',lay(await T())===null?'○':'×');
console.log('外',b.external(),'errors',b.logs); await b.close();
