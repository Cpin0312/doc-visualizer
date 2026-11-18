// DocVisualizer の試験（node だけ。Mac・Windows どちらでも）。
//   1) 読みとり（parse.js）を node で直接
//   2) dist/DocVisualizer.html を file:// で開き、本物の道（ファイル選び・ドロップ・クリック・印刷）で
// 結果は test/out/（画面の絵・PDF・result.json）。1つでも × なら終わりの番号は 1。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { launch, sleep } from './cdp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test', 'out');
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const P = require(join(root, 'src', 'parse.js'));
const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail: String(detail) });
  console.log((cond ? '○ ' : '× ') + name + (detail ? '  … ' + detail : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 1) 読みとり ----------
{
  const d = P.parseDoc([
    'はい、まとめました。', '```markdown', '# 題', '> ひとことで：短く', '> **結論**：A にする', '> 社外秘：関係者限り',
    '~~~flow 流れ', '受付 → 確認 ⇒ 見積 => 返事 --> 終わり －> 片づけ', '見積 -> 受付 ： 差し戻し', '承認 !期限 ？要確認 +済', ' -> 何もない', '~~~',
    '```lanes', '[営業] 受付 -> [経理] 請求 -> 入金', '```', '```', 'またどうぞ'
  ].join('\r\n'));
  ok('読みとり：外側の ```markdown をはずし、題名・ひとこと・結論・社外秘', d.title === '題' && d.summary === '短く' && d.conclusion === 'A にする' && d.secret === '関係者限り', JSON.stringify([d.title, d.summary, d.conclusion, d.secret]));
  const f = d.diagrams[0];
  ok('読みとり：矢印 → ⇒ => --> －> と全角の ： をみな読む', f && f.items.map(i => i.label).join(',') === '受付,確認,見積,返事,終わり,片づけ,承認' && f.edges.some(e => e.label === '差し戻し'), f && f.items.map(i => i.label).join(','));
  ok('読みとり：印 !期限（赤）？要確認（黄）+済（緑）', f && eq(f.items[6].marks.map(m => m.kind + m.text), ['red期限', 'yellow要確認', 'green済']), f && JSON.stringify(f.items[6].marks));
  ok('読みとり：箱の名前がない行は飛ばし、元の行番号で知らせる', d.warnings.some(w => w.line === 11 && w.kind === 'skip'), JSON.stringify(d.warnings));
  ok('読みとり：~~~ の図と ``` の図の両方（包みの中に ``` の図があっても）', d.diagrams.length === 2 && d.diagrams[1].type === 'lanes' && eq(d.diagrams[1].lanes, ['営業', '経理']), d.diagrams.map(x => x.type).join(','));

  const jp = P.parseDoc('```日程　予定\n2026/12/1　説明会 ！期限\n12/15 締め\n2026年1月 ふりかえり\n2026-02-30 ない日\n```\n```木\n- 親\n  - 子\n　　- 孫\n```\n```数字 件数（件）\n１月 ： １,２００\n2月 : 1.2万\n3月 : ▲30\n4月 : たくさん\n```\n```大事な数字\n売上 : 1,200万円 : 前年比 +8%\n解約 : 2% : ▲0.3pt\n```\n```比べる\n| 項目 | 案A | 案B |\n|---|---|---|\n| 値段 | ◎ 安い | × 高い |\n| 早さ | ○ | △ | 余り |\n```');
  const [tl, tr, ch, kp, cp] = jp.diagrams;
  ok('読みとり：日本語の種類名（日程・木・数字・大事な数字・比べる）', eq(jp.diagrams.map(x => x.type), ['timeline', 'tree', 'chart', 'kpi', 'compare']), jp.diagrams.map(x => x.type).join(','));
  ok('読みとり：日付（2026/12/1・年なし・年月だけ・ない日は飛ばす）', tl && eq(tl.items.map(i => i.date), ['2026-01-01', '2026-12-01', '2026-12-15']) && jp.warnings.some(w => /年がない/.test(w.msg)) && jp.warnings.some(w => /ない日付/.test(w.msg)), tl && tl.items.map(i => i.date).join(','));
  ok('読みとり：木（全角スペースの字下げも）', tr && eq(tr.items.map(i => i.depth), [0, 1, 2]), tr && JSON.stringify(tr.items.map(i => i.depth)));
  ok('読みとり：数字（全角・1,200・1.2万・▲）と単位、読めない数字は飛ばす', ch && ch.unit === '件' && eq(ch.items.map(i => i.value), [1200, 12000, -30]) && ch.items[0].valueText === '１,２００' && jp.warnings.some(w => /たくさん/.test(w.msg)), ch && JSON.stringify(ch.items.map(i => i.value)));
  ok('読みとり：大事な数字（上がり・下がり）', kp && kp.items[0].trend === 'up' && kp.items[1].trend === 'down' && kp.items[0].valueText === '1,200万円');
  ok('読みとり：比べる（◎×○△・列の数ちがいはそろえて知らせる）', cp && eq(cp.options, ['案A', '案B']) && eq(cp.items[0].cells.map(c => c.rate), ['best', 'bad']) && eq(cp.items[1].cells.map(c => c.rate), ['good', 'mid']) && jp.warnings.some(w => /列の数/.test(w.msg)));

  const big = P.parseDoc('```flow\n' + Array.from({ length: 260 }, (_, i) => `箱${i} -> 箱${i + 1}`).join('\n') + '\n```');
  ok('読みとり：箱が 200 を超えたら先頭 200 だけ・知らせる', big.diagrams[0].items.length === 200 && big.warnings.some(w => /200/.test(w.msg)), big.diagrams[0].items.length);
  const loop = P.parseDoc('```flow\nA -> B -> C -> A\nA -> A\n```');
  ok('読みとり：輪になる矢印も止まらない', loop.diagrams[0].edges.length === 4);
  const same = P.parseDoc('```flow\n受付 -> 確認\n受付 -> 返事\n```');
  ok('読みとり：同じ名前の箱は1つにまとめる', same.diagrams[0].items.length === 3);
  const none = P.parseDoc('# 図なし\n本文だけ');
  ok('読みとり：図のない md でも止まらない', none.title === '図なし' && none.diagrams.length === 0 && none.body.length === 1);
  const unk = P.parseDoc('```mermaid\ngraph TD\n```');
  ok('読みとり：知らない種類は文として出し、知らせる', unk.warnings.some(w => /mermaid/.test(w.msg)));
  const x = P.parseDoc('# t\n```flow\n<script>alert(1)</script> -> A&B\n```');
  ok('読みとり：< や & は文字のまま（表示のときにエスケープ）', x.diagrams[0].items[0].label === '<script>alert(1)</script>');

  const plus = P.parseDoc('```chart\n4月 : +120\n5月 : 80\n```\n```flow\nA + B -> C\n```');
  ok('読みとり：数字の前の + と、中身のない記号は印にしない', plus.diagrams[0].items[0].value === 120 && plus.diagrams[0].items[0].marks.length === 0 && plus.diagrams[1].items[0].label === 'A + B' && plus.diagrams[1].items[0].marks.length === 0, JSON.stringify(plus.diagrams.map(d => d.items.map(i => [i.label, i.value, i.marks.length]))));
  for (const [f, enc] of [['sjis_crlf.md', 'Shift_JIS'], ['bom_crlf.md', 'UTF-8（BOM つき）'], ['eucjp.md', 'EUC-JP']]) {
    const r = P.decodeBytes(new Uint8Array(readFileSync(join(root, 'test', 'fixtures', f))));
    ok('文字コード（node）：' + f + ' → ' + enc, r.encoding === enc && /文字コードの試し|問い合わせの件数/.test(r.text), r.encoding);
  }
  const g = P.decodeBytes(new Uint8Array(readFileSync(join(root, 'test', 'fixtures', 'garbled.md'))));
  ok('文字コード（node）：読めない文字は「分からない」と知らせる', !!g.warn, g.warn);
  for (const f of readdirSync(join(root, 'samples'))) {
    const c = P.check(readFileSync(join(root, 'samples', f), 'utf8'));
    ok('server 用の check()：' + f, typeof c.title === 'string' && Array.isArray(c.diagrams), c.diagrams.map(d => d.type + ':' + d.items).join(' '));
  }
}

// ---------- 2) ブラウザで本物の道 ----------
let B;
try { B = await launch(); } catch (e) {
  // ブラウザがないときは落ちずに知らせて止まる（node の読みとりの結果は残す）
  console.log('\n× ブラウザの試験を始められない：' + e.message);
  const bad = results.filter(r => !r.ok);
  writeFileSync(join(out, 'result.json'), JSON.stringify({ when: new Date().toISOString(), platform: process.platform, browser: null, browserError: e.message, pass: results.length - bad.length, fail: bad.length, results }, null, 2));
  console.log(`読みとり ${results.length - bad.length} ○ / ${bad.length} ×。ブラウザの試験は未確認（終わりの番号 2）`);
  process.exit(2);
}
console.log('ブラウザ：' + B.exe);
const net = [], errors = [];
B.on(m => {
  if (m.method === 'Network.requestWillBeSent') net.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') errors.push('例外：' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error：' + JSON.stringify(m.params.args).slice(0, 300));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('ログ：' + m.params.entry.text);
});
await B.send('Network.enable'); await B.send('Runtime.enable'); await B.send('Log.enable'); await B.send('Page.enable'); await B.send('DOM.enable');
await B.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
const url = pathToFileURL(join(root, 'dist', 'DocVisualizer.html')).href + '#today=2026-11-18';
await B.send('Page.navigate', { url });
for (let i = 0; i < 50; i++) { if (await B.evalJs('document.readyState === "complete" && !!window.DocVisualizer').catch(() => false)) break; await sleep(100); }
ok('file:// で開ける（' + url.slice(0, 60) + '…）', await B.evalJs('!!window.DocVisualizer && !!window.DocParse && !!window.DocRender'));

async function pick(path) {
  const { root: doc } = await B.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await B.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#file' });
  await B.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}
async function waitFor(expr, ms = 5000) {
  for (let t = 0; t < ms; t += 100) { const v = await B.evalJs(expr).catch(() => null); if (v) return v; await sleep(100); }
  return null;
}
const state = () => B.evalJs(`({
  status: document.getElementById('status').textContent,
  title: document.getElementById('title').textContent,
  error: document.getElementById('error').hidden ? '' : document.getElementById('error').textContent,
  svgs: document.querySelectorAll('#diagrams svg').length,
  items: Array.from(document.querySelectorAll('#diagrams svg')).map(s => s.querySelectorAll('.item').length),
  warnings: document.getElementById('warnings').hidden ? 0 : document.querySelectorAll('#warnings li').length,
  cards: document.querySelectorAll('#cards .card').length,
  legend: !document.getElementById('legend').hidden,
  secret: document.getElementById('secret').hidden ? '' : document.getElementById('secret').textContent,
  pages: document.querySelectorAll('#print .page').length,
  guide: !document.getElementById('guide').hidden
})`);
async function shot(name) {
  const r = await B.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(out, name + '.png'), Buffer.from(r.data, 'base64'));
}

const files = readdirSync(join(root, 'samples')).sort().map(f => join(root, 'samples', f))
  .concat(['sjis_crlf.md', 'bom_crlf.md', 'eucjp.md', '日本語 の 名前.md'].map(f => join(root, 'test', 'fixtures', f)));
for (const f of files) {
  const name = f.split(/[\\/]/).pop();
  await pick(f);
  const s = await waitFor(`document.getElementById('status').textContent.includes(${JSON.stringify(name)}) && document.getElementById('status').textContent`);
  const st = await state();
  const text = new TextDecoder().decode(readFileSync(f)); // 期待値は node の読みとり（同じコード）から
  const exp = P.parseDoc(P.decodeBytes(new Uint8Array(readFileSync(f))).text);
  const good = s && st.svgs === exp.diagrams.length && eq(st.items, exp.diagrams.map(d => d.items.length)) && st.warnings === exp.warnings.length && !st.error && st.pages >= 1 + exp.diagrams.length;
  ok('ファイル選びで読む：' + name, good, `図 ${st.svgs}・箱 ${st.items.join('/')}・知らせ ${st.warnings}・印刷 ${st.pages} ページ・${st.status.replace(/^.*（/, '（')}`);
  if (/sjis/.test(name)) ok('Shift_JIS・CRLF を画面で読む（題名と社外秘）', st.title.includes('文字コードの試し') && st.secret === '社外秘' && /Shift_JIS・改行 CRLF/.test(st.status), st.title + ' / ' + st.status);
  if (/bom/.test(name)) ok('BOM つき UTF-8・CRLF を画面で読む', /BOM/.test(st.status) && /CRLF/.test(st.status) && st.title === '問い合わせの件数（架空の例）', st.status);
  if (/10_no/.test(name)) ok('図のない md：本文を出し、図の書き方を案内', st.guide && st.svgs === 0 && await B.evalJs(`document.getElementById('body').innerText.includes('現状を調べる') && document.querySelectorAll('#body table').length === 1`));
  if (/09_/.test(name)) ok('まちがえた md：読める図は出し、知らせに行番号', st.svgs > 0 && st.warnings >= 5 && await B.evalJs(`/\\d+行目：/.test(document.getElementById('warnings').innerText)`), st.warnings + ' 件');
  if (/0[1-8]_/.test(name)) ok('凡例・ひとことでカードが出る：' + name, st.legend && st.cards >= 1);
  await shot(name.replace(/\.md$/, ''));
  void text;
}

// まちがったファイルは読まず、画面は前のまま
{
  const before = (await state()).title;
  const big = join(tmpdir(), 'docvis-big.md');
  writeFileSync(big, '# 大きい\n' + 'あ'.repeat(2 * 1024 * 1024));   // 6MB 超
  for (const [f, re] of [[join(root, 'test', 'fixtures', 'not_md.png'), /md ではない/], [join(root, 'test', 'fixtures', 'empty.md'), /空のファイル/], [big, /大きすぎ/]]) {
    await pick(f);
    await waitFor(`!document.getElementById('error').hidden`);
    const st = await state();
    ok('読まないファイル：' + f.split(/[\\/]/).pop(), re.test(st.error) && st.title === before, st.error.slice(0, 50));
  }
  await pick(join(root, 'test', 'fixtures', 'garbled.md'));
  await waitFor(`document.getElementById('status').textContent.includes('garbled.md')`);
  ok('文字化けのファイル：読めた範囲で出し「文字コードが分からない」', await B.evalJs(`document.getElementById('warnings').innerText.includes('文字コードが分からない')`));
}

// 箱を押すと、説明と出どころ（本物のマウスの押し方で）
async function clickAt(sel) {
  const r = await B.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!r) return false;
  await sleep(100);
  const r2 = await B.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await B.send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: 'left', clickCount: 1 });
  return true;
}
{
  await pick(join(root, 'samples', '01_flow.md'));
  await waitFor(`document.getElementById('status').textContent.includes('01_flow.md')`);
  await clickAt('#dg0 .item[aria-label="受付"] .box');
  const p = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').innerText`);
  ok('箱を押す → 説明と出どころが横に出る', p && p.includes('台帳に書く') && p.includes('注文の手順（架空）2ページ'), (p || '').replace(/\n/g, ' ').slice(0, 80));
  await shot('click_panel');
  await clickAt('#dg0 .item[aria-label="承認"] .box');
  const p2 = await waitFor(`document.getElementById('panelBody').innerText.includes('承認') && document.getElementById('panelBody').innerText`);
  ok('印のある箱：印が説明に出る', p2 && p2.includes('期限'));
  await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  ok('Esc で説明を閉じる', await waitFor(`document.getElementById('panel').hidden`));

  // 文字の大きさ
  const before = await B.evalJs(`document.querySelector('#dg0 .item text').getAttribute('font-size')`);
  await clickAt('.fs[data-fs="18"]');
  const after = await waitFor(`document.querySelector('#dg0 .item text').getAttribute('font-size') === '18' && '18'`);
  ok('文字の大きさ「大」で図の文字も大きくなる', before === '15' && after === '18', before + ' → ' + after);
  await clickAt('.fs[data-fs="15"]');
}

// ドラッグ＆ドロップ（ブラウザの中で File を作って落とす）
{
  const txt = readFileSync(join(root, 'samples', '04_tree.md'), 'utf8');
  await B.evalJs(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(txt)}], 'ドロップ.md', { type: 'text/markdown' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
  const s = await waitFor(`document.getElementById('status').textContent.includes('ドロップ.md') && document.getElementById('drop').hidden`);
  ok('ドラッグ＆ドロップで読む', !!s && (await state()).svgs === 1);
}

// Copilot 用の指示をコピー
{
  try { await B.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }); } catch {}
  await clickAt('#copyPrompt');
  const t = await waitFor(`!document.getElementById('toast').hidden && document.getElementById('toast').textContent`);
  let clip = null;
  try { clip = await B.evalJs('navigator.clipboard.readText()'); } catch {}
  const prompt = readFileSync(join(root, 'copilot-prompt.md'), 'utf8').replace(/\r\n/g, '\n');
  ok('Copilot 用の指示をコピー（知らせが出る）', t && t.includes('コピーしました'), t);
  ok('コピーした中身が copilot-prompt.md と同じ', clip === prompt, clip == null ? '読み返せない（未確認）' : clip.length + ' 字');
}

// 見本の選びから開く
{
  await B.evalJs(`(() => { const s = document.getElementById('sample'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  ok('見本を開く（選ぶだけ）', await waitFor(`document.getElementById('status').textContent.includes('01_flow.md')`));
}

// PDF（印刷の道：Chrome の printToPDF）。中の文字は pdf.js で読む
{
  await pick(join(root, 'samples', '08_copilot_wrapped.md'));
  await waitFor(`document.getElementById('status').textContent.includes('08_copilot')`);
  const pages = (await state()).pages;
  const r = await B.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  const pdf = Buffer.from(r.data, 'base64');
  writeFileSync(join(out, '08_copilot_wrapped.pdf'), pdf);
  const pdfjs = await import(pathToFileURL(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const texts = [];
  let landscape = true;
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const [, , w, h] = pg.view;
    if (!(w > h && Math.abs(w - 842) < 4 && Math.abs(h - 595) < 4)) landscape = false;
    // 字体によっては「方」「長」が部首の文字（⽅・⻑）で出るので、NFKC にそろえ、空白と制御文字を除いて比べる
    texts.push((await pg.getTextContent()).items.map(x => x.str).join('').normalize('NFKC').replace(/[\s\x00-\x1f]+/g, '').replace(/⻑/g, '長'));
  }
  writeFileSync(join(out, '08_pdf_text.json'), JSON.stringify(texts, null, 1));
  ok('PDF：ページの数（表紙＋図7つ＋説明）', doc.numPages === pages && pages >= 9, `PDF ${doc.numPages} ページ・画面の印刷用 ${pages}`);
  ok('PDF：A4 横', landscape);
  ok('PDF：日本語が文字として入っている（題名・ひとことで）', texts[0].includes('新しい受付のしくみ(架空の例・Copilotの出し方)') && texts[0].includes('受付を1つの窓口にまとめ'), texts[0].slice(0, 40));
  ok('PDF：全ページに社外秘の印とページ番号', texts.every((t, i) => t.includes('関係者限り') && t.includes(`${i + 1}/${doc.numPages}`)), texts.map((t, i) => t.includes('関係者限り') && t.includes(`${i + 1}/${doc.numPages}`) ? '○' : '×').join(''));
  ok('PDF：図のページに箱の名前、最後に説明と出どころ', texts[1].includes('振り分け') && texts[texts.length - 1].includes('受付の見直し案'), texts[texts.length - 1].slice(0, 40));
  // 色が消えないか：印刷の見た目で絵を撮る
  await B.send('Emulation.setEmulatedMedia', { media: 'print' });
  await shot('08_print_media');
  await B.send('Emulation.setEmulatedMedia', { media: '' });
}

// PDF：長い説明・本文が切れずに、ページを分けて出る
{
  const long = join(tmpdir(), 'docvis-long.md');
  const para = '長い説明の文です。'.repeat(40);
  writeFileSync(long, '# 長い資料\n> ひとことで：長い\n\n```flow\n受付 -> 確認\n```\n\n## 受付\n' + Array.from({ length: 12 }, (_, i) => `${i + 1}段落目：` + para).join('\n') + '\n[元：長い資料 9ページ]\n\n## 背景\n本文のさいごの行です。\n');
  await pick(long);
  await waitFor(`document.getElementById('status').textContent.includes('docvis-long.md')`);
  const r = await B.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  const pdfjs = await import(pathToFileURL(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(r.data, 'base64')), verbosity: 0 }).promise;
  let all = '';
  for (let i = 1; i <= doc.numPages; i++) all += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join('').normalize('NFKC').replace(/[\s\x00-\x1f]+/g, '').replace(/⻑/g, '長');
  writeFileSync(join(out, 'long_pdf_text.txt'), all);
  const overflow = await B.evalJs(`(() => { document.getElementById('print').style.display = 'block'; const bad = Array.from(document.querySelectorAll('#print .page')).filter(p => p.scrollHeight > p.clientHeight + 2).length; document.getElementById('print').style.display = ''; return bad; })()`);
  ok('PDF：長い説明はページを分け、最後の段落と出どころまで出る', Array.from({ length: 12 }, (_, i) => `${i + 1}段落目`).every(k => all.includes(k)) && all.includes('長い資料9ページ') && overflow === 0, `PDF ${doc.numPages} ページ・はみ出すページ ${overflow}・12段落目 ${all.includes('12段落目')}・出どころ ${all.includes('長い資料9ページ')}`);
  ok('PDF：本文（説明でない見出し）も出る', all.includes('本文のさいごの行です'));
}

// 確かめ役の md（verify/md があれば、読むだけ。直さない）：落ちず、エラーを出さない
if (existsSync(join(root, 'verify', 'md'))) {
  for (const f of readdirSync(join(root, 'verify', 'md')).sort()) {
    const path = join(root, 'verify', 'md', f);
    await pick(path);
    const st = await waitFor(`(document.getElementById('status').textContent.includes(${JSON.stringify(f)}) || !document.getElementById('error').hidden) && ({ s: document.getElementById('status').textContent, e: document.getElementById('error').hidden ? '' : document.getElementById('error').textContent, svgs: document.querySelectorAll('#diagrams svg').length, w: document.getElementById('warnings').hidden ? 0 : document.querySelectorAll('#warnings li').length })`);
    console.log('   確かめ役の md：' + f + ' → ' + (st ? (st.e ? '断った：' + st.e.slice(0, 40) : `図 ${st.svgs}・知らせ ${st.w}・${st.s.replace(/^.*（/, '（')}`) : '反応なし'));
    if (!st) ok('確かめ役の md に反応する：' + f, false);
  }
}

// 外への読みこみ 0 件・エラー 0 件
const outside = net.filter(u => !/^(file|data|blob|about):/.test(u));
ok('外への読みこみ 0 件（file・data・blob 以外）', outside.length === 0, outside.length ? outside.slice(0, 3).join(' ') : `読みこみ ${net.length} 件、すべて内側`);
ok('エラー・CSP の止めが 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('ブラウザに何も保存しない（localStorage・sessionStorage が空）', await B.evalJs('localStorage.length === 0 && sessionStorage.length === 0').catch(() => true));
B.close();

const bad = results.filter(r => !r.ok);
writeFileSync(join(out, 'result.json'), JSON.stringify({ when: new Date().toISOString(), platform: process.platform, browser: B.exe, pass: results.length - bad.length, fail: bad.length, results }, null, 2));
console.log(`\n${results.length - bad.length} ○ / ${bad.length} ×（結果：test/out/result.json）`);
process.exit(bad.length ? 1 : 0);
