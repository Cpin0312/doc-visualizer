// R8a：本物のマウスで箱・矢印の言葉・線を動かす（2D）。md の写しは DocVisualizer.text() を読むだけ
import {openBrowser,sleep} from './h.mjs';
const [,,md,SC,W,H]=process.argv;
const b=await openBrowser({offline:true,w:+W||1400,h:+H||900,scale:+SC||0});
await b.goto('dist/DocVisualizer.html'); await b.pick(md);
if((await b.ev(`document.getElementById('mode').innerText`)).includes('2D')) await b.clickSel('#mode'); await sleep(500);
const T=()=>b.ev(`DocVisualizer.text()`);
const orig=await T();
const stripLayout=t=>t.replace(/(\r?\n)*~~~layout[\s\S]*?~~~(\r?\n)?/,'');
const layoutOf=t=>{const m=t.match(/~~~layout\r?\n([\s\S]*?)\r?\n~~~/);return m?m[1]:null};
const box=(d,i)=>b.rectOf(`#dg${d} .item[data-i="${i}"] .box`);
const ok=(c)=>c?'○':'×';
console.log('開いた md:',md,'| 文字数',orig.length,'| 改行CRLF',orig.includes('\r\n'),'| layout 区画',layoutOf(orig)!==null);
// 1 箱を 100px 動かす（flow の 確認＝item1）
let r0=await box(0,1); await b.drag(r0.cx,r0.cy,100,20); let r1=await box(0,1);
const sc=await b.ev(`devicePixelRatio`);
console.log('1 箱を動かす: 移動量(画面px)',Math.round(r1.x-r0.x),Math.round(r1.y-r0.y),'(約 +100,+20 のはず)',ok(Math.abs(r1.x-r0.x-100)<12&&Math.abs(r1.y-r0.y-20)<12));
let t1=await T(); const lay1=layoutOf(t1);
console.log('  layout:',lay1&&lay1.replace(/\s+/g,'').slice(0,160));
console.log('  他の行は1字も変わらない（layout 区画を除いて同じ）:',ok(stripLayout(t1).trimEnd()===orig.trimEnd()),'(差:',(()=>{const a=stripLayout(t1).trimEnd(),o=orig.trimEnd();let i=0;while(i<a.length&&a[i]===o[i])i++;return a===o?'なし':JSON.stringify(a.slice(i-5,i+25))+' vs '+JSON.stringify(o.slice(i-5,i+25))})(),')');
console.log('  CRLF のまま:',ok(!orig.includes('\r\n')||(t1.match(/\r?\n/g)||[]).every(x=>x==='\r\n')),'| ```markdown の包みの中か:',orig.startsWith('```markdown')?ok(t1.trimEnd().endsWith('```')&&t1.indexOf('~~~layout')<t1.lastIndexOf('```')):'(包みなし)');
// 線がついてくる：確認 に入る線の端が動いたか
const edgeEnd=await b.ev(`(()=>{const p=document.querySelector('#dg0 path.edge[data-ek]');return p?p.getAttribute('d').slice(0,60):'線なし'})()`);
console.log('  線の path:',edgeEnd);
// 2 3px で離す：ポップアップ、位置は変わらない
const r0c=r0; const before=await T(); r0=await box(0,2); await b.drag(r0.cx,r0.cy,2,1); await sleep(300);
console.log('2 2px(4px 未満)で離す: 窓',await b.ev(`document.getElementById('panel').hidden?'閉':'開'`),'| md 変化なし',ok((await T())===before),'| 位置同じ',ok(Math.abs((await box(0,2)).x-r0.x)<2));
await b.key('Escape');
// 3 Ctrl+Z / Ctrl+Y
await b.keyMod('z','ctrl'); let t2=await T(); r1=await box(0,1); const r0b=r0c;
console.log('3 Ctrl+Z: 元の md に戻る',ok(stripLayout(t2).trim()===orig.trim()&&layoutOf(t2)===null),'| 箱の位置が戻る',ok(Math.abs(r1.x-r0c.x)<20),await b.ev(`JSON.stringify(DocVisualizer.canUndo())`));
await b.keyMod('y','ctrl'); let t3=await T(); console.log('   Ctrl+Y: 動いた位置に戻る',ok(layoutOf(t3)===lay1));
await b.keyMod('z','ctrlshift'); await b.keyMod('z','ctrl'); t3=await T(); console.log('   Ctrl+Shift+Z でやり直し→Ctrl+Z で戻す:',ok(layoutOf(t3)===null));
await b.keyMod('y','ctrl');
// 4 矢印の言葉（OK）を動かす
const lab=await b.rectOf('#dg0 .edge-label[data-ek]'); const lk=await b.ev(`document.querySelector('#dg0 .edge-label[data-ek]').getAttribute('data-ek')`);
await b.drag(lab.cx,lab.cy,40,-30); const lr=await b.rectOf('#dg0 .edge-label[data-ek]');
console.log('4 言葉',lk,'を動かす:',Math.round(lr.x-lab.x),Math.round(lr.y-lab.y),'(約 +40,-30)',ok(Math.abs(lr.x-lab.x-40)<12&&Math.abs(lr.y-lab.y+30)<12),'| layout に label:',/"label"/.test(layoutOf(await T())||''));
// 5 線を曲げる：言葉のない線（受付→確認）の途中
const pt=JSON.parse(await b.ev(`(()=>{const ps=[...document.querySelectorAll('#dg1 path.edge[data-ek]')];const p=ps[0];const L=p.getTotalLength();const m=p.getPointAtLength(L/2);const s=p.ownerSVGElement;const q=s.createSVGPoint();q.x=m.x;q.y=m.y;const c=q.matrixTransform(p.getScreenCTM());p.scrollIntoView({block:'center'});const q2=s.createSVGPoint();q2.x=m.x;q2.y=m.y;const c2=q2.matrixTransform(p.getScreenCTM());return JSON.stringify({x:c2.x,y:c2.y,k:p.getAttribute('data-ek')})})()`));
await sleep(200); await b.drag(pt.x,pt.y,0,70); const t4=await T();
console.log('5 線(lanes)',pt.k,'を曲げる: layout に bend:',ok(/"bend"/.test(layoutOf(t4)||'')),(layoutOf(t4)||'').replace(/\s+/g,'').slice(0,200));
// 6 lanes：自分の帯の中だけ（営業の 受付 を下へ 400px）
const lr0=await box(1,0); const bandR=await b.ev(`(()=>{const g=document.querySelector('#dg1 .item[data-i="0"]');return g.getAttribute('data-band')})()`);
await b.drag(lr0.cx,lr0.cy,0,400); const lr1=await box(1,0);
const bandsPx=JSON.parse(await b.ev(`(()=>{const s=document.querySelector('#dg1 .svg-wrap svg');const g=document.querySelector('#dg1 .item[data-i="0"]');const bd=g.getAttribute('data-band').split(' ').map(Number);const m=s.getScreenCTM();return JSON.stringify([bd[0]*m.d+m.f,bd[1]*m.d+m.f])})()`));
console.log('6 lanes 営業の箱を下へ 400px:',bandR,'band 画面px',bandsPx.map(Math.round),'| 箱の上端',Math.round(lr1.y),'下端',Math.round(lr1.y+lr1.h),'→ 帯の中',ok(lr1.y>=bandsPx[0]-2&&lr1.y+lr1.h<=bandsPx[1]+2));
// 7 tree・flowchart も動く
const tr0=await box(2,1); await b.drag(tr0.cx,tr0.cy,60,30); const tr1=await box(2,1); console.log('7 tree 動く',ok(Math.abs(tr1.x-tr0.x-60)<12));
const fr0=await box(3,1); await b.drag(fr0.cx,fr0.cy,-50,20); const fr1=await box(3,1); console.log('  flowchart 動く',ok(Math.abs(fr1.x-fr0.x+50)<12));
// 8 グラフは動かない
const cr0=await box(4,0).catch(()=>null)||await b.rectOf('#dg4 .item'); const tc=await T(); await b.drag(cr0.cx,cr0.cy,60,30); await b.key('Escape'); console.log('8 グラフの棒は動かない（layout が増えない）',ok((layoutOf(await T())||'').replace(/\s/g,'')===(layoutOf(tc)||'').replace(/\s/g,'')));
// 9 元の配置に戻す
await b.clickSel('#dg0 .reset-layout'); await sleep(400); const t9=await T(); console.log('9 元の配置に戻す(flow): flow の layout が消える',ok(!/"受注の流れ"/.test(layoutOf(t9)||'')),'| 他の図の layout は残る',ok(/"受付"|"営業|"本部|"開始|name/.test(layoutOf(t9)||'')));
await b.keyMod('z','ctrl'); console.log('   Ctrl+Z で戻る',ok(/"受注の流れ"/.test(layoutOf(await T())||'')));
console.log('最終 md 他の行が同じ',ok(stripLayout(await T()).trim()===orig.trim()));
await b.shot('verify/out/r8a-2d.png',{captureBeyondViewport:true});
console.log('外',b.external(),'errors',b.logs); await b.close();
