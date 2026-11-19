/* DocVisualizer の読みとり（画面と試験（node）の両方が使う。ここだけが正本）
 * 使い方：ブラウザでは window.DocParse、node では require('./src/parse.js')
 *   parseDoc(text) → 読みとった文書
 *   decodeBytes(Uint8Array) → { text, encoding, warn }
 *   check(text) → 図の数・種類・箱の数・知らせ（試験用の短い形）
 * きまり：Copilot の書きまちがいに強く、ゆるく読む。読めない行は飛ばして知らせる。
 * 表に出す文字は元のまま（全角→半角などは、読みとりの判断にだけ使う）。
 */
(function (root) {
  'use strict';

  var MAX_ITEMS = 200;

  var TYPES = {
    flow: { label: '流れ', names: ['flow', '流れ', 'フロー', '流れ図', '手順', 'process'] },
    flowchart: { label: 'フローチャート', names: ['flowchart', 'フローチャート', 'chartflow'] },
    lanes: { label: '担当ごとの流れ', names: ['lanes', 'lane', 'swimlane', '担当', '担当ごとの流れ', '担当別', 'スイムレーン'] },
    timeline: { label: '日程', names: ['timeline', '日程', 'スケジュール', '予定', '年表'] },
    tree: { label: '木', names: ['tree', '木', 'ツリー', '構成', '階層', '組織'] },
    chart: { label: '数字', names: ['chart', '数字', 'グラフ', '棒グラフ', 'bar', '縦棒'] },
    pie: { label: '円グラフ', names: ['pie', '円グラフ', '円', 'パイ'] },
    donut: { label: 'ドーナツ', names: ['donut', 'doughnut', 'ドーナツ', 'ドーナツグラフ'] },
    line: { label: '折れ線', names: ['line', '折れ線', '折れ線グラフ', '線グラフ'] },
    hbar: { label: '横棒', names: ['hbar', '横棒', '横棒グラフ'] },
    stacked: { label: '積み上げ', names: ['stacked', '積み上げ', '積み上げ棒', '積み上げグラフ'] },
    kpi: { label: '大事な数字', names: ['kpi', '大事な数字', '指標', '数値'] },
    compare: { label: '比べる', names: ['compare', '比べる', '比較', '表'] },
    board: { label: '図解', names: ['board', '図解', 'ボード', 'まとめ図'] }
  };
  var TYPE_OF = {};
  Object.keys(TYPES).forEach(function (t) { TYPES[t].names.forEach(function (n) { TYPE_OF[nk(n)] = t; }); });

  // 読みとりの判断用：全角→半角・大文字→小文字・空白なし（表に出す文字には使わない）
  function nk(s) { return String(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }
  function nfkc(s) { return String(s).normalize('NFKC'); }
  function trim(s) { return String(s).replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''); }

  var RE_FENCE = /^[ \t\u3000]{0,3}(`{3,}|~{3,})[ \t\u3000]*(.*?)[ \t\u3000]*$/;
  var RE_ARROW = /[\s\u3000]*(?:[-－ー—─―‐]{1,2}[>＞]|[=＝][>＞]|[→⇒⟶➡➔])[\s\u3000]*/;
  var RE_SOURCE = /[\[［【][\s\u3000]*(?:元|出典|出どころ|出所|参照|source)[\s\u3000]*[:：][\s\u3000]*([^\]］】]*)[\]］】]/gi;
  var RE_MARK = /(^|[\s\u3000])([!！?？+＋])([^\s\u3000!！?？+＋]*)/g;
  var RE_LANE = /^[\[［【]([^\]］】]+)[\]］】][\s\u3000]*([\s\S]*)$/;
  var MARK_KIND = { '!': 'red', '！': 'red', '?': 'yellow', '？': 'yellow', '+': 'green', '＋': 'green' };
  var MARK_DEFAULT = { red: '注意', yellow: '確認', green: '完了' };
  var HEAD_KEYS = [
    ['summary', ['ひとことで', '一言で', 'ひと言で', '要約', 'まとめ', 'サマリー', 'summary']],
    ['conclusion', ['結論', 'けつろん', 'conclusion']],
    ['todo', ['すること', 'やること', '次にすること', 'todo', 'アクション', '次の一手', 'action']],
    ['secret', ['社外秘', '機密', '秘密区分', '取り扱い', '取扱い', '取扱', '区分']]
  ];

  // 「:」で分ける（10:00 のような数字の間の「:」は区切りにしない）
  function splitColon(s, max) {
    var parts = [], cur = '', n = 1;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if ((c === ':' || c === '：') && (!max || n < max) && !(c === ':' && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || ''))) {
        parts.push(cur); cur = ''; n++;
      } else cur += c;
    }
    parts.push(cur);
    return parts.map(trim);
  }

  function takeSources(s, out) {
    return s.replace(RE_SOURCE, function (_, src) { if (trim(src)) out.push(trim(src)); return ' '; });
  }

  // 「承認 !期限 ?確認」→ { label:'承認', marks:[…] }
  // noPlus：大事な数字のひとこと（「前年比 +8%」）では + を印にしない
  function takeMarks(s, noPlus) {
    var marks = [];
    var label = s.replace(RE_MARK, function (all, pre, sym, text) {
      if (noPlus && (sym === '+' || sym === '＋')) return all;
      // 中身のない記号（「A + B」）と、数字の前の +（「+120」）は印にしない
      if (!text || ((sym === '+' || sym === '＋') && /^[0-9０-９]/.test(text))) return all;
      var kind = MARK_KIND[sym];
      marks.push({ kind: kind, text: text || MARK_DEFAULT[kind] });
      return pre;
    });
    return { label: trim(label).replace(/[\s\u3000]{2,}/g, ' '), marks: marks };
  }

  // 数字を読む：1,200 / １２０ / 1.2万 / ▲5 / 約30 → { value }（読めなければ null）
  function parseNumber(s) {
    var t = nfkc(s).replace(/\s/g, '').replace(/^(約|およそ|~|〜)/, '');
    // 桁区切りのコンマは「1,200」「1,300,900」の形だけ（3桁ずつ）。「1,2」などは読めない数として知らせる
    var gm = /^([▲△+\-−–—ー]?)(\d{1,3}(?:,\d{3})+)(?!\d|,)/.exec(t);
    if (gm) t = gm[1] + gm[2].replace(/,/g, '') + t.slice(gm[0].length);
    else if (/^[▲△+\-−–—ー]?\d*,/.test(t)) return null;
    var neg = false;
    if (/^[▲△]/.test(t)) { neg = true; t = t.slice(1); }
    t = t.replace(/^[−–—ー]/, '-');
    var m = /^([+-]?\d+(?:\.\d+)?)(兆|億|万|千|k|m)?/i.exec(t);
    if (!m) return null;
    var v = parseFloat(m[1]);
    var mul = { '兆': 1e12, '億': 1e8, '万': 1e4, '千': 1e3, k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1;
    v = v * mul;
    return neg ? -v : v;
  }

  function headKey(word) {
    var k = nk(word);
    for (var i = 0; i < HEAD_KEYS.length; i++) {
      for (var j = 0; j < HEAD_KEYS[i][1].length; j++) if (nk(HEAD_KEYS[i][1][j]) === k) return HEAD_KEYS[i][0];
    }
    return null;
  }

  function fenceInfo(info) {
    var m = /^([^\s\u3000:：]+)[\s\u3000:：]*(.*)$/.exec(trim(info));
    if (!m) return { word: '', type: null, name: '' };
    return { word: m[1], type: TYPE_OF[nk(m[1])] || null, name: trim(m[2]) };
  }

  // ---- 外側の ```markdown の包みをはずす（前後の Copilot のあいさつ文も外す） ----
  function unwrap(lines, warn) {
    var start = -1, ch = '', len = 0;
    for (var i = 0; i < lines.length; i++) {
      var m = RE_FENCE.exec(lines[i].text);
      if (!m) continue;
      if (/^(markdown|md)$/i.test(trim(m[2]))) { start = i; ch = m[1][0]; len = m[1].length; }
      break;
    }
    if (start < 0) return lines;
    var depth = 0, end = -1;
    for (var j = start + 1; j < lines.length; j++) {
      var f = RE_FENCE.exec(lines[j].text);
      if (!f) continue;
      if (trim(f[2])) { depth++; continue; }      // 種類つき → 中の図の始まり
      if (depth > 0) { depth--; continue; }        // 中の図の終わり
      if (f[1][0] === ch && f[1].length >= len) { end = j; break; }
    }
    if (end < 0) { warn(lines[start].no, '外側の ```markdown の終わりがないので、最後までを中身とみなした', 'fix'); end = lines.length; }
    return lines.slice(start + 1, end);
  }

  // ---- 図ごとの読みとり ----
  function Registry(diag, warn) {
    // 省いた数は「省いた箱の数」で数える（同じ箱が何回出てきても1つ。まとめない種類は1行が1つ）
    var byKey = {}, over = 0, overKeys = {};
    diag.items = [];
    return {
      get: function (label, no, merge) {
        var key = nk(label);
        if (merge !== false && byKey[key]) return byKey[key];
        if (diag.items.length >= MAX_ITEMS) {
          if (merge === false) over++;
          else if (!overKeys[key]) { overKeys[key] = true; over++; }
          return null;
        }
        // 部品は、どの種類でも同じ形で持つ（kind・style。style の形・色・大きさ・位置は、あとで編集が入れる）
        var it = { id: diag.items.length, kind: 'box', label: label, key: key, marks: [], sources: [], line: no, style: {} };
        diag.items.push(it);
        if (merge !== false) byKey[key] = it;
        return it;
      },
      count: function () { return diag.items.length; },
      finish: function (no) { if (over) warn(no, '図「' + (diag.name || TYPES[diag.type].label) + '」は箱が ' + MAX_ITEMS + ' を超えたので、先頭の ' + MAX_ITEMS + ' だけ出した（' + over + ' 個を省いた）', 'skip'); }
    };
  }

  function addMarks(it, marks, sources) {
    marks.forEach(function (m) {
      if (!it.marks.some(function (x) { return x.kind === m.kind && x.text === m.text; })) it.marks.push(m);
    });
    sources.forEach(function (s) { if (it.sources.indexOf(s) < 0) it.sources.push(s); });
  }

  function isSentence(label) {
    return /[\s\u3000、。，．,？?！!…「」『』]/.test(label) || Array.from(label).length > 24;
  }

  // フローチャートの形：(開始) 端・<在庫ある?> 判断・[[発注]] 別の手順・/入力/ 入出力・ふつうは処理
  var SHAPES = [[/^[(（]([\s\S]+)[)）]$/, 'terminal'], [/^[<＜]([\s\S]+)[>＞]$/, 'decision'], [/^(?:\[\[|［［)([\s\S]+)(?:\]\]|］］)$/, 'subprocess'], [/^[\/／]([\s\S]+)[\/／]$/, 'io']];
  function shapeOf(s) {
    for (var k = 0; k < SHAPES.length; k++) { var m = SHAPES[k][0].exec(s); if (m && trim(m[1])) return { shape: SHAPES[k][1], text: trim(m[1]) }; }
    return null;
  }
  function parseGraph(diag, lines, warn, withLanes, shapes) {
    var reg = Registry(diag, warn), edgeKey = {};
    diag.edges = [];
    if (withLanes) diag.lanes = [];
    function laneOf(name) {
      var k = nk(name);
      for (var i = 0; i < diag.lanes.length; i++) if (nk(diag.lanes[i]) === k) return diag.lanes[i];
      diag.lanes.push(name); return name;
    }
    lines.forEach(function (ln) {
      var segs = ln.text.split(RE_ARROW);
      // 行の中の位置（R8b-3：名前を直す・消すときに、その所だけを書きかえる）。矢印の所と、区切った各部分の始まり
      var arrows = [], segAt = [0], reA = new RegExp(RE_ARROW.source, 'g'), am;
      while ((am = reA.exec(ln.text))) { if (!am[0].length) { reA.lastIndex++; continue; } arrows.push([am.index, am.index + am[0].length]); segAt.push(am.index + am[0].length); }
      var edgeLabel = '';
      if (segs.length > 1) {
        var last = splitColon(segs[segs.length - 1], 2);
        segs[segs.length - 1] = last[0];
        edgeLabel = last[1] || '';
      }
      var lane = null, nodes = [];
      for (var i = 0; i < segs.length; i++) {
        var src = [], from = segAt[i], laneSpan = null;
        var s = trim(takeSources(segs[i], src));
        if (withLanes) {
          var lm = RE_LANE.exec(s);
          if (lm) {
            lane = laneOf(trim(lm[1]));
            var lt = ln.text.indexOf(trim(lm[1]), from);
            if (lt >= 0) { laneSpan = { line: ln.no, start: lt, end: lt + trim(lm[1]).length }; from = ln.text.slice(lt).search(/[\]］】]/) + lt + 1; }
            s = trim(lm[2]);
          }
        }
        var sh = shapes ? shapeOf(s) : null;
        if (sh) s = sh.text;
        var tm = takeMarks(s);
        if (!tm.label) {
          warn(ln.no, segs.length > 1 ? '矢印の前か後ろに箱の名前がないので、この行を飛ばした' : '箱の名前がないので飛ばした', 'skip');
          return;
        }
        // 矢印のない行は「箱を1つ置く」だけ（名前と印）。文のような行は図にしない
        if (segs.length === 1 && !sh && isSentence(tm.label)) {
          warn(ln.no, '矢印のない文の行なので飛ばした（箱を1つ置くなら「承認 !期限」のように名前だけ。説明は図の外の「## 箱の名前」の下へ）', 'skip');
          return;
        }
        var at = ln.text.indexOf(tm.label, from), segEnd = i < arrows.length ? arrows[i][0] : ln.text.length;
        var span = at >= 0 && at + tm.label.length <= segEnd ? { line: ln.no, start: at, end: at + tm.label.length, seg: i, segs: segs.length } : { line: ln.no, bad: true, seg: i, segs: segs.length };
        nodes.push({ label: tm.label, marks: tm.marks, sources: src, lane: lane, shape: sh && sh.shape, span: span, laneSpan: laneSpan });
      }
      if (withLanes && nodes.length && !nodes[0].lane) {
        // 行の先頭に担当がなければ、あとに出た担当か、最初の担当を使う
        var later = nodes.filter(function (n) { return n.lane; })[0];
        var fill = later ? later.lane : (diag.lanes[0] || laneOf('担当なし'));
        if (!later && fill === diag.lanes[0] && nodes.every(function (n) { return !n.lane; })) warn(ln.no, '担当（[営業] など）がないので「' + fill + '」に入れた', 'fix');
        for (var k = 0; k < nodes.length && !nodes[k].lane; k++) nodes[k].lane = fill;
      }
      if (withLanes) for (var q = 1; q < nodes.length; q++) if (!nodes[q].lane) nodes[q].lane = nodes[q - 1].lane;
      if (withLanes) nodes.forEach(function (n) { n.span.lane = n.lane; if (n.laneSpan) n.laneSpan.seg = n.span.seg; });   // 帯をまたぐ（setLane）ときに使う
      var its = nodes.map(function (n) {
        var it = reg.get(n.label, ln.no);
        if (!it) return null;
        addMarks(it, n.marks, n.sources);
        (it.spans = it.spans || []).push(n.span);
        if (n.laneSpan) (it.laneSpans = it.laneSpans || []).push(n.laneSpan);
        if (withLanes && !it.lane) it.lane = n.lane;
        if (n.shape && !it.style.shape) it.style.shape = n.shape;
        return it;
      });
      for (var e = 1; e < its.length; e++) {
        if (!its[e - 1] || !its[e]) continue;
        var key = its[e - 1].id + '>' + its[e].id;
        var lab = e === its.length - 1 ? edgeLabel : '';
        var occ = { line: ln.no, arrow: arrows[e - 1], seg: e - 1 };
        if (edgeKey[key]) { if (lab && !edgeKey[key].label) edgeKey[key].label = lab; edgeKey[key].occ.push(occ); continue; }
        edgeKey[key] = { id: 'e' + diag.edges.length, kind: 'line', from: its[e - 1].id, to: its[e].id, label: lab, line: ln.no, style: {}, occ: [occ] };
        diag.edges.push(edgeKey[key]);
      }
    });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  var RE_DATE = /^(\d{4})[\s]*[-\/.年][\s]*(\d{1,2})(?:[\s]*[-\/.月][\s]*(\d{1,2})[\s]*日?|[\s]*月)?/;
  var RE_DATE_NOYEAR = /^(\d{1,2})[\s]*[\/月][\s]*(\d{1,2})[\s]*日?/;
  function mkDate(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
  }
  function iso(dt) { return dt.toISOString().slice(0, 10); }

  function parseTimeline(diag, lines, warn) {
    var reg = Registry(diag, warn), lastYear = null;
    lines.forEach(function (ln) {
      var raw = ln.text.replace(/^[\s\u3000]*[-*・][\s\u3000]+/, '');
      var n = nfkc(raw);       // 日付の部分は全角も1文字ずつなので、位置は元の文字と同じ
      var m = RE_DATE.exec(n), y, mo, d, monthOnly = false, used, fixed = '';
      if (m) { y = +m[1]; mo = +m[2]; d = m[3] ? +m[3] : 1; monthOnly = !m[3]; used = m[0].length; }
      else if ((m = RE_DATE_NOYEAR.exec(n))) {
        y = lastYear || new Date().getFullYear(); mo = +m[1]; d = +m[2]; used = m[0].length;
        fixed = '年がないので ' + y + ' 年とみなした';
      } else { warn(ln.no, '先頭の日付が読めないので飛ばした（例：2026-12-01 説明会）', 'skip'); return; }
      var start = mkDate(y, mo, d);
      if (!start) { warn(ln.no, 'ない日付（' + trim(raw.slice(0, used)) + '）なので飛ばした', 'skip'); return; }
      lastYear = y;
      var rest = n.slice(used), restRaw = raw.slice(used), end = null;
      var r = /^[\s]*(?:~|〜|～|-|–|から)[\s]*/.exec(rest);
      if (r) {
        var rest2 = rest.slice(r[0].length), m2, ey, em, ed, u2 = 0;
        if ((m2 = RE_DATE.exec(rest2))) { ey = +m2[1]; em = +m2[2]; ed = m2[3] ? +m2[3] : 1; u2 = m2[0].length; }
        else if ((m2 = RE_DATE_NOYEAR.exec(rest2))) { ey = y; em = +m2[1]; ed = +m2[2]; u2 = m2[0].length; }
        else if ((m2 = /^(\d{1,2})[\s]*日?/.exec(rest2)) && m2[1]) { ey = y; em = mo; ed = +m2[1]; u2 = m2[0].length; }
        if (u2) {
          end = mkDate(ey, em, ed);
          if (end && end < start) { warn(ln.no, '終わりの日が始まりより前なので、終わりを消した', 'fix'); end = null; }
          var cut = r[0].length + u2;
          rest = rest.slice(cut); restRaw = restRaw.slice(cut);
        }
      }
      var src = [];
      var label = takeSources(restRaw.replace(/^[\s\u3000]*[:：]?/, ''), src);
      var tm = takeMarks(label);
      if (!tm.label) { warn(ln.no, '日付のあとに名前がないので飛ばした', 'skip'); return; }
      if (fixed) warn(ln.no, fixed, 'fix');
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
      it.date = iso(start); it.end = end ? iso(end) : null; it.monthOnly = monthOnly && !end;
      it.dateText = trim(raw.slice(0, raw.length - restRaw.length));
    });
    diag.items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    diag.items.forEach(function (it, i) { it.id = i; });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  function parseTree(diag, lines, warn) {
    var reg = Registry(diag, warn), stack = [];
    lines.forEach(function (ln) {
      var m = /^([ \t\u3000]*)/.exec(ln.text);
      var ind = 0;
      for (var i = 0; i < m[1].length; i++) ind += m[1][i] === '\t' ? 4 : m[1][i] === '\u3000' ? 2 : 1;
      var s = ln.text.slice(m[1].length).replace(/^(?:[-*+・●○■□▪︎◆◇]|\d+[.)．）])[\s\u3000]+/, ''), head = ln.text.length - s.length;
      var src = [];
      var tm = takeMarks(takeSources(s, src));
      if (!tm.label) return;
      while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
      var at = ln.text.indexOf(tm.label, head);   // 名前を直す・消すときの場所
      (it.spans = it.spans || []).push(at >= 0 ? { line: ln.no, start: at, end: at + tm.label.length, seg: 0, segs: 1 } : { line: ln.no, bad: true, seg: 0, segs: 1 });
      it.parent = stack.length ? stack[stack.length - 1].it.id : null;
      it.depth = stack.length;
      stack.push({ ind: ind, it: it });
    });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  // 図解 board（R9a）。字下げで入れ子にする枠・箱・横の箱・番号の札・タグ・段・線
  //   [名前] 説明 ＝枠 / 名前 : 説明 ＝箱 / a | b ＝横の箱 / #1 文 ＝札 / … @タグ / --- ＝次の段 / A -> B : 言葉（=> は強調）
  var RE_FRAME = /^[\[［【]([^\]］】]+)[\]］】][\s　]*([\s\S]*)$/;
  var RE_STEP = /^(?:[#＃][\s　]*([0-9０-９]+)|([①-⑳]))[\s　]*([\s\S]+)$/;
  var RE_ROWBREAK = /^(?:-{3,}|ー{3,}|—{3,}|―{3,}|─{3,})$/;
  var RE_TAG = /[\s　][@＠]([^\s@＠]+)$/;
  function parseBoard(diag, lines, warn) {
    var reg = Registry(diag, warn), stack = [], row = 0, prev = null, edgeLines = [], group = 0;
    diag.edges = [];
    function indOf(t) { var m = /^[ \t　]*/.exec(t)[0], n = 0; for (var i = 0; i < m.length; i++) n += m[i] === ' ' ? 1 : 2; return n; }
    function spanOf(ln, label, from) { var at = ln.text.indexOf(label, from); return at >= 0 ? { line: ln.no, start: at, end: at + label.length, seg: 0, segs: 1 } : { line: ln.no, bad: true, seg: 0, segs: 1 }; }
    function shown(it) { return it.kind === 'frame' ? '[' + it.label + ']' : it.label; }
    function place(it, ln, label, from, top) {
      it.parent = top ? top.it.id : null; it.depth = stack.length; it.row = row;
      var sp = spanOf(ln, label, from); it.spans = [sp];
      return sp.bad ? from : sp.end;
    }
    // 1回目：枠と箱を置く（線の行は、名前が全部そろってから2回目で読む）
    lines.forEach(function (ln) {
      var ind = indOf(ln.text), body = trim(ln.text);
      if (ind === 0 && RE_ROWBREAK.test(body)) { row++; stack = []; prev = null; return; }
      if (/^[>＞]/.test(body)) { warn(ln.no, '吹き出し（> 文）はまだ読めないので飛ばした', 'skip'); return; }
      if (RE_ARROW.test(splitColon(body, 2)[0])) { edgeLines.push(ln); return; }
      while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
      var top = stack[stack.length - 1] || null;
      if (prev && !prev.frame && ind > prev.ind) warn(ln.no, '箱の下を字下げしても中には入らないので、' + (top ? '「' + shown(top.it) + '」の中に' : '外に') + '並べた', 'fix');
      else if (top && top.childInd != null && top.childInd !== ind) warn(ln.no, '字下げがずれていたので「' + shown(top.it) + '」の中に入れた', 'fix');
      else if (!top && ind > 0 && !prev) warn(ln.no, '字下げしているが、入る枠がないので外に置いた', 'fix');
      if (top && top.childInd == null) top.childInd = ind;
      var src = [], s = trim(takeSources(body, src)).replace(/^[-*・][\s　]+/, '');
      var fm = RE_FRAME.exec(s);
      if (fm && trim(fm[1])) {
        var lab = trim(fm[1]), tm = takeMarks(fm[2]), fr = reg.get(lab, ln.no, false);
        if (!fr) return;
        fr.kind = 'frame'; fr.key = '[' + fr.key + ']'; fr.desc = tm.label;   // 枠の名前は箱と分ける（付箋は「[枠] : 文」で付く）
        addMarks(fr, tm.marks, src);
        place(fr, ln, lab, 0, top);
        stack.push({ ind: ind, it: fr });
        prev = { frame: true, ind: ind };
        return;
      }
      var parts = s.split(/[\s　]*[|｜][\s　]*/), g = parts.length > 1 ? ++group : null, from = 0;
      parts.forEach(function (p, pi) {
        var st = RE_STEP.exec(p), num = null;
        if (st) { num = st[1] ? +nfkc(st[1]) : st[2].charCodeAt(0) - 0x245f; p = st[3]; }
        var tm = takeMarks(p), lab = tm.label, tag = null, tg = RE_TAG.exec(lab);
        if (tg) { tag = tg[1]; lab = trim(lab.slice(0, tg.index)); }
        var cs = splitColon(lab, 2);
        if (!cs[0]) { warn(ln.no, '箱の名前がないので飛ばした', 'skip'); return; }
        var it = reg.get(cs[0], ln.no, false);
        if (!it) return;
        it.kind = num ? 'step' : 'box'; it.num = num; it.desc = cs[1] || ''; it.tag = tag; it.across = g;
        addMarks(it, tm.marks, pi ? [] : src);   // 出どころは行の最初の箱に
        from = place(it, ln, cs[0], from, top);
      });
      prev = { frame: false, ind: ind };
    });
    var deep = diag.items.filter(function (it) { return it.kind === 'frame' && it.depth > 5; })[0];
    if (deep) warn(deep.line, '7段より深い枠は、6段目の枠の中にまとめて出した（md はそのまま）', 'fix');
    // 2回目：線。同じ名前がいくつかあるときは「[枠] 名前」→ もう一方の端と同じいちばん外の枠 → はじめのもの
    var items = diag.items, edgeKey = {};
    function rootOf(it) { while (it.parent != null) it = items[it.parent]; return it; }
    function inside(it, fr) { for (var x = it; x; x = x.parent != null ? items[x.parent] : null) if (x.id === fr.id) return true; return false; }
    function ends(seg) {
      var t = takeMarks(trim(takeSources(seg, []))).label, fm = RE_FRAME.exec(t);
      if (fm) {
        var frames = items.filter(function (it) { return it.kind === 'frame' && it.key === '[' + nk(fm[1]) + ']'; }), rest = trim(fm[2]);
        if (!rest) return { name: t, list: frames };
        return { name: t, list: items.filter(function (it) { return it.kind !== 'frame' && it.key === nk(rest) && frames.some(function (f) { return inside(it, f); }); }) };
      }
      var boxes = items.filter(function (it) { return it.kind !== 'frame' && it.key === nk(t); });
      return { name: t, list: boxes.length ? boxes : items.filter(function (it) { return it.kind === 'frame' && it.key === '[' + nk(t) + ']'; }) };
    }
    edgeLines.forEach(function (ln) {
      var body = trim(ln.text), cs = splitColon(body, 2), head = cs[0], label = cs[1] || '';
      var reA = new RegExp(RE_ARROW.source, 'g'), arrows = [], strong = [], am, off = ln.text.indexOf(body);
      while ((am = reA.exec(head))) { if (!am[0].length) { reA.lastIndex++; continue; } arrows.push([off + am.index, off + am.index + am[0].length]); strong.push(/[=＝⇒]/.test(am[0])); }
      var es = head.split(RE_ARROW).map(ends), miss = es.filter(function (e) { return !e.list.length; })[0];
      if (miss) { warn(ln.no, miss.name ? '線の端「' + miss.name + '」が図にないので、この行を飛ばした' : '矢印の前か後ろに名前がないので、この行を飛ばした', 'skip'); return; }
      var pick = es.map(function (e) { return e.list.length === 1 ? e.list[0] : null; });
      for (var pass = 0; pass < 2; pass++) pick.forEach(function (p, i) {
        var nb = pick[i - 1] || pick[i + 1];
        if (p || !nb) return;
        var same = es[i].list.filter(function (c) { return rootOf(c).id === rootOf(nb).id; });
        if (same.length === 1) pick[i] = same[0];
      });
      pick.forEach(function (p, i) {
        if (p) return;
        pick[i] = es[i].list[0];
        var r = rootOf(pick[i]);
        warn(ln.no, '「' + es[i].name + '」が ' + es[i].list.length + ' つあり、どれか決められないので' + (r === pick[i] ? 'はじめのもの' : '「' + shown(r) + '」の中のもの') + 'にした（「[枠] 名前」と書くと選べる）', 'fix');
      });
      for (var e = 1; e < pick.length; e++) {
        var key = pick[e - 1].id + '>' + pick[e].id, lab = e === pick.length - 1 ? label : '', occ = { line: ln.no, arrow: arrows[e - 1], seg: e - 1 };
        if (edgeKey[key]) { if (lab && !edgeKey[key].label) edgeKey[key].label = lab; edgeKey[key].occ.push(occ); continue; }
        edgeKey[key] = { id: 'e' + diag.edges.length, kind: 'line', from: pick[e - 1].id, to: pick[e].id, label: lab, strong: strong[e - 1], line: ln.no, style: {}, occ: [occ] };
        diag.edges.push(edgeKey[key]);
      }
    });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  function parseChart(diag, lines, warn) {
    var um = /^([\s\S]*?)[\s\u3000]*[（(]([^()（）]+)[)）][\s\u3000]*$/.exec(diag.name);
    if (um && trim(um[2])) { diag.unit = trim(um[2]); diag.name = trim(um[1]); } else diag.unit = '';
    var reg = Registry(diag, warn);
    lines.forEach(function (ln) {
      var src = [];
      var s = trim(takeSources(ln.text.replace(/^[\s\u3000]*[-*・][\s\u3000]+/, ''), src));
      var parts = splitColon(s, 2), label, vtext;
      if (parts.length < 2) {
        var sm = /^(.*?)[\s\u3000]+([^\s\u3000]+)$/.exec(s);
        if (!sm) { warn(ln.no, '「名前 : 数字」の形でないので飛ばした', 'skip'); return; }
        label = sm[1]; vtext = sm[2];
      } else { label = parts[0]; vtext = parts[1]; }
      var tmv = takeMarks(vtext);
      var v = parseNumber(tmv.label);
      if (v === null) { warn(ln.no, '数字（' + trim(vtext) + '）が読めないので飛ばした', 'skip'); return; }
      var tm = takeMarks(label);
      if (!tm.label) { warn(ln.no, '名前がないので飛ばした', 'skip'); return; }
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks.concat(tmv.marks), src);
      it.value = v; it.valueText = tmv.label;
    });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  // 折れ線・積み上げ：1行目に「系列 : 売上, 費用」（なくてもよい）、そのあと「4月 : 120, 80」。欠けは「-」
  function parseSeries(diag, lines, warn) {
    var um = /^([\s\S]*?)[\s\u3000]*[（(]([^()（）]+)[)）][\s\u3000]*$/.exec(diag.name);
    if (um && trim(um[2])) { diag.unit = trim(um[2]); diag.name = trim(um[1]); } else diag.unit = '';
    var reg = Registry(diag, warn), names = null, n = 0;
    // 値の区切り：「, 」（コンマとスペース）・全角のコンマ・「、」。スペースのないコンマは、うしろがちょうど3桁なら桁区切り
    var bare = false;
    var split = function (t) {
      bare = /,(?![\s\u3000]|\d{3}(?!\d))/.test(t);
      return t.split(/[\s\u3000]*(?:[，、]|,[\s\u3000]+|,(?!\d{3}(?!\d)))[\s\u3000]*/).map(trim);
    };
    lines.forEach(function (ln, li) {
      var src = [];
      var s = trim(takeSources(ln.text.replace(/^[\s\u3000]*[-*・][\s\u3000]+/, ''), src));
      var parts = splitColon(s, 2);
      if (parts.length < 2) { warn(ln.no, '「名前 : 数字, 数字」の形でないので飛ばした', 'skip'); return; }
      if (!names && !reg.count() && /^(系列|series|凡例)$/i.test(nk(parts[0]))) { names = split(parts[1]).filter(Boolean); return; }
      var tm = takeMarks(parts[0]);
      if (!tm.label) { warn(ln.no, '名前がないので飛ばした', 'skip'); return; }
      var vals = split(parts[1]), out = [], texts = [], bad = null;
      var vmarks = [];
      vals.forEach(function (t) {
        var tv = takeMarks(t); vmarks = vmarks.concat(tv.marks); t = tv.label;   // 値の後ろの印（!期限 など）は箱の印にする
        if (/^[-－ー―—]?$/.test(nfkc(t)) && !/\d/.test(t)) { out.push(null); texts.push(''); return; }
        var v = parseNumber(t);
        if (v === null) bad = t; out.push(v); texts.push(t);
      });
      if (bad !== null) { warn(ln.no, '数字（' + bad + '）が読めないので飛ばした', 'skip'); return; }
      if (bare) warn(ln.no, 'コンマのあとにスペースがないので、値の区切りとして読んだ（区切りは「, 」、桁区切りは「1,200」）', 'fix');
      if (diag.type === 'stacked') out.forEach(function (v, k) { if (v < 0) { warn(ln.no, '積み上げは 0 より小さい数（' + texts[k] + '）を描けないので、0 として扱った', 'fix'); out[k] = 0; texts[k] = '0'; } });
      if (!out.some(function (v) { return v !== null; })) { warn(ln.no, '数字がないので飛ばした', 'skip'); return; }
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks.concat(vmarks), src);
      it.values = out; it.valueTexts = texts;
      it.value = out.reduce(function (a, v) { return a + (v || 0); }, 0);
      it.valueText = out.length > 1 ? texts.filter(Boolean).join(' / ') : texts[0];
      n = Math.max(n, out.length);
    });
    diag.items.forEach(function (it) { while (it.values.length < n) { it.values.push(null); it.valueTexts.push(''); } });
    if (names && names.length !== n && diag.items.length) warn(diag.line, '系列の名前が ' + names.length + ' つ、数字が ' + n + ' つで数が合わないので、足りない名前は「系列 n」にした', 'fix');
    diag.series = [];
    for (var k = 0; k < n; k++) diag.series.push(names && names[k] ? names[k] : (n === 1 ? (diag.name || '値') : '系列 ' + (k + 1)));
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  // 円グラフは 0 より小さい数を描けない（扇の大きさは 0 にして、知らせる）
  function noNeg(diag, warn) {
    diag.items.forEach(function (it) { if (it.value < 0) { warn(it.line, '円グラフは 0 より小さい数（' + it.valueText + '）を描けないので、0 として扱った', 'fix'); it.value = 0; } });
  }

  function parseKpi(diag, lines, warn) {
    var reg = Registry(diag, warn);
    lines.forEach(function (ln) {
      var src = [];
      var s = trim(takeSources(ln.text.replace(/^[\s\u3000]*[-*・][\s\u3000]+/, ''), src));
      var parts = splitColon(s, 3);
      if (parts.length < 2 || !parts[1]) { warn(ln.no, '「名前 : 数字 : ひとこと」の形でないので飛ばした', 'skip'); return; }
      var tm = takeMarks(parts[0]);
      if (!tm.label) { warn(ln.no, '名前がないので飛ばした', 'skip'); return; }
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
      it.valueText = parts[1]; it.value = parseNumber(parts[1]);
      var nm = takeMarks(parts[2] || '', true);
      addMarks(it, nm.marks, []);
      it.note = nm.label;
      var nn = nfkc(it.note);
      it.trend = /[+↑]|増|伸/.test(nn) ? 'up' : /[-−↓▼▲]|減|落/.test(nn) ? 'down' : '';
    });
    reg.finish(lines.length ? lines[lines.length - 1].no : 0);
  }

  function rateCell(t) {
    var n = nfkc(t);
    if (/◎|★/.test(n)) return 'best';
    if (/^[+＋]/.test(t) || /[○〇◯✓✔]/.test(n)) return 'good';
    if (/^[?？]/.test(t) || /△/.test(n)) return 'mid';
    if (/^[!！]/.test(t) || /[×✕✗✖]/.test(n)) return 'bad';
    return '';
  }

  function parseCompare(diag, lines, warn) {
    var reg = Registry(diag, warn), header = null;
    diag.options = [];
    lines.forEach(function (ln) {
      var t = trim(ln.text);
      if (!/[|｜]/.test(t)) { warn(ln.no, '表の行（| で区切る）でないので飛ばした', 'skip'); return; }
      if (/^[|｜\s:：\-－ー—]+$/.test(t)) return;   // |---|---| の行
      var cells = t.replace(/^[|｜]/, '').replace(/[|｜]$/, '').split(/[|｜]/).map(trim);
      if (!header) {
        header = cells;
        diag.corner = cells[0];
        diag.options = cells.slice(1);
        if (!diag.options.length) { warn(ln.no, '1行目に案の名前がない', 'skip'); header = null; }
        return;
      }
      var vals = cells.slice(1);
      if (vals.length !== diag.options.length) {
        warn(ln.no, '列の数が1行目と違う（' + vals.length + ' と ' + diag.options.length + '）ので、そろえた', 'fix');
        while (vals.length < diag.options.length) vals.push('');
        vals = vals.slice(0, diag.options.length);
      }
      var src = [];
      var tm = takeMarks(takeSources(cells[0], src));
      if (!tm.label) { warn(ln.no, '項目の名前がないので飛ばした', 'skip'); return; }
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
      it.cells = vals.map(function (v) {
        var vs = [];
        v = trim(takeSources(v, vs));
        vs.forEach(function (x) { if (it.sources.indexOf(x) < 0) it.sources.push(x); });
        return { text: v.replace(/^[+＋!！?？][\s\u3000]*/, ''), rate: rateCell(v) };
      });
    });
    if (!header && lines.length) warn(lines[0].no, '表が読めなかった（1行目に | 区切りで案の名前を書く）', 'skip');
  }

  // ---- 文書全体 ----
  // ---- 付箋（R8e）：`note 文 @色`、箱に付けるなら `note 箱 : 文 @色`。`note ` で始まり `@色` で終わる行だけ ----
  var RE_NOTE = /^[ \t\u3000]*note[ \t\u3000]+(.+?)[ \t\u3000]*[@＠]([^\s@＠]+)[ \t\u3000]*$/i;
  var NOTE_COLOR = { '黄': 'yellow', 'き': 'yellow', 'きいろ': 'yellow', '黄色': 'yellow', 'yellow': 'yellow', 'ピンク': 'pink', 'pink': 'pink', '桃': 'pink', '水色': 'blue', 'みずいろ': 'blue', '青': 'blue', 'blue': 'blue', '緑': 'green', 'みどり': 'green', 'green': 'green' };
  var NOTE_WORD = { yellow: '黄', pink: 'ピンク', blue: '水色', green: '緑' };
  function readStickies(diag, lines, warn) {
    var used = {};
    return lines.map(function (ln) {
      var m = RE_NOTE.exec(ln.text), color = NOTE_COLOR[nk(m[2])] || NOTE_COLOR[m[2]];
      if (!color) { warn(ln.no, '付箋の色「' + m[2] + '」は使えないので、黄にした（使える色：黄・ピンク・水色・緑）', 'fix'); color = 'yellow'; }
      var text = trim(m[1]), to = null, am = /^(.+?)[ \t\u3000]*[:：][ \t\u3000]*([\s\S]+)$/.exec(text);
      if (am) { var k = nk(am[1]), hit = diag.items.filter(function (it) { return it.key === k; })[0]; if (hit) { to = hit.id; text = trim(am[2]); } }
      text = text.replace(/\\n/g, '\n');
      var pk = '@' + nk(text).slice(0, 40); used[pk] = (used[pk] || 0) + 1; if (used[pk] > 1) pk += '#' + used[pk];
      return { text: text, color: color, to: to, line: ln.no, pk: pk };
    });
  }
  function parseDoc(text) {
    var warnings = [];
    function warn(no, msg, kind) { warnings.push({ line: no, msg: msg, kind: kind || 'skip' }); }
    var all = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
      .map(function (t, i) { return { text: t, no: i + 1 }; });
    var lines = unwrap(all, warn);
    var doc = { title: '', summary: '', conclusion: '', todo: '', secret: '', diagrams: [], notes: [], body: [], warnings: warnings, layout: null, layoutAt: null, wrapEnd: unwrapEnd(all), wrapStart: unwrapStart(all) };
    var sections = [], cur = { heading: null, level: 0, line: 0, lines: [] }, seenStructure = false;
    sections.push(cur);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], t = ln.text;
      var fm = RE_FENCE.exec(t);
      if (fm) {
        var ch = fm[1][0], flen = fm[1].length, inner = [], closed = false, j = i + 1;
        for (; j < lines.length; j++) {
          var cm = RE_FENCE.exec(lines[j].text);
          if (cm && cm[1][0] === ch && cm[1].length >= flen && !trim(cm[2])) { closed = true; break; }
          inner.push(lines[j]);
        }
        var info = fenceInfo(fm[2]);
        if (!closed) { warn(ln.no, '図やコードの終わり（' + fm[1] + '）がないので、最後までを中身とみなした', 'fix'); (doc.unsafe = doc.unsafe || []).push(ln.no + ' 行目の「' + fm[1] + '」に閉じがない'); }
        if (nk(info.word) === 'layout') {
          if (doc.layoutAt) warn(ln.no, '配置（layout）が2つ以上あるので、はじめの1つだけを使った', 'skip');
          else { doc.layoutAt = { start: ln.no, end: closed ? lines[j].no : null }; doc.layoutSrc = inner.map(function (x) { return x.text; }).join('\n'); }
        } else if (info.type) {
          var body = inner.filter(function (x) { return trim(x.text) && !/^[\s\u3000]*(\/\/|%%)/.test(x.text); });
          var diag = { type: info.type, name: info.name, line: ln.no, end: closed ? lines[j].no : null, items: [] };
          // 付箋の行（R8e）は先に抜いて、種類ごとの読み手には渡さない
          var noteLines = body.filter(function (x) { return RE_NOTE.test(x.text); });
          body = body.filter(function (x) { return !RE_NOTE.test(x.text); });
          ({ flow: function () { parseGraph(diag, body, warn, false); },
             lanes: function () { parseGraph(diag, body, warn, true); },
             flowchart: function () { parseGraph(diag, body, warn, false, true); diag.items.forEach(function (it) { if (!it.style.shape) it.style.shape = 'process'; }); },
             timeline: function () { parseTimeline(diag, body, warn); },
             tree: function () { parseTree(diag, body, warn); },
             chart: function () { parseChart(diag, body, warn); },
             pie: function () { parseChart(diag, body, warn); noNeg(diag, warn); },
             donut: function () { parseChart(diag, body, warn); noNeg(diag, warn); },
             hbar: function () { parseChart(diag, body, warn); },
             line: function () { parseSeries(diag, body, warn); },
             stacked: function () { parseSeries(diag, body, warn); },
             kpi: function () { parseKpi(diag, body, warn); },
             compare: function () { parseCompare(diag, body, warn); },
             board: function () { parseBoard(diag, body, warn); } })[info.type]();
          diag.stickies = readStickies(diag, noteLines, warn);
          if (!diag.items.length && !diag.stickies.length) warn(ln.no, '図「' + (diag.name || TYPES[diag.type].label) + '」に読める行がないので出さなかった', 'skip');
          else doc.diagrams.push(diag);
        } else {
          if (info.word && !/^(text|txt|plain|markdown|md)$/i.test(info.word)) warn(ln.no, '図の種類「' + info.word + '」は読めないので、そのまま文として出した（使える種類：' + Object.keys(TYPES).join('・') + '）', 'skip');
          cur.lines.push({ code: inner.map(function (x) { return x.text; }), no: ln.no });
        }
        seenStructure = true;
        i = closed ? j : lines.length;
        continue;
      }
      var hm = /^[ \t\u3000]{0,3}(#{1,6})[ \t\u3000]+(.*?)[ \t\u3000#]*$/.exec(t);
      if (hm) {
        var level = hm[1].length;
        if (level === 1 && !doc.title) { doc.title = trim(hm[2]); doc.titleLine = ln.no; continue; }
        seenStructure = true;
        cur = { heading: trim(hm[2]), level: level, line: ln.no, lines: [] };
        sections.push(cur);
        continue;
      }
      var quote = /^[ \t\u3000]*>/.test(t);
      if (quote || !seenStructure) {
        var km = /^[ \t\u3000]*(?:>[ \t\u3000]*)*(?:[-*・][ \t\u3000]+)?(?:\*\*|__)?([^:：*_]{1,12}?)(?:\*\*|__)?[ \t\u3000]*(?:[:：][ \t\u3000]*([\s\S]*?))?[ \t\u3000]*(?:\*\*|__)?[ \t\u3000]*$/.exec(t);
        var key = km && headKey(km[1]);
        if (key && (km[2] || key === 'secret')) {
          var val = trim((km[2] || '').replace(/\*\*|__/g, '')), cp = km[2] ? t.indexOf(km[2], t.search(/[:：]/) + 1) : -1;
          // 直すときの場所（R8d）：値の始まりと終わり。値がなければ行ごと
          (doc.cardLines = doc.cardLines || {})[key] = (doc.cardLines[key] || []).concat([cp >= 0 ? { line: ln.no, start: cp, end: cp + km[2].length } : { line: ln.no }]);
          if (key === 'secret') doc.secret = val || trim(km[1]);
          else if (val) doc[key] = doc[key] ? doc[key] + '\n' + val : val;
          continue;
        }
      }
      cur.lines.push({ text: t, no: ln.no });
    }
    if (!doc.title) {
      // 題名がなければ、最初の見出しを使う（画面はファイル名で補う）
      var firstH = sections.filter(function (s) { return s.heading; })[0];
      if (firstH && !itemKeyExists(doc, firstH.heading)) doc.title = firstH.heading;
    }
    // 見出しの名前が箱の名前と同じなら、その箱の説明にする。違えば本文
    var keys = {};
    doc.diagrams.forEach(function (d) { d.items.forEach(function (it) { keys[it.key] = true; }); });
    sections.forEach(function (s) {
      var textLines = [], srcs = [];
      s.lines.forEach(function (l) {
        if (l.code) { textLines.push(l); return; }
        var rest = takeSources(l.text, srcs);
        if (trim(rest) || !trim(l.text)) textLines.push({ text: rest.replace(/[\s\u3000]+$/, ''), no: l.no, fixed: rest !== l.text || undefined });   // fixed：出どころを外して出した行（画面で直すと出どころが消えるので直させない）
      });
      while (textLines.length && !textLines[textLines.length - 1].code && !trim(textLines[textLines.length - 1].text)) textLines.pop();
      while (textLines.length && !textLines[0].code && !trim(textLines[0].text)) textLines.shift();
      if (s.heading && keys[nk(stripMarkup(s.heading))]) {
        doc.notes.push({ key: nk(stripMarkup(s.heading)), heading: s.heading, line: s.line, lines: textLines, sources: srcs });
      } else if (s.heading || textLines.length || srcs.length) {
        if (srcs.length) textLines.push({ text: '', no: 0 }, { text: '[元：' + srcs.join('／') + ']', no: s.line, fixed: true });   // 出どころは別の段落に（前の段落を直せるように）
        doc.body.push({ heading: s.heading, level: s.level, line: s.line, lines: textLines });
      }
    });
    // 説明の出どころを箱にも付ける
    doc.notes.forEach(function (n) {
      doc.diagrams.forEach(function (d) { d.items.forEach(function (it) { if (it.key === n.key) n.sources.forEach(function (s) { if (it.sources.indexOf(s) < 0) it.sources.push(s); }); }); });
    });
    partKeys(doc);
    readLayout(doc, warn);
    warnings.sort(function (a, b) { return a.line - b.line; });
    return doc;
  }

  // ---- 配置（~~~layout）：箱の位置・線の曲げ・言葉のずらし。正本は md の文字だけ（R8a） ----
  // 部品の鍵：箱は名前の鍵（同じ鍵の2つ目からは #2…）、線は「元>先」（同じ組の2本目からは #2…）
  function partKeys(doc) {
    doc.diagrams.forEach(function (d) {
      var seen = {}, eseen = {};
      d.items.forEach(function (it) { var n = seen[it.key] = (seen[it.key] || 0) + 1; it.pk = n > 1 ? it.key + '#' + n : it.key; });
      (d.edges || []).forEach(function (e) { var b = d.items[e.from].pk + '>' + d.items[e.to].pk, n = eseen[b] = (eseen[b] || 0) + 1; e.pk = n > 1 ? b + '#' + n : b; });
    });
  }
  var MOVABLE = { flow: 1, lanes: 1, tree: 1, flowchart: 1, timeline: 1, kpi: 1 };
  // 形・色などの値（R8b-2）。決まった値だけを使う
  var oneOf = function (list) { return function (v) { return list.indexOf(v) >= 0; }; };
  var STYLE_OK = {
    shape: oneOf(['rect', 'round', 'ellipse', 'diamond', 'para', 'hexagon', 'chevron', 'cylinder', 'doc']),
    color: oneOf(['blue', 'green', 'yellow', 'red', 'gray', 'purple']),
    stroke: function (v) { return typeof v === 'number' && v >= 1 && v <= 4; },
    scale: function (v) { return typeof v === 'number' && v >= 0.6 && v <= 2; },
    font: oneOf([0.8, 1, 1.25]),
    route: oneOf(['straight', 'elbow', 'curve']),
    head: oneOf(['end', 'none', 'both']),
    dash: function (v) { return v === true; }
  };
  function isPair(v) { return Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1]) && typeof v[0] === 'number' && typeof v[1] === 'number'; }
  function cleanPart(p) {
    var o = {}, bad = false;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { o: o, bad: true };
    Object.keys(p).forEach(function (k) {
      if (k === 'x' || k === 'y') { if (typeof p[k] === 'number' && isFinite(p[k])) o[k] = p[k]; else bad = true; }
      else if (k === 'bend' || k === 'label') { if (isPair(p[k])) o[k] = p[k].slice(); else bad = true; }
      else if (STYLE_OK[k]) { if (STYLE_OK[k](p[k])) o[k] = p[k]; else bad = true; }
      else bad = true;   // shortcut: 知らない鍵は描くのに使わない（R8b で形・色を足す）。md の中には残る
    });
    if ((o.x == null) !== (o.y == null)) { delete o.x; delete o.y; bad = true; }
    return { o: o, bad: bad };
  }
  function readLayout(doc, warn) {
    if (!doc.layoutAt) return;
    var no = doc.layoutAt.start, obj;
    try { obj = JSON.parse(doc.layoutSrc || '{}'); } catch (e) { warn(no, '配置（layout）が JSON として読めないので、自動の並べ方で出した（直すまで、画面からの書きかえは止める）', 'fix'); doc.layoutBroken = true; (doc.unsafe = doc.unsafe || []).push(no + ' 行目の配置（layout）が読めない'); return; }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.diagrams)) { warn(no, '配置（layout）の形がちがうので、自動の並べ方で出した（{"v":1,"diagrams":[…]} の形。直すまで、画面からの書きかえは止める）', 'fix'); doc.layoutBroken = true; (doc.unsafe = doc.unsafe || []).push(no + ' 行目の配置（layout）の形がちがう'); return; }
    doc.layout = obj;
    var used = [], bad = false;
    doc.diagrams.forEach(function (d) {
      if (!MOVABLE[d.type]) return;
      for (var k = 0; k < obj.diagrams.length; k++) {
        var L = obj.diagrams[k];
        if (used[k] || !L || L.type !== d.type || (L.name || '') !== (d.name || '')) continue;
        used[k] = true; d.layoutIndex = k;
        var parts = {};
        if (L.parts && typeof L.parts === 'object') Object.keys(L.parts).forEach(function (pk) { var c = cleanPart(L.parts[pk]); parts[pk] = c.o; if (c.bad) bad = true; });
        else if (L.parts != null) bad = true;
        d.layout = parts;
        break;
      }
    });
    if (bad) warn(no, '配置（layout）に読めない値があったので、その所は使わなかった', 'fix');
  }
  // 外側の ```markdown の開きの行の番号（なければ 0）。先頭に行を足すときは、そのあとに入れる
  function unwrapStart(all) {
    var inner = unwrap(all, function () {});
    return inner === all || !inner.length ? 0 : inner[0].no - 1;
  }
  function unwrapEnd(all) {
    var noop = function () {}, inner = unwrap(all, noop);
    if (inner === all) return null;
    var last = inner.length ? inner[inner.length - 1].no : 0;
    return last < all.length ? last + 1 : null;   // 外側の ```markdown の閉じの行（なければ null）
  }
  // ---- md の行を書きかえる（R8b-3）。どれも純粋な関数で、新しい md の文字を返す。ほかの行は1文字も変えない ----
  function splitText(text) {
    text = String(text);
    var bom = text.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '', body = bom ? text.slice(1) : text;
    return { bom: bom, eol: /\r\n/.test(body) ? '\r\n' : /\r/.test(body) ? '\r' : '\n', lines: body.split(/\r\n|\r|\n/) };
  }
  function joinText(t) { return t.bom + t.lines.join(t.eol); }
  // 名前は1行に。図の書き方とまちがわれる記号は使えない（全角も同じに読むので、全角に直しても逃げられない）
  function safeName(name) { return trim(String(name || '').replace(/[\r\n]+/g, ' ')); }
  function badInName(name) {
    var n = String(name).normalize('NFKC'), bad = [];
    if (RE_ARROW.test(n)) bad.push('矢印（->）');
    (n.match(/[:!?+\[\]|@#]/g) || []).forEach(function (c) { if (bad.indexOf(c) < 0) bad.push(c); });
    return bad;
  }
  // 1行の中の [start, end) を、右から順に置きかえる
  function replaceSpans(t, spans) {
    var byLine = {};
    spans.forEach(function (sp) { (byLine[sp.line] = byLine[sp.line] || []).push(sp); });
    Object.keys(byLine).forEach(function (no) {
      var L = t.lines[no - 1];
      if (L == null) throw new Error(no + ' 行目が見つからない');
      byLine[no].sort(function (a, b) { return b.start - a.start; }).forEach(function (sp) { L = L.slice(0, sp.start) + sp.text + L.slice(sp.end); });
      t.lines[no - 1] = L;
    });
  }
  // layout の鍵も新しい名前に（動かした位置・形を失わない）
  function renameLayoutKeys(obj, d, oldPk, newPk) {
    if (!obj || d.layoutIndex == null || !obj.diagrams[d.layoutIndex]) return obj;
    var parts = obj.diagrams[d.layoutIndex].parts || {}, out = {};
    Object.keys(parts).forEach(function (k) {
      var nk2 = k.split('>').map(function (x) { var m = /^(.*?)(#\d+)?$/.exec(x); return nk(m[1]) === oldPk ? newPk + (m[2] || '') : x; }).join('>');
      out[nk2] = parts[k];
    });
    obj.diagrams[d.layoutIndex].parts = out;
    return obj;
  }
  function renameItem(text, doc, di, id, name) {
    var d = doc.diagrams[di], it = d && d.items[id], nn = safeName(name);
    if (!it) throw new Error('箱が見つからない');
    if (!nn) throw new Error('名前が空');
    var bad = badInName(nn);
    if (bad.length) throw new Error('名前に ' + bad.join(' ') + ' は使えません（図の書き方とまちがわれるため）');
    if (!it.spans || !it.spans.length || it.spans.some(function (sp) { return sp.bad; })) throw new Error('この箱の名前の場所が md の中で分からない');
    var t = splitText(text);
    replaceSpans(t, it.spans.map(function (sp) { return { line: sp.line, start: sp.start, end: sp.end, text: nn }; }));
    // 説明の見出し「## 名前」も直す
    doc.notes.forEach(function (n) {
      if (n.key !== it.key) return;
      var L = t.lines[n.line - 1], m = /^([ \t\u3000]{0,3}#{1,6}[ \t\u3000]+)(.*?)([ \t\u3000#]*)$/.exec(L || '');
      if (m) t.lines[n.line - 1] = m[1] + nn + m[3];
    });
    var out = joinText(t);
    if (doc.layout && d.layoutIndex != null) out = writeLayout(out, doc, renameLayoutKeys(JSON.parse(JSON.stringify(doc.layout)), d, it.pk.replace(/#\d+$/, ''), nk(nn)));
    return out;
  }

  // 行を切る：plan = { 行番号: { drop: [消す箱の番号], brk: [この番号の箱の後ろの矢印を消す] } }
  // 残りは「続いている所ごと」の行に分ける（つながりを勝手に作らない）
  function cutLines(text, d, plan) {
    var t = splitText(text);
    Object.keys(plan).map(Number).sort(function (a, b) { return b - a; }).forEach(function (no) {
      var L = t.lines[no - 1], reA = new RegExp(RE_ARROW.source, 'g'), am, cuts = [];
      while ((am = reA.exec(L))) { if (!am[0].length) { reA.lastIndex++; continue; } cuts.push([am.index, am.index + am[0].length]); }
      var segs = [], n = cuts.length + 1, drop = plan[no].drop || [], brk = plan[no].brk || [];
      for (var k = 0; k < n; k++) segs.push(L.slice(k ? cuts[k - 1][1] : 0, k < cuts.length ? cuts[k][0] : L.length));
      var indent = /^[ \t\u3000]*/.exec(L)[0], runs = [], cur = [], lane = null, lanes = [], out = [];
      for (var q = 0; q < n; q++) {
        var lm = RE_LANE.exec(trim(segs[q])); if (lm) lane = lm[1]; lanes.push(lane);
        if (drop.indexOf(q) >= 0) { if (cur.length) runs.push(cur); cur = []; continue; }
        cur.push(q);
        if (brk.indexOf(q) >= 0) { runs.push(cur); cur = []; }
      }
      if (cur.length) runs.push(cur);
      runs.forEach(function (run) {
        var parts = run.map(function (q) { return segs[q]; });
        // 線の言葉は行の最後の矢印のもの。その矢印が消える（最後の1つだけ残る）ときは外す
        if (run[run.length - 1] === n - 1 && run.length === 1 && n > 1) parts[0] = splitColon(parts[0], 2)[0];
        var first = trim(parts[0]);
        if (d.type === 'lanes' && !RE_LANE.test(first) && lanes[run[0]]) first = '[' + lanes[run[0]] + '] ' + first;
        var line = indent + first;
        for (var r2 = 1; r2 < run.length; r2++) line += L.slice(cuts[run[r2] - 1][0], cuts[run[r2] - 1][1]) + parts[r2];
        out.push(line.replace(/[ \t\u3000]+$/, ''));
      });
      t.lines.splice.apply(t.lines, [no - 1, 1].concat(out));
    });
    return joinText(t);
  }
  // 印のつけ外し：その色の印があれば、箱が出てくる所すべてから外す。なければ最初の名前のすぐ後ろに「 !注意」などを足す
  function toggleMark(text, doc, di, id, kind, label) {
    var d = doc.diagrams[di], it = d && d.items[id], sym = { red: '!', yellow: '?', green: '+' }[kind];
    if (!it || !sym) throw new Error('箱か印の種類が見つからない');
    if (!it.spans || !it.spans.length || it.spans.some(function (sp) { return sp.bad; })) throw new Error('この箱の場所が md の中で分からない');
    var t = splitText(text), has = it.marks.some(function (m) { return m.kind === kind; });
    if (!has) {
      var mt = trim(label || '') || MARK_DEFAULT[kind], bad = badInName(mt).concat(/[\s\u3000]/.test(mt) ? ['空白'] : []);
      if (bad.length) throw new Error('印の言葉に ' + bad.join(' ') + ' は使えません');
      var sp0 = it.spans[0];
      replaceSpans(t, [{ line: sp0.line, start: sp0.end, end: sp0.end, text: ' ' + sym + mt }]);
      return joinText(t);
    }
    it.spans.slice().sort(function (a, b) { return b.line - a.line || b.start - a.start; }).forEach(function (sp) {
      var L = t.lines[sp.line - 1], reA = new RegExp(RE_ARROW.source, 'g'), am, end = L.length;
      reA.lastIndex = sp.end;
      while ((am = reA.exec(L))) { if (am[0].length) { end = am.index; break; } reA.lastIndex++; }
      var seg = L.slice(sp.end, end).replace(new RegExp(RE_MARK.source, 'g'), function (all, pre, s2, txt) {
        if (MARK_KIND[s2] !== kind || !txt || (kind === 'green' && /^[0-9０-９]/.test(txt))) return all;
        return '';
      });
      t.lines[sp.line - 1] = L.slice(0, sp.end) + seg + L.slice(end);
    });
    return joinText(t);
  }
  var EDITABLE = { flow: 1, lanes: 1, flowchart: 1, tree: 1 };   // 箱を足す・線を引く・消すができる図（行の場所を覚えている図）
  // 図の閉じの行のすぐ前に1行足す
  function appendLine(text, d, line) {
    var t = splitText(text);
    if (d.end) t.lines.splice(d.end - 1, 0, line); else t.lines.push(line);
    return joinText(t);
  }
  // 箱を足す：「新しい箱」（あれば 2, 3…）。lanes は最初の担当に入れる。{ text, name } を返す
  function addBox(text, doc, di) {
    var d = doc.diagrams[di];
    if (!d || !EDITABLE[d.type]) throw new Error('この図には箱を足せない');
    var used = {}, name = '新しい箱', n = 1;
    d.items.forEach(function (it) { used[it.key] = 1; });
    while (used[nk(name)]) name = '新しい箱' + (++n);
    return { text: appendLine(text, d, (d.type === 'tree' ? '- ' : d.type === 'lanes' && d.lanes && d.lanes[0] ? '[' + d.lanes[0] + '] ' : '') + name), name: name };
  }
  // 線を引く：「A -> B」の行を足す（lanes は両方の担当も書く）
  function addEdge(text, doc, di, from, to) {
    var d = doc.diagrams[di], a = d && d.items[from], b = d && d.items[to];
    if (!a || !b || !EDITABLE[d.type] || d.type === 'tree') throw new Error('この図には線を引けない');
    if (from === to) throw new Error('同じ箱には線を引けない');
    var ln = function (it) { return (d.type === 'lanes' && it.lane ? '[' + it.lane + '] ' : '') + it.label; };
    return appendLine(text, d, ln(a) + ' -> ' + ln(b));
  }
  // 担当を変える（帯をまたぐ）：箱が最初に出てくる所に [新しい担当] を書く。ほかの箱の担当は変えないよう、
  // すぐ後ろの所と（前に担当がなければ）行の先頭にも、いまの担当を書き足す
  function setLane(text, doc, di, id, lane) {
    var d = doc.diagrams[di], it = d && d.items[id];
    if (!it || d.type !== 'lanes') throw new Error('担当のある図ではない');
    if ((d.lanes || []).indexOf(lane) < 0) throw new Error('その担当はない');
    var sp = it.spans && it.spans[0];
    if (!sp || sp.bad || sp.lane == null) throw new Error('この箱の場所が md の中で分からない');
    if (it.lane === lane) return String(text);
    var at = {}, tags = {};
    d.items.forEach(function (x) {
      (x.spans || []).forEach(function (y) { if (y.line === sp.line && !y.bad) at[y.seg] = y; });
      (x.laneSpans || []).forEach(function (y) { if (y.line === sp.line) tags[y.seg] = y; });
    });
    var q = sp.seg, edits = [];
    if (tags[q]) edits.push({ line: sp.line, start: tags[q].start, end: tags[q].end, text: lane });
    else edits.push({ line: sp.line, start: sp.start, end: sp.start, text: '[' + lane + '] ' });
    if (at[q + 1] && !tags[q + 1]) edits.push({ line: sp.line, start: at[q + 1].start, end: at[q + 1].start, text: '[' + at[q + 1].lane + '] ' });
    var before = false;
    for (var k = 0; k < q; k++) if (tags[k]) before = true;
    if (q > 0 && !before && at[0]) edits.push({ line: sp.line, start: at[0].start, end: at[0].start, text: '[' + at[0].lane + '] ' });
    var t = splitText(text);
    replaceSpans(t, edits);
    return joinText(t);
  }
  // layout から、あう部品（pk）を消して書き直す。何も消えなければ text のまま
  function dropLayoutParts(text, doc, d, hit) {
    if (d.layoutIndex == null || !doc.layout || !doc.layout.diagrams[d.layoutIndex]) return text;
    var obj = JSON.parse(JSON.stringify(doc.layout)), L = obj.diagrams[d.layoutIndex], parts = L.parts || {}, gone = false;
    Object.keys(parts).forEach(function (k) { if (hit(k)) { delete parts[k]; gone = true; } });
    if (!gone) return text;
    if (!Object.keys(parts).length) obj.diagrams.splice(d.layoutIndex, 1);
    return writeLayout(text, parseDoc(text), obj);
  }
  function subtree(d, id) {
    var out = [id];
    for (var k = 0; k < out.length; k++) d.items.forEach(function (x) { if (x.parent === out[k] && out.indexOf(x.id) < 0) out.push(x.id); });
    return out;
  }
  // ---- カードと題名（R8d）：値の所だけを書きかえる。空にすると行を消す。ないものは「> 結論：…」の行を足す ----
  var CARD_LABEL = { summary: 'ひとことで', conclusion: '結論', todo: 'すること', secret: '社外秘' };
  function oneLine(v) { return trim(String(v == null ? '' : v).replace(/[\r\n]+/g, ' ')); }
  // 本文の段落（a〜b 行目）を書きかえる。空にすると行ごと消し、前後の空行が2つ続かないようにする
  function setLines(text, a, b, value) {
    var t = splitText(text), L = t.lines;
    if (!(a >= 1 && b >= a && b <= L.length)) throw new Error('その行がない');
    var v = String(value).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!trim(v)) { var n = b - a + 1; if (a > 1 && L[a - 2] === '' && L[b] === '') n++; L.splice(a - 1, n); }
    else L.splice.apply(L, [a - 1, b - a + 1].concat(v.split('\n')));
    return joinText(t);
  }
  function setCard(text, doc, key, value) {
    if (!CARD_LABEL[key]) throw new Error('カードの種類が分からない');
    var v = oneLine(value), at = (doc.cardLines || {})[key] || [], t = splitText(text);
    if (at.length) {
      var first = at[0], rest = at.slice(1).map(function (x) { return x.line; });
      if (!v || first.start == null) rest.unshift(first.line);
      else replaceSpans(t, [{ line: first.line, start: first.start, end: first.end, text: v }]);
      if (first.start == null && v) t.lines.splice(first.line - 1, 0, '> ' + CARD_LABEL[key] + '：' + v);
      rest.sort(function (a, b) { return b - a; }).forEach(function (no) { t.lines.splice(no - 1 + (first.start == null && v ? 1 : 0), 1); });
      return joinText(t);
    }
    if (!v) return String(text);
    // 足す所：ほかのカードの最後の行のあと、なければ題名のあと、なければ先頭
    var after = 0;
    Object.keys(doc.cardLines || {}).forEach(function (k) { doc.cardLines[k].forEach(function (x) { after = Math.max(after, x.line); }); });
    if (!after && doc.titleLine) after = doc.titleLine;
    if (!after) after = doc.wrapStart || 0;
    t.lines.splice(after, 0, '> ' + CARD_LABEL[key] + '：' + v);
    return joinText(t);
  }
  function setTitle(text, doc, value) {
    var v = oneLine(value), t = splitText(text);
    if (!v) throw new Error('題名が空');
    if (doc.titleLine) {
      var L = t.lines[doc.titleLine - 1], m = /^([ \t\u3000]{0,3}#[ \t\u3000]+)(.*?)([ \t\u3000#]*)$/.exec(L);
      t.lines[doc.titleLine - 1] = m ? m[1] + v + m[3] : '# ' + v;
    } else t.lines.splice(doc.wrapStart || 0, 0, '# ' + v, '');
    return joinText(t);
  }
  // 箱を消す（その箱が出てくる行すべて）。shortcut: layout の古い置き場所は残る（害はない）。同じ名前で足し直すと前の場所に出る
  function removeItem(text, doc, di, id) {
    var d = doc.diagrams[di], it = d && d.items[id];
    if (!it || !it.spans || !it.spans.length || it.spans.some(function (sp) { return sp.bad; })) throw new Error('この箱の場所が md の中で分からない');
    var plan = {}, ids = d.type === 'tree' ? subtree(d, id) : [id];   // 木は、下の箱も一緒に消す（残すと、ちがう親の下に入るため）
    ids.forEach(function (k) { (d.items[k].spans || []).forEach(function (sp) { if (!sp.bad) (plan[sp.line] = plan[sp.line] || { drop: [] }).drop.push(sp.seg); }); });
    var keys = ids.map(function (k) { return d.items[k].key; });
    // その箱の置き場所・形と、その箱につながる線の置き場所も消す（残すと、同じ名前を足したとき前の場所に出る）
    return dropLayoutParts(cutLines(text, d, plan), doc, d, function (pk) { return pk.split('>').some(function (x) { return keys.indexOf(nk(x.replace(/#\d+$/, ''))) >= 0; }); });
  }
  // 線を消す（その線が書かれた所すべて）
  function removeEdge(text, doc, di, eid) {
    var d = doc.diagrams[di], e = d && d.edges.filter(function (x) { return x.id === eid; })[0];
    if (!e || !e.occ || !e.occ.length) throw new Error('この線の場所が md の中で分からない');
    var plan = {};
    e.occ.forEach(function (o) { (plan[o.line] = plan[o.line] || { brk: [] }).brk.push(o.seg); });
    return dropLayoutParts(cutLines(text, d, plan), doc, d, function (pk) { return pk.split('>').map(function (x) { return nk(x); }).join('>') === e.pk; });
  }
  // layout の区画だけを書きかえた md を返す（ほかの行は1文字も変えない）。obj が null か図が空なら区画を消す
  // ---- 図ごとの操作（R8d-2）：コードブロックの全体（開きから閉じまで）を、まとめて動かす・複製する・消す ----
  // layout は「種類＋名前」が同じ図の中では順番でつながるので、新しい図の順に並べ直す。seq は新しい順の（元の）図
  function relayout(text, doc, seq, edit) {
    if (!doc.layout) return text;
    var src = doc.layout.diagrams, used = {}, out = [];
    doc.diagrams.forEach(function (d) { if (d.layoutIndex != null) used[d.layoutIndex] = 1; });
    seq.forEach(function (d) { if (d.layoutIndex != null && src[d.layoutIndex]) { var L = JSON.parse(JSON.stringify(src[d.layoutIndex])); if (edit) L = edit(L, d); if (L) out.push(L); } });
    src.forEach(function (L, k) { if (!used[k]) out.push(L); });   // どの図にもつながらない分は、そのまま後ろに残す
    var obj = JSON.parse(JSON.stringify(doc.layout)); obj.diagrams = out;
    return writeLayout(text, parseDoc(text), obj);
  }
  function blockOf(doc, di) {
    var d = doc.diagrams[di];
    if (!d) throw new Error('その図がない');
    if (!d.end) throw new Error('図の終わり（~~~）がないので、まとめて動かせない');
    return d;
  }
  function moveDiagram(text, doc, di, dir) {
    var dj = di + (dir < 0 ? -1 : 1), a = blockOf(doc, Math.min(di, dj)), b = doc.diagrams[Math.max(di, dj)];
    if (dj < 0 || !b) throw new Error(dir < 0 ? 'いちばん上の図です' : 'いちばん下の図です');
    blockOf(doc, Math.max(di, dj));
    var t = splitText(text), L = t.lines;
    var A = L.slice(a.line - 1, a.end), mid = L.slice(a.end, b.line - 1), B = L.slice(b.line - 1, b.end);
    t.lines = L.slice(0, a.line - 1).concat(B, mid, A, L.slice(b.end));
    var seq = doc.diagrams.slice(), lo = Math.min(di, dj); seq.splice(lo, 2, seq[lo + 1], seq[lo]);
    return relayout(joinText(t), doc, seq);
  }
  function duplicateDiagram(text, doc, di) {
    var d = blockOf(doc, di), t = splitText(text);
    t.lines.splice.apply(t.lines, [d.end, 0, ''].concat(t.lines.slice(d.line - 1, d.end)));
    var seq = doc.diagrams.slice(); seq.splice(di + 1, 0, d);
    return relayout(joinText(t), doc, seq);
  }
  // 図の名前・種類を変える：開きの行（~~~flow 名前）だけを書きかえる。layout も新しい名前・種類へ移す
  function setDiagramHead(text, doc, di, type, name) {
    var d = blockOf(doc, di), t = splitText(text), L = t.lines[d.line - 1], fm = RE_FENCE.exec(L);
    if (!fm) throw new Error('図の開きの行が読めない');
    if (type && !TYPES[type]) throw new Error('知らない種類');
    var nn = name == null ? d.name : trim(name);
    if (nn && !safeName(nn)) throw new Error('名前に使えない字がある（' + badInName(nn) + '）');
    var word = type ? (type === d.type ? fenceInfo(fm[2]).word : type) : fenceInfo(fm[2]).word, nt = type || d.type;
    t.lines[d.line - 1] = /^[ \t\u3000]{0,3}(`{3,}|~{3,})/.exec(L)[0] + word + (nn ? ' ' + nn : '');
    return relayout(joinText(t), doc, doc.diagrams, function (E, x) {
      if (x !== d) return E;
      if (!MOVABLE[nt]) return null;
      E.type = nt; E.name = nn || ''; return E;
    });
  }
  // 変えられる種類：同じ仲間の中で、変えても箱の数が同じで、知らせが増えないものだけ
  var KIN = [['chart', 'hbar', 'pie', 'donut'], ['line', 'stacked'], ['flow', 'flowchart']];
  function typeChoices(text, doc, di) {
    var d = doc.diagrams[di], g = d && KIN.filter(function (k) { return k.indexOf(d.type) >= 0; })[0];
    if (!g || !d.end) return [];
    return g.filter(function (ty) {
      if (ty === d.type) return false;
      try { var nd = parseDoc(setDiagramHead(text, doc, di, ty)); var x = nd.diagrams[di]; return x && x.type === ty && x.items.length === d.items.length && nd.warnings.length <= doc.warnings.length; } catch (e) { return false; }
    });
  }
  // 図を足す（ひな形つき）：本文の終わり（layout・外側の包みの前）に足す
  var TEMPLATE = {
    flow: ['受付 -> 確認 -> 完了'], flowchart: ['(開始) -> <よいか?>', '<よいか?> -> 進める : はい', '<よいか?> -> 直す : いいえ', '進める -> (終わり)'],
    lanes: ['[担当A] 申請 -> [担当B] 確認 -> 完了'], timeline: ['2026-12-01 始める', '2026-12-15 見直す', '2027-01-05 終える'],
    tree: ['- 大きな分け方', '  - 小さな分け方1', '  - 小さな分け方2'], chart: ['4月 : 100', '5月 : 120', '6月 : 90'],
    hbar: ['A : 30', 'B : 50', 'C : 20'], pie: ['A : 50', 'B : 30', 'C : 20'], donut: ['A : 50', 'B : 30', 'C : 20'],
    line: ['系列 : 受付, 完了', '4月 : 10, 8', '5月 : 12, 11', '6月 : 15, 13'], stacked: ['系列 : 紙, Web', '1〜3月 : 8, 2', '4〜6月 : 6, 5'],
    kpi: ['売上 : 1,000万円 : 前年比 +5%', '件数 : 42件 : 先月より +3'],
    board: ['[前] いまのやり方', '  受付 : 電話とメール', '[後] 新しいやり方', '  受付 : Web', '  #1 台帳を分ける', '[前] -> [後] : 変える'], compare: ['| 項目 | 案A | 案B |', '|---|---|---|', '| 値段 | ○ | △ |', '| 早さ | △ | ○ |']
  };
  function addDiagram(text, doc, type) {
    if (!TEMPLATE[type]) throw new Error('知らない種類');
    return insertBlock(text, doc, ['~~~' + type + ' 新しい' + TYPES[type].label].concat(TEMPLATE[type], ['~~~']));
  }
  // 箱の説明を足す：「## 名前」と説明の行を、本文の終わりに
  function addNote(text, doc, label, body) {
    var nn = safeName(label);
    if (!nn) throw new Error('名前に使えない字がある');
    var v = String(body || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!trim(v)) throw new Error('説明が空');
    return insertBlock(text, doc, ['## ' + nn, ''].concat(v.split('\n')));
  }
  function insertBlock(text, doc, block) {
    var t = splitText(text), L = t.lines, at = doc.layoutAt ? doc.layoutAt.start - 1 : doc.wrapEnd ? doc.wrapEnd - 1 : L.length;
    while (at > 0 && L[at - 1] === '') at--;   // 区切り（layout・包みの閉じ・ファイルの終わり）の前の空行は、図の後ろに残す
    L.splice.apply(L, [at, 0].concat(at > 0 ? [''] : [], block));
    if (at + block.length + (at > 0 ? 1 : 0) >= L.length) L.push('');   // 終わりは改行で
    return joinText(t);
  }
  // ---- 付箋を書く（R8e）。書いたら読み直して、同じ付箋になるかを確かめる（ならなければ書かない） ----
  function noteLine(d, n) {
    var body = String(n.text).replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '').replace(/\n/g, '\\n');
    if (!body) throw new Error('付箋の文が空');
    if (!NOTE_WORD[n.color]) throw new Error('知らない色');
    return 'note ' + (n.to != null ? d.items[n.to].label + ' : ' : '') + body + ' @' + NOTE_WORD[n.color];
  }
  function checkNote(text, di, line, want) {
    var nd = parseDoc(text).diagrams[di], got = nd && (nd.stickies || []).filter(function (x) { return x.line === line; })[0];
    if (!got || got.text !== want.text.replace(/^\s+|\s+$/g, '') || got.color !== want.color || (got.to == null) !== (want.to == null)) throw new Error('付箋の行が読み直せない形になる（文の「:」や「@」を見直してください）');
    return text;
  }
  function addSticky(text, doc, di, n) {
    var d = blockOf(doc, di), t = splitText(text);
    t.lines.splice(d.end - 1, 0, noteLine(d, n));
    return checkNote(joinText(t), di, d.end, n);
  }
  function setSticky(text, doc, di, k, patch) {
    var d = doc.diagrams[di], n = d && d.stickies && d.stickies[k];
    if (!n) throw new Error('その付箋がない');
    var nn = { text: patch.text != null ? patch.text : n.text, color: patch.color || n.color, to: n.to }, t = splitText(text);
    var ind = /^[ \t\u3000]*/.exec(t.lines[n.line - 1])[0];
    t.lines[n.line - 1] = ind + noteLine(d, nn);
    var out = checkNote(joinText(t), di, n.line, nn), nd = parseDoc(out), m = nd.diagrams[di].stickies.filter(function (x) { return x.line === n.line; })[0];
    if (m.pk === n.pk || !doc.layout || d.layoutIndex == null) return out;
    var obj = JSON.parse(JSON.stringify(doc.layout)), P = obj.diagrams[d.layoutIndex].parts || {};   // 文を直したら、置き場所の鍵も新しい文へ
    if (P[n.pk]) { P[m.pk] = P[n.pk]; delete P[n.pk]; }
    return writeLayout(out, nd, obj);
  }
  function removeSticky(text, doc, di, k) {
    var d = doc.diagrams[di], n = d && d.stickies && d.stickies[k];
    if (!n) throw new Error('その付箋がない');
    var t = splitText(text); t.lines.splice(n.line - 1, 1);
    return dropLayoutParts(joinText(t), doc, d, function (pk) { return pk === n.pk; });
  }
  function removeDiagram(text, doc, di) {
    var d = blockOf(doc, di), t = splitText(text), s0 = d.line - 1, n = d.end - s0;
    if (s0 > 0 && t.lines[s0 - 1] === '' && t.lines[d.end] === '') n++;   // 前後の空行が2つ続かないように、後ろの1つも消す
    t.lines.splice(s0, n);
    var seq = doc.diagrams.slice(); seq.splice(di, 1);
    return relayout(joinText(t), doc, seq);
  }
  function writeLayout(text, doc, obj) {
    text = String(text);
    var bom = text.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '', body = bom ? text.slice(1) : text;
    var eol = /\r\n/.test(body) ? '\r\n' : /\r/.test(body) ? '\r' : '\n';
    var lines = body.split(/\r\n|\r|\n/);
    var empty = !obj || !obj.diagrams || !obj.diagrams.length;
    var block = empty ? [] : ['~~~layout', '{"v":1,"diagrams":['].concat(obj.diagrams.map(function (L, k) { return JSON.stringify(L) + (k < obj.diagrams.length - 1 ? ',' : ''); }), [']}', '~~~']);
    var at = doc.layoutAt;
    if (at) {
      var s0 = at.start - 1, e0 = at.end ? at.end - 1 : lines.length - 1;
      // 消すときは、前に足した空行も一緒に消す（足して消すと、元の md に1文字も違わず戻る）
      if (empty && s0 > 0 && lines[s0 - 1] === '') s0--;
      lines.splice.apply(lines, [s0, e0 - s0 + 1].concat(block));
    } else if (!empty) {
      var ins = doc.wrapEnd ? doc.wrapEnd - 1 : lines.length;
      var trail = !doc.wrapEnd && lines.length && lines[lines.length - 1] === '';   // 最後が改行で終わる md
      if (trail) ins--;
      lines.splice.apply(lines, [ins, 0].concat([''], block));
    }
    return bom + lines.join(eol);
  }
  function stripMarkup(s) { return String(s).replace(/\*\*|__|`/g, ''); }
  function itemKeyExists(doc, label) {
    var k = nk(stripMarkup(label));
    return doc.diagrams.some(function (d) { return d.items.some(function (it) { return it.key === k; }); });
  }

  // ---- 文字コード：BOM → UTF-8 → Shift_JIS / EUC-JP ----
  function decodeBytes(u8) {
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(u8.subarray(3)), encoding: 'UTF-8（BOM つき）', key: 'utf8bom', warn: '' };
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), encoding: 'UTF-16', key: 'utf16le', warn: '' };
    if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(u8.subarray(2)), encoding: 'UTF-16', key: 'utf16be', warn: '' };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'UTF-8', key: 'utf8', warn: '' }; } catch (e) { /* 次を試す */ }
    var cands = [['shift_jis', 'Shift_JIS'], ['euc-jp', 'EUC-JP']].map(function (c) {
      try {
        var t = new TextDecoder(c[0], { fatal: true }).decode(u8);
        var nonAscii = t.replace(/[\x00-\x7F]/g, '').length || 1;
        var hw = (t.match(/[\uFF61-\uFF9F]/g) || []).length;  // 半角カナだらけ＝たぶん読みまちがい
        return { text: t, encoding: c[1], key: c[0] === 'shift_jis' ? 'sjis' : 'eucjp', score: hw / nonAscii };
      } catch (e) { return null; }
    }).filter(Boolean).sort(function (a, b) { return a.score - b.score; });
    if (cands.length && cands[0].score < 0.3) return { text: cands[0].text, encoding: cands[0].encoding, key: cands[0].key, warn: '' };
    var lossy = cands.length ? cands[0] : { text: new TextDecoder('shift_jis').decode(u8), encoding: '不明' };
    return { text: lossy.text, encoding: '不明', key: 'unknown', warn: '文字コードが分からないので、読めた範囲で出した（UTF-8 で保存し直すと確実）' };
  }

  // ---- 保存（R8c）：md の文字をバイトに。表せない字があれば { bad } を返し、書かない ----
  var sjisMap = null;
  function sjisTable() {
    if (sjisMap) return sjisMap;
    var dec = new TextDecoder('shift_jis'), m = new Map();
    for (var lead = 0x81; lead <= 0xFC; lead++) {
      if (lead > 0x9F && lead < 0xE0) continue;
      for (var tr = 0x40; tr <= 0xFC; tr++) {
        if (tr === 0x7F) continue;
        var ptr = (lead - (lead < 0xA0 ? 0x81 : 0xC1)) * 188 + tr - (tr < 0x7F ? 0x40 : 0x41);
        if (ptr >= 8272 && ptr <= 8835) continue;   // NEC 選定 IBM 拡張（ED40〜EEFC）は使わない（WHATWG と Windows の決まり）
        var ch = dec.decode(new Uint8Array([lead, tr]));
        if (ch.length && ch !== '\uFFFD' && !m.has(ch)) m.set(ch, [lead, tr]);
      }
    }
    sjisMap = m;
    return m;
  }
  // Mac などで打たれる字を、Windows（Shift_JIS）の同じ形の字へ寄せる：− 〜 ‖ — ¢ £ ¬
  var SJIS_ALIAS = { 0x2212: '\uFF0D', 0x301C: '\uFF5E', 0x2016: '\u2225', 0x2014: '\u2015', 0x00A2: '\uFFE0', 0x00A3: '\uFFE1', 0x00AC: '\uFFE2' };
  function encodeSjis(line, no, bad, out) {
    var T = sjisTable();
    for (var ch of line) {
      var c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c >= 0xFF61 && c <= 0xFF9F) out.push(c - 0xFF61 + 0xA1);
      else if (c === 0xA5) out.push(0x5C);
      else if (c === 0x203E) out.push(0x7E);
      else { var b = T.get(SJIS_ALIAS[c] || ch); if (b) out.push(b[0], b[1]); else bad.push({ ch: ch, line: no }); }
    }
  }
  // key：decodeBytes が返したもの。orig：読んだときのバイト（Shift_JIS は、同じ文字の行なら元のバイトを使う）
  function encodeText(text, key, orig) {
    text = String(text);
    if (key === 'utf8' || key === 'utf8bom') {
      var u = new TextEncoder().encode(text);
      if (key === 'utf8') return { bytes: u };
      var w = new Uint8Array(u.length + 3); w.set([0xEF, 0xBB, 0xBF]); w.set(u, 3); return { bytes: w };
    }
    if (key === 'utf16le' || key === 'utf16be') {
      var le = key === 'utf16le', o16 = new Uint8Array(2 + text.length * 2);
      o16[0] = le ? 0xFF : 0xFE; o16[1] = le ? 0xFE : 0xFF;
      for (var k = 0; k < text.length; k++) { var cu = text.charCodeAt(k); o16[2 + k * 2] = le ? cu & 255 : cu >> 8; o16[3 + k * 2] = le ? cu >> 8 : cu & 255; }
      return { bytes: o16 };
    }
    if (key !== 'sjis') throw new Error('この文字コード（' + key + '）では書けない');
    var reuse = new Map();
    if (orig && orig.length) {
      var dec = new TextDecoder('shift_jis'), st = 0;
      for (var i = 0; i <= orig.length; i++) if (i === orig.length || orig[i] === 0x0A) {
        var lb = orig.subarray(st, i), lt = dec.decode(lb);
        if (!reuse.has(lt) && lt.indexOf('\uFFFD') < 0) reuse.set(lt, lb);
        st = i + 1;
      }
    }
    var out = [], bad = [];
    text.split('\n').forEach(function (line, n) {
      if (n) out.push(0x0A);
      var r = reuse.get(line);
      if (r) for (var j = 0; j < r.length; j++) out.push(r[j]); else encodeSjis(line, n + 1, bad, out);
    });
    return bad.length ? { bad: bad } : { bytes: new Uint8Array(out) };
  }

  function check(text) {
    var d = parseDoc(text);
    return {
      title: d.title, secret: d.secret, summary: d.summary, conclusion: d.conclusion, todo: d.todo,
      diagrams: d.diagrams.map(function (g) { return { type: g.type, typeLabel: TYPES[g.type].label, name: g.name, items: g.items.length, edges: g.edges ? g.edges.length : 0 }; }),
      notes: d.notes.length,
      warnings: d.warnings
    };
  }

  var api = { addSticky: addSticky, setSticky: setSticky, removeSticky: removeSticky, NOTE_WORD: NOTE_WORD, addNote: addNote, setLines: setLines, setDiagramHead: setDiagramHead, typeChoices: typeChoices, addDiagram: addDiagram, TEMPLATE: TEMPLATE, moveDiagram: moveDiagram, duplicateDiagram: duplicateDiagram, removeDiagram: removeDiagram, setCard: setCard, setTitle: setTitle, encodeText: encodeText, subtree: subtree, setLane: setLane, addBox: addBox, addEdge: addEdge, EDITABLE: EDITABLE, toggleMark: toggleMark, removeItem: removeItem, removeEdge: removeEdge, writeLayout: writeLayout, renameItem: renameItem, safeName: safeName, badInName: badInName, MOVABLE: MOVABLE, parseDoc: parseDoc, decodeBytes: decodeBytes, check: check, parseNumber: parseNumber, TYPES: TYPES, MAX_ITEMS: MAX_ITEMS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DocParse = api;
})(typeof window !== 'undefined' ? window : this);
