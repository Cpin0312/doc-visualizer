import sys, re
from pptx import Presentation
p=Presentation(sys.argv[1]); names=['受付','台帳','申込.xlsx','問い合わせ.xlsx','台帳を分ける','担当ごとの箱を作る','増えた手間は1つ','1件あたり -40%','変える前','変えた後','やったこと','効果','担当ごと']
texts=[]; arrows=0; colors={}; found={}
for n,s in enumerate(p.slides,1):
    for sh in s.shapes:
        x=sh._element.xml
        if sh.has_text_frame and sh.text_frame.text.strip():
            texts.append((n,sh.text_frame.text.strip().replace('\n','/')))
        if re.search(r'<a:(tailEnd|headEnd) type="(triangle|arrow|stealth)"',x):
            arrows+=1
            c=re.search(r'<a:ln[^>]*>.*?<a:srgbClr val="([0-9A-Fa-f]{6})"',x,re.S)
            if c: colors[c.group(1).upper()]=colors.get(c.group(1).upper(),0)+1
for nm in names:
    hit=[(n,t) for n,t in texts if nm in t]
    if hit: found[nm]=hit[0][0]
    else: print('MISSING',nm)
print('slides',len(p.slides),'texts',len(texts),'shapes_with_names',len(found)); print('arrows=%d'%arrows); print('lines',colors)
print('emph blue=%d'%colors.get('3B6FD8',0))
