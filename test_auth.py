"""Real login: signed tokens, Telegram one-time codes, admin-only user management."""
import unittest
from unittest import mock

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import User, TelegramUser, AuditLog
from backend.auth_utils import hash_password
from backend.api.auth import get_current_user_role, get_current_username
from backend.services import telegram_otp

client = TestClient(app)

PASSWORD = "Test-parol-123"


def make_user(username, role, phone=None):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, full_name=username, role=role)
            db.add(u)
        u.role, u.phone_number = role, phone
        u.password_hash = hash_password(PASSWORD)
        u.is_active, u.is_archived = True, False
        db.commit()
        return u.id
    finally:
        db.close()


def link_telegram(telegram_id, phone):
    db = SessionLocal()
    try:
        tg = db.query(TelegramUser).filter(TelegramUser.telegram_id == telegram_id).first()
        if not tg:
            tg = TelegramUser(telegram_id=telegram_id)
            db.add(tg)
        tg.phone_number, tg.is_approved, tg.language = phone, True, "uz"
        db.commit()
    finally:
        db.close()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


class TestAuth(unittest.TestCase):

    def setUp(self):
        # Feature tests stand in a role from a header; here the real login runs.
        self.saved = {dep: app.dependency_overrides.pop(dep, None)
                      for dep in (get_current_user_role, get_current_username)}

    def tearDown(self):
        for dep, fn in self.saved.items():
            if fn:
                app.dependency_overrides[dep] = fn

    def login(self, username):
        return client.post("/api/auth/login", json={"username": username, "password": PASSWORD})

    def test_01_no_token_no_access(self):
        self.assertEqual(client.get("/api/history").status_code, 401)
        # The old trick - claiming a role in a header - no longer works.
        self.assertEqual(client.get("/api/history", headers={"x-user-role": "Admin"}).status_code, 401)
        self.assertEqual(client.post("/api/auth/users", json={
            "username": "hacker", "full_name": "x", "role": "Admin", "password": "x"},
            headers={"x-user-role": "Admin"}).status_code, 401)

    def test_02_password_login_without_telegram(self):
        make_user("t_admin", "Admin")
        res = self.login("t_admin").json()
        self.assertTrue(res["success"])
        self.assertNotIn("otp_required", res)
        self.assertEqual(client.get("/api/history", headers=bearer(res["token"])).status_code, 200)

        wrong = client.post("/api/auth/login", json={"username": "t_admin", "password": "nope"})
        self.assertEqual(wrong.status_code, 400)

    def test_03_tampered_token_rejected(self):
        make_user("t_kassir", "Kassir")
        token = self.login("t_kassir").json()["token"]
        payload, sig = token.split(".")
        forged = payload[:-2] + ("AA" if payload[-2:] != "AA" else "BB") + "." + sig
        self.assertEqual(client.get("/api/kassa/registers", headers=bearer(forged)).status_code, 401)
        self.assertEqual(client.get("/api/kassa/registers", headers=bearer("garbage")).status_code, 401)

    def test_04_role_comes_from_database(self):
        make_user("t_kassir", "Kassir")
        token = self.login("t_kassir").json()["token"]
        h = bearer(token)
        self.assertEqual(client.get("/api/kassa/registers", headers=h).status_code, 200)
        self.assertEqual(client.get("/api/history", headers=h).status_code, 403)
        # Non-admins cannot manage users, whatever header they send.
        self.assertEqual(client.get("/api/auth/users", headers={**h, "x-user-role": "Admin"}).status_code, 403)
        # Archiving takes effect immediately, even for an issued token.
        make_user("t_kassir", "Kassir")
        db = SessionLocal()
        db.query(User).filter(User.username == "t_kassir").update({"is_archived": True})
        db.commit(); db.close()
        self.assertEqual(client.get("/api/kassa/registers", headers=h).status_code, 401)

    def test_05_telegram_code(self):
        make_user("t_otp", "Admin", phone="+998 90 111-22-33")
        link_telegram(555000111, "998901112233")
        sent = {}

        def fake_send(chat_id, code, language="uz"):
            sent["chat"], sent["code"] = chat_id, code
            return True

        with mock.patch.object(telegram_otp, "can_send", return_value=True), \
             mock.patch.object(telegram_otp, "send_code", side_effect=fake_send):
            res = self.login("t_otp").json()
        self.assertTrue(res["otp_required"])
        self.assertNotIn("token", res)                  # password alone is not enough
        self.assertEqual(sent["chat"], 555000111)
        self.assertEqual(len(sent["code"]), 6)

        cid = res["challenge_id"]
        wrong = "000000" if sent["code"] != "000000" else "111111"
        bad = client.post("/api/auth/verify-otp", json={"challenge_id": cid, "code": wrong})
        self.assertEqual(bad.status_code, 400)

        good = client.post("/api/auth/verify-otp", json={"challenge_id": cid, "code": sent["code"]}).json()
        self.assertTrue(good["success"])
        self.assertEqual(client.get("/api/history", headers=bearer(good["token"])).status_code, 200)

        # A code works once.
        again = client.post("/api/auth/verify-otp", json={"challenge_id": cid, "code": sent["code"]})
        self.assertEqual(again.status_code, 400)

    def test_06_code_attempts_limited(self):
        make_user("t_otp2", "Admin", phone="+998 90 444-55-66")
        link_telegram(555000222, "+998904445566")
        sent = {}
        with mock.patch.object(telegram_otp, "can_send", return_value=True), \
             mock.patch.object(telegram_otp, "send_code", side_effect=lambda c, code, l="uz": sent.update(code=code) or True):
            cid = self.login("t_otp2").json()["challenge_id"]
        wrong = "000000" if sent["code"] != "000000" else "111111"
        for _ in range(5):
            client.post("/api/auth/verify-otp", json={"challenge_id": cid, "code": wrong})
        # Even the right code is refused after too many tries.
        res = client.post("/api/auth/verify-otp", json={"challenge_id": cid, "code": sent["code"]})
        self.assertIn(res.status_code, (400, 429))

    def test_07_telegram_down_does_not_leak_token(self):
        make_user("t_otp3", "Admin", phone="+998907778899")
        link_telegram(555000333, "998907778899")
        with mock.patch.object(telegram_otp, "can_send", return_value=True), \
             mock.patch.object(telegram_otp, "send_code", return_value=False):
            res = self.login("t_otp3")
        self.assertEqual(res.status_code, 502)
        self.assertNotIn("token", res.json())

    def test_08_changes_are_audited_with_username(self):
        make_user("t_admin", "Admin")
        token = self.login("t_admin").json()["token"]
        res = client.post("/api/sklad/kirim", json={"sklad_id": 1, "items": [{"code": 680, "quantity": 1}]},
                          headers=bearer(token))
        self.assertEqual(res.status_code, 200)
        db = SessionLocal()
        last = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
        db.close()
        self.assertEqual(last.username, "t_admin")
        self.assertEqual(last.details, "/api/sklad/kirim")
        h = client.get("/api/history?kind=amal", headers=bearer(token)).json()
        self.assertTrue(any(e["user"] == "t_admin" for e in h["events"]))


if __name__ == "__main__":
    unittest.main()
