import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import create_tables, SessionLocal
from backend.api import auth, mdm, ombor, kassa, ishlab_chiqarish, kontragentlar, savdo, moliya
from backend.services.currency_service import fetch_cbu_rate_today
from backend.models import ExchangeRate
from datetime import date

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("TileERP")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    logger.info("Initializing database tables...")
    create_tables()
    
    # Try syncing daily CBU rate on startup
    try:
        live_rate = await fetch_cbu_rate_today()
        db = SessionLocal()
        today = date.today()
        existing = db.query(ExchangeRate).filter(ExchangeRate.date == today).first()
        if not existing:
            db.add(ExchangeRate(date=today, rate_usd_uzs=live_rate, is_manual_override=False))
            db.commit()
        db.close()
    except Exception as e:
        logger.warning(f"Failed to fetch initial CBU rate: {e}")
        
    yield
    logger.info("Application shutting down...")

app = FastAPI(
    title="Ceramic Tile Factory ERP System",
    description="Kafel ishlab chiqarish zavodi ERP tizimi",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(mdm.router, prefix="/api")
app.include_router(ombor.router, prefix="/api")
app.include_router(kassa.router, prefix="/api")
app.include_router(ishlab_chiqarish.router, prefix="/api")
app.include_router(kontragentlar.router, prefix="/api")
app.include_router(savdo.router, prefix="/api")
app.include_router(moliya.router, prefix="/api")

# Static frontend files mounting
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Ceramic Tile Factory ERP API is running. Visit /docs for Swagger."}

@app.get("/webapp")
def serve_webapp():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Telegram Mini App Endpoint"}
