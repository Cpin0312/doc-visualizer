# 保存したバイトの検査（Python の別実装の codec で見る＝アプリの表を信じない）
import sys, difflib, pathlib, re
root = pathlib.Path('out/r12')
ENC = {'30':('utf-8',b''),'31':('utf-8',b'\xef\xbb\xbf'),'32':('utf-16-le',b'\xff\xfe'),'33':('utf-16-be',b'\xfe\xff'),'34':('cp932',b''),'35':('cp932',b''),'36':('euc_jp',b'')}
def eols(b):
    return (b.count(b'\r\n'), b.count(b'\n')-b.count(b'\r\n'))
for d in sorted(root.iterdir()):
    if not (d/'saved.md').exists(): continue
    k = d.name[:2]
    if k not in ENC: continue
    enc, bom = ENC[k]
    o = (d/'orig.md').read_bytes(); s = (d/'saved.md').read_bytes(); scr = (d/'screen.txt').read_bytes().decode('utf-8')
    # 保存の文字コード：EUC-JP は UTF-8 になるはず
    sen, sbom = (('utf-8',b'') if k=='36' else (enc,bom))
    ok = []
    ok.append(('BOM/先頭が元と同じ' if k!='36' else 'EUC-JP→UTF-8（BOM なし）', s[:len(sbom)]==sbom and (len(sbom)>0 or s[:3]!=b'\xef\xbb\xbf' and s[:2] not in (b'\xff\xfe',b'\xfe\xff'))))
    try: dec = s[len(sbom):].decode(sen)
    except Exception as e: dec=None; ok.append(('復号できる',False))
    if dec is not None: ok.append(('保存バイトを別実装で読むと画面の md と同じ', dec==scr))
    # 改行
    if enc in ('utf-8','cp932','euc_jp'):
        eo, es = eols(o), eols(s)
        ok.append((f'改行の種類が元と同じ（元 CRLF/LF {eo}、保存 {es}）', (eo[0]>0)==(es[0]>0) and (eo[1]>0)==(es[1]>0)))
    else:
        od=o[len(bom):].decode(enc); ok.append((f'改行（元 CRLF {od.count(chr(13)+chr(10))} 保存 {dec.count(chr(13)+chr(10)) if dec else "-"}）', dec is not None and (od.count('\r\n')>0)==(dec.count('\r\n')>0) and (dec.count('\n')-dec.count('\r\n')>0)==(od.count('\n')-od.count('\r\n')>0)))
    # 直していない行のバイト
    odec = o[len(bom):].decode(enc)
    ol = re.split(r'\r\n|\r|\n', odec); sl = re.split(r'\r\n|\r|\n', scr)
    sm = difflib.SequenceMatcher(None, ol, sl, autojunk=False)
    changed = sum((a2-a1) for t,a1,a2,b1,b2 in sm.get_opcodes() if t!='equal'); added = sum((b2-b1) for t,a1,a2,b1,b2 in sm.get_opcodes() if t!='equal')
    if enc in ('utf-8','cp932') and dec is not None:
        osplit = re.split(rb'\r\n|\r|\n', o[len(bom):]); ssplit = re.split(rb'\r\n|\r|\n', s[len(sbom):])
        bad=[]
        for t,a1,a2,b1,b2 in sm.get_opcodes():
            if t=='equal':
                for x,y in zip(range(a1,a2),range(b1,b2)):
                    if osplit[x]!=ssplit[y]: bad.append((x+1,osplit[x][:30],ssplit[y][:30]))
        ok.append((f'直していない行のバイトが元と同じ（違い {len(bad)} 行）', not bad))
        if bad: print('  差',bad[:3])
        # 直した行は別実装で符号化した結果と同じ
        okc=True
        for t,a1,a2,b1,b2 in sm.get_opcodes():
            if t!='equal':
                for y in range(b1,b2):
                    try:
                        if sen=='cp932' and ssplit[y]!=sl[y].replace('¥','\\').encode('cp932'): okc=False; print('  直した行の違い',sl[y][:30],ssplit[y][:30], sl[y].encode('cp932',errors='replace')[:30])
                    except Exception as e: okc=False; print('  encode不可',e)
        if sen=='cp932': ok.append(('直した行は Python cp932 の符号化と同じ', okc))
    print(f'{d.name}: 変わった行（元側 {changed}、画面側 {added}）')
    for n,v in ok: print('  ','○' if v else '×',n)
