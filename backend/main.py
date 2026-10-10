import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend import database
from backend.database import create_tables, SessionLocal
from backend.auth_utils import decode_token
from backend.api import auth, mdm, ombor, kassa, ishlab_chiqarish, kontragentlar, savdo, moliya, ish_haqi, sklad, buyurtmalar, tarix, xarajatlar, auto_sarf, demo, telegram_bot_api
from backend.services.currency_service import fetch_cbu_rate_today
from backend.models import ExchangeRate, AuditLog
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

    # Orders taken before clients were tied to Kontragentlar: link them.
    try:
        from backend.services.counterparty_service import link_order_clients
        db = SessionLocal()
        try:
            linked = link_order_clients(db)
            if linked:
                logger.info(f"Linked {linked} orders to Kontragent clients")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Linking order clients skipped: {e}")

    # The Telegram bot runs through a webhook on Vercel: make sure Telegram
    # sends its updates to this (production) site.
    try:
        from backend.services.telegram_webhook import ensure_webhook_on_startup
        await ensure_webhook_on_startup()
    except Exception as e:
        logger.warning(f"Telegram webhook check skipped: {e}")

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

# Who did what: every successful change through the API is written to the
# audit log with the user from the (signed) login token.
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
NOT_AUDITED = ("/api/auth/login", "/api/auth/verify-otp", "/api/orders/preview", "/api/sklad/preview",
               "/api/telegram/webhook")

@app.middleware("http")
async def audit_changes(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if (request.method in AUDITED_METHODS and path.startswith("/api/")
            and not path.startswith(NOT_AUDITED) and response.status_code < 400):
        token = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
        data = decode_token(token) or {}
        parts = path.split("/")
        try:
            db = database.SessionLocal()
            db.add(AuditLog(
                username=data.get("u"),
                action=request.method,
                module=parts[2] if len(parts) > 2 else "",
                entity_id=next((p for p in reversed(parts) if p.isdigit()), None),
                details=path,
            ))
            db.commit()
        except Exception as e:
            logger.warning(f"Audit log write failed: {e}")
        finally:
            try:
                db.close()
            except Exception:
                pass
    return response

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(mdm.router, prefix="/api")
app.include_router(ombor.router, prefix="/api")
app.include_router(kassa.router, prefix="/api")
app.include_router(ishlab_chiqarish.router, prefix="/api")
app.include_router(kontragentlar.router, prefix="/api")
app.include_router(savdo.router, prefix="/api")
app.include_router(moliya.router, prefix="/api")
app.include_router(ish_haqi.router, prefix="/api")
app.include_router(sklad.router, prefix="/api")
app.include_router(buyurtmalar.router, prefix="/api")
app.include_router(tarix.router, prefix="/api")
app.include_router(auto_sarf.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(telegram_bot_api.router, prefix="/api")
app.include_router(xarajatlar.router, prefix="/api")

# Static frontend files mounting
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# The page itself is always revalidated (a cheap 304 when unchanged), so a new
# deploy - with its new ?v= script links - reaches the installed app at once.
NO_CACHE = {"Cache-Control": "no-cache"}

@app.get("/")
def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path), headers=NO_CACHE)
    return {"message": "Ceramic Tile Factory ERP API is running. Visit /docs for Swagger."}

@app.get("/webapp")
def serve_webapp():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path), headers=NO_CACHE)
    return {"message": "Telegram Mini App Endpoint"}

# Installable app (PWA). The manifest and service worker are served from the
# site root: a service worker only controls pages under its own path, so it
# must live at /sw.js to cover the whole site.
@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_manifest():
    return FileResponse(str(FRONTEND_DIR / "manifest.webmanifest"), media_type="application/manifest+json",
                        headers=NO_CACHE)

@app.get("/sw.js", include_in_schema=False)
def serve_service_worker():
    return FileResponse(str(FRONTEND_DIR / "sw.js"), media_type="application/javascript",
                        headers=NO_CACHE)

@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    return FileResponse(str(FRONTEND_DIR / "icons" / "favicon-32.png"), media_type="image/png")
