# Sistema Dossier

Consultas a registros corporativos (Reino Unido y EE. UU.) y análisis opcional de documentos con **Google Gemini**.

## Estructura del proyecto

```
SistemaDossier/
├── main.py                 # API FastAPI (uvicorn main:app)
├── requirements.txt
├── .env                    # Claves (no se sube a git; ver .env.example)
├── src/
│   └── dossier/
│       ├── config.py       # Rutas, .env, carpeta data/
│       ├── gemini/         # Análisis con Gemini
│       ├── companies_house/  # CLI UK
│       └── sec_edgar/      # CLI USA (SEC)
├── scripts/
│   ├── companies_house.py
│   └── sec_edgar.py
├── data/                   # JSON y análisis generados
└── docs/
    └── sec_edgar.md
```

Las carpetas `Company_house_API/` y `Sec_Edgar_Api/` conservan scripts de **compatibilidad** que redirigen al código en `src/dossier/`.

## Configuración

```powershell
cd SistemaDossier
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edita .env con tus claves
```

## Uso (CLI)

**Companies House (UK):**

```powershell
python scripts/companies_house.py
```

**SEC EDGAR (USA):**

```powershell
python scripts/sec_edgar.py
```

**API web:**

```powershell
uvicorn main:app --reload
```

Los resultados (JSON y textos de Gemini) se guardan en **`data/`**.

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `COMPANIES_HOUSE_API_KEY` | API Companies House (Basic Auth) |
| `GEMINI_API_KEY` | Análisis automático de documentos |
| `GEMINI_MODEL` | Modelo (por defecto `gemini-2.5-flash`) |
| `GEMINI_MAX_UPLOAD_BYTES` | Recorta HTML/PDF grandes antes de enviar a Gemini |
| `GEMINI_SKIP_ANALYSIS` | `1` para desactivar análisis Gemini |
