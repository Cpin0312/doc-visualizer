// PDF のページを PNG にする（pdfjs-dist + @napi-rs/canvas）。node verify/pdfpng.mjs in.pdf outPrefix [page...]
import fs from 'node:fs'; import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs'; import {createCanvas} from '@napi-rs/canvas';
const [,,f,pre,...pg]=process.argv;
const d=await getDocument({data:new Uint8Array(fs.readFileSync(f)),useSystemFonts:true}).promise;
for(const n of (pg.length?pg.map(Number):[...Array(d.numPages).keys()].map(i=>i+1))){
  const p=await d.getPage(n),v=p.getViewport({scale:1.2}),c=createCanvas(v.width,v.height),x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,v.width,v.height);
  await p.render({canvasContext:x,viewport:v,canvas:c}).promise;fs.writeFileSync(`${pre}-${n}.png`,c.toBuffer('image/png'));}
console.log('pages',d.numPages);
