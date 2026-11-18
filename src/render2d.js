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

  // ---- 配置（layout）：自動の並べ方のあとで、動かした箱を置き直す。枠（W×H）の中におさめる ----
  function applyLayout(diag, B, W, H) {
    var L = diag.layout || {}, moved = {};
    diag.items.forEach(function (it, v) {
      var p = L[it.pk], b = B[v];
      if (!b || !p || p.x == null) return;
      b.x = Math.max(0, Math.min(p.x, W - b.w)); b.y = Math.max(0, Math.min(p.y, H - b.h));
      moved[v] = true;
    });
    return moved;
  }
  function edgeLay(diag, pk) { return (diag.layout || {})[pk] || {}; }
  function hasReverse(diag, e) { return diag.edges.some(function (o) { return o.from === e.to && o.to === e.from; }); }
  // 箱の真ん中から (tx, ty) へ向かう線が、箱のふちと交わる点
  function rim(b, tx, ty, pad) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    var k = Math.min(dx ? (b.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + pad) / Math.abs(dy) : Infinity);
    return [cx + dx * k, cy + dy * k];
  }
  // 動かした箱の線・曲げた線：箱のふちから箱のふちへ。曲げる点があれば、その点を通る曲線
  function freeEdge(a, b, bend, side) {
    // 行きと帰りの線があるときは、それぞれ右側へふくらませて重ねない（向きが逆なので、自然に反対側になる）
    if (!bend && side) {
      var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2, L = Math.hypot(bx - ax, by - ay) || 1;
      bend = [(ax + bx) / 2 - (by - ay) / L * side, (ay + by) / 2 + (bx - ax) / L * side];
    }
    var ta = bend || [b.x + b.w / 2, b.y + b.h / 2], tb = bend || [a.x + a.w / 2, a.y + a.h / 2];
    var s0 = rim(a, ta[0], ta[1], 0), e0 = rim(b, tb[0], tb[1], 2);
    if (!bend) return { d: 'M' + r(s0[0]) + ' ' + r(s0[1]) + ' L' + r(e0[0]) + ' ' + r(e0[1]), mx: (s0[0] + e0[0]) / 2, my: (s0[1] + e0[1]) / 2 };
    var c = [2 * bend[0] - (s0[0] + e0[0]) / 2, 2 * bend[1] - (s0[1] + e0[1]) / 2];
    return { d: 'M' + r(s0[0]) + ' ' + r(s0[1]) + ' Q' + r(c[0]) + ' ' + r(c[1]) + ' ' + r(e0[0]) + ' ' + r(e0[1]), mx: bend[0], my: bend[1] };
  }
  function ekAttr(pk) { return pk ? ' data-ek="' + esc(pk) + '"' : ''; }
  function edgeLabel(t, x, y, fs, pk) {
    var w = tw(t, fs) + 12;
    return '<g class="edge-label"' + ekAttr(pk) + '><rect x="' + r(x - w / 2) + '" y="' + r(y - fs * 0.8) + '" width="' + r(w) + '" height="' + r(fs * 1.6) + '" rx="6" fill="#fff" stroke="' + C.grid + '"/>' +
      textEl([t], x, y, fs, { fill: C.sub }) + '</g>';
  }

  // 戻る矢印（下を回る線）は、どれも別の深さ yb を通す（yb はふつうの線の言葉が重ならない間かくで、呼ぶ側が決める）
  function edgePaths(diag, d, B, backY, opts, moved) {
    var out = '', labels = '', fs = Math.max(11, Math.round(opts.fs * 0.85));
    diag.edges.forEach(function (e, ei) {
      var a = B[e.from], b = B[e.to], path, mx, my, lay = edgeLay(diag, e.pk);
      if (!a || !b) return;
      if ((moved[e.from] || moved[e.to] || lay.bend) && e.from !== e.to) { var fe = freeEdge(a, b, lay.bend, hasReverse(diag, e) ? opts.fs * 1.6 : 0); path = fe.d; mx = fe.mx; my = fe.my; }
      else if (backY[ei] != null) {
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
      out += '<path class="edge"' + ekAttr(e.pk) + ' d="' + path + '" fill="none" stroke="' + C.edge + '" stroke-width="2" marker-end="url(#' + ARW + ')"/>';
      if (e.label) labels += edgeLabel(e.label, mx + (lay.label ? lay.label[0] : 0), my + (lay.label ? lay.label[1] : 0), fs, e.pk);
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
    var moved = applyLayout(diag, B, width, bottom + extra + 24);
    var E = edgePaths(diag, d, B, backY, opts, moved);
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
    var body = '', W = Math.max.apply(null, B.map(function (b) { return b.x + b.w; })) + 30, H = Math.max.apply(null, B.map(function (b) { return b.y + b.h; })) + 30;
    var moved = applyLayout(diag, B, W, H);
    items.forEach(function (it) {
      if (it.parent == null) return;
      var a = B[it.parent], b = B[it.id], p, pk = items[it.parent].pk + '>' + it.pk, lay = edgeLay(diag, pk);
      if (moved[it.parent] || moved[it.id] || lay.bend) p = freeEdge(a, b, lay.bend).d;
      else if (horiz) { var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2; p = 'M' + r(x1) + ' ' + r(y1) + ' C' + r(mx) + ' ' + r(y1) + ' ' + r(mx) + ' ' + r(y2) + ' ' + r(x2) + ' ' + r(y2); }
      else { var X1 = a.x + a.w / 2, Y1 = a.y + a.h, X2 = b.x + b.w / 2, Y2 = b.y, my = (Y1 + Y2) / 2; p = 'M' + r(X1) + ' ' + r(Y1) + ' C' + r(X1) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(Y2); }
      body += '<path class="edge"' + ekAttr(pk) + ' d="' + p + '" fill="none" stroke="' + C.edge + '" stroke-width="2"/>';
    });
    items.forEach(function (it) { body += drawBox(d, it, B[it.id], opts); });
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

  // ---- グラフ（円・ドーナツ・折れ線・横棒・積み上げ） ----
  // となり同士がまぎれない色の並び（色の見分けにくい人にも分かるよう、明るさも変える）
  var PAL = ['#3b6fd8', '#e08a2e', '#2f9e5b', '#d64545', '#8e5cc4', '#1b9aaa', '#c98f00', '#7a8699'];
  function pal(k) { return PAL[k % PAL.length]; }
  function unitText(diag, fs) { return diag.unit ? '<text x="8" y="' + r(fs * 1.2) + '" font-size="' + r(Math.max(11, fs * 0.85)) + '" fill="' + C.sub + '">（' + esc(diag.unit) + '）</text>' : ''; }
  function legendRows(names, x, y, fs) {
    var f = Math.max(11, Math.round(fs * 0.85)), out = '';
    names.forEach(function (n, k) {
      out += '<rect x="' + r(x) + '" y="' + r(y + k * f * 1.7 - f * 0.45) + '" width="' + r(f * 0.9) + '" height="' + r(f * 0.9) + '" rx="2" fill="' + pal(k) + '"/>' +
        textEl([n], x + f * 1.4, y + k * f * 1.7, f, { anchor: 'start' });
    });
    return out;
  }
  function pctText(v, total) { return total > 0 ? (Math.round(v / total * 1000) / 10) + '%' : '0%'; }

  function pie(diag, d, opts, donut) {
    var fs = opts.fs, items = diag.items, R0 = fs * 9, inner = donut ? R0 * 0.56 : 0;
    var total = items.reduce(function (a, it) { return a + Math.max(0, it.value); }, 0);
    var f = Math.max(11, Math.round(fs * 0.9)), cx = 24 + R0, cy = fs * 2.4 + R0;
    var rows = items.map(function (it) { return wrap(it.label, f, fs * 9, 1)[0] + '　' + it.valueText + (diag.unit || '') + '（' + pctText(Math.max(0, it.value), total) + '）'; });
    var lx = cx + R0 + fs * 2.4, rowH = f * 1.9;
    var width = lx + Math.max.apply(null, rows.map(function (t) { return tw(t, f); }).concat([0])) + f * 2 + 20;
    var height = Math.max(cy + R0 + fs * 1.6, fs * 2.4 + items.length * rowH + fs);
    var body = unitText(diag, fs), a0 = -Math.PI / 2;
    items.forEach(function (it, i) {
      var v = Math.max(0, it.value), a1 = a0 + (total > 0 ? v / total : 0) * Math.PI * 2, k = strongest(it);
      var n = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 45))), pts = [], j;
      for (j = 0; j <= n; j++) { var a = a0 + (a1 - a0) * j / n; pts.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]); }
      if (inner) for (j = n; j >= 0; j--) { var b = a0 + (a1 - a0) * j / n; pts.push([cx + Math.cos(b) * inner, cy + Math.sin(b) * inner]); }
      else pts.push([cx, cy]);
      var dd = 'M' + pts.map(function (p) { return r(p[0]) + ' ' + r(p[1]); }).join(' L') + ' Z';
      var mid = (a0 + a1) / 2, lr = inner ? (R0 + inner) / 2 : R0 * 0.62, ly = fs * 2.4 + i * rowH + f;
      body += itemOpen(d, it) +
        '<path class="box" d="' + dd + '" data-cx="' + r(cx + Math.cos(mid) * lr) + '" data-cy="' + r(cy + Math.sin(mid) * lr) + '" fill="' + pal(i) + '" stroke="#fff" stroke-width="2"/>' +
        (a1 - a0 > 0.35 ? textEl([pctText(v, total)], cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr, f, { bold: true, fill: '#fff' }) : '') +
        '<rect x="' + r(lx) + '" y="' + r(ly - f * 0.45) + '" width="' + r(f * 0.9) + '" height="' + r(f * 0.9) + '" rx="2" fill="' + pal(i) + '"/>' +
        textEl([rows[i]], lx + f * 1.4, ly, f, { anchor: 'start', fill: k ? MARK_COLOR[k] : C.text, bold: !!k }) +
        (info(it, opts) ? cornerDot(lx + f * 1.4 + tw(rows[i], f) + 14, ly - f * 0.6) : '') + '</g>';
      a0 = a1;
    });
    if (donut) body += textEl(['合計', fmt(total) + (diag.unit || '')], cx, cy, Math.max(11, Math.round(fs * 1.1)), { bold: true });
    return wrapSvg(width, height, body, donut ? 'donut' : 'pie');
  }

  function hbar(diag, d, opts) {
    var fs = opts.fs, items = diag.items, f = Math.max(11, Math.round(fs * 0.9));
    var vmax = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([0]));
    var vmin = Math.min.apply(null, items.map(function (i) { return i.value; }).concat([0]));
    var step = niceStep(vmax - vmin || 1), top = Math.ceil(vmax / step) * step, bot = Math.floor(vmin / step) * step;
    if (top === bot) top = bot + step;
    var labs = items.map(function (it) { return wrap(it.label, f, fs * 14, 2); });
    var labW = Math.max.apply(null, labs.map(function (l) { return textW(l, f); }).concat([fs * 3])) + 20;
    var plotW = fs * 30, valW = Math.max.apply(null, items.map(function (it) { return tw(it.valueText, f, true); }).concat([0])) + 16;
    var rowH = fs * 2.6, padTop = fs * 2.6, X = function (v) { return labW + (v - bot) / (top - bot) * plotW; };
    var width = labW + plotW + valW + 20, height = padTop + items.length * rowH + fs * 2.4, body = unitText(diag, fs);
    for (var v = bot; v <= top + step / 2; v += step) {
      body += '<line x1="' + r(X(v)) + '" x2="' + r(X(v)) + '" y1="' + r(padTop - 6) + '" y2="' + r(padTop + items.length * rowH) + '" stroke="' + (v === 0 ? C.line : C.grid) + '"/>' +
        '<text x="' + r(X(v)) + '" y="' + r(padTop + items.length * rowH + fs) + '" font-size="' + r(Math.max(11, fs * 0.8)) + '" text-anchor="middle" dominant-baseline="central" fill="' + C.sub + '">' + esc(fmt(v)) + '</text>';
    }
    items.forEach(function (it, i) {
      var k = strongest(it), y = padTop + i * rowH + rowH * 0.18, h = rowH * 0.64;
      var x1 = X(Math.min(it.value, 0)), x2 = X(Math.max(it.value, 0)), w = Math.max(x2 - x1, 1.5);
      body += itemOpen(d, it) +
        '<rect class="box" x="' + r(x1) + '" y="' + r(y) + '" width="' + r(w) + '" height="' + r(h) + '" rx="4" fill="' + (k ? MARK_COLOR[k] : C.accent) + '" opacity="0.9"/>' +
        (info(it, opts) ? cornerDot(x1 + w, y) : '') +
        textEl(labs[i], labW - 10, y + h / 2, f, { anchor: 'end' }) +
        textEl([it.valueText], (it.value >= 0 ? x2 + 8 : x1 - 8), y + h / 2, f, { anchor: it.value >= 0 ? 'start' : 'end', bold: true }) + '</g>';
    });
    return wrapSvg(width, height, body, 'hbar');
  }

  // 折れ線と積み上げ：横は項目、縦は数字。系列ごとに色
  function series(diag, d, opts, stacked) {
    var fs = opts.fs, items = diag.items, f = Math.max(11, Math.round(fs * 0.9)), ns = diag.series.length;
    var tops = items.map(function (it) { return stacked ? it.values.reduce(function (a, v) { return a + Math.max(0, v || 0); }, 0) : Math.max.apply(null, it.values.map(function (v) { return v == null ? -Infinity : v; })); });
    var lows = items.map(function (it) { return stacked ? 0 : Math.min.apply(null, it.values.map(function (v) { return v == null ? Infinity : v; })); });
    var vmax = Math.max.apply(null, tops.concat([0])), vmin = Math.min.apply(null, lows.concat([0]));
    var step = niceStep(vmax - vmin || 1), top = Math.ceil(vmax / step) * step, bot = Math.floor(vmin / step) * step;
    if (top === bot) top = bot + step;
    var plotH = fs * 18, padTop = fs * 3.2, axisW = Math.max(tw(fmt(top), Math.max(11, fs * 0.8)), tw(fmt(bot), Math.max(11, fs * 0.8))) + 24;
    var cats = items.map(function (it) { return wrap(it.label, f, fs * 6, 2); });
    // 積み上げの段の数字は、段の横に出す（3D では棒の中の字が隠れるため）
    var vw = stacked ? Math.max.apply(null, items.map(function (it) { return Math.max.apply(null, it.valueTexts.map(function (t) { return tw(t, f, true); }).concat([0])); })) + 8 : 0;
    var colW = Math.max(Math.max.apply(null, cats.map(function (l) { return textW(l, f); }).concat([fs * 3.4])) + fs * 1.4, fs * 2.6 + vw * 2);
    var Y = function (v) { return padTop + (top - v) / (top - bot) * plotH; };
    var plotRight = axisW + items.length * colW, lx = plotRight + fs * 1.6;
    var legW = Math.max.apply(null, diag.series.map(function (n) { return tw(n, f); }).concat([0])) + f * 1.4 + 20;
    var width = lx + (ns > 1 ? legW : 0) + 10, height = Math.max(padTop + plotH + fs * 4.2, padTop + ns * f * 1.7 + fs);
    var body = unitText(diag, fs);
    for (var v = bot; v <= top + step / 2; v += step) {
      body += '<line x1="' + r(axisW) + '" x2="' + r(plotRight) + '" y1="' + r(Y(v)) + '" y2="' + r(Y(v)) + '" stroke="' + (v === 0 ? C.line : C.grid) + '"' + (v === 0 ? ' stroke-width="1.5"' : '') + '/>' +
        '<text x="' + r(axisW - 8) + '" y="' + r(Y(v)) + '" font-size="' + r(Math.max(11, fs * 0.8)) + '" text-anchor="end" dominant-baseline="central" fill="' + C.sub + '">' + esc(fmt(v)) + '</text>';
    }
    if (ns > 1) body += legendRows(diag.series, lx, padTop + f * 0.5, fs);
    var cxOf = function (i) { return axisW + i * colW + colW / 2; };
    if (!stacked) {
      // 線は系列ごとに1本。欠け（-）のところで切る
      for (var k = 0; k < ns; k++) {
        var dd = '', pen = false;
        items.forEach(function (it, i) { var y = it.values[k]; if (y == null) { pen = false; return; } dd += (pen ? ' L' : ' M') + r(cxOf(i)) + ' ' + r(Y(y)); pen = true; });
        if (dd) body += '<path class="sline" d="' + dd.trim() + '" fill="none" stroke="' + pal(k) + '" stroke-width="3" stroke-linejoin="round"/>';
      }
    }
    items.forEach(function (it, i) {
      var cx = cxOf(i), mk = strongest(it), g = itemOpen(d, it), first = true, acc = 0, bw = stacked ? fs * 2.4 : colW * 0.56;
      it.values.forEach(function (y, k) {
        if (y == null) return;
        if (stacked) {
          var yv = Math.max(0, y), y1 = Y(acc + yv), y2 = Y(acc);
          g += '<rect class="seg' + (first ? ' box' : '') + '" x="' + r(cx - bw / 2) + '" y="' + r(y1) + '" width="' + r(bw) + '" height="' + r(Math.max(y2 - y1, 1)) + '" fill="' + pal(k) + '"/>';
          if (y2 - y1 >= f * 0.9) g += textEl([it.valueTexts[k]], cx + bw / 2 + 4, (y1 + y2) / 2, f, { anchor: 'start', fill: pal(k), bold: true });
          acc += yv;
        } else {
          var s = f * 0.8;
          g += '<rect class="' + (first ? 'box ' : '') + 'pt" x="' + r(cx - s / 2) + '" y="' + r(Y(y) - s / 2) + '" width="' + r(s) + '" height="' + r(s) + '" rx="' + r(s / 2) + '" fill="#fff" stroke="' + pal(k) + '" stroke-width="2.5"/>';
          // 系列が2本以上なら、上下に分けて色で出す（重なりにくくする）
          g += textEl([it.valueTexts[k]], cx, Y(y) + (ns > 1 && k % 2 ? f * 1.1 : -f * 1.1), f, { bold: true, fill: ns > 1 ? pal(k) : C.text });
        }
        first = false;
      });
      if (stacked) g += textEl([fmt(acc)], cx, Y(acc) - f * 0.9, f, { bold: true });
      g += textEl(cats[i], cx, padTop + plotH + fs * 1.6 + (cats[i].length - 1) * fs * 0.58, f, { fill: mk ? MARK_COLOR[mk] : C.text, bold: !!mk });
      if (info(it, opts)) g += cornerDot(cx + bw / 2, padTop + plotH + fs * 0.6);
      body += g + '</g>';
    });
    return wrapSvg(width, height, body, stacked ? 'stacked' : 'line');
  }

  // ---- フローチャート（上から下へ。判断の分かれは左右、戻る矢印は右を回る） ----
  // 形は it.style.shape（terminal 端・decision 判断・subprocess 別の手順・io 入出力・process 処理）
  var FC_PPT = { terminal: 'flowChartTerminator', decision: 'flowChartDecision', subprocess: 'flowChartPredefinedProcess', io: 'flowChartInputOutput', process: 'flowChartProcess' };
  function fcShape(d, it, b, opts) {
    var k = strongest(it), stroke = k ? MARK_COLOR[k] : C.line, fill = k === 'red' ? '#fff7f7' : k === 'green' ? '#f6fcf8' : k === 'yellow' ? '#fffcf2' : C.box;
    var sh = it.style.shape || 'process', st = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (k ? 2.5 : 1.6) + '" data-shape="' + FC_PPT[sh] + '"', g = itemOpen(d, it), x = b.x, y = b.y, w = b.w, h = b.h;
    var P = function (pts) { return '<path class="box" d="M' + pts.map(function (p) { return r(p[0]) + ' ' + r(p[1]); }).join(' L') + ' Z"' + st + '/>'; };
    if (sh === 'decision') g += P([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    else if (sh === 'io') { var sk = h * 0.35; g += P([[x + sk, y], [x + w, y], [x + w - sk, y + h], [x, y + h]]); }
    else {
      g += '<rect class="box" x="' + r(x) + '" y="' + r(y) + '" width="' + r(w) + '" height="' + r(h) + '" rx="' + r(sh === 'terminal' ? h / 2 : 4) + '"' + st + '/>';
      if (sh === 'subprocess') g += '<line class="deco" x1="' + r(x + 9) + '" x2="' + r(x + 9) + '" y1="' + r(y) + '" y2="' + r(y + h) + '" stroke="' + stroke + '" stroke-width="1.4"/><line class="deco" x1="' + r(x + w - 9) + '" x2="' + r(x + w - 9) + '" y1="' + r(y) + '" y2="' + r(y + h) + '" stroke="' + stroke + '" stroke-width="1.4"/>';
    }
    return g + (info(it, opts) ? cornerDot(x + w - (sh === 'decision' ? w / 2 - 6 : 1), y + 1) : '') + textEl(b.lines, x + w / 2, y + h / 2, opts.fs) + badges(it, x + w, y - 3, opts.fs, true) + '</g>';
  }
  function flowchart(diag, d, opts) {
    var fs = opts.fs, L = layers(diag), n = diag.items.length, gap = fs * 2.4, lf = Math.max(11, Math.round(fs * 0.85));
    var B = diag.items.map(function (it) {
      var m = measureBox(it, fs, fs * 11), sh = it.style.shape;
      if (sh === 'decision') { m.w = m.w * 1.55 + fs; m.h = m.h * 1.7; }
      else if (sh === 'io') m.w += m.h * 0.7;
      else if (sh === 'subprocess') m.w += 18;
      else if (sh === 'terminal') m.w += m.h * 0.4;
      return { w: m.w, h: m.h, lines: m.lines };
    });
    var isBack = function (e) { return L.back[e.from + '>' + e.to] || e.from === e.to || L.layer[e.to] <= L.layer[e.from]; };
    // 判断から出る矢印：はい は左、いいえ は右（言葉がなければ、出た順に左・右）
    var side = {};
    diag.items.forEach(function (it, v) {
      if (it.style.shape !== 'decision') return;
      var outs = diag.edges.filter(function (e) { return e.from === v && !isBack(e); });
      if (outs.length < 2) return;
      var no = /^(いいえ|no|n|×|ng|なし|ない|違う|ちがう)$/i, yes = /^(はい|yes|y|○|ok|あり|ある)$/i;
      var nk = function (t) { return String(t || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); };
      var hasYes = outs.some(function (e) { return yes.test(nk(e.label)); });
      var right = outs.filter(function (e) { return no.test(nk(e.label)); })[0] || (hasYes ? outs.filter(function (e) { return !yes.test(nk(e.label)); })[0] : null) || outs[1];
      outs.forEach(function (e) { side[diag.edges.indexOf(e)] = e === right ? 1 : -1; });
    });
    var rows = [];
    diag.items.forEach(function (it, v) { (rows[L.layer[v]] = rows[L.layer[v]] || []).push(v); });
    var cx = [], maxW = Math.max.apply(null, B.map(function (b) { return b.w; }).concat([fs * 5]));
    rows.forEach(function (row, ri) {
      if (!row) return;
      var want = row.map(function (v, k) {
        var ins = diag.edges.map(function (e, ei) { return { e: e, ei: ei }; }).filter(function (o) { return o.e.to === v && !isBack(o.e) && cx[o.e.from] != null; });
        if (!ins.length) return k * (maxW + gap);
        return ins.reduce(function (a, o) { return a + cx[o.e.from] + (side[o.ei] || 0) * (B[o.e.from].w / 2 + B[v].w / 2 + gap) * 0.6; }, 0) / ins.length;
      });
      var ord = row.map(function (v, k) { return k; }).sort(function (a, b) { return want[a] - want[b] || a - b; });
      var prev = null;
      ord.forEach(function (k) { var v = row[k], x = want[k]; if (prev != null) x = Math.max(x, cx[prev] + B[prev].w / 2 + B[v].w / 2 + gap); cx[v] = x; prev = v; });
    });
    var minX = Math.min.apply(null, diag.items.map(function (it, v) { return cx[v] - B[v].w / 2; })), left = 24 + fs * 3;
    var y = fs * 2.2, rowY = [];
    rows.forEach(function (row, ri) {
      if (!row) return;
      var h = Math.max.apply(null, row.map(function (v) { return B[v].h; }));
      rowY[ri] = y;
      row.forEach(function (v) { B[v].x = cx[v] - minX + left - B[v].w / 2; B[v].y = y + (h - B[v].h) / 2; });
      y += h + fs * 3.6;
    });
    var maxR = Math.max.apply(null, B.map(function (b) { return b.x + b.w; })), paths = '', labels = '', nb = 0;
    var nBack = diag.edges.filter(isBack).length, FW = maxR + fs * 2.4 + nBack * fs * 1.3 + 20, FH = y - fs * 1.4;
    var moved = applyLayout(diag, B, FW, FH), lay;
    var lab = function (t, x, yy) { labels += edgeLabel(t, x + (lay.label ? lay.label[0] : 0), yy + (lay.label ? lay.label[1] : 0), lf, lay.pk); };
    diag.edges.forEach(function (e, ei) {
      var a = B[e.from], b = B[e.to], acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, dd, el = edgeLay(diag, e.pk);
      lay = { bend: el.bend, label: el.label, pk: e.pk };
      if ((moved[e.from] || moved[e.to] || lay.bend) && e.from !== e.to) {
        if (isBack(e)) nb++;   // 戻る矢印の列は、動かしても詰めない（ほかの戻る矢印の位置が変わらないように）
        var fe = freeEdge(a, b, lay.bend, hasReverse(diag, e) ? fs * 1.6 : 0); dd = fe.d;
        if (e.label) lab(e.label, fe.mx, fe.my - lf * 1.1);
      } else if (isBack(e)) {
        // 右を回って、行き先の上から入る（判断の左右の角は、はい・いいえで使うので空けておく）
        var xr = maxR + fs * 1.6 + nb++ * fs * 1.3, ty = b.y - fs * 1.2 - (nb - 1) * 4;
        dd = 'M' + r(a.x + a.w) + ' ' + r(acy) + ' L' + r(xr) + ' ' + r(acy) + ' L' + r(xr) + ' ' + r(ty) + ' L' + r(bcx) + ' ' + r(ty) + ' L' + r(bcx) + ' ' + r(b.y - 2);
        if (e.label) lab(e.label, xr, (acy + ty) / 2);
      } else if (side[ei]) {
        var sx = side[ei] < 0 ? a.x : a.x + a.w;
        dd = 'M' + r(sx) + ' ' + r(acy) + ' L' + r(bcx) + ' ' + r(acy) + ' L' + r(bcx) + ' ' + r(b.y - 2);
        if (e.label) lab(e.label, (sx + bcx) / 2 || sx + side[ei] * fs * 2, acy - lf * 1.1);
      } else {
        var sy = a.y + a.h, my = b.y - fs * 1.8;
        dd = Math.abs(acx - bcx) < 1 ? 'M' + r(acx) + ' ' + r(sy) + ' L' + r(bcx) + ' ' + r(b.y - 2) : 'M' + r(acx) + ' ' + r(sy) + ' L' + r(acx) + ' ' + r(my) + ' L' + r(bcx) + ' ' + r(my) + ' L' + r(bcx) + ' ' + r(b.y - 2);
        if (e.label) lab(e.label, acx + tw(e.label, lf) / 2 + 14, sy + fs * 0.9);
      }
      paths += '<path class="edge"' + ekAttr(e.pk) + ' d="' + dd + '" fill="none" stroke="' + C.edge + '" stroke-width="2" marker-end="url(#' + ARW + ')"/>';
    });
    var body = paths + diag.items.map(function (it, v) { return fcShape(d, it, B[v], opts); }).join('') + labels;
    return wrapSvg(FW, FH, body, 'flowchart');
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
      case 'flowchart': return flowchart(diag, d, opts);
      case 'timeline': return timeline(diag, d, opts);
      case 'tree': return tree(diag, d, opts);
      case 'chart': return chart(diag, d, opts);
      case 'pie': return pie(diag, d, opts, false);
      case 'donut': return pie(diag, d, opts, true);
      case 'hbar': return hbar(diag, d, opts);
      case 'line': return series(diag, d, opts, false);
      case 'stacked': return series(diag, d, opts, true);
      case 'kpi': return kpi(diag, d, opts);
      case 'compare': return compare(diag, d, opts);
    }
    return '';
  }

  root.DocRender = { svg: svg, uniq: uniq, esc: esc, FONT: FONT, COLORS: C, PAL: PAL };
})(typeof window !== 'undefined' ? window : this);
