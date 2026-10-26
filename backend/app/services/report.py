"""Informe PDF de una prescripción."""
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .maps import ndvi_png, zone_colors, zones_png

INK = colors.HexColor("#1a1b23")
MUTED = colors.HexColor("#5e6e82")
LINE = colors.HexColor("#d5dde6")
ACCENT = colors.HexColor("#1e88ff")
TZ = ZoneInfo("America/Santiago")


def _fmt(v, d=2):
    if v is None:
        return "-"
    s = f"{v:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def _img(path: Path, max_w: float, max_h: float) -> Image:
    img = Image(str(path))
    ratio = min(max_w / img.imageWidth, max_h / img.imageHeight)
    img.drawWidth, img.drawHeight = img.imageWidth * ratio, img.imageHeight * ratio
    return img


def _table(rows, col_widths, align_right_from=1, header=True, zebra=True):
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
            ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ]
    if zebra:
        for r in range(1 if header else 0, len(rows)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#f4f7fa")))
    t.setStyle(TableStyle(style))
    return t


def build_report(
    out_path: Path,
    work_dir: Path,
    *,
    field: dict,
    flight: dict,
    prescription: dict,
    author: str,
) -> Path:
    stats = flight["stats"] or {}
    summ = prescription["summary"]
    unit = prescription["unit"]
    n = prescription["num_zones"]

    ndvi_img = ndvi_png(Path(flight["analysis_path"]), work_dir / "mapa_ndvi.png")
    labels = [f"Zona {z['zona']} · {_fmt(z['dosis'], 1)} {unit}" for z in summ["zonas"]]
    zones_img = zones_png(work_dir / "zonas.tif", work_dir / "mapa_zonas.png", labels)

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, textColor=INK, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, textColor=INK,
                        spaceBefore=10, spaceAfter=5)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontName="Helvetica", fontSize=9, textColor=INK,
                          alignment=TA_LEFT, leading=12)
    small = ParagraphStyle("s", parent=body, fontSize=7.5, textColor=MUTED, leading=10)

    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Informe de prescripción - {prescription['name']}", author=author,
    )
    W = A4[0] - 32 * mm
    now = datetime.now(TZ).strftime("%d-%m-%Y %H:%M")

    story = [
        Paragraph("Prescriptor NDVI · Informe de dosis variable", small),
        Paragraph(prescription["name"], h1),
        Paragraph(f"Generado el {now} por {author}", small),
        Spacer(1, 8),
    ]

    info = [
        ["Lote", field["name"], "Fecha de vuelo", flight["flight_date"] or "-"],
        ["Cultivo", field["crop"] or "-", "Imagen", flight["original_filename"]],
        ["Producto", prescription["product"] or "-", "Zonificación",
         f"{n} zonas por {prescription['method']}"],
        ["Superficie", f"{_fmt(summ['area_total_ha'], 2)} ha", "Resolución de análisis", f"{_fmt(summ['resolucion_m'], 2)} m"],
    ]
    t = Table(info, colWidths=[W * 0.16, W * 0.34, W * 0.2, W * 0.3], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9), ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), MUTED), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story += [t]

    # Cifras clave
    kpi = Table(
        [[f"{_fmt(summ['producto_total'], 1)}", f"{_fmt(summ['dosis_media'], 1)}", f"{_fmt(stats.get('media'), 2)}"],
         [f"producto total ({unit.split('/')[0]})", f"dosis media ({unit})", "NDVI medio"]],
        colWidths=[W / 3] * 3, hAlign="LEFT",
    )
    kpi.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 18), ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONT", (0, 1), (-1, 1), "Helvetica", 8), ("TEXTCOLOR", (0, 1), (-1, 1), MUTED),
        ("LINEABOVE", (0, 0), (-1, 0), 2, ACCENT), ("TOPPADDING", (0, 0), (-1, 0), 8),
    ]))
    story += [Spacer(1, 10), kpi]

    # Mapas lado a lado
    maps = Table([[_img(ndvi_img, W * 0.48, 95 * mm), _img(zones_img, W * 0.48, 95 * mm)],
                  [Paragraph("Mapa NDVI", small), Paragraph("Zonas de manejo y dosis", small)]],
                 colWidths=[W * 0.5, W * 0.5], hAlign="LEFT")
    maps.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story += [Paragraph("Mapas", h2), maps]

    # Tabla de zonas
    zc = zone_colors(n)
    rows = [["", "Zona", "NDVI (mín – máx)", "NDVI medio", "Área (ha)", "% área", f"Dosis ({unit})", "Producto"]]
    for z in summ["zonas"]:
        rows.append(["", str(z["zona"]), f"{_fmt(z['ndvi_min'], 3)} – {_fmt(z['ndvi_max'], 3)}",
                     _fmt(z["ndvi_media"], 3), _fmt(z["area_ha"], 2), _fmt(z["pct_area"], 1),
                     _fmt(z["dosis"], 1), _fmt(z["producto_total"], 1)])
    rows.append(["", "Total", "", "", _fmt(summ["area_total_ha"], 2), "100", _fmt(summ["dosis_media"], 1),
                 _fmt(summ["producto_total"], 1)])
    zt = _table(rows, [W * 0.03, W * 0.08, W * 0.2, W * 0.12, W * 0.12, W * 0.1, W * 0.14, W * 0.13],
                align_right_from=2)
    extra = [("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 8.5), ("LINEABOVE", (0, -1), (-1, -1), 0.8, INK)]
    for i, z in enumerate(summ["zonas"], start=1):
        extra.append(("BACKGROUND", (0, i), (0, i), colors.HexColor(zc[z["zona"] - 1])))
    zt.setStyle(TableStyle(extra))
    story += [KeepTogether([Paragraph("Zonas y dosis", h2), zt])]

    # Estadísticas NDVI
    p = stats.get("percentiles", {})
    st_rows = [
        ["Mínimo", _fmt(stats.get("min"), 3), "Percentil 10", _fmt(p.get("p10"), 3)],
        ["Máximo", _fmt(stats.get("max"), 3), "Mediana", _fmt(p.get("p50"), 3)],
        ["Desv. estándar", _fmt(stats.get("desv"), 3), "Percentil 90", _fmt(p.get("p90"), 3)],
        ["Umbrales de zona", ", ".join(_fmt(u, 3) for u in summ["umbrales_ndvi"]), "", ""],
    ]
    story += [KeepTogether([Paragraph("Estadísticas del NDVI", h2),
                            _table(st_rows, [W * 0.22, W * 0.28, W * 0.22, W * 0.28], header=False)])]

    story += [
        Spacer(1, 12),
        Paragraph(
            "Archivos para el Agras: carpeta DJI del .zip de la prescripción. Importa DJI/Shapefile/limite.shp "
            "como límite y DJI/Rx/prescripcion.tif como Prescription Map (Map Source: Other, Source unit: ha). "
            "Verifica en el control remoto que las dosis coinciden con esta tabla antes de volar.", small),
        Paragraph(
            "El NDVI indica vigor relativo de la vegetación; la dosis por zona la define el usuario. "
            "Este informe no reemplaza la recomendación de un agrónomo.", small),
    ]

    def _footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 9 * mm, f"Prescriptor NDVI · {field['name']} · {prescription['name']}")
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Página {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return out_path
