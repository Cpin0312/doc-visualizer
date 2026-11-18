/* DocVisualizer の 3D（three.js）。2D の SVG を元にして 3D にする：
 *   箱（.item の .box）→ 厚みのある板。板の面の文字は、SVG の文字を canvas に描いて貼る（3D の文字も canvas）
 *   矢印（path.edge）→ 管。管に沿って光がゆっくり流れる
 *   印（.mark）→ 板の上に浮かぶ札
 *   そのほか（担当の帯・時間の線・目もり・数字の文字など）→ 下の板（地面か壁）に描く
 * WebGL の描き手は1つだけ作って使い回し、図ごとの <canvas>（2D）に写す（WebGL の数の上限を越えないため）。
 * DocScene.support() → '' なら使える。だめなら理由の文
 * DocScene.create(diag, svg, { onPick }) → { canvas, draw, capture, focus, items, dispose, ... }
 */
(function (root) {
  'use strict';
  var T = root.THREE;
  var FONT = '"Yu Gothic UI", "Meiryo", "Hiragino Sans", system-ui, sans-serif';
  var S = 1 / 40;           // SVG の 40px を 3D の 1 にする
  var MAX_TEX = 2048;
  var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var renderer = null, lost = false;

  function support() {
    if (!T) return '3D の部品（three.js）が読みこめなかった';
    if (lost) return '3D の描き手（WebGL）が止まった';
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'この PC では WebGL（3D の描き手）が使えない';
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();     // 試しに作ったものはすぐ返す
    } catch (e) { return 'WebGL を始められない（' + e.message + '）'; }
    return '';
  }

  var onLost = null;
  function getRenderer() {
    if (renderer) return renderer;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; if (onLost) onLost(); });
    return renderer;
  }

  // ---------- SVG の形を canvas に描く（rect・line・path・circle・text だけ。変形は使っていない） ----------
  function num(el, a, d) { var v = parseFloat(el.getAttribute(a)); return isNaN(v) ? (d || 0) : v; }
  function paint(el) { var f = el.getAttribute('fill'); return f && f !== 'none' ? f : null; }
  function drawEl(ctx, el) {
    var tag = el.tagName.toLowerCase(), op = el.getAttribute('opacity');
    ctx.save();
    if (op) ctx.globalAlpha = parseFloat(op);
    var stroke = el.getAttribute('stroke'), sw = num(el, 'stroke-width', 1), dash = el.getAttribute('stroke-dasharray');
    ctx.lineWidth = sw; ctx.setLineDash(dash ? dash.split(/[\s,]+/).map(Number) : []);
    if (el.getAttribute('stroke-linecap')) ctx.lineCap = el.getAttribute('stroke-linecap');
    var fill = paint(el);
    if (tag === 'rect') {
      var x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height'), rx = Math.min(num(el, 'rx'), w / 2, h / 2);
      ctx.beginPath(); roundRect(ctx, x, y, w, h, rx);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.stroke(); }
    } else if (tag === 'line') {
      ctx.beginPath(); ctx.moveTo(num(el, 'x1'), num(el, 'y1')); ctx.lineTo(num(el, 'x2'), num(el, 'y2'));
      ctx.strokeStyle = stroke || '#000'; ctx.stroke();
    } else if (tag === 'circle') {
      ctx.beginPath(); ctx.arc(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.stroke(); }
    } else if (tag === 'path') {
      var p = new Path2D(el.getAttribute('d'));
      if (fill) { ctx.fillStyle = fill; ctx.fill(p); }
      if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.stroke(p); }
    } else if (tag === 'text') {
      var fs = num(el, 'font-size', 14), anchor = el.getAttribute('text-anchor') || 'start';
      ctx.font = (el.getAttribute('font-weight') === 'bold' ? 'bold ' : '') + fs + 'px ' + FONT;
      ctx.fillStyle = fill || '#1f2a37';
      ctx.textAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
      ctx.textBaseline = el.getAttribute('dominant-baseline') === 'central' ? 'middle' : 'alphabetic';
      var spans = el.querySelectorAll('tspan'), tx = num(el, 'x'), ty = num(el, 'y');
      if (!spans.length) ctx.fillText(el.textContent, tx, ty);
      Array.prototype.forEach.call(spans, function (sp) {
        if (sp.getAttribute('x') != null) tx = num(sp, 'x');
        ty += num(sp, 'dy');
        ctx.fillText(sp.textContent, tx, ty);
      });
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, r || 0);
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function anchorPoint(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'rect') return { x: num(el, 'x') + num(el, 'width') / 2, y: num(el, 'y') + num(el, 'height') / 2 };
    if (tag === 'circle') return { x: num(el, 'cx'), y: num(el, 'cy') };
    if (tag === 'line') return { x: (num(el, 'x1') + num(el, 'x2')) / 2, y: (num(el, 'y1') + num(el, 'y2')) / 2 };
    if (tag === 'text') {
      var sp = el.querySelectorAll('tspan'), n = sp.length || 1, fs = num(el, 'font-size', 14);
      return { x: num(el, 'x'), y: num(el, 'y') + (n - 1) * fs * 0.65 };
    }
    return null;   // path は線なので、どの面にも入れない
  }
  function inside(p, r) { return p && p.x >= r.x - 1 && p.x <= r.x + r.w + 1 && p.y >= r.y - 1 && p.y <= r.y + r.h + 1; }
  function rectOf(el) { return { x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width'), h: num(el, 'height'), rx: num(el, 'rx') }; }

  function texture(region, els, bg) {
    var k = Math.min(3, MAX_TEX / Math.max(region.w, region.h, 1));
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(region.w * k)); c.height = Math.max(2, Math.ceil(region.h * k));
    var ctx = c.getContext('2d');
    ctx.scale(k, k); ctx.translate(-region.x, -region.y);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(region.x, region.y, region.w, region.h); }
    els.forEach(function (el) { drawEl(ctx, el); });
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  var shadowTex = null;
  function shadowTexture() {
    if (shadowTex) return shadowTex;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(31,42,55,0.30)'); gr.addColorStop(1, 'rgba(31,42,55,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    shadowTex = new T.CanvasTexture(c);
    return shadowTex;
  }

  function slabShape(w, h, r) {
    var s = new T.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  var DEPTH = { flowchart: 20, flow: 22, lanes: 22, tree: 16, timeline: 10, chart: 0, kpi: 18, compare: 14 };
  var CHARTS = { chart: 1, pie: 1, donut: 1, line: 1, hbar: 1, stacked: 1 };
  // 円グラフの扇は「M x y L x y … Z」の多角形。中心からの点に直す
  function polyOf(el) {
    var n = (el.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [], pts = [];
    for (var k = 0; k + 1 < n.length; k += 2) pts.push([+n[k], +n[k + 1]]);
    return pts;
  }
  function boundsOf(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y, rx: 0 };
  }
  var RATE_DEPTH = { '#cdeedb': 46, '#e3f5ea': 32, '#fff4d6': 20, '#fde4e4': 10 };

  function create(diag, svg, opts) {
    opts = opts || {};
    var W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
    var ground = diag.type === 'flow' || diag.type === 'lanes';
    var scene = new T.Scene(), rootG = new T.Group(), disposables = [];
    scene.background = new T.Color('#edf1f7');
    scene.add(rootG);
    function keep(x) { disposables.push(x); return x; }
    // SVG の (x, y) と高さ h → 3D の位置
    function P(x, y, h) {
      return ground ? new T.Vector3((x - W / 2) * S, h * S, (y - H / 2) * S) : new T.Vector3((x - W / 2) * S, (H / 2 - y) * S, h * S);
    }
    function orient(obj) { if (ground) obj.rotation.x = -Math.PI / 2; }

    var hemi = new T.HemisphereLight(0xffffff, 0xcfd8e6, 1.8);
    var dir = new T.DirectionalLight(0xffffff, 1.3);
    dir.position.set(-6, 10, 8);
    scene.add(hemi, dir);

    // 箱・印・矢印に使うものと、下の板に描くものを分ける
    var all = Array.prototype.slice.call(svg.querySelectorAll('rect,line,path,circle,text')).filter(function (el) { return !el.closest('defs'); });
    var used = new Set(), items = [];
    Array.prototype.forEach.call(svg.querySelectorAll('.item'), function (g) {
      var box = g.querySelector('.box'), i = +g.getAttribute('data-i');
      if (!box) return;
      var isPath = box.tagName.toLowerCase() === 'path', poly = isPath ? polyOf(box) : null;
      var br = isPath ? boundsOf(poly) : rectOf(box), regions;
      var mine = Array.prototype.filter.call(g.querySelectorAll('rect,line,path,circle,text'), function (el) { return !el.closest('.mark'); });
      if (diag.type === 'compare') {
        var cells = mine.filter(function (el) { return el.tagName.toLowerCase() === 'rect' && el !== box; });
        var firstX = cells.length ? Math.min.apply(null, cells.map(function (c) { return num(c, 'x'); })) - 3 : br.x + br.w;
        regions = [{ r: { x: br.x, y: br.y, w: firstX - br.x, h: br.h, rx: 4 }, depth: 14, fill: '#ffffff', side: '#9fb3d1' }];
        cells.forEach(function (c) { var f = c.getAttribute('fill'); regions.push({ r: rectOf(c), depth: RATE_DEPTH[f] || 14, fill: f, side: '#b9c6da', cell: c }); });
      } else if (CHARTS[diag.type]) {
        // 数字の形（棒・扇・点）は、中まで同じ色の塊にする。積み上げは段ごと
        var segs = Array.prototype.slice.call(g.querySelectorAll('.seg, .pt'));
        if (!segs.length) segs = [box];
        regions = segs.map(function (el) {
          var pp = el.tagName.toLowerCase() === 'path' ? polyOf(el) : null, rr = pp ? boundsOf(pp) : rectOf(el);
          var f = el.getAttribute('fill'); if (!f || f === '#fff') f = el.getAttribute('stroke') || '#3b6fd8';
          return { r: rr, poly: pp, depth: pp ? 18 : Math.max(Math.min(rr.w, rr.h) * 0.8, 6), fill: f, side: f, solid: true, el: el };
        });
        segs.forEach(function (el) { used.add(el); });
      } else {
        regions = [{ r: br, poly: poly, depth: DEPTH[diag.type] || 16, fill: box.getAttribute('fill') || '#fff', side: box.getAttribute('stroke') || '#5b7db1' }];
      }
      used.add(box);
      var group = new T.Group(), it = { i: i, group: group, center: null, top: 0, meshes: [], mats: [] };
      regions.forEach(function (R) {
        var r = R.r, d = R.depth;
        var face = R.solid ? [] : mine.filter(function (el) { return el !== box && inside(anchorPoint(el), r); });
        face.forEach(function (el) { used.add(el); });
        if (R.cell) face = [R.cell].concat(face.filter(function (el) { return el !== R.cell; }));
        var shape = R.poly ? (function () {
          var sh2 = new T.Shape(), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          R.poly.forEach(function (p, k) { sh2[k ? 'lineTo' : 'moveTo']((p[0] - cx) * S, (cy - p[1]) * S); });
          return sh2;
        })() : slabShape(r.w * S, r.h * S, Math.max(r.rx || 0, 2) * S);
        var geo = keep(new T.ExtrudeGeometry(shape, { depth: d * S, bevelEnabled: true, bevelThickness: 1.2 * S, bevelSize: 1.2 * S, bevelSegments: 2, curveSegments: 6 }));
        var capMat = keep(new T.MeshStandardMaterial({ color: new T.Color(R.fill || '#ffffff'), roughness: 0.55, metalness: 0.05 }));
        var sideMat = keep(new T.MeshStandardMaterial({ color: new T.Color(R.side || '#5b7db1'), roughness: 0.5, metalness: 0.08 }));
        var mesh = new T.Mesh(geo, [capMat, sideMat]);
        var c = P(r.x + r.w / 2, r.y + r.h / 2, 0);
        mesh.position.copy(c);
        orient(mesh);
        mesh.userData.item = i;
        group.add(mesh);
        it.meshes.push(mesh); it.mats.push(capMat, sideMat);
        if (!R.solid) {
          var tex = keep(texture(r, face, R.poly ? null : (R.fill || '#ffffff')));   // ひし形などは、形の外を透かす
          var fm = keep(new T.MeshBasicMaterial({ map: tex, transparent: true }));
          var plane = new T.Mesh(keep(new T.PlaneGeometry(r.w * S, r.h * S)), fm);
          plane.position.copy(P(r.x + r.w / 2, r.y + r.h / 2, d + 1.3));
          orient(plane);
          plane.userData.item = i;
          group.add(plane);
          it.meshes.push(plane);
        }
        // やわらかい影
        var sh = new T.Mesh(keep(new T.PlaneGeometry(r.w * S * 1.25, r.h * S * 1.4)), keep(new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })));
        sh.position.copy(ground ? P(r.x + r.w / 2 + 4, r.y + r.h / 2 + 6, 0.3) : P(r.x + r.w / 2 + 5, r.y + r.h / 2 + 7, 0.3));
        orient(sh);
        group.add(sh);
        it.top = Math.max(it.top, d);
      });
      it.center = P(br.x + br.w / 2, br.y + br.h / 2, it.top / 2);
      it.box = br;
      // 印：板の上に浮かぶ札（いつもこちらを向く）
      Array.prototype.forEach.call(g.querySelectorAll('.mark'), function (m, k) {
        var mr = rectOf(m.querySelector('rect'));
        var els = Array.prototype.slice.call(m.querySelectorAll('rect,text'));
        els.forEach(function (el) { used.add(el); });
        var sp = new T.Sprite(keep(new T.SpriteMaterial({ map: keep(texture(mr, els, null)), transparent: true, depthTest: false })));
        sp.scale.set(mr.w * S * 1.3, mr.h * S * 1.3, 1);
        sp.position.copy(ground ? P(mr.x + mr.w / 2, mr.y + mr.h / 2 + 4, it.top + 26) : P(mr.x + mr.w / 2, mr.y + mr.h / 2, it.top + 8));
        sp.renderOrder = 10;
        sp.userData.item = i;
        group.add(sp);
      });
      Array.prototype.forEach.call(g.querySelectorAll('.info'), function (el) { used.add(el); });
      rootG.add(group);
      items[i] = it;
    });

    // 矢印 → 管と、流れる光
    var flows = [];
    Array.prototype.forEach.call(svg.querySelectorAll('path.edge'), function (p, k) {
      used.add(p);
      var len = p.getTotalLength(), n = Math.max(8, Math.min(60, Math.round(len / 12))), pts = [];
      for (var j = 0; j <= n; j++) { var q = p.getPointAtLength(len * j / n); pts.push(P(q.x, q.y, ground ? 5 : 6)); }
      var curve = new T.CatmullRomCurve3(pts);
      var tube = new T.Mesh(keep(new T.TubeGeometry(curve, n * 2, 1.6 * S, 8, false)), keep(new T.MeshStandardMaterial({ color: 0x8a9bb5, roughness: 0.4 })));
      rootG.add(tube);
      if (p.getAttribute('marker-end')) {
        var end = curve.getPoint(1), tan = curve.getTangent(1);
        var cone = new T.Mesh(keep(new T.ConeGeometry(4.5 * S, 11 * S, 14)), keep(new T.MeshStandardMaterial({ color: 0x6f84a6 })));
        cone.position.copy(end).addScaledVector(tan, -4 * S);
        cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tan);
        rootG.add(cone);
      }
      if (diag.type !== 'tree') {
        var dot = new T.Mesh(keep(new T.SphereGeometry(3.4 * S, 16, 12)), keep(new T.MeshBasicMaterial({ color: 0x5b8cff })));
        var glow = new T.Sprite(keep(new T.SpriteMaterial({ map: shadowTexture(), color: 0x5b8cff, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
        glow.scale.set(22 * S, 22 * S, 1);
        dot.add(glow);
        rootG.add(dot);
        flows.push({ curve: curve, dot: dot, off: (k * 0.37) % 1, speed: 0.11 / Math.max(1, len / 300) });
      }
    });

    // 下の板（地面か壁）：残りの形と文字を1枚に描く
    var rest = all.filter(function (el) { return !used.has(el) && !el.closest('.mark'); });
    var pad = 30, bgR = { x: -pad, y: -pad, w: W + pad * 2, h: H + pad * 2 };
    var bgTex = keep(texture(bgR, rest, '#ffffff'));
    var base = new T.Mesh(keep(new T.PlaneGeometry(bgR.w * S, bgR.h * S)), keep(new T.MeshBasicMaterial({ map: bgTex })));
    base.position.copy(P(W / 2, H / 2, 0));
    orient(base);
    rootG.add(base);
    // 板の縁（少し厚み）
    var rim = new T.Mesh(keep(new T.BoxGeometry(bgR.w * S, bgR.h * S, 6 * S)), keep(new T.MeshStandardMaterial({ color: 0xdfe6f0 })));
    rim.position.copy(P(W / 2, H / 2, -3.2));
    orient(rim);
    rootG.add(rim);

    // ---------- カメラ ----------
    var cam = new T.PerspectiveCamera(32, 16 / 9, 0.05, 2000);
    var bounds = new T.Box3().setFromObject(rootG), target0 = bounds.getCenter(new T.Vector3());
    var baseAz = ground ? -0.14 : -0.06, baseEl = ground ? 1.15 : 0.06;
    var view = { az: baseAz, el: baseEl, dist: 10, target: target0.clone(), dAz: 0, dEl: 0 };
    var tween = null, focusI = null;
    function dirOf(az, el) { return new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }
    function fitDist(aspect) {
      cam.aspect = aspect;
      var corners = [], mn = bounds.min, mx = bounds.max;
      for (var a = 0; a < 8; a++) corners.push(new T.Vector3(a & 1 ? mx.x : mn.x, a & 2 ? mx.y : mn.y, a & 4 ? mx.z : mn.z));
      var d = bounds.getSize(new T.Vector3()).length() * 1.2, dv = dirOf(baseAz, baseEl);
      for (var it2 = 0; it2 < 8; it2++) {
        cam.position.copy(target0).addScaledVector(dv, d); cam.lookAt(target0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        var m = 0;
        corners.forEach(function (c) { var q = c.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); });
        d = d * m / 0.9;   // 遠いほど小さく見える（ほぼ 1/d）ので、比で合わせる
      }
      return d;
    }
    var fitAspect = 0, fullDist = 10;
    function place(aspect, t) {
      if (Math.abs(aspect - fitAspect) > 0.01) { fullDist = fitDist(aspect); fitAspect = aspect; if (!tween && focusI == null) view.dist = fullDist; }
      if (tween) {
        var k = reduced ? 1 : Math.min(1, (t - tween.t0) / 1.1), e = k * k * (3 - 2 * k);
        view.target.lerpVectors(tween.fromT, tween.toT, e);
        view.dist = tween.fromD + (tween.toD - tween.fromD) * e;
        if (k >= 1) tween = null;
      }
      var sway = reduced ? 0 : Math.sin(t * 0.12) * 0.05;
      cam.aspect = aspect;
      cam.position.copy(view.target).addScaledVector(dirOf(view.az + view.dAz + sway, Math.max(0.05, Math.min(1.35, view.el + view.dEl))), view.dist);
      cam.lookAt(view.target);
      cam.updateProjectionMatrix();
    }

    // ---------- 描く ----------
    var canvas = document.createElement('canvas');
    canvas.className = 'scene3d';
    function animate(t) {
      flows.forEach(function (f) { f.dot.position.copy(f.curve.getPointAt(reduced ? 0.5 : (t * f.speed + f.off) % 1)); });
      if (diag.type === 'kpi' && !reduced) items.forEach(function (it, k) { if (it) it.group.position[ground ? 'y' : 'z'] = Math.sin(t * 0.7 + k * 1.3) * 0.08; });
    }
    var lastT = 0;
    function drawTo(target, t) {
      if (lost) return false;
      lastT = t;
      var r = getRenderer();
      var pr = Math.min(root.devicePixelRatio || 1, 1.5);
      var cw = target.clientWidth || +target.getAttribute('width') || 800, ch = target.clientHeight || +target.getAttribute('height') || 450;
      var bw = Math.round(cw * pr), bh = Math.round(ch * pr);
      if (target.width !== bw || target.height !== bh) { target.width = bw; target.height = bh; }
      place(cw / ch, t);
      animate(t);
      r.setSize(bw, bh, false);
      r.render(scene, cam);
      var ctx = target.getContext('2d');
      ctx.drawImage(r.domElement, 0, 0, bw, bh);
      return true;
    }
    function capture(w, h) {
      // PDF・PowerPoint 用の絵（真っ黒にならないよう、描いた直後に 2D の canvas へ写して取る）
      if (lost) return '';
      w = w || 1200; h = h || 675;
      var r = getRenderer(), c = document.createElement('canvas');
      c.width = w; c.height = h;
      place(w / h, 6); animate(6);
      r.setSize(w, h, false);
      r.render(scene, cam);
      c.getContext('2d').drawImage(r.domElement, 0, 0, w, h);
      return c.toDataURL('image/png');
    }

    // ---------- 押す・回す ----------
    var ray = new T.Raycaster(), drag = null;
    function pick(ev, el) {
      var b = el.getBoundingClientRect();
      var ndc = new T.Vector2((ev.clientX - b.left) / b.width * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      place(b.width / b.height, performance.now() / 1000);
      ray.setFromCamera(ndc, cam);
      var hit = ray.intersectObjects(rootG.children, true).filter(function (h) { return h.object.userData.item != null; })[0];
      return hit ? hit.object.userData.item : null;
    }
    function bind(el, redraw) {
      el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, az: view.dAz, el: view.dEl, moved: false }; try { el.setPointerCapture(e.pointerId); } catch (x) { /* なくてよい */ } });
      el.addEventListener('pointermove', function (e) {
        if (!drag) { el.style.cursor = pick(e, el) != null ? 'pointer' : 'grab'; return; }
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        view.dAz = Math.max(-0.9, Math.min(0.9, drag.az - dx * 0.006));
        view.dEl = Math.max(-0.8, Math.min(0.6, drag.el + dy * 0.005));
        if (redraw) redraw();
      });
      el.addEventListener('pointerup', function (e) {
        var d = drag; drag = null;
        if (d && !d.moved && opts.onPick) opts.onPick(pick(e, el), e);   // 何もない所なら null（窓の外を押した）
      });
      el.addEventListener('dblclick', function () { view.dAz = 0; view.dEl = 0; if (redraw) redraw(); });
    }

    function select(i) {
      items.forEach(function (x) { if (x) x.mats.forEach(function (m) { m.emissive.setHex(0x000000); }); });
      if (i != null && items[i]) items[i].mats.forEach(function (m) { m.emissive.setHex(0x2b5fd0); m.emissiveIntensity = 0.35; });
    }
    function focus(i) {
      var it = i == null ? null : items[i];
      select(i);
      view.dAz = 0; view.dEl = 0;   // 発表では、ドラッグで回した向きを元に戻してから寄る
      var toT = it ? it.center.clone() : target0.clone();
      var toD = it ? Math.max(fullDist * 0.5, (Math.max(it.box.w, it.box.h) * S) * 3.2) : fullDist;
      tween = { t0: performance.now() / 1000, fromT: view.target.clone(), toT: toT, fromD: view.dist, toD: toD };
      focusI = i == null ? null : i;
    }

    function dispose() {
      disposables.forEach(function (d) { try { d.dispose(); } catch (e) { /* もう片づいている */ } });
      disposables.length = 0;
      scene.clear();
    }

    return {
      canvas: canvas, ground: ground, items: items,
      draw: function (t, target) { return drawTo(target || canvas, t == null ? performance.now() / 1000 : t); },
      capture: capture, bind: bind, focus: focus, select: select, dispose: dispose,
      busy: function () { return !!tween; },
      // 全体を見る向きで、図が画面の上で横長・縦長どちらに見えるか（幅÷高さ）。画面の形をこれに合わせると、むだな余白がなくなる
      shape: function () {
        var dv = dirOf(baseAz, baseEl), mn = bounds.min, mx = bounds.max, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        cam.aspect = 1; cam.updateProjectionMatrix();
        cam.position.copy(target0).addScaledVector(dv, fitDist(1)); cam.lookAt(target0); cam.updateMatrixWorld();
        for (var a = 0; a < 8; a++) { var q = new T.Vector3(a & 1 ? mx.x : mn.x, a & 2 ? mx.y : mn.y, a & 4 ? mx.z : mn.z).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
        fitAspect = 0;   // 次に描くとき、本当の画面の形で合わせ直す
        return (x1 - x0) / (y1 - y0);
      },
      // 全体を見る向きで、SVG の 1px が画面の何 px に見えるか（文字が小さくなりすぎないよう、画面の幅を決めるのに使う）
      textScale: function (w, h) {
        place(w / h, 0);
        cam.updateMatrixWorld();   // project() は描く前の古い向きを使うので、ここで新しくする
        var pts = [[W / 2, H / 2], [W / 2, 0], [0, H / 2], [W, H / 2], [W / 2, H]], m = Infinity;
        pts.forEach(function (q) {
          var o = P(q[0], q[1], 0).project(cam), x = P(q[0] + 50, q[1], 0).project(cam), y = P(q[0], q[1] + 50, 0).project(cam);
          var sx = Math.hypot((x.x - o.x) * w / 2, (x.y - o.y) * h / 2) / 50, sy = Math.hypot((y.x - o.x) * w / 2, (y.y - o.y) * h / 2) / 50;
          m = Math.min(m, sx, sy);
        });
        return m;
      },
      // 試験と発表用：箱の真ん中が画面のどこに見えるか（押す場所を知るだけ）
      project: function (i, el) {
        var b = el.getBoundingClientRect(), it = items[i];
        if (!it) return null;
        place(b.width / b.height, lastT);
        var v = it.center.clone().project(cam);
        return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
      }
    };
  }

  root.DocScene = { support: support, create: create, reduced: reduced,
    stats: function () { return renderer ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } : null; }, setOnLost: function (f) { onLost = f; } };
})(typeof window !== 'undefined' ? window : this);
