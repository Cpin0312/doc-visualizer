// npm run build → dist/DocVisualizer.html（1枚。全部インライン。Windows・Mac どちらでも node だけで動く）
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const rd = p => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const pkg = JSON.parse(rd('package.json'));

// JSON を <script> に入れる：< を \u003c にすれば </script> も <!-- も出ない
const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
// コードの中の </script は、文字列の中なら <\/script と同じ意味になる
const code = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const samples = readdirSync(join(root, 'samples')).filter(f => f.endsWith('.md')).sort().map(name => {
  const text = rd(join('samples', name));
  const t = /^#\s+(.+)$/m.exec(text);
  return { name, title: name.replace(/^\d+_/, '').replace(/\.md$/, '') + (t ? '：' + t[1].trim() : ''), text };
});
const prompt = rd('copilot-prompt.md');

// three.js（MIT）の ES モジュール版を、ふつうの <script> で動く形にする（file:// では外のモジュールを読めないため）
function threeClassic() {
  let src = readFileSync(join(root, 'node_modules', 'three', 'build', 'three.module.min.js'), 'utf8');
  const m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(src);
  if (!m || /\bimport\s*[{*\w]/.test(src.slice(0, 2000))) throw new Error('three.module.min.js の形が思っていたものと違う');
  const pairs = m[1].split(',').map(p => p.trim().split(/\s+as\s+/)).map(([a, b]) => `${JSON.stringify(b || a)}:${a}`);
  return '(function(){' + src.slice(0, m.index) + '\nwindow.THREE=Object.freeze({' + pairs.join(',') + '});})();';
}
const threePkg = JSON.parse(rd('node_modules/three/package.json'));
const pptxPkg = JSON.parse(rd('node_modules/pptxgenjs/package.json'));
const jszipPkg = JSON.parse(rd('node_modules/jszip/package.json'));
// PptxGenJS（MIT。中に JSZip（MIT）が入った版）。最後の sourceMappingURL は外を指すので外す
let pptxgen = rd('node_modules/pptxgenjs/dist/pptxgen.bundle.js').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n')
// 中の文字列 "<script>…" は HTML の <script> とまちがわれるので、文字列のまま <\x73cript と書きかえる（意味は同じ）
  .split('e.write("<script>').join('e.write("<\\x73cript>');
// グラフの欠けた数字（null）は、空の <c:v></c:v> ではなく点ごと書かない（空の値は読めない道具がある。PowerPoint では線が切れる）
let blanks = 0;
pptxgen = pptxgen.replace(/<c:pt idx="\$\{t\}"><c:v>\$\{([\w.\[\]]+)\|\|0===\1\?\1:""\}<\/c:v><\/c:pt>/g, (m, v) => { blanks++; return '${' + v + '||0===' + v + '?`<c:pt idx="${t}"><c:v>${' + v + '}</c:v></c:pt>`:""}'; });
if (blanks < 5) throw new Error('pptxgen.bundle.js のグラフの値の書き方が思っていたものと違う（' + blanks + '）');
if (/<script/i.test(pptxgen)) throw new Error('pptxgen.bundle.js に <script が残っている');
if (!/var PptxGenJS\s*=/.test(pptxgen) || /sourceMappingURL/.test(pptxgen)) throw new Error('pptxgen.bundle.js の形が思っていたものと違う');
const licenses = `/*! 入っている部品のライセンス
 * three.js ${threePkg.version} — ${rd('node_modules/three/LICENSE').trim().replace(/\*\//g, '* /').replace(/\n/g, '\n * ')}
 *
 * PptxGenJS ${pptxPkg.version} — ${rd('node_modules/pptxgenjs/LICENSE').trim().replace(/\*\//g, '* /').replace(/\n/g, '\n * ')}
 *
 * JSZip ${jszipPkg.version}（PptxGenJS の中）— MIT ライセンスを選んで使う（JSZip は MIT と GPLv3 のどちらかを選べる）
 */`;

const scripts = [
  licenses,
  threeClassic(),
  pptxgen,
  `window.DV_SAMPLES = ${json(samples)};\nwindow.DV_PROMPT = ${json(prompt)};`,
  rd('src/parse.js'),
  rd('src/render2d.js'),
  rd('src/scene3d.js'),
  rd('src/pptx.js'),
  rd('src/app.js')
].map(code).join('\n;\n');

const version = pkg.version;   // 日付は入れない（同じ源から同じ dist ができるように）
let html = rd('src/index.html');
const put = (marker, text) => {
  if (!html.includes(marker)) throw new Error('印がない：' + marker);
  html = html.split(marker).join('\u0000');            // $& などを特別扱いさせない
  html = html.replace(/\u0000/g, () => text);
};
put('/*__CSS__*/', rd('src/style.css'));
put('<!--__SCRIPTS__-->', `<script>\n${scripts}\n</script>`);
html = html.split('__VERSION__').join(version);

// 守ること：外を読みこむ書き方がない・<script> は1つだけ
const bad = [/<script[^>]+src=/i, /<link[^>]+href=/i, /@import/i, /\burl\(\s*['"]?https?:/i];
for (const re of bad) if (re.test(html)) throw new Error('外を読みこむ書き方がある：' + re);
const opens = (html.match(/<script\b/gi) || []).length, closes = (html.match(/<\/script>/gi) || []).length;
if (opens !== 1 || closes !== 1) throw new Error(`<script> の数がおかしい（${opens} / ${closes}）`);

// 出し先：node build.mjs --out <ファイル>（既定 dist/DocVisualizer.html）
const oi = process.argv.indexOf('--out');
const dest = oi > 0 ? resolve(process.argv[oi + 1]) : join(root, 'dist', 'DocVisualizer.html');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, html);
console.log(`${dest} ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB（見本 ${samples.length}）`);
