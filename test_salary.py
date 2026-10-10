import unittest
from datetime import date, timedelta
from backend.database import SessionLocal, init_engine, create_tables
from backend.models import Employee, JobType, AttendanceEntry, WorkEntry, MonthlySalaryCalculation, CashRegister, CashTransaction
from backend.services.salary_service import (
    calculate_employee_salary, recalculate_all_salaries, get_payroll_summary,
    record_daily_attendance, record_daily_work_entry, pay_employee_salary
)

class TestSalaryModule(unittest.TestCase):
    def setUp(self):
        init_engine()
        create_tables()
        self.db = SessionLocal()
        self.test_month = "2026-09" # Use future test month to isolate

    def tearDown(self):
        # Cleanup test month records
        self.db.query(MonthlySalaryCalculation).filter(MonthlySalaryCalculation.year_month == self.test_month).delete()
        self.db.query(AttendanceEntry).filter(AttendanceEntry.date >= date(2026, 9, 1), AttendanceEntry.date <= date(2026, 9, 30)).delete()
        self.db.query(WorkEntry).filter(WorkEntry.date >= date(2026, 9, 1), WorkEntry.date <= date(2026, 9, 30)).delete()
        self.db.commit()
        self.db.close()

    def test_fixed_salary_calculation_with_absences(self):
        """Test: Fixed employee monthly salary deducts per-day rate for absent days."""
        emp = self.db.query(Employee).filter(Employee.employee_type == "fixed").first()
        if not emp:
            emp = Employee(full_name="Test Fixed Emp", employee_type="fixed", monthly_salary=5200000.0, standard_work_days=26, hire_date=date(2026, 1, 1))
            self.db.add(emp)
            self.db.commit()

        emp.monthly_salary = 5200000.0
        emp.standard_work_days = 26
        self.db.commit()

        # Add 2 absent days in Sep 2026
        d1 = date(2026, 9, 5)
        d2 = date(2026, 9, 6)
        self.db.add(AttendanceEntry(employee_id=emp.id, date=d1, status="absent", reason="Test absent 1", entered_by="Test"))
        self.db.add(AttendanceEntry(employee_id=emp.id, date=d2, status="absent", reason="Test absent 2", entered_by="Test"))
        self.db.commit()

        calc = calculate_employee_salary(self.db, emp.id, self.test_month)

        # Expected:
        # per_day_rate = 5,200,000 / 26 = 200,000
        # deduction = 200,000 * 2 = 400,000
        # final = 5,200,000 - 400,000 = 4,800,000
        self.assertEqual(calc.base_salary, 5200000.0)
        self.assertEqual(calc.standard_days, 26)
        self.assertEqual(calc.absent_days, 2)
        self.assertEqual(calc.per_day_rate, 200000.0)
        self.assertEqual(calc.deduction_amount, 400000.0)
        self.assertEqual(calc.final_amount, 4800000.0)

    def test_piecework_salary_calculation(self):
        """Test: Piecework employee monthly salary sums all work entries."""
        emp = self.db.query(Employee).filter(Employee.employee_type == "piecework").first()
        if not emp:
            emp = Employee(full_name="Test Piecework Emp", employee_type="piecework", hire_date=date(2026, 1, 1))
            self.db.add(emp)
            self.db.commit()

        jt = self.db.query(JobType).first()
        if not jt:
            jt = JobType(name="Test Job", unit_of_measure="m2", price_per_unit=1000.0)
            self.db.add(jt)
            self.db.commit()

        # Add 2 work entries
        d1 = date(2026, 9, 10)
        d2 = date(2026, 9, 12)
        record_daily_work_entry(self.db, emp.id, jt.id, d1, quantity=500.0, notes="Batch 1", current_user="Test")
        record_daily_work_entry(self.db, emp.id, jt.id, d2, quantity=700.0, notes="Batch 2", current_user="Test")

        calc = calculate_employee_salary(self.db, emp.id, self.test_month)

        expected_total = (500.0 + 700.0) * float(jt.price_per_unit)
        self.assertEqual(calc.piecework_total, expected_total)
        self.assertEqual(calc.final_amount, expected_total)

    def test_payout_and_the_month_stays_open(self):
        """Test: payout creates a CashTransaction, and paying never locks the
        month - entries still go in and the paid salary is worked out again."""
        emp = Employee(full_name="Test No-Lock Emp", employee_type="piecework", hire_date=date(2026, 1, 1))
        jt = JobType(name="Test No-Lock Job", unit_of_measure="m2", price_per_unit=1000.0)
        self.db.add_all([emp, jt])
        self.db.commit()
        try:
            record_daily_work_entry(self.db, emp.id, jt.id, date(2026, 9, 3), quantity=150.0, current_user="Test")
            recalculate_all_salaries(self.db, self.test_month, current_user="Test")
            summary = get_payroll_summary(self.db, self.test_month)
            calc = next(c for c in summary["calculations"] if c["employee_id"] == emp.id)
            self.assertEqual(calc["final_amount"], 150000.0)

            reg = self.db.query(CashRegister).filter(CashRegister.currency == "UZS").first()
            reg.balance = (reg.balance or 0.0) + 150000.0
            self.db.commit()
            calc_res = pay_employee_salary(self.db, calc["id"], reg.id, 150000.0, current_user="Test", notes="Test payout")
            self.assertEqual(calc_res.status, "paid")
            tx = self.db.query(CashTransaction).filter(CashTransaction.id == calc_res.cash_transaction_id).first()
            self.assertEqual((tx.category, tx.type), ("Ishchilar oyligi / Avans", "chiqim"))

            # Paid, and the month is still open: a new naryad goes in and the pay follows it
            record_daily_work_entry(self.db, emp.id, jt.id, date(2026, 9, 20), quantity=50.0, current_user="Test")
            record_daily_attendance(self.db, date(2026, 9, 20), [], current_user="Test")
            summary = get_payroll_summary(self.db, self.test_month)
            row = next(c for c in summary["calculations"] if c["employee_id"] == emp.id)
            self.assertEqual((row["status"], row["final_amount"], row["paid_amount"]), ("paid", 200000.0, 150000.0))
            self.assertNotIn("is_all_finalized", summary)
        finally:
            self.db.query(WorkEntry).filter(WorkEntry.employee_id == emp.id).delete()
            self.db.query(MonthlySalaryCalculation).filter(MonthlySalaryCalculation.employee_id == emp.id).delete()
            self.db.query(Employee).filter(Employee.id == emp.id).delete()
            self.db.query(JobType).filter(JobType.id == jt.id).delete()
            self.db.commit()

if __name__ == "__main__":
    unittest.main()
