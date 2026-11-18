import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const d=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2])),useSystemFonts:true}).promise;
for(let i=1;i<=d.numPages;i++){const t=(await (await d.getPage(i)).getTextContent()).items.filter(x=>x.str.trim());const hs=t.map(x=>Math.abs(x.transform[3]));console.log('p'+i,'最小の文字',Math.min(...hs).toFixed(1),'pt =',(Math.min(...hs)/0.75).toFixed(1),'px');}
