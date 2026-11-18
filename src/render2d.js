/* DocVisualizer の 2D（SVG）。WebGL がないときの代わりで、PDF と PowerPoint の元にもなる。
 * DocRender.svg(diag, diagIndex, opts) → SVG の文字列
 *   opts: { fs: 文字の大きさ(px), today: 'YYYY-MM-DD', hasNote: function(key) }
 * 箱（押せるもの）はすべて <g class="item" data-d data-i>。
 */
(function (root) {
  'use strict';

  var FONT = '"Yu Gothic UI", "Meiryo", "Hiragino Sans", system-ui, sans-serif';
  var C = {
    text: '#1f2a37', sub: '#5b6675', box: '#ffffff', line: '#5b7db1', edge: '#8a9bb5',
    accent: '#3b6fd8', red: '#d64545', yellow: '#c98f00', green: '#2f9e5b',
    redBg: '#fde4e4', yellowBg: '#fff4d6', greenBg: '#e3f5ea', bestBg: '#cdeedb',
    lane: ['#eef3fb', '#f7f9fc'], head: '#e8eef8', grid: '#e3e8ef'
  };
  var MARK_COLOR = { red: C.red, yellow: C.yellow, green: C.green };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // 文字の幅は、その PC の字体で本当に測る（Windows の游ゴシックとメイリオは幅が違う）
  var ctx = null, cache = {};
  function tw(s, fs, bold) {
    var k = fs + (bold ? 'b' : '') + '|' + s;
    if (cache[k] != null) return cache[k];
    if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    var w;
    if (ctx) { ctx.font = (bold ? 'bold ' : '') + fs + 'px ' + FONT; w = ctx.measureText(s).width; }
    else w = Array.from(s).reduce(function (a, c) { return a + (c.charCodeAt(0) < 256 ? 0.6 : 1) * fs; }, 0);
    return (cache[k] = w * 1.06);   // 字体の差に少し余裕を持たせる
  }

  // 幅 maxW に収まるよう折り返す（英数字の単語はなるべく切らない）。maxLines を超えたら「…」
  function wrap(s, fs, maxW, maxLines, bold) {
    var tokens = String(s).match(/[A-Za-z0-9.,%+\-_/@#&]+|\s+|./g) || [''];
    var lines = [], cur = '';
    tokens.forEach(function (t) {
      if (tw(cur + t, fs, bold) <= maxW || !cur) {
        if (tw(cur + t, fs, bold) > maxW && t.length > 1) {   // 1語が長すぎる → 文字で切る
          Array.from(t).forEach(function (ch) { if (tw(cur + ch, fs, bold) > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; });
        } else cur += t;
      } else { lines.push(cur.replace(/\s+$/, '')); cur = t.replace(/^\s+/, ''); }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var l = lines[maxLines - 1];
      while (l && tw(l + '…', fs, bold) > maxW) l = l.slice(0, -1);
      lines[maxLines - 1] = l + '…';
    }
    return lines;
  }
  function textW(lines, fs, bold) { return Math.max.apply(null, lines.map(function (l) { return tw(l, fs, bold); }).concat([0])); }

  function textEl(lines, x, cy, fs, o) {
    o = o || {};
    var lh = fs * 1.3, y0 = cy - (lines.length - 1) * lh / 2;
    return '<text x="' + r(x) + '" y="' + r(y0) + '" font-size="' + fs + '" text-anchor="' + (o.anchor || 'middle') + '" dominant-baseline="central"' +
      ' fill="' + (o.fill || C.text) + '"' + (o.bold ? ' font-weight="bold"' : '') + '>' +
      lines.map(function (l, i) { return '<tspan x="' + r(x) + '" dy="' + (i ? r(lh) : 0) + '">' + esc(l) + '</tspan>'; }).join('') + '</text>';
  }
  function r(n) { return Math.round(n * 10) / 10; }

  function badges(it, x, y, fs, alignRight) {
    // 印（!期限 など）を箱の上に小さな札で出す
    var out = '', bx = x, f = Math.max(11, Math.round(fs * 0.78));
    var list = it.marks.map(function (m) { return { m: m, w: tw(m.text, f, true) + 12 }; });
    if (alignRight) bx = x - list.reduce(function (a, b) { return a + b.w + 4; }, 0) + 4;
    list.forEach(function (b) {
      out += '<g class="mark mark-' + b.m.kind + '"><rect x="' + r(bx) + '" y="' + r(y - f - 6) + '" width="' + r(b.w) + '" height="' + (f + 6) + '" rx="' + ((f + 6) / 2) + '" fill="' + MARK_COLOR[b.m.kind] + '"/>' +
        '<text x="' + r(bx + b.w / 2) + '" y="' + r(y - (f + 6) / 2) + '" font-size="' + f + '" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="bold">' + esc(b.m.text) + '</text></g>';
      bx += b.w + 4;
    });
    return out;
  }
  function strongest(it) {
    var k = it.marks.map(function (m) { return m.kind; });
    return k.indexOf('red') >= 0 ? 'red' : k.indexOf('yellow') >= 0 ? 'yellow' : k.indexOf('green') >= 0 ? 'green' : '';
  }
  function info(it, opts) { return it.sources.length || (opts.hasNote && opts.hasNote(it.key)); }
  function cornerDot(x, y) { return '<path class="info" d="M' + r(x - 12) + ' ' + r(y) + ' L' + r(x) + ' ' + r(y) + ' L' + r(x) + ' ' + r(y + 12) + ' Z" fill="' + C.accent + '"/>'; }

  function itemOpen(d, it, extra) {
    return '<g class="item" data-d="' + d + '" data-i="' + it.id + '" tabindex="0" role="button" aria-label="' + esc(it.label) + '"' + (extra || '') + '>';
  }

  // 箱（flow・lanes・tree 共通）
  function measureBox(it, fs, maxW) {
    var lines = wrap(it.label, fs, maxW, 3);
    var w = Math.max(textW(lines, fs) + fs * 1.6, fs * 5, it.marks.length ? it.marks.reduce(function (a, m) { return a + tw(m.text, Math.max(11, Math.round(fs * 0.78)), true) + 16; }, 0) : 0);
    return { lines: lines, w: w, h: lines.length * fs * 1.3 + fs * 1.4 };
  }
  function drawBox(d, it, b, opts) {
    var k = strongest(it), stroke = k ? MARK_COLOR[k] : C.line, fill = k === 'red' ? '#fff7f7' : k === 'green' ? '#f6fcf8' : k === 'yellow' ? '#fffcf2' : C.box;
    return itemOpen(d, it) +
      '<rect class="box" x="' + r(b.x) + '" y="' + r(b.y) + '" width="' + r(b.w) + '" height="' + r(b.h) + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (k ? 2.5 : 1.6) + '"/>' +
      (info(it, opts) ? cornerDot(b.x + b.w - 1, b.y + 1) : '') +
      textEl(b.lines, b.x + b.w / 2, b.y + b.h / 2, opts.fs) +
      badges(it, b.x + b.w, b.y - 3, opts.fs, true) + '</g>';
  }

  // id は SVG を作るたびに別のものにする（同じ id が2つあると、隠れた方を参照して矢印の頭が消える。印刷・発表・3D で写すときも uniq を通す）
  var seq = 0, ARW = 'arw';
  function uniq(str) {
    var map = {};
    str = str.replace(/\bid="([^"]+)"/g, function (m, id) { var n = id.replace(/-u\d+$/, '') + '-u' + (++seq); map[id] = n; return 'id="' + n + '"'; });
    return str.replace(/url\(#([^)]+)\)|href="#([^"]+)"/g, function (m, a, b) { var id = a || b, n = map[id]; if (!n) return m; return a ? 'url(#' + n + ')' : 'href="#' + n + '"'; });
  }
  function defs() {
    return '<defs><marker id="' + ARW + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="' + C.edge + '"/></marker></defs>';
  }
  function wrapSvg(w, h, body, cls) {
    w = Math.ceil(w); h = Math.ceil(h);
    return '<svg xmlns="http://www.w3.org/2000/svg" class="diagram ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" data-w="' + w + '" data-h="' + h + '"' +
      ' style="font-family: ' + FONT.replace(/"/g, "'") + '" role="img">' + defs() + body + '</svg>';
  }

  // ---- 流れ（段に分けて左から右へ） ----
  function layers(diag) {
    var n = diag.items.length, out = diag.items.map(function () { return []; }), inc = diag.items.map(function () { return []; });
    diag.edges.forEach(function (e) { out[e.from].push(e); inc[e.to].push(e); });
    // 輪になる矢印を見つける（DFS で戻る矢印）
    var state = [], back = {};
    function dfs(v) {
      state[v] = 1;
      out[v].forEach(function (e) {
        if (state[e.to] === 1) back[e.from + '>' + e.to] = true;
        else if (!state[e.to]) dfs(e.to);
      });
      state[v] = 2;
    }
    for (var i = 0; i < n; i++) if (!state[i] && !inc[i].length) dfs(i);
    for (i = 0; i < n; i++) if (!state[i]) dfs(i);
    var fwd = diag.edges.filter(function (e) { return !back[e.from + '>' + e.to] && e.from !== e.to; });
    var layer = diag.items.map(function () { return 0; }), changed = true, guard = 0;
    while (changed && guard++ < n + 2) {
      changed = false;
      fwd.forEach(function (e) { if (layer[e.to] < layer[e.from] + 1) { layer[e.to] = layer[e.from] + 1; changed = true; } });
    }
    return { layer: layer, back: back };
  }

  function orderInLayer(diag, layer, keyFn) {
    var cols = [];
    diag.items.forEach(function (it) { (cols[layer[it.id]] = cols[layer[it.id]] || []).push(it.id); });
    for (var c = 0; c < cols.length; c++) cols[c] = cols[c] || [];
    // 前の段のつながりの平均で並べる（2回）
    var pos = {};
    for (var pass = 0; pass < 2; pass++) {
      cols.forEach(function (col, ci) {
        if (ci > 0) {
          var bc = {};
          col.forEach(function (v) {
            var ps = diag.edges.filter(function (e) { return e.to === v && pos[e.from] != null && layer[e.from] < ci; }).map(function (e) { return pos[e.from]; });
            bc[v] = ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : (pos[v] != null ? pos[v] : 1e9);
          });
          col.sort(function (a, b) { return (keyFn ? keyFn(a) - keyFn(b) : 0) || bc[a] - bc[b] || a - b; });
        }
        col.forEach(function (v, k) { pos[v] = k; });
      });
    }
    return cols;
  }

  // 戻る矢印（下を回る線）は、どれも別の深さ yb を通す（yb はふつうの線の言葉が重ならない間かくで、呼ぶ側が決める）
  function edgePaths(diag, d, B, backY, opts) {
    var out = '', labels = '', fs = Math.max(11, Math.round(opts.fs * 0.85));
    diag.edges.forEach(function (e, ei) {
      var a = B[e.from], b = B[e.to], path, mx, my;
      if (!a || !b) return;
      if (backY[ei] != null) {
        var yb = backY[ei], x1 = a.x + a.w / 2, x2 = b.x + b.w / 2, y0 = a.y + a.h, y3 = b.y + b.h + 2;
        if (e.from === e.to) x2 = x1 + a.w / 4;
        var c = (yb - (y0 + y3) / 8) / 0.75;   // 線のまん中がちょうど yb を通るように
        path = 'M' + r(x1) + ' ' + r(y0) + ' C' + r(x1) + ' ' + r(c) + ' ' + r(x2) + ' ' + r(c) + ' ' + r(x2) + ' ' + r(y3);
        mx = (x1 + x2) / 2; my = yb;
      } else {
        var sx = a.x + a.w, sy = a.y + a.h / 2, ex = b.x - 2, ey = b.y + b.h / 2, cx = (sx + ex) / 2;
        path = 'M' + r(sx) + ' ' + r(sy) + ' C' + r(cx) + ' ' + r(sy) + ' ' + r(cx) + ' ' + r(ey) + ' ' + r(ex) + ' ' + r(ey);
        mx = cx; my = (sy + ey) / 2;
      }
      out += '<path class="edge" d="' + path + '" fill="none" stroke="' + C.edge + '" stroke-width="2" marker-end="url(#' + ARW + ')"/>';
      if (e.label) {
        var w = tw(e.label, fs) + 12;
        labels += '<g class="edge-label"><rect x="' + r(mx - w / 2) + '" y="' + r(my - fs * 0.8) + '" width="' + r(w) + '" height="' + r(fs * 1.6) + '" rx="6" fill="#fff" stroke="' + C.grid + '"/>' +
          textEl([e.label], mx, my, fs, { fill: C.sub }) + '</g>';
      }
    });
    return { paths: out, labels: labels };
  }

  function flow(diag, d, opts, laneMode) {
    var fs = opts.fs, L = layers(diag), maxW = fs * 11;
    var laneIdx = {};
    if (laneMode) diag.lanes.forEach(function (l, i) { laneIdx[l] = i; });
    var cols = orderInLayer(diag, L.layer, laneMode ? function (v) { return laneIdx[diag.items[v].lane]; } : null);
    // 戻る矢印：どの帯の下を通すか（低いほうの箱の帯）と、その帯での順番
    var step = fs * 2.1, backIdx = {}, laneBack = [], backY = {}, nBack = 0;
    diag.edges.forEach(function (e, ei) {
      if (!(L.back[e.from + '>' + e.to] || e.from === e.to || L.layer[e.from] >= L.layer[e.to])) return;
      var li = laneMode ? Math.max(laneIdx[diag.items[e.from].lane], laneIdx[diag.items[e.to].lane]) : 0;
      backIdx[ei] = { li: li, k: laneBack[li] = (laneBack[li] || 0) + 1 };
      nBack++;
    });
    var M = diag.items.map(function (it) { return measureBox(it, fs, maxW); });
    // 列の間は、矢印の言葉が入る幅にする
    var gapAfter = cols.map(function () { return fs * 4; });
    diag.edges.forEach(function (e) {
      if (e.label && L.layer[e.to] === L.layer[e.from] + 1) gapAfter[L.layer[e.from]] = Math.max(gapAfter[L.layer[e.from]], tw(e.label, Math.max(11, Math.round(fs * 0.85))) + 40);
    });
    var left = laneMode ? textW(diag.lanes.map(function (l) { return wrap(l, fs, fs * 7, 2, true); }).reduce(function (a, b) { return a.concat(b); }, []), fs, true) + fs * 2.4 : 24;
    var colX = [], x = left + 20;
    cols.forEach(function (col, ci) { colX[ci] = x; x += Math.max.apply(null, col.map(function (v) { return M[v].w; }).concat([0])) + gapAfter[ci]; });
    var width = x - gapAfter[cols.length - 1] + 30, B = [], top = 34, vgap = fs * 2.2, body = '', bottom = top;
    if (!laneMode) {
      var colH = cols.map(function (col) { return col.reduce(function (a, v) { return a + M[v].h; }, 0) + (col.length - 1) * vgap; });
      var H = Math.max.apply(null, colH.concat([0]));
      cols.forEach(function (col, ci) {
        var y = top + (H - colH[ci]) / 2, cw = Math.max.apply(null, col.map(function (v) { return M[v].w; }));
        col.forEach(function (v) { B[v] = { x: colX[ci] + (cw - M[v].w) / 2, y: y, w: M[v].w, h: M[v].h, lines: M[v].lines }; y += M[v].h + vgap; });
      });
      bottom = top + H;
    } else {
      var y = 14, bands = '';
      diag.lanes.forEach(function (lane, li) {
        var cells = cols.map(function (col) { return col.filter(function (v) { return diag.items[v].lane === lane; }); });
        var h0 = Math.max.apply(null, cells.map(function (c) { return c.reduce(function (a, v) { return a + M[v].h; }, 0) + Math.max(0, c.length - 1) * vgap; }).concat([fs * 3])) + fs * 3.2;
        var h = h0 + (laneBack[li] ? laneBack[li] * step + fs * 0.4 : 0);   // 戻る矢印の分だけ帯を広げ、線と言葉を帯の中におさめる
        Object.keys(backIdx).forEach(function (ei) { if (backIdx[ei].li === li) backY[ei] = y + h0 - fs * 0.6 + backIdx[ei].k * step - step / 2; });
        bands += '<g class="lane"><rect x="0" y="' + r(y) + '" width="' + r(width) + '" height="' + r(h) + '" fill="' + C.lane[li % 2] + '"/>' +
          '<line x1="0" x2="' + r(width) + '" y1="' + r(y) + '" y2="' + r(y) + '" stroke="' + C.grid + '"/>' +
          '<rect x="0" y="' + r(y) + '" width="' + r(left) + '" height="' + r(h) + '" fill="' + C.head + '"/>' +
          textEl(wrap(lane, fs, fs * 7, 2, true), left / 2, y + h / 2, fs, { bold: true }) + '</g>';
        cells.forEach(function (c, ci) {
          var cw = Math.max.apply(null, cols[ci].map(function (v) { return M[v].w; }).concat([0]));
          var ch = c.reduce(function (a, v) { return a + M[v].h; }, 0) + Math.max(0, c.length - 1) * vgap, yy = y + (h0 - ch) / 2 + fs * 0.4;
          c.forEach(function (v) { B[v] = { x: colX[ci] + (cw - M[v].w) / 2, y: yy, w: M[v].w, h: M[v].h, lines: M[v].lines }; yy += M[v].h + vgap; });
        });
        y += h;
      });
      body += bands;
      bottom = y;
    }
    var extra = 0;
    if (!laneMode && nBack) {
      Object.keys(backIdx).forEach(function (ei) { backY[ei] = bottom + fs * 1.2 + (backIdx[ei].k - 1) * step; });
      extra = fs * 1.2 + nBack * step;
    }
    var E = edgePaths(diag, d, B, backY, opts);
    body += E.paths;
    diag.items.forEach(function (it) { if (B[it.id]) body += drawBox(d, it, B[it.id], opts); });
    body += E.labels;
    return wrapSvg(width, bottom + extra + 24, body, laneMode ? 'lanes' : 'flow');
  }

  // ---- 日程 ----
  function dayNum(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function timeline(diag, d, opts) {
    var fs = opts.fs, items = diag.items;
    var lo = Math.min.apply(null, items.map(function (i) { return dayNum(i.date); }));
    var hi = Math.max.apply(null, items.map(function (i) { return dayNum(i.end || i.date); }));
    var today = opts.today ? dayNum(opts.today) : null;
    var showToday = today != null && today >= lo - 31 && today <= hi + 31;
    if (showToday) { lo = Math.min(lo, today); hi = Math.max(hi, today); }
    var span = Math.max(hi - lo, 14); lo -= span * 0.06; hi += span * 0.06; span = hi - lo;
    var labelW = items.map(function (it) { return Math.max(tw(it.label, fs, true), tw(it.dateText, Math.max(11, fs * 0.82))) + 20; });
    var width = Math.max(900, Math.min(2400, items.length * fs * 7)), pad = 40;
    var X = function (day) { return pad + (day - lo) / span * (width - pad * 2); };
    // 札が重ならないよう、上と下に段を分ける
    var levels = [], lv = [];
    items.forEach(function (it, i) {
      var cx = X(dayNum(it.date)), a = cx - 6, b = cx + labelW[i];
      for (var k = 0; ; k++) {
        var slot = k % 2 === 0 ? -(k / 2 + 1) : (k + 1) / 2;   // -1, 1, -2, 2 …
        if (levels[k] == null || levels[k] < a - 8) { levels[k] = b; lv[i] = slot; break; }
      }
    });
    var up = Math.max.apply(null, lv.map(function (s) { return s < 0 ? -s : 0; }).concat([1]));
    var down = Math.max.apply(null, lv.map(function (s) { return s > 0 ? s : 0; }).concat([0]));
    var rowH = fs * 3.4 + (items.some(function (it) { return it.marks.length; }) ? fs * 1.4 : 0), axisY = 30 + up * rowH + 20, height = axisY + down * rowH + 70;
    var body = '<line x1="' + pad / 2 + '" x2="' + r(width - pad / 2) + '" y1="' + r(axisY) + '" y2="' + r(axisY) + '" stroke="' + C.line + '" stroke-width="3" stroke-linecap="round"/>';
    // 目もり（期間に合わせて 日・週・月・年）
    var start = new Date(lo * 864e5), ticks = [], step;
    if (span <= 45) step = 'week'; else if (span <= 900) step = 'month'; else step = 'year';
    var t = new Date(Date.UTC(start.getUTCFullYear(), step === 'year' ? 0 : start.getUTCMonth(), 1));
    for (var g = 0; g < 400; g++) {
      var dn = t.getTime() / 864e5;
      if (dn > hi) break;
      if (dn >= lo) ticks.push({ x: X(dn), text: step === 'year' ? t.getUTCFullYear() + '年' : (t.getUTCMonth() === 0 || !ticks.length ? t.getUTCFullYear() + '/' : '') + (t.getUTCMonth() + 1) + (step === 'week' ? '/' + t.getUTCDate() : '月') });
      if (step === 'week') t = new Date(t.getTime() + 7 * 864e5);
      else if (step === 'month') t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
      else t = new Date(Date.UTC(t.getUTCFullYear() + 1, 0, 1));
    }
    var tf = Math.max(11, Math.round(fs * 0.78));
    ticks.forEach(function (k) {
      body += '<line x1="' + r(k.x) + '" x2="' + r(k.x) + '" y1="' + r(axisY - 6) + '" y2="' + r(axisY + 6) + '" stroke="' + C.line + '"/>' +
        '<text x="' + r(k.x) + '" y="' + r(height - 22) + '" font-size="' + tf + '" text-anchor="middle" fill="' + C.sub + '">' + esc(k.text) + '</text>' +
        '<line x1="' + r(k.x) + '" x2="' + r(k.x) + '" y1="16" y2="' + r(height - 38) + '" stroke="' + C.grid + '" stroke-dasharray="2 4"/>';
    });
    if (showToday) {
      var tx = X(today);
      body += '<g class="today"><line x1="' + r(tx) + '" x2="' + r(tx) + '" y1="10" y2="' + r(height - 36) + '" stroke="' + C.red + '" stroke-width="2" stroke-dasharray="6 4"/>' +
        '<text x="' + r(tx + 4) + '" y="18" font-size="' + tf + '" fill="' + C.red + '" font-weight="bold">今日</text></g>';
    }
    items.forEach(function (it, i) {
      var cx = X(dayNum(it.date)), k = strongest(it), col = k ? MARK_COLOR[k] : C.accent;
      var ly = axisY + lv[i] * rowH, top = lv[i] < 0, h = fs * 2.7, by = top ? ly - h / 2 : ly - h / 2;
      var s = itemOpen(d, it);
      if (it.end) {
        var ex = X(dayNum(it.end));
        s += '<rect x="' + r(cx) + '" y="' + r(axisY - 6) + '" width="' + r(Math.max(ex - cx, 4)) + '" height="12" rx="6" fill="' + col + '" opacity="0.55"/>';
      }
      s += '<line x1="' + r(cx) + '" x2="' + r(cx) + '" y1="' + r(axisY) + '" y2="' + r(top ? by + h : by) + '" stroke="' + col + '" stroke-width="2"/>' +
        '<circle cx="' + r(cx) + '" cy="' + r(axisY) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="3"/>' +
        '<rect class="box" x="' + r(cx - 2) + '" y="' + r(by) + '" width="' + r(labelW[i]) + '" height="' + r(h) + '" rx="8" fill="#fff" stroke="' + col + '" stroke-width="' + (k ? 2.2 : 1.4) + '"/>' +
        (info(it, opts) ? cornerDot(cx - 2 + labelW[i] - 1, by + 1) : '') +
        '<text x="' + r(cx + 8) + '" y="' + r(by + h * 0.3) + '" font-size="' + r(Math.max(11, fs * 0.82)) + '" dominant-baseline="central" fill="' + C.sub + '">' + esc(it.dateText) + '</text>' +
        '<text x="' + r(cx + 8) + '" y="' + r(by + h * 0.68) + '" font-size="' + fs + '" font-weight="bold" dominant-baseline="central" fill="' + C.text + '">' + esc(it.label) + '</text>' +
        badges(it, cx - 2 + labelW[i], by - 3, fs, true) + '</g>';
      body += s;
    });
    var maxX = Math.max.apply(null, items.map(function (it, i) { return X(dayNum(it.date)) + labelW[i]; }).concat([width]));
    return wrapSvg(maxX + 20, height, body, 'timeline');
  }

  // ---- 木 ----
  function tree(diag, d, opts) {
    var fs = opts.fs, items = diag.items, kids = items.map(function () { return []; }), roots = [];
    items.forEach(function (it) { if (it.parent == null) roots.push(it.id); else kids[it.parent].push(it.id); });
    var leaves = items.filter(function (it) { return !kids[it.id].length; }).length;
    var horiz = leaves > 10;   // 葉が多いときは左から右へ（横に長くなりすぎないように）
    var M = items.map(function (it) { return measureBox(it, fs, horiz ? fs * 12 : fs * 10); });
    var maxDepth = Math.max.apply(null, items.map(function (it) { return it.depth; }));
    var pos = [], cursor = 0;
    function size(v) { return horiz ? M[v].h + fs * 1.4 : M[v].w + fs * 1.6; }
    function place(v) {
      if (!kids[v].length) { pos[v] = cursor + size(v) / 2; cursor += size(v); return; }
      kids[v].forEach(place);
      var a = pos[kids[v][0]], b = pos[kids[v][kids[v].length - 1]];
      pos[v] = (a + b) / 2;
      var need = pos[v] + size(v) / 2;
      if (need > cursor) cursor = need;
    }
    roots.forEach(function (v) { place(v); cursor += fs * 2; });
    var depthSize = [];
    items.forEach(function (it) { depthSize[it.depth] = Math.max(depthSize[it.depth] || 0, horiz ? M[it.id].w : M[it.id].h); });
    var dpos = [], acc = 30;
    for (var k = 0; k <= maxDepth; k++) { dpos[k] = acc; acc += (depthSize[k] || 0) + (horiz ? fs * 4 : fs * 3.6); }
    var B = items.map(function (it) {
      var m = M[it.id];
      return horiz ? { x: dpos[it.depth], y: pos[it.id] - m.h / 2 + 20, w: m.w, h: m.h, lines: m.lines }
        : { x: pos[it.id] - m.w / 2 + 20, y: dpos[it.depth], w: m.w, h: m.h, lines: m.lines };
    });
    var body = '';
    items.forEach(function (it) {
      if (it.parent == null) return;
      var a = B[it.parent], b = B[it.id], p;
      if (horiz) { var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2; p = 'M' + r(x1) + ' ' + r(y1) + ' C' + r(mx) + ' ' + r(y1) + ' ' + r(mx) + ' ' + r(y2) + ' ' + r(x2) + ' ' + r(y2); }
      else { var X1 = a.x + a.w / 2, Y1 = a.y + a.h, X2 = b.x + b.w / 2, Y2 = b.y, my = (Y1 + Y2) / 2; p = 'M' + r(X1) + ' ' + r(Y1) + ' C' + r(X1) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(Y2); }
      body += '<path class="edge" d="' + p + '" fill="none" stroke="' + C.edge + '" stroke-width="2"/>';
    });
    items.forEach(function (it) { body += drawBox(d, it, B[it.id], opts); });
    var W = Math.max.apply(null, B.map(function (b) { return b.x + b.w; })) + 30, H = Math.max.apply(null, B.map(function (b) { return b.y + b.h; })) + 30;
    return wrapSvg(W, H, body, 'tree');
  }

  // ---- 数字（棒グラフ） ----
  function niceStep(range) {
    var raw = range / 5, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function fmt(n) {
    var a = Math.abs(n);
    if (a >= 1e8) return r(n / 1e8) + '億';
    if (a >= 1e4) return r(n / 1e4) + '万';
    return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function chart(diag, d, opts) {
    var fs = opts.fs, items = diag.items;
    var vmax = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([0]));
    var vmin = Math.min.apply(null, items.map(function (i) { return i.value; }).concat([0]));
    var step = niceStep(vmax - vmin || 1), top = Math.ceil(vmax / step) * step, bot = Math.floor(vmin / step) * step;
    if (top === bot) top = bot + step;
    var plotH = fs * 18, padTop = fs * 3.2, axisW = Math.max(tw(fmt(top), Math.max(11, fs * 0.8)), tw(fmt(bot), Math.max(11, fs * 0.8))) + 24;
    var catLines = items.map(function (it) { return wrap(it.label, Math.max(11, fs * 0.9), fs * 6, 2); });
    var barW = Math.max.apply(null, items.map(function (it, i) { return Math.max(textW(catLines[i], Math.max(11, fs * 0.9)), tw(it.valueText, Math.max(11, fs * 0.9), true), fs * 2.6); })) + fs * 1.2;
    var Y = function (v) { return padTop + (top - v) / (top - bot) * plotH; };
    var width = axisW + items.length * barW + 30, height = padTop + plotH + fs * 4.2, body = '';
    for (var v = bot; v <= top + step / 2; v += step) {
      body += '<line x1="' + r(axisW) + '" x2="' + r(width - 10) + '" y1="' + r(Y(v)) + '" y2="' + r(Y(v)) + '" stroke="' + (v === 0 ? C.line : C.grid) + '"' + (v === 0 ? ' stroke-width="1.5"' : '') + '/>' +
        '<text x="' + r(axisW - 8) + '" y="' + r(Y(v)) + '" font-size="' + r(Math.max(11, fs * 0.8)) + '" text-anchor="end" dominant-baseline="central" fill="' + C.sub + '">' + esc(fmt(v)) + '</text>';
    }
    if (diag.unit) body += '<text x="8" y="' + r(fs * 1.2) + '" font-size="' + r(Math.max(11, fs * 0.85)) + '" fill="' + C.sub + '">（' + esc(diag.unit) + '）</text>';
    items.forEach(function (it, i) {
      var k = strongest(it), col = k ? MARK_COLOR[k] : C.accent, x = axisW + i * barW + barW * 0.18, w = barW * 0.64;
      var y1 = Y(Math.max(it.value, 0)), y2 = Y(Math.min(it.value, 0)), h = Math.max(y2 - y1, 1.5);
      var vy = it.value >= 0 ? y1 - fs * 0.8 : y2 + fs * 0.8;
      body += itemOpen(d, it) +
        '<rect class="box" x="' + r(x) + '" y="' + r(y1) + '" width="' + r(w) + '" height="' + r(h) + '" rx="4" fill="' + col + '" opacity="0.9"/>' +
        (info(it, opts) ? cornerDot(x + w, y1) : '') +
        textEl([it.valueText], x + w / 2, vy, Math.max(11, Math.round(fs * 0.9)), { bold: true }) +
        textEl(catLines[i], x + w / 2, padTop + plotH + fs * 1.6 + (catLines[i].length - 1) * fs * 0.58, Math.max(11, Math.round(fs * 0.9))) +
        badges(it, x + w / 2 + 20, Math.min(vy, y1) - fs * 0.7, fs, true) + '</g>';
    });
    return wrapSvg(width, height, body, 'chart');
  }

  // ---- 大事な数字（カード） ----
  function kpi(diag, d, opts) {
    var fs = opts.fs, items = diag.items, per = Math.min(items.length, items.length > 4 ? (items.length === 6 ? 3 : 4) : items.length);
    var cw = fs * 17, ch = fs * 9.6, gap = fs * 1.4, body = '';
    items.forEach(function (it, i) {
      var x = 10 + (i % per) * (cw + gap), y = 24 + Math.floor(i / per) * (ch + gap), k = strongest(it);
      var vf = fs * 2.3;
      while (vf > fs && tw(it.valueText, vf, true) > cw - fs * 2) vf -= 1;
      var tc = it.trend === 'up' ? C.green : it.trend === 'down' ? C.red : C.sub;
      body += itemOpen(d, it) +
        '<rect class="box" x="' + r(x) + '" y="' + r(y) + '" width="' + r(cw) + '" height="' + r(ch) + '" rx="14" fill="#fff" stroke="' + (k ? MARK_COLOR[k] : C.grid) + '" stroke-width="' + (k ? 2.5 : 1.5) + '"/>' +
        '<rect x="' + r(x) + '" y="' + r(y) + '" width="6" height="' + r(ch) + '" rx="3" fill="' + (k ? MARK_COLOR[k] : C.accent) + '"/>' +
        (info(it, opts) ? cornerDot(x + cw - 2, y + 2) : '') +
        textEl(wrap(it.label, fs, cw - fs * 2, 1, true), x + fs, y + fs * 1.6, fs, { anchor: 'start', fill: C.sub, bold: true }) +
        textEl([it.valueText], x + fs, y + ch * 0.5, Math.round(vf), { anchor: 'start', bold: true }) +
        (it.note ? textEl(wrap((it.trend === 'up' ? '▲ ' : it.trend === 'down' ? '▼ ' : '') + it.note, Math.max(11, Math.round(fs * 0.9)), cw - fs * 2, 2), x + fs, y + ch - fs * 1.7, Math.max(11, Math.round(fs * 0.9)), { anchor: 'start', fill: tc, bold: !!it.trend }) : '') +
        badges(it, x + cw - 6, y - 3, fs, true) + '</g>';
    });
    var rows = Math.ceil(items.length / per);
    return wrapSvg(20 + per * (cw + gap) - gap, 34 + rows * (ch + gap), body, 'kpi');
  }

  // ---- 比べる（表） ----
  var RATE_BG = { best: C.bestBg, good: C.greenBg, mid: C.yellowBg, bad: C.redBg };
  var RATE_FG = { best: C.green, good: C.green, mid: C.yellow, bad: C.red };
  function compare(diag, d, opts) {
    var fs = opts.fs, items = diag.items, opt = diag.options;
    var c0 = Math.min(fs * 12, Math.max(tw(diag.corner || '', fs, true), textW(items.map(function (it) { return it.label; }), fs, true)) + fs * 1.6);
    var cws = opt.map(function (o, j) {
      return Math.min(fs * 15, Math.max(tw(o, fs, true), textW(items.map(function (it) { return it.cells[j].text; }), fs)) + fs * 2.6);
    });
    var rowsL = items.map(function (it) {
      var label = wrap(it.label, fs, c0 - fs * 1.2, 3, true);
      var cells = it.cells.map(function (c, j) { return wrap(c.text, fs, cws[j] - fs * 2.2, 3); });
      var n = Math.max.apply(null, [label.length].concat(cells.map(function (c) { return c.length; })));
      return { label: label, cells: cells, h: n * fs * 1.3 + fs * 1.4 };
    });
    var hh = fs * 2.8, W = c0 + cws.reduce(function (a, b) { return a + b; }, 0), x0 = 10, y = 24, body = '';
    body += '<rect x="' + x0 + '" y="' + y + '" width="' + r(W) + '" height="' + r(hh) + '" fill="' + C.head + '"/>';
    body += textEl(wrap(diag.corner || '', fs, c0 - fs, 1, true), x0 + c0 / 2, y + hh / 2, fs, { bold: true, fill: C.sub });
    var cx = x0 + c0;
    opt.forEach(function (o, j) { body += textEl(wrap(o, fs, cws[j] - fs, 2, true), cx + cws[j] / 2, y + hh / 2, fs, { bold: true }); cx += cws[j]; });
    y += hh;
    items.forEach(function (it, i) {
      var R = rowsL[i], k = strongest(it), s = itemOpen(d, it);
      s += '<rect class="box" x="' + x0 + '" y="' + r(y) + '" width="' + r(W) + '" height="' + r(R.h) + '" fill="' + (i % 2 ? '#fbfcfe' : '#fff') + '"/>';
      var xx = x0 + c0;
      it.cells.forEach(function (c, j) {
        if (c.rate) s += '<rect x="' + r(xx + 3) + '" y="' + r(y + 3) + '" width="' + r(cws[j] - 6) + '" height="' + r(R.h - 6) + '" rx="6" fill="' + RATE_BG[c.rate] + '"/>';
        s += textEl(R.cells[j], xx + cws[j] / 2, y + R.h / 2, fs, { fill: c.rate ? RATE_FG[c.rate] : C.text, bold: c.rate === 'best' });
        xx += cws[j];
      });
      s += textEl(R.label, x0 + fs * 0.6, y + R.h / 2, fs, { anchor: 'start', bold: true, fill: k ? MARK_COLOR[k] : C.text });
      if (info(it, opts)) s += cornerDot(x0 + c0 - 1, y + 1);
      s += badges(it, x0 + c0 - 4, y + fs * 0.2 + 12, fs * 0.85, true) + '</g>';
      body += s;
      y += R.h;
      body += '<line x1="' + x0 + '" x2="' + r(x0 + W) + '" y1="' + r(y) + '" y2="' + r(y) + '" stroke="' + C.grid + '"/>';
    });
    cx = x0 + c0;
    body += '<line x1="' + r(cx) + '" x2="' + r(cx) + '" y1="24" y2="' + r(y) + '" stroke="' + C.grid + '"/>';
    body += '<rect x="' + x0 + '" y="24" width="' + r(W) + '" height="' + r(y - 24) + '" fill="none" stroke="' + C.line + '" stroke-width="1.2" rx="2"/>';
    return wrapSvg(W + 20, y + 14, body, 'compare');
  }

  function svg(diag, d, opts) {
    opts = opts || {};
    opts.fs = opts.fs || 15;
    ARW = 'arw-' + (++seq);
    switch (diag.type) {
      case 'flow': return flow(diag, d, opts, false);
      case 'lanes': return flow(diag, d, opts, true);
      case 'timeline': return timeline(diag, d, opts);
      case 'tree': return tree(diag, d, opts);
      case 'chart': return chart(diag, d, opts);
      case 'kpi': return kpi(diag, d, opts);
      case 'compare': return compare(diag, d, opts);
    }
    return '';
  }

  root.DocRender = { svg: svg, uniq: uniq, esc: esc, FONT: FONT, COLORS: C };
})(typeof window !== 'undefined' ? window : this);
