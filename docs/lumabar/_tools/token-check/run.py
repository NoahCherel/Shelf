"""Renders tiles.html in each candidate font, composites Lumabar's captures on the same background,
reports the pixel difference, and writes a side-by-side sheet to _evidence/sheets/token-check.png.
A lower difference means the tokens and font are closer to the original."""
import glob
import os
import subprocess

from PIL import Image, ImageChops, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "_evidence")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BG = (58, 62, 70, 255)
ROWS = [("claude-usage", 0, 422), ("stripe-chart", 174, 481), ("date", 348, 468)]
url = "file:///" + os.path.join(HERE, "tiles.html").replace("\\", "/")


def render(font):
    out = os.path.join(ROOT, "sheets", f"token-{font}.png")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--disable-web-security", "--hide-scrollbars", "--no-first-run",
                    "--user-data-dir=" + os.path.join(ROOT, "edge-prof"), "--window-size=560,520",
                    "--virtual-time-budget=6000", "--screenshot=" + out, f"{url}?font={font}"], timeout=90)
    return Image.open(out).convert("RGB")


def capture(name):
    f = [x for x in glob.glob(os.path.join(ROOT, "assets", name + "-dark-*.webp")) if "-720-" not in x][0]
    im = Image.open(f).convert("RGBA")
    base = Image.new("RGBA", im.size, BG)
    base.alpha_composite(im)
    return base.convert("RGB")


sheet = Image.new("RGB", (1500, 540), BG[:3])
for name, y, _w in ROWS:
    c = capture(name)
    sheet.paste(c, (1000, y))
for col, font in enumerate(["sf", "inter"]):
    shot = render(font)
    total = 0
    for name, y, _w in ROWS:
        c = capture(name)
        crop = shot.crop((0, y, c.size[0], y + c.size[1]))
        diff = ImageStat.Stat(ImageChops.difference(crop, c).convert("L")).mean[0]
        total += diff
        print(f"{font:6} {name:14} mean difference {diff:.2f}")
        sheet.paste(crop, (col * 500, y))
    print(f"{font:6} average {total / len(ROWS):.2f}")
shot = None
sheet.save(os.path.join(ROOT, "sheets", "token-check.png"))
