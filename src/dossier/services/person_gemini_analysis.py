"""Análisis narrativo (Gemini) a partir de JSON de Netrows — prompts OSINT / due diligence."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from dossier.gemini.text_generate import generate_text_with_gemini

_SYSTEM_PROMPT = """Eres un analista de inteligencia experto en OSINT (Open Source Intelligence),
perfilamiento psicológico, análisis de riesgo reputacional y due diligence
de personas. Tu objetivo es generar un informe estructurado, objetivo y
profesional basado en datos públicos disponibles de una persona.

Debes analizar toda la información proporcionada de fuentes como LinkedIn,
Instagram, Facebook, X (Twitter), noticias, registros públicos y cualquier
otra fuente disponible a través de la API Netrows.

---
Límite de evidencia: si un hecho concreto (URL, juicio, sanción, PEP, red social, etc.)
no aparece en el JSON que recibirás en el mensaje de usuario, indícalo explícitamente
como «No consta en los datos de Netrows» en esa subsección. No inventes datos que no
estén respaldados por ese corpus.
Si falta LinkedIn u otra red en el JSON, no interpretes eso como «la persona no tiene
perfil» en la vida real: solo informa la ausencia en el corpus Netrows."""


def _truncate_json(payload: Any, max_chars: int) -> str:
    raw = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(raw) <= max_chars:
        return raw
    return raw[: max_chars - 80] + "\n\n… [JSON truncado por límite de tamaño] …\n"


def _header_line(filters: dict[str, Any]) -> str:
    name = str(filters.get("full_name") or "").strip() or "No indicado"
    company = str(filters.get("company") or "").strip() or "No indicada"
    country = str(filters.get("country") or "").strip() or "No indicado"
    city = str(filters.get("city") or "").strip()
    if city:
        country = f"{country} — {city}" if country != "No indicado" else city
    return f"{name} / {company} / {country}"


def _build_user_prompt(*, filters: dict[str, Any], bundle_json: str) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    cabecera = _header_line(filters)

    return f"""Analiza el siguiente perfil de la persona: {cabecera}

Con la información recopilada por Netrows, genera un informe de inteligencia
completo con las siguientes secciones:

---

## 📋 1. RESUMEN EJECUTIVO
- Nombre completo, alias o apodos detectados
- Edad aproximada y ubicación actual
- Ocupación principal y empresas asociadas
- Resumen general del perfil público en 5 líneas

---

## 🌐 2. PRESENCIA DIGITAL Y REDES SOCIALES
Para cada red social encontrada (LinkedIn, Instagram, Facebook, X/Twitter,
TikTok, YouTube, etc.) detalla:
- URL del perfil
- Fecha de creación estimada o antigüedad
- Nivel de actividad (alto / medio / bajo / inactivo)
- Cantidad de seguidores/conexiones
- Tipo de contenido que publica predominantemente
- Tono general del contenido (positivo, negativo, controversial, neutro)
- ¿Existe coherencia entre los perfiles? ¿Hay inconsistencias?

---

## 💼 3. HISTORIAL PROFESIONAL Y ACADÉMICO
- Cargos actuales y anteriores (fuente: LinkedIn, noticias, registros)
- Empresas con las que ha estado vinculado
- Detectar INCONSISTENCIAS: fechas superpuestas, cargos inflados,
  empresas inexistentes o de dudosa reputación, gaps laborales inexplicables
- Títulos académicos declarados vs. verificables
- Membresías en asociaciones, juntas directivas o consejos

---

## 📰 4. PRESENCIA EN NOTICIAS Y MEDIOS
- Menciones en medios de comunicación (positivas, negativas, neutras)
- Artículos relevantes encontrados (resumen de cada uno)
- ¿Aparece en investigaciones periodísticas, escándalos o controversias?
- Menciones en registros judiciales, sanciones o procesos legales públicos
- Aparición en listas de riesgo (PEPs, sanciones OFAC, listas negras)

---

## 🏛️ 5. PERFIL POLÍTICO E IDEOLÓGICO
- ¿Tiene o ha tenido cargos políticos? ¿Es una PEP (Persona Políticamente Expuesta)?
- Afiliaciones partidarias detectadas (declaradas o inferidas)
- Postura política identificada (progresista, conservadora, populista, etc.)
- Vínculos con partidos, movimientos sociales o figuras políticas
- ¿Publica contenido político? ¿Con qué frecuencia y postura?
- Nivel de activismo o militancia detectado

---

## 🔗 6. RED DE CONTACTOS Y ASOCIACIONES
- Personas clave con las que aparece vinculado públicamente
- Empresas, organizaciones o grupos con los que está asociado
- ¿Alguna asociación representa un riesgo reputacional o legal?
- Vínculos con personas en listas de sanciones o investigadas

---

## ⚠️ 7. ANÁLISIS DE RIESGO
Evalúa los siguientes tipos de riesgo en escala: 🟢 Bajo | 🟡 Medio | 🔴 Alto

| Tipo de Riesgo                  | Nivel | Justificación |
|---------------------------------|-------|---------------|
| Riesgo reputacional             |       |               |
| Riesgo legal/judicial           |       |               |
| Riesgo político                 |       |               |
| Riesgo financiero               |       |               |
| Riesgo de fraude o suplantación |       |               |
| Inconsistencias de identidad    |       |               |
| Riesgo de conflicto de interés  |       |               |

NIVEL DE RIESGO GLOBAL: 🟢 / 🟡 / 🔴
Justificación del nivel global en 3-5 líneas.

---

## 🧠 8. PERFIL PSICOLÓGICO Y DE COMPORTAMIENTO
(Basado exclusivamente en datos públicos y comportamiento digital)
- Rasgos de personalidad predominantes detectados
- Estilo de comunicación (directo, evasivo, confrontacional, diplomático)
- Motivaciones aparentes (reconocimiento, poder, dinero, causas sociales)
- ¿Muestra coherencia entre su discurso público y sus acciones detectadas?
- Manejo de críticas o conflictos en redes sociales

---

## 🤝 9. RECOMENDACIONES PARA RELACIONARSE CON ESTA PERSONA
- Estilo de comunicación recomendado para tratar con ella
- Temas a evitar en una relación profesional o personal
- Señales de alerta a monitorear en el futuro
- ¿Es recomendable establecer una relación comercial, laboral o personal?
- Diligencias adicionales sugeridas antes de avanzar en una relación

---

## 🚩 10. SEÑALES DE ALERTA Y HALLAZGOS CRÍTICOS
Lista puntual de todos los red flags encontrados:
- Inconsistencias detectadas
- Irregularidades en cargos o historial
- Comportamientos inusuales o sospechosos
- Cualquier hallazgo que requiera atención inmediata

---

## 📊 11. SCORECARD FINAL

| Dimensión                    | Puntaje (1-10) |
|------------------------------|----------------|
| Transparencia digital        |                |
| Coherencia de identidad      |                |
| Estabilidad profesional      |                |
| Reputación pública           |                |
| Nivel de confianza sugerido  |                |

PUNTUACIÓN GLOBAL: __ / 10

---

NOTAS FINALES:
- Indica qué fuentes tuvieron mayor peso en el análisis
- Señala qué información NO fue posible verificar
- Indica el nivel de confianza general del informe: Alto / Medio / Bajo
- Fecha del análisis: {fecha}
- Disclaimer: Este análisis se basa únicamente en información pública disponible
  y tiene fines de due diligence. No constituye un informe legal ni judicial.

---

A continuación, el JSON devuelto por Netrows (único corpus de hechos para este informe):

{bundle_json}
"""


def analyze_person_profile_bundle(
    *,
    filters: dict[str, Any],
    profiles: list[dict[str, Any]],
    posts_by_url: dict[str, Any],
) -> str:
    max_chars = int(os.getenv("GEMINI_PERSON_MAX_JSON_CHARS", "120000"))
    bundle = {
        "criterios_de_busqueda": filters,
        "perfiles_netrows": profiles,
        "publicaciones_por_url": posts_by_url or {},
    }
    bundle_json = _truncate_json(bundle, max_chars)
    user_prompt = _build_user_prompt(filters=filters, bundle_json=bundle_json)
    return generate_text_with_gemini(
        user_prompt,
        system_instruction=_SYSTEM_PROMPT,
    )
