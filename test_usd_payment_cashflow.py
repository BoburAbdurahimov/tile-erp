"""Order payments in dollars at a chosen rate, and the Cash Flow report showing
real so'm / dollar amounts and what clients paid."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
YM = date.today().strftime("%Y-%m")


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def register(name):
    return next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == name)


def new_order(name, total_price):
    return ok(client.post("/api/orders", json={
        "client_name": name, "client_phone": "+998900000099", "sklad_id": 7, "sell_type": "metr",
        "deadline": "2030-01-01T12:00:00", "items": [{"code": 500, "quantity": 1, "unit_price": total_price / 5}]},
        headers=ADMIN))


class TestUsdPayment(unittest.TestCase):

    def test_01_rate_endpoint(self):
        r = ok(client.get("/api/orders/usd-rate", headers=ADMIN))
        self.assertGreater(r["rate"], 0)

    def test_02_pay_in_dollars(self):
        o = new_order("Dollar mijoz", 1_000_000)
        self.assertAlmostEqual(o["total_amount"], 1_000_000, places=2)
        usd0 = register("Kassa USD")["balance"]

        part = ok(client.post(f"/api/orders/{o['id']}/pay", json={"method": "dollar", "amount_usd": 40, "rate": 12500},
                              headers=ADMIN))
        self.assertAlmostEqual(part["balance"], 500_000, places=2)           # 40 * 12 500 = 500 000 so'm
        self.assertAlmostEqual(register("Kassa USD")["balance"], usd0 + 40, places=2)
        pay = part["payments"][0]
        self.assertEqual((pay["method"], pay["pay_currency"], pay["pay_amount"], pay["rate"]), ("dollar", "USD", 40, 12500))

        # The rest at another rate: 500 000 / 12 700 = 39.37 -> $39.38 overshoots by under a cent: closes it.
        done = ok(client.post(f"/api/orders/{o['id']}/pay", json={"method": "dollar", "amount_usd": 39.38, "rate": 12700},
                              headers=ADMIN))
        self.assertEqual(done["balance"], 0)

        too_much = client.post(f"/api/orders/{o['id']}/pay", json={"method": "dollar", "amount_usd": 5, "rate": 12700},
                               headers=ADMIN)
        self.assertEqual(too_much.status_code, 400)
        self.assertEqual(client.post(f"/api/orders/{o['id']}/pay", json={"method": "dollar", "amount_usd": 5},
                                     headers=ADMIN).status_code, 400)                    # no rate

        # Cancelling a dollar payment gives the dollars back out of Kassa USD.
        back = ok(client.post(f"/api/orders/{o['id']}/payments/{pay['id']}/cancel", headers=ADMIN))
        self.assertAlmostEqual(back["balance"], 500_000, places=2)
        self.assertAlmostEqual(register("Kassa USD")["balance"], usd0 + 39.38, places=2)


class TestCashFlow(unittest.TestCase):

    def test_client_money_listed_and_categories_merged(self):
        o = new_order("Cash flow mijoz", 300_000)
        ok(client.post(f"/api/orders/{o['id']}/pay", json={"method": "naqd", "amount": 300_000}, headers=ADMIN))
        uzs = register("Kassa UZS")
        ok(client.post("/api/kassa/transactions", json={
            "register_id": uzs["id"], "type": "kirim", "amount": 70_000, "currency": "UZS",
            "category": "Mijoz to'lovi", "description": "Kassa formasidan"}, headers=ADMIN))

        cf = ok(client.get(f"/api/moliya/cash-flow?year_month={YM}", headers=ADMIN))
        cats = [c["category"] for c in cf["breakdown_by_category"]]
        self.assertEqual(cats.count("Mijoz to'lovi"), 1)          # order payments and Kassa form in one row
        self.assertNotIn("mijoz_tolovi", cats)
        row = next(c for c in cf["breakdown_by_category"] if c["category"] == "Mijoz to'lovi")
        self.assertGreaterEqual(row["inflow_uzs"], 370_000)

        texts = [(r["description"] or "") for r in cf["client_receipts"]]
        self.assertTrue(any(o["order_number"] in t for t in texts))
        self.assertTrue(any("Kassa formasidan" in t for t in texts))
        mine = next(r for r in cf["client_receipts"] if o["order_number"] in (r["description"] or ""))
        self.assertEqual((mine["amount"], mine["currency"], mine["register_name"]), (300_000, "UZS", "Kassa UZS"))


if __name__ == "__main__":
    unittest.main()
