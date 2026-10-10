"""Send one-time login codes through the Telegram bot.

The ERP user is matched to a Telegram account by phone number: the phone on
the user (Foydalanuvchilar) and the phone the person shared with the bot.
"""
import logging
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from backend.config import TELEGRAM_BOT_TOKEN
from backend.models import TelegramUser, User
from backend.auth_utils import phone_key

logger = logging.getLogger(__name__)


def find_telegram_chat(db: Session, user: User) -> Optional[TelegramUser]:
    key = phone_key(user.phone_number)
    if not key:
        return None
    for tg in db.query(TelegramUser).filter(TelegramUser.phone_number.isnot(None)).all():
        if phone_key(tg.phone_number) == key:
            return tg
    return None


def can_send() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


def send_code(telegram_id: int, code: str, language: str = "uz") -> bool:
    """True if Telegram accepted the message."""
    if language == "ru":
        text = (f"Код входа в Tile ERP: {code}\n\n"
                f"Действует 5 минут. Никому не сообщайте этот код.")
    else:
        text = (f"Tile ERP ga kirish kodi: {code}\n\n"
                f"5 daqiqa amal qiladi. Bu kodni hech kimga bermang.")
    try:
        res = httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": telegram_id, "text": text},
            timeout=10,
        )
        if res.status_code != 200:
            logger.warning("Telegram sendMessage failed: %s", res.status_code)
            return False
        return True
    except Exception as e:
        logger.warning("Telegram sendMessage error: %s", e)
        return False
