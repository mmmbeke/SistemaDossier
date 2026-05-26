"""Plantillas de análisis Gemini para documentos regulatorios (Companies House y SEC EDGAR)."""
from __future__ import annotations

# Cuerpo común: informe de riesgo / compliance sobre el documento adjunto.
_SHARED_CORPORATE_DOCUMENT_RISK_INSTRUCTIONS = """
Actúa como un analista senior de riesgo empresarial, compliance, due diligence y evaluación corporativa.

Tu tarea es realizar un análisis exhaustivo de todos los formularios, datos y respuestas obtenidas desde la API proporcionada. Debes interpretar la información de manera estratégica, financiera, operativa y reputacional para elaborar un informe completo sobre la empresa evaluada.

Objetivos del análisis
Identificar claramente:
A qué se dedica la empresa.
Modelo de negocio.
Industria o sector.
Tipo de clientes.
Tamaño estimado de la operación.
Presencia geográfica.
Servicios o productos ofrecidos.
Extraer y resumir información crítica obtenida en los formularios:
Datos legales y societarios.
Información fiscal y tributaria.
Beneficiarios finales / accionistas.
Directivos y representantes.
Información bancaria.
Licencias o permisos.
Actividad económica declarada.
Volumen estimado de operaciones.
Países relacionados.
Historial operativo.
Información de contacto y dominios.
Antigüedad de la empresa.
Indicadores financieros si existen.
Realizar un análisis de coherencia y consistencia:
Detectar inconsistencias entre formularios.
Identificar campos incompletos o sospechosos.
Detectar posibles señales de alerta.
Evaluar si la información parece auténtica, insuficiente o riesgosa.
Señalar contradicciones documentales.
Elaborar un análisis de riesgo integral considerando:
Riesgo financiero.
Riesgo reputacional.
Riesgo regulatorio y compliance.
Riesgo AML / lavado de dinero.
Riesgo operacional.
Riesgo de fraude.
Riesgo geopolítico.
Riesgo comercial.
Riesgo tecnológico o de ciberseguridad (si aplica).
Dependencia excesiva de terceros.
Actividades sensibles o reguladas.
Detectar señales de alerta (Red Flags):
Estructuras societarias complejas.
Uso de paraísos fiscales.
Información incompleta o inconsistente.
Actividades de alto riesgo.
Cambios frecuentes de representantes.
Países sancionados o riesgosos.
Patrones atípicos.
Falta de documentación clave.
Datos falsos o difíciles de verificar.
Riesgos de fraude o suplantación.
Generar un score o clasificación de riesgo:
Bajo.
Medio.
Alto.
Crítico.

Explica detalladamente por qué se asignó dicha clasificación.

Proporcionar recomendaciones accionables:
Si es recomendable relacionarse comercialmente con la empresa.
Qué validaciones adicionales deberían realizarse.
Qué documentación solicitar.
Qué riesgos deben mitigarse.
Qué controles de compliance implementar.
Si se recomienda aprobación, revisión manual o rechazo.
Formato del resultado

Genera el informe con la siguiente estructura:

INFORME DE EVALUACIÓN EMPRESARIAL
1. Resumen Ejecutivo
2. Perfil de la Empresa
3. Información Clave Detectada
4. Análisis de Formularios y Coherencia
5. Evaluación de Riesgos
6. Red Flags Detectadas
7. Score de Riesgo
8. Recomendaciones
9. Conclusión Final
Requisitos adicionales
Usa lenguaje profesional y corporativo.
Prioriza precisión y análisis crítico.
Destaca hallazgos importantes.
Explica el impacto potencial de cada riesgo.
Si falta información, indícalo explícitamente.
No inventes datos.
Diferencia claramente hechos, inferencias y sospechas.
Usa tablas cuando sea útil.
Asigna niveles de severidad a cada hallazgo.
""".strip()


def format_ch_filing_gemini_prompt(
    *,
    company_name: str,
    company_number: str,
    date: str,
    ftype: str,
    category: str,
    description: str,
) -> str:
    """
    Prompt usado al analizar con Gemini el primer documento descargable del historial CH.

    Debe coincidir con la configuración del CLI (`maybe_analyze_ch_filing_with_gemini`).
    """
    scope_footer = f"""
---
Alcance del documento (Companies House)

Estás analizando **un único envío (filing)** de Companies House y sus metadatos de catálogo. Muchos apartados del informe solo podrán completarse si constan en ese documento; si no aplican o no figuran, indica **«no consta en este formulario»** y no rellenes vacíos con suposiciones. No mezcles datos de otros envíos no adjuntos.

Metadatos del envío:
- Empresa: {company_name}
- Número de empresa: {company_number}
- Fecha: {date}
- Tipo de formulario: {ftype}
- Categoría: {category}
- Descripción (catálogo): {description}
""".strip()

    return f"{_SHARED_CORPORATE_DOCUMENT_RISK_INSTRUCTIONS}\n\n{scope_footer}"


def format_sec_filing_gemini_prompt(
    *,
    company_name: str,
    cik: str,
    ticker: str,
    form: str,
    filing_date: str,
    accession: str,
    document_name: str,
) -> str:
    """
    Misma lógica analítica que CH, aplicada a un documento HTML/PDF descargado de un filing SEC.

    Usado por el CLI SEC y por el pipeline corporativo LangGraph (contexto USA).
    """
    tk = (ticker or "").strip() or "(no indicado en metadatos)"
    scope_footer = f"""
---
Alcance del documento (SEC EDGAR)

Estás analizando **un único archivo** correspondiente a un envío público en EDGAR (SEC). Muchos apartados del informe solo podrán completarse si constan en ese documento; si no aplican o no figuran, indica **«no consta en este documento»** y no rellenes vacíos con suposiciones. No mezcles datos de otros accession numbers no adjuntos.

Metadatos del envío:
- Emisor: {company_name}
- CIK: {cik}
- Ticker (referencia): {tk}
- Formulario SEC: {form}
- Fecha de presentación: {filing_date}
- Accession number: {accession}
- Archivo analizado: {document_name}
""".strip()

    return f"{_SHARED_CORPORATE_DOCUMENT_RISK_INSTRUCTIONS}\n\n{scope_footer}"
