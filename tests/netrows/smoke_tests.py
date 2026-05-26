#!/usr/bin/env python3
"""
Pruebas manuales contra Netrows (no pytest; ejecutar desde la raíz del repo).

Ejemplos (PowerShell, desde la raíz SistemaDossier):

  python tests/netrows/smoke_tests.py locations --keyword "Madrid"
  python tests/netrows/smoke_tests.py people --keyword-title "Engineer" --geo "Spain" --start 0
  python tests/netrows/smoke_tests.py companies --keyword "software" --locations 105646813 --sizes C --no-jobs --page 1

  # Nombre + país → búsqueda + ficha detallada (/people/profile) y opcionalmente posts
  python tests/netrows/smoke_tests.py person --name "María García López" --country "Spain"

Requiere `NETROWS_API_KEY` en `.env` o en el entorno.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Raíz del repositorio (…/SistemaDossier)
_REPO_ROOT = Path(__file__).resolve().parents[2]

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]

_NETROWS_DIR = Path(__file__).resolve().parent
if str(_NETROWS_DIR) not in sys.path:
    sys.path.insert(0, str(_NETROWS_DIR))

from netrows_client import NetrowsClient, NetrowsApiError
from person_lookup import extract_profile_urls, split_person_name


def _load_env() -> None:
    env_file = _REPO_ROOT / ".env"
    if load_dotenv is not None and env_file.is_file():
        load_dotenv(env_file)


def _print_json(data: object, limit: int = 12000) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False)[:limit])


def cmd_person(ns: argparse.Namespace) -> int:
    """
    Búsqueda por nombre + país y, si el JSON incluye URLs de perfil, descarga ficha completa.
    """
    client = NetrowsClient()
    first, last, single_kw = split_person_name(ns.name)
    name_stripped = ns.name.strip()
    max_collect = max(16, ns.max_profiles * 4)

    # Netrows puede devolver cuerpo "vacío" como 404 NOT_FOUND; el cliente lo normaliza.
    attempts: list[tuple[str, dict[str, object]]] = [
        (
            "firstName + lastName + geo",
            {
                "firstName": first,
                "lastName": last,
                "keywords": single_kw,
                "geo": ns.country,
                "start": ns.start,
            },
        ),
    ]
    if first and last:
        attempts.append(
            (
                "keywords (nombre completo) + geo",
                {"keywords": name_stripped, "geo": ns.country, "start": 0},
            ),
        )
        attempts.append(
            (
                "firstName + lastName (sin geo)",
                {"firstName": first, "lastName": last, "start": ns.start},
            ),
        )
    attempts.append(
        ("keywords (nombre completo) sin geo", {"keywords": name_stripped, "start": 0}),
    )

    seen_urls: list[str] = []
    seen_set: set[str] = set()
    trace: list[dict[str, object]] = []

    for label, params in attempts:
        data = client.get("/people/search", params)
        trace.append({"strategy": label, "params": params, "response": data})
        for u in extract_profile_urls(data, max_urls=max_collect):
            if u not in seen_set:
                seen_set.add(u)
                seen_urls.append(u)
        if len(seen_urls) >= max_collect:
            break

    search = {"_strategies_tried": [t["strategy"] for t in trace], "attempts": trace}
    urls = seen_urls

    print("========== BÚSQUEDA (/people/search) ==========\n")
    _print_json(search, limit=ns.search_limit)

    urls = urls[: ns.max_profiles]
    if not urls:
        print(
            "\n(No se encontraron enlaces de perfil en ninguna estrategia de búsqueda. "
            "Prueba otro nombre, país (`geo` como en la doc. de Netrows), o el subcomando "
            "`people` con filtros adicionales.)",
            file=sys.stderr,
        )
        return 0

    for i, url in enumerate(urls, start=1):
        print(f"\n========== PERFIL {i}: /people/profile ==========\nURL: {url}\n")
        try:
            profile = client.get("/people/profile", {"url": url})
            _print_json(profile, limit=ns.profile_limit)
        except NetrowsApiError as e:
            print(f"Error perfil: {e}", file=sys.stderr)

        if ns.include_posts:
            print(f"\n---------- Posts recientes ({url}) ----------\n")
            try:
                posts = client.get("/people/posts", {"url": url, "limit": ns.posts_limit})
                _print_json(posts, limit=ns.profile_limit)
            except NetrowsApiError as e:
                print(f"Error posts: {e}", file=sys.stderr)

    return 0


def cmd_locations(ns: argparse.Namespace) -> int:
    client = NetrowsClient()
    data = client.get("/locations/search", {"keyword": ns.keyword})
    _print_json(data)
    return 0


def cmd_people(ns: argparse.Namespace) -> int:
    client = NetrowsClient()
    params = {
        "firstName": ns.first_name,
        "lastName": ns.last_name,
        "keywords": ns.keywords,
        "keywordTitle": ns.keyword_title,
        "company": ns.company,
        "geo": ns.geo,
        "keywordSchool": ns.keyword_school,
        "schoolId": ns.school_id,
        "start": ns.start,
    }
    data = client.get("/people/search", params)
    _print_json(data)
    return 0


def cmd_companies(ns: argparse.Namespace) -> int:
    client = NetrowsClient()
    params = {
        "keyword": ns.keyword,
        "locations": ns.locations,
        "companySizes": ns.sizes,
        "hasJobs": "true" if ns.has_jobs else "false",
        "industries": ns.industries,
        "page": ns.page,
    }
    data = client.get("/companies/search", params)
    _print_json(data)
    return 0


def cmd_jobs(ns: argparse.Namespace) -> int:
    client = NetrowsClient()
    params = {
        "keywords": ns.keywords,
        "locationId": ns.location_id,
        "onsiteRemote": ns.onsite_remote,
        "jobType": ns.job_type,
        "experienceLevel": ns.experience_level,
        "start": ns.start,
    }
    data = client.get("/jobs/search", params)
    _print_json(data)
    return 0


def main() -> int:
    _load_env()
    parser = argparse.ArgumentParser(description="Smoke tests Netrows API")
    parser.add_argument(
        "--base-url",
        default=None,
        help="Sobreescribe NETROWS_API_URL (por defecto https://www.netrows.com/api/v1)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_loc = sub.add_parser("locations", help="GET /locations/search")
    p_loc.add_argument("--keyword", required=True, help="Ej. Madrid, Remote, United States")
    p_loc.set_defaults(func=cmd_locations)

    p_peo = sub.add_parser("people", help="GET /people/search")
    p_peo.add_argument("--first-name", dest="first_name", default=None)
    p_peo.add_argument("--last-name", dest="last_name", default=None)
    p_peo.add_argument("--keywords", default=None)
    p_peo.add_argument("--keyword-title", dest="keyword_title", default=None)
    p_peo.add_argument("--company", default=None)
    p_peo.add_argument("--geo", default=None)
    p_peo.add_argument("--keyword-school", dest="keyword_school", default=None)
    p_peo.add_argument("--school-id", dest="school_id", default=None)
    p_peo.add_argument("--start", type=int, default=0)
    p_peo.set_defaults(func=cmd_people)

    p_co = sub.add_parser("companies", help="GET /companies/search (todos los filtros obligatorios en la API)")
    p_co.add_argument("--keyword", required=True)
    p_co.add_argument(
        "--locations",
        required=True,
        help="ID de ubicación (ej. España 105646813; usa `locations` para buscar)",
    )
    p_co.add_argument("--sizes", required=True, help="Códigos A–H (ej. C = 51-200 empleados)")
    p_co.add_argument(
        "--has-jobs",
        dest="has_jobs",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="true = solo empresas con ofertas; false = todas",
    )
    p_co.add_argument(
        "--industries",
        default="",
        help='IDs de industria separados o cadena vacía ""',
    )
    p_co.add_argument("--page", type=int, default=1)
    p_co.set_defaults(func=cmd_companies)

    p_job = sub.add_parser("jobs", help="GET /jobs/search")
    p_job.add_argument("--keywords", default=None)
    p_job.add_argument("--location-id", dest="location_id", default=None)
    p_job.add_argument(
        "--onsite-remote",
        dest="onsite_remote",
        choices=("onsite", "remote", "hybrid"),
        default=None,
    )
    p_job.add_argument(
        "--job-type",
        dest="job_type",
        choices=("full-time", "part-time", "contract", "temporary", "internship", "volunteer"),
        default=None,
    )
    p_job.add_argument(
        "--experience-level",
        dest="experience_level",
        choices=("internship", "entry", "associate", "mid-senior", "director", "executive"),
        default=None,
    )
    p_job.add_argument("--start", type=int, default=0)
    p_job.set_defaults(func=cmd_jobs)

    p_per = sub.add_parser(
        "person",
        help="Nombre + país: /people/search y, si hay URLs, /people/profile (y opc. /people/posts)",
    )
    p_per.add_argument("--name", required=True, help="Nombre completo (ej. María García López)")
    p_per.add_argument(
        "--country",
        required=True,
        help='País o geo para el filtro `geo` de Netrows (ej. "Spain", "ES")',
    )
    p_per.add_argument("--start", type=int, default=0, help="Offset de búsqueda (/people/search)")
    p_per.add_argument(
        "--max-profiles",
        dest="max_profiles",
        type=int,
        default=3,
        help="Máximo de perfiles a enriquecer con /people/profile",
    )
    p_per.add_argument(
        "--include-posts",
        dest="include_posts",
        action="store_true",
        help="Tras cada perfil, llama GET /people/posts",
    )
    p_per.add_argument("--posts-limit", dest="posts_limit", type=int, default=10)
    p_per.add_argument(
        "--search-limit",
        dest="search_limit",
        type=int,
        default=12000,
        help="Caracteres máx. al imprimir el JSON de búsqueda",
    )
    p_per.add_argument(
        "--profile-limit",
        dest="profile_limit",
        type=int,
        default=12000,
        help="Caracteres máx. al imprimir perfil/posts",
    )
    p_per.set_defaults(func=cmd_person)

    ns = parser.parse_args()
    try:
        if ns.base_url:
            # Reinyectar vía env para que NetrowsClient lo lea
            import os as _os

            _os.environ["NETROWS_API_URL"] = ns.base_url
        return int(ns.func(ns))
    except NetrowsApiError as e:
        print(e, file=sys.stderr)
        return 1
    except ValueError as e:
        print(e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
