"""Lógica de negocio compartida (Graph, OpenAI, etc.)."""

from dossier.services.graph_calendar import listar_reuniones, obtener_reunion_por_id
from dossier.services.openai_dossier import generar_dossier_ejecutivo

__all__ = [
    "generar_dossier_ejecutivo",
    "listar_reuniones",
    "obtener_reunion_por_id",
]
