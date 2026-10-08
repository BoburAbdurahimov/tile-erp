"""Cancelling an order payment gives the money back out of the Kassa and
re-opens the order's balance."""
import unittest

from fastapi.testclient import TestClient

from backend.main import app
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def register(name):
    return next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == name)


class TestCancelOrderPayment(unittest.TestCase):

    def test_cancel_payment(self):
        order = ok(client.post("/api/orders", json={
            "client_name": "To'lov test", "client_phone": "+998900000077",
            "sklad_id": 5, "sell_type": "metr", "deadline": "2030-01-01T12:00:00",
            "items": [{"code": 680, "quantity": 2, "unit_price": 50000}]}, headers=ADMIN))
        oid, total = order["id"], order["total_amount"]

        cash0, card0 = register("Kassa UZS")["balance"], register("Karta UZS")["balance"]
        ok(client.post(f"/api/orders/{oid}/pay", json={"amount": 100000, "method": "naqd"}, headers=ADMIN))
        paid = ok(client.post(f"/api/orders/{oid}/pay", json={"amount": total - 100000, "method": "karta"}, headers=ADMIN))
        self.assertEqual(paid["balance"], 0)
        self.assertEqual(len(paid["payments"]), 2)
        card_pay = next(p for p in paid["payments"] if p["method"] == "karta")

        # Only an Admin may take money back out of the Kassa.
        self.assertEqual(client.post(f"/api/orders/{oid}/payments/{card_pay['id']}/cancel",
                                     headers={"x-user-role": "Sotish (Realizatsiya)"}).status_code, 403)

        after = ok(client.post(f"/api/orders/{oid}/payments/{card_pay['id']}/cancel", headers=ADMIN))
        self.assertAlmostEqual(after["balance"], total - 100000, places=2)
        self.assertEqual([p["method"] for p in after["payments"]], ["naqd"])
        self.assertAlmostEqual(register("Karta UZS")["balance"], card0, places=2)
        self.assertAlmostEqual(register("Kassa UZS")["balance"], cash0 + 100000, places=2)

        # Twice is refused; the order can be paid again.
        self.assertEqual(client.post(f"/api/orders/{oid}/payments/{card_pay['id']}/cancel",
                                     headers=ADMIN).status_code, 400)
        again = ok(client.post(f"/api/orders/{oid}/pay", json={"amount": total - 100000, "method": "naqd"}, headers=ADMIN))
        self.assertEqual(again["balance"], 0)

    def test_cannot_take_back_money_already_spent(self):
        order = ok(client.post("/api/orders", json={
            "client_name": "Sarflangan pul", "client_phone": "+998900000078",
            "sklad_id": 5, "sell_type": "metr", "deadline": "2030-01-01T12:00:00",
            "items": [{"code": 680, "quantity": 1, "unit_price": 40000}]}, headers=ADMIN))
        paid = ok(client.post(f"/api/orders/{order['id']}/pay", json={"amount": order["total_amount"], "method": "karta"},
                              headers=ADMIN))
        card = register("Karta UZS")
        # Spend everything on the card.
        ok(client.post("/api/kassa/transactions", json={
            "register_id": card["id"], "type": "chiqim", "amount": card["balance"], "currency": "UZS",
            "category": "boshqa", "description": "test"}, headers=ADMIN))
        res = client.post(f"/api/orders/{order['id']}/payments/{paid['payments'][0]['id']}/cancel", headers=ADMIN)
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
