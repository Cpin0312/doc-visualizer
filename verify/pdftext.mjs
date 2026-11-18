// PDF のページごとの文字を出す（pdfjs-dist。devDependency）。node verify/pdftext.mjs file.pdf
import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise;
console.log('pages',d.numPages);
for(let i=1;i<=d.numPages;i++){const t=await (await d.getPage(i)).getTextContent();console.log(`--p${i}:`,t.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').slice(0,260));}
