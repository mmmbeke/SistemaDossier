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
