# language: Python, file: ocr.py
import io, re
from PIL import Image, ImageOps, ImageFilter
import pytesseract

MONEY_RE = re.compile(r"(\d{1,3}(?:[ \u00a0,]\d{3})*(?:[.,]\d{1,2})?)", re.I)


def extract_receipt(image_bytes: bytes) -> dict:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)

    text = pytesseract.image_to_string(img, lang="rus+ukr+eng", config="--psm 6")
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    amounts = []
    for l in lines:
        for m in MONEY_RE.finditer(l):
            try:
                v = float(m.group(1).replace("\u00a0", "").replace(" ", "").replace(",", "."))
                if 0 < v < 1_000_000:
                    amounts.append(v)
            except ValueError:
                pass

    return {"text": text[:2000], "amount_guess": max(amounts) if amounts else 0, "lines": lines[:30]}
