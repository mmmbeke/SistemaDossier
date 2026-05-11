"""
CLI Companies House (Reino Unido): búsqueda por nombre, perfil completo e historial de filings.
Requiere COMPANIES_HOUSE_API_KEY en .env (misma variable que main.py).
"""
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv


SEARCH_URL = "https://api.company-information.service.gov.uk/search/companies"
COMPANY_URL_TEMPLATE = "https://api.company-information.service.gov.uk/company/{number}"
FILING_HISTORY_URL_TEMPLATE = (
    "https://api.company-information.service.gov.uk/company/{number}/filing-history"
)
MAX_ITEMS_SEARCH = 100
MAX_ITEMS_FILINGS = 100


def load_api_key() -> tuple[str, str]:
    load_dotenv()
    key = os.getenv("COMPANIES_HOUSE_API_KEY")
    if not key or not str(key).strip():
        raise SystemExit(
            "Falta COMPANIES_HOUSE_API_KEY. Añádela al archivo .env (como en main.py)."
        )
    return (str(key).strip(), "")


def ch_get(url: str, auth: tuple[str, str], params: dict | None = None) -> dict:
    response = requests.get(url, auth=auth, params=params or {}, timeout=60)
    response.raise_for_status()
    return response.json()


def search_companies(query: str, auth: tuple[str, str]) -> dict:
    return ch_get(
        SEARCH_URL,
        auth,
        params={"q": query, "items_per_page": MAX_ITEMS_SEARCH},
    )


def filter_and_sort_items(items: list[dict], query: str) -> tuple[list[dict], bool]:
    """
    Filtra por subcadena en el título sin distinguir mayúsculas.
    Si no hay coincidencias, devuelve los items de la API sin filtrar (fallback).
    """
    q = query.strip().casefold()
    if not q:
        return items, False
    filtered = [it for it in items if q in (it.get("title") or "").casefold()]
    if filtered:
        items_to_sort = filtered
        strict = True
    else:
        items_to_sort = list(items)
        strict = False

    def sort_key(it: dict) -> tuple[int, int]:
        t = (it.get("title") or "").casefold()
        if t == q:
            rank = 0
        elif t.startswith(q):
            rank = 1
        elif q in t:
            rank = 2
        else:
            rank = 3
        return (rank, len(t))

    return sorted(items_to_sort, key=sort_key), strict


def get_company_profile(company_number: str, auth: tuple[str, str]) -> dict:
    url = COMPANY_URL_TEMPLATE.format(number=company_number)
    return ch_get(url, auth)


def get_filing_history(company_number: str, auth: tuple[str, str]) -> dict:
    url = FILING_HISTORY_URL_TEMPLATE.format(number=company_number)
    return ch_get(
        url,
        auth,
        params={"items_per_page": MAX_ITEMS_FILINGS},
    )


def save_json_file(data: dict, filename: str) -> Path:
    output_path = Path(filename)
    output_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return output_path


def _format_address(addr: dict | None) -> str:
    if not addr:
        return "N/A"
    parts = [
        addr.get("premises"),
        addr.get("address_line_1"),
        addr.get("address_line_2"),
        addr.get("locality"),
        addr.get("region"),
        addr.get("postal_code"),
        addr.get("country"),
    ]
    return ", ".join(p for p in parts if p)


def print_profile_summary(profile: dict) -> None:
    print(f"\nNombre: {profile.get('company_name', 'N/A')}")
    print(f"Número: {profile.get('company_number', 'N/A')}")
    print(f"Estado: {profile.get('company_status', 'N/A')}")
    print(f"Tipo: {profile.get('type', 'N/A')}")
    print(f"Jurisdicción: {profile.get('jurisdiction', 'N/A')}")
    print(f"Constitución: {profile.get('date_of_creation', 'N/A')}")
    print(f"Domicilio social: {_format_address(profile.get('registered_office_address'))}")

    sic = profile.get("sic_codes")
    if sic:
        print("SIC:")
        for code in sic:
            print(f"  - {code}")

    accounts = profile.get("accounts")
    if accounts:
        na = accounts.get("next_accounts") or {}
        la = accounts.get("last_accounts") or {}
        if na.get("due_on"):
            print(f"Cuentas — próximo vencimiento: {na.get('due_on')}")
        if la.get("made_up_to"):
            print(f"Cuentas — último periodo hasta: {la.get('made_up_to')}")

    ch_profile = profile.get("links", {}).get("self")
    if ch_profile:
        web = f"https://find-and-update.company-information.service.gov.uk{ch_profile}"
        print(f"\nFicha en Companies House: {web}")


def print_filing_history_summary(fh: dict, company_number: str) -> None:
    items = fh.get("items") or []
    print(f"\nÚltimas {min(15, len(items))} presentaciones (filing history):\n")
    base_web = (
        f"https://find-and-update.company-information.service.gov.uk/company/{company_number}/filing-history"
    )
    print(f"Historial en web: {base_web}\n")

    for item in items[:15]:
        date = item.get("date", "")
        desc = item.get("description", "")
        ftype = item.get("type", "")
        category = item.get("category", "")
        meta = (item.get("links") or {}).get("document_metadata")
        print(f"  Fecha: {date} | Tipo: {ftype} | Categoría: {category}")
        print(f"  Descripción: {desc}")
        if meta:
            print(f"  Metadatos / documento (API): {meta}")
        print()


def main() -> None:
    nombre = input("Nombre de la empresa (Reino Unido, Companies House): ").strip()
    if not nombre:
        print("No ingresaste ningún nombre.")
        return

    try:
        auth = load_api_key()
        print("\nBuscando en Companies House…")
        data = search_companies(nombre, auth)
        items = data.get("items") or []
        total = data.get("total_results", 0)

        if not items:
            print(f"No hay resultados para «{nombre}». Total API: {total}.")
            return

        matches, strict = filter_and_sort_items(items, nombre)
        max_show = 30
        if len(matches) > max_show:
            print(
                f"Hay {len(matches)} resultados mostrables; se listan {max_show} "
                "(mejor ordenados)."
            )
            matches = matches[:max_show]

        if not strict:
            print(
                "\n(Aviso: ningún resultado contiene tu texto en el título con el mismo criterio; "
                "se muestran los primeros resultados de la API.)"
            )

        selected: dict
        if len(matches) == 1:
            selected = matches[0]
            print(f"\nCoincidencia única: {selected.get('title')} ({selected.get('company_number')})")
        else:
            print("\nVarias coincidencias — elige una:\n")
            for i, m in enumerate(matches, 1):
                print(
                    f"  {i}. {m.get('title')} | {m.get('company_number')} | "
                    f"{m.get('company_status', '')} | {m.get('address_snippet', '')}"
                )
            while True:
                raw = input(f"\nNúmero (1–{len(matches)}): ").strip()
                if not raw.isdigit():
                    print("Escribe un número válido.")
                    continue
                idx = int(raw)
                if 1 <= idx <= len(matches):
                    selected = matches[idx - 1]
                    break
                print("Fuera de rango.")

        company_number = selected.get("company_number")
        if not company_number:
            print("Respuesta sin company_number.")
            return

        print(f"\nObteniendo perfil y filing history para {company_number}…")
        profile = get_company_profile(company_number, auth)
        filing_history = get_filing_history(company_number, auth)

        slug = "".join(c if c.isalnum() else "_" for c in company_number)[:16]
        bundle = {"profile": profile, "filing_history": filing_history}
        out_name = f"company_uk_{slug}.json"
        output_file = save_json_file(bundle, out_name)

        print("Consulta completada correctamente.")
        print(f"Archivo guardado en: {output_file.resolve()}")
        print_profile_summary(profile)
        print_filing_history_summary(filing_history, company_number)

    except requests.HTTPError as e:
        detail = ""
        try:
            detail = e.response.json() if e.response is not None else ""
        except ValueError:
            detail = e.response.text if e.response is not None else ""
        print(f"Error HTTP (Companies House): {e} {detail}")
    except requests.RequestException as e:
        print(f"Error de red: {e}")


if __name__ == "__main__":
    main()
