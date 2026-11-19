import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise; const out=[];
for(let i=1;i<=Math.min(d.numPages,3);i++){const p=await d.getPage(i);const tc=await p.getTextContent();for(const it of tc.items){if(it.str.includes('社外秘')||it.str.includes('試験用'))out.push(i+':'+it.str.slice(0,10)+'@'+Math.round(it.transform[4])+','+Math.round(it.transform[5]));}}
console.log(out.join(' | '));