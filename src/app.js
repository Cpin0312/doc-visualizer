/* DocVisualizer の画面。読みとりは DocParse、2D は DocRender。
 * 職場の資料を残さないため、localStorage などには何も保存しない。
 */
(function () {
  'use strict';
  var P = window.DocParse, R = window.DocRender, esc = R.esc;
  var SAMPLES = window.DV_SAMPLES || [], PROMPT = window.DV_PROMPT || '';
  var MAX_BYTES = 5 * 1024 * 1024;
  var MIN_PX = 11;   // 画面・PDF・3D で、図の文字をこれより小さくしない
  // 図の中でいちばん小さい文字の大きさ（SVG の単位）。縮める限りはこれで決める
  function minFont(str) { var m, re = /font-size="([\d.]+)"/g, v = Infinity; while ((m = re.exec(str))) v = Math.min(v, +m[1]); return isFinite(v) ? v : 15; }
  var OK_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
  var $ = function (id) { return document.getElementById(id); };
  var state = { doc: null, text: '', undo: [], redo: [], fileName: '', fs: 15, sel: null, meta: '', mode: '3d', scenes: [], captures: [], gl: '' };
  var D3 = window.DocScene;
  state.gl = D3 ? D3.support() : '3D の部品がない';
  if (state.gl) state.mode = '2d';

  // 試験のために「今日」を変えられる（例：DocVisualizer.html#today=2026-11-18）
  function today() {
    var m = /today=(\d{4}-\d{2}-\d{2})/.exec(location.hash);
    if (m) return m[1];
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function showError(msg) {
    var e = $('error');
    if (!msg) { e.hidden = true; e.textContent = ''; return; }
    e.textContent = msg; e.hidden = false;
  }
  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 4000);
  }

  // ---- 読みこみ ----
  function loadFile(file, handleP) {
    if (!file || !leaveOk()) return;
    showError('');
    if (!OK_EXT.test(file.name)) { showError('「' + file.name + '」は md ではないので読みませんでした（.md・.markdown・.txt を選んでください）。画面は前のままです。'); return; }
    if (file.size === 0) { showError('「' + file.name + '」は空のファイルです。画面は前のままです。'); return; }
    if (file.size > MAX_BYTES) { showError('「' + file.name + '」は大きすぎます（' + (file.size / 1048576).toFixed(1) + 'MB。5MB まで）。画面は前のままです。'); return; }
    file.arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf);
      var head = u8.subarray(0, 8192), utf16 = (u8[0] === 0xFF && u8[1] === 0xFE) || (u8[0] === 0xFE && u8[1] === 0xFF);
      if (!utf16 && Array.prototype.indexOf.call(head, 0) >= 0) { showError('「' + file.name + '」は文字のファイルではないようです。画面は前のままです。'); return; }
      var dec = P.decodeBytes(u8);
      var eol = /\r\n/.test(dec.text) ? 'CRLF' : /\r/.test(dec.text) ? 'CR' : 'LF';
      return Promise.resolve(handleP).catch(function () { return null; }).then(function (h) {
        show(dec.text, file.name, dec.encoding + '・改行 ' + eol, dec.warn, { key: dec.key, orig: u8, handle: h && h.kind === 'file' ? h : null });
      });
    }).catch(function (e) { showError('読みこめませんでした：' + (e && e.message || e)); });
  }

  function show(text, fileName, meta, decodeWarn, src) {
    var doc;
    try { doc = P.parseDoc(text); } catch (e) { showError('読みとりの途中で止まりました：' + e.message + '。画面は前のままです。'); return; }
    if (decodeWarn) doc.warnings.unshift({ line: 0, msg: decodeWarn, kind: 'fix' });
    showError('');
    state.doc = doc; state.text = String(text); state.undo = []; state.redo = []; state.fileName = fileName; state.meta = meta; state.sel = null;
    src = src || {}; state.key = src.key || null; state.orig = src.orig || null; state.handle = src.handle || null; state.sample = !!src.sample; state.saved = state.text;
    updateDirty();
    closePanel();
    render();
    window.scrollTo(0, 0);
  }

  // ---- 保存（R8c）：上書き（File System Access）か、できなければ「（編集）」つきでダウンロード ----
  function isDirty() { return !!state.doc && state.text !== state.saved; }
  function updateDirty() { $('dirty').hidden = !isDirty(); $('save').disabled = !state.doc; }
  function leaveOk() { return !isDirty() || window.confirm('保存していない直しがあります。保存せずに別の md を開きますか？'); }
  function editedName(n) { var m = /^(.*?)(\.[^.]*)?$/.exec(n || 'doc.md'); return m[1] + '（編集）' + (m[2] || '.md'); }
  function writeHandle(h, bytes) {
    var ask = h.queryPermission ? h.queryPermission({ mode: 'readwrite' }).then(function (p) { return p === 'granted' ? p : h.requestPermission({ mode: 'readwrite' }); }) : Promise.resolve('granted');
    return ask.then(function (p) {
      if (p !== 'granted') throw new Error('書きこみが許可されませんでした');
      return h.createWritable().then(function (w) { return w.write(bytes).then(function () { return w.close(); }); });
    });
  }
  var saving = false;
  function save() {
    if (!state.doc || saving) return;
    var text = state.text, key = state.key || 'utf8', r;   // 書いている間に直しても、書くのはこの写し
    if (key === 'eucjp' || key === 'unknown') {
      if (!window.confirm('この md の文字コード（' + (key === 'eucjp' ? 'EUC-JP' : '分からない') + '）では書けないので、UTF-8 で保存します。よいですか？')) return;
      key = 'utf8';
    }
    try { r = P.encodeText(text, key, state.orig); } catch (e) { showError('保存できませんでした：' + e.message + '。md は画面に残っています。'); return; }
    if (r.bad) {
      var list = r.bad.slice(0, 8).map(function (b) { return '「' + b.ch + '」（' + b.line + ' 行目）'; }).join('・') + (r.bad.length > 8 ? ' ほか ' + (r.bad.length - 8) + ' 字' : '');
      if (!window.confirm('Shift_JIS では表せない字があります：' + list + '。UTF-8 で保存しますか？（やめると保存しません）')) { showError('保存しませんでした。Shift_JIS で表せない字：' + list + '。その字を直すか、UTF-8 で保存してください。'); return; }
      key = 'utf8'; r = P.encodeText(text, key);
    }
    var bytes = r.bytes, name = state.fileName || 'doc.md';
    var done = function (how) {
      state.saved = text; state.key = key; state.orig = bytes;
      updateDirty(); showError('');
      toast(how, 6000);
    };
    var download = function (why) {
      saveBlob(new Blob([bytes], { type: 'text/markdown' }), editedName(name));
      done((why ? why + '。' : '') + '「' + editedName(name) + '」としてダウンロードしました（ダウンロードの一覧に出ないときは、会社の設定で止められています）');
    };
    if (state.sample) { download('見本は上書きしません'); return; }
    var h = state.handle;
    var pick = h ? Promise.resolve(h) : window.showSaveFilePicker ? window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'md', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] }) : null;
    if (!pick) { download('このブラウザは上書きできません'); return; }
    saving = true;
    pick.then(function (hh) {
      return writeHandle(hh, bytes).then(function () { state.handle = hh; done('「' + hh.name + '」に保存しました'); });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') { toast('保存をやめました', 2500); return; }
      download('上書きできませんでした（' + ((e && e.message) || e) + '）');
    }).then(function () { saving = false; });
  }
  window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---- 表示 ----
  function hasNoteFn(doc) {
    var keys = {};
    doc.notes.forEach(function (n) { if (n.lines.length || n.sources.length) keys[n.key] = true; });
    return function (k) { return !!keys[k]; };
  }
  function title(doc) { return doc.title || state.fileName.replace(/\.[^.]+$/, '') || '（題名なし）'; }

  function render() {
    var doc = state.doc;
    if (!doc) return;
    $('welcome').hidden = true; $('doc').hidden = false;
    $('pdf').disabled = false;
    $('pptx').disabled = !window.DocPptx || !window.PptxGenJS;
    $('presentBtn').disabled = !doc.diagrams.length;
    document.documentElement.style.setProperty('--fs', state.fs + 'px');
    $('status').textContent = '読みこみ：' + state.fileName + '（' + state.meta + '）・図 ' + doc.diagrams.length + ' つ';
    $('title').textContent = title(doc);
    document.title = title(doc) + ' － 資料を図にする';
    var sec = $('secret'); sec.hidden = !doc.secret; sec.textContent = doc.secret;
    $('cards').innerHTML = cardsHtml(doc);
    var hn = hasNoteFn(doc), td = today();
    $('diagrams').innerHTML = doc.diagrams.map(function (d, i) {
      return '<section class="diagram-box" id="dg' + i + '"><h2>' + esc(d.name || P.TYPES[d.type].label) + '<span class="kind">' + esc(P.TYPES[d.type].label) + '・' + d.items.length + '</span>' +
        (P.EDITABLE[d.type] ? '<button type="button" class="add-box" data-d="' + i + '">＋ 箱</button>' : '') +
        (P.MOVABLE[d.type] ? '<button type="button" class="reset-layout" data-d="' + i + '"' + (hasLayout(d) ? '' : ' hidden') + '>元の配置に戻す</button>' : '') + '</h2>' +
        '<div class="svg-wrap' + (P.MOVABLE[d.type] ? ' movable' : '') + '">' + R.svg(d, i, { fs: state.fs, today: td, hasNote: hn }) + '</div></section>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.svg-wrap'), fitWide);
    build3d(doc);
    renderLegend(doc);
    renderWarnings(doc);
    var bodyHtml = doc.body.map(function (s) { return (s.heading ? '<h' + Math.min(6, s.level + 1) + '>' + inline(s.heading) + '</h' + Math.min(6, s.level + 1) + '>' : '') + md(s.lines); }).join('');
    $('body').hidden = !bodyHtml; $('body').innerHTML = bodyHtml ? '<h2 class="sec">本文</h2>' + bodyHtml : '';
    $('guide').hidden = doc.diagrams.length > 0;
    if (!doc.diagrams.length) $('guide').innerHTML = '<h2>この md には図がありません</h2><p>図にしたいところを、次のように書くと図になります（Copilot には「Copilot 用の指示をコピー」の文を貼ると、この形で作ってくれます）。</p><pre>' + esc(GUIDE) + '</pre>';
    buildPrint(doc);
  }

  var GUIDE = '```flow 受注の流れ\n受付 -> 確認 -> 見積\n見積 -> 承認 : OK\n承認 !期限\n```\n\n' +
    '図の種類：flow（流れ）・lanes（担当ごとの流れ）・timeline（日程）・tree（木）・chart（数字）・kpi（大事な数字）・compare（比べる）\n' +
    '印：!期限（赤）・?確認（黄）・+完了（緑）\u3000箱の説明：「## 箱の名前」の下に書く\u3000出どころ：[元：資料名 2ページ]';

  // 縮めると文字が 11px より小さくなる図は、縮めずに横へ動かして見る
  function fitWide(w) {
    var s = w.querySelector('svg'), sw = +s.getAttribute('data-w'), cw = w.parentNode.clientWidth - 32;
    var mf = minFont(s.outerHTML);
    w.classList.remove('wide'); s.style.width = '';
    if (cw > 0 && mf * cw / sw < MIN_PX) { w.classList.add('wide'); s.style.width = Math.ceil(sw * MIN_PX / mf) + 'px'; }
  }
  function hasLayout(d) { return !!(d.layout && Object.keys(d.layout).length); }
  function svgOf(d, i) { return R.svg(d, i, { fs: state.fs, today: today(), hasNote: hasNoteFn(state.doc) }); }
  // 1つの図だけを描き直す（2D と 3D）。動かしている間は 3D を作り直さない
  function redrawDiagram(i, no3d) {
    var box = $('dg' + i), d = state.doc.diagrams[i], w = box.querySelector('.svg-wrap');
    var ae = document.activeElement, fi = ae && w.contains(ae) && ae.getAttribute('data-i');
    w.innerHTML = svgOf(d, i);
    if (fi != null) { var f = w.querySelector('.item[data-i="' + fi + '"]'); if (f) f.focus({ preventScroll: true }); }
    fitWide(w);
    var rb = box.querySelector('.reset-layout'); if (rb) rb.hidden = !hasLayout(d);
    if (!no3d) build3dOne(state.doc, i);
    if (state.sel && state.sel.d === i) { var g = w.querySelector('.item[data-i="' + state.sel.i + '"]'); if (g) g.classList.add('sel'); }
  }

  // ---- 配置を変える（R8a）：正本は md の文字だけ。書きかえ → 読み直し → 変わった図だけ描き直す ----
  function applyText(text, pushUndo, merge) {
    var doc;
    try { doc = P.parseDoc(text); } catch (e) { showError('配置を書きこめませんでした：' + e.message + '。md は前のままです。'); return false; }
    var old = state.doc;
    if (pushUndo && !(merge && state.undo.length)) { state.undo.push(state.text); if (state.undo.length > 100) state.undo.shift(); }
    if (pushUndo) state.redo = [];
    var oldText = state.text;
    state.text = text; state.doc = doc;
    updateDirty();
    // layout の区画のほかが変わった（名前・印・行を直した）ときは、全部を描き直す
    var bare = function (t, dc) { try { return P.writeLayout(t, dc, null); } catch (e) { return t; } };
    if (doc.diagrams.length !== old.diagrams.length || bare(text, doc) !== bare(oldText, old)) { closePanel(); render(); return true; }
    var changed = false;
    doc.diagrams.forEach(function (d, i) { if (JSON.stringify(d.layout || null) !== JSON.stringify(old.diagrams[i].layout || null)) { redrawDiagram(i); changed = true; } });
    if (changed) buildPrint(doc);   // PDF（印刷）のページも、動かした形で作り直す
    renderWarnings(doc);
    return true;
  }
  // 図 i の部品 pk の配置を変える（patch が null なら、その図の配置を全部消す）
  function setLayout(i, pk, patch, merge) {
    var doc = state.doc, d = doc.diagrams[i];
    var obj = doc.layout ? JSON.parse(JSON.stringify(doc.layout)) : { v: 1, diagrams: [] };
    var k = d.layoutIndex;
    if (k == null) { if (patch == null) return; k = obj.diagrams.push({ type: d.type, name: d.name || '', parts: {} }) - 1; }
    var L = obj.diagrams[k];
    if (patch == null) obj.diagrams.splice(k, 1);
    else {
      if (!L.parts || typeof L.parts !== 'object') L.parts = {};
      var cur = L.parts[pk] && typeof L.parts[pk] === 'object' ? L.parts[pk] : {};
      Object.keys(patch).forEach(function (key) { if (patch[key] == null) delete cur[key]; else cur[key] = patch[key]; });
      if (!Object.keys(cur).length) { delete L.parts[pk]; cur = null; }
      if (cur) L.parts[pk] = cur;
      if (!Object.keys(L.parts).length) obj.diagrams.splice(k, 1);   // 何もなくなった図は、区画から消す（md を元どおりに）
    }
    var text;
    try { text = P.writeLayout(state.text, doc, obj); } catch (e) { showError('配置を書きこめませんでした：' + e.message + '。md は前のままです。'); return; }
    applyText(text, true, merge);
  }
  // ---- 形・色・大きさ・線の形（R8b-2）：ポップアップの下の欄。値は layout にだけ書く ----
  var STYLABLE = { flow: 1, lanes: 1, tree: 1, flowchart: 1 };
  var OPT_BOX = [
    ['shape', '形', [['', '自動'], ['rect', '四角'], ['round', '角丸'], ['ellipse', '楕円'], ['diamond', 'ひし形'], ['para', '平行四辺形'], ['hexagon', '六角形'], ['chevron', '矢羽根'], ['cylinder', '円柱'], ['doc', '書類']]],
    ['color', '色', [['', '自動'], ['blue', '青'], ['green', '緑'], ['yellow', '黄'], ['red', '赤'], ['gray', '灰'], ['purple', '紫']]],
    ['stroke', '線の太さ', [['', 'ふつう'], [1, '細い'], [3, '太い'], [4, 'とても太い']]],
    ['scale', '大きさ', [[0.6, '60%'], [0.8, '80%'], ['', '100%'], [1.4, '140%'], [2, '200%']]],
    ['font', '文字', [[0.8, '小'], ['', '中'], [1.25, '大']]]];
  var OPT_EDGE = [
    ['route', '線の形', [['', '自動'], ['straight', '直線'], ['elbow', '折れ線'], ['curve', '曲線']]],
    ['head', '矢印の先', [['', '自動'], ['end', '先だけ'], ['none', 'なし'], ['both', '両方']]],
    ['dash', '線', [['', '実線'], [true, '点線']]]];
  function partNow(diag, pk) { return (diag.layout || {})[pk] || {}; }
  // 箱の欄はたたんでおく（ポップアップを小さく保ち、となりの箱を隠さない）。線の欄と、変えた直後は開く
  var styleOpen = false;
  function styleHtml(d, pk, cur, edge) {
    return '<details class="styl" data-d="' + d + '" data-pk="' + esc(pk) + '"' + (edge || styleOpen ? ' open' : '') + '><summary>' + (edge ? '線の形と矢印' : '形と色を変える') + '</summary>' + (edge ? OPT_EDGE : OPT_BOX).map(function (o) {
      return '<div class="srow" role="group" aria-label="' + o[1] + '"><span>' + o[1] + '</span>' + o[2].map(function (v) {
        var on = (cur[o[0]] == null ? '' : cur[o[0]]) === v[0];
        return '<button type="button" data-k="' + o[0] + '" data-v="' + esc(JSON.stringify(v[0])) + '" aria-pressed="' + on + '"' + (o[0] === 'color' && v[0] ? ' class="sw ' + v[0] + '"' : '') + '>' + v[1] + '</button>';
      }).join('') + '</div>';
    }).join('') + '</details>';
  }
  function openEdge(d, pk, anchor) {
    var diag = state.doc.diagrams[d], ends = pk.replace(/#\d+$/, '').split('>');
    var nm = function (k) { var it = diag.items.filter(function (x) { return x.pk === k; })[0]; return it ? it.label : k; };
    closePanel();
    state.anchor = anchor; state.byKey = false; state.selEdge = { d: d, pk: pk };
    $('panelBody').innerHTML = '<h2>線：' + esc(nm(ends[0])) + ' → ' + esc(nm(ends[1])) + '</h2>' + (P.EDITABLE[diag.type] ? '<p class="acts"><button type="button" class="act" data-act="del-edge">この線を消す</button></p>' : '') + styleHtml(d, pk, partNow(diag, pk), true);
    $('panel').hidden = false;
    placePanel();
  }
  $('panel').addEventListener('click', function (e) {
    var ab = e.target.closest && e.target.closest('button.act');
    if (ab && state.sel) {
      var act = ab.getAttribute('data-act'), sd = state.sel.d, si = state.sel.i, sit = state.doc.diagrams[sd].items[si], av = ab.getAttribute('data-v');
      if (act === 'rename') { startRename(sd, si); return; }
      if (act === 'del') { deleteItem(sd, si); return; }
      if (act === 'link') { startLink(sd, si); return; }
      if (act === 'mark' && editMd(function () { return P.toggleMark(state.text, state.doc, sd, si, av); }, '印を変えられ', '印を変えました')) {
        openItem(sd, si); var mb = $('panelBody').querySelector('button[data-act=mark][data-v="' + av + '"]'); if (mb) mb.focus();
        return;
      }
      if (act === 'lane' && editMd(function () { return P.setLane(state.text, state.doc, sd, si, av); }, '担当を変えられ', '「' + sit.label + '」の担当を「' + av + '」にしました')) { openItem(sd, si); return; }
      return;
    }
    if (ab && state.selEdge && ab.getAttribute('data-act') === 'del-edge') { deleteEdge(state.selEdge.d, state.selEdge.pk); return; }
    var b = e.target.closest && e.target.closest('.styl button');
    if (!b) return;
    var box = b.closest('.styl'), d = +box.getAttribute('data-d'), pk = box.getAttribute('data-pk'), k = b.getAttribute('data-k'), v = JSON.parse(b.getAttribute('data-v')), patch = {};
    patch[k] = v === '' ? null : v;
    var sel = state.sel, se = state.selEdge, key = b.getAttribute('data-k') + b.getAttribute('data-v');
    setLayout(d, pk, patch);
    // 同じ箱・線の欄を開き直す（押したボタンにフォーカスを戻す）
    styleOpen = true;
    if (se && se.pk === pk) openEdge(d, pk, state.anchor);
    else if (sel) { var g = document.querySelector('#dg' + sel.d + ' .item[data-i="' + sel.i + '"]'); if (g) state.anchor = anchorOf(g); openItem(sel.d, sel.i); }
    styleOpen = false;
    var nb = Array.prototype.filter.call($('panelBody').querySelectorAll('.styl button'), function (x) { return x.getAttribute('data-k') + x.getAttribute('data-v') === key; })[0];
    if (nb) nb.focus();
  });
  // 右クリック：箱なら説明と「形と色」、線・線の言葉なら「線の形と矢印」
  $('diagrams').addEventListener('contextmenu', function (e) {
    var svg = e.target.closest && e.target.closest('.svg-wrap svg'), box = svg && svg.closest('.diagram-box');
    if (!svg || !state.doc) return;
    var i = +box.id.slice(2), d = state.doc.diagrams[i];
    if (!STYLABLE[d.type]) return;
    var g = e.target.closest('.item'), anchor = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
    if (g) { e.preventDefault(); state.selEdge = null; state.anchor = e.clientX || e.clientY ? anchor : anchorOf(g); state.byKey = !(e.clientX || e.clientY); openItem(i, +g.getAttribute('data-i')); return; }
    var lb = e.target.closest('.edge-label[data-ek]'), ed = lb || edgeUnder(svg, e.clientX, e.clientY);
    if (ed) { e.preventDefault(); openEdge(i, ed.getAttribute('data-ek'), anchor); }
  });

  // ---- 名前を直す（R8b-3）：箱を2回押すか、ポップアップの「名前を直す」。Enter で決める、Esc でやめる ----
  // fresh：「＋ 箱」で足したばかり。名前を決めると足したのと1つの「戻す」にまとめ、やめると箱を足す前に戻す
  function startRename(d, i, fresh) {
    var g = document.querySelector('#dg' + d + ' .item[data-i="' + i + '"]'), it = state.doc.diagrams[d].items[i];
    if (!g || !it) return;
    closePanel();
    var b = g.querySelector('.box').getBoundingClientRect(), inp = document.createElement('input');
    inp.className = 'rename'; inp.value = it.label; inp.setAttribute('aria-label', '「' + it.label + '」の新しい名前');
    inp.style.left = Math.round(b.left) + 'px'; inp.style.top = Math.round(b.top + b.height / 2 - 18) + 'px'; inp.style.width = Math.round(Math.max(b.width, 180)) + 'px';
    document.body.appendChild(inp); inp.focus(); inp.select();
    var done = false;
    function end(ok) {
      if (done) return; done = true;
      var v = inp.value; inp.remove();
      if (fresh && (!ok || !P.safeName(v))) { var before = state.undo.pop(); if (before != null) applyText(before, false); toast('箱を足すのをやめました', 2000); return; }
      if (!ok || !P.safeName(v) || v === it.label) { g.focus && g.focus(); return; }
      var nn = P.safeName(v), same = state.doc.diagrams[d].items.filter(function (x) { return x.id !== i && x.key === nn.normalize('NFKC').replace(/\s+/g, '').toLowerCase(); })[0];
      if (same && !window.confirm('「' + same.label + '」と同じ名前なので、2つの箱が1つにまとまります。よいですか？')) return;
      var text;
      try { text = P.renameItem(state.text, state.doc, d, i, v); } catch (e) { showError('名前を直せませんでした：' + e.message + '。md は前のままです。'); return; }
      applyText(text, true, !!fresh);
      toast('名前を「' + nn + '」に直しました（Ctrl+Z で戻せます）', 2500);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } });
    inp.addEventListener('blur', function () { end(false); });
  }
  $('diagrams').addEventListener('dblclick', function (e) {
    var g = e.target.closest && e.target.closest('.svg-wrap .item'), box = g && g.closest('.diagram-box');
    if (!g || !STYLABLE[state.doc.diagrams[+box.id.slice(2)].type]) return;
    e.preventDefault();
    startRename(+g.getAttribute('data-d'), +g.getAttribute('data-i'));
  });

  // 矢印キーで箱を動かす（8、Shift で 1）。続けて押した同じ箱の動きは、戻す1回にまとめる
  var lastKey = null;
  function keyMove(g, dx, dy) {
    var i = +g.getAttribute('data-d'), d = state.doc.diagrams[i];
    if (!P.MOVABLE[d.type]) return false;
    var svg = g.ownerSVGElement, bb = g.querySelector('.box').getBBox(), W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
    var band = (g.getAttribute('data-band') || '').split(' ').map(Number), y0 = band.length === 2 ? band[0] : 0, y1 = band.length === 2 ? band[1] : H;
    var pk = d.items[+g.getAttribute('data-i')].pk, now = Date.now();
    var merge = !!(lastKey && lastKey.i === i && lastKey.pk === pk && now - lastKey.t < 800);
    lastKey = { i: i, pk: pk, t: now };
    closePanel();
    setLayout(i, pk, { x: Math.round(Math.max(0, Math.min(bb.x + dx, W - bb.width))), y: Math.round(Math.max(y0, Math.min(bb.y + dy, y1 - bb.height))) }, merge);
    return true;
  }
  function undoRedo(back) {
    var from = back ? state.undo : state.redo, to = back ? state.redo : state.undo;
    if (!state.doc || !from.length) return;
    to.push(state.text);
    applyText(from.pop(), false);
    toast(back ? '1つ戻しました' : 'やり直しました', 1500);
  }

  // 2D：箱・線の言葉・線をドラッグ。4px 以上動いたら「動かす」、それ以下なら今のとおり押す（click）
  var drag2 = null, swallowClick = false;
  function svgPoint(svg, x, y) { var m = svg.getScreenCTM(); if (!m) return null; var p = svg.createSVGPoint(); p.x = x; p.y = y; p = p.matrixTransform(m.inverse()); return [p.x, p.y]; }
  function edgeUnder(svg, x, y) {
    var pt = svgPoint(svg, x, y), hit = null;
    if (!pt) return null;
    var sp = svg.createSVGPoint(); sp.x = pt[0]; sp.y = pt[1];
    Array.prototype.forEach.call(svg.querySelectorAll('path.edge[data-ek]'), function (p) {
      if (hit) return;
      var old = p.getAttribute('stroke-width');
      p.setAttribute('stroke-width', '14');
      try { if (p.isPointInStroke(sp)) hit = p; } catch (e) { /* 古いブラウザ：線は曲げられない */ }
      p.setAttribute('stroke-width', old);
    });
    return hit;
  }
  function startDrag2(e) {
    if (e.button !== 0 || present.on || !state.doc) return;
    var svg = e.target.closest && e.target.closest('.svg-wrap svg'), box = svg && svg.closest('.diagram-box');
    if (!svg) return;
    var i = +box.id.slice(2), d = state.doc.diagrams[i];
    if (!P.MOVABLE[d.type]) return;
    var p0 = svgPoint(svg, e.clientX, e.clientY), lay = d.layout || {}, g, t = null;
    if (!p0) return;
    if ((g = e.target.closest('.item'))) {
      var it = d.items[+g.getAttribute('data-i')], bb = g.querySelector('.box').getBBox();
      var band = (g.getAttribute('data-band') || '').split(' ').map(Number);
      t = { kind: 'box', pk: it.pk, base: [bb.x, bb.y], w: bb.width, h: bb.height, band: band.length === 2 ? band : null };
    } else if ((g = e.target.closest('.edge-label[data-ek]'))) {
      var pk = g.getAttribute('data-ek'), l0 = (lay[pk] || {}).label || [0, 0];
      t = { kind: 'label', pk: pk, base: l0.slice() };
    } else if ((g = edgeUnder(svg, e.clientX, e.clientY))) {
      var pk2 = g.getAttribute('data-ek'), b0 = (lay[pk2] || {}).bend;
      t = { kind: 'bend', pk: pk2, base: b0 ? b0.slice() : p0 };
    }
    if (!t) return;
    t.i = i; t.p0 = p0; t.x0 = e.clientX; t.y0 = e.clientY; t.moving = false; t.W = +svg.getAttribute('data-w'); t.H = +svg.getAttribute('data-h');
    drag2 = t;
    if (t.kind !== 'box') e.preventDefault();
  }
  function dragValue(t, svg, x, y) {
    var p = svgPoint(svg, x, y) || t.p0, dx = p[0] - t.p0[0], dy = p[1] - t.p0[1];
    if (t.kind === 'box') return { x: Math.round(Math.max(0, Math.min(t.base[0] + dx, t.W - t.w))), y: Math.round(Math.max(t.band ? t.band[0] : 0, Math.min(t.base[1] + dy, (t.band ? t.band[1] : t.H) - t.h))) };
    if (t.kind === 'label') return { label: [Math.round(t.base[0] + dx), Math.round(t.base[1] + dy)] };
    return { bend: [Math.round(Math.max(0, Math.min(t.base[0] + dx, t.W))), Math.round(Math.max(0, Math.min(t.base[1] + dy, t.H)))] };
  }
  function previewDrag(t, v) {
    var d = state.doc.diagrams[t.i], keep = d.layout, tmp = JSON.parse(JSON.stringify(keep || {}));
    tmp[t.pk] = Object.assign(tmp[t.pk] || {}, v);
    d.layout = tmp;
    try { redrawDiagram(t.i, true); } finally { d.layout = keep; }
  }
  window.addEventListener('pointermove', function (e) {
    var t = drag2;
    if (!t) return;
    if (!t.moving && Math.abs(e.clientX - t.x0) + Math.abs(e.clientY - t.y0) < 4) return;
    t.moving = true; closePanel();
    var svg = $('dg' + t.i).querySelector('.svg-wrap svg');
    t.v = dragValue(t, svg, e.clientX, e.clientY);
    t.lane = t.kind === 'box' && t.band ? laneAt(svg, e.clientX, e.clientY) : -1;
    if (!t.raf) t.raf = requestAnimationFrame(function () {
      t.raf = 0; if (drag2 !== t) return;
      previewDrag(t, t.v);
      var rs = $('dg' + t.i).querySelectorAll('.svg-wrap svg g.lane > rect:first-child');
      if (rs[t.lane] && !laneHas(rs[t.lane], t.band)) rs[t.lane].classList.add('drop-to');   // 別の帯に落とすと担当が変わる
    });
  });
  window.addEventListener('pointerup', function () {
    var t = drag2; drag2 = null;
    if (!t || !t.moving) return;
    if (t.raf) cancelAnimationFrame(t.raf);
    swallowClick = true; setTimeout(function () { swallowClick = false; }, 0);
    if (t.kind === 'box' && t.band && dropToLane(t.i, t.pk, t.lane, t.band, t.v.x, t.py, t.h)) return;
    setLayout(t.i, t.pk, t.v);
  });
  // 別の帯（k 番目）に落とした：md の [担当] を書きかえ、置き場所（真ん中の高さ cy）も同じ「戻す1回」にまとめる。2D と 3D で同じ
  function dropToLane(i, pk, k, band, x, cy, h) {
    var d = state.doc.diagrams[i], rs = $('dg' + i).querySelectorAll('.svg-wrap svg g.lane > rect:first-child'), r = rs[k];
    if (d.type !== 'lanes' || !r || laneHas(r, band)) return false;
    var it = d.items.filter(function (x) { return x.pk === pk; })[0], to = d.lanes[k];
    if (!it || !editMd(function () { return P.setLane(state.text, state.doc, i, it.id, to); }, '担当を変えられ', '「' + it.label + '」の担当を「' + to + '」にしました')) return false;
    var y0 = +r.getAttribute('y'), y1 = y0 + +r.getAttribute('height');
    setLayout(i, pk, { x: x, y: Math.round(Math.max(y0, Math.min(cy - h / 2, y1 - h))) }, true);
    return true;
  }
  // 画面の点がどの帯（担当）の上か。帯がなければ -1
  function laneAt(svg, x, y) {
    var p = svgPoint(svg, x, y), rs = svg.querySelectorAll('g.lane > rect:first-child');
    if (!p) return -1;
    drag2 && (drag2.py = p[1]);
    for (var k = 0; k < rs.length; k++) { var y0 = +rs[k].getAttribute('y'); if (p[1] >= y0 && p[1] < y0 + +rs[k].getAttribute('height')) return k; }
    return -1;
  }
  function laneHas(r, band) { var y0 = +r.getAttribute('y'), y1 = y0 + +r.getAttribute('height'); return band[0] >= y0 - 1 && band[1] <= y1 + 1; }

  function cardsHtml(doc) {
    var c = [['summary', 'ひとことで', ''], ['conclusion', '結論', 'conclusion'], ['todo', 'すること', 'todo']];
    return c.filter(function (x) { return doc[x[0]]; }).map(function (x) {
      return '<div class="card ' + x[2] + '"><h3>' + x[1] + '</h3><p>' + esc(doc[x[0]]) + '</p></div>';
    }).join('');
  }

  function usedMarks(doc, diags) {
    var u = { red: {}, yellow: {}, green: {} }, info = false, rates = {}, today = false;
    var hn = hasNoteFn(doc);
    (diags || doc.diagrams).forEach(function (d) {
      if (d.type === 'timeline') today = true;
      d.items.forEach(function (it) {
        it.marks.forEach(function (m) { u[m.kind][m.text] = true; });
        if (it.sources.length || hn(it.key)) info = true;
        (it.cells || []).forEach(function (c) { if (c.rate) rates[c.rate] = true; });
      });
    });
    return { marks: u, info: info, rates: rates, today: today };
  }
  function legendItems(doc, diags) {
    var u = usedMarks(doc, diags), out = [], C = R.COLORS;
    [['red', '赤：'], ['yellow', '黄：'], ['green', '緑：']].forEach(function (k) {
      var t = Object.keys(u.marks[k[0]]);
      if (t.length) out.push('<span class="chip" style="background:' + C[k[0]] + '"></span>' + k[1] + esc(t.join('・')));
    });
    if (u.info) out.push('<span class="chip" style="background:' + C.accent + ';border-radius:2px"></span>角の印：説明か出どころがある（押すと出る）');
    if (u.rates.best || u.rates.good) out.push('<span class="chip" style="background:' + C.greenBg + ';border:1px solid ' + C.green + '"></span>よい所（◎○）');
    if (u.rates.mid) out.push('<span class="chip" style="background:' + C.yellowBg + ';border:1px solid ' + C.yellow + '"></span>まあまあ（△）');
    if (u.rates.bad) out.push('<span class="chip" style="background:' + C.redBg + ';border:1px solid ' + C.red + '"></span>よくない所（×）');
    if (u.today) out.push('<span class="chip" style="background:' + C.red + ';height:3px;border-radius:0"></span>赤い点線：今日');
    return out;
  }
  function renderLegend(doc) {
    var items = legendItems(doc), el = $('legend');
    el.hidden = !items.length || !doc.diagrams.length;
    el.innerHTML = '<h2>凡例（色と印の意味）</h2><ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '<li>箱を押すと、説明と出どころが出ます</li></ul>';
  }
  function renderWarnings(doc) {
    var el = $('warnings'), w = doc.warnings;
    el.hidden = !w.length;
    el.innerHTML = '<h2>読みとりの知らせ（' + w.length + ' 件）</h2><ul>' + w.map(function (x) {
      return '<li><span class="k ' + (x.kind === 'fix' ? 'fix' : '') + '">' + (x.kind === 'fix' ? '直した' : '飛ばした') + '</span>' + (x.line ? x.line + '行目：' : '全体：') + esc(x.msg) + '</li>';
    }).join('') + '</ul>';
  }

  // ---- 小さな md の表示（本文と説明用。すべてエスケープしてから飾る） ----
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
  }
  function md(lines) {
    var html = '', list = null, para = [], table = [];
    function flush() {
      if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; }
      if (list) { html += '</' + list + '>'; list = null; }
      if (table.length) {
        html += '<table>' + table.filter(function (r) { return !/^[\s|｜:：\-－]+$/.test(r); }).map(function (r, i) {
          var cells = r.trim().replace(/^[|｜]|[|｜]$/g, '').split(/[|｜]/);
          var tag = i === 0 ? 'th' : 'td';
          return '<tr>' + cells.map(function (c) { return '<' + tag + '>' + inline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>';
        }).join('') + '</table>';
        table = [];
      }
    }
    lines.forEach(function (l) {
      if (l.code) { flush(); html += '<pre>' + esc(l.code.join('\n')) + '</pre>'; return; }
      var t = l.text, m;
      if (!t.trim()) { flush(); return; }
      if (/^\s*[|｜]/.test(t)) { if (para.length || list) { var keep = table; table = []; flush(); table = keep; } table.push(t); return; }
      if (table.length) flush();
      if ((m = /^\s*(?:[-*・]|(\d+)[.)])\s+(.*)$/.exec(t))) {
        var want = m[1] ? 'ol' : 'ul';
        if (para.length) { var l2 = list; list = null; flush(); list = l2; }
        if (list !== want) { if (list) html += '</' + list + '>'; html += '<' + want + '>'; list = want; }
        html += '<li>' + inline(m[2]) + '</li>'; return;
      }
      if (list) { html += '</' + list + '>'; list = null; }
      if ((m = /^\s*>\s?(.*)$/.exec(t))) { para.push(m[1]); return; }
      para.push(t);
    });
    flush();
    return html;
  }

  // ---- 箱を押したとき ----
  function noteFor(key) { return state.doc.notes.filter(function (n) { return n.key === key; })[0]; }
  function openItem(d, i) {
    var diag = state.doc.diagrams[d], it = diag && diag.items[i];
    if (!it) return;
    Array.prototype.forEach.call(document.querySelectorAll('.item.sel'), function (e) { e.classList.remove('sel'); });
    var g = document.querySelector('#dg' + d + ' .item[data-i="' + i + '"]');
    if (g) g.classList.add('sel');
    state.scenes.forEach(function (sc, k) { if (sc) { sc.select(k === d ? i : null); redraw(k); } });
    state.sel = { d: d, i: i }; state.selEdge = null;
    var n = noteFor(it.key), h = '<h2>' + esc(it.label) + '</h2>';
    h += it.marks.map(function (m) { return '<span class="badge ' + m.kind + '">' + esc(m.text) + '</span>'; }).join('');
    var extra = [];
    if (it.dateText) extra.push('日付：' + esc(it.dateText) + (it.end ? '（' + esc(it.end) + ' まで）' : ''));
    if (it.values && diag.series) extra.push(diag.series.map(function (n, k) { return esc(n) + '：' + (it.values[k] == null ? '－' : esc(it.valueTexts[k]) + esc(diag.unit || '')); }).join('<br>'));
    else if (it.valueText) extra.push('数字：' + esc(it.valueText) + (diag.unit ? '（' + esc(diag.unit) + '）' : '') + (it.note ? '\u3000' + esc(it.note) : ''));
    if (diag.type === 'pie' || diag.type === 'donut') {
      var tot = diag.items.reduce(function (a, x) { return a + Math.max(0, x.value); }, 0);
      extra.push('割合：' + (tot > 0 ? Math.round(Math.max(0, it.value) / tot * 1000) / 10 : 0) + '%（合計 ' + esc(String(tot)) + esc(diag.unit || '') + '）');
    }
    if (it.lane) extra.push('担当：' + esc(it.lane));
    if (diag.type === 'flowchart') extra.push('形：' + ({ terminal: '端（はじめ・終わり）', decision: '判断', subprocess: '別の手順', io: '入力・出力', process: '処理' })[it.style.shape]);
    if (it.cells) extra.push(diag.options.map(function (o, j) { return esc(o) + '：' + esc(it.cells[j].text || '－'); }).join('<br>'));
    if (diag.edges) {
      var outs = diag.edges.filter(function (e) { return e.from === it.id; }).map(function (e) { return esc(diag.items[e.to].label) + (e.label ? '（' + esc(e.label) + '）' : ''); });
      var ins = diag.edges.filter(function (e) { return e.to === it.id; }).map(function (e) { return esc(diag.items[e.from].label); });
      if (ins.length) extra.push('前：' + ins.join('・'));
      if (outs.length) extra.push('次：' + outs.join('・'));
    }
    if (extra.length) h += '<p>' + extra.join('<br>') + '</p>';
    h += n && n.lines.length ? md(n.lines) : '<p class="empty">説明は md に書かれていません（「## ' + esc(it.label) + '」の下に書くと、ここに出ます）。</p>';
    h += it.sources.length ? '<div class="src"><b>出どころ</b><br>' + it.sources.map(esc).join('<br>') + '</div>' : '<p class="empty">出どころは書かれていません。</p>';
    h += '<p class="empty">md の ' + it.line + ' 行目</p>';
    if (STYLABLE[diag.type]) h += '<p class="acts"><button type="button" class="act" data-act="rename">名前を直す</button>' + (P.EDITABLE[diag.type] ? editActs(diag, it) : '') + '</p>' + styleHtml(d, it.pk, partNow(diag, it.pk), false);
    $('panelBody').innerHTML = h;
    $('panel').hidden = false;
    placePanel();
  }
  // 箱の md を書きかえるボタン（R8b-3）：印・線を引く・担当・消す
  var MARKS = [['red', '!', '注意'], ['yellow', '?', '確認'], ['green', '+', '完了']];
  function editActs(diag, it) {
    return MARKS.map(function (m) {
      var on = it.marks.some(function (x) { return x.kind === m[0]; });
      return '<button type="button" class="act mark ' + m[0] + '" data-act="mark" data-v="' + m[0] + '" aria-pressed="' + on + '">' + m[1] + ' ' + m[2] + '</button>';
    }).join('') + (diag.type === 'tree' ? '' : '<button type="button" class="act" data-act="link">線を引く</button>') + '<button type="button" class="act" data-act="del">この箱を消す</button>' +
      (diag.type === 'lanes' && diag.lanes.length > 1 ? '<span class="lane-acts" role="group" aria-label="担当">担当：' + diag.lanes.map(function (l) {
        return '<button type="button" class="act" data-act="lane" data-v="' + esc(l) + '" aria-pressed="' + (it.lane === l) + '">' + esc(l) + '</button>';
      }).join('') + '</span>' : '');
  }
  // md を書きかえて描き直す。失敗したら md は前のまま
  function editMd(fn, what, done) {
    var text;
    try { text = fn(); } catch (e) { showError(what + 'ませんでした：' + e.message + '。md は前のままです。'); return false; }
    if (text === state.text) return false;
    applyText(text, true);
    toast(done + '（Ctrl+Z で戻せます）', 2500);
    return true;
  }
  function deleteItem(d, i) {
    var diag = state.doc.diagrams[d], it = diag.items[i], under = diag.type === 'tree' && it ? P.subtree(diag, i).length - 1 : 0;
    if (!it || !window.confirm('箱「' + it.label + '」を消します。' + (under ? 'その下の ' + under + ' 個の箱も消えます' : 'つながっている線も消えます') + '（Ctrl+Z で戻せます）。よいですか？')) return;
    closePanel();
    editMd(function () { return P.removeItem(state.text, state.doc, d, i); }, '箱を消せ', '箱「' + it.label + '」を消しました');
  }
  function deleteEdge(d, pk) {
    var diag = state.doc.diagrams[d], e = diag.edges.filter(function (x) { return x.pk === pk; })[0];
    if (!e || !window.confirm('線「' + diag.items[e.from].label + ' → ' + diag.items[e.to].label + '」を消します。よいですか？')) return;
    closePanel();
    editMd(function () { return P.removeEdge(state.text, state.doc, d, e.id); }, '線を消せ', '線を消しました');
  }
  // 線を引く：次に押した箱へつなぐ。Esc でやめる
  function startLink(d, i) {
    closePanel();
    state.link = { d: d, i: i };
    document.body.classList.add('linking');
    toast('つなぐ先の箱を押してください（Esc でやめる）', 6000);
  }
  function endLink() { state.link = null; document.body.classList.remove('linking'); }
  // 窓は押した所の近くに出す。下 → 上 → 右 → 左の順に、入る所を選ぶ。押した所と上の帯には重ねない。
  // どこにも入らないときは、いちばん広い側に合わせて窓を小さくし、中を縦にスクロールさせる
  function placePanel() {
    var el = $('panel'), a = state.anchor, M = 12, G = 10, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var bar = document.querySelector('header.bar'), top = Math.max(M, bar ? bar.getBoundingClientRect().bottom + 6 : M);
    el.style.maxHeight = Math.max(120, vh - top - M) + 'px';
    var w = el.offsetWidth, h = el.offsetHeight, x, y;
    if (!a) { x = vw - w - M; y = top; }
    else {
      var room = { below: vh - M - (a.y + a.h + G), above: a.y - G - top, right: vw - M - (a.x + a.w + G), left: a.x - G - M };
      var cxw = a.x + a.w / 2 - w / 2, cyh = a.y + a.h / 2 - h / 2;
      if (room.below >= h) { x = cxw; y = a.y + a.h + G; }
      else if (room.above >= h) { x = cxw; y = a.y - G - h; }
      else if (room.right >= w) { x = a.x + a.w + G; y = cyh; }
      else if (room.left >= w) { x = a.x - G - w; y = cyh; }
      else {
        var down = room.below >= room.above, r0 = Math.max(down ? room.below : room.above, 0);
        el.style.maxHeight = Math.max(r0, 80) + 'px'; h = el.offsetHeight;
        x = cxw; y = down ? a.y + a.h + G : a.y - G - h;
        if (r0 < 80) y = (a.y + a.h / 2 > (top + vh) / 2) ? top : vh - M - h;   // 狭すぎるときは、押した所の反対側の端へ
      }
    }
    el.style.left = Math.round(Math.max(M, Math.min(x, vw - w - M))) + 'px';
    el.style.top = Math.round(Math.max(top, Math.min(y, vh - h - M))) + 'px';
  }
  // 中身の高さが変わったら（欄を開く・閉じる・文字の大きさなど、どんな理由でも）置き直す。
  // 窓そのものでなく中身を見るので、placePanel が max-height を変えても、また呼ばれることはない
  if (window.ResizeObserver) new ResizeObserver(function () { if (!$('panel').hidden) placePanel(); }).observe($('panelBody'));
  // 押したことの判定は、ここ1か所（2D のクリック・キーボード・3D）。あとで「動かす」と区別するのもここ
  function press(d, i, anchor, byKey) {
    if (state.link) {
      var lk = state.link; endLink();
      if (lk.d !== d) { toast('ちがう図の箱にはつなげません', 3000); return; }
      if (lk.i !== i) editMd(function () { return P.addEdge(state.text, state.doc, d, lk.i, i); }, '線を引け', '線を引きました');
      return;
    }
    state.anchor = anchor; state.byKey = byKey;
    toggleItem(d, i);
    if (byKey && !$('panel').hidden) $('panelClose').focus();
  }
  function anchorOf(g) { var b = (g.querySelector('.box') || g).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }
  // 押した箱が、いま開いている箱なら閉じる（もう1回押すと閉じる）。ほかの箱なら開く
  function toggleItem(d, i) {
    if (state.sel && state.sel.d === d && state.sel.i === i && !$('panel').hidden) closePanel(); else openItem(d, i);
  }
  function closePanel() {
    var was = state.sel, wasOpen = !$('panel').hidden;
    $('panel').hidden = true;
    if (wasOpen && was && state.byKey) { var g0 = document.querySelector('#dg' + was.d + ' .item[data-i="' + was.i + '"]'); if (g0) g0.focus(); }
    state.scenes.forEach(function (sc, k) { if (sc) { sc.select(null); redraw(k); } });
    Array.prototype.forEach.call(document.querySelectorAll('.item.sel'), function (e) { e.classList.remove('sel'); });
    state.sel = null;
  }

  // ---- 3D ----
  var visible = {}, io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { visible[e.target.getAttribute('data-d')] = e.isIntersecting; });
  }) : null;
  function dispose3d() {
    state.scenes.forEach(function (sc) { if (sc) { if (io) io.unobserve(sc.canvas); sc.dispose(); } });
    state.scenes = []; state.captures = []; visible = {};
  }
  function fallback2d(reason) {
    state.gl = reason; state.mode = '2d';
    dispose3d();
    applyMode();
  }
  function build3d(doc) {
    dispose3d();
    if (state.gl) { applyMode(); return; }
    try {
      doc.diagrams.forEach(function (d, i) { make3d(doc, i); });
    } catch (e) {
      fallback2d('3D を作れなかったので 2D で出しています（' + e.message + '）');
      return;
    }
    applyMode();
  }
  // 図 i の 3D だけを作り直す（配置を変えたとき）。向きは残す
  function build3dOne(doc, i) {
    if (state.gl || !state.scenes[i]) return;
    var old = state.scenes[i], view = old.getView && old.getView();
    if (io) io.unobserve(old.canvas);
    old.dispose();
    var sc0 = $('dg' + i).querySelector('.v3scroll'); if (sc0) sc0.remove();
    try { make3d(doc, i, view); } catch (e) { fallback2d('3D を作れなかったので 2D で出しています（' + e.message + '）'); return; }
    redraw(i);
  }
  function make3d(doc, i, view) {
        var d = doc.diagrams[i], box = $('dg' + i), svg = box.querySelector('.svg-wrap svg');
        var sc = D3.create(d, svg, {
          onPick: function (it, e) { if (it == null) closePanel(); else press(i, it, { x: e.clientX, y: e.clientY, w: 0, h: 0 }, false); },
          // 箱を地面の上で動かす（動かせる図だけ）。離したら md の配置に書く
          canMove: P.MOVABLE[d.type] ? function () { return true; } : null,
          // lanes で別の帯の上にいるとき、その帯（SVG の座標）を返す。3D が光らせる
          dropRect: d.type === 'lanes' ? function (it, dx, dy) {
            var gi = $('dg' + i).querySelector('.svg-wrap .item[data-i="' + it + '"]'), g = gi && gi.querySelector('.box'), bb = g && g.getBBox();
            var band = gi && (gi.getAttribute('data-band') || '').split(' ').map(Number);
            if (!bb || !band || band.length !== 2) return null;
            var cy = bb.y + bb.height / 2 + dy, rs = $('dg' + i).querySelectorAll('.svg-wrap svg g.lane > rect:first-child');
            for (var q = 0; q < rs.length; q++) { var ry = +rs[q].getAttribute('y'), rh = +rs[q].getAttribute('height'); if (cy >= ry && cy < ry + rh) return laneHas(rs[q], band) ? null : { x: +rs[q].getAttribute('x'), y: ry, w: +rs[q].getAttribute('width'), h: rh }; }
            return null;
          } : null,
          onMove: function (it, dx, dy) {
            var gi = $('dg' + i).querySelector('.svg-wrap .item[data-i="' + it + '"]'), g = gi && gi.querySelector('.box'), bb = g && g.getBBox(), W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
            if (!bb) return;
            var band = (gi.getAttribute('data-band') || '').split(' ').map(Number), y0 = band.length === 2 ? band[0] : 0, y1 = band.length === 2 ? band[1] : H;
            closePanel();
            if (band.length === 2) {
              var cy = bb.y + bb.height / 2 + dy, rs = $('dg' + i).querySelectorAll('.svg-wrap svg g.lane > rect:first-child'), k = -1;
              for (var q = 0; q < rs.length; q++) { var ry = +rs[q].getAttribute('y'); if (cy >= ry && cy < ry + +rs[q].getAttribute('height')) k = q; }
              if (k >= 0 && dropToLane(i, state.doc.diagrams[i].items[it].pk, k, band, Math.round(Math.max(0, Math.min(bb.x + dx, W - bb.width))), cy, bb.height)) return;
            }
            setLayout(i, state.doc.diagrams[i].items[it].pk, { x: Math.round(Math.max(0, Math.min(bb.x + dx, W - bb.width))), y: Math.round(Math.max(y0, Math.min(bb.y + dy, y1 - bb.height))) });
          }
        });
        if (view && sc.setView) sc.setView(view);
        var wrap = document.createElement('div'), scroll = document.createElement('div');
        wrap.className = 'view3d'; scroll.className = 'v3scroll';
        // 画面の形は、3D で見たときの図の形に合わせる（高さ 280〜620px）。文字が 11px を下まわるなら、形を保って大きくし、横へ動かして見る
        var cw = Math.max(320, box.clientWidth - 32), ar = sc.shape();
        var vw = cw, ch = Math.round(Math.min(620, Math.max(280, cw / ar))), mf3 = minFont(svg.outerHTML);
        for (var t = 0; t < 4; t++) {
          var k = sc.textScale(vw, ch) * mf3; if (k >= MIN_PX) break;
          var f = MIN_PX / k * 1.04;
          vw = Math.min(8000, Math.ceil(vw * f)); ch = Math.min(900, Math.ceil(ch * f));
        }
        wrap.style.width = vw + 'px'; wrap.style.height = ch + 'px';
        if (vw > cw) scroll.classList.add('wide');
        sc.canvas.setAttribute('data-d', i);
        sc.canvas.setAttribute('role', 'img');
        sc.canvas.setAttribute('aria-label', (d.name || P.TYPES[d.type].label) + ' の 3D の図（押すと説明、ドラッグで回す、2回押すと元の向き）');
        wrap.appendChild(sc.canvas);
        scroll.appendChild(wrap);
        box.appendChild(scroll);
        sc.bind(sc.canvas, function () { sc.draw(); });
        if (io) io.observe(sc.canvas);
        state.scenes[i] = sc;
        state.captures[i] = sc.capture(1200, 675);
  }
  function redraw(k) { var sc = state.scenes[k]; if (sc && state.mode === '3d') sc.draw(); }
  function applyMode() {
    var m3 = state.mode === '3d' && !state.gl;
    $('diagrams').classList.toggle('mode-3d', m3);
    var b = $('mode');
    b.disabled = !!state.gl || !state.doc;
    b.textContent = m3 ? '2D にする' : '3D にする';
    b.setAttribute('aria-pressed', String(m3));
    b.title = state.gl ? state.gl : (m3 ? '平らな図（2D）にする' : '立体の図（3D）にする');
    var note = $('glnote');
    note.hidden = !state.gl || !state.doc;
    note.textContent = state.gl ? '3D は使えないので、2D で出しています（理由：' + state.gl + '）' : '';
    if (m3) state.scenes.forEach(function (sc, k) { redraw(k); });
  }
  if (D3) D3.setOnLost(function () { fallback2d('3D の描き手（WebGL）が止まった'); });
  // ゆっくり動かす。見えていない図・隠れたタブ・動きを減らす設定のときは止める
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden || (D3 && D3.reduced)) return;
    if (present.on) { if (present.scene) present.scene.draw(null, present.canvas); return; }
    if (state.mode !== '3d') return;
    state.scenes.forEach(function (sc, k) { if (sc && visible[k]) sc.draw(); });
  }
  window.addEventListener('resize', function () { state.scenes.forEach(function (sc, k) { redraw(k); }); });

  // ---- 発表（P かボタン。F5 は読みこみ直しになるので使わない） ----
  var present = { on: false, steps: [], k: 0, scene: null, canvas: null, d: -1 };
  // 2D の発表：図を枠いっぱいに。ただし文字は 11px より小さくしない（入らなければ動かして見る）
  function fitStage() {
    var stage = $('pStage'), s = stage.querySelector('svg');
    if (!s) return;
    var w = +s.getAttribute('data-w'), h = +s.getAttribute('data-h'), cw = stage.clientWidth - 32, ch = stage.clientHeight - 32;
    if (!(cw > 0 && ch > 0)) return;
    var k = Math.max(Math.min(cw / w, ch / h), MIN_PX / minFont(s.outerHTML));
    s.style.width = Math.floor(w * k) + 'px'; s.style.height = Math.floor(h * k) + 'px';
  }
  window.addEventListener('resize', function () { if (present.on && !present.scene) fitStage(); });
  // 枠の大きさは、窓の resize がなくても変わる（下の画面のスクロールバーが消えるときなど）。変わったら合わせ直す
  if (window.ResizeObserver) new ResizeObserver(function () { if (present.on && !present.scene) fitStage(); }).observe($('pStage'));
  function startPresent() {
    var doc = state.doc;
    if (!doc || !doc.diagrams.length || present.on) return;
    present.steps = [];
    doc.diagrams.forEach(function (d, i) {
      present.steps.push({ d: i, i: null });
      var order = d.items.map(function (it) { return it.id; });
      var svg = $('dg' + i).querySelector('.svg-wrap svg');
      if (d.type === 'flow' || d.type === 'lanes') {
        // 左から右、上から下の順
        var pos = {};
        Array.prototype.forEach.call(svg.querySelectorAll('.item'), function (g) { var b = g.querySelector('.box'); pos[g.getAttribute('data-i')] = [+b.getAttribute('x'), +b.getAttribute('y')]; });
        order.sort(function (a, b) { return (pos[a][0] - pos[b][0]) || (pos[a][1] - pos[b][1]); });
      }
      order.forEach(function (id) { present.steps.push({ d: i, i: id }); });
    });
    present.on = true; present.k = 0; present.d = -1;
    closePanel();
    $('present').hidden = false;
    var ps = $('pSecret'); ps.hidden = !doc.secret; ps.textContent = doc.secret || '';
    var el = $('present');
    if (el.requestFullscreen) el.requestFullscreen().catch(function () { /* 全画面にできなくても続ける */ });
    showStep();
  }
  function endPresent() {
    if (!present.on) return;
    present.on = false;
    if (present.scene) present.scene.focus(null);
    present.scene = null; present.d = -1;
    $('present').hidden = true;
    $('pStage').innerHTML = '';
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    state.scenes.forEach(function (sc, k) { if (sc) { sc.select(null); redraw(k); } });
  }
  function showStep() {
    var st = present.steps[present.k], doc = state.doc, d = doc.diagrams[st.d];
    var use3d = state.mode === '3d' && state.scenes[st.d];
    if (present.d !== st.d) {
      present.d = st.d;
      var stage = $('pStage');
      stage.innerHTML = '';
      if (present.scene) present.scene.focus(null);
      if (use3d) {
        present.canvas = document.createElement('canvas');
        present.canvas.className = 'p-canvas';
        stage.appendChild(present.canvas);
        present.scene = state.scenes[st.d];
      } else {
        present.scene = null;
        stage.innerHTML = R.uniq($('dg' + st.d).querySelector('.svg-wrap').innerHTML);
        fitStage();
      }
    }
    var it = st.i == null ? null : d.items[st.i];
    if (present.scene) { present.scene.focus(st.i); present.scene.draw(null, present.canvas); }
    else Array.prototype.forEach.call($('pStage').querySelectorAll('.item'), function (g) { g.classList.toggle('sel', st.i != null && +g.getAttribute('data-i') === st.i); g.classList.toggle('dim', st.i != null && +g.getAttribute('data-i') !== st.i); });
    var cap = '<div class="p-where">' + esc(d.name || P.TYPES[d.type].label) + '（' + esc(P.TYPES[d.type].label) + '）</div>';
    if (it) {
      var n = noteFor(it.key);
      var text = n ? n.lines.filter(function (l) { return !l.code; }).map(function (l) { return l.text; }).join(' ').trim() : '';
      cap += '<h2>' + esc(it.label) + ' ' + it.marks.map(function (m) { return '<span class="badge ' + m.kind + '">' + esc(m.text) + '</span>'; }).join('') + '</h2>' +
        (it.valueText ? '<p class="p-val">' + esc(it.valueText) + (d.unit ? '（' + esc(d.unit) + '）' : '') + (it.note ? '　' + esc(it.note) : '') + '</p>' : '') +
        (it.dateText ? '<p class="p-val">' + esc(it.dateText) + '</p>' : '') +
        (text ? '<p>' + esc(text.length > 220 ? text.slice(0, 220) + '…' : text) + '</p>' : '') +
        (it.sources.length ? '<p class="p-src">出どころ：' + esc(it.sources.join('／')) + '</p>' : '');
    } else cap += '<h2>' + esc(d.name || P.TYPES[d.type].label) + '</h2><p>全体（' + d.items.length + '）</p>';
    $('pCaption').innerHTML = cap;
    $('pCount').textContent = (present.k + 1) + ' / ' + present.steps.length + '　→・スペース：次　←：前　Esc：終わる';
  }
  function stepPresent(n) {
    if (!present.on) return;
    var k = present.k + n;
    if (k < 0) k = 0;
    if (k >= present.steps.length) { endPresent(); return; }
    present.k = k; showStep();
  }

  // ---- 印刷（PDF）用のページ。いつも作っておく（Ctrl+P でも同じものが出る） ----
  // 箱の説明と出どころ（PDF と PowerPoint で同じもの）
  function noteText(l) { return l.code ? l.code.join('\n') : l.text; }
  // PowerPoint のグラフに渡す数字（縦棒の chart は、今までどおり図形で描く）
  function chartData(d) {
    if (!/^(pie|donut|line|hbar|stacked)$/.test(d.type)) return null;
    var many = d.type === 'line' || d.type === 'stacked';
    return { type: d.type, unit: d.unit || '', labels: d.items.map(function (it) { return it.label; }),
      colors: d.type === 'hbar' ? [R.COLORS.accent] : R.PAL,
      series: many ? d.series.map(function (n, k) { return { name: n, values: d.items.map(function (it) { return it.values[k]; }) }; })
        : [{ name: d.name || P.TYPES[d.type].label, values: d.items.map(function (it) { return Math.max(d.type === 'hbar' ? -Infinity : 0, it.value); }) }] };
  }

  function noteBlocks(doc) {
    var notes = [], seen = {};
    doc.diagrams.forEach(function (d) {
      d.items.forEach(function (it) {
        var n = noteFor(it.key);
        if ((!(n && n.lines.length) && !it.sources.length) || seen[it.key]) return;
        seen[it.key] = true;
        notes.push({ title: it.label, text: n ? n.lines.map(noteText).join('\n').trim() : '', src: it.sources.length ? '出どころ：' + it.sources.join('／') : '' });
      });
    });
    return notes;
  }
  // 本文（箱の説明でない見出しと文。PDF と PowerPoint で同じもの）
  function bodyBlocks(doc) {
    return doc.body.map(function (b) { return { title: b.heading || '', text: b.lines.map(noteText).join('\n').trim(), src: '' }; })
      .filter(function (b) { return b.title || b.text; });
  }
  // PDF のページの分け目：部品（箱・線の言葉・文字）をまたがない所を選ぶ。どの種類の図も同じ
  // 図を見えない所に置いて、部品の x・y の範囲を測る
  function partSpans(svg) {
    var m = document.createElement('div');
    m.className = 'measure';   // 印刷の画面でも消さない（消すと大きさが 0 になり、切り口が箱をまたぐ）
    m.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden';
    m.innerHTML = R.uniq(svg);
    document.body.appendChild(m);
    var xs = [], ys = [];
    try {
      Array.prototype.forEach.call(m.querySelectorAll('.item, .edge-label, text'), function (el) {
        var b = el.getBBox();
        // 切り口は部品の外側へ、線の太さ＋余白（6）だけ離す（次のページの箱の枠線が、細く残らないように）
        if (b.width || b.height) { xs.push([b.x - 6, b.x + b.width + 6]); ys.push([b.y - 6, b.y + b.height + 6]); }
      });
    } finally { m.remove(); }
    return { x: xs, y: ys };
  }
  // 0 から total を size 以下に分ける。分け目は size の 3 割〜10 割の所で、どの部品の中にも入らない所。なければ（ページより大きい部品）size の所で分ける
  function cutsAt(iv, total, size) {
    var out = [0], s = 0;
    var inside = function (c) { return iv.some(function (r) { return r[0] + 0.5 < c && c < r[1] - 0.5; }); };
    while (total - s > size * 1.02) {
      var best = s + size;
      for (var c = Math.floor(s + size); c > s + size * 0.3; c--) if (!inside(c)) { best = c; break; }
      out.push(best); s = best;
    }
    out.push(total);
    return out;
  }
  function buildPrint(doc) {
    var pages = [], t = esc(title(doc)), hn = hasNoteFn(doc), td = today();
    var cover = '<h1>' + t + '</h1><div class="cards">' + cardsHtml(doc) + '</div>';
    if (doc.diagrams.length) cover += '<div class="p-list"><b>図</b><ol>' + doc.diagrams.map(function (d) { return '<li>' + esc(d.name || P.TYPES[d.type].label) + '（' + P.TYPES[d.type].label + '）</li>'; }).join('') + '</ol></div>';
    pages.push(cover);
    doc.diagrams.forEach(function (d, i) {
      var legend = legendItems(doc, [d]).join('\u3000');
      // 1ページに入れると文字が 11px より小さくなる図は、縮めすぎずにページを分ける（左から右・上から下）
      var svg = R.svg(d, i, { fs: 15, today: td, hasNote: hn });
      var w = +/data-w="(\d+)"/.exec(svg)[1], h = +/data-h="(\d+)"/.exec(svg)[1];
      var k = Math.min(1000 / w, 560 / h, 1.6), minK = MIN_PX / minFont(svg);
      if (k < minK) k = minK;
      var tw = 1000 / k, th = 560 / k, cx = [0, w], cy = [0, h];
      if (w > tw * 1.02 || h > th * 1.02) { var iv = partSpans(svg); cx = cutsAt(iv.x, w, tw); cy = cutsAt(iv.y, h, th); }
      var nx = cx.length - 1, ny = cy.length - 1, n = nx * ny;
      for (var ty = 0; ty < ny; ty++) for (var tx = 0; tx < nx; tx++) {
        var x0 = Math.round(cx[tx]), y0 = Math.round(cy[ty]), pw = Math.round(cx[tx + 1]) - x0, ph = Math.round(cy[ty + 1]) - y0;
        var part = n > 1 ? R.uniq(svg).replace(/viewBox="[^"]*"/, 'viewBox="' + x0 + ' ' + y0 + ' ' + pw + ' ' + ph + '"')
          .replace(/data-w="\d+"/, 'data-w="' + pw + '"').replace(/data-h="\d+"/, 'data-h="' + ph + '" data-k="' + k + '"') : svg;   // 分けた図は、どのページも同じ倍率で
        pages.push('<h2>' + esc(d.name || P.TYPES[d.type].label) + '（' + P.TYPES[d.type].label + '）' + (n > 1 ? '（' + (ty * nx + tx + 1) + '/' + n + '）' : '') + '</h2><div class="p-fig">' + part + '</div>' +
          (legend ? '<div class="p-legend">' + legend + '</div>' : ''));
      }
      if (state.captures[i]) pages.push('<h2>' + esc(d.name || P.TYPES[d.type].label) + '（3D）</h2><div class="p-fig"><img class="p-3d" alt="" src="' + state.captures[i] + '"></div>');
    });
    // 箱の説明と出どころ、本文。ページからあふれないよう文字数で分け、長い1つは行で（長い行は字で）切る
    function lineText(l) { return l.code ? l.code.join('\n') : l.text; }
    function paginate(head, blocks) {
      var budget = 1400, cur = '', used = 0;
      function flush() { if (cur) pages.push('<h2>' + head + '</h2>' + cur); cur = ''; used = 0; }
      blocks.forEach(function (b) {
        var rows = [];
        b.text.split('\n').forEach(function (ln) { for (var p = 0; p === 0 || p < ln.length; p += 600) rows.push(ln.slice(p, p + 600)); });
        var first = true;
        while (rows.length || first) {
          var part = [], cost = 120;
          while (rows.length && (!part.length || cost + rows[0].length + 40 <= budget - used)) { cost += rows[0].length + 40; part.push(rows.shift()); }
          if (used && used + cost > budget) { rows = part.concat(rows); flush(); continue; }   // 次のページへ（取った行は戻す）
          cur += '<div class="p-note">' + (b.title ? '<h3>' + esc(b.title) + (first ? '' : '（つづき）') + '</h3>' : '') +
            (part.join('').trim() ? '<div>' + part.map(esc).join('<br>') + '</div>' : '') +
            (!rows.length && b.src ? '<div class="src">' + esc(b.src) + '</div>' : '') + '</div>';
          used += cost; first = false;
          if (rows.length) flush();
        }
      });
      flush();
    }
    paginate('箱の説明と出どころ', noteBlocks(doc));
    paginate('本文', bodyBlocks(doc));
    var N = pages.length;
    $('print').innerHTML = pages.map(function (p, i) {
      return '<section class="page">' + (doc.secret ? '<div class="p-secret">' + esc(doc.secret) + '</div>' : '') + p +
        '<div class="p-foot"><span>' + t + '</span><span>' + (i + 1) + ' / ' + N + '</span></div></section>';
    }).join('');
    // 図をページの枠（約 1000×560px）に合わせる。小さい図は大きくしすぎない（1.6 倍まで）
    Array.prototype.forEach.call($('print').querySelectorAll('.p-fig svg'), function (s) {
      var w = +s.getAttribute('data-w'), h = +s.getAttribute('data-h'), k = s.getAttribute('data-k') ? +s.getAttribute('data-k') : Math.max(MIN_PX / minFont(s.outerHTML), Math.min(1000 / w, 560 / h, 1.6));
      s.setAttribute('width', Math.round(w * k)); s.setAttribute('height', Math.round(h * k));
    });
  }

  // ---- コピー（file:// でも動くよう、だめなら古いやり方で） ----
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  // ---- つなぐ ----
  $('pickLabel').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('file').addEventListener('change', function (e) { loadFile(e.target.files[0]); e.target.value = ''; });
  SAMPLES.forEach(function (s, i) {
    var o = document.createElement('option'); o.value = String(i); o.textContent = s.title; $('sample').appendChild(o);
  });
  $('sample').addEventListener('change', function (e) {
    var s = SAMPLES[+e.target.value];
    if (s && leaveOk()) show(s.text, s.name, '見本', '', { sample: true });
    e.target.value = '';
  });
  Array.prototype.forEach.call(document.querySelectorAll('.fs'), function (b) {
    b.addEventListener('click', function () {
      state.fs = +b.getAttribute('data-fs');
      Array.prototype.forEach.call(document.querySelectorAll('.fs'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.documentElement.style.setProperty('--fs', state.fs + 'px');
      var sel = state.sel;
      render();
      if (sel) openItem(sel.d, sel.i);
    });
  });
  $('save').addEventListener('click', save);
  $('pdf').addEventListener('click', function () {
    if (!state.doc) return;
    toast('印刷の窓で、送り先を「PDF に保存」に、用紙を「A4・横」にしてください', 7000);
    setTimeout(function () {
      try { window.print(); } catch (e) { showError('印刷を始められませんでした：' + e.message); }
    }, 300);
  });
  // PowerPoint：作って、ダウンロードで保存する。止められたら赤い帯で理由を出し、PDF を案内する
  var pptxBusy = false, lastPptx = null;
  function saveBlob(blob, name) {
    if (window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, name); return; }
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function pptxFail(e) {
    showError('PowerPoint を保存できませんでした（理由：' + ((e && e.message) || e || '分からない') + '）。かわりに「PDF」を押して PDF で保存してください。');
  }
  $('pptx').addEventListener('click', function () {
    if (!state.doc || pptxBusy) return;
    var doc = state.doc, td = today(), hn = hasNoteFn(doc), tmp = document.createElement('div');
    pptxBusy = true; lastPptx = null; showError(''); toast('PowerPoint を作っています…', 3000);
    var r;
    try {
      r = window.DocPptx.build({
        title: title(doc), secret: doc.secret || '',
        cards: [['summary', 'ひとことで'], ['conclusion', '結論'], ['todo', 'すること']].filter(function (c) { return doc[c[0]]; }).map(function (c) { return { kind: c[0], head: c[1], text: doc[c[0]] }; }),
        list: doc.diagrams.map(function (d) { return d.name || P.TYPES[d.type].label; }),
        diagrams: doc.diagrams.map(function (d, i) {
          tmp.innerHTML = legendItems(doc, [d]).join('\u3000');
          var sc = state.scenes[i];
          return { name: d.name || P.TYPES[d.type].label, svg: R.svg(d, i, { fs: 15, today: td, hasNote: hn }), legend: tmp.textContent.replace('（押すと出る）', ''),
            capture: sc ? sc.capture(1200, 675) : null, chart: chartData(d) };   // 3D は今の向きで撮りなおす（WebGL がないときは絵なし）
        }),
        notes: noteBlocks(doc),
        body: bodyBlocks(doc)
      });
    } catch (e) { pptxBusy = false; pptxFail(e); return; }
    r.pptx.write({ outputType: 'blob', compression: true }).then(function (blob) {
      saveBlob(blob, r.fileName);
      lastPptx = { fileName: r.fileName, slides: r.stats.slides, shapes: r.stats.shapes, tiles: r.stats.tiles, pics: r.stats.pics, bodySlides: r.stats.bodySlides, bytes: blob.size };
      // ブラウザは、ダウンロードを止めても知らせてくれない。だから「保存しました」と言い切らない
      toast('PowerPoint のファイル「' + r.fileName + '」を作りました。ダウンロードの一覧に出ないときは、会社の設定で止められています。「PDF」を使ってください', 9000);
    }).catch(pptxFail).then(function () { pptxBusy = false; });
  });
  $('copyPrompt').addEventListener('click', function () {
    copyText(PROMPT).then(function (ok) {
      if (ok) toast('Copilot 用の指示をコピーしました。Copilot に貼り、続けて資料を渡してください');
      else showError('コピーできませんでした。copilot-prompt.md を開いて、中身をコピーしてください。');
    });
  });
  $('diagrams').addEventListener('pointerdown', startDrag2);
  $('diagrams').addEventListener('click', function (e) {
    if (swallowClick) { swallowClick = false; return; }
    var rb = e.target.closest && e.target.closest('.reset-layout');
    if (rb) { setLayout(+rb.getAttribute('data-d'), null, null); toast('元の配置に戻しました（Ctrl+Z で取り消せます）', 2500); return; }
    var nb = e.target.closest && e.target.closest('.add-box');
    if (nb) {
      var nd = +nb.getAttribute('data-d'), r;
      try { r = P.addBox(state.text, state.doc, nd); } catch (er) { showError('箱を足せませんでした：' + er.message); return; }
      applyText(r.text, true);
      var ni = state.doc.diagrams[nd].items.filter(function (x) { return x.label === r.name; })[0];
      if (ni) startRename(nd, ni.id, true);   // すぐ名前を入れられるように
      return;
    }
    var g = e.target.closest && e.target.closest('.item');
    if (g) press(+g.getAttribute('data-d'), +g.getAttribute('data-i'), anchorOf(g), false);
  });
  // 窓の外を押したら閉じる（箱・3D の絵を押したときは、それぞれの判定にまかせる）
  document.addEventListener('pointerdown', function (e) {
    if ($('panel').hidden || present.on) return;
    var t = e.target;
    if ($('panel').contains(t) || (t.closest && (t.closest('.item') || t.closest('.view3d')))) return;
    closePanel();
  }, true);
  window.addEventListener('resize', function () { if (!$('panel').hidden) placePanel(); });
  $('diagrams').addEventListener('keydown', function (e) {
    var g = e.target.closest && e.target.closest('.item');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); press(+g.getAttribute('data-d'), +g.getAttribute('data-i'), anchorOf(g), true); }
    if (g && e.key === 'Delete' && P.EDITABLE[state.doc.diagrams[+g.getAttribute('data-d')].type]) { e.preventDefault(); deleteItem(+g.getAttribute('data-d'), +g.getAttribute('data-i')); }
    var AK = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (g && AK && !e.ctrlKey && !e.metaKey && !e.altKey) { var st = e.shiftKey ? 1 : 8; if (keyMove(g, AK[0] * st, AK[1] * st)) e.preventDefault(); }
  });
  $('panelClose').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (present.on) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); stepPresent(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); stepPresent(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); endPresent(); }
      return;
    }
    if (e.key === 'Escape') { if (state.link) { endLink(); toast('線を引くのをやめました', 2000); } closePanel(); }
    var tg = (e.target && e.target.tagName || '').toLowerCase();
    if (e.key === 'Delete' && !$('panel').hidden && tg !== 'input' && tg !== 'textarea' && !(e.target.closest && e.target.closest('#diagrams .item'))) {
      if (state.sel && P.EDITABLE[state.doc.diagrams[state.sel.d].type]) { e.preventDefault(); deleteItem(state.sel.d, state.sel.i); return; }
      if (state.selEdge && P.EDITABLE[state.doc.diagrams[state.selEdge.d].type]) { e.preventDefault(); deleteEdge(state.selEdge.d, state.selEdge.pk); return; }
    }
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'select' || tag === 'textarea' || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key || '').toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
      var k = (e.key || '').toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRedo(true); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); undoRedo(false); return; }
    }
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'input' && tag !== 'select' && tag !== 'textarea') { e.preventDefault(); startPresent(); }
  });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && present.on) endPresent(); });
  $('presentBtn').addEventListener('click', startPresent);
  $('pNext').addEventListener('click', function () { stepPresent(1); });
  $('pPrev').addEventListener('click', function () { stepPresent(-1); });
  $('pEnd').addEventListener('click', endPresent);
  $('mode').addEventListener('click', function () {
    if (state.gl) return;
    state.mode = state.mode === '3d' ? '2d' : '3d';
    applyMode();
  });
  requestAnimationFrame(loop);

  // ドラッグ＆ドロップ（どこに落としても読む。ほかのページに移らないようにする）
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0], it = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
    // 上書きの先（Edge・Chrome）。drop の中ですぐ聞かないと、あとでは取れない
    var hp = null;
    try { hp = it && it.getAsFileSystemHandle ? it.getAsFileSystemHandle() : null; } catch (er) { hp = null; }
    if (f) loadFile(f, hp);
  });
  window.DocVisualizer = {
    version: '__VERSION__',
    // 試験用に「見るだけ」のもの（中の動きは変えない）
    where3d: function (d, i) { var sc = state.scenes[d]; return sc ? sc.project(i, sc.canvas) : null; },
    pptx: function () { return lastPptx; },
    // 3D で、図のいちばん小さい文字が画面で何 px に見えるか
    text3d: function (d) { var sc = state.scenes[d], c = sc && sc.canvas; return sc ? +(sc.textScale(c.clientWidth, c.clientHeight) * minFont($('dg' + d).querySelector('.svg-wrap svg').outerHTML)).toFixed(1) : null; },
    mode: function () { return state.mode; },
    text: function () { return state.text; },
    drop3d: function (d) { var sc = state.scenes[d]; return sc && sc.dropShown ? sc.dropShown() : null; },
    canUndo: function () { return [state.undo.length, state.redo.length]; },
    dirty: isDirty
  };
})();
