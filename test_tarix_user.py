"""History says who did each thing: the login of the account that made it."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import User
from backend.auth_utils import create_token
from backend.api.auth import get_current_user_role, get_current_username, get_ombor_scope
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


class TestTarixUser(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.saved = {d: app.dependency_overrides.pop(d, None)
                     for d in (get_current_user_role, get_current_username, get_ombor_scope)}
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.username == "t_kim_admin").first()
            if not u:
                u = User(username="t_kim_admin", full_name="Kim Admin", role="Admin", password_hash="x")
                db.add(u)
            u.role, u.is_active, u.is_archived = "Admin", True, False
            db.commit()
            cls.h = {"Authorization": f"Bearer {create_token(u.id, u.username)}"}
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        for d, fn in cls.saved.items():
            if fn:
                app.dependency_overrides[d] = fn

    def test_kim_is_the_login(self):
        reg = ok(client.get("/api/kassa/registers", headers=self.h))[0]
        ok(client.post("/api/kassa/transactions", headers=self.h, json={
            "register_id": reg["id"], "type": "kirim", "amount": 1234, "currency": reg["currency"],
            "category": "boshqa", "description": "Kim test kirim", "date": str(date.today())}))
        ok(client.post("/api/sklad/kirim", headers=self.h, json={
            "sklad_id": 1, "supplier": "Kim test", "items": [{"length": 600, "width": 80, "quantity": 2}]}))
        events = ok(client.get("/api/history?search=Kim test", headers=self.h))
        events = events.get("events", events) if isinstance(events, dict) else events
        kinds = {e["kind"]: e["user"] for e in events}
        self.assertEqual(kinds.get("kassa_kirim"), "t_kim_admin", events)
        self.assertEqual(kinds.get("ombor_kirim"), "t_kim_admin", events)


if __name__ == "__main__":
    unittest.main()
