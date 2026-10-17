#!/usr/bin/env python3
"""
Builds the damage-type dice materials (7b) for dice-box, our own work.

Each theme folder (packages/app/public/dice-box/assets/themes/tc-<type>) holds:
- diffuse-light.png / diffuse-dark.png: dice-box's default number layout (MIT,
  same folder's LICENSE) with a surface pattern painted *under* the numbers.
  dice-box's colour material mixes the die's tint with this texture by its
  alpha, so a partly transparent pattern shows over the tint while the
  numbers (fully opaque) stay exactly as they were: readable.
- normal.jpg: the default normal map (the engraved numbers) with the pattern's
  relief added.
- specular.jpg: how shiny the surface is.
- theme.config.json: no mesh file (dice-box then uses the default dice shapes).

One generator per pattern, all from the same few building blocks (noise,
cells, lines, rings), so the set reads as one family. Seeded: the output is
the same every run. Run: python3 scripts/build-dice-themes.py
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "packages", "app", "public", "dice-box", "assets", "themes")
SRC = os.path.join(ROOT, "default")
N = 1024  # diffuse size (the number atlas)
M = 512   # normal and specular size


def load_rgba(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGBA")).astype(np.float32) / 255.0


BASE_LIGHT = load_rgba("diffuse-light.png")
BASE_DARK = load_rgba("diffuse-dark.png")
BASE_NORMAL = np.asarray(Image.open(os.path.join(SRC, "normal.png")).convert("RGB")).astype(np.float32) / 255.0


# --- building blocks ---------------------------------------------------------

def rng(seed):
    return np.random.default_rng(seed)


def smooth_noise(size, cells, seed):
    """Value noise: random values on a coarse grid, smoothly upscaled."""
    g = rng(seed).random((cells, cells)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255.0


def fbm(size, seed, octaves=5, base=6):
    out = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += amp * smooth_noise(size, base * 2 ** o, seed + o)
        total += amp
        amp *= 0.5
    return out / total


def cells(size, n, seed):
    """Distance to the nearest and second-nearest of n random points (Voronoi), wrapping."""
    pts = rng(seed).random((n, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d1 = np.full((size, size), 1e9, np.float32)
    d2 = np.full((size, size), 1e9, np.float32)
    for px, py in pts:
        dx = np.abs(xx - px); dx = np.minimum(dx, size - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, size - dy)
        d = np.sqrt(dx * dx + dy * dy)
        d2 = np.where(d < d1, d1, np.minimum(d2, d))
        d1 = np.minimum(d1, d)
    return d1, d2


def branches(size, seed, count=14, steps=260):
    """Branching bright lines (lightning): random walks that fork."""
    r = rng(seed)
    img = Image.new("L", (size, size), 0)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(img)
    stack = [(r.random() * size, r.random() * size, r.random() * 6.28, steps, 4) for _ in range(count)]
    while stack:
        x, y, a, n, w = stack.pop()
        for _ in range(int(n)):
            a += r.normal(0, 0.45)
            nx, ny = x + np.cos(a) * 4, y + np.sin(a) * 4
            dr.line([(x, y), (nx, ny)], fill=255, width=max(1, int(w)))
            x, y = nx % size, ny % size
            if r.random() < 0.02 and w > 1:
                stack.append((x, y, a + r.choice([-0.9, 0.9]), n * 0.4, w - 1))
    from PIL import ImageFilter
    glow = img.filter(ImageFilter.GaussianBlur(3))
    a = np.asarray(img).astype(np.float32) / 255.0
    g = np.asarray(glow).astype(np.float32) / 255.0
    return np.clip(a + g * 1.5, 0, 1)


def resize(a, size):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)).astype(np.float32) / 255.0


# --- one pattern per damage type: (colour layer RGB, alpha), relief (0..1), shine --------

def pattern(kind, size):
    """Returns (rgb HxWx3, alpha HxW, height HxW at size M) for a pattern."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    if kind == "acid":  # corrosive bubbles with bright rims
        d1, _ = cells(size, 140, 11)
        rad = 9 + 10 * smooth_noise(size, 12, 12)
        ring = np.clip(1 - np.abs(d1 - rad) / 2.2, 0, 1)
        inside = (d1 < rad).astype(np.float32)
        rgb = np.dstack([np.full_like(yy, 0.85), np.full_like(yy, 1.0), np.full_like(yy, 0.45)])
        return rgb, ring * 0.55 + inside * 0.08, resize(inside * 0.6 + ring * 0.4, M)
    if kind == "bludgeoning":  # granite: flecks and grain
        n = fbm(size, 21, 6, 16)
        fleck = (rng(22).random((size, size)) > 0.985).astype(np.float32)
        tone = np.where(n > 0.5, 0.9, 0.15)
        rgb = np.dstack([tone, tone * 0.95, tone * 0.88])
        return rgb, np.clip(np.abs(n - 0.5) * 0.7 + fleck * 0.5, 0, 0.45), resize(fbm(M, 23, 6, 12), M)
    if kind == "cold":  # frost: crackle lines and frosted specks
        d1, d2 = cells(size, 90, 31)
        edge = np.clip(1 - (d2 - d1) / 3.0, 0, 1)
        frost = (fbm(size, 32, 5, 24) > 0.62).astype(np.float32) * 0.35
        rgb = np.dstack([np.full_like(yy, 0.92), np.full_like(yy, 0.97), np.ones_like(yy)])
        return rgb, np.clip(edge * 0.75 + frost, 0, 0.8), resize(1 - edge, M)
    if kind == "fire":  # molten cracks glowing through an ember skin
        d1, d2 = cells(size, 70, 41)
        crack = np.clip(1 - (d2 - d1) / 5.0, 0, 1)
        heat = fbm(size, 42, 4, 8)
        rgb = np.dstack([np.ones_like(yy), 0.45 + 0.5 * crack, 0.05 + 0.3 * crack * crack])
        return rgb, np.clip(crack * 0.9 + (heat - 0.5) * 0.25, 0, 0.9), resize(1 - crack, M)
    if kind == "force":  # arcane hex grid
        s = 26.0 / size
        q = (xx * 2 / 3) / s
        r_ = (-xx / 3 + np.sqrt(3) / 3 * yy) / s
        cube = np.stack([q, r_, -q - r_])
        rc = np.round(cube)
        diff = np.abs(rc - cube)
        edge = np.clip(1 - np.max(diff, axis=0) * 6 + 2.4, 0, 1)
        line = np.clip((np.max(diff, axis=0) - 0.42) * 12, 0, 1)
        rgb = np.dstack([np.full_like(yy, 0.85), np.full_like(yy, 0.8), np.ones_like(yy)])
        return rgb, line * 0.6, resize(1 - line * 0.5, M)
    if kind == "lightning":  # branching arcs
        b = branches(size, 51)
        rgb = np.dstack([np.full_like(yy, 1.0), np.full_like(yy, 0.96), 0.55 + 0.45 * b])
        return rgb, np.clip(b * 0.85, 0, 0.85), resize(1 - b * 0.4, M)
    if kind == "necrotic":  # spectral smoke on a blackened skin
        n = fbm(size, 61, 6, 5)
        wisp = np.clip((n - 0.55) * 4, 0, 1)
        rgb = np.dstack([0.45 * wisp, 0.3 * wisp, 0.55 * wisp + 0.05])
        return rgb, np.clip(0.25 + wisp * 0.45, 0, 0.6), resize(fbm(M, 62, 4, 6) * 0.4, M)
    if kind == "piercing":  # crystalline shards: faceted cells with bright ridges
        d1, d2 = cells(size, 55, 71)
        facet = (d1 / (d2 + 1e-3))
        ridge = np.clip(1 - (d2 - d1) / 2.0, 0, 1)
        rgb = np.dstack([np.full_like(yy, 0.95)] * 3)
        return rgb, np.clip(ridge * 0.55 + facet * 0.12, 0, 0.6), resize(facet, M)
    if kind == "poison":  # luminous toxic droplets
        d1, _ = cells(size, 110, 81)
        rad = 5 + 9 * smooth_noise(size, 10, 82)
        drop = np.clip(1 - d1 / rad, 0, 1) ** 0.6
        rgb = np.dstack([0.55 + 0.3 * drop, np.ones_like(yy), 0.2 + 0.3 * drop])
        return rgb, np.clip(drop * 0.65, 0, 0.65), resize(drop * 0.7, M)
    if kind == "psychic":  # dreamlike swirls and ripples
        n = fbm(size, 91, 4, 4)
        wave = 0.5 + 0.5 * np.sin((xx * 9 + yy * 5 + n * 6) * 6.283)
        band = np.clip((wave - 0.75) * 4, 0, 1)
        rgb = np.dstack([np.full_like(yy, 1.0), 0.65 + 0.3 * n, np.full_like(yy, 1.0)])
        return rgb, band * 0.45, resize(wave * 0.5, M)
    if kind == "radiant":  # pearlescent sheen
        n = fbm(size, 101, 4, 3)
        sheen = 0.5 + 0.5 * np.sin((yy * 3 + n * 2) * 6.283)
        rgb = np.dstack([np.ones_like(yy), 0.92 + 0.08 * sheen, 0.7 + 0.3 * sheen])
        return rgb, 0.12 + sheen * 0.3, resize(n * 0.2, M)
    if kind == "slashing":  # polished, brushed steel with bright streaks
        r = rng(111)
        streak = np.repeat(r.random((size, 1)).astype(np.float32), size, axis=1)
        streak = resize(streak, size)
        hi = np.clip((streak - 0.8) * 5, 0, 1)
        rgb = np.dstack([np.full_like(yy, 0.97)] * 3)
        return rgb, np.clip(0.08 + streak * 0.12 + hi * 0.45, 0, 0.6), resize(streak * 0.5, M)
    if kind == "thunder":  # resonant rings
        d1, _ = cells(size, 18, 121)
        rings = 0.5 + 0.5 * np.cos(d1 / 9.0 * 6.283)
        ring = np.clip((rings - 0.72) * 4, 0, 1) * np.clip(1 - d1 / 160, 0, 1)
        rgb = np.dstack([np.full_like(yy, 0.9), np.full_like(yy, 0.88), np.ones_like(yy)])
        return rgb, ring * 0.5, resize(rings * 0.5, M)
    raise ValueError(kind)


# Shine per type: (specular level 0..1 grey, specularPower, bumpLevel)
SHINE = {
    "acid": (0.85, 1.0, 0.6), "bludgeoning": (0.25, 0.6, 0.9), "cold": (0.95, 1.2, 0.6), "fire": (0.55, 0.9, 0.7),
    "force": (0.7, 1.0, 0.4), "lightning": (0.7, 1.0, 0.4), "necrotic": (0.15, 0.5, 0.5), "piercing": (0.95, 1.4, 0.7),
    "poison": (0.7, 1.0, 0.5), "psychic": (0.6, 0.9, 0.35), "radiant": (0.95, 1.2, 0.3), "slashing": (1.0, 1.5, 0.35),
    "thunder": (0.5, 0.8, 0.6),
}


# Around every number the pattern fades out: a ring of plain tint keeps the digits readable whatever the pattern.
def _halo():
    from PIL import ImageFilter
    a = Image.fromarray((BASE_LIGHT[..., 3] * 255).astype(np.uint8))
    h = np.asarray(a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255.0
    return np.clip(h * 2.5, 0, 1)


HALO = _halo()
MAX_PATTERN = 0.5  # never stronger than this, so the tint (and the type's colour) still leads


def compose(base, rgb, alpha):
    """The pattern under the numbers: where the default texture is clear (no number), the pattern shows by its alpha."""
    alpha = np.minimum(alpha, MAX_PATTERN) * (1 - HALO)
    num_a = base[..., 3:4]
    out_rgb = base[..., :3] * num_a + rgb * (1 - num_a)
    out_a = np.maximum(num_a[..., 0], alpha * (1 - num_a[..., 0]))
    return np.dstack([out_rgb, out_a])


def normal_from_height(h, strength):
    gy, gx = np.gradient(h)
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / l, ny / l, nz / l])


def save_png(a, path, colors=None):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    if colors:
        im = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)


def build(kind):
    folder = os.path.join(ROOT, f"tc-{kind}")
    os.makedirs(folder, exist_ok=True)
    rgb, alpha, height = pattern(kind, N)
    save_png(compose(BASE_LIGHT, rgb, alpha), os.path.join(folder, "diffuse-light.png"), colors=128)
    save_png(compose(BASE_DARK, rgb * 0.35, alpha), os.path.join(folder, "diffuse-dark.png"), colors=128)
    # Normals: the engraved numbers (default) plus the pattern's relief.
    base_n = BASE_NORMAL * 2 - 1
    pat_n = normal_from_height(height, 6.0)
    n = base_n + np.dstack([pat_n[..., 0], pat_n[..., 1], np.zeros_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    # JPEG keeps the relief well at a fraction of a PNG's size.
    Image.fromarray((np.clip(n * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)).save(os.path.join(folder, "normal.jpg"), quality=85)
    old = os.path.join(folder, "normal.png")
    if os.path.exists(old):
        os.remove(old)
    level, power, bump = SHINE[kind]
    spec = np.clip(level * (0.75 + 0.25 * height), 0, 1)
    Image.fromarray((spec * 255).astype(np.uint8)).convert("RGB").save(os.path.join(folder, "specular.jpg"), quality=80)
    cfg = {
        "name": f"{kind.capitalize()} (Table Companion)",
        "systemName": f"tc-{kind}",
        "author": "Table Companion (numbers and dice shapes: dice-box default theme, MIT)",
        "version": 1,
        "material": {
            "type": "color",
            "diffuseTexture": {"light": "diffuse-light.png", "dark": "diffuse-dark.png"},
            "diffuseLevel": 1,
            "bumpTexture": "normal.jpg",
            "bumpLevel": bump,
            "specularTexture": "specular.jpg",
            "specularPower": power,
        },
        "diceAvailable": ["d4", "d6", "d8", "d10", "d12", "d20", "d100"],
    }
    with open(os.path.join(folder, "theme.config.json"), "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    sizes = {name: os.path.getsize(os.path.join(folder, name)) for name in os.listdir(folder)}
    print(f"tc-{kind}: {sum(sizes.values()) // 1024} KB", {k: v // 1024 for k, v in sizes.items()})


if __name__ == "__main__":
    for kind in SHINE:
        build(kind)
