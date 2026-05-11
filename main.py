from fastapi import FastAPI
import os
from dotenv import load_dotenv
from orchestrator import generar_dossier_ejecutivo

# Cargamos las variables del archivo .env
load_dotenv()

app = FastAPI(
    title="Project Dossier API",
    description="Backend para la generación automática de informes de reuniones",
    version="0.1.0"
)

@app.get("/")
def read_root():
    # Mantenemos tu check de seguridad, que está impecable
    openai_status = "Configurada ✅" if os.getenv("OPENAI_API_KEY") else "Faltante ❌"
    google_status = "Configurada ✅" if os.getenv("GOOGLE_CLIENT_ID") else "Faltante ❌"
    
    return {
        "message": "Bienvenido a la API de Project Dossier",
        "status": "Online",
        "config_check": {
            "openai": openai_status,
            "google": google_status
        }
    }

# --- NUEVO ENDPOINT PARA TU PROYECTO ---

@app.get("/generar-dossier")
def api_generar_dossier(tema: str, participantes: str):
    """
    Ruta que conecta con el orquestador para crear el informe con IA.
    """
    # Aquí es donde ocurre la magia
    informe = generar_dossier_reunion(tema, participantes)
    
    return {
        "tema": tema,
        "dossier_generado": informe
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
