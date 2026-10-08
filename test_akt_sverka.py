"""Akt-sverka: every row moves the balance the same way the Kassa does, so the
rows add up to the balance shown. Paying a supplier is + (we owe less), money
coming in is - for the counterparty."""
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


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def register(name):
    return next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == name)


def cash(reg, kind, amount, cp_id):
    return ok(client.post("/api/kassa/transactions", json={
        "register_id": reg["id"], "type": kind, "amount": amount, "currency": reg["currency"],
        "category": "boshqa", "date": str(date.today()), "counterparty_id": cp_id}, headers=ADMIN))


def ledger(cp_id):
    return ok(client.get(f"/api/kontragentlar/{cp_id}/ledger?view_currency=USD", headers=ADMIN))


class TestAktSverka(unittest.TestCase):

    def test_supplier(self):
        sup = ok(client.post("/api/mdm/counterparties", json={
            "name": "Akt test postavshik", "type": "supplier", "region": "Toshkent", "phone": "+998900003333"},
            headers=ADMIN))
        db = SessionLocal()
        mat = db.query(MDMMaterial).filter(MDMMaterial.code == "RM-SAND-03").first().id
        db.close()
        ok(client.post("/api/savdo/purchases", json={
            "supplier_id": sup["id"], "warehouse_id": 2, "date": str(date.today()), "currency": "USD",
            "items": [{"material_id": mat, "quantity": 1000, "unit_price": 3.8}]}, headers=ADMIN))
        usd = register("Kassa USD")
        cash(usd, "kirim", 20000, None)
        cash(usd, "chiqim", 1000, sup["id"])      # we pay the supplier
        cash(usd, "kirim", 200, sup["id"])        # the supplier refunds us

        l = ledger(sup["id"])
        rows = {r["type"]: r["amount_view_currency"] for r in l["ledger"]}
        self.assertAlmostEqual(rows["Xarid (Material olindi)"], -3800, places=2)
        self.assertAlmostEqual(rows["To'lov amalga oshirildi (Kassa Chiqim)"], 1000, places=2)
        self.assertAlmostEqual(rows["To'lov qabul qilindi (Kassa Kirim)"], -200, places=2)
        total = sum(r["amount_view_currency"] for r in l["ledger"])
        self.assertAlmostEqual(total, l["current_balance_usd"], places=2)    # rows add up to the balance
        self.assertAlmostEqual(l["current_balance_usd"], -3000, places=2)

    def test_client(self):
        cl = ok(client.post("/api/mdm/counterparties", json={
            "name": "Akt test mijoz", "type": "client", "region": "Samarqand", "phone": "+998900004444"},
            headers=ADMIN))
        usd = register("Kassa USD")
        cash(usd, "kirim", 500, cl["id"])         # the client pays us
        cash(usd, "chiqim", 100, cl["id"])        # we refund the client
        l = ledger(cl["id"])
        rows = {r["type"]: r["amount_view_currency"] for r in l["ledger"]}
        self.assertAlmostEqual(rows["To'lov qabul qilindi (Kassa Kirim)"], -500, places=2)
        self.assertAlmostEqual(rows["To'lov amalga oshirildi (Kassa Chiqim)"], 100, places=2)
        self.assertAlmostEqual(sum(r["amount_view_currency"] for r in l["ledger"]), l["current_balance_usd"], places=2)


if __name__ == "__main__":
    unittest.main()
