"""Avans, shtraf and premiya, and soatbay hours.

To pay = earned + premiya - shtraf - avans. An avans is paid out at once from
a so'm Kassa (a chiqim linked to it): deleting it in Ish haqi or in the Kassa
undoes both, and Moliya books it where the person works, like the salary.
Soatbay people get the day's hours x their hourly rate."""
import unittest

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import CashTransaction, SalaryAdjustment, WorkEntry
from backend.services.cost_allocation_service import calculate_monthly_production_cost_allocation
from backend.services.currency_service import convert_amount
from backend.services.dates import local_today
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def register(name):
    return next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == name)


class TestSalaryAdjustments(unittest.TestCase):

    def setUp(self):
        self.today = local_today()
        self.ym = self.today.strftime("%Y-%m")
        self.emps, self.jobs, self.adjs = [], [], []
        self.uzs = register("Kassa UZS")
        ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
            "register_id": self.uzs["id"], "type": "kirim", "amount": 5000000, "currency": "UZS",
            "category": "boshqa", "date": str(self.today), "description": "test"}))

    def tearDown(self):
        for adj_id in self.adjs:
            client.delete(f"/api/salary/adjustments/{adj_id}", headers=ADMIN)
        for emp_id in self.emps:
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)
        for job_id in self.jobs:
            client.delete(f"/api/salary/job-types/{job_id}", headers=ADMIN)

    def employee(self, name, dept="Kodir", salary=3000000):
        emp_id = ok(client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": name, "department": dept, "employee_type": "fixed",
            "monthly_salary": salary, "hire_date": "2026-01-01"}))["id"]
        self.emps.append(emp_id)
        return emp_id

    def adjust(self, emp_id, kind, amount, **extra):
        res = client.post("/api/salary/adjustments", headers=ADMIN, json={
            "employee_id": emp_id, "kind": kind, "amount": amount, "year_month": self.ym,
            "date": str(self.today), **extra})
        if res.status_code == 200:
            self.adjs.append(res.json()["id"])
        return res

    def calc(self, emp_id):
        calcs = ok(client.get(f"/api/salary/payroll/{self.ym}?recalculate=true", headers=ADMIN))["calculations"]
        return next(c for c in calcs if c["employee_id"] == emp_id)

    def test_pay_is_earned_plus_premiya_less_shtraf_and_avans(self):
        emp = self.employee("Avans Xodim")
        earned = self.calc(emp)["final_amount"]
        balance = register("Kassa UZS")["balance"]

        ok(self.adjust(emp, "premiya", 400000, reason="reja"))
        ok(self.adjust(emp, "shtraf", 150000, reason="kechikdi"))
        avans = ok(self.adjust(emp, "avans", 1000000, register_id=self.uzs["id"]))
        c = self.calc(emp)
        self.assertEqual((c["bonus_amount"], c["penalty_amount"], c["advance_paid"]), (400000, 150000, 1000000))
        self.assertAlmostEqual(c["final_amount"], earned + 400000 - 150000 - 1000000, delta=0.01)

        # The avans left the Kassa as a salary chiqim
        self.assertAlmostEqual(register("Kassa UZS")["balance"], balance - 1000000, delta=0.01)
        db = SessionLocal()
        try:
            tx = db.get(CashTransaction, avans["cash_transaction_id"])
            self.assertEqual((tx.type, tx.amount, tx.category), ("chiqim", 1000000, "Ishchilar oyligi / Avans"))
        finally:
            db.close()
        listed = ok(client.get(f"/api/salary/adjustments?year_month={self.ym}", headers=ADMIN))["items"]
        self.assertEqual({a["kind"] for a in listed if a["employee_id"] == emp}, {"avans", "shtraf", "premiya"})

        # Deleting the avans in Ish haqi returns the money and the pay
        ok(client.delete(f"/api/salary/adjustments/{avans['id']}", headers=ADMIN))
        self.adjs.remove(avans["id"])
        self.assertAlmostEqual(register("Kassa UZS")["balance"], balance, delta=0.01)
        self.assertAlmostEqual(self.calc(emp)["final_amount"], earned + 400000 - 150000, delta=0.01)

    def test_deleting_the_kassa_entry_removes_the_avans(self):
        emp = self.employee("Kassa Avans")
        earned = self.calc(emp)["final_amount"]
        avans = ok(self.adjust(emp, "avans", 700000, register_id=self.uzs["id"]))
        ok(client.delete(f"/api/kassa/transactions/{avans['cash_transaction_id']}", headers=ADMIN))
        self.adjs.remove(avans["id"])
        db = SessionLocal()
        try:
            self.assertIsNone(db.get(SalaryAdjustment, avans["id"]))
        finally:
            db.close()
        self.assertAlmostEqual(self.calc(emp)["final_amount"], earned, delta=0.01)

    def test_avans_is_refused_when_it_cannot_be_paid(self):
        emp = self.employee("Rad Xodim")
        usd = register("Kassa USD")
        self.assertEqual(self.adjust(emp, "avans", 100000).status_code, 400)                          # no Kassa
        self.assertEqual(self.adjust(emp, "avans", 100000, register_id=usd["id"]).status_code, 400)   # dollars
        too_much = register("Kassa UZS")["balance"] + 1000
        self.assertEqual(self.adjust(emp, "avans", too_much, register_id=self.uzs["id"]).status_code, 400)
        self.assertEqual(self.adjust(emp, "bonus", 100000).status_code, 400)                          # unknown kind
        self.assertEqual(self.adjust(emp, "premiya", 0).status_code, 400)

    def test_avans_is_booked_where_the_person_works(self):
        emp = self.employee("Moliya Avans", dept="Ma'muriyat")
        db = SessionLocal()
        try:
            before = calculate_monthly_production_cost_allocation(db, self.ym)
        finally:
            db.close()
        ok(self.adjust(emp, "avans", 600000, register_id=self.uzs["id"]))
        db = SessionLocal()
        try:
            after = calculate_monthly_production_cost_allocation(db, self.ym)
            usd = convert_amount(600000, "UZS", "USD", self.today, db)
        finally:
            db.close()
        self.assertAlmostEqual(after["admin_salary_usd"] - before["admin_salary_usd"], usd, delta=0.02)
        self.assertAlmostEqual(after["total_indirect_expenses_usd"], before["total_indirect_expenses_usd"], delta=0.01)


class TestSoatbayHours(unittest.TestCase):

    def setUp(self):
        self.jobs, self.emps = [], []

    def tearDown(self):
        for emp_id in self.emps:
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)
        for job_id in self.jobs:
            client.delete(f"/api/salary/job-types/{job_id}", headers=ADMIN)

    def job(self, name, pay_type, price):
        job_id = ok(client.post("/api/salary/job-types", headers=ADMIN, json={
            "name": name, "pay_type": pay_type, "unit_of_measure": "m2", "price_per_unit": price}))["id"]
        self.jobs.append(job_id)
        return job_id

    def entries(self, emp_id, day):
        db = SessionLocal()
        try:
            return [(w.job_type_id, w.quantity, w.total_amount) for w in
                    db.query(WorkEntry).filter(WorkEntry.employee_id == emp_id, WorkEntry.date == day)]
        finally:
            db.close()

    def test_hours_replace_the_day(self):
        day = local_today()
        hourly = self.job("Soatbay yuklash", "soatbay", 30000)
        piece = self.job("Ishbay saralash", "ishbay", 500)
        emp = ok(client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Soatbay Xodim", "department": "Aziz", "job_type_id": hourly, "hire_date": "2026-01-01"}))["id"]
        self.emps.append(emp)

        def save(hours, job_id=hourly):
            return client.post("/api/salary/daily-hours", headers=ADMIN, json={
                "date": str(day), "items": [{"employee_id": emp, "job_type_id": job_id, "hours": hours}]})

        ok(save(8))
        self.assertEqual(self.entries(emp, day), [(hourly, 8, 240000)])
        ok(save(6.5))                                                     # replaced, not added
        self.assertEqual(self.entries(emp, day), [(hourly, 6.5, 195000)])
        ym = day.strftime("%Y-%m")
        calcs = ok(client.get(f"/api/salary/payroll/{ym}?recalculate=true", headers=ADMIN))["calculations"]
        self.assertEqual(next(c for c in calcs if c["employee_id"] == emp)["piecework_total"], 195000)
        ok(save(0))
        self.assertEqual(self.entries(emp, day), [])

        self.assertEqual(save(8, job_id=piece).status_code, 400)          # not a soatbay job
        self.assertEqual(save(25).status_code, 400)                       # more than a day


if __name__ == "__main__":
    unittest.main()
