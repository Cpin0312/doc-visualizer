/* DocVisualizer の画面。読みとりは DocParse、2D は DocRender。
 * 職場の資料を残さないため、localStorage などには何も保存しない。
 */
(function () {
  'use strict';
  var P = window.DocParse, R = window.DocRender, esc = R.esc;
  var SAMPLES = window.DV_SAMPLES || [], PROMPT = window.DV_PROMPT || '';
  var MAX_BYTES = 5 * 1024 * 1024;
  var OK_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
  var $ = function (id) { return document.getElementById(id); };
  var state = { doc: null, fileName: '', fs: 15, sel: null, meta: '' };

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
  function loadFile(file) {
    if (!file) return;
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
      show(dec.text, file.name, dec.encoding + '・改行 ' + eol, dec.warn);
    }).catch(function (e) { showError('読みこめませんでした：' + (e && e.message || e)); });
  }

  function show(text, fileName, meta, decodeWarn) {
    var doc;
    try { doc = P.parseDoc(text); } catch (e) { showError('読みとりの途中で止まりました：' + e.message + '。画面は前のままです。'); return; }
    if (decodeWarn) doc.warnings.unshift({ line: 0, msg: decodeWarn, kind: 'fix' });
    showError('');
    state.doc = doc; state.fileName = fileName; state.meta = meta; state.sel = null;
    closePanel();
    render();
    window.scrollTo(0, 0);
  }

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
    document.documentElement.style.setProperty('--fs', state.fs + 'px');
    $('status').textContent = '読みこみ：' + state.fileName + '（' + state.meta + '）・図 ' + doc.diagrams.length + ' つ';
    $('title').textContent = title(doc);
    document.title = title(doc) + ' － 資料を図にする';
    var sec = $('secret'); sec.hidden = !doc.secret; sec.textContent = doc.secret;
    $('cards').innerHTML = cardsHtml(doc);
    var hn = hasNoteFn(doc), td = today();
    $('diagrams').innerHTML = doc.diagrams.map(function (d, i) {
      return '<section class="diagram-box" id="dg' + i + '"><h2>' + esc(d.name || P.TYPES[d.type].label) + '<span class="kind">' + esc(P.TYPES[d.type].label) + '・' + d.items.length + '</span></h2>' +
        '<div class="svg-wrap">' + R.svg(d, i, { fs: state.fs, today: td, hasNote: hn }) + '</div></section>';
    }).join('');
    // 横に長い図は、小さくしすぎずに横へ動かして見る
    Array.prototype.forEach.call(document.querySelectorAll('.svg-wrap'), function (w) {
      var s = w.querySelector('svg'), sw = +s.getAttribute('data-w');
      if (w.clientWidth && sw / w.clientWidth > 1.8) w.classList.add('wide');
    });
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
    state.sel = { d: d, i: i };
    var n = noteFor(it.key), h = '<h2>' + esc(it.label) + '</h2>';
    h += it.marks.map(function (m) { return '<span class="badge ' + m.kind + '">' + esc(m.text) + '</span>'; }).join('');
    var extra = [];
    if (it.dateText) extra.push('日付：' + esc(it.dateText) + (it.end ? '（' + esc(it.end) + ' まで）' : ''));
    if (it.valueText) extra.push('数字：' + esc(it.valueText) + (diag.unit ? '（' + esc(diag.unit) + '）' : '') + (it.note ? '\u3000' + esc(it.note) : ''));
    if (it.lane) extra.push('担当：' + esc(it.lane));
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
    $('panelBody').innerHTML = h;
    $('panel').hidden = false;
  }
  function closePanel() {
    $('panel').hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('.item.sel'), function (e) { e.classList.remove('sel'); });
    state.sel = null;
  }

  // ---- 印刷（PDF）用のページ。いつも作っておく（Ctrl+P でも同じものが出る） ----
  function buildPrint(doc) {
    var pages = [], t = esc(title(doc)), hn = hasNoteFn(doc), td = today();
    var cover = '<h1>' + t + '</h1><div class="cards">' + cardsHtml(doc) + '</div>';
    if (doc.diagrams.length) cover += '<div class="p-list"><b>図</b><ol>' + doc.diagrams.map(function (d) { return '<li>' + esc(d.name || P.TYPES[d.type].label) + '（' + P.TYPES[d.type].label + '）</li>'; }).join('') + '</ol></div>';
    pages.push(cover);
    doc.diagrams.forEach(function (d, i) {
      var legend = legendItems(doc, [d]).join('\u3000');
      pages.push('<h2>' + esc(d.name || P.TYPES[d.type].label) + '（' + P.TYPES[d.type].label + '）</h2><div class="p-fig">' +
        R.svg(d, i, { fs: 15, today: td, hasNote: hn }) + '</div>' + (legend ? '<div class="p-legend">' + legend + '</div>' : ''));
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
    var notes = [], seen = {};
    doc.diagrams.forEach(function (d) {
      d.items.forEach(function (it) {
        var n = noteFor(it.key);
        if ((!(n && n.lines.length) && !it.sources.length) || seen[it.key]) return;
        seen[it.key] = true;
        notes.push({ title: it.label, text: n ? n.lines.map(lineText).join('\n').trim() : '', src: it.sources.length ? '出どころ：' + it.sources.join('／') : '' });
      });
    });
    paginate('箱の説明と出どころ', notes);
    paginate('本文', doc.body.map(function (b) { return { title: b.heading || '', text: b.lines.map(lineText).join('\n').trim(), src: '' }; })
      .filter(function (b) { return b.title || b.text; }));
    var N = pages.length;
    $('print').innerHTML = pages.map(function (p, i) {
      return '<section class="page">' + (doc.secret ? '<div class="p-secret">' + esc(doc.secret) + '</div>' : '') + p +
        '<div class="p-foot"><span>' + t + '</span><span>' + (i + 1) + ' / ' + N + '</span></div></section>';
    }).join('');
    // 図をページの枠（約 1000×560px）に合わせる。小さい図は大きくしすぎない（1.6 倍まで）
    Array.prototype.forEach.call($('print').querySelectorAll('.p-fig svg'), function (s) {
      var w = +s.getAttribute('data-w'), h = +s.getAttribute('data-h'), k = Math.min(1000 / w, 560 / h, 1.6);
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
    if (s) show(s.text, s.name, '見本', '');
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
  $('pdf').addEventListener('click', function () {
    if (!state.doc) return;
    toast('印刷の窓で、送り先を「PDF に保存」に、用紙を「A4・横」にしてください', 7000);
    setTimeout(function () {
      try { window.print(); } catch (e) { showError('印刷を始められませんでした：' + e.message); }
    }, 300);
  });
  $('copyPrompt').addEventListener('click', function () {
    copyText(PROMPT).then(function (ok) {
      if (ok) toast('Copilot 用の指示をコピーしました。Copilot に貼り、続けて資料を渡してください');
      else showError('コピーできませんでした。copilot-prompt.md を開いて、中身をコピーしてください。');
    });
  });
  $('diagrams').addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('.item');
    if (g) openItem(+g.getAttribute('data-d'), +g.getAttribute('data-i'));
  });
  $('diagrams').addEventListener('keydown', function (e) {
    var g = e.target.closest && e.target.closest('.item');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openItem(+g.getAttribute('data-d'), +g.getAttribute('data-i')); }
  });
  $('panelClose').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

  // ドラッグ＆ドロップ（どこに落としても読む。ほかのページに移らないようにする）
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.DocVisualizer = { version: '__VERSION__' };
})();
