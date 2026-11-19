# 付箋の形と色を見る：python3 pptx_notes.py file.pptx 文1 文2 ...
import sys
from pptx import Presentation
p=Presentation(sys.argv[1]); keys=sys.argv[2:]
alltext=[]
for n,s in enumerate(p.slides,1):
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            alltext.append((n,sh))
for k in keys:
    hit=[(n,sh) for n,sh in alltext if k in sh.text_frame.text]
    if not hit: print('NOTFOUND',k); continue
    for n,sh in hit[:2]:
        fill=None
        try:
            if sh.fill.type==1: fill=str(sh.fill.fore_color.rgb)
        except Exception as e: fill='?'
        bg=None
        for o in p.slides[n-1].shapes:
            if o is sh or (o.has_text_frame and o.text_frame.text.strip()): continue
            if abs(o.left-sh.left)<400000 and abs(o.top-sh.top)<400000 and o.width>=sh.width*0.9:
                try:
                    if o.fill.type==1 and str(o.fill.fore_color.rgb)!='000000': bg=str(o.fill.fore_color.rgb)
                except Exception: pass
        print('FOUND',k,'slide',n,'shape',sh.shape_type,'text',sh.text_frame.text[:12].replace('\n','/'),'bg',bg)
