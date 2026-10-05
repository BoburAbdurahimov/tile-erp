"""Other expenses (prochie rasxodlar) and production without lines."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import CashRegister, MDMCounterparty
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def uzs_register():
    regs = ok(client.get("/api/kassa/registers", headers=ADMIN))
    return next(r for r in regs if r["currency"] == "UZS")


def fund(register_id, amount):
    ok(client.post("/api/kassa/transactions", json={
        "register_id": register_id, "type": "kirim", "amount": amount, "currency": "UZS",
        "category": "boshqa", "date": str(date.today()), "description": "Test kirimi"}, headers=ADMIN))


class TestExpenses(unittest.TestCase):

    def test_01_expense_is_paid_from_kassa(self):
        reg = uzs_register()
        fund(reg["id"], 500000)
        before = uzs_register()["balance"]

        payee = ok(client.post("/api/expenses/counterparties", json={"name": "Test Taksi", "phone": "+998900000009"}, headers=ADMIN))
        db = SessionLocal()
        cp_before = db.query(MDMCounterparty).get(payee["id"]).current_balance_uzs
        db.close()

        exp = ok(client.post("/api/expenses", json={
            "category": "Taksi", "amount": 45000, "register_id": reg["id"],
            "counterparty_id": payee["id"], "description": "Bozorga borib kelish"}, headers=ADMIN))
        self.assertEqual(exp["status"], "Tasdiqlandi")
        self.assertTrue(exp["expense_number"].startswith("XR-"))
        self.assertAlmostEqual(uzs_register()["balance"], before - 45000, places=2)

        # The payee's balance does not change - it only shows who was paid.
        db = SessionLocal()
        self.assertEqual(db.query(MDMCounterparty).get(payee["id"]).current_balance_uzs, cp_before)
        db.close()

        listed = ok(client.get(f"/api/expenses?counterparty_id={payee['id']}", headers=ADMIN))["expenses"]
        self.assertEqual([e["id"] for e in listed], [exp["id"]])

        # Cancelling returns the money.
        ok(client.post(f"/api/expenses/{exp['id']}/cancel", headers=ADMIN))
        self.assertAlmostEqual(uzs_register()["balance"], before, places=2)
        again = client.post(f"/api/expenses/{exp['id']}/cancel", headers=ADMIN)
        self.assertEqual(again.status_code, 400)

    def test_02_not_more_than_the_kassa_holds(self):
        reg = uzs_register()
        res = client.post("/api/expenses", json={
            "category": "Bozorlik", "amount": reg["balance"] + 1, "register_id": reg["id"]}, headers=ADMIN)
        self.assertEqual(res.status_code, 400)

    def test_03_new_category_and_filters(self):
        reg = uzs_register()
        fund(reg["id"], 100000)
        ok(client.post("/api/expenses", json={"category": "Gul sotib olish", "amount": 20000, "register_id": reg["id"]}, headers=ADMIN))
        self.assertIn("Gul sotib olish", ok(client.get("/api/expenses/categories", headers=ADMIN)))
        only = ok(client.get("/api/expenses?category=Gul%20sotib%20olish", headers=ADMIN))["expenses"]
        self.assertTrue(only and all(e["category"] == "Gul sotib olish" for e in only))

    def test_04_permissions_and_history(self):
        self.assertEqual(client.get("/api/expenses", headers={"x-user-role": "Kassir"}).status_code, 200)
        self.assertEqual(client.get("/api/expenses", headers={"x-user-role": "Omborchi"}).status_code, 403)
        kinds = {e["kind"] for e in ok(client.get("/api/history", headers=ADMIN))["events"]}
        self.assertIn("xarajat", kinds)

    def test_05_production_without_a_line(self):
        prod = ok(client.post("/api/ishlab-chiqarish/orders", json={
            "out_sklad_id": 7, "out_code": 680, "quantity": 2,
            "date": str(date.today()), "consumed_materials": []}, headers=ADMIN))
        self.assertIsNone(prod["line_id"])
        self.assertEqual(prod["ombor_label"], "Aziz 120")
        listed = ok(client.get("/api/ishlab-chiqarish/orders", headers=ADMIN))
        self.assertIn(prod["id"], [o["id"] for o in listed])   # a line-less order is listed
        stats = ok(client.get("/api/ishlab-chiqarish/stats-7-days", headers=ADMIN))
        self.assertEqual(stats["owners"], ["Toxir", "Kodir", "Istam", "Aziz"])
        self.assertGreaterEqual(stats["owner_totals"]["Aziz"], 2)


class TestCostingWithoutLines(unittest.TestCase):

    def test_line_less_production_is_costed(self):
        ym = date.today().strftime("%Y-%m")
        before = ok(client.get(f"/api/moliya/pnl?year_month={ym}", headers=ADMIN))
        ok(client.post("/api/ishlab-chiqarish/orders", json={
            "out_sklad_id": 3, "out_code": 540, "quantity": 5,
            "date": str(date.today()), "consumed_materials": []}, headers=ADMIN))
        after = ok(client.get(f"/api/moliya/pnl?year_month={ym}", headers=ADMIN))
        vol = lambda p: sum(l.get("production_volume_m2", 0) for l in p["line_breakdown"])
        self.assertAlmostEqual(vol(after) - vol(before), 5, places=2)


if __name__ == "__main__":
    unittest.main()
