"""The Telegram bot through a webhook: only Telegram (with the secret) may call
it, updates are answered by the real bot handlers, entry wizards are blocked
while the bot is read-only, and per-user state survives between requests.

Telegram itself is faked at the HTTP layer: every request the bot makes is
recorded and answered like Telegram would."""
import asyncio
import json
import unittest
from unittest import mock

from fastapi.testclient import TestClient
from telegram.request import HTTPXRequest

from backend.main import app
from backend.services import telegram_webhook as tw
import telegram_bot.bot as bot_module
from telegram_bot.persistence import DBPersistence
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
TOKEN = "123456:TEST-TOKEN"
SENT = []


async def fake_do_request(self, url, method, request_data=None, *args, **kwargs):
    api = url.rsplit("/", 1)[-1]
    params = request_data.parameters if request_data else {}
    SENT.append((api, params))
    if api == "getMe":
        result = {"id": 123456, "is_bot": True, "first_name": "ERP", "username": "erp_test_bot",
                  "can_join_groups": True, "can_read_all_group_messages": False, "supports_inline_queries": False}
    elif api == "sendMessage":
        result = {"message_id": 99, "date": 0, "chat": {"id": params.get("chat_id"), "type": "private"},
                  "text": params.get("text", "")}
    elif api == "getWebhookInfo":
        result = {"url": "", "has_custom_certificate": False, "pending_update_count": 3}
    else:
        result = True
    return 200, json.dumps({"ok": True, "result": result}).encode()


def secret():
    with mock.patch.object(tw, "TELEGRAM_BOT_TOKEN", TOKEN):
        return tw.webhook_secret()


def message_update(uid, text, update_id=1):
    return {"update_id": update_id, "message": {
        "message_id": update_id, "date": 0, "text": text,
        "chat": {"id": uid, "type": "private"}, "from": {"id": uid, "is_bot": False, "first_name": "Ali"},
        **({"entities": [{"type": "bot_command", "offset": 0, "length": len(text)}]} if text.startswith("/") else {})}}


def callback_update(uid, data, update_id=2):
    return {"update_id": update_id, "callback_query": {
        "id": "cb1", "data": data, "chat_instance": "x",
        "from": {"id": uid, "is_bot": False, "first_name": "Ali"},
        "message": {"message_id": 5, "date": 0, "chat": {"id": uid, "type": "private"}, "text": "menu"}}}


class TestTelegramWebhook(unittest.TestCase):

    def setUp(self):
        SENT.clear()
        self.patches = [
            mock.patch.object(tw, "TELEGRAM_BOT_TOKEN", TOKEN),
            mock.patch.object(bot_module, "TELEGRAM_BOT_TOKEN", TOKEN),
            mock.patch.object(HTTPXRequest, "do_request", fake_do_request),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def post(self, update, token=None):
        return client.post("/api/telegram/webhook", json=update,
                           headers={"X-Telegram-Bot-Api-Secret-Token": token if token is not None else secret()})

    def test_01_only_telegram_may_call(self):
        self.assertEqual(self.post(message_update(7001, "/start"), token="wrong").status_code, 403)
        self.assertEqual(self.post(message_update(7001, "/start"), token="").status_code, 403)
        with mock.patch.object(tw, "TELEGRAM_BOT_TOKEN", ""):
            self.assertEqual(self.post(message_update(7001, "/start")).status_code, 404)

    def test_02_start_is_answered(self):
        res = self.post(message_update(7002, "/start"))
        self.assertEqual(res.status_code, 200)
        sent = [p for api, p in SENT if api == "sendMessage"]
        self.assertTrue(sent, SENT)
        self.assertEqual(sent[0]["chat_id"], 7002)
        self.assertIn("Ali", sent[0]["text"])                    # "Assalomu alaykum, Ali!" + language buttons

    def test_03_entry_wizards_blocked_while_read_only(self):
        self.assertTrue(bot_module.BOT_READ_ONLY)
        self.post(callback_update(7003, "cash_kirim_start"))
        answers = [p for api, p in SENT if api == "answerCallbackQuery"]
        self.assertTrue(answers and answers[0].get("show_alert"), SENT)
        self.assertIn("web", answers[0]["text"].lower())
        self.assertFalse([api for api, _ in SENT if api == "sendMessage"])   # the wizard did not start

    def test_04_state_kept_between_requests(self):
        p = DBPersistence()
        asyncio.run(p.update_user_data(7004, {"sklad_state": {"step": "await_items", "sklad_id": 4}}))
        loaded = {}
        asyncio.run(p.refresh_user_data(7004, loaded))           # a different server reads it back
        self.assertEqual(loaded["sklad_state"]["sklad_id"], 4)
        self.assertEqual(asyncio.run(p.get_user_data())[7004]["sklad_state"]["step"], "await_items")
        asyncio.run(p.drop_user_data(7004))
        loaded = {"old": 1}
        asyncio.run(p.refresh_user_data(7004, loaded))
        self.assertEqual(loaded, {})

    def test_04b_wizard_state_through_the_webhook(self):
        # With entry allowed, a wizard step started in one request is saved to the
        # database and seen (and cleared) by the next request.
        from backend.database import SessionLocal
        from backend.models import TelegramBotState

        def row():
            db = SessionLocal()
            try:
                r = db.query(TelegramBotState).filter(TelegramBotState.user_id == 7005).first()
                return r is not None
            finally:
                db.close()

        with mock.patch.object(bot_module, "BOT_READ_ONLY", False):
            self.post(callback_update(7005, "sk_in_4", update_id=10))
            self.assertTrue(row(), SENT)
            self.post(callback_update(7005, "sk_cancel", update_id=11))
            self.assertFalse(row())
            self.assertIn("Bekor qilindi.", [p.get("text") for api, p in SENT if api == "sendMessage"])

    def test_05_admin_status_and_connect(self):
        self.assertEqual(client.get("/api/telegram/status", headers={"x-user-role": "Kassir"}).status_code, 403)
        st = client.get("/api/telegram/status", headers={"x-user-role": "Admin"}).json()
        self.assertEqual(st["bot_username"], "erp_test_bot")
        self.assertFalse(st["connected"])
        self.assertEqual(st["pending_update_count"], 3)
        with mock.patch.dict("os.environ", {"PUBLIC_BASE_URL": "https://tile-erp-main.vercel.app"}):
            client.post("/api/telegram/connect", headers={"x-user-role": "Admin"})
        hook = [p for api, p in SENT if api == "setWebhook"]
        self.assertEqual(hook[0]["url"], "https://tile-erp-main.vercel.app/api/telegram/webhook")
        self.assertEqual(hook[0]["secret_token"], secret())


if __name__ == "__main__":
    unittest.main()
