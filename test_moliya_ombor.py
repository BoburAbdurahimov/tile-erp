"""Moliya PnL: production cost by Ombor, and revenue from Ombor sales."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import MDMMaterial
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
YM = date.today().strftime("%Y-%m")


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def pnl():
    return ok(client.get(f"/api/moliya/pnl?year_month={YM}", headers=ADMIN))


def row(p, sklad_id):
    return next(o for o in p["ombor_breakdown"] if o["sklad_id"] == sklad_id)


class TestMoliyaByOmbor(unittest.TestCase):

    def test_production_cost_goes_to_its_ombor(self):
        db = SessionLocal()
        clay = db.query(MDMMaterial).filter(MDMMaterial.code == "RM-CLAY-01").first().id
        db.close()
        sup = ok(client.get("/api/mdm/counterparties?type=supplier", headers=ADMIN))[0]
        ok(client.post("/api/savdo/purchases", json={
            "supplier_id": sup["id"], "warehouse_id": 2, "date": str(date.today()), "currency": "USD",
            "items": [{"material_id": clay, "quantity": 1000, "unit_price": 0.05}]}, headers=ADMIN))

        before = pnl()
        k100 = row(before, 4)
        self.assertEqual(k100["label"], "Kodir 100")
        ok(client.post("/api/ishlab-chiqarish/orders", json={
            "out_sklad_id": 4, "out_code": 680, "quantity": 50, "date": str(date.today()),
            "consumed_materials": [{"material_id": clay, "warehouse_id": 2, "quantity": 100}]}, headers=ADMIN))
        after = pnl()
        k100b = row(after, 4)
        self.assertAlmostEqual(k100b["production_volume"] - k100["production_volume"], 50, places=2)
        self.assertGreater(k100b["direct_materials_cost_usd"], k100["direct_materials_cost_usd"])
        self.assertAlmostEqual(row(after, 3)["production_volume"], row(before, 3)["production_volume"], places=2)
        self.assertAlmostEqual(sum(o["volume_percentage"] for o in after["ombor_breakdown"]), 100, delta=0.1)

    def test_ombor_sales_count_as_revenue(self):
        ok(client.post("/api/sklad/kirim", json={"sklad_id": 5, "items": [{"code": 680, "quantity": 10}]}, headers=ADMIN))
        before = pnl()
        ok(client.post("/api/sklad/sotish", json={
            "sklad_id": 5, "items": [{"code": 680, "quantity": 2, "unit_price": 100000}],
            "sell_type": "metr", "delivery_cost": 50000, "client_name": "Test mijoz"}, headers=ADMIN))
        after = pnl()
        gained = after["revenue_ombor_usd"] - before["revenue_ombor_usd"]
        self.assertGreater(gained, 0)
        self.assertAlmostEqual(after["revenue_usd"] - before["revenue_usd"], gained, places=1)


if __name__ == "__main__":
    unittest.main()
