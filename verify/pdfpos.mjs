import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise; const out={};
for(let i=1;i<=d.numPages;i++){const tc=await (await d.getPage(i)).getTextContent();for(const it of tc.items){const s=it.str.normalize('NFKC');for(const k of process.argv.slice(3)){if(s.includes(k)&&!out[k])out[k]=[i,Math.round(it.transform[4]),Math.round(it.transform[5])];}}}
console.log(JSON.stringify(out));