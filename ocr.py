# language: Python, file: ocr.py
import io
import re

from PIL import Image, ImageOps, ImageFilter, UnidentifiedImageError
import pytesseract
from pytesseract import TesseractNotFoundError

MONEY_RE = re.compile(r"(\d{1,3}(?:[ \u00a0,]\d{3})*(?:[.,]\d{1,2})?)", re.I)
MAX_IMAGE_SIDE = 2400
OCR_TIMEOUT_SECONDS = 20


def extract_receipt(image_bytes: bytes) -> dict:
    """Extract receipt text while bounding image size and OCR execution time."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            source.load()
            img = ImageOps.exif_transpose(source).convert("L")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("Не удалось открыть изображение. Загрузи JPG, PNG или WebP.") from exc

    # Keep high-resolution phone photos from causing excessive CPU usage.
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    if max(img.size) < 1600:
        scale = min(2, 1600 / max(img.size))
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.Resampling.LANCZOS)
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)

    try:
        text = pytesseract.image_to_string(
            img, lang="rus+ukr+eng", config="--psm 6", timeout=OCR_TIMEOUT_SECONDS
        )
    except TesseractNotFoundError as exc:
        raise RuntimeError("OCR_ENGINE_MISSING") from exc
    except RuntimeError as exc:
        if "timeout" in str(exc).lower():
            raise TimeoutError("OCR_TIMEOUT") from exc
        raise

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    total_label = re.compile(
        r"(?:\btotal\b|\bamount\s+due\b|\bgrand\s+total\b|"
        r"итого|к\s+оплате|сумма\s+к\s+оплате|всього|до\s+сплати|"
        r"сума\s+до\s+сплати|разом|загальна\s+сума)", re.I
    )

    def parse_amounts(lines_to_scan):
        found = []
        for line in lines_to_scan:
            for match in MONEY_RE.finditer(line):
                raw = match.group(1).replace("\u00a0", "").replace(" ", "")
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
    return {"text": text[:2000], "amount_guess": max(amounts) if amounts else 0, "lines": lines[:30]}
