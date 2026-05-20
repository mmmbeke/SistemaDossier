"""Generación de dossiers con OpenAI (lazy client)."""

from __future__ import annotations

import os

from openai import OpenAI

_client: OpenAI | None = None


def _get_openai_client() -> OpenAI:
    """Cliente singleton; solo exige clave cuando se va a llamar a la API."""
    global _client
    if _client is not None:
        return _client

    from dossier.config import load_env

    load_env()

    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise ValueError(
            "Falta OPENAI_API_KEY en el .env (raíz del proyecto). "
            "Añádela para generar dossiers con OpenAI."
        )
    _client = OpenAI(api_key=key)
    return _client


def generar_dossier_ejecutivo(
    tema_reunion: str,
    participantes: str,
    descripcion: str = "",
):
    """
    Función maestra que redacta el dossier.
    En el futuro, aquí conectaremos la lógica de SEC / Companies House.
    """
    try:
        client = _get_openai_client()
    except ValueError as e:
        return str(e)

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
        return response.choices[0].message.content
    except Exception as e:
        return f"Error de conexión con OpenAI: {str(e)}"
