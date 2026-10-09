"""Ish haqi departments are "Ma'muriyat" and the 4 Omborlar - the production
lines are gone - and saving the attendance no longer wipes the day's
piecework of people who are still on an old line."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import Employee, JobType, WorkEntry
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
DAY = date(2026, 3, 11)


class TestIshHaqiDepartments(unittest.TestCase):

    def setUp(self):
        self.created = []

    def tearDown(self):
        for emp_id in self.created:                       # the app's delete clears their salary rows
            client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)

    def create(self, department, **extra):
        res = client.post("/api/salary/employees", headers=ADMIN, json={
            "full_name": "Test Xodim", "department": department, "employee_type": "piecework", **extra})
        if res.status_code == 200:
            self.created.append(res.json()["id"])
        return res

    def test_departments_are_omborlar(self):
        ids = [d["id"] for d in client.get("/api/salary/departments", headers=ADMIN).json()["departments"]]
        self.assertEqual(ids[0], "Ma'muriyat")
        self.assertEqual(ids[1:], ["Toxir", "Kodir", "Istam", "Aziz"])           # 4 Omborlar
        self.assertFalse([i for i in ids if "Liniya" in i])

    def test_employee_on_an_ombor(self):
        res = self.create("Kodir")
        self.assertEqual(res.status_code, 200, res.text)
        emp_id = res.json()["id"]
        self.assertEqual(self.create("3-Liniya").status_code, 400)          # lines are gone
        self.assertEqual(self.create("Kodir 120").status_code, 400)         # a yo'nalish, not an Ombor

        self.assertEqual(client.put(f"/api/salary/employees/{emp_id}", headers=ADMIN,
                                    json={"department": ""}).status_code, 400)
        self.assertEqual(client.put(f"/api/salary/employees/{emp_id}", headers=ADMIN,
                                    json={"department": "Aziz"}).status_code, 200)
        emps = client.get("/api/salary/employees", headers=ADMIN).json()
        self.assertEqual(next(e for e in emps if e["id"] == emp_id)["department"], "Aziz")

    def test_yonalish_departments_become_their_ombor(self):
        # Employees saved on a yo'nalish ("Kodir 120") while that was offered
        # are moved to its Ombor on start-up.
        from backend.database import run_data_migrations
        db = SessionLocal()
        try:
            emp = Employee(full_name="Yo'nalish xodimi", department="Kodir 120", employee_type="fixed",
                           hire_date=date(2026, 1, 1), is_active=True)
            db.add(emp)
            db.commit()
            self.created.append(emp.id)
            emp_id = emp.id
        finally:
            db.close()
        run_data_migrations()
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Employee).get(emp_id).department, "Kodir")
        finally:
            db.close()

    def test_attendance_keeps_piecework_of_old_line_workers(self):
        db = SessionLocal()
        try:
            emp = Employee(full_name="Eski liniya xodimi", department="1-Liniya", employee_type="piecework",
                           position="Press Operatori", hire_date=date(2026, 1, 1), is_active=True)
            db.add(emp)
            db.commit()
            self.created.append(emp.id)
            job = db.query(JobType).filter(JobType.is_active == True).first()
            emp_id, job_id = emp.id, job.id
        finally:
            db.close()

        res = client.post("/api/salary/daily-work", headers=ADMIN, json={
            "employee_id": emp_id, "job_type_id": job_id, "date": DAY.isoformat(), "quantity": 40})
        self.assertEqual(res.status_code, 200, res.text)
        res = client.post("/api/salary/daily-attendance", headers=ADMIN, json={
            "date": DAY.isoformat(), "absent_records": []})
        self.assertEqual(res.status_code, 200, res.text)

        db = SessionLocal()
        try:
            left = db.query(WorkEntry).filter(WorkEntry.employee_id == emp_id, WorkEntry.date == DAY).count()
        finally:
            db.close()
        self.assertEqual(left, 1)


if __name__ == "__main__":
    unittest.main()
