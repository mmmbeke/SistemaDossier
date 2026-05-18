# SEC EDGAR

## Descripción general

API pública (SEC EDGAR) para consultar información financiera de empresas que cotizan en Estados Unidos.

La aplicación permite:

- Buscar empresas por nombre o ticker (CIK)
- Obtener filings (formularios oficiales)
- Filtrar por tipo (10-K, 10-Q, 8-K, etc.)
- Acceder al documento principal en HTML
- Análisis opcional con Gemini (`GEMINI_API_KEY`)

## Tipos de informes

| Formulario | Descripción |
|------------|-------------|
| 10-K | Reporte anual |
| 10-Q | Reporte trimestral |
| 8-K | Eventos importantes |
| Form 4 | Movimientos de ejecutivos |

## Flujo del programa

1. Entrada: nombre/ticker y tipo de formulario.
2. Submissions: `https://data.sec.gov/submissions/CIK{cik}.json`
3. Índice del filing: `.../Archives/edgar/data/{CIK}/{ACCESSION}/index.json`
4. Documento principal: HTML detectado en el índice.
5. URL final: `.../{DOCUMENTO}.htm`

## Buenas prácticas SEC

- `User-Agent` identificable (email en el código)
- Pausa entre peticiones (`sleep`)
- Manejo de errores HTTP

## Ejecución

```powershell
python scripts/sec_edgar.py
```
