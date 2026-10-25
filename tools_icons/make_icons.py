# Generate Kanbi Cards PWA icons to match the in-app brand mark:
# violet rounded square + white card outline with a checkmark (same as .brand__mark svg).
# Run: python make_icons.py
from PIL import Image, ImageDraw
import os

GREEN = False
VIOLET_TOP = (124, 106, 247)   # #7c6af7
VIOLET_BOT = (106, 87, 240)    # #6a57f0
WHITE = (255, 255, 255)

S = 512

def icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # background: full violet square for maskable (OS crops it), rounded for regular
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bgr = ImageDraw.Draw(bg)
    # vertical gradient top -> bottom
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(VIOLET_TOP[i] * (1 - t) + VIOLET_BOT[i] * t) for i in range(3)) + (255,)
        bgr.rectangle([0, y, size, y + 1], fill=c)
    if maskable:
        radius = 0  # full bleed, launcher applies its own mask
    else:
        radius = round(size * 0.24)  # matches .brand__mark (8px radius on 32px ~ 25%)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)

    # graphic scale: keep inside the maskable safe zone (80% diameter grid)
    scale = 0.62 if maskable else 0.715   # card side as fraction of canvas
    card = size * scale
    x0 = (size - card) / 2
    x1 = x0 + card
    y0 = (size - card) / 2
    y1 = y0 + card
    r_card = card * (3.5 / 17.0)          # same 3.5/17 corner ratio as the svg
    stroke = card * (2.0 / 17.0) * 0.9    # svg stroke-width 2 on a 17-unit rect

    # card outline (rounded rect, no fill)
    d.rounded_rectangle([x0, y0, x1, y1], radius=r_card, outline=WHITE, width=round(stroke))

    # checkmark: M8.5 12.5 l3 3 l5 -6  (svg units on a 24-grid, rect 3.5..20.5)
    def px(u):
        # map svg unit u (relative to 3.5..20.5 rect) onto the drawn card
        return x0 + (u - 3.5) / 17.0 * card

    w = round(stroke * 0.95)
    ym = lambda v: y0 + (v - 3.5) / 17.0 * card
    p1 = (px(8.5), ym(12.5))
    p2 = (px(11.5), ym(15.5))
    p3 = (px(16.5), ym(9.5))
    # polyline with round joints and round caps
    d.line([p1, p2, p3], fill=WHITE, width=w, joint='curve')
    rr = w / 2
    for p in (p1, p2, p3):
        d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=WHITE)

    return img

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
i512 = icon(S)
i512.save(os.path.join(out_dir, 'icons', 'icon-512.png'))
i512.resize((192, 192), Image.LANCZOS).save(os.path.join(out_dir, 'icons', 'icon-192.png'))
icon(S, maskable=True).save(os.path.join(out_dir, 'icons', 'icon-512-maskable.png'))
print('icons written')
