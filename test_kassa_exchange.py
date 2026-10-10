"""Konvertatsiya between Kassa registers and the storno of a salary payment.

A konvertatsiya is a chiqim from one register and a kirim into the other, at
the day's rate unless another is given; deleting either side undoes both,
and the cash flow report leaves it out. A paid salary can be taken back
(storno): the money returns to its Kassa and the salary is unpaid again."""
import unittest

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import CashExchange, CashRegister, CashTransaction, MonthlySalaryCalculation
from backend.services.currency_service import get_exchange_rate_for_date
from backend.services.dates import local_today
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def registers():
    return {r["name"]: r for r in ok(client.get("/api/kassa/registers", headers=ADMIN))}


def kirim(reg, amount, currency):
    ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
        "register_id": reg["id"], "type": "kirim", "amount": amount, "currency": currency,
        "category": "boshqa", "date": str(local_today()), "description": "test"}))


class TestKassaExchange(unittest.TestCase):

    def setUp(self):
        self.today = local_today()
        regs = registers()
        self.usd, self.uzs = regs["Kassa USD"], regs["Kassa UZS"]
        kirim(self.usd, 500, "USD")
        kirim(self.uzs, 3000000, "UZS")

    def exchange(self, src, dst, amount, **extra):
        return client.post("/api/kassa/exchange", headers=ADMIN, json={
            "from_register_id": src["id"], "to_register_id": dst["id"], "amount": amount,
            "date": str(self.today), **extra})

    def balances(self):
        regs = registers()
        return regs["Kassa USD"]["balance"], regs["Kassa UZS"]["balance"]

    def cash_flow(self):
        return ok(client.get(f"/api/moliya/cash-flow?year_month={self.today:%Y-%m}", headers=ADMIN))

    def test_usd_to_uzs_at_the_days_rate_and_back_at_a_given_rate(self):
        db = SessionLocal()
        try:
            rate = get_exchange_rate_for_date(db, self.today)
        finally:
            db.close()
        usd0, uzs0 = self.balances()
        flow0 = self.cash_flow()

        sold = ok(self.exchange(self.usd, self.uzs, 100))
        self.assertAlmostEqual(sold["to_amount"], round(100 * rate, 2), delta=0.01)
        self.assertEqual(sold["rate"], rate)
        usd1, uzs1 = self.balances()
        self.assertAlmostEqual(usd1, usd0 - 100, delta=0.001)
        self.assertAlmostEqual(uzs1, uzs0 + 100 * rate, delta=0.01)

        bought = ok(self.exchange(self.uzs, self.usd, 1300000, rate=13000, note="bozor"))
        self.assertAlmostEqual(bought["to_amount"], 100, delta=0.001)
        usd2, uzs2 = self.balances()
        self.assertAlmostEqual(usd2, usd1 + 100, delta=0.001)
        self.assertAlmostEqual(uzs2, uzs1 - 1300000, delta=0.01)

        # Both sides are in the Kassa as Konvertatsiya, but not in the cash flow
        db = SessionLocal()
        try:
            legs = db.query(CashTransaction).filter(CashTransaction.id.in_(
                [sold["out_tx_id"], sold["in_tx_id"]])).all()
            self.assertEqual(sorted((t.type, t.currency, t.category) for t in legs),
                             [("chiqim", "USD", "Konvertatsiya"), ("kirim", "UZS", "Konvertatsiya")])
        finally:
            db.close()
        flow1 = self.cash_flow()
        for key in ("total_inflows_usd", "total_outflows_usd", "total_inflows_uzs", "total_outflows_uzs"):
            self.assertAlmostEqual(flow1[key], flow0[key], delta=0.01, msg=key)

        # Deleting one side in the Kassa undoes both
        ok(client.delete(f"/api/kassa/transactions/{bought['in_tx_id']}", headers=ADMIN))
        self.assertEqual(self.balances(), (usd1, uzs1))
        db = SessionLocal()
        try:
            self.assertIsNone(db.get(CashTransaction, bought["out_tx_id"]))
            self.assertIsNone(db.get(CashExchange, bought["id"]))
        finally:
            db.close()
        ok(client.delete(f"/api/kassa/transactions/{sold['out_tx_id']}", headers=ADMIN))
        self.assertEqual(self.balances(), (usd0, uzs0))

    def test_same_currency_and_refusals(self):
        db = SessionLocal()
        try:
            card = CashRegister(name="Test Karta UZS", currency="UZS", balance=0.0)
            db.add(card)
            db.commit()
            card_reg = {"id": card.id}
        finally:
            db.close()
        moved, spent = None, None
        try:
            moved = ok(self.exchange(self.uzs, card_reg, 50000))
            self.assertEqual((moved["to_amount"], moved["rate"]), (50000, None))
            self.assertEqual(registers()["Test Karta UZS"]["balance"], 50000)

            # The card spent it: the transfer can no longer be undone
            spent = ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
                "register_id": card_reg["id"], "type": "chiqim", "amount": 30000, "currency": "UZS",
                "category": "boshqa", "date": str(self.today), "description": "test"}))["id"]
            self.assertEqual(client.delete(f"/api/kassa/transactions/{moved['in_tx_id']}",
                                           headers=ADMIN).status_code, 400)

            self.assertEqual(self.exchange(self.usd, self.usd, 10).status_code, 400)        # same register
            self.assertEqual(self.exchange(self.usd, self.uzs, 0).status_code, 400)
            too_much = registers()["Kassa USD"]["balance"] + 1
            self.assertEqual(self.exchange(self.usd, self.uzs, too_much).status_code, 400)
            self.assertEqual(self.exchange(self.usd, self.uzs, 10, rate=-5).status_code, 400)
        finally:
            if spent:
                client.delete(f"/api/kassa/transactions/{spent}", headers=ADMIN)
            if moved:
                client.delete(f"/api/kassa/transactions/{moved['in_tx_id']}", headers=ADMIN)
            db = SessionLocal()
            try:
                db.query(CashRegister).filter(CashRegister.id == card_reg["id"]).delete()
                db.commit()
            finally:
                db.close()


class TestSalaryStorno(unittest.TestCase):

    def test_storno_returns_the_money(self):
        ym = local_today().strftime("%Y-%m")
        emp_id = ok(client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Storno Xodim", "department": "Istam", "employee_type": "fixed",
            "monthly_salary": 1300000, "hire_date": "2026-01-01"}))["id"]
        try:
            ok(client.post(f"/api/salary/payroll/{ym}/calculate", headers=ADMIN))
            calc = next(c for c in ok(client.get(f"/api/salary/payroll/{ym}", headers=ADMIN))["calculations"]
                        if c["employee_id"] == emp_id)
            uzs = registers()["Kassa UZS"]
            kirim(uzs, calc["final_amount"], "UZS")
            start = registers()["Kassa UZS"]["balance"]
            paid = ok(client.post(f"/api/salary/payroll/{calc['id']}/pay", headers=ADMIN,
                                  json={"register_id": uzs["id"], "payment_amount": calc["final_amount"]}))
            self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start - calc["final_amount"], places=2)

            ok(client.post(f"/api/salary/payroll/{calc['id']}/storno", headers=ADMIN))
            self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start, places=2)
            db = SessionLocal()
            try:
                c = db.get(MonthlySalaryCalculation, calc["id"])
                self.assertEqual((c.status, c.cash_transaction_id, c.paid_at), ("draft", None, None))
                self.assertIsNone(db.get(CashTransaction, paid["cash_transaction_id"]))
            finally:
                db.close()

            self.assertEqual(client.post(f"/api/salary/payroll/{calc['id']}/storno", headers=ADMIN).status_code, 400)
            ok(client.post(f"/api/salary/payroll/{calc['id']}/pay", headers=ADMIN,
                           json={"register_id": uzs["id"], "payment_amount": calc["final_amount"]}))
            ok(client.post(f"/api/salary/payroll/{calc['id']}/storno", headers=ADMIN))      # paid again, back again
        finally:
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)


if __name__ == "__main__":
    unittest.main()
