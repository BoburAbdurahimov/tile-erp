"""Avto sarf: material norms per piece and the automatic consumption calculation."""
import unittest

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import MDMMaterial, ProductionLine
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


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


def a_line():
    db = SessionLocal()
    try:
        line = db.query(ProductionLine).first()
        if not line:
            line = ProductionLine(line_number=99, name="Test liniya", spec_tile_size="60x60")
            db.add(line)
            db.commit()
        return line.id
    finally:
        db.close()


class TestAutoSarf(unittest.TestCase):

    def test_01_rules_upsert_and_delete(self):
        mid = material("AS-TEST-1")
        r1 = ok(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": mid, "qty_per_unit": 2}, headers=ADMIN))
        r2 = ok(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": mid, "qty_per_unit": 3}, headers=ADMIN))
        self.assertEqual(r1["id"], r2["id"])            # same (line, material) is updated, not duplicated
        self.assertEqual(r2["qty_per_unit"], 3)
        rules = ok(client.get("/api/ishlab-chiqarish/auto-sarf", headers=ADMIN))
        self.assertEqual(sum(1 for r in rules if r["material_id"] == mid), 1)

        ok(client.delete(f"/api/ishlab-chiqarish/auto-sarf/{r1['id']}", headers=ADMIN))
        rules = ok(client.get("/api/ishlab-chiqarish/auto-sarf", headers=ADMIN))
        self.assertFalse(any(r["id"] == r1["id"] for r in rules))

    def test_02_bad_input(self):
        mid = material("AS-TEST-1")
        self.assertEqual(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": mid, "qty_per_unit": 0},
                                     headers=ADMIN).status_code, 422)
        self.assertEqual(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": 999999, "qty_per_unit": 1},
                                     headers=ADMIN).status_code, 404)
        self.assertEqual(client.post("/api/ishlab-chiqarish/auto-sarf",
                                     json={"line_id": 999999, "material_id": mid, "qty_per_unit": 1},
                                     headers=ADMIN).status_code, 404)

    def test_03_calc_line_rule_overrides_general(self):
        m_a, m_b = material("AS-TEST-A"), material("AS-TEST-B")
        line_id = a_line()
        ok(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": m_a, "qty_per_unit": 2}, headers=ADMIN))
        ok(client.post("/api/ishlab-chiqarish/auto-sarf", json={"material_id": m_b, "qty_per_unit": 0.5}, headers=ADMIN))
        ok(client.post("/api/ishlab-chiqarish/auto-sarf",
                       json={"line_id": line_id, "material_id": m_a, "qty_per_unit": 4}, headers=ADMIN))

        general = ok(client.get("/api/ishlab-chiqarish/auto-sarf/calc?quantity=10", headers=ADMIN))
        self.assertTrue(general["configured"])
        items = {i["material_id"]: i for i in general["items"]}
        self.assertAlmostEqual(items[m_a]["quantity"], 20)
        self.assertAlmostEqual(items[m_b]["quantity"], 5)

        on_line = ok(client.get(f"/api/ishlab-chiqarish/auto-sarf/calc?quantity=10&line_id={line_id}", headers=ADMIN))
        items = {i["material_id"]: i for i in on_line["items"]}
        self.assertAlmostEqual(items[m_a]["quantity"], 40)     # line norm wins
        self.assertTrue(items[m_a]["from_line"])
        self.assertAlmostEqual(items[m_b]["quantity"], 5)      # general norm still applies
        self.assertIn("enough", items[m_a])
        self.assertIn("available", items[m_a])

    def test_04_permission(self):
        self.assertEqual(client.get("/api/ishlab-chiqarish/auto-sarf", headers={"x-user-role": "Kassir"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()
