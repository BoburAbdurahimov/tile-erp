"""Telegram bot endpoints: the webhook Telegram calls, and the Admin's status /
connect actions (see backend/services/telegram_webhook.py)."""
import hmac
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from backend.api.auth import get_current_user_role, is_admin
from backend.services import telegram_webhook as tw

router = APIRouter(prefix="/telegram", tags=["TELEGRAM BOT"])
logger = logging.getLogger("TileERPBot")


@router.post("/webhook")
async def telegram_webhook(request: Request,
                           x_telegram_bot_api_secret_token: Optional[str] = Header(default=None)):
    if not tw.is_configured():
        raise HTTPException(status_code=404, detail="Bot sozlanmagan.")
    if not hmac.compare_digest(x_telegram_bot_api_secret_token or "", tw.webhook_secret()):
        raise HTTPException(status_code=403, detail="Ruxsat yo'q.")
    data = await request.json()
    try:
        await tw.handle_update(data)
    except Exception:
        # Still 200: otherwise Telegram keeps re-sending the same update.
        logger.exception("Telegram update failed")
    return {"ok": True}


def _base_url(request: Request) -> str:
    """This site's public HTTPS address."""
    configured = tw.production_base_url()
    if configured:
        return configured
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"https://{host}"


def _require_admin(role: str):
    if not is_admin(role):
        raise HTTPException(status_code=403, detail="Faqat Admin uchun.")


@router.get("/status")
async def bot_status(request: Request, role: str = Depends(get_current_user_role)):
    _require_admin(role)
    if not tw.is_configured():
        return {"configured": False}
    try:
        return await tw.get_status(_base_url(request))
    except Exception as e:
        return {"configured": True, "error": f"Telegram bilan bog'lanib bo'lmadi: {e}"}


@router.post("/connect")
async def connect_bot(request: Request, role: str = Depends(get_current_user_role)):
    """Point the bot at this site (webhook). Telegram then sends every message here."""
    _require_admin(role)
    if not tw.is_configured():
        raise HTTPException(status_code=400, detail="TELEGRAM_BOT_TOKEN Vercel'da o'rnatilmagan.")
    base = _base_url(request)
    if not base.startswith("https://"):
        raise HTTPException(status_code=400, detail="Webhook uchun HTTPS manzil kerak.")
    try:
        return await tw.set_webhook(base)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Telegram webhookni qabul qilmadi: {e}")
