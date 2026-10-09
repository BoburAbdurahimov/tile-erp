"""Moliya: a salary paid through Ish haqi is booked where the person works -
an Ombor's people on that Ombor's two yo'nalish by their volume, Ma'muriyat
in admin costs - and no longer spread over all production as overhead."""
import unittest

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import ProductionOrder
from backend.services.cost_allocation_service import calculate_monthly_production_cost_allocation
from backend.services.currency_service import convert_amount
from backend.services.month_close_service import local_today
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def allocation(ym):
    db = SessionLocal()
    try:
        a = calculate_monthly_production_cost_allocation(db, ym)
        return a, {r["sklad_id"]: r for r in a["ombors"]}
    finally:
        db.close()


class TestSalaryAllocation(unittest.TestCase):

    def test_salary_goes_where_the_person_works(self):
        today = local_today()
        ym = today.strftime("%Y-%m")
        db = SessionLocal()
        try:
            orders = [ProductionOrder(order_number=f"SA-TEST-{i}", out_sklad_id=sid, out_length=600, out_width=80,
                                      quantity=qty, date=today, status="Tasdiqlandi")
                      for i, (sid, qty) in enumerate([(3, 300), (4, 100)])]   # Kodir 120 and Kodir 100
            db.add_all(orders)
            db.commit()
            order_ids = [o.id for o in orders]
        finally:
            db.close()

        emp_ids = []
        try:
            for name, dept, salary in [("Kodir ustasi", "Kodir", 2600000), ("Buxgalter", "Ma'muriyat", 1300000)]:
                emp_ids.append(ok(client.post("/api/salary/employees", headers=ADMIN, json={
                    "full_name": name, "department": dept, "employee_type": "fixed",
                    "monthly_salary": salary, "hire_date": "2026-01-01"}))["id"])
            ok(client.post(f"/api/salary/payroll/{ym}/calculate", headers=ADMIN))
            calcs = {c["employee_id"]: c for c in ok(client.get(f"/api/salary/payroll/{ym}", headers=ADMIN))["calculations"]}
            kodir_pay, admin_pay = calcs[emp_ids[0]]["final_amount"], calcs[emp_ids[1]]["final_amount"]

            uzs = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == "Kassa UZS")
            ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
                "register_id": uzs["id"], "type": "kirim", "amount": kodir_pay + admin_pay, "currency": "UZS",
                "category": "boshqa", "date": str(today), "description": "test"}))

            before, b_rows = allocation(ym)
            for emp_id in emp_ids:
                ok(client.post(f"/api/salary/payroll/{calcs[emp_id]['id']}/pay", headers=ADMIN,
                               json={"register_id": uzs["id"], "payment_amount": calcs[emp_id]["final_amount"]}))
            after, a_rows = allocation(ym)

            db = SessionLocal()
            try:
                kodir_usd = convert_amount(kodir_pay, "UZS", "USD", today, db)
                admin_usd = convert_amount(admin_pay, "UZS", "USD", today, db)
            finally:
                db.close()
            v3, v4 = a_rows[3]["production_volume"], a_rows[4]["production_volume"]
            self.assertAlmostEqual(a_rows[3]["salary_cost_usd"] - b_rows[3]["salary_cost_usd"],
                                   kodir_usd * v3 / (v3 + v4), delta=0.02)
            self.assertAlmostEqual(a_rows[4]["salary_cost_usd"] - b_rows[4]["salary_cost_usd"],
                                   kodir_usd * v4 / (v3 + v4), delta=0.02)
            self.assertAlmostEqual(a_rows[1]["salary_cost_usd"], b_rows[1]["salary_cost_usd"], delta=0.01)  # Toxir: none
            self.assertAlmostEqual(after["admin_salary_usd"] - before["admin_salary_usd"], admin_usd, delta=0.02)
            self.assertAlmostEqual(after["total_indirect_expenses_usd"], before["total_indirect_expenses_usd"], delta=0.01)

            pnl = ok(client.get(f"/api/moliya/pnl?year_month={ym}", headers=ADMIN))
            self.assertAlmostEqual(pnl["cogs_salary_usd"], after["total_ombor_salary_usd"], delta=0.01)
        finally:
            for emp_id in emp_ids:
                client.delete(f"/api/salary/employees/{emp_id}", headers=ADMIN)
            db = SessionLocal()
            try:
                db.query(ProductionOrder).filter(ProductionOrder.id.in_(order_ids)).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
