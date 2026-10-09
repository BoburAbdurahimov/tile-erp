"""Bot memory kept in the database.

On Vercel the bot answers through a webhook, and each message may land on a
different short-lived server, so per-user state (an unfinished Kassa,
production or Ombor wizard) cannot live in memory. Only user_data is used by
the bot; the other kinds of data are not stored.
"""
import logging
import pickle
from typing import Dict, Optional

from telegram.ext import BasePersistence, PersistenceInput

from backend.database import SessionLocal
from backend.models import TelegramBotState

logger = logging.getLogger("TileERPBot")


def _load(raw: Optional[bytes]) -> dict:
    if not raw:
        return {}
    try:
        data = pickle.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:          # an unreadable row is treated as empty, not an error
        return {}


class DBPersistence(BasePersistence):
    def __init__(self):
        super().__init__(store_data=PersistenceInput(
            user_data=True, chat_data=False, bot_data=False, callback_data=False))

    # ---- user_data: one row per Telegram user
    async def get_user_data(self) -> Dict[int, dict]:
        db = SessionLocal()
        try:
            return {r.user_id: _load(r.data) for r in db.query(TelegramBotState).all()}
        finally:
            db.close()

    async def refresh_user_data(self, user_id: int, user_data: dict) -> None:
        # Another server may have changed it since this one loaded it.
        db = SessionLocal()
        try:
            row = db.query(TelegramBotState).filter(TelegramBotState.user_id == user_id).first()
            fresh = _load(row.data) if row else {}
        finally:
            db.close()
        user_data.clear()
        user_data.update(fresh)

    async def update_user_data(self, user_id: int, data: dict) -> None:
        db = SessionLocal()
        try:
            row = db.query(TelegramBotState).filter(TelegramBotState.user_id == user_id).first()
            if not data:
                if row:
                    db.delete(row)
            else:
                if not row:
                    row = TelegramBotState(user_id=user_id)
                    db.add(row)
                row.data = pickle.dumps(dict(data))
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning(f"Bot state not saved for {user_id}: {e}")
        finally:
            db.close()

    async def drop_user_data(self, user_id: int) -> None:
        await self.update_user_data(user_id, {})

    # ---- not stored
    async def get_chat_data(self):
        return {}

    async def update_chat_data(self, chat_id, data) -> None:
        pass

    async def refresh_chat_data(self, chat_id, chat_data) -> None:
        pass

    async def drop_chat_data(self, chat_id) -> None:
        pass

    async def get_bot_data(self):
        return {}

    async def update_bot_data(self, data) -> None:
        pass

    async def refresh_bot_data(self, bot_data) -> None:
        pass

    async def get_callback_data(self):
        return None

    async def update_callback_data(self, data) -> None:
        pass

    async def get_conversations(self, name):
        return {}

    async def update_conversation(self, name, key, new_state) -> None:
        pass

    async def flush(self) -> None:
        pass
