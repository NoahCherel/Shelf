"""Renders the app's own gallery (?w=gallery) from dist, composites Lumabar's captures on the same background,
reports the pixel difference, and writes a side-by-side sheet to _evidence/sheets/token-check.png.
A lower difference means the tokens and font are closer to the original. Run `npm run build` first.
SF Pro is only tried when it's installed on this PC; it is never downloaded or bundled."""
import glob
import os
import subprocess
import time

from PIL import Image, ImageChops, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
ROOT = os.path.join(HERE, "..", "..", "_evidence")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BG = (58, 62, 70, 255)
ROWS = [("claude-usage", 0), ("stripe-chart", 174), ("date", 348)]
PORT = 4173


def sf_installed():
    dirs = [r"C:\Windows\Fonts", os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts")]
    return any(glob.glob(os.path.join(d, "SF*Pro*")) for d in dirs)


def render(font):
    out = os.path.join(ROOT, "sheets", f"token-{font}.png")
    url = f"http://localhost:{PORT}/?w=gallery&t=148" + ("&font=inter" if font == "inter" else "")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                    "--user-data-dir=" + os.path.join(ROOT, "edge-prof"), "--window-size=560,520",
                    "--virtual-time-budget=6000", "--screenshot=" + out, url], timeout=90)
    return Image.open(out).convert("RGB")


def capture(name):
    f = [x for x in glob.glob(os.path.join(ROOT, "assets", name + "-dark-*.webp")) if "-720-" not in x][0]
    im = Image.open(f).convert("RGBA")
    base = Image.new("RGBA", im.size, BG)
    base.alpha_composite(im)
    return base.convert("RGB")


server = subprocess.Popen(f"npx vite preview --port {PORT} --strictPort", cwd=REPO, shell=True,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(4)
try:
    fonts = (["sf"] if sf_installed() else []) + ["inter"]
    sheet = Image.new("RGB", (1500, 540), BG[:3])
    for name, y in ROWS:
        sheet.paste(capture(name), (1000, y))
    for col, font in enumerate(fonts):
        shot = render(font)
        total = 0
        for name, y in ROWS:
            c = capture(name)
            crop = shot.crop((0, y, c.size[0], y + c.size[1]))
            diff = ImageStat.Stat(ImageChops.difference(crop, c).convert("L")).mean[0]
            total += diff
            print(f"{font:6} {name:14} mean difference {diff:.2f}")
            sheet.paste(crop, (col * 500, y))
        print(f"{font:6} average {total / len(ROWS):.2f}")
    sheet.save(os.path.join(ROOT, "sheets", "token-check.png"))
finally:
    subprocess.run(f"taskkill /PID {server.pid} /T /F", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
