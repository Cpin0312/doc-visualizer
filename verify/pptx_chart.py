import sys
from pptx import Presentation
p=Presentation(sys.argv[1]);W,H=p.slide_width,p.slide_height
print('slides',len(p.slides))
for n,s in enumerate(p.slides,1):
    for sh in s.shapes:
        if sh.has_chart:
            c=sh.chart; ok=sh.left>=-9525 and sh.top>=-9525 and sh.left+sh.width<=W+19050 and sh.top+sh.height<=H+19050
            print(f's{n} チャート type={c.chart_type} 内側={ok}',end=' ')
            t=c.chart_title.text_frame.text if c.has_title else '(題名なし)'
            print('題名',t)
            for pl in c.plots:
                print('   categories',list(pl.categories))
                for se in pl.series: print('   series',se.name,list(se.values))
            try: print('   legend',c.has_legend,'font',c.font.size.pt if c.font.size else None,c.font.name)
            except Exception as e: print('   font?',e)
    # 絵・図形の数
    kinds={}
    for sh in s.shapes: kinds[str(sh.shape_type).split('.')[-1].split(' ')[0]]=kinds.get(str(sh.shape_type).split('.')[-1].split(' ')[0],0)+1
