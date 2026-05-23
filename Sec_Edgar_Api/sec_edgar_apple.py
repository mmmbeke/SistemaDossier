import json
import os
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import requests
from dotenv import load_dotenv

from dossier_cli_format import (
    FUENTE_SEC,
    print_analisis_gemini_header,
    print_archivos_generados,
    print_banner,
    print_documento_principal,
    print_documento_principal_aviso,
    print_filing_entry,
    print_gemini_descarga_inicio,
    print_gemini_enviando,
    print_listado_presentaciones_intro,
    print_section_title,
    print_status_api,
    print_varias_coincidencias_intro,
)
from dossier_limits import MAX_RECENT_FILINGS_CLI, data_json_path

USER_AGENT = "CarlosApp/1.0 (fduran@utem.cl)"
MIN_INTERVAL_SECONDS = 0.1
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _recent_filings_slice(recent: dict, limit: int) -> list[dict]:
    """
    Primeros `limit` envíos del bloque filings.recent tal cual orden devuelve la API
    (en la práctica, los más recientes primero).
    """
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    accessions = recent.get("accessionNumber") or []
    out: list[dict] = []
    for form, date, accession in zip(forms, dates, accessions):
        out.append({"form": form, "date": date, "accession": accession})
        if len(out) >= limit:
            break
    return out


def fetch_json(url):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate"
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    time.sleep(MIN_INTERVAL_SECONDS)
    return response.json()


def fetch_bytes(url):
    """Descarga binaria (p. ej. HTML del filing) respetando el User-Agent de la SEC."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
    }
    response = requests.get(url, headers=headers, timeout=120)
    response.raise_for_status()
    time.sleep(MIN_INTERVAL_SECONDS)
    return response.content


def load_company_index():
    data = fetch_json(COMPANY_TICKERS_URL)
    return list(data.values())


def find_companies(query, companies):
    q = query.strip().lower()
    if not q:
        return []

    for c in companies:
        if c["ticker"].lower() == q:
            return [c]

    for c in companies:
        if c["title"].lower() == q:
            return [c]

    return [
        c for c in companies
        if q in c["title"].lower() or q in c["ticker"].lower()
    ]


def pick_company(matches):
    if len(matches) == 1:
        c = matches[0]
        print(
            f"Coincidencia única: {c['title']} "
            f"(ticker: {c['ticker']})"
        )
        return c

    shown = matches[:30]
    print_varias_coincidencias_intro(len(matches), len(shown))
    for i, c in enumerate(shown, start=1):
        print(f"  {i}. [{c['ticker']}] {c['title']}  (CIK {c['cik_str']})")

    while True:
        choice = input(
            f"\nNúmero de la empresa (1-{len(shown)}): "
        ).strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(shown):
                return shown[idx]
        except ValueError:
            pass
        print("Opción inválida, intenta de nuevo.")


def build_index_url(cik, accession):
    cik_clean = str(int(cik))
    accession_clean = accession.replace("-", "")
    return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/index.json"


def build_document_url(cik, accession, document_name):
    cik_clean = str(int(cik))
    accession_clean = accession.replace("-", "")
    return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/{document_name}"


def filing_index_htm_url(cik, accession):
    cik_clean = str(int(cik))
    accession_clean = accession.replace("-", "")
    return (
        f"https://www.sec.gov/Archives/edgar/data/"
        f"{cik_clean}/{accession_clean}/{accession}-index.htm"
    )


def _save_sec_bundle(bundle: dict, path: Path) -> Path:
    path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def _index_directory_items(index_data: dict) -> list[dict]:
    raw = index_data.get("directory", {}).get("item", [])
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, list):
        return raw
    return []


def _is_edgar_index_table(name: str) -> bool:
    """Índice HTML/TXT de la carpeta del filing, no el cuerpo del informe."""
    n = name.lower()
    if n.endswith(("-index.htm", "-index.html")):
        return True
    if "index-headers" in n:
        return True
    return False


def find_main_document(index_data: dict, symbol_hint: str | None = None) -> str | None:
    """
    Nombre del documento principal dentro del filing (Archives).

    Muchos informes usan .htm; Form 4 y otros usan .xml (p. ej. form4.xml) o .txt.
    """
    files = _index_directory_items(index_data)
    hint = (symbol_hint or "").lower()

    def skip_name(name: str) -> bool:
        if not name or not name.strip():
            return True
        if _is_edgar_index_table(name):
            return True
        return False

    # 1) HTML con pista del ticker (p. ej. apple-20241231.htm)
    if hint:
        for file in files:
            name = file.get("name", "")
            if skip_name(name):
                continue
            low = name.lower()
            if low.endswith((".htm", ".html")) and hint in low:
                return name

    # 2) .htm principal (no material de revisión típico R*.htm)
    for file in files:
        name = file.get("name", "")
        if skip_name(name):
            continue
        low = name.lower()
        if low.endswith(".htm") and not name.startswith("R") and "index" not in low:
            return name

    # 3) .html que no sea tabla de índice
    for file in files:
        name = file.get("name", "")
        if skip_name(name):
            continue
        low = name.lower()
        if low.endswith(".html") and "index" not in low:
            return name

    # 4) XML principal (Form 4, ownership, etc.)
    for file in files:
        name = file.get("name", "")
        if skip_name(name):
            continue
        low = name.lower()
        if low.endswith(".xml") and "index" not in low:
            return name

    # 5) Texto plano del envío (p. ej. algunos formularios antiguos)
    for file in files:
        name = file.get("name", "")
        if skip_name(name):
            continue
        low = name.lower()
        if low.endswith(".txt") and "index" not in low:
            return name

    return None


def maybe_analyze_with_gemini(
    *,
    document_url: str,
    document_name: str,
    company_name: str,
    form: str,
    filing_date: str,
    accession: str,
    cik: str,
) -> Path | None:
    """
    Si existe GEMINI_API_KEY (o GOOGLE_API_KEY) en .env, descarga el documento y lo envía a Gemini.
    Desactivar: GEMINI_SKIP_ANALYSIS=1
    """
    load_dotenv(_ROOT / ".env")
    if (os.getenv("GEMINI_SKIP_ANALYSIS") or "").strip() in ("1", "true", "yes"):
        print("\n(Gemini: omitido por GEMINI_SKIP_ANALYSIS.)")
        return None
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        print(
            "\n(Gemini: no hay GEMINI_API_KEY; obtén una clave en Google AI Studio y "
            "añádela al .env para analizar el formulario automáticamente.)"
        )
        return None

    from gemini_analyze import analyze_document_bytes

    print_gemini_descarga_inicio()
    try:
        data = fetch_bytes(document_url)
        prompt = (
            "Eres un analista financiero. Resume en español este envío de la SEC. "
            "Incluye: contexto del documento, puntos clave para inversores o cumplimiento, "
            "riesgos o eventos destacados si los hay, y una conclusión breve que sintetice el "
            "análisis e indique si conviene o no trabajar con la empresa (como contraparte "
            "comercial o contractual), con argumentos concretos; si el documento no alcanza "
            "para decidirlo, dilo explícitamente y qué faltaría saber. "
            f"Metadatos: empresa={company_name}, formulario={form}, fecha={filing_date}, "
            f"accession={accession}, CIK={cik}, archivo={document_name}."
        )
        print_gemini_enviando()
        analysis = analyze_document_bytes(data, document_name, prompt)
        print_analisis_gemini_header()
        print(analysis)

        safe = "".join(c if c.isalnum() else "_" for c in accession.replace("-", ""))[:40]
        out_path = _ROOT / f"sec_gemini_analysis_{safe}.txt"
        out_path.write_text(
            f"URL: {document_url}\n\n{analysis}",
            encoding="utf-8",
        )
        return out_path
    except ImportError as e:
        print(f"\n(Gemini: instala dependencias: pip install -r requirements.txt) {e}")
        return None
    except Exception as e:
        print(f"\n(Gemini: error al analizar — {e})")
        return None


def main():
    try:
        load_dotenv(_ROOT / ".env")
        print_banner(FUENTE_SEC)

        query = input(
            "Nombre de la empresa USA (SEC EDGAR) o ticker (ej: Tesla o TSLA): "
        ).strip()

        if not query:
            print("Debes ingresar un nombre o ticker.")
            return

        companies = load_company_index()
        matches = find_companies(query, companies)
        if not matches:
            print("No se encontró ninguna empresa con ese nombre o ticker.")
            return

        company = pick_company(matches)
        cik = str(company["cik_str"]).zfill(10)

        print_status_api(f"Obteniendo datos — submissions SEC (CIK {cik}).")

        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        data = fetch_json(submissions_url)

        company_name = data.get("name", "N/A")
        recent = data.get("filings", {}).get("recent")
        if not recent:
            print("La respuesta de submissions no incluye filings.recent.")
            return

        recent_filings = _recent_filings_slice(recent, MAX_RECENT_FILINGS_CLI)

        if not recent_filings:
            print("No hay envíos en el bloque «recent» de submissions.")
            return

        print_section_title("Resumen")
        print(f"Término buscado:    {query}")
        print(f"Empresa:            {company_name}")
        print(f"CIK:                {cik}")
        print(
            "Listado API:        "
            f"primeros {len(recent_filings)} de submissions.recent (orden de la API)."
        )

        print_section_title("Presentaciones recientes")
        print_listado_presentaciones_intro(
            len(recent_filings),
            max_mostrar=MAX_RECENT_FILINGS_CLI,
            origen_listado="orden según submissions.recent",
        )

        for i, item in enumerate(recent_filings, start=1):
            idx_url = filing_index_htm_url(cik, item["accession"])
            print_filing_entry(
                i,
                formulario=item["form"],
                fecha=item["date"],
                referencia=item["accession"],
                enlace=idx_url,
            )

        tickers = data.get("tickers") or []
        symbol_hint = tickers[0] if tickers else None

        primary_filing: dict | None = None
        index_data: dict | None = None
        index_url = ""
        document_name: str | None = None

        for item in recent_filings:
            idx_url = build_index_url(cik, item["accession"])
            idx_data = fetch_json(idx_url)
            doc = find_main_document(idx_data, symbol_hint=symbol_hint)
            if doc:
                primary_filing = item
                index_data = idx_data
                index_url = idx_url
                document_name = doc
                break

        if primary_filing is None or index_data is None:
            primary_filing = recent_filings[0]
            index_url = build_index_url(cik, primary_filing["accession"])
            index_data = fetch_json(index_url)
            document_name = find_main_document(
                index_data, symbol_hint=symbol_hint
            )

        if document_name and primary_filing is not recent_filings[0]:
            pos = recent_filings.index(primary_filing) + 1
            print(
                f"\n(Nota: el primer envío del listado no tenía un documento principal "
                f"detectable; se usa el #{pos} — {primary_filing.get('form')} del "
                f"{primary_filing.get('date')} — para URL y análisis.)"
            )

        final_url: str | None = None
        if document_name:
            final_url = build_document_url(
                cik,
                primary_filing["accession"],
                document_name,
            )

        accession_clean = primary_filing["accession"].replace("-", "")
        form_safe = str(primary_filing["form"]).replace("/", "-").replace(" ", "_")
        json_path = data_json_path(
            _ROOT,
            f"sec_edgar_cik{int(cik)}_{primary_filing['date']}_{form_safe}_{accession_clean}.json",
        )
        bundle = {
            "meta": {
                "source": "sec_edgar",
                "query": query,
                "submissions_url": submissions_url,
                "index_json_url": index_url,
                "company_pick": {
                    "ticker": company.get("ticker"),
                    "title": company.get("title"),
                    "cik_str": company.get("cik_str"),
                },
                "recent_filings_listed": recent_filings,
                "primary_filing_used": {
                    "form": primary_filing.get("form"),
                    "date": primary_filing.get("date"),
                    "accession": primary_filing.get("accession"),
                    "rank_in_list": recent_filings.index(primary_filing) + 1,
                },
                "primary_document": (
                    {"name": document_name, "url": final_url}
                    if document_name and final_url
                    else None
                ),
            },
            "submissions": data,
            "filing_index": index_data,
        }
        json_path = _save_sec_bundle(bundle, json_path)

        archivos: list[tuple[str, Path]] = [("Datos JSON (bundle)", json_path)]

        if document_name and final_url:
            print_documento_principal(archivo=document_name, url=final_url)
            gemini_path = maybe_analyze_with_gemini(
                document_url=final_url,
                document_name=document_name,
                company_name=company_name,
                form=primary_filing["form"],
                filing_date=primary_filing["date"],
                accession=primary_filing["accession"],
                cik=cik,
            )
            if gemini_path is not None:
                archivos.append(("Análisis Gemini", gemini_path))
        else:
            print_documento_principal_aviso(
                "No hay documento principal detectable en los envíos revisados; "
                "revisa los enlaces de «Presentaciones recientes»."
            )

        print_archivos_generados(archivos)

    except Exception as e:
        print(f"\nError: {e}")


if __name__ == "__main__":
    main()
