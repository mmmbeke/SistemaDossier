# LangGraph en Project Dossier (guía explícita)

Este documento explica **qué es LangGraph** en este repo y **dónde tocar** si quieres conectar APIs reales (Companies House, SEC).

## ¿Qué problema resuelve?

Antes, `generar_dossier_ejecutivo` era **un solo paso**: un prompt a OpenAI. Eso no modela:

- varias fuentes de datos (**UK** y **USA**) que pueden fallar o tardar por separado;
- ejecutar fuentes **en paralelo**;
- unir resultados y **sintetizar** con otro modelo (aquí: **Gemini**).

**LangGraph** describe un **flujo con estado**: nodos que leen/escriben un diccionario compartido y aristas que definen el orden (y el paralelismo).

## Archivos relevantes

| Archivo | Rol |
|--------|-----|
| `src/dossier/graphs/corporate_dossier_graph.py` | Define el **estado**, los **nodos** (agentes + síntesis), el **grafo** y `run_corporate_dossier_langgraph`. |
| `src/dossier/gemini/text_generate.py` | Llamada de **texto** a Gemini (sin subir PDF/HTML). |
| `src/dossier/services/openai_dossier.py` | Punto de entrada `generar_dossier_ejecutivo`: por defecto LangGraph+Gemini; opcional legacy OpenAI. |

## Topología del grafo (dibujo mental)

1. Desde `START` salen **dos aristas** a la vez:
   - nodo `agent_corporate_uk`
   - nodo `agent_corporate_usa`  
   → se ejecutan **en paralelo** (mismo superpaso).

2. La arista  
   `add_edge(["agent_corporate_uk", "agent_corporate_usa"], "synthesize_gemini")`  
   significa: **no ejecutes la síntesis hasta que los dos hayan terminado** (fan-in).

3. `synthesize_gemini` lee el estado, llama a Gemini y escribe `final_dossier_markdown`.

4. `END` termina la ejecución.

## Estado (`CorporateDossierState`)

Campos típicos:

- **Entrada**: `tema_reunion`, `participantes`, `descripcion`
- **Salidas de agentes**: `uk_corporate_context`, `us_corporate_context`
- **Salida final**: `final_dossier_markdown`
- **Errores**: `agent_errors` (lista; la síntesis puede añadir entradas si Gemini falla)

Cada nodo devuelve solo un **fragmento** del estado; LangGraph los **fusiona** con el estado anterior.

## Cómo enganchar Companies House y SEC

1. Edita `_node_agent_corporate_uk` en `corporate_dossier_graph.py`:
   - Sustituye el texto “marcador de posición” por llamadas a tu cliente HTTP (o reutiliza lógica de `dossier/companies_house/cli.py` extrayendo funciones reutilizables).
   - Si la API falla, puedes devolver `{"uk_corporate_context": "...", "agent_errors": state.get("agent_errors", []) + ["UK: ..."]}`.

2. Igual para `_node_agent_corporate_usa` con SEC / OpenCorporates.

3. **No hace falta cambiar** el nodo `synthesize_gemini` si sigues alimentando los mismos campos de texto; Gemini seguirá uniendo los bloques.

## Variables de entorno

- **Obligatoria (ruta por defecto)**: `GEMINI_API_KEY` (o `GOOGLE_API_KEY`).
- **Modelo**: `GEMINI_MODEL` (por defecto coherente con `dossier/gemini/analyze.py`).
- **Timeout texto**: `GEMINI_TEXT_TIMEOUT_MS` (por defecto 120000).
- **Legacy solo OpenAI**: `DOSSIER_LEGACY_OPENAI=1` + `OPENAI_API_KEY`.

## Paquete `dossier` y la carpeta `src/`

El código importable vive en **`src/dossier`**. `python main.py` ya inserta `src` en `sys.path`, así que la API resuelve los imports bien. Si en el futuro añades otro script en la raíz que importe `dossier`, haz como en `scripts/seed_test_data.py` (añadir `src` al path) o define `PYTHONPATH=src` en ese proceso.
## Ampliaciones típicas (siguiente iteración)

- **Checkpoint / memoria**: `MemorySaver` de LangGraph para conversaciones multi-turno (no usado aún).
- **Streaming**: `graph.compile().stream(...)` para enviar progreso al frontend (WebSockets).
- **Más agentes**: añadir nodo `agent_news` y otro fan-in `["uk","us","news"], "synthesize_gemini"` o una cadena distinta según producto.
