"""
Compatibilidad: usa scripts/companies_house.py o python -m desde scripts/.
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT / "scripts"))

import _bootstrap  # noqa: F401

from dossier.companies_house.cli import main

if __name__ == "__main__":
    main()
