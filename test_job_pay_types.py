"""Ish turlari are paid ishbay (per unit done), soatbay (per hour) or fiks (a
monthly salary). An employee's position is an Ish turi: a fiks one makes them
a salaried employee on its monthly pay, the others are paid from naryad
entries (quantity x rate)."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import JobType, WorkEntry
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
DAY = date(2026, 3, 12)


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


class TestJobPayTypes(unittest.TestCase):

    def setUp(self):
        self.jobs, self.emps = [], []

    def tearDown(self):
        for emp_id in self.emps:
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)
        for job_id in self.jobs:
            client.delete(f"/api/salary/job-types/{job_id}", headers=ADMIN)

    def job(self, name, pay_type, price, unit="m2"):
        res = client.post("/api/salary/job-types", headers=ADMIN, json={
            "name": name, "pay_type": pay_type, "unit_of_measure": unit, "price_per_unit": price})
        if res.status_code == 200:
            self.jobs.append(res.json()["id"])
        return res

    def listed(self, job_id):
        return next(j for j in ok(client.get("/api/salary/job-types", headers=ADMIN)) if j["id"] == job_id)

    def test_types_and_units(self):
        piece = ok(self.job("Saralash", "ishbay", 500, unit="metr"))["id"]
        hourly = ok(self.job("Pech tozalash", "soatbay", 25000))["id"]
        fixed = ok(self.job("Buxgalter", "fiks", 6000000))["id"]
        self.assertEqual((self.listed(piece)["pay_type"], self.listed(piece)["unit_of_measure"]), ("ishbay", "metr"))
        self.assertEqual((self.listed(hourly)["pay_type"], self.listed(hourly)["unit_of_measure"]), ("soatbay", "soat"))
        self.assertEqual((self.listed(fixed)["pay_type"], self.listed(fixed)["unit_of_measure"]), ("fiks", "oy"))

        self.assertEqual(self.job("Noma'lum", "kunbay", 100).status_code, 400)
        self.assertEqual(self.job("Bepul", "ishbay", 0).status_code, 400)

        # Switching back to ishbay takes the unit given
        ok(client.put(f"/api/salary/job-types/{hourly}", headers=ADMIN,
                      json={"pay_type": "ishbay", "unit_of_measure": "dona"}))
        self.assertEqual((self.listed(hourly)["pay_type"], self.listed(hourly)["unit_of_measure"]), ("ishbay", "dona"))

    def test_rows_from_before_are_ishbay(self):
        db = SessionLocal()
        try:
            jt = JobType(name="Eski ish turi", unit_of_measure="m2", price_per_unit=300, pay_type=None)
            db.add(jt)
            db.commit()
            self.jobs.append(jt.id)
            job_id = jt.id
        finally:
            db.close()
        self.assertEqual(self.listed(job_id)["pay_type"], "ishbay")

    def employee(self, job_id, **extra):
        res = client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Lavozim Xodim", "department": "Istam", "job_type_id": job_id,
            "hire_date": "2026-01-01", **extra})
        if res.status_code == 200:
            self.emps.append(res.json()["id"])
        return res

    def staff(self, emp_id):
        return next(e for e in ok(client.get("/api/salary/employees", headers=ADMIN)) if e["id"] == emp_id)

    def test_hours_are_paid_and_fiks_is_not_a_naryad(self):
        hourly = ok(self.job("Yuklash (soat)", "soatbay", 25000))["id"]
        fixed = ok(self.job("Qorovul", "fiks", 3000000))["id"]
        emp_id = ok(self.employee(hourly))["id"]
        ok(client.post("/api/salary/daily-work", headers=ADMIN, json={
            "employee_id": emp_id, "job_type_id": hourly, "date": DAY.isoformat(), "quantity": 8}))
        db = SessionLocal()
        try:
            totals = {w.job_type_id: w.total_amount for w in db.query(WorkEntry).filter(WorkEntry.employee_id == emp_id)}
        finally:
            db.close()
        self.assertEqual(totals[hourly], 8 * 25000)        # 8 hours
        res = client.post("/api/salary/daily-work", headers=ADMIN, json={
            "employee_id": emp_id, "job_type_id": fixed, "date": DAY.isoformat(), "quantity": 1})
        self.assertEqual(res.status_code, 400)              # a monthly salary, not a naryad

    def test_position_decides_how_pay_is_worked_out(self):
        fixed = ok(self.job("Bosh buxgalter", "fiks", 6000000))["id"]
        piece = ok(self.job("Saralovchi", "ishbay", 500))["id"]
        hourly = ok(self.job("Yordamchi (soat)", "soatbay", 20000))["id"]

        # fiks: a salaried employee on the position's monthly pay (or the one given)
        a = ok(self.employee(fixed))["id"]
        self.assertEqual((self.staff(a)["employee_type"], self.staff(a)["monthly_salary"], self.staff(a)["position"]),
                         ("fixed", 6000000, "Bosh buxgalter"))
        b = ok(self.employee(fixed, monthly_salary=6500000))["id"]
        self.assertEqual(self.staff(b)["monthly_salary"], 6500000)

        # ishbay / soatbay: paid from naryad entries
        c = ok(self.employee(piece))["id"]
        self.assertEqual((self.staff(c)["employee_type"], self.staff(c)["job_type_id"]), ("piecework", piece))
        ok(client.put(f"/api/salary/employees/{c}", headers=ADMIN, json={"job_type_id": hourly}))
        self.assertEqual((self.staff(c)["employee_type"], self.staff(c)["position"]), ("piecework", "Yordamchi (soat)"))
        ok(client.put(f"/api/salary/employees/{c}", headers=ADMIN, json={"job_type_id": fixed}))
        self.assertEqual((self.staff(c)["employee_type"], self.staff(c)["monthly_salary"]), ("fixed", 6000000))

        self.assertEqual(self.employee(999999).status_code, 400)          # no such Ish turi

        # The salaried one is paid the position's month in the payroll
        ym = "2026-02"
        calcs = ok(client.get(f"/api/salary/payroll/{ym}?recalculate=true", headers=ADMIN))["calculations"]
        self.assertEqual(next(x for x in calcs if x["employee_id"] == a)["final_amount"], 6000000)


if __name__ == "__main__":
    unittest.main()
