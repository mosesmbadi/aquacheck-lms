"""
Calibri for every generated PDF, matching the printed test report.

ReportLab embeds TrueType files, so the font has to exist on the server. Lookup order:
genuine Calibri dropped into app/fonts (Windows file names: calibri.ttf, calibrib.ttf,
calibrii.ttf, calibriz.ttf), the Windows font folder for local runs, then Carlito
(metrically identical, installed in the Docker image). Falls back to Helvetica so PDFs
still render if none is found.
"""
import os
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_CALIBRI_FILES = ("calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf")
_CANDIDATES = [
    (os.path.join(os.path.dirname(__file__), "..", "fonts"), _CALIBRI_FILES),
    (os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts"), _CALIBRI_FILES),
    ("/usr/share/fonts/truetype/crosextra",
     ("Carlito-Regular.ttf", "Carlito-Bold.ttf", "Carlito-Italic.ttf", "Carlito-BoldItalic.ttf")),
]
_NAMES = ("Calibri", "Calibri-Bold", "Calibri-Italic", "Calibri-BoldItalic")


def _register():
    for folder, files in _CANDIDATES:
        paths = [os.path.normpath(os.path.join(folder, f)) for f in files]
        if all(os.path.isfile(p) for p in paths):
            for name, path in zip(_NAMES, paths):
                pdfmetrics.registerFont(TTFont(name, path))
            # Lets <b>/<i> inside Paragraphs resolve to the right face.
            pdfmetrics.registerFontFamily(_NAMES[0], normal=_NAMES[0], bold=_NAMES[1],
                                          italic=_NAMES[2], boldItalic=_NAMES[3])
            return _NAMES
    return ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")


FONT, FONT_BOLD, FONT_ITALIC, FONT_BOLD_ITALIC = _register()
