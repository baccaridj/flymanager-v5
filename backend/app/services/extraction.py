from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path


CLASSIFICATION_RULES = [
    ("xml_import", lambda text: "<venda" in text.lower()),
    ("eticket", lambda text: bool(re.search(r"\b[A-Z0-9]{6}\b", text)) and bool(re.search(r"\b\d{10,15}\b", text)) and bool(re.search(r"\bADT\s*[-:]", text, re.I))),
    ("pix", lambda text: "pix" in text.lower() and ("comprovante" in text.lower() or "chave" in text.lower())),
    ("extrato", lambda text: "extrato" in text.lower() or "saldo" in text.lower()),
    ("fatura", lambda text: "fatura" in text.lower() or re.search(r"\bNF\b", text, re.I)),
    ("voucher", lambda text: "voucher" in text.lower() or "hotel" in text.lower()),
    ("cotacao", lambda text: "cotacao" in text.lower() or "cotação" in text.lower() or "opcao" in text.lower() or "opção" in text.lower()),
    ("passaporte", lambda text: "passaporte" in text.lower()),
    ("contrato", lambda text: "contrato" in text.lower()),
]


def read_file_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".csv", ".xml", ".ofx"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pdf":
        try:
            import fitz

            with fitz.open(path) as pdf:
                return "\n".join(page.get_text() for page in pdf)
        except Exception:
            return ""
    return ""


def classify(text: str) -> str:
    for label, predicate in CLASSIFICATION_RULES:
        if predicate(text):
            return label
    return "other"


def money_to_float(raw: str) -> float:
    clean = re.sub(r"[^\d,.-]", "", raw).replace(".", "").replace(",", ".")
    try:
        return float(clean)
    except ValueError:
        return 0


def extract(text: str, classification: str) -> dict:
    data = {
        "passenger": first_match(r"\b(?:ADT|CNN|CHD)\s*[-:]\s*([A-ZÀ-Ú '/-]{3,}?)(?=\s+(?:LOC|LOCALIZADOR|TICKET|BILHETE|\d{10,15}|[A-Z0-9]{6}\b)|[\n\r]|$)", text, re.I),
        "locator": first_match(r"\b([A-Z0-9]{6})\b", text),
        "ticket": first_match(r"\b(\d{10,15})\b", text),
        "airline": first_match(r"\b([A-Z0-9]{2})\s?\d{3,4}[A-Z]?\b", text),
        "flights": re.findall(r"\b[A-Z0-9]{2}\s?\d{3,4}[A-Z]?\b", text),
        "routes": re.findall(r"\b[A-Z]{3}\s*[-/]\s*[A-Z]{3}\b", text),
        "dates": re.findall(r"\b(?:\d{2}/\d{2}/\d{4}|\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{2}[A-Z]{3}|\d{2}\s+[A-Z]{3}\s+\d{4})\b", text, re.I),
        "values": [money_to_float(value) for value in re.findall(r"(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}", text)],
        "pix_key": first_match(r"(?:PIX|CHAVE PIX)[:\s-]*([^\n\r]+)", text, re.I),
    }
    if classification == "xml_import":
        data["xml_sales"] = extract_xml_sales(text)
    return {key: value for key, value in data.items() if value not in ("", [], None)}


def first_match(pattern: str, text: str, flags: int = 0) -> str:
    match = re.search(pattern, text, flags)
    return match.group(1).strip() if match else ""


def extract_xml_sales(text: str) -> list[dict]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []

    sales = []
    for venda in root.findall(".//venda"):
        item = {child.tag: (child.text or "") for child in venda}
        sales.append(item)
    return sales
