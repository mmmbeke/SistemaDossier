"""
Formato unificado de salida en consola para los CLIs SEC EDGAR y Companies House (UK).
"""
from __future__ import annotations

from pathlib import Path

FUENTE_SEC = "SEC EDGAR (USA)"
FUENTE_UK = "COMPANIES HOUSE (UK)"


def print_banner(fuente: str) -> None:
    print(f"=== CONSULTA {fuente} ===")


def print_section_title(titulo: str) -> None:
    print(f"\n=== {titulo} ===")


def print_filing_entry(
    indice: int,
    *,
    formulario: str,
    fecha: str,
    referencia: str,
    enlace: str,
) -> None:
    print(f"--- {indice} ---")
    print(f"Formulario: {formulario}")
    print(f"Fecha:      {fecha}")
    print(f"Referencia: {referencia}")
    print(f"Enlace:     {enlace}")
    print()


def print_documento_principal(*, archivo: str, url: str) -> None:
    print_section_title("Documento principal")
    print(f"Archivo: {archivo}")
    print(f"URL:     {url}")


def print_analisis_gemini_header() -> None:
    print("\n=== Análisis Gemini ===\n")


def print_archivos_generados(items: list[tuple[str, Path]]) -> None:
    if not items:
        return
    print_section_title("Archivos generados")
    for etiqueta, p in items:
        try:
            resuelto = p.resolve()
        except OSError:
            resuelto = p
        print(f"- {etiqueta}: {resuelto}")


def print_status_api(texto: str) -> None:
    """Línea de progreso antes de llamadas a la API (mismo estilo en SEC y UK)."""
    print(f"\n{texto}")


def print_listado_presentaciones_intro(
    cantidad: int, *, max_mostrar: int, origen_listado: str
) -> None:
    print(
        f"Últimos {cantidad} registros listados "
        f"(máx. {max_mostrar} mostrados; {origen_listado}).\n"
    )


def print_gemini_descarga_inicio() -> None:
    print("\nDescargando documento para análisis con Gemini…")


def print_gemini_enviando() -> None:
    print("Enviando a Gemini (puede tardar en archivos grandes)…")


def print_documento_principal_aviso(texto: str) -> None:
    """Cuando no hay URL/archivo principal detectable (mismo bloque en SEC y UK)."""
    print_section_title("Documento principal")
    print(texto)


def print_varias_coincidencias_intro(n_total: int, n_listadas: int) -> None:
    print(f"\nVarias coincidencias ({n_total} en total; mostrando {n_listadas}). Elige una:\n")
