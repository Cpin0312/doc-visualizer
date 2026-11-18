// ドロップで開いた md：本物の handle（Chrome 自前）で上書きされるか
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const t=await start({dl:'verify/out/dl_b'}); const {b}=t;
fs.copyFileSync('verify/md/25_move.md','verify/out/drop_target.md');
const orig=fs.readFileSync('verify/out/drop_target.md');
await t.dropFile('verify/out/drop_target.md'); await t.to2d();
const names=JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('#dg0 .svg-wrap svg .item')].map(g=>g.getAttribute('aria-label')))`));
const i=await t.idxOf(0,names[0]); await t.click(0,i); await t.act('rename'); await t.typeEnter('ドロップ直し');
console.log('dirty',await t.dirty());
await t.clickSave(); await t.sleep(1500);
console.log('picks',await b.ev('window.__picks'),'stub saves',(await t.saves()).length,'toast',await t.toast(),'err',await t.err());
const now=fs.readFileSync('verify/out/drop_target.md');
console.log('実ファイルが変わった',Buffer.compare(orig,now)!==0,'dirty',await t.dirty(),'DL',fs.readdirSync('verify/out/dl_b'));
console.log('実ファイルに新名',now.toString().includes('ドロップ直し'));
await b.close();
