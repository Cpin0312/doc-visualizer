# .pptx を python-pptx で開いて中身を表にする: python3 verify/pptx_check.py file.pptx
import sys, re, zipfile
from pptx import Presentation
from pptx.util import Pt
p = Presentation(sys.argv[1]); W, H = p.slide_width, p.slide_height
print('slides', len(p.slides), 'size', round(W/914400,2), 'x', round(H/914400,2), 'in')
z = zipfile.ZipFile(sys.argv[1]); print('zip test', z.testzip())
for n, s in enumerate(p.slides, 1):
    kinds = {}; texts = []; sizes = []; fonts = set(); out = 0; arrows = 0
    for sh in s.shapes:
        k = sh.shape_type; kinds[str(k).split('.')[-1].split(' ')[0]] = kinds.get(str(k).split('.')[-1].split(' ')[0], 0) + 1
        if sh.left is not None and (sh.left < -1000 or sh.top < -1000 or sh.left + sh.width > W + 9525*2 or sh.top + sh.height > H + 9525*2): out += 1
        if sh.has_text_frame:
            for para in sh.text_frame.paragraphs:
                for r in para.runs:
                    if r.text.strip():
                        if r.font.size: sizes.append(r.font.size.pt)
                        if r.font.name: fonts.add(r.font.name)
            t = sh.text_frame.text.strip()
            if t: texts.append(t.replace('\n', '/')[:40])
        arrows += len(re.findall(r'<a:(tailEnd|headEnd) type="(triangle|arrow|stealth|oval)"', sh._element.xml)) if hasattr(sh, '_element') else 0
    pic = sum(1 for sh in s.shapes if sh.shape_type == 13)
    print(f'--s{n}: shapes={sum(kinds.values())} {kinds} pic={pic} out={out} arrowEnds={arrows} minpt={min(sizes) if sizes else "-"} fonts={sorted(fonts)}')
    print('    ', ' | '.join(texts[:12])[:230])
