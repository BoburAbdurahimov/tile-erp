"""Ish turlari are paid ishbay (per unit done), soatbay (per hour) or fiks (a
set sum per job); a work entry pays quantity x rate in each case."""
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
        fixed = ok(self.job("Press sozlash", "fiks", 150000))["id"]
        self.assertEqual((self.listed(piece)["pay_type"], self.listed(piece)["unit_of_measure"]), ("ishbay", "metr"))
        self.assertEqual((self.listed(hourly)["pay_type"], self.listed(hourly)["unit_of_measure"]), ("soatbay", "soat"))
        self.assertEqual((self.listed(fixed)["pay_type"], self.listed(fixed)["unit_of_measure"]), ("fiks", "ish"))

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

    def test_hours_and_jobs_are_paid(self):
        emp_id = ok(client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Soatbay Xodim", "department": "Istam", "employee_type": "piecework"}))["id"]
        self.emps.append(emp_id)
        hourly = ok(self.job("Yuklash (soat)", "soatbay", 25000))["id"]
        fixed = ok(self.job("Qolip almashtirish", "fiks", 150000))["id"]
        for job_id, qty in [(hourly, 8), (fixed, 2)]:
            ok(client.post("/api/salary/daily-work", headers=ADMIN, json={
                "employee_id": emp_id, "job_type_id": job_id, "date": DAY.isoformat(), "quantity": qty}))
        db = SessionLocal()
        try:
            totals = {w.job_type_id: w.total_amount for w in db.query(WorkEntry).filter(WorkEntry.employee_id == emp_id)}
        finally:
            db.close()
        self.assertEqual(totals[hourly], 8 * 25000)        # 8 hours
        self.assertEqual(totals[fixed], 2 * 150000)        # done twice


if __name__ == "__main__":
    unittest.main()
