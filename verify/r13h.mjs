// r8a の「移動量 ×」の原因確認：図の中の座標（getBBox）で、100px ドラッグ → 100 動くか。画面座標だとスクロール位置の変化で 0 に見える
import {start} from './r13lib.mjs';
const t=await start({}); const {b,check,sleep}=t;
await t.fresh('verify/md/25_move.md');
const bb=()=>b.ev(`(()=>{const e=document.querySelector('#dg0 .item[data-i="1"] .box');const r=e.getBBox();const s=document.querySelector('#dg0 svg');const k=s.getBoundingClientRect().width/+s.getAttribute('data-w');return JSON.stringify([Math.round(r.x),Math.round(r.y),+k.toFixed(3),Math.round(scrollY)])})()`).then(JSON.parse);
const a0=await bb(); const r=await b.rectOf('#dg0 .item[data-i="1"] .box'); await sleep(200); const r1=await b.rectOf('#dg0 .item[data-i="1"] .box');
await b.drag(r1.cx,r1.cy,100,20); await sleep(400); const a1=await bb();
check('箱を 100,20 ドラッグ → 図の中の座標で +100,+20 動く（倍率 '+a0[2]+'）',Math.abs((a1[0]-a0[0])*a0[2]-100)<=3&&Math.abs((a1[1]-a0[1])*a0[2]-20)<=3,JSON.stringify(a0)+'→'+JSON.stringify(a1)+'（スクロール位置が '+a0[3]+'→'+a1[3]+' に変わると、画面座標では動きが見えなくなる）');
await b.close();
