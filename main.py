from fastapi import FastAPI
import os
from dotenv import load_dotenv

# Cargamos las variables del archivo .env
load_dotenv()

app = FastAPI(title="Project Dossier API")

@app.get("/")
def read_root():
    # Verificamos si las llaves cargaron (sin mostrar la clave completa por seguridad)
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

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}