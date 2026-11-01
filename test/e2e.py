"""End-to-end check of the viewer in an iPad-sized touch browser."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3111"
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
W, H, PW, PH = 1180, 820, 1024, 768
S = min(W / PW, H / PH)
OX, OY = round((W - round(PW * S)) / 2), round((H - round(PH * S)) / 2)

def pt(x, y):  # PDF coords -> screen
    return OX + x * S, OY + (PH - y) * S

def pixel(page, x, y):
    sx, sy = pt(x, y)
    return page.evaluate("""([sx, sy, ox, oy]) => {
      const c = document.querySelector('.slide canvas');
      const k = c.width / c.getBoundingClientRect().width;
      return Array.from(c.getContext('2d').getImageData((sx-ox)*k, (sy-oy)*k, 1, 1).data.slice(0,3));
    }""", [sx, sy, OX, OY])

def page_no(page):
    return page.evaluate("location.hash")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: m.type in ("error",) and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/p/indesign-like")
    page.wait_for_selector("#start:not([hidden])", timeout=15000)
    page.click("#go-window")
    tap = lambda x, y: (page.touchscreen.tap(*pt(x, y)), page.wait_for_timeout(600))
    results = []
    def check(name, cond): results.append((name, bool(cond)))

    popup_center = (630, 350)
    check("popup hidden initially", pixel(page, *popup_center)[0] < 60)
    page.screenshot(path=f"{OUT}/1-start.png")
    tap(190, 335)  # "Arata detalii" (JavaScript show)
    check("popup shown after JS show button", pixel(page, *popup_center)[0] > 180)
    page.screenshot(path=f"{OUT}/2-popup.png")
    tap(630, 350)  # tap popup -> /Hide itself
    check("popup hidden after tapping it", pixel(page, *popup_center)[0] < 60)
    tap(190, 180)  # Link -> named dest capitol3
    check("link to named destination -> page 3", page_no(page) == "#3")
    tap(160, 335)  # Afiseaza: /Hide H=false on parent field + chained JS
    check("chained show (parent field) visible", pixel(page, 510, 375)[1] > 100)
    check("chained show (2nd action) visible", pixel(page, 820, 450)[1] > 100)
    page.screenshot(path=f"{OUT}/3-chain.png")
    tap(820, 450)  # Inchide: hides both
    check("close hides both", pixel(page, 510, 375)[1] < 60 and pixel(page, 820, 450)[1] < 60)
    tap(905, 75)  # Ultima: JS pageNum = 3
    check("JS pageNum -> page 4", page_no(page) == "#4")
    tap(905, 75)  # FirstPage
    check("FirstPage -> page 1", page_no(page) == "#1")
    tap(905, 75)  # NextPage via /AA /U
    check("NextPage -> page 2", page_no(page) == "#2")
    tap(125, 75)  # PrevPage
    check("PrevPage -> page 1", page_no(page) == "#1")
    # swipe
    page.evaluate("""() => {
      const st = document.getElementById('stage');
      const ev = (t, x) => st.dispatchEvent(new PointerEvent(t, {pointerId: 9, clientX: x, clientY: 400, bubbles: true, pointerType: 'touch'}));
      ev('pointerdown', 900); ev('pointermove', 700); ev('pointermove', 500); ev('pointerup', 400);
    }""")
    page.wait_for_timeout(700)
    check("swipe left -> page 2", page_no(page) == "#2")
    # menu via long press
    sx, sy = pt(500, 600)
    page.evaluate("""([x,y]) => document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', {pointerId: 3, clientX: x, clientY: y, bubbles: true, pointerType: 'touch'}))""", [sx, sy])
    page.wait_for_timeout(900)
    check("long press opens menu", page.is_visible("#menu"))
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/4-menu.png")
    page.evaluate("""([x,y]) => document.getElementById('stage').dispatchEvent(new PointerEvent('pointerup', {pointerId: 3, clientX: x, clientY: y, bubbles: true, pointerType: 'touch'}))""", [sx, sy])
    page.click(".thumb[data-n='3']")
    page.wait_for_timeout(700)
    check("menu thumbnail -> page 4", page_no(page) == "#4")
    page.wait_for_timeout(3000)
    check("offline cache ready", "offline" in page.inner_text("#m-offline"))

    for n, ok in results:
        print(("PASS " if ok else "FAIL ") + n)
    print("console errors:", errors)
    b.close()
