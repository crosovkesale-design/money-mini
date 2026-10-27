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

    # Prefer amounts printed on the receipt's final-total line over item prices.
    total_label = re.compile(
        r"(?:\btotal\b|\bamount\s+due\b|\bgrand\s+total\b|"
        r"итого|к\s+оплате|сумма\s+к\s+оплате|всього|до\s+сплати|"
        r"сума\s+до\s+сплати|разом|загальна\s+сума)",
        re.I,
    )

    def parse_amounts(lines_to_scan):
        found = []
        for line in lines_to_scan:
            for match in MONEY_RE.finditer(line):
                raw = match.group(1).replace("\u00a0", "").replace(" ", "")
                # Interpret the last separator as decimal only when it has 1–2 digits after it.
                if "," in raw and "." in raw:
                    decimal_sep = "," if raw.rfind(",") > raw.rfind(".") else "."
                    thousands_sep = "." if decimal_sep == "," else ","
                    raw = raw.replace(thousands_sep, "").replace(decimal_sep, ".")
                elif "," in raw or "." in raw:
                    sep = "," if "," in raw else "."
                    tail = raw.rsplit(sep, 1)[-1]
                    if len(tail) in (1, 2):
                        raw = raw.replace(sep, ".") if raw.count(sep) == 1 else raw.replace(sep, "")
                    else:
                        raw = raw.replace(sep, "")
                try:
                    value = float(raw)
                    if 0 < value < 1_000_000:
                        found.append(value)
                except ValueError:
                    continue
        return found

    total_lines = [line for line in lines if total_label.search(line)]
    amounts = parse_amounts(total_lines) if total_lines else []
    if not amounts:
        amounts = parse_amounts(lines)
    amount_guess = max(amounts) if amounts else 0

    return {"text": text[:2000], "amount_guess": amount_guess, "lines": lines[:30]}
