// 道具の自己確認：窓の代わりが、アプリの書く道（writeHandle）を通って、バイトが一致するか＋ドロップで本物の handle が来るか
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const t=await start({}); const {b}=t;
await t.load('verify/md/25_move.md');
console.log('dirty(読込直後)',await t.dirty(),'save disabled',await b.ev(`document.getElementById('save').disabled`));
// 直す→ dirty
const i=await t.idxOf(0,(JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`)))[0]);
await t.click(0,i); await t.act('rename'); await t.typeEnter('試験の名前');
console.log('dirty(直した後)',await t.dirty());
const before=await t.T();
await t.clickSave();
const s=await t.saves();
console.log('picks',await b.ev('window.__picks'),'saves',s.length,s[0]&&s[0].name);
console.log('bytes==text(UTF-8)', s[0]&&Buffer.compare(s[0].bytes,Buffer.from(before,'utf8'))===0,'dirty(保存後)',await t.dirty(),'toast',await t.toast());
// 関数が本物か：writeHandle の外から呼ばれたか（スタブ側の write が呼ばれたのはアプリの save() 経由。ここでは picks の記録があること＝save() が window.showSaveFilePicker を呼んだこと）
console.log('2回目は同じ先（picks 増えない）:');
await t.click(0,i); await t.act('mark','warn').catch(e=>console.log('mark err',e.message));
await t.clickSave(); console.log('picks',await b.ev('window.__picks'),'saves',(await t.saves()).length);
// ドロップで handle が来るか
await b.goto('dist/DocVisualizer.html'); fs.copyFileSync('verify/md/25_move.md','verify/out/drop_target.md');
await t.dropFile('verify/out/drop_target.md');
console.log('drop後 loaded', await b.ev(`document.getElementById('doc').hidden`)===false);
const hasH=await b.ev(`(async()=>{return 'getAsFileSystemHandle' in DataTransferItem.prototype})()`);
console.log('getAsFileSystemHandle 実装', hasH);
await b.close();
