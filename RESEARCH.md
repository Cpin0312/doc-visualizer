# 調査メモ（03_DocVisualizer・調査役・2026-11-18）

ソースは直していない。npm install・build・コミット・Push はしていない。
「確認」は、出どころの原文か Mac の実行結果で見たもの。「未確認」は、見つけられなかった・確かめ方法が決まっていないもの。

## 1. GitHub Actions `windows-latest` と Edge

| 項目 | 結果 | 出どころ |
|---|---|---|
| 公開リポジトリの標準の runner（windows-latest 含む）の分数は無料 | **確認**（ドキュメントの要約。原文の表示は検索結果の抜粋） | https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions |
| ただし larger runner（大きい機械）は公開リポジトリでも有料 | 確認（同上の要約） | 同上 |
| Windows の image に Microsoft Edge が入っている | **確認**。Windows Server 2025 の README の「Browsers and Drivers」欄に `Microsoft Edge 157.0.4341.46` と `Microsoft Edge Driver 157.0.4341.46` の行あり（2026-11 時点の main） | https://raw.githubusercontent.com/actions/runner-images/main/images/windows/Windows2025-Readme.md |
| image の更新で Edge の版は変わる | 確認。リリース告知で Edge の版が毎回変わるのを確認（例：win25 の 20260712.193 で 150.0.4078.65） | https://newreleases.io/project/github/actions/runner-images/release/win25%2F20260712.193 |
| `windows-latest` が今どの image を指すか | **未確認**。README に `windows-latest` の記載なし。検索の抜粋では「2026年6月に windows-latest を Windows Server 2025（VS 2026）へ移す」とあるが、確かめられなかった | 検索の抜粋（newreleases.io の win22/20260628.224 の告知） |
| Edge の実行ファイルの場所（既定） | **未確認**。README にパスの記載なし。Microsoft の DevTools MCP の文書（検索の抜粋）では Stable は `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。この文書は開いていないので、確定ではない | https://learn.microsoft.com/microsoft-edge/web-platform/devtools-mcp-server（抜粋のみ） |
| 作る道具の側での決め方 | 推奨：`EDGE_PATH` の環境変数を読み、無ければ上の既定パスを順に見る。見つからなければ落とさず「Edge が見つからない」と出す。`browser-actions/setup-edge` を使えば版と場所を固定できる（未試用） | https://github.com/browser-actions/setup-edge |
| ヘッドレスで `--remote-debugging-port` が使える | **未確認（Edge 固有）**。Chromium の文書では `--headless=new`（新しい方）と `--remote-debugging-port` が使える（確認）。Edge の dev 版で `--headless --remote-debugging-port` の起動が 1秒以内に終了（終了コード 21）という Microsoft フォーラムの報告あり（検索の抜粋・未検証） | https://developer.chrome.com/docs/chromium/new-headless（Chromium）／Microsoft フォーラム（抜粋） |
| Edge の Windows runner でヘッドレス起動が通るか | **未確認**。実際に CI で動かして確かめるしかない。まず `msedge.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<一時フォルダ> about:blank` を試す | — |

## 2. PptxGenJS

| 項目 | 結果 | 出どころ |
|---|---|---|
| いまの版（npm） | **確認**：`npm view pptxgenjs version` → `4.0.1`（Mac で実行） | https://www.npmjs.com/package/pptxgenjs |
| ライセンス | **確認**：MIT（`npm view` の license と README の Copyright © 2015-present Brent Ely） | https://github.com/gitbrent/PptxGenJS |
| 依存 | 確認：依存は JSZip 1つ（README の抜粋） | https://github.com/gitbrent/PptxGenJS |
| ブラウザだけで使える | 確認：README「every major modern browser」。CDN 用の bundle あり。ネットを使わず、1枚の HTML にインラインする場合は bundle の中身を `<script>` に入れる | https://raw.githubusercontent.com/gitbrent/PptxGenJS/master/README.md |
| 保存の書き方 | 確認：`pres.writeFile({ fileName: "…pptx" })`（README 原文）。出力形式は base64・Blob・Buffer・Node stream。`writeFile` が Promise を返すか、`write({outputType:'blob'})` の書き方は **未確認**（公式 docs の該当ページは 404 だった） | README 原文 |
| 図形 | 確認：`pres.ShapeType.rect`・`ellipse`・`line` を使う（https://gitbrent.github.io/PptxGenJS/docs/api-shapes/ の例）。約200種類あると書いてある。**矢印の書き方（`endArrowType` など）は未確認**（そのページには書かれていない） | 上記 docs |
| 線の書き方 | 確認：`line: { color, width, dashType }` | 同上 |
| 画像（data URL） | **未確認**。README は画像を入れられると書くが、`data:` の書き方は見つからなかった（docs の images ページは 404） | — |
| 日本語の字体の指定 | **未確認**（`fontFace` の書き方は docs で確認できず）。README は「Asian fonts」対応とだけ書く | — |
| 確かめ方 | `npm view` は使えた。型定義（`types/index.d.ts`）を読むと `fontFace`・矢印・`data:` の型が分かる。これは R3 の作業で、開発役が `npm pack` か型定義の確認で行う（この調査では入れていない） | — |

## 3. Mac でのこと（この Mac の実行結果）

| 項目 | 結果 |
|---|---|
| `python3 -c "import pptx"` | **確認**：`ModuleNotFoundError`（入っていない） |
| 入れられるか | **確認**：`pip3 index versions python-pptx` で `1.0.2` が見える（入れてはいない）。無料（MIT）。確かめの道具として使える |
| LibreOffice | **確認**：`which soffice` は見つからず、`/Applications` にもない |
| Keynote | **確認**：`/Applications` に Keynote は無い（`Numbers.app` だけある） |
| 結論 | pptx の中身の確かめには python-pptx（pip で入れられる）が使える。PowerPoint や LibreOffice で開いて見る確かめは、この Mac ではできない（**未確認として残る**） |

## 4. Windows の Edge と、会社のポリシーで止められうるもの

| 項目 | 結果 | 出どころ |
|---|---|---|
| `<a download>`（blob URL）で保存できるか | **未確認**（この調査では実機で試していない）。Chromium の仕組みとして file:// からの blob ダウンロードは通常の挙動と思われるが、確かめるのは確かめ役の仕事 | — |
| 印刷で「PDF に保存」が使えるか | 確認（方針）：`window.print()` は使える。Edge のダウンロード制限のポリシーは「印刷・Save as PDF には適用しない」と書いてある | https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/downloadrestrictions |
| ポリシー名：WebGL | **確認**：`Disable3DAPIs`。有効なら WebGL は使えない。`HardwareAccelerationModeEnabled` が false のときは `Disable3DAPIs` は無視される | Microsoft Learn（Disable3DAPIs の検索の抜粋） |
| ポリシー名：ハードウェア アクセラレーション | **確認**：`HardwareAccelerationModeEnabled`。変えたら Edge の再起動が要る | 同上（抜粋） |
| ポリシー名：ダウンロード | **確認**：`DownloadRestrictions`（DWORD）。値 3 = `BlockAllDownloads`（すべて止める）。値 4 は `BlockMaliciousDownloads`。文書の表記が一部で揃っていない（値 4 の説明の書き方）ので、値の名前で指定する | https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/downloadrestrictions（原文） |
| ポリシー名：ファイル選び | **確認**：`AllowFileSelectionDialogs`。無効にすると入力のファイル選びが開かない（CIS は無効を推奨） | Microsoft Learn（抜粋） |
| ポリシー名：file:// | **確認（否定）**：`URLBlocklist` で file:// を止めるのは正しく働かない。原文に「This policy doesn't work as expected with file://* wildcards.」とある。file:// を止める専用のポリシーは見つからなかった | https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/urlblocklist（原文） |
| 会社で止められうる項目の一覧 | WebGL（`Disable3DAPIs`）、ハードウェア アクセラレーション（`HardwareAccelerationModeEnabled`）、ダウンロード（`DownloadRestrictions`）、ファイル選び（`AllowFileSelectionDialogs`）、URL 止め（`URLBlocklist`）。file:// の専用ポリシーは未確認 | 上記 |

## 親への提案（調査の結論）
1. CI の `windows-latest` で Edge は入っている（確認）。場所は環境変数と既定パスで探し、見つからなければ落とさず知らせる。ヘッドレスの起動は Edge 固有のため、CI で確かめるまで「未確認」。
2. PptxGenJS 4.0.1（MIT）は使える（確認）。矢印・日本語字体・data URL の書き方は、R3 の前に型定義で確かめる（未確認）。
3. pptx の確かめは python-pptx（pip、無料）で行える（この Mac で入れられる。入れてはいない）。PowerPoint は Mac にも Windows の CI にもない → 本物の PowerPoint で開くことは未確認のまま残る。
4. 会社で止められうる項目（上の表）を、画面に出すときの文言の元にする。

## 未確認のまとめ
- `windows-latest` が今どの image か（README に記載なし）
- Edge の実行ファイルの場所（Windows runner の上で）
- Edge のヘッドレス + `--remote-debugging-port` が runner で起動するか
- PptxGenJS の `writeFile` の Promise、矢印の書き方、`data:` 画像、`fontFace`
- `<a download>` の blob 保存、Edge での印刷の PDF 保存（実機未確認）
- file:// を止める専用のポリシーの有無
