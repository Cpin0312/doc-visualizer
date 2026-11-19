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
  // ---- 箱の形・色・大きさ（layout の shape・color・stroke・scale・font。R8b-2） ----
  var BOX_COLOR = { blue: ['#eef4ff', '#3b6fd8'], green: ['#ecf8f1', '#2f9e5b'], yellow: ['#fff8e1', '#c99400'], red: ['#fdeeee', '#d64545'], gray: ['#f2f4f7', '#7a8699'], purple: ['#f4effc', '#7b52c7'] };
  var SHAPE_PPT = { rect: 'rect', round: 'roundRect', ellipse: 'ellipse', diamond: 'diamond', para: 'parallelogram', hexagon: 'hexagon', chevron: 'chevron', cylinder: 'can', doc: 'flowChartDocument' };
  function partOf(diag, it) { return (diag.layout || {})[it.pk] || {}; }
  // 形に合わせて箱を広げる（中の字が形の外に出ないように）
  function grow(m, sh, fs) {
    if (sh === 'diamond') { m.w = m.w * 1.55 + fs; m.h *= 1.7; }
    else if (sh === 'ellipse') { m.w *= 1.25; m.h *= 1.3; }
    else if (sh === 'para' || sh === 'hexagon' || sh === 'chevron') m.w += m.h * 0.8;
    else if (sh === 'cylinder') m.h += fs * 0.9;
    else if (sh === 'doc') m.h += fs * 0.6;
    return m;
  }
  function measurePart(diag, it, fs, maxW) {
    var p = partOf(diag, it), f = Math.max(11, Math.round(fs * (p.font || 1))), k = p.scale || 1;
    var m = measureBox(it, f, maxW * k);
    if (p.shape) grow(m, p.shape, f);
    m.w *= k; m.h *= k; m.fs = f;
    return m;
  }
  function arc(cx, cy, rx, ry, a0, a1, n) { var o = []; for (var j = 0; j <= n; j++) { var a = a0 + (a1 - a0) * j / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
  // 形の点（曲線は点で近似。3D の押し出し・PowerPoint の形の名前がそのまま使える）
  function shapePts(sh, x, y, w, h) {
    var q = Math.min(h * 0.4, w * 0.25);
    switch (sh) {
      case 'ellipse': return arc(x + w / 2, y + h / 2, w / 2, h / 2, 0, Math.PI * 2, 48).slice(0, -1);
      case 'diamond': return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
      case 'para': return [[x + q, y], [x + w, y], [x + w - q, y + h], [x, y + h]];
      case 'hexagon': return [[x + q, y], [x + w - q, y], [x + w, y + h / 2], [x + w - q, y + h], [x + q, y + h], [x, y + h / 2]];
      case 'chevron': return [[x, y], [x + w - q, y], [x + w, y + h / 2], [x + w - q, y + h], [x, y + h], [x + q, y + h / 2]];
      case 'cylinder': { var e = Math.min(h * 0.12, 10); return arc(x + w / 2, y + e, w / 2, e, Math.PI, Math.PI * 2, 16).concat(arc(x + w / 2, y + h - e, w / 2, e, 0, Math.PI, 16)); }
      case 'doc': { var wv = Math.min(h * 0.12, 9), pts = [[x, y], [x + w, y]]; for (var j = 0; j <= 16; j++) pts.push([x + w - w * j / 16, y + h - wv + Math.sin(j / 16 * Math.PI * 2) * wv]); return pts; }
    }
    return null;
  }
  function drawBox(d, it, b, opts) {
    var k = strongest(it), p = b.part || {}, bc = BOX_COLOR[p.color];
    var stroke = k ? MARK_COLOR[k] : bc ? bc[1] : C.line, fill = k === 'red' ? '#fff7f7' : k === 'green' ? '#f6fcf8' : k === 'yellow' ? '#fffcf2' : bc ? bc[0] : C.box;
    var sw = p.stroke || (k ? 2.5 : 1.6), pts = p.shape && p.shape !== 'rect' && p.shape !== 'round' ? shapePts(p.shape, b.x, b.y, b.w, b.h) : null, f = b.fs || opts.fs;
    var at = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (p.shape ? ' data-shape="' + SHAPE_PPT[p.shape] + '"' : '');
    return itemOpen(d, it, b.band ? ' data-band="' + r(b.band[0] + 4) + ' ' + r(b.band[1] - 4) + '"' : '') +
      (pts ? '<path class="box" d="M' + pts.map(function (q) { return r(q[0]) + ' ' + r(q[1]); }).join(' L') + ' Z"' + at + '/>'
        : '<rect class="box" x="' + r(b.x) + '" y="' + r(b.y) + '" width="' + r(b.w) + '" height="' + r(b.h) + '" rx="' + (p.shape === 'rect' ? 2 : p.shape === 'round' ? r(b.h / 2) : 10) + '"' + at + '/>') +
      (info(it, opts) ? cornerDot(b.x + b.w - (p.shape === 'diamond' ? b.w / 2 - 6 : 1), b.y + 1) : '') +
      textEl(b.lines, b.x + b.w / 2, b.y + b.h / 2 + (p.shape === 'cylinder' ? Math.min(b.h * 0.06, 5) : p.shape === 'doc' ? -Math.min(b.h * 0.06, 4) : 0), f) +
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
      // 帯（担当）のある図は、自分の帯の中だけ（帯を変えるのは md の [担当] を書きかえる R8b）
      var y0 = b.band ? b.band[0] + 4 : 0, y1 = b.band ? b.band[1] - 4 : H;
      b.x = Math.max(0, Math.min(p.x, W - b.w)); b.y = Math.max(y0, Math.min(p.y, y1 - b.h));
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
    var k = b.shape === 'decision' ? 1 / (Math.abs(dx) / (b.w / 2 + pad) + Math.abs(dy) / (b.h / 2 + pad))   // ひし形のふち
      : Math.min(dx ? (b.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + pad) / Math.abs(dy) : Infinity);
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
    // 曲げる点を通る2次の曲線を、3次（C）で書く（PowerPoint の書き出しは M・L・C だけを読む）
    var c = [2 * bend[0] - (s0[0] + e0[0]) / 2, 2 * bend[1] - (s0[1] + e0[1]) / 2];
    var c1 = [s0[0] + (c[0] - s0[0]) * 2 / 3, s0[1] + (c[1] - s0[1]) * 2 / 3], c2 = [e0[0] + (c[0] - e0[0]) * 2 / 3, e0[1] + (c[1] - e0[1]) * 2 / 3];
    return { d: 'M' + r(s0[0]) + ' ' + r(s0[1]) + ' C' + r(c1[0]) + ' ' + r(c1[1]) + ' ' + r(c2[0]) + ' ' + r(c2[1]) + ' ' + r(e0[0]) + ' ' + r(e0[1]), mx: bend[0], my: bend[1] };
  }
  // 線の形（layout の route）：straight・curve・elbow（折れ線）
  function routeEdge(route, a, b, fs) {
    if (route === 'straight') return freeEdge(a, b, null);
    if (route === 'curve') return freeEdge(a, b, null, fs * 2.2);
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2, d, mx, my;
    if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
      var sx = bx > ax ? a.x + a.w : a.x, ex = bx > ax ? b.x - 2 : b.x + b.w + 2; mx = (sx + ex) / 2; my = (ay + by) / 2;
      d = 'M' + r(sx) + ' ' + r(ay) + ' L' + r(mx) + ' ' + r(ay) + ' L' + r(mx) + ' ' + r(by) + ' L' + r(ex) + ' ' + r(by);
    } else {
      var sy = by > ay ? a.y + a.h : a.y, ey = by > ay ? b.y - 2 : b.y + b.h + 2; my = (sy + ey) / 2; mx = (ax + bx) / 2;
      d = 'M' + r(ax) + ' ' + r(sy) + ' L' + r(ax) + ' ' + r(my) + ' L' + r(bx) + ' ' + r(my) + ' L' + r(bx) + ' ' + r(ey);
    }
    return { d: d, mx: mx, my: my };
  }
  // 矢印の先（head：end・none・both）と点線（dash）
  function edgeAttrs(lay, arrow) {
    var h = lay.head || (arrow ? 'end' : 'none');
    return (h !== 'none' ? ' marker-end="url(#' + ARW + ')"' : '') + (h === 'both' ? ' marker-start="url(#' + ARW + ')"' : '') + (lay.dash ? ' stroke-dasharray="7 5"' : '');
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
      if (lay.route && e.from !== e.to) { var re = routeEdge(lay.route, a, b, opts.fs); path = re.d; mx = re.mx; my = re.my; }
      out += '<path class="edge"' + ekAttr(e.pk) + ' d="' + path + '" fill="none" stroke="' + C.edge + '" stroke-width="2"' + edgeAttrs(lay, true) + '/>';
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
    var M = diag.items.map(function (it) { return measurePart(diag, it, fs, maxW); });
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
        col.forEach(function (v) { B[v] = { x: colX[ci] + (cw - M[v].w) / 2, y: y, w: M[v].w, h: M[v].h, lines: M[v].lines, fs: M[v].fs, part: partOf(diag, diag.items[v]) }; y += M[v].h + vgap; });
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
          c.forEach(function (v) { B[v] = { x: colX[ci] + (cw - M[v].w) / 2, y: yy, w: M[v].w, h: M[v].h, lines: M[v].lines, fs: M[v].fs, part: partOf(diag, diag.items[v]), band: [y, y + h] }; yy += M[v].h + vgap; });
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
    var TW = Math.max.apply(null, items.map(function (it, i) { return X(dayNum(it.date)) + labelW[i]; }).concat([width])) + 20, lay = diag.layout || {};
    items.forEach(function (it, i) {
      var cx = X(dayNum(it.date)), k = strongest(it), col = k ? MARK_COLOR[k] : C.accent;
      var ly = axisY + lv[i] * rowH, top = lv[i] < 0, h = fs * 2.7, by = top ? ly - h / 2 : ly - h / 2, bx = cx - 2, p = lay[it.pk];
      // 動かした札：日付の点は線の上のまま。点から札のいちばん近いふちへ線を引く
      if (p && p.x != null) { bx = Math.max(0, Math.min(p.x, TW - labelW[i])); by = Math.max(0, Math.min(p.y, height - h)); }
      var sx = Math.max(bx, Math.min(cx, bx + labelW[i])), sy = axisY < by ? by : axisY > by + h ? by + h : axisY;
      var s = itemOpen(d, it);
      if (it.end) {
        var ex = X(dayNum(it.end));
        s += '<rect x="' + r(cx) + '" y="' + r(axisY - 6) + '" width="' + r(Math.max(ex - cx, 4)) + '" height="12" rx="6" fill="' + col + '" opacity="0.55"/>';
      }
      s += '<line x1="' + r(cx) + '" x2="' + r(p && p.x != null ? sx : cx) + '" y1="' + r(axisY) + '" y2="' + r(p && p.x != null ? sy : top ? by + h : by) + '" stroke="' + col + '" stroke-width="2"/>' +
        '<circle cx="' + r(cx) + '" cy="' + r(axisY) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="3"/>' +
        '<rect class="box" x="' + r(bx) + '" y="' + r(by) + '" width="' + r(labelW[i]) + '" height="' + r(h) + '" rx="8" fill="#fff" stroke="' + col + '" stroke-width="' + (k ? 2.2 : 1.4) + '"/>' +
        (info(it, opts) ? cornerDot(bx + labelW[i] - 1, by + 1) : '') +
        '<text x="' + r(bx + 10) + '" y="' + r(by + h * 0.3) + '" font-size="' + r(Math.max(11, fs * 0.82)) + '" dominant-baseline="central" fill="' + C.sub + '">' + esc(it.dateText) + '</text>' +
        '<text x="' + r(bx + 10) + '" y="' + r(by + h * 0.68) + '" font-size="' + fs + '" font-weight="bold" dominant-baseline="central" fill="' + C.text + '">' + esc(it.label) + '</text>' +
        badges(it, bx + labelW[i], by - 3, fs, true) + '</g>';
      body += s;
    });
    return wrapSvg(TW, height, body, 'timeline');
  }

  // ---- 木 ----
  function tree(diag, d, opts) {
    var fs = opts.fs, items = diag.items, kids = items.map(function () { return []; }), roots = [];
    items.forEach(function (it) { if (it.parent == null) roots.push(it.id); else kids[it.parent].push(it.id); });
    var leaves = items.filter(function (it) { return !kids[it.id].length; }).length;
    var horiz = leaves > 10;   // 葉が多いときは左から右へ（横に長くなりすぎないように）
    var M = items.map(function (it) { return measurePart(diag, it, fs, horiz ? fs * 12 : fs * 10); });
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
      return horiz ? { x: dpos[it.depth], y: pos[it.id] - m.h / 2 + 20, w: m.w, h: m.h, lines: m.lines, fs: m.fs, part: partOf(diag, it) }
        : { x: pos[it.id] - m.w / 2 + 20, y: dpos[it.depth], w: m.w, h: m.h, lines: m.lines, fs: m.fs, part: partOf(diag, it) };
    });
    var body = '', W = Math.max.apply(null, B.map(function (b) { return b.x + b.w; })) + 30, H = Math.max.apply(null, B.map(function (b) { return b.y + b.h; })) + 30;
    var moved = applyLayout(diag, B, W, H);
    items.forEach(function (it) {
      if (it.parent == null) return;
      var a = B[it.parent], b = B[it.id], p, pk = items[it.parent].pk + '>' + it.pk, lay = edgeLay(diag, pk);
      if (lay.route) p = routeEdge(lay.route, a, b, fs).d;
      else if (moved[it.parent] || moved[it.id] || lay.bend) p = freeEdge(a, b, lay.bend).d;
      else if (horiz) { var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2; p = 'M' + r(x1) + ' ' + r(y1) + ' C' + r(mx) + ' ' + r(y1) + ' ' + r(mx) + ' ' + r(y2) + ' ' + r(x2) + ' ' + r(y2); }
      else { var X1 = a.x + a.w / 2, Y1 = a.y + a.h, X2 = b.x + b.w / 2, Y2 = b.y, my = (Y1 + Y2) / 2; p = 'M' + r(X1) + ' ' + r(Y1) + ' C' + r(X1) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(my) + ' ' + r(X2) + ' ' + r(Y2); }
      body += '<path class="edge"' + ekAttr(pk) + ' d="' + p + '" fill="none" stroke="' + C.edge + '" stroke-width="2"' + edgeAttrs(lay, false) + '/>';
    });
    items.forEach(function (it) { body += drawBox(d, it, B[it.id], opts); });
    return wrapSvg(W, H, body, 'tree');
  }

  // ---- 図解 board（R9b-1）：いちばん外の枠は横に並べ、--- で次の段。枠の中は上から下、「a | b」は横 ----
  var FRAME_FILL = ['#f4f7fc', '#e9f0f9', '#dfe8f5', '#d5e1f1', '#cbdaee', '#c1d3ea'];
  var BOARD_MAX_FRAME = 5;   // 枠として描く深さ（0〜5 の6段。深い所は parse が知らせる）
  function board(diag, d, opts) {
    var fs = opts.fs, items = diag.items, pad = fs * 0.9, gap = fs * 0.7, hf = Math.max(11, Math.round(fs * 0.8));
    var LIMIT = fs * 90;   // 横に長すぎる段は折り返す
    var kids = items.map(function () { return []; }), roots = [], M = [], B = [], parentOf = [];
    function asFrame(it) { return it.kind === 'frame' && it.depth <= BOARD_MAX_FRAME; }
    items.forEach(function (it) {
      var p = it.parent;
      while (p != null && items[p].depth > BOARD_MAX_FRAME) p = items[p].parent;   // 7段目からは6段目の枠に並べる
      parentOf[it.id] = p;
      (p == null ? roots : kids[p]).push(it.id);
    });
    function marksW(it) { return it.marks.reduce(function (a, m) { return a + tw(m.text, Math.max(11, Math.round(fs * 0.78)), true) + 16; }, 0); }
    function markGap(ids) { return ids.some(function (id) { return items[id].marks.length; }) ? fs * 1.2 : 0; }
    function linesOf(list) {
      var out = [];
      list.forEach(function (id) { var c = items[id].across, last = out[out.length - 1]; if (c && last && last.across === c) last.ids.push(id); else out.push({ across: c, ids: [id] }); });
      return out;
    }
    function mBox(it) {
      var cell = !!it.across, lab = wrap(it.label, fs, fs * (cell ? 8 : 16), 3, it.kind === 'frame'), ds = it.desc ? wrap(it.desc, hf, fs * 16, 3) : [];
      var numW = it.kind === 'step' ? fs * 2 : 0, tagW = it.tag ? tw(it.tag, hf, true) + hf * 1.2 + pad * 0.6 : 0;
      var labH = lab.length * fs * 1.3, dsH = ds.length ? ds.length * hf * 1.3 + fs * 0.2 : 0;
      return { lab: lab, ds: ds, labH: labH, dsH: dsH, numW: numW, tagW: tagW,
        w: Math.max(Math.max(textW(lab, fs, it.kind === 'frame'), textW(ds, hf)) + pad * 2 + numW + tagW, fs * 4, marksW(it)),
        h: Math.max(labH + dsH + pad * 1.2, it.kind === 'step' ? fs * 2.3 : 0) };
    }
    function mFrame(it) {
      var head = wrap(it.label, fs, fs * 24, 2, true), ds = it.desc ? wrap(it.desc, hf, fs * 24, 2) : [];
      var hh = head.length * fs * 1.3 + (ds.length ? ds.length * hf * 1.3 : 0) + pad * 0.6;
      var L = linesOf(kids[it.id]);
      L.forEach(function (l) {
        l.ids.forEach(measure);
        l.w = l.ids.reduce(function (a, id) { return a + M[id].w; }, 0) + gap * (l.ids.length - 1);
        l.h = Math.max.apply(null, l.ids.map(function (id) { return M[id].h; }));
        l.top = markGap(l.ids);
      });
      var inner = Math.max.apply(null, [0].concat(L.map(function (l) { return l.w; })));
      return { frame: true, head: head, ds: ds, hh: hh, L: L,
        w: Math.max(inner, textW(head, fs, true), textW(ds, hf), marksW(it)) + pad * 2,
        h: pad * 0.8 + hh + L.reduce(function (a, l) { return a + l.top + l.h; }, 0) + gap * Math.max(0, L.length - 1) + pad };
    }
    function measure(id) { M[id] = asFrame(items[id]) ? mFrame(items[id]) : mBox(items[id]); }
    // 置く：枠の中の1つだけの行は枠の幅いっぱい、「a | b」の行は余りを分ける
    function put(id, x, y, w) {
      var m = M[id];
      B[id] = { x: x, y: y, w: w, h: m.h };
      if (!m.frame) return;
      var cy = y + pad * 0.8 + m.hh, iw = w - pad * 2;
      m.L.forEach(function (l, li) {
        cy += l.top;
        if (!l.across) put(l.ids[0], x + pad, cy, iw);
        else {
          var extra = (iw - l.w) / l.ids.length, cx = x + pad;
          l.ids.forEach(function (cid) { put(cid, cx, cy, M[cid].w + extra); cx += M[cid].w + extra + gap; });
        }
        cy += l.h + (li < m.L.length - 1 ? gap : 0);
      });
    }
    var rows = [];
    roots.forEach(function (id) { var rw = items[id].row || 0; (rows[rw] = rows[rw] || []).push(id); });
    var y = 20;
    rows.forEach(function (ids) {
      if (!ids) return;
      var x = 20, lineH = 0, top = 0;
      ids.forEach(measure);
      var chunk = [];
      function flush() { top = markGap(chunk.map(function (c) { return c.id; })); chunk.forEach(function (c) { put(c.id, c.x, y + top, M[c.id].w); }); y += top + lineH + fs * 3; chunk = []; x = 20; lineH = 0; }
      ids.forEach(function (id) {
        if (chunk.length && x + M[id].w > 20 + LIMIT) flush();
        chunk.push({ id: id, x: x }); x += M[id].w + fs * 2.5; lineH = Math.max(lineH, M[id].h);
      });
      if (chunk.length) flush();
    });
    // 動かした所（R9d）：外の枠・箱は図の中の位置、枠の中のものは枠の左上からの差。動かすと中身もついてくる
    var lay = diag.layout || {};
    function shift(id, dx, dy) { B[id].x += dx; B[id].y += dy; kids[id].forEach(function (c) { shift(c, dx, dy); }); }
    items.forEach(function (it) {
      var p = lay[it.pk], b = B[it.id], par = parentOf[it.id];
      if (!p || p.x == null || !b) return;
      var nx = par == null ? Math.max(0, p.x) : B[par].x + Math.max(pad * 0.3, p.x), ny = par == null ? Math.max(0, p.y) : B[par].y + Math.max(pad * 0.8 + M[par].hh, p.y);
      shift(it.id, nx - b.x, ny - b.y);
    });
    for (var v = items.length - 1; v >= 0; v--) {   // 枠は中身に合わせて広げる（中から外へ）
      if (!B[v] || !asFrame(items[v])) continue;
      kids[v].forEach(function (c) { B[v].w = Math.max(B[v].w, B[c].x + B[c].w + pad - B[v].x); B[v].h = Math.max(B[v].h, B[c].y + B[c].h + pad - B[v].y); });
    }
    var W = Math.max.apply(null, B.map(function (b) { return b.x + b.w; }).concat([200])) + 20, H = Math.max.apply(null, B.map(function (b) { return b.y + b.h; }).concat([40])) + 20;
    var body = '', E = boardEdges(diag, B, opts);
    items.forEach(function (it) { B[it.id].p = parentOf[it.id]; if (asFrame(it)) body += drawFrame(d, it, B[it.id], M[it.id], opts); });   // 枠を先に（箱と入れ子にしない）
    body += E.paths;   // 線は枠の上・箱の下。言葉はいちばん上
    items.forEach(function (it) { if (!asFrame(it)) body += drawCard(d, it, B[it.id], M[it.id], opts); });
    body += E.labels;
    return wrapSvg(W, H, body, 'board');
  }
  // 線：ふちからふちへ。=> は強調の色で太く。自分へ戻る線は右に小さな輪
  function boardEdges(diag, B, opts) {
    var paths = '', labels = '', fs = Math.max(11, Math.round(opts.fs * 0.85)), strongId = ARW + '-s';
    if (diag.edges.some(function (e) { return e.strong; })) paths += '<defs><marker id="' + strongId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="' + C.accent + '"/></marker></defs>';
    diag.edges.forEach(function (e) {
      var a = B[e.from], b = B[e.to], lay = edgeLay(diag, e.pk), p;
      if (!a || !b) return;
      if (e.from === e.to) {
        var x = a.x + a.w, y1 = a.y + a.h * 0.3, y2 = a.y + a.h * 0.7, k = opts.fs * 2;
        p = { d: 'M' + r(x) + ' ' + r(y1) + ' C' + r(x + k) + ' ' + r(y1 - k / 2) + ' ' + r(x + k) + ' ' + r(y2 + k / 2) + ' ' + r(x + 2) + ' ' + r(y2), mx: x + k * 0.8, my: (y1 + y2) / 2 };
      } else p = lay.route ? routeEdge(lay.route, a, b, opts.fs) : freeEdge(a, b, lay.bend, hasReverse(diag, e) ? opts.fs * 1.6 : 0);
      var at = e.strong ? ' stroke="' + C.accent + '" stroke-width="3"' : ' stroke="' + C.edge + '" stroke-width="2"', ea = edgeAttrs(lay, true);
      if (e.strong) ea = ea.replace(new RegExp('url\\(#' + ARW + '\\)', 'g'), 'url(#' + strongId + ')');
      paths += '<path class="edge' + (e.strong ? ' strong' : '') + '"' + ekAttr(e.pk) + ' d="' + p.d + '" fill="none"' + at + ea + '/>';
      // 縦の線の言葉は線の右へ（枠の名前は左寄せなので隠さない）
      var side = !lay.label && e.from !== e.to && Math.abs(b.y + b.h / 2 - a.y - a.h / 2) > Math.abs(b.x + b.w / 2 - a.x - a.w / 2) ? tw(e.label || '', fs) / 2 + 12 : 0;
      if (e.label) labels += edgeLabel(e.label, p.mx + side + (lay.label ? lay.label[0] : 0), p.my + (lay.label ? lay.label[1] : 0), fs, e.pk);
    });
    return { paths: paths, labels: labels };
  }
  function pAttr(b) { return b.p != null ? ' data-p="' + b.p + '"' : ''; }   // 入っている枠（動かすとき、枠からの差に直す）
  function drawFrame(d, it, b, m, opts) {
    var fs = opts.fs, pad = fs * 0.9, hf = Math.max(11, Math.round(fs * 0.8)), k = strongest(it);
    var hy = b.y + pad * 0.8, out = itemOpen(d, it, pAttr(b)).replace('class="item"', 'class="item frame"') +
      '<rect class="box" x="' + r(b.x) + '" y="' + r(b.y) + '" width="' + r(b.w) + '" height="' + r(b.h) + '" rx="12" fill="' + FRAME_FILL[Math.min(it.depth, FRAME_FILL.length - 1)] + '" stroke="' + (k ? MARK_COLOR[k] : '#b8c7de') + '" stroke-width="' + (k ? 2.5 : 1.4) + '"/>' +
      textEl(m.head, b.x + pad, hy + m.head.length * fs * 1.3 / 2, fs, { anchor: 'start', bold: true });
    if (m.ds.length) out += textEl(m.ds, b.x + pad, hy + m.head.length * fs * 1.3 + m.ds.length * hf * 1.3 / 2, hf, { anchor: 'start', fill: C.sub });
    return out + (info(it, opts) ? cornerDot(b.x + b.w - 1, b.y + 1) : '') + badges(it, b.x + b.w, b.y - 3, fs, true) + '</g>';
  }
  function drawCard(d, it, b, m, opts) {
    var fs = opts.fs, pad = fs * 0.9, hf = Math.max(11, Math.round(fs * 0.8)), k = strongest(it), cell = !!it.across;
    var stroke = k ? MARK_COLOR[k] : C.line, fill = k === 'red' ? '#fff7f7' : k === 'green' ? '#f6fcf8' : k === 'yellow' ? '#fffcf2' : C.box;
    var out = itemOpen(d, it, pAttr(b)) + '<rect class="box" x="' + r(b.x) + '" y="' + r(b.y) + '" width="' + r(b.w) + '" height="' + r(b.h) + '" rx="8" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (k ? 2.5 : 1.4) + '"/>';
    var top = b.y + (b.h - m.labH - m.dsH) / 2, tx = b.x + pad + m.numW, mid = cell && !m.numW && !m.tagW;
    if (m.numW) {
      var cr = fs * 0.72, cx = b.x + pad + cr, cy = b.y + b.h / 2;
      out += '<circle class="num" cx="' + r(cx) + '" cy="' + r(cy) + '" r="' + r(cr) + '" fill="' + C.accent + '"/>' + textEl([String(it.num)], cx, cy, Math.round(fs * 0.85), { bold: true, fill: '#fff' });
    }
    out += textEl(m.lab, mid ? b.x + b.w / 2 : tx, top + m.labH / 2, fs, { anchor: mid ? 'middle' : 'start', bold: it.kind === 'frame' });
    if (m.ds.length) out += textEl(m.ds, mid ? b.x + b.w / 2 : tx, top + m.labH + fs * 0.2 + (m.dsH - fs * 0.2) / 2, hf, { anchor: mid ? 'middle' : 'start', fill: C.sub });
    if (it.tag) {
      var pw = m.tagW - pad * 0.6, ph = hf * 1.5, px = b.x + b.w - pad * 0.6 - pw, py = b.y + (b.h - ph) / 2;
      out += '<g class="tag"><rect x="' + r(px) + '" y="' + r(py) + '" width="' + r(pw) + '" height="' + r(ph) + '" rx="' + r(ph / 2) + '" fill="' + C.head + '"/>' + textEl([it.tag], px + pw / 2, py + ph / 2, hf, { fill: C.sub, bold: true }) + '</g>';
    }
    return out + (info(it, opts) ? cornerDot(b.x + b.w - 1, b.y + 1) : '') + badges(it, b.x + b.w, b.y - 3, fs, true) + '</g>';
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
    var k = strongest(it), p = b.part || {}, bc = BOX_COLOR[p.color], stroke = k ? MARK_COLOR[k] : bc ? bc[1] : C.line, fill = k === 'red' ? '#fff7f7' : k === 'green' ? '#f6fcf8' : k === 'yellow' ? '#fffcf2' : bc ? bc[0] : C.box;
    var sh = it.style.shape || 'process', st = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (p.stroke || (k ? 2.5 : 1.6)) + '" data-shape="' + FC_PPT[sh] + '"', g = itemOpen(d, it), x = b.x, y = b.y, w = b.w, h = b.h;
    var P = function (pts) { return '<path class="box" d="M' + pts.map(function (p) { return r(p[0]) + ' ' + r(p[1]); }).join(' L') + ' Z"' + st + '/>'; };
    if (sh === 'decision') g += P([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    else if (sh === 'io') { var sk = h * 0.35; g += P([[x + sk, y], [x + w, y], [x + w - sk, y + h], [x, y + h]]); }
    else {
      g += '<rect class="box" x="' + r(x) + '" y="' + r(y) + '" width="' + r(w) + '" height="' + r(h) + '" rx="' + r(sh === 'terminal' ? h / 2 : 4) + '"' + st + '/>';
      if (sh === 'subprocess') g += '<line class="deco" x1="' + r(x + 9) + '" x2="' + r(x + 9) + '" y1="' + r(y) + '" y2="' + r(y + h) + '" stroke="' + stroke + '" stroke-width="1.4"/><line class="deco" x1="' + r(x + w - 9) + '" x2="' + r(x + w - 9) + '" y1="' + r(y) + '" y2="' + r(y + h) + '" stroke="' + stroke + '" stroke-width="1.4"/>';
    }
    return g + (info(it, opts) ? cornerDot(x + w - (sh === 'decision' ? w / 2 - 6 : 1), y + 1) : '') + textEl(b.lines, x + w / 2, y + h / 2, b.fs || opts.fs) + badges(it, x + w, y - 3, opts.fs, true) + '</g>';
  }
  function flowchart(diag, d, opts) {
    var fs = opts.fs, L = layers(diag), n = diag.items.length, gap = fs * 2.4, lf = Math.max(11, Math.round(fs * 0.85));
    var B = diag.items.map(function (it) {
      var pt = partOf(diag, it), m = measurePart(diag, it, fs, fs * 11), sh = pt.shape ? 'custom' : it.style.shape;
      if (sh === 'custom') return { w: m.w, h: m.h, lines: m.lines, fs: m.fs, part: pt, shape: pt.shape === 'diamond' ? 'decision' : '' };
      if (sh === 'decision') { m.w = m.w * 1.55 + fs; m.h = m.h * 1.7; }
      else if (sh === 'io') m.w += m.h * 0.7;
      else if (sh === 'subprocess') m.w += 18;
      else if (sh === 'terminal') m.w += m.h * 0.4;
      return { w: m.w, h: m.h, lines: m.lines, shape: sh, fs: m.fs, part: pt };
    });
    var isBack = function (e) { return L.back[e.from + '>' + e.to] || e.from === e.to || L.layer[e.to] <= L.layer[e.from]; };
    // 判断から出る矢印：はい は左、いいえ は右。3つ以上は、はい・書いた順・いいえ の順に左から右へ（真ん中は下から出る）
    var side = {};
    diag.items.forEach(function (it, v) {
      if (it.style.shape !== 'decision') return;
      var outs = diag.edges.filter(function (e) { return e.from === v && !isBack(e); });
      if (outs.length < 2) return;
      var no = /^(いいえ|no|n|×|ng|なし|ない|違う|ちがう)$/i, yes = /^(はい|yes|y|○|ok|あり|ある)$/i;
      var nk = function (t) { return String(t || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); };
      var hasYes = outs.some(function (e) { return yes.test(nk(e.label)); });
      if (outs.length === 2) {
        var right = outs.filter(function (e) { return no.test(nk(e.label)); })[0] || (hasYes ? outs.filter(function (e) { return !yes.test(nk(e.label)); })[0] : null) || outs[1];
        outs.forEach(function (e) { side[diag.edges.indexOf(e)] = e === right ? 1 : -1; });
        return;
      }
      var rank = function (e) { return yes.test(nk(e.label)) ? 0 : no.test(nk(e.label)) ? 2 : 1; };
      var ord = outs.slice().sort(function (p, q) { return rank(p) - rank(q) || outs.indexOf(p) - outs.indexOf(q); });
      ord.forEach(function (e, k) { side[diag.edges.indexOf(e)] = (k - (ord.length - 1) / 2) * 2 / (ord.length - 1); });   // -1 … 0 … +1
    });
    var rows = [];
    diag.items.forEach(function (it, v) { (rows[L.layer[v]] = rows[L.layer[v]] || []).push(v); });
    var cx = [], maxW = Math.max.apply(null, B.map(function (b) { return b.w; }).concat([fs * 5]));
    rows.forEach(function (row, ri) {
      if (!row) return;
      var want = row.map(function (v, k) {
        var ins = diag.edges.map(function (e, ei) { return { e: e, ei: ei }; }).filter(function (o) { return o.e.to === v && !isBack(o.e) && cx[o.e.from] != null; });
        if (!ins.length) return k * (maxW + gap);
        return ins.reduce(function (a, o) { var sd = side[o.ei] || 0; return a + cx[o.e.from] + sd * (B[o.e.from].w / 2 + B[v].w / 2 + gap) * (Math.abs(sd) < 1 ? 1 : 0.6); }, 0) / ins.length;
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
    // 戻る矢印：短いものほど内側の列（入れ子にして交わらない）。箱の右のふちの、出る所・入る所の高さも並べる
    // （上から：出る線（内→外）、入る線（外→内））
    var backs = diag.edges.map(function (e, ei) { return { e: e, ei: ei, span: Math.abs(L.layer[e.from] - L.layer[e.to]) }; })
      .filter(function (o) { return isBack(o.e) && !((moved[o.e.from] || moved[o.e.to] || edgeLay(diag, o.e.pk).bend) && o.e.from !== o.e.to); })
      .sort(function (p, q) { return p.span - q.span || p.ei - q.ei; });
    var col = {}, att = {}, at = {};
    backs.forEach(function (o, k) { col[o.ei] = k; (att[o.e.from] = att[o.e.from] || []).push({ ei: o.ei, out: 1, span: o.span }); (att[o.e.to] = att[o.e.to] || []).push({ ei: o.ei, out: 0, span: o.span }); });
    Object.keys(att).forEach(function (v) {
      var lst = att[v].sort(function (p, q) { return (q.out - p.out) || (p.out ? p.span - q.span : q.span - p.span) || p.ei - q.ei; }), b = B[v];
      lst.forEach(function (o, k) {
        var yy = b.y + b.h * (0.2 + 0.6 * (k + 1) / (lst.length + 1)), t = (yy - b.y) / b.h, sh = diag.items[v].style.shape, xx = b.x + b.w;
        if (sh === 'decision') xx = b.x + b.w / 2 + b.w / 2 * (1 - Math.abs(t - 0.5) * 2);
        else if (sh === 'io') xx = b.x + b.w - b.h * 0.35 * t;
        at[o.ei + (o.out ? 'o' : 'i')] = [xx, yy];
      });
    });
    var lab = function (t, x, yy) { labels += edgeLabel(t, x + (lay.label ? lay.label[0] : 0), yy + (lay.label ? lay.label[1] : 0), lf, lay.pk); };
    diag.edges.forEach(function (e, ei) {
      var a = B[e.from], b = B[e.to], acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, dd, el = edgeLay(diag, e.pk);
      lay = { bend: el.bend, label: el.label, pk: e.pk, route: el.route, head: el.head, dash: el.dash };
      if ((moved[e.from] || moved[e.to] || lay.bend) && e.from !== e.to) {
        if (isBack(e)) nb++;   // 戻る矢印の列は、動かしても詰めない（ほかの戻る矢印の位置が変わらないように）
        var fe = freeEdge(a, b, lay.bend, hasReverse(diag, e) ? fs * 1.6 : 0); dd = fe.d;
        if (e.label) lab(e.label, fe.mx, fe.my - lf * 1.1);
      } else if (isBack(e)) {
        // 右を回って、行き先の右のふちへ入る（判断の左右の角は、はい・いいえで使うので空けておく）
        var xr = maxR + fs * 1.6 + col[ei] * fs * 1.3, p0 = at[ei + 'o'], p1 = at[ei + 'i'];
        nb++;
        dd = 'M' + r(p0[0]) + ' ' + r(p0[1]) + ' L' + r(xr) + ' ' + r(p0[1]) + ' L' + r(xr) + ' ' + r(p1[1]) + ' L' + r(p1[0] + 2) + ' ' + r(p1[1]);
        if (e.label) lab(e.label, xr, (p0[1] + p1[1]) / 2);
      } else if (Math.abs(side[ei] || 0) >= 1) {
        var sg = side[ei] < 0 ? -1 : 1, sx = sg < 0 ? a.x : a.x + a.w, lw = tw(e.label || '', lf) + 12;
        dd = 'M' + r(sx) + ' ' + r(acy) + ' L' + r(bcx) + ' ' + r(acy) + ' L' + r(bcx) + ' ' + r(b.y - 2);
        // 札は線の上で、形の外（角から外へ）に置く。ひし形の中の字に重ねない
        var lx = (sx + bcx) / 2;
        lx = sg > 0 ? Math.max(lx, sx + lw / 2 + 6) : Math.min(lx, sx - lw / 2 - 6);
        if (e.label) lab(e.label, lx, acy - lf * 1.1);
      } else {
        var sy = a.y + a.h, my = b.y - fs * 1.8;
        dd = Math.abs(acx - bcx) < 1 ? 'M' + r(acx) + ' ' + r(sy) + ' L' + r(bcx) + ' ' + r(b.y - 2) : 'M' + r(acx) + ' ' + r(sy) + ' L' + r(acx) + ' ' + r(my) + ' L' + r(bcx) + ' ' + r(my) + ' L' + r(bcx) + ' ' + r(b.y - 2);
        if (e.label) lab(e.label, acx + tw(e.label, lf) / 2 + 14, sy + fs * 0.9);
      }
      if (lay.route && e.from !== e.to) dd = routeEdge(lay.route, a, b, fs).d;
      paths += '<path class="edge"' + ekAttr(e.pk) + ' d="' + dd + '" fill="none" stroke="' + C.edge + '" stroke-width="2"' + edgeAttrs(lay, true) + '/>';
    });
    var body = paths + diag.items.map(function (it, v) { return B[v].part.shape ? drawBox(d, it, B[v], opts) : fcShape(d, it, B[v], opts); }).join('') + labels;
    return wrapSvg(FW, FH, body, 'flowchart');
  }

  // ---- 大事な数字（カード） ----
  function kpi(diag, d, opts) {
    var fs = opts.fs, items = diag.items, per = Math.min(items.length, items.length > 4 ? (items.length === 6 ? 3 : 4) : items.length);
    var cw = fs * 17, ch = fs * 9.6, gap = fs * 1.4, body = '', lay = diag.layout || {};
    var rows = Math.ceil(items.length / per), KW = 20 + per * (cw + gap) - gap, KH = 34 + rows * (ch + gap);
    items.forEach(function (it, i) {
      var x = 10 + (i % per) * (cw + gap), y = 24 + Math.floor(i / per) * (ch + gap), k = strongest(it), p = lay[it.pk];
      if (p && p.x != null) { x = Math.max(0, Math.min(p.x, KW - cw)); y = Math.max(0, Math.min(p.y, KH - ch)); }
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
    return wrapSvg(KW, KH, body, 'kpi');
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

  // ---- 付箋（R8e）：描いた図の svg に重ねる。箱に付けたものは箱の右上、ほかは図の下。layout に位置があればそこ ----
  var NOTE_FILL = { yellow: '#fff3a6', pink: '#ffd6e3', blue: '#d4ecff', green: '#d8f5d0' }, NOTE_LINE = { yellow: '#d9c24a', pink: '#e39ab3', blue: '#8fbde6', green: '#93cc85' };
  function noteSize(n, fs) {
    var f = Math.round(fs * 0.9), per = 11, lines = [];
    n.text.split('\n').forEach(function (t) { t = t || ' '; for (var k = 0; k < t.length; k += per) lines.push(t.slice(k, k + per)); });
    var w = Math.max(90, Math.min(per, Math.max.apply(null, lines.map(function (l) { return l.length; }))) * f + 24);
    return { f: f, lines: lines, w: w, h: lines.length * f * 1.35 + 20 };
  }
  // 箱の場所を svg の文字から読む（rect.box か circle）。なければ null
  function boxOf(s, d, i) {
    var at = s.indexOf('class="item" data-d="' + d + '" data-i="' + i + '"'); if (at < 0) return null;
    var seg = s.slice(at, at + 600), r = /<rect class="box" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(seg);
    if (r) return { x: +r[1], y: +r[2], w: +r[3], h: +r[4] };
    var c = /<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/.exec(seg);
    return c ? { x: +c[1] - +c[3], y: +c[2] - +c[3], w: 2 * +c[3], h: 2 * +c[3] } : null;
  }
  function addStickies(s, diag, d, opts) {
    var list = diag.stickies || [];
    if (!list.length || opts.hideNotes) return s;
    var hm = /data-w="(\d+)" data-h="(\d+)"/.exec(s); if (!hm) return s;
    var W = +hm[1], H = +hm[2], maxX = W, maxY = H, fx = 12, fy = H + 12, rowH = 0, out = '', lay = diag.layout || {};
    list.forEach(function (n, k) {
      var z = noteSize(n, opts.fs), b = n.to != null ? boxOf(s, d, n.to) : null, x, y, p = lay[n.pk];
      if (p && isFinite(p.x) && isFinite(p.y)) { x = b ? b.x + p.x : Math.max(0, p.x); y = b ? b.y + p.y : Math.max(0, p.y); }   // 箱に付けた付箋の位置は、箱からのずれ（箱と一緒に動く）
      else if (b) { x = b.x + b.w - 14; y = Math.max(4, b.y - z.h + 10); }
      else { if (fx + z.w > Math.max(W, 320) && fx > 12) { fx = 12; fy += rowH + 12; rowH = 0; } x = fx; y = fy; fx += z.w + 12; rowH = Math.max(rowH, z.h); }
      maxX = Math.max(maxX, x + z.w + 10); maxY = Math.max(maxY, y + z.h + 10);
      var cx = x + z.w / 2, cy = y + z.h / 2;
      if (b) out += '<line class="note-link" x1="' + r(cx) + '" y1="' + r(cy) + '" x2="' + r(b.x + b.w / 2) + '" y2="' + r(b.y + b.h / 2) + '" stroke="#9aa3ad" stroke-width="1.2" stroke-dasharray="3 3"/>';
      out += '<g class="sticky" data-d="' + d + '" data-n="' + k + '" data-pk="' + esc(n.pk) + '" tabindex="0" role="button" aria-label="付箋：' + esc(n.text.replace(/\n/g, ' ')) + '" transform="rotate(-2 ' + r(cx) + ' ' + r(cy) + ')">' +
        '<rect x="' + r(x + 3) + '" y="' + r(y + 4) + '" width="' + r(z.w) + '" height="' + r(z.h) + '" fill="#000" opacity="0.12" rx="2"/>' +
        '<rect class="box" x="' + r(x) + '" y="' + r(y) + '" width="' + r(z.w) + '" height="' + r(z.h) + '" rx="2" fill="' + NOTE_FILL[n.color] + '" stroke="' + NOTE_LINE[n.color] + '" stroke-width="1"/>' +
        z.lines.map(function (l, j) { return '<text x="' + r(x + 12) + '" y="' + r(y + 10 + z.f * (1.05 + j * 1.35)) + '" font-size="' + z.f + '" fill="#3a3320">' + esc(l) + '</text>'; }).join('') + '</g>';
    });
    var nw = Math.ceil(maxX), nh = Math.ceil(maxY);
    s = s.replace(/viewBox="0 0 \d+ \d+" width="\d+" height="\d+" data-w="\d+" data-h="\d+"/, 'viewBox="0 0 ' + nw + ' ' + nh + '" width="' + nw + '" height="' + nh + '" data-w="' + nw + '" data-h="' + nh + '"');
    return s.replace(/<\/svg>$/, '<g class="stickies">' + out + '</g></svg>');
  }
  function svg(diag, d, opts) {
    opts = opts || {};
    opts.fs = opts.fs || 15;
    ARW = 'arw-' + (++seq);
    if (!diag.items.length) return addStickies(wrapSvg(360, 8, '', 'notes-only'), diag, d, opts);   // 付箋だけの図
    return addStickies(typeSvg(diag, d, opts), diag, d, opts);
  }
  function typeSvg(diag, d, opts) {
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
      case 'board': return board(diag, d, opts);
    }
    return '';
  }

  root.DocRender = { svg: svg, uniq: uniq, esc: esc, FONT: FONT, COLORS: C, PAL: PAL };
})(typeof window !== 'undefined' ? window : this);
