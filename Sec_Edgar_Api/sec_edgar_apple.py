import requests
import time

USER_AGENT = "CarlosApp/1.0 (fduran@utem.cl)"
MIN_INTERVAL_SECONDS = 0.1


def fetch_json(url):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate"
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    time.sleep(MIN_INTERVAL_SECONDS)
    return response.json()


def build_index_url(cik, accession):
    cik_clean = str(int(cik))
    accession_clean = accession.replace("-", "")
    return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/index.json"


def build_document_url(cik, accession, document_name):
    cik_clean = str(int(cik))
    accession_clean = accession.replace("-", "")
    return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/{document_name}"


def find_main_document(index_data, symbol_hint=None):
    files = index_data.get("directory", {}).get("item", [])
    hint = (symbol_hint or "").lower()

    if hint:
        for file in files:
            name = file.get("name", "")
            if name.endswith(".htm") and hint in name.lower():
                return name

    for file in files:
        name = file.get("name", "")
        if name.endswith(".htm") and not name.startswith("R") and "index" not in name.lower():
            return name

    return None


def main():
    try:
        print("=== CONSULTA SEC EDGAR ===")

        cik_raw = input("Ingresa el CIK de la empresa (ej: 0000320193 para Apple): ").strip()
        cik = str(int(cik_raw)).zfill(10)
        target_form = input("Ingresa el tipo de formulario (10-K, 10-Q, 8-K, etc): ").upper()

        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"

        data = fetch_json(submissions_url)

        company_name = data.get("name", "N/A")
        recent = data["filings"]["recent"]

        forms = recent["form"]
        dates = recent["filingDate"]
        accessions = recent["accessionNumber"]

        print(f"\nEmpresa: {company_name}")
        print(f"Buscando formulario: {target_form}\n")

        selected = None

        for form, date, accession in zip(forms, dates, accessions):
            if form == target_form:
                selected = {
                    "form": form,
                    "date": date,
                    "accession": accession
                }
                break

        if not selected:
            print("No se encontró ese formulario.")
            return

        index_url = build_index_url(cik, selected["accession"])
        index_data = fetch_json(index_url)

        tickers = data.get("tickers") or []
        symbol_hint = tickers[0] if tickers else None
        document_name = find_main_document(index_data, symbol_hint=symbol_hint)

        if not document_name:
            print("No se encontró el documento principal.")
            return

        final_url = build_document_url(
            cik,
            selected["accession"],
            document_name
        )

        print("=== RESULTADO ===")
        print(f"Formulario: {selected['form']}")
        print(f"Fecha: {selected['date']}")
        print(f"Archivo: {document_name}")
        print("\nURL FINAL:")
        print(final_url)

    except Exception as e:
        print("Error:", e)


if __name__ == "__main__":
    main()
