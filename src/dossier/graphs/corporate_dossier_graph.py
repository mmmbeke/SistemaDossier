"""
Grafo LangGraph — dossier corporativo (UK + USA en paralelo → síntesis Gemini).

Qué es LangGraph (resumen explícito)
-------------------------------------
- Defines un **estado** compartido (un ``TypedDict``): todos los nodos leen y escriben
  campos de ese diccionario.
- Defines **nodos**: funciones ``def nodo(state) -> dict`` que solo devuelven los
  campos que quieren actualizar (merge parcial).
- Defines **aristas**: quién va después de quién. Si varios nodos arrancan desde
  ``START``, pueden ejecutarse **en paralelo** en el mismo “superpaso”. Si una arista
  tiene varios orígenes ``[ "a", "b" ], destino``, LangGraph **espera a que terminen
  todos** antes de ejecutar ``destino`` (fan-in / unión).

Este archivo implementa el patrón del PDF v2.0 de forma reducida:
  ``Agent_Corporate_UK`` y ``Agent_Corporate_USA`` → ``síntesis`` (Gemini).

Los nodos UK/US hoy devuelven **contexto estructurado de marcador de posición**:
las llamadas HTTP reales a Companies House / SEC pueden engancharse ahí sin cambiar
el resto del grafo.
"""
from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


class CorporateDossierState(TypedDict, total=False):
    """Estado que circula por el grafo (campos opcionales salvo los de entrada)."""

    # Entrada (obligatorios al invocar)
    tema_reunion: str
    participantes: str
    descripcion: str

    # Salida de cada “agente” corporativo
    uk_corporate_context: str
    us_corporate_context: str

    # Salida final
    final_dossier_markdown: str

    # Errores no fatales de agentes (la síntesis puede seguir con lo disponible)
    agent_errors: list[str]


def _node_agent_corporate_uk(state: CorporateDossierState) -> dict[str, Any]:
    """
    Agente UK (Companies House).

    Aquí solo generamos texto estructurado de apoyo. Sustituir el cuerpo por
    llamadas a tu cliente HTTP / SDK de Companies House usando ``participantes``
    y/o empresa deducida.
    """
    tema = state.get("tema_reunion", "").strip()
    participantes = state.get("participantes", "").strip()
    descripcion = (state.get("descripcion") or "").strip()

    bloque = f"""## Contexto corporativo — Reino Unido (Companies House)

Este bloque lo produce el nodo **agent_corporate_uk** del grafo LangGraph.

**Qué haría la integración real**
- Resolver empresa / número de empresa (company number) a partir de los participantes o tema.
- Consultar Companies House API: perfil de empresa, officers, filing history, insolvency flags.

**Entrada actual (texto libre de la reunión)**
- Tema: {tema or "(vacío)"}
- Participantes: {participantes or "(vacío)"}
- Descripción: {descripcion or "(ninguna)"}

*(Marcador de posición hasta conectar API y parseo de entidades.)*
"""
    logger.info("LangGraph nodo agent_corporate_uk completado")
    return {"uk_corporate_context": bloque}


def _node_agent_corporate_usa(state: CorporateDossierState) -> dict[str, Any]:
    """
    Agente USA (SEC EDGAR + eventual OpenCorporates).

    Igual que UK: hoy contexto marcador; sustituir por cliente SEC / tickers / CIK.
    """
    tema = state.get("tema_reunion", "").strip()
    participantes = state.get("participantes", "").strip()
    descripcion = (state.get("descripcion") or "").strip()

    bloque = f"""## Contexto corporativo — Estados Unidos (SEC EDGAR)

Este bloque lo produce el nodo **agent_corporate_usa** del grafo LangGraph.

**Qué haría la integración real**
- Resolver emisor (ticker / CIK) y últimos filings 10-K, 10-Q, 8-K vía SEC EDGAR.
- Opcional: OpenCorporates para entidad registrada en un estado US.

**Entrada actual**
- Tema: {tema or "(vacío)"}
- Participantes: {participantes or "(vacío)"}
- Descripción: {descripcion or "(ninguna)"}

*(Marcador de posición hasta conectar API y parseo de entidades.)*
"""
    logger.info("LangGraph nodo agent_corporate_usa completado")
    return {"us_corporate_context": bloque}


def _node_synthesize_gemini(state: CorporateDossierState) -> dict[str, Any]:
    """
    Nodo de síntesis: lee ``uk_corporate_context`` + ``us_corporate_context`` y pide
    a Gemini un informe ejecutivo en Markdown.
    """
    from dossier.gemini.text_generate import generate_text_with_gemini

    tema = state.get("tema_reunion", "").strip()
    participantes = state.get("participantes", "").strip()
    descripcion = (state.get("descripcion") or "").strip()
    uk = state.get("uk_corporate_context", "").strip()
    us = state.get("us_corporate_context", "").strip()

    system = (
        "Eres un analista de inteligencia corporativa. Redactas informes claros, "
        "en español, en Markdown, sin inventar hechos que no aparezcan en el contexto. "
        "Si el contexto es solo orientativo o incompleto, dilo explícitamente."
    )

    user = f"""Reunión a preparar:
**Tema:** {tema}
**Participantes / empresas (texto libre):** {participantes}
**Descripción adicional:** {descripcion or "(ninguna)"}

---
### Contexto UK (Companies House — puede ser parcial o marcador de posición)

{uk}

---
### Contexto USA (SEC / corporativo — puede ser parcial o marcador de posición)

{us}

---
### Tu entrega

1. Resumen ejecutivo (5–8 líneas).
2. Riesgos o vacíos de información (si el contexto no basta para afirmar hechos).
3. Preguntas sugeridas para la reunión (3–5 bullets).
"""

    try:
        texto = generate_text_with_gemini(user, system_instruction=system)
    except Exception as e:
        logger.exception("Fallo síntesis Gemini en LangGraph")
        err = f"Gemini síntesis: {e}"
        return {
            "final_dossier_markdown": f"# Error en síntesis\n\n{err}",
            "agent_errors": state.get("agent_errors", []) + [err],
        }

    return {"final_dossier_markdown": texto}


def build_corporate_dossier_graph() -> StateGraph:
    """
    Construye el ``StateGraph`` sin compilar.

    Topología::

        START ─┬─► agent_corporate_uk ─┐
               └─► agent_corporate_usa ─┼─► synthesize_gemini ─► END
                     (paralelo)        │
                      add_edge([uk,us], synth) espera ambos
    """
    graph = StateGraph(CorporateDossierState)
    graph.add_node("agent_corporate_uk", _node_agent_corporate_uk)
    graph.add_node("agent_corporate_usa", _node_agent_corporate_usa)
    graph.add_node("synthesize_gemini", _node_synthesize_gemini)

    graph.add_edge(START, "agent_corporate_uk")
    graph.add_edge(START, "agent_corporate_usa")
    graph.add_edge(["agent_corporate_uk", "agent_corporate_usa"], "synthesize_gemini")
    graph.add_edge("synthesize_gemini", END)
    return graph


def run_corporate_dossier_langgraph(
    tema_reunion: str,
    participantes: str,
    descripcion: str = "",
) -> str:
    """
    Punto de entrada: compila (cache interno de LangGraph), invoca y devuelve Markdown.
    """
    app = build_corporate_dossier_graph().compile()
    result = app.invoke(
        {
            "tema_reunion": tema_reunion,
            "participantes": participantes,
            "descripcion": descripcion or "",
            "agent_errors": [],
        }
    )
    return str(result.get("final_dossier_markdown") or "").strip()
