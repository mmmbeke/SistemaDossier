1. Descripción general
Es una API pública (SEC EDGAR) para consultar información financiera real de empresas que cotizan en Estados Unidos.
La aplicación permite:
consultar empresas mediante su CIK
obtener sus filings (formularios oficiales)
filtrar por tipo de informe (10-K, 10-Q, 8-K, etc.)
acceder directamente al documento completo en formato HTML


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
El usuario ingresa:
CIK de la empresa
tipo de formulario (ej: 10-K)


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