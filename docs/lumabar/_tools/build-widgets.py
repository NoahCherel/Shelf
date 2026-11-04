"""Builds _evidence/widgets.json from the captured widgets page, measures each tile image,
and draws one dark/light contact sheet per category into _evidence/sheets/.
Run from anywhere: python docs/lumabar/_tools/build-widgets.py
"""
import html as htmllib
import json
import os
import re
from collections import Counter

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_evidence")
ASSETS = os.path.join(ROOT, "assets")


def parse_widgets():
    page = open(os.path.join(ROOT, "html", "widgets.html"), encoding="utf-8").read()
    # Categories follow the Highlights block; each section opens with an <h2>.
    parts = re.split(r"<h2[^>]*>", page)
    widgets = []
    for part in parts[1:]:
        title = htmllib.unescape(re.sub(r"<[^>]+>", "", part.split("</h2>", 1)[0])).strip()
        for card in re.findall(r'<article class="wcard[^"]*">(.*?)</article>', part, re.S):
            name = htmllib.unescape(re.sub(r"<[^>]+>", " ", re.search(r"<h3[^>]*>(.*?)</h3>", card, re.S).group(1))).strip()
            name = re.sub(r"\s+", " ", name)
            desc = htmllib.unescape(re.sub(r"<[^>]+>", "", re.search(r"<p[^>]*>(.*?)</p>", card, re.S).group(1))).strip()
            dark = re.search(r'src="/assets/([^"]+)"[^>]*class="wcard-dark"', card)
            light = re.search(r'src="/assets/([^"]+)"[^>]*class="wcard-light"', card)
            widgets.append({
                "section": title,
                "name": name,
                "description": desc,
                "dark": dark.group(1) if dark else None,
                "light": light.group(1) if light else None,
            })
    return widgets


def hex_of(px):
    return "#%02x%02x%02x" % tuple(px[:3])


def measure(file):
    """Tiles are translucent, so colours are read together with their alpha."""
    im = Image.open(os.path.join(ASSETS, file)).convert("RGBA")
    w, h = im.size
    px = im.load()
    alpha = im.split()[3]
    left, top, right, bottom = alpha.point(lambda a: 255 if a >= 8 else 0).getbbox()
    # Corner radius: distance along the tile's top edge before its rim begins.
    radius = next((x - left for x in range(left, w // 2) if px[x, top][3] >= 8), None)
    # Rim: strongest alpha within a few pixels of the top edge at mid width.
    rim = max((px[w // 2, y] for y in range(top, min(top + 6, h))), key=lambda p: p[3])
    # Fill: the most common colour and alpha in the band just inside the rim.
    band = Counter(px[x, y] for x in range(left + w // 4, right - w // 4, 2) for y in (top + 7, top + 8))
    fill = band.most_common(1)[0][0]
    return {
        "w": w, "h": h,
        "tile_w": right - left, "tile_h": bottom - top,
        "radius": radius,
        "rim": hex_of(rim), "rim_alpha": round(rim[3] / 255, 3),
        "fill": hex_of(fill), "fill_alpha": round(fill[3] / 255, 3),
    }


def sheet(section, items, out):
    rows, margin, label = [], 8, 18
    width = 1500
    y = margin
    placed = []
    for item in items:
        d = Image.open(os.path.join(ASSETS, item["dark"])).convert("RGBA") if item["dark"] else None
        l = Image.open(os.path.join(ASSETS, item["light"])).convert("RGBA") if item["light"] else None
        height = max(i.size[1] for i in (d, l) if i)
        placed.append((item, d, l, y))
        y += height + label + margin
    canvas = Image.new("RGBA", (width, y), (58, 62, 70, 255))
    draw = ImageDraw.Draw(canvas)
    for item, d, l, y0 in placed:
        draw.text((margin, y0), f'{item["name"]}  {item.get("dark_measure", {}).get("w")}x{item.get("dark_measure", {}).get("h")}', fill=(255, 255, 255, 255))
        if d:
            canvas.alpha_composite(d, (margin, y0 + label))
        if l:
            canvas.alpha_composite(l, (width // 2, y0 + label))
    canvas.convert("RGB").save(os.path.join(out, re.sub(r"\W+", "-", section.lower()) + ".png"))


def main():
    widgets = parse_widgets()
    highlights = [w for w in widgets if w["section"].lower().startswith("highlight")]
    # A widget in Highlights repeats in its category, so count categories only.
    catalogue = [w for w in widgets if w not in highlights]
    for w in catalogue:
        if w["dark"]:
            w["dark_measure"] = measure(w["dark"])
        if w["light"]:
            w["light_measure"] = measure(w["light"])
    with open(os.path.join(ROOT, "widgets.json"), "w", encoding="utf-8") as f:
        json.dump(catalogue, f, indent=1, ensure_ascii=False)

    out = os.path.join(ROOT, "sheets")
    os.makedirs(out, exist_ok=True)
    sections = {}
    for w in catalogue:
        sections.setdefault(w["section"], []).append(w)
    for section, items in sections.items():
        if all(i["dark"] or i["light"] for i in items):
            sheet(section, items, out)
    print("widgets", len(catalogue))
    for section, items in sections.items():
        print(f"  {section}: {len(items)}")
    print("sizes (dark):", Counter((w["dark_measure"]["w"], w["dark_measure"]["h"]) for w in catalogue if "dark_measure" in w).most_common())
    for theme in ("dark", "light"):
        m = [w[f"{theme}_measure"] for w in catalogue if f"{theme}_measure" in w]
        print(theme, "tile_h:", Counter(x["tile_h"] for x in m).most_common(5))
        print(theme, "radius:", Counter(x["radius"] for x in m).most_common(6))
        print(theme, "rim:", Counter((x["rim"], x["rim_alpha"]) for x in m).most_common(4))
        print(theme, "fill:", Counter((x["fill"], x["fill_alpha"]) for x in m).most_common(4))


main()
