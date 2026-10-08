"""Avto sarf norms, the automatic consumption calculation, and demo data from the website."""
import unittest

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import MDMMaterial, User, Purchase
from backend.auth_utils import create_token
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
URL = "/api/ishlab-chiqarish/auto-sarf"


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def material(code):
    db = SessionLocal()
    try:
        m = db.query(MDMMaterial).filter(MDMMaterial.code == code).first()
        if not m:
            m = MDMMaterial(code=code, name=f"Test {code}", category="Xomashyo", unit="kg")
            db.add(m)
            db.commit()
        return m.id
    finally:
        db.close()


def user_token(username, role):
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


class TestAutoSarf(unittest.TestCase):

    def test_01_rules_upsert_and_delete(self):
        mid = material("AS-TEST-1")
        r1 = ok(client.post(URL, json={"material_id": mid, "qty_per_unit": 2}, headers=ADMIN))
        r2 = ok(client.post(URL, json={"material_id": mid, "qty_per_unit": 3}, headers=ADMIN))
        self.assertEqual(r1["id"], r2["id"])            # one norm per material: updated, not duplicated
        self.assertEqual(r2["qty_per_unit"], 3)
        rules = ok(client.get(URL, headers=ADMIN))
        self.assertEqual(sum(1 for r in rules if r["material_id"] == mid), 1)

        ok(client.delete(f"{URL}/{r1['id']}", headers=ADMIN))
        self.assertFalse(any(r["id"] == r1["id"] for r in ok(client.get(URL, headers=ADMIN))))

    def test_02_bad_input(self):
        mid = material("AS-TEST-1")
        self.assertEqual(client.post(URL, json={"material_id": mid, "qty_per_unit": 0}, headers=ADMIN).status_code, 422)
        self.assertEqual(client.post(URL, json={"material_id": 999999, "qty_per_unit": 1}, headers=ADMIN).status_code, 404)

    def test_03_calc(self):
        m_a, m_b = material("AS-TEST-A"), material("AS-TEST-B")
        ok(client.post(URL, json={"material_id": m_a, "qty_per_unit": 2}, headers=ADMIN))
        ok(client.post(URL, json={"material_id": m_b, "qty_per_unit": 0.5}, headers=ADMIN))
        res = ok(client.get(f"{URL}/calc?quantity=10", headers=ADMIN))
        self.assertTrue(res["configured"])
        items = {i["material_id"]: i for i in res["items"]}
        self.assertAlmostEqual(items[m_a]["quantity"], 20)
        self.assertAlmostEqual(items[m_b]["quantity"], 5)
        self.assertFalse(items[m_a]["enough"])          # nothing of it in the warehouse
        self.assertEqual(items[m_a]["available"], 0)

    def test_03b_ombor_norm_wins(self):
        m_c, m_d = material("AS-TEST-C"), material("AS-TEST-D")
        ok(client.post(URL, json={"material_id": m_c, "qty_per_unit": 3}, headers=ADMIN))
        ok(client.post(URL, json={"material_id": m_d, "qty_per_unit": 1}, headers=ADMIN))
        rule = ok(client.post(URL, json={"sklad_id": 4, "material_id": m_c, "qty_per_unit": 2}, headers=ADMIN))
        self.assertEqual(rule["sklad_label"], "Kodir 100")

        kodir100 = {i["material_id"]: i for i in ok(client.get(f"{URL}/calc?quantity=10&sklad_id=4", headers=ADMIN))["items"]}
        self.assertAlmostEqual(kodir100[m_c]["quantity"], 20)   # Kodir 100's own norm
        self.assertTrue(kodir100[m_c]["from_sklad"])
        self.assertAlmostEqual(kodir100[m_d]["quantity"], 10)   # general norm still applies
        kodir120 = {i["material_id"]: i for i in ok(client.get(f"{URL}/calc?quantity=10&sklad_id=3", headers=ADMIN))["items"]}
        self.assertAlmostEqual(kodir120[m_c]["quantity"], 30)   # general norm
        self.assertEqual(client.post(URL, json={"sklad_id": 99, "material_id": m_c, "qty_per_unit": 1},
                                     headers=ADMIN).status_code, 404)

    def test_04_permission(self):
        self.assertEqual(client.get(URL, headers={"x-user-role": "Kassir"}).status_code, 403)


class TestDemoSeed(unittest.TestCase):

    def test_admin_only_and_idempotent(self):
        self.assertEqual(client.post("/api/demo/seed").status_code, 401)
        self.assertEqual(client.post("/api/demo/seed", headers=user_token("t_demo_kassir", "Kassir")).status_code, 403)

        admin = user_token("t_demo_admin", "Admin")
        res = ok(client.post("/api/demo/seed", headers=admin))
        self.assertEqual(res["steps"][-1], "Tayyor")
        db = SessionLocal()
        self.assertTrue(db.query(Purchase).filter(Purchase.description.like("%[DEMO]%")).count() >= 6)
        db.close()
        regs = {r["name"]: r for r in ok(client.get("/api/kassa/registers", headers=ADMIN))}
        self.assertGreater(regs["Kassa UZS"]["balance"], 0)
        self.assertGreater(regs["Kassa USD"]["balance"], 0)

        # Every 100 Ombor has its own norms, and Warehouse 2 holds enough raw material.
        rules = ok(client.get(URL, headers=ADMIN))
        self.assertEqual({r["sklad_id"] for r in rules if r["sklad_id"]}, {2, 4, 6, 8})
        calc = ok(client.get(f"{URL}/calc?quantity=100&sklad_id=4", headers=ADMIN))
        self.assertTrue(calc["items"] and all(i["enough"] and i["from_sklad"] for i in calc["items"]
                                              if i["material_code"].startswith("RM-")))

        # Already there: a second click only brings Avto sarf up to date.
        for r in rules:
            if r["sklad_id"] == 4:
                ok(client.delete(f"{URL}/{r['id']}", headers=ADMIN))
        db = SessionLocal()
        purchases_before = db.query(Purchase).count()
        db.close()
        again = ok(client.post("/api/demo/seed", headers=admin))
        self.assertTrue(again["updated"])
        self.assertIn(4, {r["sklad_id"] for r in ok(client.get(URL, headers=ADMIN))})
        db = SessionLocal()
        self.assertEqual(db.query(Purchase).count(), purchases_before)   # stock was enough: no new purchase
        db.close()


if __name__ == "__main__":
    unittest.main()
