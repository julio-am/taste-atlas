"""Regenerate installer icons from the same geometry as public/favicon.svg.

Requires Pillow: python3 -m pip install Pillow
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
output = root / "assets"
output.mkdir(exist_ok=True)
size = 1024
scale = size / 64
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=16 * scale, fill="#101a33")
points = [(13, 18), (51, 18), (51, 26), (36, 26), (36, 51), (27, 51), (27, 26), (13, 26)]
draw.polygon([(int(x * scale), int(y * scale)) for x, y in points], fill="#ffffff")
draw.ellipse((41 * scale, 40 * scale, 53 * scale, 52 * scale), fill="#f2a865")
image.save(output / "icon.png")
image.save(output / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.save(output / "icon.icns")
