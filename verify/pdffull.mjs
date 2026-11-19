import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise; let all='';
for(let i=1;i<=d.numPages;i++){const t=await (await d.getPage(i)).getTextContent();all+=t.items.map(x=>x.str).join('')+'\n';}
console.log(all.normalize('NFKC'));
