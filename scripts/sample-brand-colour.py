#!/usr/bin/env python3
"""
BRAND COLOUR CENSUS — development only. Not part of the build.

Answers one question with counting instead of taste: what colours are actually
in Hi Anzy's own pictures?

    python scripts/sample-brand-colour.py [--path C:/projects/hi-anzy-website]

Phase 8.6 E was briefed to give the Lab "hierarchy, depth, warmth, material
variation ... atmosphere" and to stop reading as bone/black/grey/orange, while
being forbidden to invent a palette. The only non-arbitrary way to settle that
is to read the company's own owned assets, so this decodes every raster file in
`frontend/public/brand` at the pinned commit and counts opaque pixels, binned to
12 levels per channel so near-identical shades merge.

WHAT IT FOUND (eac2282, eighteen files, 176,748 opaque pixels):

    #303030  16.95%  S  0      #C0C0C0  10.28%  S  0
    #D8D8C0  12.26%  S 11      #B4B4B4   7.38%  S  0
    #D8CCB4   7.14%  S 17      #6C6C6C   5.53%  S  0
    #3C3C3C   4.82%  S  0      #545454   4.68%  S  0
    ...
    #182424   1.59%  S 33   ← the ink
    #F09018   0.62%  S 90   ← the brand orange. all of it.

Hi Anzy's imagery is greyscale collage on warm stock. There is no fourth brand
hue to find — the chromatic content is the orange at six tenths of one per cent,
plus the paper and ink grounds showing through the cut-outs.

That is why this phase added a neutral grey axis (--c-halftone-*) and the
company's own paper and ink ladders, and did NOT add a secondary colour: there
was none to add, and inventing one would have been a fabricated brand fact.

REQUIREMENTS
    Pillow. Dev-only and deliberately not in package.json — this is a one-off
    census whose output is already committed as tokens, not something the Lab
    runs, builds or ships. The runtime dependency count stays at five.
"""
import sys
import os
import colorsys
import subprocess
import tempfile
from collections import Counter

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required for this dev-only script: pip install Pillow")

REPO = "C:/projects/hi-anzy-website"
COMMIT = "eac2282"
SUBDIR = "frontend/public/brand"

if "--path" in sys.argv:
    REPO = sys.argv[sys.argv.index("--path") + 1]

if not os.path.isdir(REPO):
    sys.exit(f"canonical repo not present at {REPO} — nothing sampled.")


def git(*args):
    return subprocess.run(
        ["git", "-C", REPO, *args], capture_output=True, check=True
    ).stdout


names = git("ls-tree", "-r", "--name-only", COMMIT, SUBDIR).decode().split("\n")
rasters = [n for n in names if n.strip().lower().endswith((".png", ".jpg", ".jpeg"))]
if not rasters:
    sys.exit(f"no raster assets at {COMMIT}:{SUBDIR}")

agg = Counter()
per_file = []

with tempfile.TemporaryDirectory() as tmp:
    for path in rasters:
        blob = git("show", f"{COMMIT}:{path}")
        local = os.path.join(tmp, os.path.basename(path))
        with open(local, "wb") as fh:
            fh.write(blob)

        im = Image.open(local).convert("RGBA")
        # Thumbnail first: this is a census of the palette, not of the detail,
        # and full-size decoding of eighteen files buys nothing but seconds.
        im.thumbnail((160, 160))

        local_count = Counter()
        for r, g, b, a in im.getdata():
            if a < 200:  # cut-outs are transparent; the hole is not a colour
                continue
            key = (r // 12 * 12, g // 12 * 12, b // 12 * 12)
            local_count[key] += 1
            agg[key] += 1
        per_file.append((os.path.basename(path), local_count))


def line(rgb, n, total):
    r, g, b = rgb
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return f"  #{r:02X}{g:02X}{b:02X}  {100 * n / total:6.2f}%   H{h * 360:5.0f} S{s * 100:3.0f} V{v * 100:3.0f}"


for name, count in per_file:
    total = sum(count.values()) or 1
    print(f"--- {name}  ({total} opaque px)")
    for rgb, n in count.most_common(4):
        print(line(rgb, n, total))

total = sum(agg.values()) or 1
print(f"\n=== AGGREGATE — {len(per_file)} files, {total} opaque px, {COMMIT} ===")
for rgb, n in agg.most_common(24):
    print(line(rgb, n, total))

chromatic = sum(
    n
    for (r, g, b), n in agg.items()
    if colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[1] > 0.4
)
print(f"\nPIXELS ABOVE S40 (i.e. actually coloured): {100 * chromatic / total:.2f}%")
