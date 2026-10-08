"""Kassa: the card register is always there, and money in / out with a
counterparty moves their balance the right way, in either currency."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import MDMCounterparty
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def registers():
    return {r["name"]: r for r in ok(client.get("/api/kassa/registers", headers=ADMIN))}


def balance(cp_id):
    db = SessionLocal()
    try:
        cp = db.query(MDMCounterparty).get(cp_id)
        return round(cp.current_balance_usd or 0.0, 4), round(cp.current_balance_uzs or 0.0, 2)
    finally:
        db.close()


def tx(register, kind, amount, cp_id=None, currency=None):
    return ok(client.post("/api/kassa/transactions", json={
        "register_id": register["id"], "type": kind, "amount": amount,
        "currency": currency or register["currency"], "category": "boshqa",
        "date": str(date.today()), "counterparty_id": cp_id, "description": "test"}, headers=ADMIN))


class TestKassaCounterparty(unittest.TestCase):

    def test_01_card_register_listed(self):
        regs = registers()
        self.assertIn("Karta UZS", regs)
        self.assertEqual(regs["Karta UZS"]["currency"], "UZS")
        tx(regs["Karta UZS"], "kirim", 150000)
        self.assertAlmostEqual(registers()["Karta UZS"]["balance"], regs["Karta UZS"]["balance"] + 150000, places=2)

    def test_02_supplier_paid_in_uzs_and_usd(self):
        sup = ok(client.post("/api/mdm/counterparties", json={
            "name": "Test Postavshik Kassa", "type": "supplier", "region": "Toshkent", "phone": "+998900001111"},
            headers=ADMIN))
        regs = registers()
        tx(regs["Kassa UZS"], "kirim", 5_000_000)
        tx(regs["Kassa USD"], "kirim", 1000)
        usd0, uzs0 = balance(sup["id"])

        paid = tx(regs["Kassa UZS"], "chiqim", 1_200_000, sup["id"])
        usd1, uzs1 = balance(sup["id"])
        self.assertGreater(usd1, usd0)                     # we owe the supplier less
        self.assertAlmostEqual(uzs1 - uzs0, 1_200_000, places=2)
        self.assertEqual(paid["counterparty_name"], "Test Postavshik Kassa")
        listed = ok(client.get("/api/kassa/transactions", headers=ADMIN))
        row = next(t for t in listed if t["id"] == paid["id"])
        self.assertEqual(row["counterparty_name"], "Test Postavshik Kassa")
        self.assertEqual(row["source_type"], "supplier")

        tx(regs["Kassa USD"], "chiqim", 100, sup["id"])
        self.assertAlmostEqual(balance(sup["id"])[0] - usd1, 100, places=4)

        # A refund from the supplier goes the other way; deleting undoes it exactly.
        refund = tx(regs["Kassa USD"], "kirim", 40, sup["id"])
        self.assertAlmostEqual(balance(sup["id"])[0] - usd1, 60, places=4)
        ok(client.delete(f"/api/kassa/transactions/{refund['id']}", headers=ADMIN))
        ok(client.delete(f"/api/kassa/transactions/{paid['id']}", headers=ADMIN))
        usd2, uzs2 = balance(sup["id"])
        self.assertAlmostEqual(usd2 - usd0, 100, places=4)

    def test_03_client_pays_and_currency_comes_from_register(self):
        cl = ok(client.post("/api/mdm/counterparties", json={
            "name": "Test Mijoz Kassa", "type": "client", "region": "Samarqand", "phone": "+998900002222"},
            headers=ADMIN))
        usd0, _ = balance(cl["id"])
        regs = registers()
        t = tx(regs["Kassa USD"], "kirim", 250, cl["id"], currency="UZS")   # wrong currency sent
        self.assertEqual(t["currency"], "USD")
        self.assertAlmostEqual(balance(cl["id"])[0] - usd0, -250, places=4)
        ok(client.delete(f"/api/kassa/transactions/{t['id']}", headers=ADMIN))
        self.assertAlmostEqual(balance(cl["id"])[0], usd0, places=4)

    def test_04_unknown_counterparty_rejected(self):
        regs = registers()
        res = client.post("/api/kassa/transactions", json={
            "register_id": regs["Kassa UZS"]["id"], "type": "kirim", "amount": 1, "currency": "UZS",
            "category": "boshqa", "date": str(date.today()), "counterparty_id": 999999}, headers=ADMIN)
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
