"""Ish haqi for someone other than an Admin: only their Ombor's people (never
Ma'muriyat), and only Kunlik davomat and Xodimlar - Oylik hisob-kitob,
Avans/Shtraf/Premiya and Ish turlari stay with the Admin."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import User, AttendanceEntry
from backend.auth_utils import create_token
from backend.api.auth import get_current_user_role, get_current_username, get_ombor_scope
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
DAY = date(2026, 10, 14)


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def login_as(username, role, sklads=None):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, full_name=username, role=role, password_hash="x")
            db.add(u)
        u.role, u.is_active, u.is_archived, u.ombor_sklads = role, True, False, sklads
        db.commit()
        return {"Authorization": f"Bearer {create_token(u.id, u.username)}"}
    finally:
        db.close()


class TestIshHaqiScope(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.saved = {d: app.dependency_overrides.pop(d, None)
                     for d in (get_current_user_role, get_current_username, get_ombor_scope)}
        cls.admin = login_as("t_ih_admin", "Admin")
        cls.tohir = login_as("t_ih_tohir", "Ish haqi,O'chirish", "1,2")
        jt = ok(client.post("/api/salary/job-types", headers=cls.admin, json={
            "name": "IH test kesish", "unit_of_measure": "dona", "price_per_unit": 500, "pay_type": "ishbay"}))
        cls.job = jt.get("id") or jt.get("job_type", {}).get("id")

        def emp(name, dept):
            return ok(client.post("/api/salary/employees", headers=cls.admin, json={
                "full_name": name, "department": dept, "employee_type": "fixed", "position": "Ishchi",
                "monthly_salary": 3000000, "standard_work_days": 26, "hire_date": "2026-01-01"}))["id"]
        cls.toxir_emp = emp("IH Toxir ishchi", "Toxir")
        cls.istam_emp = emp("IH Istam ishchi", "Istam")
        cls.office_emp = emp("IH Ofis xodimi", "Ma'muriyat")

    @classmethod
    def tearDownClass(cls):
        for d, fn in cls.saved.items():
            if fn:
                app.dependency_overrides[d] = fn

    def test_only_their_ombor(self):
        self.assertEqual([d["id"] for d in ok(client.get("/api/salary/departments", headers=self.tohir))["departments"]], ["Toxir"])
        names = {e["full_name"] for e in ok(client.get("/api/salary/employees", headers=self.tohir))}
        self.assertIn("IH Toxir ishchi", names)
        self.assertFalse(names & {"IH Istam ishchi", "IH Ofis xodimi"})
        daily = ok(client.get(f"/api/salary/daily-data?date_str={DAY}", headers=self.tohir))
        self.assertTrue(all(e["department"] == "Toxir" for e in daily["fixed_employees"]))
        # Admin sees everyone, Ma'muriyat included
        self.assertIn("Ma'muriyat", [d["id"] for d in ok(client.get("/api/salary/departments", headers=self.admin))["departments"]])

        self.assertEqual(client.post("/api/salary/employees", headers=self.tohir, json={
            "full_name": "x", "department": "Istam", "employee_type": "fixed", "monthly_salary": 1}).status_code, 403)
        self.assertEqual(client.put(f"/api/salary/employees/{self.office_emp}", headers=self.tohir,
                                    json={"full_name": "y"}).status_code, 403)

    def test_admin_tabs_are_closed(self):
        ym = f"{DAY:%Y-%m}"
        for method, url in [("get", f"/api/salary/payroll/{ym}"), ("post", f"/api/salary/payroll/{ym}/calculate"),
                            ("get", f"/api/salary/adjustments?year_month={ym}"), ("get", f"/api/salary/payroll/{ym}/export-excel")]:
            self.assertEqual(getattr(client, method)(url, headers=self.tohir).status_code, 403, url)
        self.assertEqual(client.post("/api/salary/job-types", headers=self.tohir, json={
            "name": "x", "unit_of_measure": "dona", "price_per_unit": 1}).status_code, 403)
        self.assertEqual(client.get("/api/salary/job-types", headers=self.tohir).status_code, 200)   # for the daily form
        self.assertEqual(client.get("/api/salary/employees", headers=login_as("t_ih_kassa", "Kassa", "1,2")).status_code, 403)

    def test_daily_work_and_attendance_stay_in_the_ombor(self):
        self.assertEqual(client.post("/api/salary/daily-work", headers=self.tohir, json={
            "employee_id": self.istam_emp, "job_type_id": self.job, "date": str(DAY), "quantity": 1}).status_code, 403)
        # The admin marks Istam's man absent; Tohir saving Toxir's day leaves it alone
        ok(client.post("/api/salary/daily-attendance", headers=self.admin, json={
            "date": str(DAY), "absent_records": [{"employee_id": self.istam_emp, "reason": "kasal"}]}))
        ok(client.post("/api/salary/daily-attendance", headers=self.tohir, json={
            "date": str(DAY), "absent_records": [{"employee_id": self.toxir_emp, "reason": "javob"}]}))
        db = SessionLocal()
        try:
            absent = {a.employee_id for a in db.query(AttendanceEntry).filter(AttendanceEntry.date == DAY)}
        finally:
            db.close()
        self.assertTrue({self.istam_emp, self.toxir_emp} <= absent)
        self.assertEqual(client.post("/api/salary/daily-attendance", headers=self.tohir, json={
            "date": str(DAY), "absent_records": [{"employee_id": self.istam_emp}]}).status_code, 403)


if __name__ == "__main__":
    unittest.main()
