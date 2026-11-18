# できた .pptx を python-pptx で読み返す（試験用）。python3 test/pptx_check.py <file.pptx> → JSON
import json, sys
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
p = Presentation(sys.argv[1])
out = {'w': round(p.slide_width / 914400, 3), 'h': round(p.slide_height / 914400, 3), 'slides': []}
for s in p.slides:
    runs = [r for sh in s.shapes if sh.has_text_frame for para in sh.text_frame.paragraphs for r in para.runs]
    geo = [sh for sh in s.shapes if sh.shape_type in (MSO_SHAPE_TYPE.AUTO_SHAPE, MSO_SHAPE_TYPE.FREEFORM, MSO_SHAPE_TYPE.LINE)]
    xml = [sh._element.xml for sh in s.shapes]
    out['slides'].append({
        'texts': [sh.text_frame.text for sh in s.shapes if sh.has_text_frame and sh.text_frame.text],
        'minPt': min([r.font.size.pt for r in runs if r.font.size] or [0]),
        'fonts': sorted(set(r.font.name or '' for r in runs)),
        'shapes': len(s.shapes), 'geo': len(geo),
        'cust': sum('custGeom' in x for x in xml), 'arrows': sum('tailEnd' in x for x in xml),
        'pics': sum(1 for sh in s.shapes if sh.shape_type == MSO_SHAPE_TYPE.PICTURE),
        'secret': any(sh.name == 'secret' for sh in s.shapes),
    })
print(json.dumps(out, ensure_ascii=False))
