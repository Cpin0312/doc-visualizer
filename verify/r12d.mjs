// Shift_JIS の表：全部の2バイト字が、アプリの encodeText で Python cp932 と同じバイトになるか（アプリと同じ関数を呼ぶ）
import {start} from './r12lib.mjs'; import fs from 'node:fs';
const t=await start({}); const {b}=t; const J=JSON.parse(fs.readFileSync('verify/out/sjis_all.json','utf8'));
const r=await b.ev(`(()=>{const J=${JSON.stringify(J)};const bad=[];let n=0;const all373=[];
for(const c of J.chars){const o=DocParse.encodeText('a'+c+'b\\n','sjis',null);if(o.bad){bad.push([c,'bad']);continue}
 const hex=[...o.bytes].map(x=>x.toString(16).padStart(2,'0')).join('');n++;const e='61'+J.exp[c]+'62'+'0a';if(hex!==e)bad.push([c,hex,e]);}
window.__bad=bad;
// 行ごとの再現：全部まとめて1つの md として
const all=J.chars.join('')+'\\n';const o2=DocParse.encodeText(all,'sjis',null);
const kana=DocParse.encodeText('ｱｲｳｶﾞ｡｢｣ﾟ','sjis',null);const sp=DocParse.encodeText('¥‾−','sjis',null);
const emo=DocParse.encodeText('a😀b\\nc','sjis',null);
return {n,bad:bad.slice(0,0),allbad:bad,nbad:bad.length,allLen:o2.bytes&&o2.bytes.length,kana:[...kana.bytes].map(x=>x.toString(16)).join(' '),sp:[...sp.bytes].map(x=>x.toString(16)).join(' '),emo:JSON.stringify(emo.bad)}})()`);
fs.writeFileSync('verify/out/sjis_bad.json',JSON.stringify(r.allbad));console.log(JSON.stringify({...r,allbad:undefined})); await b.close();
