"""Ombor order clients are Kontragent clients: an order is tied to the client
with its phone (created when there is none), a delivered order adds to the
client's balance, payments through the Kassa take it off, and all of it shows
in their Akt-sverka. Orders taken before this are linked and booked once."""
import unittest

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import CashTransaction, MDMCounterparty, SkladOrder
from backend.services.counterparty_service import link_order_clients
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def new_order(phone, name="Mijoz Test", qty=2, price=50000, sklad_id=7):
    return ok(client.post("/api/orders", headers=ADMIN, json={
        "client_name": name, "client_phone": phone, "sklad_id": sklad_id, "sell_type": "metr",
        "deadline": "2030-01-01T12:00:00", "items": [{"code": 680, "quantity": qty, "unit_price": price}]}))


def deliver(order):
    ok(client.post("/api/sklad/kirim", headers=ADMIN, json={
        "sklad_id": order["sklad_id"], "items": [{"code": 680, "quantity": 10}]}))
    return ok(client.post(f"/api/orders/{order['id']}/deliver", headers=ADMIN, json={
        "car_number": "01A777AA", "driver_phone": "+998900000002"}))


def clients():
    return ok(client.get("/api/kontragentlar/summary?view_currency=UZS", headers=ADMIN))["clients"]


def client_row(phone_tail):
    return next(c for c in clients() if (c["phone"] or "").replace(" ", "").endswith(phone_tail))


def ledger_ids(cp_id):
    return {e["id"] for e in ok(client.get(f"/api/kontragentlar/{cp_id}/ledger", headers=ADMIN))["ledger"]}


class TestOrderClients(unittest.TestCase):

    def test_01_order_client_balance_and_akt_sverka(self):
        order = new_order("+998 93 111 22 33", name="Sardor Buyurtmachi")
        cp = client_row("931112233")
        self.assertEqual(cp["name"], "Sardor Buyurtmachi")
        self.assertAlmostEqual(cp["balance_uzs"], 0, delta=1)            # nothing owed before delivery

        # Prepayment: they have paid, nothing delivered yet -> we owe them
        paid = ok(client.post(f"/api/orders/{order['id']}/pay", headers=ADMIN,
                              json={"amount": 40000, "method": "naqd"}))
        self.assertAlmostEqual(client_row("931112233")["balance_uzs"], -40000, delta=1)

        deliver(order)                                                    # now they owe the order
        total = order["total_amount"]
        self.assertAlmostEqual(client_row("931112233")["balance_uzs"], total - 40000, delta=1)

        ids = ledger_ids(cp["id"])
        self.assertIn(f"ORD-{order['order_number']}", ids)
        tx_id = next(t["id"] for t in ok(client.get("/api/kassa/transactions", headers=ADMIN))
                     if order["order_number"] in (t["description"] or ""))
        self.assertIn(f"CASH-{tx_id}", ids)

        # Cancelling the payment puts the debt back
        ok(client.post(f"/api/orders/{order['id']}/payments/{paid['payments'][0]['id']}/cancel", headers=ADMIN))
        self.assertAlmostEqual(client_row("931112233")["balance_uzs"], total, delta=1)

        # The same phone written differently is the same client
        again = new_order("998931112233", name="Sardor")
        db = SessionLocal()
        try:
            self.assertEqual(db.get(SkladOrder, again["id"]).counterparty_id, cp["id"])
        finally:
            db.close()

    def test_02_existing_kontragent_client_is_used(self):
        db = SessionLocal()
        try:
            cp = MDMCounterparty(code="OC-1", name="Qurilish Test MCHJ", type="client", phone="+998 97 555 44 33")
            db.add(cp)
            db.commit()
            cp_id = cp.id
        finally:
            db.close()
        order = new_order("+998975554433", name="Ali (MCHJ vakili)")
        db = SessionLocal()
        try:
            self.assertEqual(db.get(SkladOrder, order["id"]).counterparty_id, cp_id)
        finally:
            db.close()

    def test_03_old_orders_are_linked_once(self):
        order = new_order("+998 99 000 11 22", name="Eski Buyurtma", qty=1, price=70000)
        ok(client.post(f"/api/orders/{order['id']}/pay", headers=ADMIN, json={"amount": 30000, "method": "naqd"}))
        deliver(order)
        cp = client_row("990001122")

        # Make it look like an order from before: no client on the order or its
        # payment, nothing on the client's balance.
        db = SessionLocal()
        try:
            o = db.get(SkladOrder, order["id"])
            o.counterparty_id = None
            for tx in db.query(CashTransaction).filter(CashTransaction.counterparty_id == cp["id"]).all():
                tx.counterparty_id = None
            c = db.get(MDMCounterparty, cp["id"])
            c.current_balance_usd = c.current_balance_uzs = 0.0
            db.commit()
        finally:
            db.close()

        db = SessionLocal()
        try:
            self.assertGreaterEqual(link_order_clients(db), 1)
            self.assertEqual(link_order_clients(db), 0)                    # nothing left to do
        finally:
            db.close()
        self.assertAlmostEqual(client_row("990001122")["balance_uzs"], order["total_amount"] - 30000, delta=1)


if __name__ == "__main__":
    unittest.main()
