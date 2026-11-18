// PowerPoint（16:9）を作る。図は 2D の SVG を、あとで直せる図形と文字に1つずつ置きかえる（どの種類も同じ道）。
// 文字は 11pt を下まわらない。入りきらない図はスライドを分ける（左から右・上から下）。
(function (root) {
  'use strict';
  var FONT = 'Yu Gothic UI';
  var SW = 13.333, SH = 7.5;                       // スライドの大きさ（インチ）
  var AX = 0.4, AY = 1.05, AW = 12.53, AH = 5.5;   // 図を置く枠
  var MIN_PT = 11, MAX_S = 2 / 96;                 // 小さい図は大きくしすぎない（画面の 2 倍まで）
  var EMPTY = { type: 'none' };

  function col(c) {
    if (!c || c === 'none' || c === 'transparent') return null;
    c = String(c).trim();
    if (/^#[0-9a-f]{3}$/i.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
    if (c === 'white') return 'FFFFFF';
    if (c === 'black') return '000000';
    return null;
  }
  function num(el, a, d) { var v = parseFloat(el.getAttribute(a)); return isFinite(v) ? v : (d || 0); }

  // Windows で使えない文字は _ に。予約の名前（CON など）は前に _ を足す
  function fileName(title) {
    var n = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[\s.]+$/, '').trim().slice(0, 100);
    if (!n) n = 'DocVisualizer';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) n = '_' + n;
    return n + '.pptx';
  }

  // SVG の path（M・L・C・Z だけ。render2d.js が出すもの）→ 区切りの列
  function parsePath(d) {
    var t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [], i = 0, out = [], cmd = '';
    function n() { return parseFloat(t[i++]); }
    while (i < t.length) {
      if (/[MLCZ]/i.test(t[i])) cmd = t[i++].toUpperCase();
      if (cmd === 'M') { out.push({ m: 1, x: n(), y: n() }); cmd = 'L'; }
      else if (cmd === 'L') out.push({ x: n(), y: n() });
      else if (cmd === 'C') out.push({ c: [n(), n(), n(), n()], x: n(), y: n() });
      else if (cmd === 'Z') { out.push({ z: 1 }); cmd = ''; }
      else i++;
    }
    return out;
  }
  function bez(p0, c, p, t) {
    var u = 1 - t;
    return { x: u * u * u * p0.x + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * p.x, y: u * u * u * p0.y + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * p.y };
  }
  // 線分を枠で切る（Liang–Barsky）
  function clipSeg(a, b, R) {
    var t0 = 0, t1 = 1, dx = b.x - a.x, dy = b.y - a.y, p = [-dx, dx, -dy, dy], q = [a.x - R.x, R.x + R.w - a.x, a.y - R.y, R.y + R.h - a.y];
    for (var k = 0; k < 4; k++) {
      if (p[k] === 0) { if (q[k] < 0) return null; continue; }
      var r = q[k] / p[k];
      if (p[k] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
  }
  function inside(p, R) { return p.x >= R.x - 0.5 && p.x <= R.x + R.w + 0.5 && p.y >= R.y - 0.5 && p.y <= R.y + R.h + 0.5; }
  function hits(b, R) { return b.x < R.x + R.w && b.x + b.width > R.x && b.y < R.y + R.h && b.y + b.height > R.y; }
  function center(b) { return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }

  // 1つの図を、枠 R（SVG の単位）の分だけ、スライドに図形として置く。s は 1 単位あたりのインチ
  function drawSvg(pptx, slide, svg, R, s, ox, oy) {
    var X = function (x) { return ox + (x - R.x) * s; }, Y = function (y) { return oy + (y - R.y) * s; };
    var pt = function (u) { return Math.max(0.25, u * s * 72); };
    var count = 0;
    var els = svg.querySelectorAll('rect, circle, line, path, text');
    // 箱・矢印の言葉は、ひとまとまりで同じスライドに（真ん中がある方）
    function groupOf(el) { return el.closest('g.item, g.edge-label'); }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('defs')) continue;
      var g = groupOf(el);
      if (g) {
        var gb = g.__bb || (g.__bb = g.getBBox());
        if (!inside(center(gb), { x: R.x, y: R.y, w: R.w - 0.01, h: R.h - 0.01 })) continue;
      }
      var tag = el.tagName.toLowerCase(), fill = col(el.getAttribute('fill')), stroke = col(el.getAttribute('stroke'));
      var op = el.getAttribute('opacity') != null ? +el.getAttribute('opacity') : 1;
      var line = stroke ? { color: stroke, width: pt(num(el, 'stroke-width', 1)) } : EMPTY;
      if (stroke && el.getAttribute('stroke-dasharray')) line.dashType = num(el, 'stroke-dasharray') <= 2 ? 'sysDot' : 'dash';
      var fillO = fill ? { color: fill, transparency: Math.round((1 - op) * 100) } : { type: 'none' };
      if (el.classList.contains('deco')) continue;   // 別の手順の縦線は、PowerPoint の形が持っている
      if (el.getAttribute('data-shape') && pptx.ShapeType[el.getAttribute('data-shape')]) {
        // フローチャートの形は、PowerPoint のフローチャートの図形にする（あとで形を変えられる）
        var fb = el.getBBox();
        slide.addShape(pptx.ShapeType[el.getAttribute('data-shape')], { x: X(fb.x), y: Y(fb.y), w: fb.width * s, h: fb.height * s, fill: fillO, line: line });
        count++;
        continue;
      }
      if (tag === 'rect') {
        var x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height'), rx = num(el, 'rx');
        if (!g) {   // 帯・背景などは、枠で切る
          var x0 = Math.max(x, R.x), y0 = Math.max(y, R.y), x1 = Math.min(x + w, R.x + R.w), y1 = Math.min(y + h, R.y + R.h);
          if (x1 <= x0 || y1 <= y0) continue;
          x = x0; y = y0; w = x1 - x0; h = y1 - y0;
        }
        slide.addShape(rx > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x: X(x), y: Y(y), w: w * s, h: h * s, fill: fillO, line: line, rectRadius: rx > 0 ? Math.min(rx, w / 2, h / 2) * s : undefined });
        count++;
      } else if (tag === 'circle') {
        var cx = num(el, 'cx'), cy = num(el, 'cy'), r = num(el, 'r');
        if (!g && !inside({ x: cx, y: cy }, R)) continue;
        slide.addShape(pptx.ShapeType.ellipse, { x: X(cx - r), y: Y(cy - r), w: 2 * r * s, h: 2 * r * s, fill: fillO, line: line });
        count++;
      } else if (tag === 'line') {
        var c = clipSeg({ x: num(el, 'x1'), y: num(el, 'y1') }, { x: num(el, 'x2'), y: num(el, 'y2') }, R);
        if (!c || (c[0].x === c[1].x && c[0].y === c[1].y)) continue;
        slide.addShape(pptx.ShapeType.line, { x: X(Math.min(c[0].x, c[1].x)), y: Y(Math.min(c[0].y, c[1].y)), w: Math.abs(c[1].x - c[0].x) * s, h: Math.abs(c[1].y - c[0].y) * s,
          flipH: (c[1].x < c[0].x) !== (c[1].y < c[0].y) && c[1].x !== c[0].x && c[1].y !== c[0].y, line: line });
        count++;
      } else if (tag === 'path') {
        count += drawPath(pptx, slide, el, R, s, X, Y, fillO, line);
      } else if (tag === 'text') {
        count += drawText(slide, el, R, s, X, Y, !!g);
      }
    }
    return count;
  }

  function drawPath(pptx, slide, el, R, s, X, Y, fillO, line) {
    var segs = parsePath(el.getAttribute('d') || ''), arrow = /url\(#arw[^)]*\)/.test(el.getAttribute('marker-end') || '');
    if (!segs.length) return 0;
    var bb = el.getBBox(), whole = bb.x >= R.x - 0.5 && bb.y >= R.y - 0.5 && bb.x + bb.width <= R.x + R.w + 0.5 && bb.y + bb.height <= R.y + R.h + 0.5;
    var pts = [], last = null;
    if (whole) {   // 枠に入る線は、曲線のまま（あとで直せる）
      segs.forEach(function (q) { if (q.z) pts.push({ close: true }); else if (q.c) pts.push({ x: q.x, y: q.y, c: q.c }); else pts.push({ x: q.x, y: q.y, moveTo: !!q.m }); if (!q.z) last = q; });
    } else {       // 枠をまたぐ線は、細かい折れ線にして枠で切る（はみ出さない）
      if (segs.some(function (q) { return q.z; })) { if (!inside(center(bb), R)) return 0; }
      var poly = [], cur = null;
      segs.forEach(function (q) {
        if (q.z) return;
        if (q.m) { cur = q; poly.push([{ x: q.x, y: q.y }]); return; }
        var arr = poly[poly.length - 1];
        if (q.c) for (var k = 1; k <= 24; k++) arr.push(bez(cur, q.c, q, k / 24)); else arr.push({ x: q.x, y: q.y });
        cur = q;
      });
      poly.forEach(function (arr) {
        var open = false;
        for (var k = 1; k < arr.length; k++) {
          var c = clipSeg(arr[k - 1], arr[k], R);
          if (!c) { open = false; continue; }
          if (!open) pts.push({ x: c[0].x, y: c[0].y, moveTo: true });
          pts.push({ x: c[1].x, y: c[1].y });
          open = c[1].x === arr[k].x && c[1].y === arr[k].y;
        }
      });
      if (!pts.length) return 0;
      var endP = segs[segs.length - 1];
      arrow = arrow && inside(endP, R);
    }
    // 形の左上とはば（制御点もふくめる）
    var xs = [], ys = [];
    pts.forEach(function (p) { if (p.close) return; xs.push(p.x); ys.push(p.y); if (p.c) { xs.push(p.c[0], p.c[2]); ys.push(p.c[1], p.c[3]); } });
    var mx = Math.min.apply(null, xs), my = Math.min.apply(null, ys), w = Math.max(0.01, (Math.max.apply(null, xs) - mx) * s), h = Math.max(0.01, (Math.max.apply(null, ys) - my) * s);
    var rel = function (v, m) { return (v - m) * s; };
    var points = pts.map(function (p) {
      if (p.close) return { close: true };
      if (p.c) return { x: rel(p.x, mx), y: rel(p.y, my), curve: { type: 'cubic', x1: rel(p.c[0], mx), y1: rel(p.c[1], my), x2: rel(p.c[2], mx), y2: rel(p.c[3], my) } };
      return p.moveTo ? { x: rel(p.x, mx), y: rel(p.y, my), moveTo: true } : { x: rel(p.x, mx), y: rel(p.y, my) };
    });
    if (arrow && line !== EMPTY) line.endArrowType = 'triangle';
    if (line !== EMPTY && /url\(#arw[^)]*\)/.test(el.getAttribute('marker-start') || '')) line.beginArrowType = 'triangle';
    slide.addShape(pptx.ShapeType.custGeom, { x: X(mx), y: Y(my), w: w, h: h, points: points, fill: fillO, line: line });
    return 1;
  }

  function drawText(slide, el, R, s, X, Y, grouped) {
    var b = el.getBBox();
    if (!b.width) return 0;
    if (!grouped && !inside(center(b), { x: R.x, y: R.y, w: R.w - 0.01, h: R.h - 0.01 })) return 0;
    var ts = el.querySelectorAll('tspan'), lines = ts.length ? Array.prototype.map.call(ts, function (t) { return t.textContent; }) : [el.textContent];
    var fs = num(el, 'font-size', 15), anchor = el.getAttribute('text-anchor') || 'start';
    // PowerPoint の字体の幅は少しちがうので、箱は広めにとり、折り返さない（真ん中・左・右の位置はそのまま）
    var pad = Math.max(b.width * 0.25, fs * 1.5), w = b.width + pad, x = anchor === 'middle' ? b.x - pad / 2 : anchor === 'end' ? b.x - pad : b.x;
    slide.addText(lines.join('\n'), { x: X(x), y: Y(b.y), w: w * s, h: b.height * s, fontFace: FONT, fontSize: Math.round(fs * s * 72 * 10) / 10, bold: el.getAttribute('font-weight') === 'bold',
      color: col(el.getAttribute('fill')) || '1F2A37', align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', valign: 'middle', margin: 0, wrap: false, lineSpacingMultiple: 1.1 });
    return 1;
  }

  function minFont(svg) { var v = Infinity; Array.prototype.forEach.call(svg.querySelectorAll('text'), function (t) { v = Math.min(v, num(t, 'font-size', 15)); }); return isFinite(v) ? v : 15; }

  // 全体：data = { title, secret, cards:[{head,text}], list:[名前], diagrams:[{name, svg（文字列）, legend, capture}], notes:[{title,text,src}] }
  // グラフは PowerPoint のグラフにする（あとで数字を直せる）。d.chart = { type, unit, labels, series: [{ name, values }] }
  var CHART_KIND = { pie: 'pie', donut: 'doughnut', line: 'line', hbar: 'bar', stacked: 'bar' };
  function chartSlide(pptx, sl, d) {
    var c = d.chart, pal = c.colors.map(function (x) { return x.replace('#', '').toUpperCase(); });
    sl.addText(d.name + (c.unit ? '（' + c.unit + '）' : ''), { x: AX, y: 0.3, w: 9.6, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: '1F2A37', margin: 0 });
    var round = c.type === 'pie' || c.type === 'donut';
    var o = {
      x: AX, y: AY, w: AW, h: AH, chartColors: pal,
      showLegend: round || c.series.length > 1, legendPos: round ? 'r' : 'b', legendFontFace: FONT, legendFontSize: 14,
      showValue: !round, showPercent: round, dataLabelFontFace: FONT, dataLabelFontSize: 12,
      catAxisLabelFontFace: FONT, catAxisLabelFontSize: 13, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 12,
      showTitle: false
    };
    if (c.type === 'hbar') { o.barDir = 'bar'; o.catAxisOrientation = 'maxMin'; }
    if (c.type === 'stacked') { o.barDir = 'col'; o.barGrouping = 'stacked'; }
    if (c.type === 'donut') o.holeSize = 55;
    if (c.type === 'line') { o.lineSize = 3; o.lineDataSymbolSize = 8; }
    sl.addChart(pptx.ChartType[CHART_KIND[c.type]], c.series.map(function (sr) { return { name: sr.name, labels: c.labels, values: sr.values.map(function (v) { return v == null ? null : v; }) }; }), o);
    if (d.legend) sl.addText(d.legend, { x: AX, y: 6.62, w: AW, h: 0.36, fontFace: FONT, fontSize: 12, color: '5B6675', margin: 0 });
  }

  function build(data) {
    var pptx = new root.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = data.title;
    pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
    var plans = [], stats = { shapes: 0, tiles: [], pics: 0 };
    // 箱の文字幅を測るため、見えない所に SVG を置く
    var host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
    document.body.appendChild(host);
    try {
      plans.push(function (sl) {
        sl.addText(data.title, { x: 0.6, y: 1.2, w: SW - 1.2, h: 1.2, fontFace: FONT, fontSize: 32, bold: true, color: '1F2A37', valign: 'middle', fit: 'none' });
        var y = 2.7;
        data.cards.forEach(function (c) {
          sl.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: y, w: SW - 1.2, h: 1.05, fill: { color: c.kind === 'conclusion' ? 'EAF1FD' : c.kind === 'todo' ? 'E3F5EA' : 'F4F6FA' }, line: EMPTY, rectRadius: 0.12 });
          sl.addText([{ text: c.head + '\n', options: { fontSize: 13, bold: true, color: '5B6675' } }, { text: c.text, options: { fontSize: 18, color: '1F2A37' } }],
            { x: 0.8, y: y + 0.05, w: SW - 1.6, h: 0.95, fontFace: FONT, valign: 'middle', margin: 0, fit: 'shrink' });
          y += 1.2;
        });
        if (data.list.length) sl.addText('図：' + data.list.join('　／　'), { x: 0.6, y: Math.min(y + 0.1, 6.4), w: SW - 1.2, h: 0.5, fontFace: FONT, fontSize: 13, color: '5B6675', margin: 0 });
      });
      function capSlide(d) {
        return function (sl) {
          sl.addText(d.name + '（3D）', { x: AX, y: 0.3, w: 9.6, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: '1F2A37', margin: 0 });
          var h = AH, w = h * 16 / 9;
          stats.pics++;
          sl.addImage({ data: d.capture, x: (SW - w) / 2, y: AY, w: w, h: h, altText: d.name + ' の 3D の絵' });
        };
      }
      data.diagrams.forEach(function (d) {
        if (d.chart) { plans.push(function (sl) { chartSlide(pptx, sl, d); stats.shapes++; }); }
        if (d.chart) { if (d.capture) plans.push(capSlide(d)); return; }
        host.innerHTML = d.svg;
        var svg = host.querySelector('svg'), W = num(svg, 'data-w'), H = num(svg, 'data-h');
        var s = Math.min(AW / W, AH / H, MAX_S), sMin = MIN_PT / 72 / minFont(svg);
        if (s < sMin) s = sMin;
        var tw = AW / s, th = AH / s, nx = Math.ceil(W / tw - 0.02), ny = Math.ceil(H / th - 0.02), n = nx * ny;
        stats.tiles.push(n);
        for (var ty = 0; ty < ny; ty++) for (var tx = 0; tx < nx; tx++) (function (R, k) {
          // その場で描けるよう、いまの SVG を写しておく（host はつぎの図で書きかわる）
          var mine = svg.cloneNode(true);
          plans.push(function (sl) {
            host.innerHTML = ''; host.appendChild(mine);
            var w = Math.min(R.w, W - R.x) * s, h = Math.min(R.h, H - R.y) * s;
            sl.addText(d.name + (n > 1 ? '（' + k + '/' + n + '）' : ''), { x: AX, y: 0.3, w: 9.6, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: '1F2A37', margin: 0 });
            stats.shapes += drawSvg(pptx, sl, mine, R, s, AX + (AW - w) / 2, AY + (AH - h) / 2);
            if (d.legend) sl.addText(d.legend, { x: AX, y: 6.62, w: AW, h: 0.36, fontFace: FONT, fontSize: 12, color: '5B6675', margin: 0 });
          });
        })({ x: tx * tw, y: ty * th, w: tw, h: th }, ty * nx + tx + 1);
        if (d.capture) plans.push(capSlide(d));
      });
      // 箱の説明：1つずつ。長いものは字数でスライドを分ける
      data.notes.forEach(function (nt) {
        var rows = [], budget = 700;
        nt.text.split('\n').forEach(function (ln) { for (var p = 0; p === 0 || p < ln.length; p += 500) rows.push(ln.slice(p, p + 500)); });
        var parts = [], cur = [], used = 0;
        rows.forEach(function (r) { if (cur.length && used + r.length + 40 > budget) { parts.push(cur); cur = []; used = 0; } cur.push(r); used += r.length + 40; });
        parts.push(cur);
        parts.forEach(function (rs, k) {
          plans.push(function (sl) {
            sl.addText(nt.title + (k ? '（つづき）' : ''), { x: AX, y: 0.3, w: 9.6, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: '1F2A37', margin: 0 });
            if (rs.join('').trim()) sl.addText(rs.join('\n'), { x: AX, y: AY, w: AW, h: 4.9, fontFace: FONT, fontSize: 16, color: '1F2A37', valign: 'top', margin: 0, paraSpaceAfter: 4 });
            if (nt.src && k === parts.length - 1) sl.addText(nt.src, { x: AX, y: 6.1, w: AW, h: 0.5, fontFace: FONT, fontSize: 12, color: '5B6675', margin: 0, valign: 'bottom' });
          });
        });
      });
      // 本文：PDF と同じ中身。見出しごとに続けて入れ、あふれたらスライドを分ける（長い1つは行で、長い行は字で切る）
      var bpages = [], bcur = [], bused = 0, BUDGET = 700;
      var bflush = function () { if (bcur.length) bpages.push(bcur); bcur = []; bused = 0; };
      (data.body || []).forEach(function (b) {
        var rows = [], first = true;
        b.text.split('\n').forEach(function (ln) { for (var p = 0; p === 0 || p < ln.length; p += 500) rows.push(ln.slice(p, p + 500)); });
        if (!b.text) rows = [];
        while (rows.length || first) {
          var part = [], cost = 60;
          while (rows.length && (!part.length || cost + rows[0].length + 40 <= BUDGET - bused)) { cost += rows[0].length + 40; part.push(rows.shift()); }
          if (bused && bused + cost > BUDGET) { rows = part.concat(rows); bflush(); continue; }   // 次のスライドへ（取った行は戻す）
          bcur.push({ title: b.title ? b.title + (first ? '' : '（つづき）') : '', rows: part });
          bused += cost; first = false;
          if (rows.length) bflush();
        }
      });
      bflush();
      bpages.forEach(function (pg, k) {
        plans.push(function (sl) {
          sl.addText('本文' + (bpages.length > 1 ? '（' + (k + 1) + '/' + bpages.length + '）' : ''), { x: AX, y: 0.3, w: 9.6, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: '1F2A37', margin: 0 });
          var runs = [];
          pg.forEach(function (e) {
            if (e.title) runs.push({ text: e.title, options: { fontSize: 18, bold: true, breakLine: true, paraSpaceBefore: runs.length ? 8 : 0 } });
            e.rows.forEach(function (r) { runs.push({ text: r, options: { fontSize: 16, breakLine: true } }); });
          });
          if (runs.length) sl.addText(runs, { x: AX, y: AY, w: AW, h: 5.5, fontFace: FONT, color: '1F2A37', valign: 'top', margin: 0, paraSpaceAfter: 4 });
        });
      });
      stats.bodySlides = bpages.length;
      var N = plans.length;
      plans.forEach(function (f, i) {
        var sl = pptx.addSlide();
        sl.background = { color: 'FFFFFF' };
        f(sl);
        if (data.secret) sl.addText(data.secret, { x: SW - 3.1, y: 0.3, w: 2.7, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: 'D64545', align: 'center', valign: 'middle', line: { color: 'D64545', width: 1.5 }, margin: 0, objectName: 'secret' });
        sl.addText(data.title, { x: AX, y: 7.0, w: 9, h: 0.35, fontFace: FONT, fontSize: 11, color: '8A94A3', margin: 0 });
        sl.addText((i + 1) + ' / ' + N, { x: SW - 2.4, y: 7.0, w: 2.0, h: 0.35, fontFace: FONT, fontSize: 11, color: '8A94A3', align: 'right', margin: 0 });
      });
      stats.slides = N;
    } finally {
      host.remove();
    }
    return { pptx: pptx, stats: stats, fileName: fileName(data.title) };
  }

  root.DocPptx = { build: build, fileName: fileName, parsePath: parsePath, clipSeg: clipSeg };
})(typeof window !== 'undefined' ? window : globalThis);
