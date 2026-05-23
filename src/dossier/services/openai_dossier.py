"""Generación de dossiers ejecutivos (orquestación + IA).

Por defecto usa **LangGraph** (agentes UK + USA en paralelo) y **Gemini** para la síntesis.
La ruta antigua **solo OpenAI (GPT-3.5)** sigue disponible con ``DOSSIER_LEGACY_OPENAI=1``.
"""

from __future__ import annotations

import os

from dossier.config import load_env


def _legacy_openai_dossier(
    tema_reunion: str,
    participantes: str,
    descripcion: str = "",
) -> str:
    """Ruta histórica: una sola llamada a OpenAI chat completions."""
    from openai import OpenAI

    from dossier.config import load_env as _load

    _load()

    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return (
            "Falta OPENAI_API_KEY en el .env (raíz del proyecto). "
            "Añádela para usar DOSSIER_LEGACY_OPENAI=1."
        )

    client = OpenAI(api_key=key)

    instrucciones = (
        "Eres un asistente de inteligencia de negocios experto. "
        "Tu objetivo es preparar a un ejecutivo para una reunión, "
        "entregando contexto relevante de forma breve y profesional."
    )

    bloque_descripcion = (
        f"\n    DESCRIPCIÓN / CONTEXTO: {descripcion}" if descripcion.strip() else ""
    )

    cuerpo_pedido = f"""
    Prepara un dossier para la siguiente reunión:
    TEMA: {tema_reunion}
    PARTICIPANTES: {participantes}{bloque_descripcion}

    Por favor, entrega:
    1. Un resumen del objetivo.
    2. Contexto sugerido para cada participante.
    3. Tres preguntas clave para liderar la conversación.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": instrucciones},
                {"role": "user", "content": cuerpo_pedido},
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        return f"Error de conexión con OpenAI: {str(e)}"


def generar_dossier_ejecutivo(
    tema_reunion: str,
    participantes: str,
    descripcion: str = "",
):
    """
    Función maestra que redacta el dossier.

    - **Por defecto**: grafo LangGraph (UK + US en paralelo) + síntesis con **Gemini**
      (requiere ``GEMINI_API_KEY``).
    - **Legacy**: exporta ``DOSSIER_LEGACY_OPENAI=1`` y define ``OPENAI_API_KEY`` para
      usar solo GPT-3.5 sin grafo.
    """
    load_env()
    legacy = (os.getenv("DOSSIER_LEGACY_OPENAI") or "").strip().lower()
    if legacy in ("1", "true", "yes", "on"):
        return _legacy_openai_dossier(tema_reunion, participantes, descripcion)

    from dossier.graphs.corporate_dossier_graph import run_corporate_dossier_langgraph

    try:
        return run_corporate_dossier_langgraph(
            tema_reunion, participantes, descripcion
        )
    except Exception as e:
        return f"Error en pipeline LangGraph / Gemini: {e}"
