"""Delivery from another owner's warehouse, production into the Ombor,
safe deletes, document numbering and the History endpoint."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from tests_support import use_header_roles
from backend.database import SessionLocal
from backend.models import MDMMaterial, MDMCounterparty, ProductionLine

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def cell(sklad_id, length, width):
    m = ok(client.get(f"/api/sklad/matrix?sklad_id={sklad_id}", headers=ADMIN))
    return sum(c["quantity"] for c in m["cells"] if c["length"] == length and c["width"] == width)


def first_line_id():
    db = SessionLocal()
    try:
        return db.query(ProductionLine).first().id
    finally:
        db.close()


class TestOrdersAndHistory(unittest.TestCase):

    def test_01_deliver_from_another_owner(self):
        # Toxir 120 (id 1) has no 730s; Kodir 120 (id 3) gets them.
        order = ok(client.post("/api/orders", json={
            "client_name": "Test mijoz", "client_phone": "+998900000001",
            "sklad_id": 1, "sell_type": "metr",
            "deadline": "2030-01-01T12:00:00",
            "items": [{"code": 730, "quantity": 4, "unit_price": 1000}],
        }, headers=ADMIN))
        oid = order["id"]
        ok(client.post("/api/sklad/kirim", json={"sklad_id": 3, "items": [{"code": 730, "quantity": 4}]}, headers=ADMIN))

        opts = {o["sklad_id"]: o for o in ok(client.get(f"/api/orders/{oid}/delivery-options", headers=ADMIN))["options"]}
        self.assertEqual(set(opts), {1, 3, 5, 7})           # same eni (120) at each owner
        self.assertFalse(opts[1]["can_ship"])
        self.assertTrue(opts[3]["can_ship"])

        # Another eni is refused: prices were set for 120.
        bad = client.post(f"/api/orders/{oid}/deliver", json={
            "car_number": "01A001AA", "driver_phone": "+998900000002", "sklad_id": 4}, headers=ADMIN)
        self.assertEqual(bad.status_code, 400)

        before = cell(3, 700, 30)
        done = ok(client.post(f"/api/orders/{oid}/deliver", json={
            "car_number": "01A001AA", "driver_phone": "+998900000002", "sklad_id": 3}, headers=ADMIN))
        self.assertEqual(done["status"], "Yetkazildi")
        self.assertEqual(done["sklad_id"], 3)
        self.assertEqual(cell(3, 700, 30), before - 4)

    def test_02_production_into_ombor_and_storno(self):
        line_id = first_line_id()
        before = cell(5, 600, 80)
        prod = ok(client.post("/api/ishlab-chiqarish/orders", json={
            "line_id": line_id, "out_sklad_id": 5, "out_code": 680, "quantity": 7,
            "date": str(date.today()), "consumed_materials": []}, headers=ADMIN))
        self.assertEqual(cell(5, 600, 80), before + 7)

        frac = client.post("/api/ishlab-chiqarish/orders", json={
            "line_id": line_id, "out_sklad_id": 5, "out_code": 680, "quantity": 2.5,
            "date": str(date.today()), "consumed_materials": []}, headers=ADMIN)
        self.assertEqual(frac.status_code, 400)

        # An active document cannot be deleted - its stock would stay counted.
        self.assertEqual(client.delete(f"/api/ishlab-chiqarish/orders/{prod['id']}", headers=ADMIN).status_code, 400)

        ok(client.post(f"/api/ishlab-chiqarish/orders/{prod['id']}/storno", headers=ADMIN))
        self.assertEqual(cell(5, 600, 80), before)
        ok(client.delete(f"/api/ishlab-chiqarish/orders/{prod['id']}", headers=ADMIN))

    def test_03_storno_refused_after_sale(self):
        line_id = first_line_id()
        prod = ok(client.post("/api/ishlab-chiqarish/orders", json={
            "line_id": line_id, "out_sklad_id": 6, "out_code": 540, "quantity": 3,
            "date": str(date.today()), "consumed_materials": []}, headers=ADMIN))
        on_hand = cell(6, 500, 40)
        ok(client.post("/api/sklad/sotish", json={
            "sklad_id": 6, "sell_type": "metr",
            "items": [{"code": 540, "quantity": on_hand - 1, "unit_price": 1000}]}, headers=ADMIN))
        res = client.post(f"/api/ishlab-chiqarish/orders/{prod['id']}/storno", headers=ADMIN)
        self.assertEqual(res.status_code, 400)

    def test_04_numbers_do_not_repeat_after_delete(self):
        db = SessionLocal()
        supplier = db.query(MDMCounterparty).filter(MDMCounterparty.type == "supplier").first()
        raw = db.query(MDMMaterial).filter(MDMMaterial.category == "Xomashyo").first()
        db.close()
        body = {"supplier_id": supplier.id, "warehouse_id": 2, "date": str(date.today()),
                "currency": "USD", "items": [{"material_id": raw.id, "quantity": 10, "unit_price": 1}]}
        a = ok(client.post("/api/savdo/purchases", json=body, headers=ADMIN))
        b = ok(client.post("/api/savdo/purchases", json=body, headers=ADMIN))
        ok(client.post(f"/api/savdo/purchases/{a['id']}/storno", headers=ADMIN))
        ok(client.delete(f"/api/savdo/purchases/{a['id']}", headers=ADMIN))
        c = ok(client.post("/api/savdo/purchases", json=body, headers=ADMIN))
        self.assertNotEqual(c["purchase_number"], b["purchase_number"])

    def test_05_history(self):
        h = ok(client.get("/api/history", headers=ADMIN))
        kinds = {e["kind"] for e in h["events"]}
        self.assertIn("yetkazish", kinds)
        self.assertIn("ishlab_chiqarish", kinds)
        self.assertIn("xarid", kinds)
        self.assertEqual(h["owners"], ["Aziz", "Istam", "Kodir", "Toxir"])
        delivered = next(e for e in h["events"] if e["kind"] == "yetkazish")
        self.assertEqual(delivered["owner"], "Kodir")
        # The delivered order is unpaid, so it is a debt.
        self.assertTrue(any(d["balance"] > 0 for d in h["debts"]))

        only = ok(client.get("/api/history?kind=xarid", headers=ADMIN))
        self.assertTrue(only["events"] and all(e["kind"] == "xarid" for e in only["events"]))
        self.assertEqual(client.get("/api/history", headers={"x-user-role": "Kassir"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()
