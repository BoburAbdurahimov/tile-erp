"""Sotib olish chooses the xomashyo or the aralash warehouse; production with
Avto rasxod on consumes by the Admin's norms for that Ombor."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import StockItem
from backend.services import material_warehouses as mw
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
URL = "/api/ishlab-chiqarish/auto-sarf"


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def stock(owner, kind, material_id):
    db = SessionLocal()
    try:
        row = db.query(StockItem).filter(StockItem.warehouse_id == mw.warehouse_id(db, owner, kind),
                                         StockItem.material_id == material_id).first()
        return row.quantity if row else 0
    finally:
        db.close()


class TestAutoRasxod(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.sup = ok(client.post("/api/mdm/counterparties", headers=ADMIN,
                                 json={"name": "Avto Rasxod Test MCHJ", "type": "supplier"}))
        cls.glaze = ok(client.post("/api/mdm/materials", headers=ADMIN, json={
            "code": "AR-GLZ", "name": "AR glazur", "category": "Xomashyo", "unit": "kg", "min_stock": 0}))
        ok(client.put(f"/api/mdm/counterparties/{cls.sup['id']}/prices", headers=ADMIN,
                      json=[{"material_id": cls.glaze["id"], "price": 1000}]))

    def buy(self, kind, qty):
        return client.post("/api/savdo/purchases", headers=ADMIN, json={
            "supplier_id": self.sup["id"], "date": str(date.today()), "ombor": "Istam", "kind": kind,
            "items": [{"material_id": self.glaze["id"], "quantity": qty}]})

    def test_purchase_kind(self):
        a0, x0 = stock("Istam", mw.ARALASH, self.glaze["id"]), stock("Istam", mw.XOMASHYO, self.glaze["id"])
        ok(self.buy("aralash", 7))
        self.assertEqual(stock("Istam", mw.ARALASH, self.glaze["id"]) - a0, 7)
        ok(self.buy("xomashyo", 5))
        self.assertEqual(stock("Istam", mw.XOMASHYO, self.glaze["id"]) - x0, 5)
        self.assertEqual(self.buy("boshqa", 1).status_code, 400)

    def test_production_auto(self):
        ok(self.buy("xomashyo", 100))
        order = {"out_sklad_id": 6, "out_code": 680, "quantity": 10, "auto_sarf": True}
        # No norm for Istam 100 yet: Avto rasxod cannot be used
        if not ok(client.get(f"{URL}/calc?quantity=10&sklad_id=6", headers=ADMIN))["configured"]:
            self.assertEqual(client.post("/api/ishlab-chiqarish/orders", headers=ADMIN, json=order).status_code, 400)
        ok(client.post(URL, headers=ADMIN, json={"sklad_id": 6, "material_id": self.glaze["id"], "qty_per_unit": 1.5}))
        before = stock("Istam", mw.XOMASHYO, self.glaze["id"])
        prod = ok(client.post("/api/ishlab-chiqarish/orders", headers=ADMIN, json={
            **order, "consumed_materials": [{"material_id": self.glaze["id"], "quantity": 99}]}))
        self.assertEqual(before - stock("Istam", mw.XOMASHYO, self.glaze["id"]), 15)   # the norm, not the 99 sent
        self.assertEqual([c["quantity"] for c in prod["consumed_materials"]], [15])
        # Manual entry still works with Avto rasxod off
        ok(client.post("/api/ishlab-chiqarish/orders", headers=ADMIN, json={
            **order, "auto_sarf": False, "consumed_materials": [{"material_id": self.glaze["id"], "quantity": 2}]}))
        self.assertEqual(before - stock("Istam", mw.XOMASHYO, self.glaze["id"]), 17)


if __name__ == "__main__":
    unittest.main()
