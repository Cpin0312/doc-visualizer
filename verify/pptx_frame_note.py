import sys
from pptx import Presentation
p=Presentation(sys.argv[1]); note,fr=sys.argv[2:4]
def find(txt,slide=None,exact=False):
    for n,s in enumerate(p.slides,1):
        for sh in s.shapes:
            if sh.has_text_frame and ((sh.text_frame.text.strip()==txt) if exact else (txt in sh.text_frame.text)) and (slide is None or n==slide): return n,sh
n,ns=find(note)
# 枠の四角：「台帳」の見出しを含む、いちばん小さい色つきの四角
_,title=find(fr,n,True)
best=None
for o in p.slides[n-1].shapes:
    if o.has_text_frame and o.text_frame.text.strip(): continue
    try:
        ok=o.fill.type==1 and str(o.fill.fore_color.rgb)!='000000'
    except Exception: ok=False
    if ok and o.left<=title.left and o.top<=title.top and o.left+o.width>=title.left+title.width and o.top+o.height>=title.top+title.height:
        if best is None or o.width*o.height<best.width*best.height: best=o
dx=max(best.left-(ns.left+ns.width),0,ns.left-(best.left+best.width)); dy=max(best.top-(ns.top+ns.height),0,ns.top-(best.top+best.height))
bg=None
for o in p.slides[n-1].shapes:
    if o is ns or (o.has_text_frame and o.text_frame.text.strip()): continue
    if abs(o.left-ns.left)<400000 and abs(o.top-ns.top)<400000 and o.width>=ns.width*0.9:
        try:
            if o.fill.type==1 and str(o.fill.fore_color.rgb)!='000000': bg=str(o.fill.fore_color.rgb)
        except Exception: pass
print('slide',n,'note',ns.left,ns.top,ns.width,ns.height,'frame rect',best.left,best.top,best.width,best.height)
print('RECTDIST %d'%int((dx*dx+dy*dy)**0.5)); print('BG',bg)
