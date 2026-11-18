# 進み具合（03_DocVisualizer）

- 2026-11-18：マスターが「できる限り入れて作って、終わったらプッシュ。Windows でも必ず動く」。使用量（1週間 65%）を伝えて「作る」の答え。設計は DESIGN.md。
- 段：R1（読みとり・2D・build・PDF）→ R2（3D・発表）→ R3（PowerPoint）→ R4（README・Push・Windows CI）

| 段 | 開発 | 確かめ | コミット |
|---|---|---|---|
| R1 | 直し済み 0977dd4（107○） | ○（2回目、VERIFY.md 7） | bff445c・fe1b44b・39ab134 |
| R2 | 直し済み 0fad9f6 | ○（VERIFY.md 9） | 9c1fb26 |
| R3 | 済 9f3c276・5a6eccc（126○、1284KB） | ○（VERIFY.md 10。本物の PowerPoint の見た目は未確認） | 9f3c276・5a6eccc |
| R4 | cae2a35 → 942f6f8（サーバーをやめた）→ 文書・言い方の直し | 未 | cae2a35・942f6f8 |

## 名簿（2026-11-18）
- 親：
- 開発（Opus）：DocVisualizer_開発 — R1 を作りはじめた
- 確かめ（Sonnet）：DocVisualizer_確かめ — 準備おわり（VERIFY.md・verify/run.mjs・試験 md 17個）。R1 待ち
- 調査（Haiku）：DocVisualizer_調査 — 調べおわり（RESEARCH.md。runner に Edge 157 あり、公開リポジトリは無料、PptxGenJS 4.0.1 MIT）

## 決めたこと
- 2026-11-18 EUC-JP は正しく読めれば ○（設計の「分からないと出す」より良い）。.txt も受け付け、文字でなければ断る。試験に pdfjs-dist を使う。
- 確かめの間、開発は dist/ を書きかえない。
- 2026-11-18 マスター「サーバは使わない。完全にオフライン」→ サーバーの部品をやめる。
- 2026-11-18 マスター：ほかの道具とはつながない独立したものにする → どこにも登録しない。公開物に Mac の道を入れない。
