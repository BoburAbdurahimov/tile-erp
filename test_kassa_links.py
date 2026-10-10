"""Kassa is tied to the rest of the ERP: paying a salary, an expense or a
counterparty moves Kassa money and shows on the other side, and deleting the
Kassa entry puts both sides back."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import MDMCounterparty, MonthlySalaryCalculation
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


def kassa_tx(register, kind, amount, cp_id=None, category="boshqa"):
    return ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
        "register_id": register["id"], "type": kind, "amount": amount, "currency": register["currency"],
        "category": category, "date": str(local_today()), "counterparty_id": cp_id, "description": "test"}))


def delete_tx(tx_id):
    return ok(client.delete(f"/api/kassa/transactions/{tx_id}", headers=ADMIN))


class TestKassaLinks(unittest.TestCase):

    def test_01_salary_is_paid_from_kassa(self):
        emp_id = ok(client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Kassa Test Xodim", "department": "Toxir", "employee_type": "fixed",
            "monthly_salary": 2600000, "hire_date": "2026-01-01"}))["id"]
        try:
            ym = local_today().strftime("%Y-%m")
            ok(client.post(f"/api/salary/payroll/{ym}/calculate", headers=ADMIN))
            calc = next(c for c in ok(client.get(f"/api/salary/payroll/{ym}", headers=ADMIN))["calculations"]
                        if c["employee_id"] == emp_id)
            amount = calc["final_amount"]
            self.assertGreater(amount, 0)

            regs = registers()
            uzs, usd = regs["Kassa UZS"], regs["Kassa USD"]
            kassa_tx(uzs, "kirim", amount + 1000)                         # enough money in Kassa UZS
            start = registers()["Kassa UZS"]["balance"]

            pay = lambda reg_id, amt: client.post(f"/api/salary/payroll/{calc['id']}/pay", headers=ADMIN,
                                                  json={"register_id": reg_id, "payment_amount": amt})
            self.assertEqual(pay(usd["id"], amount).status_code, 400)      # so'm salary, not from Kassa USD
            self.assertEqual(pay(uzs["id"], amount * 2).status_code, 400)  # more than calculated
            res = ok(pay(uzs["id"], amount))

            self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start - amount, places=2)
            txs = ok(client.get("/api/kassa/transactions", headers=ADMIN))
            tx = next(t for t in txs if t["id"] == res["cash_transaction_id"])
            self.assertEqual((tx["type"], tx["category"]), ("chiqim", "Ishchilar oyligi / Avans"))
            self.assertIn("Kassa Test Xodim", tx["description"])

            # Deleting the Kassa entry returns the money and the salary is unpaid again
            delete_tx(tx["id"])
            self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start, places=2)
            db = SessionLocal()
            try:
                c = db.get(MonthlySalaryCalculation, calc["id"])
                self.assertNotEqual(c.status, "paid")
                self.assertIsNone(c.cash_transaction_id)
            finally:
                db.close()
            ok(pay(uzs["id"], amount))                                     # and can be paid again
        finally:
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)

    def test_02_expense_is_paid_from_kassa(self):
        uzs = registers()["Kassa UZS"]
        kassa_tx(uzs, "kirim", 50000)
        start = registers()["Kassa UZS"]["balance"]
        exp = ok(client.post("/api/expenses", headers=ADMIN, json={
            "date": str(local_today()), "category": "Taksi", "amount": 30000, "register_id": uzs["id"]}))
        self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start - 30000, places=2)

        txs = ok(client.get("/api/kassa/transactions", headers=ADMIN))
        tx = next(t for t in txs if exp["expense_number"] in (t["description"] or ""))
        self.assertEqual(tx["type"], "chiqim")

        # Deleting it in Kassa cancels the expense, so Xarajatlar agrees with Kassa
        delete_tx(tx["id"])
        self.assertAlmostEqual(registers()["Kassa UZS"]["balance"], start, places=2)
        rows = ok(client.get("/api/expenses", headers=ADMIN))["expenses"]
        self.assertEqual(next(e for e in rows if e["id"] == exp["id"])["status"], "Bekor")

    def test_03_counterparties_move_with_kassa(self):
        db = SessionLocal()
        try:
            sup = MDMCounterparty(code="KL-SUP", name="Kassa Link Supplier", type="supplier")
            cli = MDMCounterparty(code="KL-CLI", name="Kassa Link Client", type="client")
            db.add_all([sup, cli])
            db.commit()
            sup_id, cli_id = sup.id, cli.id
        finally:
            db.close()

        def bal(cp_id):
            s = ok(client.get("/api/kontragentlar/summary?view_currency=UZS", headers=ADMIN))
            row = next(c for c in s["clients"] + s["suppliers"] if c["id"] == cp_id)
            return row["balance_uzs"]

        def ledger_ids(cp_id):
            return {e["id"] for e in ok(client.get(f"/api/kontragentlar/{cp_id}/ledger", headers=ADMIN))["ledger"]}

        try:
            uzs = registers()["Kassa UZS"]
            kassa_tx(uzs, "kirim", 200000)
            paid = kassa_tx(uzs, "chiqim", 120000, cp_id=sup_id, category="Postavshikka to'lov")
            got = kassa_tx(uzs, "kirim", 70000, cp_id=cli_id, category="Mijoz to'lovi")

            self.assertAlmostEqual(bal(sup_id), 120000, delta=1)     # money out to them: +
            self.assertAlmostEqual(bal(cli_id), -70000, delta=1)     # money in from them: -
            self.assertIn(f"CASH-{paid['id']}", ledger_ids(sup_id))  # shows in their Akt-sverka
            self.assertIn(f"CASH-{got['id']}", ledger_ids(cli_id))

            delete_tx(paid["id"])
            delete_tx(got["id"])
            self.assertAlmostEqual(bal(sup_id), 0, delta=1)
            self.assertAlmostEqual(bal(cli_id), 0, delta=1)
        finally:
            db = SessionLocal()
            try:
                db.query(MDMCounterparty).filter(MDMCounterparty.id.in_([sup_id, cli_id])).delete()
                db.commit()
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
