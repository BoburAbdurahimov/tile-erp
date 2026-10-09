"""The Telegram bot on Vercel, through a webhook.

Long polling needs a machine that stays on, which Vercel does not give. With a
webhook Telegram sends each update to /api/telegram/webhook and the bot answers
it there, with the TELEGRAM_BOT_TOKEN set in Vercel.

The production deployment points the webhook at itself on start-up; an Admin
can also do it (and see the bot's state) from Foydalanuvchilar -> Telegram.
"""
import asyncio
import hashlib
import logging
import os
from typing import Optional

from backend.config import TELEGRAM_BOT_TOKEN

logger = logging.getLogger("TileERPBot")

WEBHOOK_PATH = "/api/telegram/webhook"


def is_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


def webhook_secret() -> str:
    """Telegram sends this back with every update, so only Telegram can call the
    webhook. Derived from the token: nothing more to configure."""
    return hashlib.sha256(f"tile-erp-webhook:{TELEGRAM_BOT_TOKEN}".encode()).hexdigest()


def production_base_url() -> Optional[str]:
    """The public HTTPS address of the live site, when it is known."""
    if os.getenv("PUBLIC_BASE_URL"):
        return os.getenv("PUBLIC_BASE_URL").rstrip("/")
    host = os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
    return f"https://{host}" if host else None


def _bot():
    from telegram import Bot
    return Bot(TELEGRAM_BOT_TOKEN)


async def get_status(expected_base: Optional[str] = None) -> dict:
    """The bot's name and where Telegram is sending its updates."""
    if not is_configured():
        return {"configured": False}
    expected = f"{expected_base}{WEBHOOK_PATH}" if expected_base else None
    async with _bot() as bot:
        me = await bot.get_me()
        info = await bot.get_webhook_info()
    return {
        "configured": True,
        "bot_username": me.username,
        "bot_name": me.first_name,
        "webhook_url": info.url or None,
        "expected_url": expected,
        "connected": bool(info.url) and (expected is None or info.url == expected),
        "pending_update_count": info.pending_update_count,
        "last_error_message": info.last_error_message,
        "last_error_date": info.last_error_date.isoformat() if info.last_error_date else None,
    }


async def set_webhook(base_url: str) -> dict:
    """Point the bot's webhook at this site. Replaces long polling."""
    from telegram import Update
    async with _bot() as bot:
        await bot.set_webhook(
            url=f"{base_url}{WEBHOOK_PATH}",
            secret_token=webhook_secret(),
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=False,
        )
    return await get_status(base_url)


async def ensure_webhook_on_startup() -> None:
    """On the production deployment only: if Telegram is not sending updates
    here yet, point it here. Preview deployments never touch the live bot."""
    if not is_configured() or os.getenv("VERCEL_ENV") != "production":
        return
    base = production_base_url()
    if not base:
        return
    try:
        async def _run():
            async with _bot() as bot:
                info = await bot.get_webhook_info()
                if info.url != f"{base}{WEBHOOK_PATH}":
                    from telegram import Update
                    await bot.set_webhook(url=f"{base}{WEBHOOK_PATH}", secret_token=webhook_secret(),
                                          allowed_updates=Update.ALL_TYPES)
                    logger.info(f"Telegram webhook set to {base}{WEBHOOK_PATH}")
        await asyncio.wait_for(_run(), timeout=10)
    except Exception as e:
        logger.warning(f"Telegram webhook not set on start-up: {e}")


async def handle_update(data: dict) -> None:
    """Answer one update with the full bot. Built per request: on Vercel there
    is no long-lived process to keep it in; its per-user state is in the database."""
    from telegram import Update
    from telegram_bot.bot import create_bot_app
    from telegram_bot.persistence import DBPersistence

    app = create_bot_app(persistence=DBPersistence())
    await app.initialize()
    try:
        update = Update.de_json(data, app.bot)
        await app.process_update(update)
        await app.update_persistence()
    finally:
        await app.shutdown()
