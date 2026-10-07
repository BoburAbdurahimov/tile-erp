"""A warehouse manager sees and moves only the Ombor sklads assigned to them."""
import unittest

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


def token_for(username, role):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, full_name=username, role=role, password_hash="x")
            db.add(u)
        u.role, u.is_active, u.is_archived = role, True, False
        db.commit()
        return {"Authorization": f"Bearer {create_token(u.id, u.username)}"}
    finally:
        db.close()


class TestOmborAccess(unittest.TestCase):

    def setUp(self):
        # Use the real login token, not the test header role.
        self.saved = {d: app.dependency_overrides.pop(d, None)
                      for d in (get_current_user_role, get_current_username, get_ombor_scope)}

    def tearDown(self):
        for d, fn in self.saved.items():
            if fn:
                app.dependency_overrides[d] = fn

    def test_assigned_sklads_only(self):
        admin = token_for("t_acc_admin", "Admin")
        created = ok(client.post("/api/auth/users", json={
            "username": "t_kodir_ombor", "full_name": "Kodir omborchisi", "role": "Omborchi",
            "password": "Parol-123", "ombor_sklads": [4, 3, 4]}, headers=admin))
        self.assertEqual(created["user"]["ombor_sklads"], [3, 4])
        uid = created["user"]["id"]
        listed = next(u for u in ok(client.get("/api/auth/users", headers=admin)) if u["id"] == uid)
        self.assertEqual(listed["ombor_sklads"], [3, 4])

        h = {"Authorization": f"Bearer {create_token(uid, 't_kodir_ombor')}"}
        self.assertEqual([w["sklad_id"] for w in ok(client.get("/api/sklad/warehouses", headers=h))["warehouses"]], [3, 4])
        self.assertEqual([w["id"] for w in ok(client.get("/api/sklad/config", headers=h))["warehouses"]], [3, 4])
        ok(client.get("/api/sklad/matrix?sklad_id=4", headers=h))
        self.assertEqual(client.get("/api/sklad/matrix?sklad_id=1", headers=h).status_code, 403)
        ok(client.post("/api/sklad/kirim", json={"sklad_id": 4, "items": [{"code": 680, "quantity": 2}]}, headers=h))
        self.assertEqual(client.post("/api/sklad/kirim", json={"sklad_id": 7, "items": [{"code": 680, "quantity": 2}]},
                                     headers=h).status_code, 403)
        ok(client.post("/api/sklad/kirim", json={"sklad_id": 7, "items": [{"code": 680, "quantity": 1}]}, headers=admin))
        moves = ok(client.get("/api/sklad/movements?limit=500", headers=h))["movements"]
        self.assertTrue(moves and all(m["sklad_id"] in (3, 4) for m in moves))
        self.assertEqual(client.get("/api/sklad/movements?sklad_id=7", headers=h).status_code, 403)

        # Admin always sees everything; clearing the list gives back all sklads.
        self.assertEqual(len(ok(client.get("/api/sklad/warehouses", headers=admin))["warehouses"]), 8)
        ok(client.put(f"/api/auth/users/{uid}", json={"ombor_sklads": []}, headers=admin))
        self.assertEqual(len(ok(client.get("/api/sklad/warehouses", headers=h))["warehouses"]), 8)

        bad = client.put(f"/api/auth/users/{uid}", json={"ombor_sklads": [9]}, headers=admin)
        self.assertEqual(bad.status_code, 400)


if __name__ == "__main__":
    unittest.main()
