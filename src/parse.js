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
    compare: { label: '比べる', names: ['compare', '比べる', '比較', '表'] }
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
    var t = nfkc(s).replace(/[,，\s]/g, '').replace(/^(約|およそ|~|〜)/, '');
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
      var edgeLabel = '';
      if (segs.length > 1) {
        var last = splitColon(segs[segs.length - 1], 2);
        segs[segs.length - 1] = last[0];
        edgeLabel = last[1] || '';
      }
      var lane = null, nodes = [];
      for (var i = 0; i < segs.length; i++) {
        var src = [];
        var s = trim(takeSources(segs[i], src));
        if (withLanes) {
          var lm = RE_LANE.exec(s);
          if (lm) { lane = laneOf(trim(lm[1])); s = trim(lm[2]); }
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
        nodes.push({ label: tm.label, marks: tm.marks, sources: src, lane: lane, shape: sh && sh.shape });
      }
      if (withLanes && nodes.length && !nodes[0].lane) {
        // 行の先頭に担当がなければ、あとに出た担当か、最初の担当を使う
        var later = nodes.filter(function (n) { return n.lane; })[0];
        var fill = later ? later.lane : (diag.lanes[0] || laneOf('担当なし'));
        if (!later && fill === diag.lanes[0] && nodes.every(function (n) { return !n.lane; })) warn(ln.no, '担当（[営業] など）がないので「' + fill + '」に入れた', 'fix');
        for (var k = 0; k < nodes.length && !nodes[k].lane; k++) nodes[k].lane = fill;
      }
      if (withLanes) for (var q = 1; q < nodes.length; q++) if (!nodes[q].lane) nodes[q].lane = nodes[q - 1].lane;
      var its = nodes.map(function (n) {
        var it = reg.get(n.label, ln.no);
        if (!it) return null;
        addMarks(it, n.marks, n.sources);
        if (withLanes && !it.lane) it.lane = n.lane;
        if (n.shape && !it.style.shape) it.style.shape = n.shape;
        return it;
      });
      for (var e = 1; e < its.length; e++) {
        if (!its[e - 1] || !its[e]) continue;
        var key = its[e - 1].id + '>' + its[e].id;
        var lab = e === its.length - 1 ? edgeLabel : '';
        if (edgeKey[key]) { if (lab && !edgeKey[key].label) edgeKey[key].label = lab; continue; }
        edgeKey[key] = { id: 'e' + diag.edges.length, kind: 'line', from: its[e - 1].id, to: its[e].id, label: lab, line: ln.no, style: {} };
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
      var s = ln.text.slice(m[1].length).replace(/^(?:[-*+・●○■□▪︎◆◇]|\d+[.)．）])[\s\u3000]+/, '');
      var src = [];
      var tm = takeMarks(takeSources(s, src));
      if (!tm.label) return;
      while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
      it.parent = stack.length ? stack[stack.length - 1].it.id : null;
      it.depth = stack.length;
      stack.push({ ind: ind, it: it });
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
    var split = function (t) { return t.split(/[,，、]/).map(trim); };
    lines.forEach(function (ln, li) {
      var src = [];
      var s = trim(takeSources(ln.text.replace(/^[\s\u3000]*[-*・][\s\u3000]+/, ''), src));
      var parts = splitColon(s, 2);
      if (parts.length < 2) { warn(ln.no, '「名前 : 数字, 数字」の形でないので飛ばした', 'skip'); return; }
      if (!names && !reg.count() && /^(系列|series|凡例)$/i.test(nk(parts[0]))) { names = split(parts[1]).filter(Boolean); return; }
      var tm = takeMarks(parts[0]);
      if (!tm.label) { warn(ln.no, '名前がないので飛ばした', 'skip'); return; }
      var vals = split(parts[1]), out = [], texts = [], bad = null;
      vals.forEach(function (t) {
        if (/^[-－ー―—]?$/.test(nfkc(t)) && !/\d/.test(t)) { out.push(null); texts.push(''); return; }
        var v = parseNumber(t);
        if (v === null) bad = t; out.push(v); texts.push(t);
      });
      if (bad !== null) { warn(ln.no, '数字（' + bad + '）が読めないので飛ばした', 'skip'); return; }
      if (!out.some(function (v) { return v !== null; })) { warn(ln.no, '数字がないので飛ばした', 'skip'); return; }
      var it = reg.get(tm.label, ln.no, false);
      if (!it) return;
      addMarks(it, tm.marks, src);
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
  function parseDoc(text) {
    var warnings = [];
    function warn(no, msg, kind) { warnings.push({ line: no, msg: msg, kind: kind || 'skip' }); }
    var all = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
      .map(function (t, i) { return { text: t, no: i + 1 }; });
    var lines = unwrap(all, warn);
    var doc = { title: '', summary: '', conclusion: '', todo: '', secret: '', diagrams: [], notes: [], body: [], warnings: warnings };
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
        if (!closed) warn(ln.no, '図やコードの終わり（' + fm[1] + '）がないので、最後までを中身とみなした', 'fix');
        if (info.type) {
          var body = inner.filter(function (x) { return trim(x.text) && !/^[\s\u3000]*(\/\/|%%)/.test(x.text); });
          var diag = { type: info.type, name: info.name, line: ln.no, items: [] };
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
             compare: function () { parseCompare(diag, body, warn); } })[info.type]();
          if (!diag.items.length) warn(ln.no, '図「' + (diag.name || TYPES[diag.type].label) + '」に読める行がないので出さなかった', 'skip');
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
        if (level === 1 && !doc.title) { doc.title = trim(hm[2]); continue; }
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
          var val = trim((km[2] || '').replace(/\*\*|__/g, ''));
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
        if (trim(rest) || !trim(l.text)) textLines.push({ text: rest.replace(/[\s\u3000]+$/, ''), no: l.no });
      });
      while (textLines.length && !textLines[textLines.length - 1].code && !trim(textLines[textLines.length - 1].text)) textLines.pop();
      while (textLines.length && !textLines[0].code && !trim(textLines[0].text)) textLines.shift();
      if (s.heading && keys[nk(stripMarkup(s.heading))]) {
        doc.notes.push({ key: nk(stripMarkup(s.heading)), heading: s.heading, line: s.line, lines: textLines, sources: srcs });
      } else if (s.heading || textLines.length || srcs.length) {
        if (srcs.length) textLines.push({ text: '[元：' + srcs.join('／') + ']', no: s.line });
        doc.body.push({ heading: s.heading, level: s.level, line: s.line, lines: textLines });
      }
    });
    // 説明の出どころを箱にも付ける
    doc.notes.forEach(function (n) {
      doc.diagrams.forEach(function (d) { d.items.forEach(function (it) { if (it.key === n.key) n.sources.forEach(function (s) { if (it.sources.indexOf(s) < 0) it.sources.push(s); }); }); });
    });
    warnings.sort(function (a, b) { return a.line - b.line; });
    return doc;
  }
  function stripMarkup(s) { return String(s).replace(/\*\*|__|`/g, ''); }
  function itemKeyExists(doc, label) {
    var k = nk(stripMarkup(label));
    return doc.diagrams.some(function (d) { return d.items.some(function (it) { return it.key === k; }); });
  }

  // ---- 文字コード：BOM → UTF-8 → Shift_JIS / EUC-JP ----
  function decodeBytes(u8) {
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(u8.subarray(3)), encoding: 'UTF-8（BOM つき）', warn: '' };
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), encoding: 'UTF-16', warn: '' };
    if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(u8.subarray(2)), encoding: 'UTF-16', warn: '' };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'UTF-8', warn: '' }; } catch (e) { /* 次を試す */ }
    var cands = [['shift_jis', 'Shift_JIS'], ['euc-jp', 'EUC-JP']].map(function (c) {
      try {
        var t = new TextDecoder(c[0], { fatal: true }).decode(u8);
        var nonAscii = t.replace(/[\x00-\x7F]/g, '').length || 1;
        var hw = (t.match(/[\uFF61-\uFF9F]/g) || []).length;  // 半角カナだらけ＝たぶん読みまちがい
        return { text: t, encoding: c[1], score: hw / nonAscii };
      } catch (e) { return null; }
    }).filter(Boolean).sort(function (a, b) { return a.score - b.score; });
    if (cands.length && cands[0].score < 0.3) return { text: cands[0].text, encoding: cands[0].encoding, warn: '' };
    var lossy = cands.length ? cands[0] : { text: new TextDecoder('shift_jis').decode(u8), encoding: '不明' };
    return { text: lossy.text, encoding: '不明', warn: '文字コードが分からないので、読めた範囲で出した（UTF-8 で保存し直すと確実）' };
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

  var api = { parseDoc: parseDoc, decodeBytes: decodeBytes, check: check, parseNumber: parseNumber, TYPES: TYPES, MAX_ITEMS: MAX_ITEMS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DocParse = api;
})(typeof window !== 'undefined' ? window : this);
