import pymupdf, glob, os
pdf = glob.glob(r'd:\front-back\suguang_projects\scripts\ppt-tools\qa\*.pdf')[0]
doc = pymupdf.open(pdf)
out = r'd:\front-back\suguang_projects\scripts\ppt-tools\qa'
for i, page in enumerate(doc, 1):
    pix = page.get_pixmap(dpi=110)
    pix.save(os.path.join(out, f'slide-{i:02d}.png'))
print('rendered', doc.page_count, 'slides')