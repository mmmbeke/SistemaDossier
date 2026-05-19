"""Compatibilidad: use dossier.gemini.analyze."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from dossier.gemini.analyze import analyze_document_bytes  # noqa: F401

__all__ = ["analyze_document_bytes"]
