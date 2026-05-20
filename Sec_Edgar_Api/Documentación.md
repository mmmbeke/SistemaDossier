1. Descripción general
Es una API pública (SEC EDGAR) para consultar información financiera real de empresas que cotizan en Estados Unidos.
La aplicación permite:
consultar empresas por nombre o ticker (índice público de la SEC)
obtener los últimos envíos del bloque «filings.recent» de submissions (orden tal cual devuelve la API, sin filtrar por tipo)
listar hasta 10 presentaciones y abrir el documento HTML principal del primero de esa lista
acceder directamente al documento completo en formato HTML cuando aplique


2. Los tipos de informes son documentos que las empresas deben presentar ante la SEC.
Tipos principales:
10-K → reporte anual
10-Q → reporte trimestral
8-K → eventos importantes
Form 4 → movimientos de ejecutivos
Cada informe contiene información financiera, operativa y legal de la empresa.


3. Funcionamiento del programa
El programa sigue estos pasos:
Entrada del usuario
El usuario ingresa el nombre de la empresa o el ticker (por ejemplo Apple o AAPL). No se pide tipo de formulario: el listado coincide con el inicio del historial «recent» de la API.


4. Obtención del índice del filing
Se construye una URL:
https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION}/index.json
Este archivo contiene todos los documentos asociados al filing.


5. Identificación del documento principal
El programa analiza el índice y busca automáticamente el archivo HTML principal del reporte.


6. Construcción de la URL final
Se genera el enlace directo al documento:
https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION}/{DOCUMENTO}.htm
Este enlace permite visualizar el informe completo en el navegador.


7. Buenas prácticas implementadas
El programa cumple con las reglas de la API:
uso de User-Agent identificable
control de velocidad de solicitudes (sleep)
manejo de errores HTTP


8. Límites compartidos con el CLI UK (dossier_limits.py)
Cantidad de filas listadas en consola: MAX_RECENT_FILINGS_CLI (10).
Análisis Gemini: si no defines GEMINI_MAX_UPLOAD_BYTES en .env, gemini_analyze recorta
archivos grandes con DEFAULT_GEMINI_MAX_UPLOAD_BYTES para evitar fallos por tokens.


9. Archivos JSON de la consulta
El bundle de la consulta se guarda en la carpeta ``data/`` del proyecto (p. ej. ``data/sec_edgar_....json``).