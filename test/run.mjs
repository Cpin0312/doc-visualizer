// DocVisualizer の試験（node だけ。Mac・Windows どちらでも）。
//   1) 読みとり（parse.js）を node で直接
//   2) dist/DocVisualizer.html を file:// で開き、本物の道（ファイル選び・ドロップ・クリック・印刷）で
// 結果は test/out/（画面の絵・PDF・result.json）。1つでも × なら終わりの番号は 1。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
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

  // R1 の直し：矢印のない行は、名前だけなら箱、文なら飛ばして知らせる（copilot-prompt.md と同じきまり）
  const sen = P.parseDoc('```flow 文\n承認 !期限\nWeb受付\nここで内容を確認して、問題があれば戻す。\n```');
  ok('読みとり：矢印のない行：名前だけは箱、文は飛ばして知らせる', eq(sen.diagrams[0].items.map(i => i.label), ['承認', 'Web受付']) && sen.warnings.some(w => w.line === 4 && w.kind === 'skip' && w.msg.includes('矢印のない文')), JSON.stringify([sen.diagrams[0].items.map(i => i.label), sen.warnings]));

  const jp = P.parseDoc('```日程　予定\n2026/12/1　説明会 ！期限\n12/15 締め\n2026年1月 ふりかえり\n2026-02-30 ない日\n```\n```木\n- 親\n  - 子\n　　- 孫\n```\n```数字 件数（件）\n１月 ： １,２００\n2月 : 1.2万\n3月 : ▲30\n4月 : たくさん\n```\n```大事な数字\n売上 : 1,200万円 : 前年比 +8%\n解約 : 2% : ▲0.3pt\n```\n```比べる\n| 項目 | 案A | 案B |\n|---|---|---|\n| 値段 | ◎ 安い | × 高い |\n| 早さ | ○ | △ | 余り |\n```');
  const [tl, tr, ch, kp, cp] = jp.diagrams;
  ok('読みとり：日本語の種類名（日程・木・数字・大事な数字・比べる）', eq(jp.diagrams.map(x => x.type), ['timeline', 'tree', 'chart', 'kpi', 'compare']), jp.diagrams.map(x => x.type).join(','));
  ok('読みとり：日付（2026/12/1・年なし・年月だけ・ない日は飛ばす）', tl && eq(tl.items.map(i => i.date), ['2026-01-01', '2026-12-01', '2026-12-15']) && jp.warnings.some(w => /年がない/.test(w.msg)) && jp.warnings.some(w => /ない日付/.test(w.msg)), tl && tl.items.map(i => i.date).join(','));
  ok('読みとり：木（全角スペースの字下げも）', tr && eq(tr.items.map(i => i.depth), [0, 1, 2]), tr && JSON.stringify(tr.items.map(i => i.depth)));
  ok('読みとり：数字（全角・1,200・1.2万・▲）と単位、読めない数字は飛ばす', ch && ch.unit === '件' && eq(ch.items.map(i => i.value), [1200, 12000, -30]) && ch.items[0].valueText === '１,２００' && jp.warnings.some(w => /たくさん/.test(w.msg)), ch && JSON.stringify(ch.items.map(i => i.value)));
  ok('読みとり：大事な数字（上がり・下がり）', kp && kp.items[0].trend === 'up' && kp.items[1].trend === 'down' && kp.items[0].valueText === '1,200万円');
  ok('読みとり：比べる（◎×○△・列の数ちがいはそろえて知らせる）', cp && eq(cp.options, ['案A', '案B']) && eq(cp.items[0].cells.map(c => c.rate), ['best', 'bad']) && eq(cp.items[1].cells.map(c => c.rate), ['good', 'mid']) && jp.warnings.some(w => /列の数/.test(w.msg)));

  const big = P.parseDoc('```flow\n' + Array.from({ length: 260 }, (_, i) => `箱${i} -> 箱${i + 1}`).join('\n') + '\n```');
  ok('読みとり：箱が 200 を超えたら先頭 200 だけ・省いた数は箱の数（261 個なら 61）', big.diagrams[0].items.length === 200 && big.warnings.some(w => w.msg.includes('61 個を省いた')), big.warnings.map(w => w.msg).join(' / '));
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
  // R6：グラフ5種類（円・ドーナツ・折れ線・横棒・積み上げ）
  {
    const g = P.parseDoc('# t\n```pie 入口（件）\n電話 : 45\n窓口 : -5\n```\n```donut 内訳\nA : 1\n```\n```line 月（件）\n系列 : 受付, 完了\n4月 : 120, 80\n5月 : 90, -\n6月 : x, 1\n```\n```横棒 長い\nとても長い部署の名前 : 10\n```\n```積み上げ 積み\n4月 : 1, 2, 3\n5月 : 2, 2\n```\n');
    const [pie, donut, line, hbar, st] = g.diagrams;
    ok('読みとり：グラフ5種類の名前（pie・donut・line・横棒・積み上げ）', g.diagrams.map(d => d.type).join() === 'pie,donut,line,hbar,stacked', g.diagrams.map(d => d.type).join());
    ok('読みとり：円グラフの 0 より小さい数は 0 にして知らせる', pie.items[1].value === 0 && g.warnings.some(w => w.msg.includes('0 より小さい')), JSON.stringify(g.warnings.map(w => w.msg)));
    ok('読みとり：折れ線の系列・欠け（-）・読めない数字の行は飛ばす', line.unit === '件' && line.series.join() === '受付,完了' && JSON.stringify(line.items.map(i => i.values)) === '[[120,80],[90,null]]' && g.warnings.some(w => w.line === 13), JSON.stringify(line.items.map(i => i.values)));
    ok('読みとり：積み上げの系列の名前がなければ「系列 n」、足りない数字は欠け', st.series.join() === '系列 1,系列 2,系列 3' && JSON.stringify(st.items[1].values) === '[2,2,null]', st.series.join());
    ok('部品は同じ形で持つ（箱も線も kind・style・行の番号）', [pie.items[0], line.items[0]].every(x => x.kind === 'box' && x.style && x.line > 0) && P.parseDoc('```flow\nA -> B\n```').diagrams[0].edges.every(e => e.kind === 'line' && e.id === 'e0' && e.style && e.line === 2));
  }
  // R6 の直し：桁区切りと値の区切り（数の読み方は parseNumber の1か所）。積み上げの負の数
  {
    const g = P.parseDoc('# t\n```line a\n4月 : 1,200, 800\n5月 : 1,300,900、7万\n6月 : 1,2\n7月 : 5 !期限, 6\n```\n```chart c\nx : 1,200\ny : 1,2\n```\n```pie p\nA : 1,200\n```\n```kpi k\n売上 : 1,200万円 : +8%\n```\n```stacked s\nx : 3, -2\n```\n');
    const [ln, ch, pi, kp, st] = g.diagrams, W = g.warnings.map(w => w.line + ':' + w.msg);
    ok('読みとり：「1,200, 800」は 1200 と 800。「1,300,900」「7万」も読む。スペースのない「1,2」は区切りとして読んで知らせる', JSON.stringify(ln.items.map(i => i.values)) === '[[1200,800],[1300900,70000],[1,2],[5,6]]' && W.some(w => w.startsWith('5:コンマのあとにスペースがない')) && ln.items[3].marks.some(m => m.text === '期限') && ln.items[3].valueTexts[0] === '5', JSON.stringify(ln.items.map(i => i.values)));
    ok('読みとり：chart・pie・kpi も同じ数の読み方（1,200 は 1200、1,2 は読めないと知らせる）', ch.items.map(i => i.value).join() === '1200' && pi.items[0].value === 1200 && /1,200/.test(kp.items[0].valueText) && W.some(w => w.includes('数字（1,2）が読めない')), W.join(' | '));
    ok('読みとり：積み上げの負の数は 0 にして知らせる（どこで出しても同じ値）', JSON.stringify(st.items[0].values) === '[3,0]' && st.items[0].valueTexts[1] === '0' && W.some(w => w.includes('積み上げは 0 より小さい')), JSON.stringify(st.items[0].values));
  }
  // R7：フローチャート。形は style.shape に持つ
  {
    const g = P.parseDoc('# t\n```フローチャート 発注\n(開始) -> /注文を受ける/ -> <在庫ある?>\n<在庫ある?> -> 出荷 : はい\n在庫ある? -> [[発注する]] : いいえ\n発注する -> 在庫ある?\n出荷 -> （終わり）\n<確認する?>\n```\n').diagrams[0];
    ok('読みとり：フローチャートの形（端・入出力・判断・処理・別の手順）と、形のない書き方でも同じ箱', g.type === 'flowchart' && g.items.map(i => i.label + ':' + i.style.shape).join() === '開始:terminal,注文を受ける:io,在庫ある?:decision,出荷:process,発注する:subprocess,終わり:terminal,確認する?:decision', g.items.map(i => i.label + ':' + i.style.shape).join());
    ok('読みとり：フローチャートの矢印の言葉（はい・いいえ）と戻る矢印', g.edges.map(e => e.from + '>' + e.to + (e.label ? ':' + e.label : '')).join() === '0>1,1>2,2>3:はい,2>4:いいえ,4>2,3>5', g.edges.map(e => e.from + '>' + e.to).join());
  }
  for (const f of readdirSync(join(root, 'samples'))) {
    const c = P.check(readFileSync(join(root, 'samples', f), 'utf8'));
    ok('短いまとめ check()：' + f, typeof c.title === 'string' && Array.isArray(c.diagrams), c.diagrams.map(d => d.type + ':' + d.items).join(' '));
  }
}

// ---------- 2) ブラウザで本物の道 ----------
let B;
// ヘッドレスでも WebGL が使えるように、ソフトの描き手（SwiftShader）を使う
const GL_ON = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
// Windows の画面の拡大（125%・150%）を試すときは DOCVIS_DSF=1.5 のように渡す
const DSF = +process.env.DOCVIS_DSF || 1;
if (DSF !== 1) GL_ON.push('--force-device-scale-factor=' + DSF);
try { B = await launch({ extra: GL_ON }); } catch (e) {
  // ブラウザがないときは落ちずに知らせて止まる（node の読みとりの結果は残す）
  console.log('\n× ブラウザの試験を始められない：' + e.message);
  const bad = results.filter(r => !r.ok);
  writeFileSync(join(out, 'result.json'), JSON.stringify({ when: new Date().toISOString(), platform: process.platform, browser: null, browserError: e.message, pass: results.length - bad.length, fail: bad.length, results }, null, 2));
  console.log(`読みとり ${results.length - bad.length} ○ / ${bad.length} ×。ブラウザの試験は未確認（終わりの番号 2）`);
  process.exit(2);
}
console.log('ブラウザ：' + B.exe + '・拡大 ' + DSF * 100 + '%（' + (await B.evalJs('navigator.userAgent')) + '）');
const net = [], errors = [];
B.on(m => {
  if (m.method === 'Network.requestWillBeSent') net.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') errors.push('例外：' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error：' + JSON.stringify(m.params.args).slice(0, 300));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('ログ：' + m.params.entry.text);
});
await B.send('Network.enable'); await B.send('Runtime.enable'); await B.send('Log.enable'); await B.send('Page.enable'); await B.send('DOM.enable');
await B.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: DSF, mobile: false });
const hi = process.argv.indexOf('--html');
const htmlPath = hi > 0 ? resolve(process.argv[hi + 1]) : join(root, 'dist', 'DocVisualizer.html');
console.log('試す HTML：' + htmlPath);
const url = pathToFileURL(htmlPath).href + '#today=2026-11-18';
await B.send('Page.navigate', { url });
for (let i = 0; i < 50; i++) { if (await B.evalJs('document.readyState === "complete" && !!window.DocVisualizer').catch(() => false)) break; await sleep(100); }
ok('file:// で開ける（' + url.slice(0, 60) + '…）', await B.evalJs('!!window.DocVisualizer && !!window.DocParse && !!window.DocRender'));

async function keyPress(k, code, vk) {
  await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
}
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
async function shot(name, whole = true) {
  const r = await B.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: whole });
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
  // ここからは 2D で押す（3D で押すのは下で別に試す）
  if (await B.evalJs('DocVisualizer.mode()') === '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '2d'`); }
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
  // R2 の直し：開いている箱をもう1回押すと閉じる。ほかの箱なら切りかわる
  await clickAt('#dg0 .item[aria-label="受付"] .box');
  const t1 = await waitFor(`!document.getElementById('panel').hidden`);
  await clickAt('#dg0 .item[aria-label="受付"] .box');
  const t2 = await waitFor(`document.getElementById('panel').hidden && document.querySelectorAll('#dg0 .item.sel').length === 0`);
  ok('同じ箱をもう1回押すと説明を閉じる（選びもはずす）', t1 && t2);
  // R6：ポップアップ。押した箱の近く・画面の中・押した箱を隠さない。窓の外を押すと閉じる。キーボードでも開け閉めできる
  await clickAt('#dg0 .item[aria-label="受付"] .box');
  await waitFor(`!document.getElementById('panel').hidden`);
  const pos = await B.evalJs(`(() => { const p = document.getElementById('panel').getBoundingClientRect(), b = document.querySelector('#dg0 .item[aria-label="受付"] .box').getBoundingClientRect();
    const hit = !(p.right <= b.left || p.left >= b.right || p.bottom <= b.top || p.top >= b.bottom), dist = Math.max(0, p.top - b.bottom, b.top - p.bottom, p.left - b.right, b.left - p.right);
    return { inView: p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight, hit, dist: Math.round(dist) }; })()`);
  ok('ポップアップ：押した箱の近く（40px 以内）・画面の中・押した箱を隠さない', pos.inView && !pos.hit && pos.dist <= 40, JSON.stringify(pos));
  for (const type of ['mousePressed', 'mouseReleased']) await B.send('Input.dispatchMouseEvent', { type, x: 20, y: 880, button: 'left', clickCount: 1 });
  ok('ポップアップ：窓の外を押すと閉じる', await waitFor(`document.getElementById('panel').hidden`));
  await B.evalJs(`document.querySelector('#dg0 .item[aria-label="確認"]').focus()`);
  await keyPress('Enter', 'Enter', 13);
  const kb = await waitFor(`!document.getElementById('panel').hidden && document.activeElement && document.activeElement.id`);
  await keyPress('Escape', 'Escape', 27);
  const back = await waitFor(`document.getElementById('panel').hidden && document.activeElement && document.activeElement.getAttribute('aria-label')`);
  ok('ポップアップ：キーボード（Enter）で開き、×に動く。Esc で閉じて箱に戻る', kb === 'panelClose' && back === '確認', kb + ' → ' + back);
  // 画面の右下の端の箱でも、窓は画面の中に入る
  await B.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 520, deviceScaleFactor: DSF, mobile: false }); await sleep(300);
  await B.evalJs(`document.querySelector('#dg0 .item[aria-label="発送"]').scrollIntoView({ block: 'end', inline: 'end' })`); await sleep(200);
  await clickAt('#dg0 .item[aria-label="発送"] .box');
  const edge = await waitFor(`!document.getElementById('panel').hidden && (() => { const p = document.getElementById('panel').getBoundingClientRect(); return { l: Math.round(p.left), t: Math.round(p.top), r: Math.round(innerWidth - p.right), b: Math.round(innerHeight - p.bottom) }; })()`);
  ok('ポップアップ：小さい窓の端の箱でも、画面の中に出る', edge && edge.l >= 0 && edge.t >= 0 && edge.r >= 0 && edge.b >= 0, JSON.stringify(edge));
  const cov = await B.evalJs(`(() => { const p = document.getElementById('panel').getBoundingClientRect(), b = document.querySelector('#dg0 .item[aria-label="発送"] .box').getBoundingClientRect(), bar = document.querySelector('header.bar').getBoundingClientRect();
    return { hit: !(p.right <= b.left || p.left >= b.right || p.bottom <= b.top || p.top >= b.bottom), overBar: p.top < bar.bottom, scroll: document.getElementById('panel').scrollHeight > document.getElementById('panel').clientHeight + 1 }; })()`);
  ok('ポップアップ：小さい窓でも、押した箱と上の帯に重ねない（入らなければ中をスクロール）', !cov.hit && !cov.overBar, JSON.stringify(cov));
  await keyPress('Escape', 'Escape', 27);
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: DSF, mobile: false }); await sleep(300);

  // 文字の大きさ
  const before = await B.evalJs(`document.querySelector('#dg0 .item text').getAttribute('font-size')`);
  await clickAt('.fs[data-fs="18"]');
  const after = await waitFor(`document.querySelector('#dg0 .item text').getAttribute('font-size') === '18' && '18'`);
  ok('文字の大きさ「大」で図の文字も大きくなる', before === '15' && after === '18', before + ' → ' + after);
  await clickAt('.fs[data-fs="15"]');
}

// ---------- 3D（WebGL あり） ----------
// 絵が真っ黒・真っ白でないか：明るさのばらつきと、色のついた点の割合で見る
const pixelCheck = src => `(async () => {
  const img = ${src};
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0, dark = 0, colored = 0, sum = 0, sum2 = 0, hash = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; n++; sum += l; sum2 += l * l; if (l < 20) dark++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) colored++; hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000000007; }
  const mean = sum / n;
  return { w: c.width, h: c.height, darkRatio: dark / n, colored: colored / n, sd: Math.sqrt(sum2 / n - mean * mean), hash };
})()`;
const notBlack = p => p && p.w > 100 && p.darkRatio < 0.5 && p.sd > 8;
{
  await pick(join(root, 'samples', '08_copilot_wrapped.md'));
  await waitFor(`document.getElementById('status').textContent.includes('08_copilot')`);
  if (await B.evalJs('DocVisualizer.mode()') !== '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`); }
  await sleep(600);
  const st3 = await B.evalJs(`({ canv: document.querySelectorAll('#diagrams .view3d canvas').length, shown: Array.from(document.querySelectorAll('#diagrams .view3d')).filter(v => v.offsetHeight > 100).length, svgHidden: Array.from(document.querySelectorAll('#diagrams .svg-wrap')).every(w => getComputedStyle(w).visibility === 'hidden'), btn: document.getElementById('mode').textContent, note: document.getElementById('glnote').hidden, caps: document.querySelectorAll('#print img.p-3d').length })`);
  ok('3D：7種類すべてを 3D で描く（図ごとに 3D の画面）', st3.canv === 7 && st3.shown === 7 && st3.svgHidden && st3.btn === '2D にする' && st3.note, JSON.stringify(st3));
  const shots = [];
  for (let i = 0; i < 7; i++) shots.push(await B.evalJs(pixelCheck(`document.querySelector('#dg${i} .view3d canvas')`)).catch(e => ({ err: e.message })));
  // 画面の外の図は描かれないので、見える所まで動かしてから見る
  for (let i = 0; i < 7; i++) if (!notBlack(shots[i])) { await B.evalJs(`document.getElementById('dg${i}').scrollIntoView()`); await sleep(400); shots[i] = await B.evalJs(pixelCheck(`document.querySelector('#dg${i} .view3d canvas')`)); }
  ok('3D：画面の絵が真っ黒でない（7つ）', shots.every(notBlack), shots.map(p => p.err ? p.err : `暗${(p.darkRatio * 100).toFixed(0)}%・色${(p.colored * 100).toFixed(0)}%`).join(' / '));
  const caps = [];
  for (let i = 0; i < 7; i++) caps.push(await B.evalJs(pixelCheck(`await (async () => { const im = new Image(); im.src = document.querySelectorAll('#print img.p-3d')[${i}].src; await im.decode(); return im; })()`)));
  ok('3D：PDF 用に撮った絵が真っ黒でない（7枚・1200×675）', caps.every(p => notBlack(p) && p.w === 1200 && p.h === 675), caps.map(p => `${p.w}×${p.h}・暗${(p.darkRatio * 100).toFixed(0)}%`).join(' / '));
  await B.evalJs(`window.scrollTo(0, 0)`);
  await sleep(300);
  await shot('3d_08_top');

  // R2 の直し：はじめは全体が入る（どの箱の真ん中も 3D の画面の中）
  const inView = await B.evalJs(`Array.from(document.querySelectorAll('#diagrams .diagram-box')).map((b, d) => { const c = b.querySelector('.view3d canvas').getBoundingClientRect(); let n = 0, outN = 0;
    for (let i = 0; ; i++) { const p = DocVisualizer.where3d(d, i); if (!p) break; n++; if (p.x < c.left || p.x > c.right || p.y < c.top || p.y > c.bottom) outN++; } return n + '/' + outN; })`);
  ok('3D：はじめは全体が入る（7つの図とも、箱がみな画面の中）', inView.length === 7 && inView.every(v => v.endsWith('/0') && !v.startsWith('0/')), inView.join(' '));
  // 3D の箱を押すと説明が出る（本物のマウスで押す。押す場所は箱の真ん中が見える所）
  await B.evalJs(`document.getElementById('dg0').scrollIntoView({ block: 'center' })`);
  await sleep(500);
  const at = await B.evalJs(`DocVisualizer.where3d(0, 0)`);
  for (const type of ['mousePressed', 'mouseReleased']) await B.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  const pp = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').innerText`);
  ok('3D：箱を押すと説明と出どころが出る', pp && pp.includes('受付') && pp.includes('受付の見直し案'), (pp || '').replace(/\n/g, ' ').slice(0, 60));
  await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // ドラッグで回すと絵が変わる。2回押すと元の向き
  const h1 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  const c0 = await B.evalJs(`(() => { const b = document.querySelector('#dg0 .view3d canvas').getBoundingClientRect(); return { x: b.left + 40, y: b.top + 40 }; })()`);
  await B.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c0.x, y: c0.y, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 6; k++) await B.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c0.x + k * 25, y: c0.y + k * 8, button: 'left', buttons: 1 });
  await B.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c0.x + 150, y: c0.y + 48, button: 'left', clickCount: 1 });
  await sleep(200);
  const h2 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  ok('3D：ドラッグで回せる（絵が変わる）', h1 !== h2);

  // 3D ⇄ 2D
  await clickAt('#mode');
  const s2 = await waitFor(`DocVisualizer.mode() === '2d' && ({ svg: Array.from(document.querySelectorAll('#diagrams .svg-wrap')).every(w => getComputedStyle(w).visibility === 'visible' && w.offsetHeight > 50), v3: Array.from(document.querySelectorAll('#diagrams .view3d')).every(v => v.offsetHeight === 0), btn: document.getElementById('mode').textContent })`);
  ok('3D⇄2D：2D にすると平らな図だけが出る', s2 && s2.svg && s2.v3 && s2.btn === '3D にする', JSON.stringify(s2));
  await clickAt('#mode');
  ok('3D⇄2D：もう一度押すと 3D に戻る', await waitFor(`DocVisualizer.mode() === '3d' && document.querySelector('#dg0 .view3d').offsetHeight > 100`));

  // 発表（P で始め、→ で次、← で前、Esc で終わる）
  const key = async (k, code, vk) => { await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  await B.evalJs('document.activeElement && document.activeElement.blur()');
  await key('p', 'KeyP', 80);
  const pr1 = await waitFor(`!document.getElementById('present').hidden && document.getElementById('pCount').textContent`);
  await key('ArrowRight', 'ArrowRight', 39);
  await sleep(1300);
  const cap1 = await B.evalJs(`document.getElementById('pCaption').innerText`);
  const pc = await B.evalJs(pixelCheck(`document.querySelector('#pStage canvas')`)).catch(e => ({ err: e.message }));
  await shot('3d_present', false);   // 発表は画面に固定なので、見えている所だけ撮る
  await key('ArrowRight', 'ArrowRight', 39);
  const cap2 = await B.evalJs(`document.getElementById('pCaption').innerText`);
  await key('ArrowLeft', 'ArrowLeft', 37);
  const cap3 = await B.evalJs(`document.getElementById('pCaption').innerText`);
  ok('発表：P で始まる（全部の歩みの数が出る）', pr1 && /^1 \/ \d+/.test(pr1), pr1);
  ok('発表：→ で次の箱、← で前に戻る。説明が大きく出る', cap1.includes('受付') && cap1.includes('電話・メール・対面') && !cap2.includes('電話・メール・対面') && cap3 === cap1, [cap1, cap2, cap3].map(c => c.split('\n')[1]).join(' → '));
  ok('発表：3D の絵が出ている（真っ黒でない）', notBlack(pc), JSON.stringify(pc).slice(0, 80));
  await key('Escape', 'Escape', 27);
  ok('発表：Esc で終わる', await waitFor(`document.getElementById('present').hidden`));
  // 2D で発表
  await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '2d'`);
  await B.evalJs('document.activeElement && document.activeElement.blur()');
  await key('p', 'KeyP', 80); await key('ArrowRight', 'ArrowRight', 39);
  const p2d = await waitFor(`!document.getElementById('present').hidden && ({ svg: document.querySelectorAll('#pStage svg').length, sel: document.querySelectorAll('#pStage .item.sel').length, dim: document.querySelectorAll('#pStage .item.dim').length })`);
  ok('発表（2D）：その箱を目立たせ、ほかを薄くする', p2d && p2d.svg === 1 && p2d.sel === 1 && p2d.dim >= 1, JSON.stringify(p2d));
  // R2 の直し：発表に社外秘の印。2D の図は枠いっぱい（文字は 11px 以上）
  // 下の画面のスクロールバーが消えると、枠は次の描画で広がり ResizeObserver が合わせ直す。それを待ってから測る
  await sleep(250);
  const pf = await B.evalJs(`(() => { const st = document.getElementById('pStage'), s = st.querySelector('svg'), b = s.getBoundingClientRect(), k = b.width / +s.getAttribute('data-w');
    const mf = Math.min(...Array.from(s.querySelectorAll('text')).map(t => +t.getAttribute('font-size')));
    return { secret: document.getElementById('pSecret').hidden ? '' : document.getElementById('pSecret').textContent, w: Math.round(b.width), h: Math.round(b.height), cw: st.clientWidth - 32, ch: st.clientHeight - 32, minPx: +(mf * k).toFixed(1) }; })()`);
  ok('発表：社外秘の印が出る', pf.secret === '関係者限り', pf.secret);
  ok('発表（2D）：図を枠いっぱいに合わせる（文字は 11px 以上）', (Math.abs(pf.w - pf.cw) <= 2 || Math.abs(pf.h - pf.ch) <= 2) && pf.minPx >= 10.95, JSON.stringify(pf));
  // 枠の大きさが窓の resize なしで変わっても合わせ直す（下の画面のスクロールバーが出る・消える）。細い窓でも合う
  const fill = () => B.evalJs(`(() => { const st = document.getElementById('pStage'), b = st.querySelector('svg').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), cw: st.clientWidth - 32, ch: st.clientHeight - 32 }; })()`);
  const fits = f => Math.abs(f.w - f.cw) <= 2 || Math.abs(f.h - f.ch) <= 2;
  const fl = [];
  for (const v of ['scroll', 'hidden']) { await B.evalJs(`document.documentElement.style.overflowY = '${v}'`); await sleep(250); fl.push(await fill()); }
  await B.evalJs(`document.documentElement.style.overflowY = ''`);
  await B.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: DSF, mobile: false }); await sleep(250); fl.push(await fill());
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: DSF, mobile: false }); await sleep(250); fl.push(await fill());
  ok('発表（2D）：スクロールバーが出る・消える・窓を細くする・戻すのどれでも枠いっぱい', fl.every(fits), JSON.stringify(fl));
  await key('Escape', 'Escape', 27);
  await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`);
  // F5 では始まらない（読みこみ直しのキーは使わない）：P 以外のキーで発表が開かない
  await key('F5', 'F5', 116).catch(() => {});
  ok('発表：F5 では始めない', await B.evalJs(`document.getElementById('present').hidden`));

  // 選び直しても 3D の部品が増え続けない（3回読ませて、形と絵の数が同じ）
  const mem = [];
  for (let k = 0; k < 3; k++) {
    await pick(join(root, 'samples', k % 2 ? '01_flow.md' : '08_copilot_wrapped.md'));
    await waitFor(`document.getElementById('status').textContent.includes('${k % 2 ? '01_flow' : '08_copilot'}')`);
    await sleep(300);
    mem.push(await B.evalJs('JSON.stringify(DocScene.stats())'));
  }
  ok('選び直し：3D の部品を片づける（3回目の数＝1回目の数）', mem[0] === mem[2] && (await B.evalJs(`document.querySelectorAll('.view3d canvas').length`)) === 7, mem.join(' → '));

  // 動きを減らす設定：止まった絵になる
  await B.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await B.send('Page.reload', {});
  await waitFor('document.readyState === "complete" && !!window.DocVisualizer');
  await pick(join(root, 'samples', '01_flow.md'));
  await waitFor(`document.getElementById('status').textContent.includes('01_flow')`);
  await sleep(500);
  const r1 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  await sleep(1200);
  const r2 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  ok('動きを減らす設定（prefers-reduced-motion）なら 3D は止まった絵', r1 === r2 && await B.evalJs('DocScene.reduced'));
  // 空に戻すと OS の設定に従う。CI の Windows・Mac は「動きを減らす」が入っているので、はっきり no-preference にする
  await B.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await B.send('Page.reload', {});
  await waitFor('document.readyState === "complete" && !!window.DocVisualizer');
  await pick(join(root, 'samples', '01_flow.md'));
  await waitFor(`document.getElementById('status').textContent.includes('01_flow')`);
  await sleep(300);
  const m1 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  await sleep(1200);
  const m2 = (await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`))).hash;
  ok('ふだんは 3D がゆっくり動く（光が流れる）', m1 !== m2);
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
  // Windows のクリップボードは改行を CRLF にして返す
  if (clip != null) clip = clip.replace(/\r\n/g, '\n');
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
  ok('PDF：ページの数（表紙＋図7つ＋3D の絵7つ＋説明）', doc.numPages === pages && pages >= 16, `PDF ${doc.numPages} ページ・画面の印刷用 ${pages}`);
  ok('PDF：A4 横', landscape);
  {
    let imgPages = 0;
    for (let i = 1; i <= doc.numPages; i++) { const ops = await (await doc.getPage(i)).getOperatorList(); if (ops.fnArray.includes(pdfjs.OPS.paintImageXObject)) imgPages++; }
    ok('PDF：3D の絵のページが図ごとにある（絵が入っている）', imgPages === 7 && texts.filter(t => t.includes('(3D)')).length === 7, `絵のあるページ ${imgPages}`);
  }
  ok('PDF：日本語が文字として入っている（題名・ひとことで）', texts[0].includes('新しい受付のしくみ(架空の例・Copilotの出し方)') && texts[0].includes('受付を1つの窓口にまとめ'), texts[0].slice(0, 40));
  ok('PDF：全ページに社外秘の印とページ番号', texts.every((t, i) => t.includes('関係者限り') && t.includes(`${i + 1}/${doc.numPages}`)), texts.map((t, i) => t.includes('関係者限り') && t.includes(`${i + 1}/${doc.numPages}`) ? '○' : '×').join(''));
  ok('PDF：図のページに箱の名前、最後に説明と出どころ', texts[1].includes('振り分け') && texts[texts.length - 1].includes('受付の見直し案'), texts[texts.length - 1].slice(0, 40));
  // 色が消えないか：印刷の見た目で絵を撮る
  await B.send('Emulation.setEmulatedMedia', { media: 'print' });
  await shot('08_print_media');
  await B.send('Emulation.setEmulatedMedia', { media: '' });
}

// R2 の直し：矢印の頭の id が重ならない（印刷・発表に写しても）。どの url(#…) も同じ svg の中の印を指す
{
  const idc = await B.evalJs(`(() => { const ids = Array.from(document.querySelectorAll('[id]')).map(e => e.id), dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    let refs = 0, bad = 0; document.querySelectorAll('svg [marker-end], svg [fill^="url("], svg [clip-path], svg use').forEach(e => { ['marker-end', 'fill', 'clip-path', 'href'].forEach(a => { const v = e.getAttribute(a); const m = v && /#([^)"]+)/.exec(v); if (!m) return; refs++; const t = e.ownerSVGElement && e.ownerSVGElement.querySelector('[id="' + m[1] + '"]'); if (!t) bad++; }); });
    return { dup: dup.length, refs, bad, printArrows: document.querySelectorAll('#print svg [marker-end]').length }; })()`);
  ok('矢印の頭：id が重ならず、印刷用の図の矢印は自分の svg の印を指す', idc.dup === 0 && idc.bad === 0 && idc.printArrows > 0, JSON.stringify(idc));
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
  // PowerPoint も同じ中身：長い説明はスライドを分け、本文のスライドもある
  const { st: lp, rd: lr } = await savePptx(B, long, 'long');
  const lt = lr ? lr.slides.map(x => x.texts.join('\n')).join('\n') : '';
  ok('PowerPoint：長い説明はスライドを分け、本文も「本文」のスライドで入る（PDF と同じ中身）', lr && Array.from({ length: 12 }, (_, i) => `${i + 1}段落目`).every(k => lt.includes(k)) && lt.includes('長い資料 9ページ') && lt.includes('本文のさいごの行です') && lr.slides.some(x => x.texts[0] === '本文') && lr.slides.some(x => /（つづき）$/.test(x.texts[0])) && lr.slides.every(x => x.minPt >= 11), lp && JSON.stringify({ slides: lp.slides, body: lp.bodySlides }));
}

// R1 の直し：戻る矢印が2本の担当ごとの流れ。言葉が重ならず、線が帯の外に出ない
{
  const p = join(tmpdir(), 'docvis-lanes-back.md');
  writeFileSync(p, '# 戻り\n```lanes 戻りのある流れ\n[営業] 受付 -> [営業] 確認\n[営業] 確認 -> [経理] 審査\n[経理] 審査 -> [経理] 承認\n[経理] 審査 -> [営業] 確認 : 差し戻し\n[経理] 承認 -> [営業] 受付 : やり直し\n```\n');
  await pick(p);
  await waitFor(`document.getElementById('status').textContent.includes('docvis-lanes-back.md')`);
  const g = await B.evalJs(`(() => { const s = document.querySelector('#dg0 .svg-wrap svg');
    const bands = Array.from(s.querySelectorAll('.lane > rect:first-child')).map(r => r.getBBox()), top = Math.min(...bands.map(b => b.y)), bot = Math.max(...bands.map(b => b.y + b.height));
    const labels = Array.from(s.querySelectorAll('.edge-label rect')).map(r => r.getBBox());
    let overlap = 0; for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const a = labels[i], b = labels[j]; if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlap++; }
    const outE = Array.from(s.querySelectorAll('path.edge')).filter(e => { const b = e.getBBox(); return b.y < top - 0.5 || b.y + b.height > bot + 0.5; }).length;
    const outL = labels.filter(b => b.y < top || b.y + b.height > bot).length;
    return { labels: labels.length, overlap, outE, outL }; })()`);
  ok('担当ごとの流れ：戻る矢印2本の言葉が重ならず、線と言葉が帯の中', g.labels === 2 && g.overlap === 0 && g.outE === 0 && g.outL === 0, JSON.stringify(g));
}

// R1 の直し：15 段の流れでも、文字は 11px を下まわらない（画面の 2D は横へ動かす・3D は画面を広げる・PDF はページを分ける）
{
  await pick(join(root, 'test', 'fixtures', 'flow15.md'));
  await waitFor(`document.getElementById('status').textContent.includes('flow15.md') && DocVisualizer.text3d(0) != null`);
  const minPx = sel => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).map(s => { const k = s.getBoundingClientRect().width / s.viewBox.baseVal.width; return Math.min(...Array.from(s.querySelectorAll('text')).map(t => +t.getAttribute('font-size'))) * k; })`;
  const was3d = await B.evalJs(`DocVisualizer.mode() === '3d'`);
  if (was3d) { await B.evalJs(`document.getElementById('mode').click()`); await sleep(300); }
  const s2 = await B.evalJs(`({ px: ${minPx('#diagrams .svg-wrap svg')}, wide: document.querySelector('#dg0 .svg-wrap').classList.contains('wide'), scroll: (w => w.scrollWidth > w.clientWidth)(document.querySelector('#dg0 .svg-wrap')) })`);
  ok('文字 11px：画面の 2D（15 段の流れ）は縮めすぎず、横へ動かして見る', s2.px.every(v => v >= 10.95) && s2.wide && s2.scroll, JSON.stringify(s2));
  if (was3d) { await B.evalJs(`document.getElementById('mode').click()`); await sleep(300); }
  const pr = await B.evalJs(`(() => { const p = document.getElementById('print'); p.style.display = 'block'; const px = ${minPx('#print .p-fig svg')}; const hs = Array.from(p.querySelectorAll('h2')).map(h => h.textContent); p.style.display = ''; return { px, split: hs.filter(h => /（\\d+\\/\\d+）/.test(h)).length }; })()`);
  ok('文字 11px：PDF の図（15 段の流れ）はページを分ける（1/2・2/2）', pr.px.length >= 2 && pr.px.every(v => v >= 10.95) && pr.split >= 2, JSON.stringify(pr));
  if (!was3d) { await B.evalJs(`document.getElementById('mode').click()`); await sleep(300); }
  const t3 = [await B.evalJs(`DocVisualizer.text3d(0)`)];
  for (const f of ['03_timeline.md', '08_copilot_wrapped.md']) {
    await pick(join(root, 'samples', f));
    await waitFor(`document.getElementById('status').textContent.includes(${JSON.stringify(f)}) && DocVisualizer.text3d(0) != null`);
    t3.push(...await B.evalJs(`Array.from(document.querySelectorAll('#diagrams .diagram-box')).map((b, i) => DocVisualizer.text3d(i))`));
  }
  ok('文字 11px：3D（15 段の流れ・日程・08 の図7つ）は、いちばん小さい文字が 11px 以上に見える', t3.length === 9 && t3.every(v => v >= 10.95), t3.join(' / '));
}

// ---------- PowerPoint（R3）：ダウンロードで保存 → python-pptx で読み返す ----------
async function savePptx(T, md, tag) {
  const dlDir = join(out, 'dl');
  rmSync(dlDir, { recursive: true, force: true }); mkdirSync(dlDir, { recursive: true });
  const done = [];
  T.on(m => { if (m.method === 'Browser.downloadProgress' && m.params.state !== 'inProgress') done.push(m.params.state); });
  await T.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true });
  const { root: d0 } = await T.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await T.send('DOM.querySelector', { nodeId: d0.nodeId, selector: '#file' });
  await T.send('DOM.setFileInputFiles', { nodeId, files: [md] });
  const name = md.split(/[\\/]/).pop();
  for (let t = 0; t < 80; t++) { if (await T.evalJs(`document.getElementById('status').textContent.includes(${JSON.stringify(name)}) && !document.getElementById('pptx').disabled`).catch(() => false)) break; await sleep(100); }
  await T.evalJs(`document.getElementById('pptx').click()`);
  let st = null;
  for (let t = 0; t < 300 && !(st && done.length); t++) { st = st || await T.evalJs('DocVisualizer.pptx()').catch(() => null); await sleep(100); }
  const files = existsSync(dlDir) ? readdirSync(dlDir).filter(f => f.endsWith('.pptx')) : [];
  let rd = null;
  if (files.length) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    const r = spawnSync(py, [join(root, 'test', 'pptx_check.py'), join(dlDir, files[0])], { encoding: 'utf8' });
    if (r.status === 0) rd = JSON.parse(r.stdout); else console.log('   python-pptx で読めない（pip install --user python-pptx）：' + (r.stderr || r.error || '').toString().slice(0, 200));
    try { writeFileSync(join(out, tag + '.pptx'), readFileSync(join(dlDir, files[0]))); } catch {}
  }
  return { st, done, files, rd };
}
{
  const { st, done, files, rd } = await savePptx(B, join(root, 'samples', '08_copilot_wrapped.md'), '08_copilot_wrapped');
  writeFileSync(join(out, '08_pptx.json'), JSON.stringify(rd, null, 1));
  ok('PowerPoint：ダウンロードで保存できる（名前は <題名>.pptx）', done.includes('completed') && files[0] === '新しい受付のしくみ（架空の例・Copilot の出し方）.pptx', JSON.stringify({ done, files, st }));
  const S = rd ? rd.slides : [];
  ok('PowerPoint：16:9・枚数（表紙＋図7つ＋3D の絵7つ＋箱の説明2つ＝17）', rd && rd.w === 13.333 && rd.h === 7.5 && S.length === 17 && st && st.slides === 17, rd && `${rd.w}×${rd.h}・${S.length} 枚`);
  ok('PowerPoint：表紙に題名・ひとことで・結論・すること', S[0] && ['新しい受付のしくみ', 'ひとことで', '結論', 'すること', '受付を1つの窓口にまとめ'].every(k => S[0].texts.join('\n').includes(k)), S[0] && S[0].texts.join(' / ').slice(0, 120));
  const dg = [1, 3, 5, 7, 9, 11, 13].map(i => S[i] || { texts: [] }); // 読み返せないときも止まらずに × を出す
  ok('PowerPoint：図7つ（流れ・担当・日程・木・グラフ・数字・比べる）は直せる図形と文字（絵ではない）', dg.every(x => x.pics === 0 && x.geo >= 3 && x.texts.length >= 4) && dg[0].cust >= 4 && dg[0].arrows >= 4, dg.map(x => `図形${x.geo}・線${x.cust}・矢印${x.arrows}・文字${x.texts && x.texts.length}`).join(' | '));
  ok('PowerPoint：図の箱の名前が文字で入る（受付・振り分け・説明会・410・85%・1つにまとめる）', dg[0].texts.includes('振り分け') && dg[2].texts.includes('説明会') && dg[4].texts.includes('410') && dg[5].texts.includes('85%') && dg[6].texts.includes('1つにまとめる'));
  ok('PowerPoint：3D の絵が図ごとに1枚', [2, 4, 6, 8, 10, 12, 14].every(i => S[i] && S[i].pics === 1 && S[i].texts[0].endsWith('（3D）')), S.map(x => x.pics).join(''));
  ok('PowerPoint：箱の説明は1つずつ、出どころは下に', S[15] && S[15].texts[0] === '受付' && S[15].texts.some(t => t.startsWith('出どころ：受付の見直し案')) && S[16] && S[16].texts[0] === '振り分け', S.slice(15).map(x => x.texts.slice(0, 3).join(' / ')).join(' | '));
  ok('PowerPoint：全スライドに社外秘の印とページ番号', S.length && S.every((x, i) => x.secret && x.texts.includes('関係者限り') && x.texts.includes(`${i + 1} / ${S.length}`)), S.map(x => x.secret ? '○' : '×').join(''));
  ok('PowerPoint：字体は Yu Gothic UI・文字は 11pt 以上', S.length && S.every(x => x.fonts.join() === 'Yu Gothic UI' && x.minPt >= 11), S.map(x => x.minPt).join(' '));
}
{
  const { rd } = await savePptx(B, join(root, 'test', 'fixtures', 'flow15.md'), 'flow15');
  const S = rd ? rd.slides : [];
  ok('PowerPoint：大きな図（15 段の流れ）はスライドを分け、文字は 11pt 以上', S.filter(x => /（[12]\/2）$/.test(x.texts[0] || '')).length === 2 && S.every(x => x.minPt >= 11), S.map(x => (x.texts[0] || '') + ' ' + x.minPt).join(' | '));
}
// R7：フローチャート。上から下・はい は左・いいえ は右・戻る矢印は右を回る。3D・ポップアップ・PowerPoint の形
{
  await pick(join(root, 'samples', '12_flowchart.md'));
  await waitFor(`document.getElementById('status').textContent.includes('12_flowchart')`);
  const mode0 = await B.evalJs('DocVisualizer.mode()');
  if (mode0 !== '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`); }
  await B.evalJs(`document.getElementById('dg0').scrollIntoView()`); await sleep(400);
  const g3 = await B.evalJs(pixelCheck(`document.querySelector('#dg0 .view3d canvas')`)).catch(e => ({ err: e.message }));
  ok('3D：フローチャートを 3D で描く（真っ黒でない）', notBlack(g3), g3.err || `暗${(g3.darkRatio * 100).toFixed(0)}%`);
  await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '2d'`);
  const lay = await B.evalJs(`(() => { const s = document.querySelector('#dg0 svg'), bb = n => s.querySelector('.item[aria-label="' + n + '"] .box').getBBox();
    const st = bb('開始'), q = bb('在庫ある?'), y = bb('出荷する'), n = bb('発注する'), w = bb('入荷を待つ');
    const right = Math.max(...Array.from(s.querySelectorAll('.item .box')).map(e => { const b = e.getBBox(); return b.x + b.width; }));
    const back = Array.from(s.querySelectorAll('path.edge')).map(p => p.getBBox()).some(b => b.x + b.width > right + 5);
    const minF = Math.min(...Array.from(s.querySelectorAll('text')).map(t => +t.getAttribute('font-size')));
    const shapes = Array.from(s.querySelectorAll('.item .box')).map(e => e.getAttribute('data-shape')).join();
    return { down: st.y < q.y && q.y < y.y && y.y < w.y, yesLeft: y.x + y.width / 2 < q.x + q.width / 2, noRight: n.x + n.width / 2 > q.x + q.width / 2, back, minF, shapes }; })()`);
  ok('2D：フローチャートは上から下・はい は左・いいえ は右・戻る矢印は箱の右を回る・文字 11px 以上', lay.down && lay.yesLeft && lay.noRight && lay.back && lay.minF >= 11, JSON.stringify(lay));
  await clickAt('#dg0 .item[aria-label="在庫ある?"] .box');
  const fp = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').innerText`);
  ok('フローチャートの箱を押すと、形と前・次が出る', fp && fp.includes('形：判断') && fp.includes('次：出荷する（はい）・発注する（いいえ）'), (fp || '').replace(/\n/g, ' ').slice(0, 90));
  await keyPress('Escape', 'Escape', 27);
  if (mode0 === '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`); }
  const { rd } = await savePptx(B, join(root, 'samples', '12_flowchart.md'), '12_flowchart');
  const AU = rd ? rd.slides.flatMap(x => x.auto || []) : [];
  const want = ['FLOWCHART_TERMINATOR', 'FLOWCHART_DATA', 'FLOWCHART_DECISION', 'FLOWCHART_PROCESS', 'FLOWCHART_PREDEFINED_PROCESS'];
  ok('PowerPoint：フローチャートは直せる形（端・入出力・ひし形・処理・二重線の四角）・文字 11pt 以上', want.every(w => AU.includes(w)) && AU.filter(a => a.startsWith('FLOWCHART')).length === 7 && rd.slides.every(x => x.minPt >= 11), AU.filter(a => a.startsWith('FLOWCHART')).join(' '));
}
// R6：グラフ5種類。3D で描く・押すと値と割合・PowerPoint はグラフ（あとで数字を直せる）
{
  await pick(join(root, 'samples', '11_graphs.md'));
  await waitFor(`document.getElementById('status').textContent.includes('11_graphs')`);
  const mode0 = await B.evalJs('DocVisualizer.mode()');
  if (mode0 !== '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`); }
  const gs = [];
  for (let i = 0; i < 5; i++) { await B.evalJs(`document.getElementById('dg${i}').scrollIntoView()`); await sleep(400); gs.push(await B.evalJs(pixelCheck(`document.querySelector('#dg${i} .view3d canvas')`)).catch(e => ({ err: e.message }))); }
  ok('3D：グラフ5種類を 3D で描く（真っ黒でない）', gs.every(notBlack), gs.map(p => p.err ? p.err : `暗${(p.darkRatio * 100).toFixed(0)}%・色${(p.colored * 100).toFixed(0)}%`).join(' / '));
  // 3D で、どの扇・点・段も押せる（ドーナツの穴に当たらない）
  const miss = [], GD = P.parseDoc(readFileSync(join(root, 'samples', '11_graphs.md'), 'utf8')).diagrams;
  for (const [di, n] of GD.map((g, k) => [k, g.items.length])) {
    await B.evalJs(`document.getElementById('dg${di}').scrollIntoView({ block: 'center' })`); await sleep(300);
    for (let i = 0; i < n; i++) {
      const pt = await B.evalJs(`DocVisualizer.where3d(${di}, ${i})`).catch(() => null);
      if (!pt) { miss.push(di + ':' + i + '?'); continue; }
      for (const type of ['mousePressed', 'mouseReleased']) await B.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      const okp = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').querySelector('h2').textContent === ${JSON.stringify(GD[di].items[i].label)}`, 1500);
      if (!okp) miss.push(di + ':' + i);
      await keyPress('Escape', 'Escape', 27);
    }
  }
  ok('3D：グラフ5種類のどの扇・点・段も押すと開く', miss.length === 0, miss.join(' ') || '22 個');
  await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '2d'`);
  await clickAt('#dg0 .item[aria-label="電話"] .box');
  const pp = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').innerText`);
  ok('グラフの扇を押すと、値と割合が出る', pp && pp.includes('420') && pp.includes('割合：38.9%'), (pp || '').replace(/\n/g, ' ').slice(0, 80));
  await keyPress('Escape', 'Escape', 27);
  await clickAt('#dg2 .item[aria-label="7月"] .box');
  const lp = await waitFor(`!document.getElementById('panel').hidden && document.getElementById('panelBody').innerText`);
  ok('折れ線の点を押すと、系列ごとの値が出る（欠けは －）', lp && lp.includes('受付：140件') && lp.includes('完了：－'), (lp || '').replace(/\n/g, ' ').slice(0, 80));
  await keyPress('Escape', 'Escape', 27);
  const fsz = await B.evalJs(`Math.min(...Array.from(document.querySelectorAll('#diagrams svg text')).map(t => +t.getAttribute('font-size')))`);
  ok('文字 11px：グラフ5種類の 2D の文字', fsz >= 11, String(fsz));
  if (mode0 === '3d') { await clickAt('#mode'); await waitFor(`DocVisualizer.mode() === '3d'`); }
  const { rd } = await savePptx(B, join(root, 'samples', '11_graphs.md'), '11_graphs');
  const CH = rd ? rd.slides.flatMap(x => x.charts || []) : [];
  ok('PowerPoint：グラフ5種類は PowerPoint のグラフ（円・ドーナツ・折れ線・横棒・積み上げ）', CH.map(c => c.type).join() === 'PIE,DOUGHNUT,LINE_MARKERS,BAR_CLUSTERED,COLUMN_STACKED', CH.map(c => c.type).join());
  ok('PowerPoint：グラフの中に Arial が残っていない（円グラフの値の字も Yu Gothic UI）', CH.length === 5 && CH.every(c => !c.arial), CH.map(c => c.arial ? '×' : '○').join(''));
  ok('PowerPoint：グラフの数字と名前が md のとおり（欠けは空）・字体は Yu Gothic UI', CH.length === 5 && CH[0].cats.join() === '電話,メール,Web フォーム,窓口' && JSON.stringify(CH[2].series) === '[["受付",[120,135,160,140,110]],["完了",[95,120,130,null,125]]]' && CH.every(c => c.font), CH.length === 5 ? JSON.stringify(CH[2].series) : '');
}
{
  const fn = await B.evalJs(`[DocPptx.fileName('a/b:c*?"<>|d'), DocPptx.fileName('CON'), DocPptx.fileName('  '), DocPptx.fileName('題名. ')]`);
  ok('PowerPoint：Windows で使えない文字は _（予約の名前・空・末尾の点も）', fn.join('|') === 'a_b_c______d.pptx|_CON.pptx|DocVisualizer.pptx|題名.pptx', fn.join(' | '));
  // 保存が止められたとき：赤い帯で理由と PDF の案内
  await B.evalJs(`window.__cou = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('ダウンロードが止められた（試験）'); }; document.getElementById('pptx').click()`);
  const band = await waitFor(`!document.getElementById('error').hidden && document.getElementById('error').textContent`, 20000);
  await B.evalJs(`URL.createObjectURL = window.__cou; document.getElementById('error').hidden = true`);
  ok('PowerPoint：保存できないときは赤い帯で理由を出し、PDF を案内する', band && band.includes('止められた') && band.includes('PDF') && (await B.evalJs(`getComputedStyle(document.getElementById('error')).backgroundColor`)) !== 'rgba(0, 0, 0, 0)', band);
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

// ---------- WebGL なし（会社の PC で止められたとき）：自動で 2D、理由を1行 ----------
{
  const N = await launch({ extra: ['--disable-3d-apis', '--disable-webgl', '--disable-gpu'] });
  const nErr = [];
  N.on(m => { if (m.method === 'Runtime.exceptionThrown') nErr.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') nErr.push('console.error'); });
  await N.send('Runtime.enable'); await N.send('Page.enable'); await N.send('DOM.enable');
  await N.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: DSF, mobile: false });
  await N.send('Page.navigate', { url });
  for (let i = 0; i < 50; i++) { if (await N.evalJs('document.readyState === "complete" && !!window.DocVisualizer').catch(() => false)) break; await sleep(100); }
  const { root: d0 } = await N.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await N.send('DOM.querySelector', { nodeId: d0.nodeId, selector: '#file' });
  await N.send('DOM.setFileInputFiles', { nodeId, files: [join(root, 'samples', '08_copilot_wrapped.md')] });
  let st = null;
  for (let t = 0; t < 50 && !st; t++) { st = await N.evalJs(`document.getElementById('status').textContent.includes('08_copilot') && ({ note: document.getElementById('glnote').hidden ? '' : document.getElementById('glnote').textContent, btn: document.getElementById('mode').disabled, canv: document.querySelectorAll('.view3d canvas').length, svg: Array.from(document.querySelectorAll('#diagrams .svg-wrap')).filter(w => w.offsetHeight > 50).length, pages: document.querySelectorAll('#print .page').length, imgs: document.querySelectorAll('#print img').length })`).catch(() => null); if (!st) await sleep(100); }
  ok('WebGL なし：自動で 2D にし、理由を1行出す。3D のボタンは押せない', st && /3D は使えない/.test(st.note) && st.btn && st.canv === 0 && st.svg === 7, JSON.stringify(st));
  ok('WebGL なし：PDF は 2D だけ（3D の絵のページなし）', st && st.imgs === 0 && st.pages >= 9, st && `印刷 ${st.pages} ページ`);
  await N.evalJs('document.activeElement && document.activeElement.blur()');
  await N.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80, text: 'p' });
  await N.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
  ok('WebGL なし：発表は 2D で動く', await N.evalJs(`!document.getElementById('present').hidden && document.querySelectorAll('#pStage svg').length === 1`));
  const r = await N.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, 'nogl_present.png'), Buffer.from(r.data, 'base64'));
  {
    await N.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    const { st: ps, rd } = await savePptx(N, join(root, 'samples', '08_copilot_wrapped.md'), 'nogl_08');
    ok('WebGL なし：PowerPoint は 3D の絵なしで作れる（10 枚）', ps && ps.pics === 0 && rd && rd.slides.length === 10 && rd.slides.every(x => x.pics === 0), JSON.stringify(ps));
  }
  ok('WebGL なし：エラーが 0 件', nErr.length === 0, nErr.slice(0, 2).join(' | '));
  N.close();
}

const bad = results.filter(r => !r.ok);
writeFileSync(join(out, 'result.json'), JSON.stringify({ when: new Date().toISOString(), platform: process.platform, browser: B.exe, pass: results.length - bad.length, fail: bad.length, results }, null, 2));
console.log(`\n${results.length - bad.length} ○ / ${bad.length} ×（結果：test/out/result.json）`);
process.exit(bad.length ? 1 : 0);
