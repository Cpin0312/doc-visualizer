# R8c 用の試験 md（作り話）。文字コードごとに同じ内容を書き出す
base = """# 保存の試験（作り話）
> ひとことで：保存のバイトを見る
> 結論：直した行だけ変わる
> 社外秘：試験用・社外秘

~~~flow 受注の流れ
受付 -> 確認 -> 見積
見積 -> 承認 : OK
見積 -> 受付 : 差し戻し
承認 !期限
~~~

~~~lanes 担当ごとの流れ
[営業] 受付 -> [経理] 請求
[経理] 請求 -> [営業] 入金確認
~~~

~~~tree 組織の木
本部
  営業課
  経理課
    - 請求係
~~~

~~~chart 件数（件）
4月 : 120
5月 : 200
~~~

## 受付
お客様から電話かメールで受ける。
[元：受注手順 2ページ]
"""
special = """
## 特殊な字（試験）
名前：㈱髙橋商事、①番、ｱｲｳ半角、〜波、―棒、≒、∫、﨑、＼
"""
import pathlib
d = pathlib.Path('md')
def w(name, text, enc, bom=b'', crlf=False):
    t = text.replace('\n', '\r\n') if crlf else text
    (d/name).write_bytes(bom + t.encode(enc))
w('30_enc_utf8.md', base, 'utf-8')
w('31_enc_bom.md', base, 'utf-8', b'\xef\xbb\xbf', True)
w('32_enc_u16le.md', base, 'utf-16-le', b'\xff\xfe', True)
w('33_enc_u16be.md', base, 'utf-16-be', b'\xfe\xff')
w('34_enc_sjis_crlf.md', base + special, 'cp932', b'', True)
w('35_enc_sjis_lf.md', base + special, 'cp932')
w('36_enc_eucjp.md', base, 'euc_jp')
