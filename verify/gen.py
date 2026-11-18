# 試験用 md を作る（作り話のデータだけ）。python3 gen.py
import os
d=os.path.join(os.path.dirname(os.path.abspath(__file__)),'md')
def w(n,s,enc='utf-8',nl='\n'):
    s=s.replace('\r\n','\n').replace('\n',nl)
    open(os.path.join(d,n),'wb').write(s.encode(enc))
BODY='''# 架空商事 受注手順（試験用）
> ひとことで：受けてから請求までの流れ
> 結論：承認は2段階にする
> すること：来週までに見積の雛形を直す
> 社外秘：試験用・社外秘

~~~flow 受注の流れ
受付 -> 確認 -> 見積
見積 -> 承認 : OK
見積 -> 受付 : 差し戻し
承認 !期限
~~~

~~~lanes 担当ごと
[営業] 受付 -> [経理] 請求
[経理] 請求 -> [営業] 入金確認
~~~

~~~timeline 日程
2026-12-01 説明会 !期限
2026-12-15 試験運用 ?確認
2027-01-10 本番 +完了
~~~

~~~tree 組織
本部
  営業課
  経理課
    - 請求係
~~~

~~~chart 月ごとの件数（件）
4月 : 120
5月 : 1,200
6月 : ９８
~~~

~~~kpi 大事な数字
売上 : 1,200万円 : 前年比 +8%
件数 : 340件
~~~

~~~compare 案の比較
| 項目 | 案A | 案B |
|---|---|---|
| 費用 | 安い | 高い |
| 期間 | 3か月 | 1か月 |
~~~

## 受付
お客様から電話かメールで受ける。
[元：架空手順.docx 2ページ]
'''
# 1 Copilot 本物の形: 全体を ```markdown で包み、図は ~~~
w('01_copilot_wrapped.md','```markdown\n'+BODY+'```\n')
# 2 素直な形: 図は ``` で
w('02_plain_backtick.md',BODY.replace('~~~','```'))
# 3 全角記号・日本語種類名
w('03_zenkaku.md','''# 全角の試験
```流れ 全角の流れ
受付　→　確認　⇒　見積
見積　→　承認　：　ＯＫ
承認　！期限
```
```数字 全角数字
４月　：　１２０
```
''')
# 4 Shift_JIS / 5 CRLF / 6 BOM
w('04_sjis.md',BODY,enc='cp932')
w('05_crlf.md',BODY,nl='\r\n')
w('06_bom.md','﻿'+BODY,)
w('07_sjis_crlf_wrapped.md','```markdown\n'+BODY+'```\n',enc='cp932',nl='\r\n')
# 8 わざとまちがえた行
w('08_broken.md','''# まちがいの試験
```flow 壊れた図
受付 -> 確認
->
確認 ->
？？？ここは矢印がない行
確認 -> 受付 -> 確認
確認 -> 確認
```
```chart 数字の誤り（件）
4月 : 120
5月 : たくさん
6月 : 80
```
```unknownkind 知らない種類
a -> b
```
```timeline 日付の誤り
2026-13-45 ありえない日 !期限
2026-12-01 正しい日
```
''')
# 9 図なし
w('09_no_diagram.md','# 図のない資料\n> ひとことで：文だけ\n\n本文だけの段落。\n\n- 箇条書き1\n- 箇条書き2\n')
# 10 空 / 11 md 以外
w('10_empty.md','')
open(os.path.join(d,'11_not_md.txt'),'wb').write(b'\x00\x01\x02binary')
# 12 EUC-JP（文字化け）
w('12_eucjp.md',BODY,enc='euc_jp')
# 13 輪・同名・200超の箱
w('13_cycle_dup.md','```flow 輪\nA -> B -> C -> A\nA -> A\nB -> B\n```\n')
w('14_over200.md','```flow 大きい図\n'+'\n'.join(f'箱{i} -> 箱{i+1}' for i in range(250))+'\n```\n')
# 15 日本語・スペース・全角のファイル名
w('15 全角　名前 (試験).md',BODY)
# 16 5MB 超
with open(os.path.join(d,'16_over5mb.md'),'w') as f:
    f.write('# 巨大\n'); 
    line='本文の行。'*20+'\n'
    for _ in range(int(5.2*1024*1024/len(line.encode()))+1): f.write(line)
# 17 </script> を含む
w('17_script_tag.md','# </script><script>alert(1)</script>\n```flow x\n</script> -> <b>b</b>\n```\n')
print(sorted(os.listdir(d)))
