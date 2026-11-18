// npm run build → dist/DocVisualizer.html（1枚。全部インライン。Windows・Mac どちらでも node だけで動く）
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

const scripts = [
  `window.DV_SAMPLES = ${json(samples)};\nwindow.DV_PROMPT = ${json(prompt)};`,
  rd('src/parse.js'),
  rd('src/render2d.js'),
  rd('src/app.js')
].map(code).join('\n;\n');

const version = `${pkg.version}（${new Date().toISOString().slice(0, 10)} build）`;
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

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'DocVisualizer.html'), html);
console.log(`dist/DocVisualizer.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB（見本 ${samples.length}）`);
