"""
Límites compartidos entre CLIs (SEC, Companies House) y análisis Gemini.

Objetivo: mismas magnitudes en listados y un tope razonable de subida a Gemini
sin depender solo del .env, para reducir fallos por tokens en HTML muy grandes.
"""
from pathlib import Path

# Cuántas presentaciones recientes se muestran en consola (SEC y UK alineados).
MAX_RECENT_FILINGS_CLI = 10

# Si no defines GEMINI_MAX_UPLOAD_BYTES en .env, gemini_analyze recorta documentos
# mayores que este tamaño (solo se envía el inicio). Aumenta con cuidado (riesgo
# de límite de tokens del modelo). Desactivar recorte: GEMINI_MAX_UPLOAD_BYTES=0
DEFAULT_GEMINI_MAX_UPLOAD_BYTES = 800_000


def data_json_path(project_root: Path, filename: str) -> Path:
    """Ruta bajo ``<proyecto>/data/`` para archivos JSON de consultas (crea la carpeta)."""
    safe = Path(filename).name
    out_dir = project_root / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / safe
