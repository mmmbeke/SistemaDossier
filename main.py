import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from dotenv import load_dotenv
from fastapi import FastAPI

from dossier.config import PROJECT_ROOT, load_env

load_env()

app = FastAPI(title="Project Dossier API")


def _status(name: str) -> str:
    return "Configurada ✅" if os.getenv(name) else "Faltante ❌"


@app.get("/")
def read_root():
    return {
        "message": "Bienvenido a la API de Project Dossier",
        "status": "Online",
        "project_root": str(PROJECT_ROOT),
        "config_check": {
            "companies_house": _status("COMPANIES_HOUSE_API_KEY"),
            "gemini": _status("GEMINI_API_KEY"),
            "openai": _status("OPENAI_API_KEY"),
            "google_oauth": _status("GOOGLE_CLIENT_ID"),
        },
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.2.0"}
