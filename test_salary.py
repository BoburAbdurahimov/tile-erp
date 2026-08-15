import unittest
from datetime import date, timedelta
from backend.database import SessionLocal, init_engine, create_tables
from backend.models import Employee, JobType, AttendanceEntry, WorkEntry, MonthlySalaryCalculation, CashRegister, CashTransaction
from backend.services.salary_service import (
    calculate_employee_salary, recalculate_all_salaries, get_payroll_summary,
    record_daily_attendance, record_daily_work_entry, finalize_month_payroll,
    reopen_month_payroll, pay_employee_salary
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

    def test_salary_finalization_and_payout(self):
        """Test: Finalizing locks calculation and payout creates CashTransaction."""
        recalculate_all_salaries(self.db, self.test_month, current_user="Test")
        finalize_month_payroll(self.db, self.test_month, current_user="Test")

        summary = get_payroll_summary(self.db, self.test_month)
        self.assertTrue(summary["is_all_finalized"])

        # Attempt to pay first calculation
        first_calc_id = summary["calculations"][0]["id"]
        reg = self.db.query(CashRegister).first()
        self.assertIsNotNone(reg)

        initial_bal = reg.balance
        calc_res = pay_employee_salary(self.db, first_calc_id, reg.id, 100000.0, current_user="Test", notes="Test payout")
        
        self.assertEqual(calc_res.status, "paid")
        self.assertIsNotNone(calc_res.cash_transaction_id)
        
        tx = self.db.query(CashTransaction).filter(CashTransaction.id == calc_res.cash_transaction_id).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.category, "Ishchilar oyligi / Avans")
        self.assertEqual(tx.type, "chiqim")

if __name__ == "__main__":
    unittest.main()
