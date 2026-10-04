import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Never commit the token: set TELEGRAM_BOT_TOKEN in .env or the host environment.
# Without it the web app still runs; only the Telegram bot does not start.
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tile_erp")
SQLITE_FALLBACK_URL = f"sqlite:///{BASE_DIR / 'tile_erp.db'}"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

CBU_API_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/"
DEFAULT_USD_UZS_RATE = float(os.getenv("DEFAULT_USD_UZS_RATE", "12800.0"))
