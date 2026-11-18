# できた .pptx を python-pptx で読み返す（試験用）。python3 test/pptx_check.py <file.pptx> → JSON
import json, sys
sys.stdout.reconfigure(encoding='utf-8')  # Windows は既定が cp1252 なので、日本語を出すと落ちる
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
def kind(sh):
    try: return str(sh.auto_shape_type).split(' ')[0]
    except Exception: return 'CUSTOM'   # 自由な形（custGeom）は名前がない
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
        'auto': [kind(sh) for sh in s.shapes if sh.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE],
        'charts': [{'type': str(sh.chart.chart_type).split(' ')[0], 'cats': [str(c) for c in sh.chart.plots[0].categories],
                    'series': [[se.name, list(se.values)] for se in sh.chart.plots[0].series],
                    'font': 'Yu Gothic UI' in sh.chart.part.blob.decode('utf8', 'ignore')} for sh in s.shapes if sh.has_chart],
    })
print(json.dumps(out, ensure_ascii=False))
