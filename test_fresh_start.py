"""The one-off fresh start of the live site: test and demo data go, the
logins, warehouses and (emptied) Kassa registers stay, and it runs only
once - on its own database here, so the shared test data is untouched."""
import os
import tempfile
import unittest
from datetime import date
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import (
    AppFlag, AuditLog, CashRegister, CashTransaction, Employee, JobType, MDMCounterparty,
    MDMMaterial, MonthlySalaryCalculation, TelegramUser, User, Warehouse, WorkEntry,
)
from backend.services import fresh_start


class TestFreshStart(unittest.TestCase):

    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.engine = create_engine(f"sqlite:///{self.path}")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()
        os.remove(self.path)

    def fill(self):
        db = self.Session()
        user = User(username="boss", password_hash="x", full_name="Boss", role="Admin")
        wh = Warehouse(name="Xomashyo ombori", code="W1")
        reg = CashRegister(name="Kassa UZS", currency="UZS", balance=1500000.0)
        db.add_all([user, wh, reg, TelegramUser(telegram_id=111, first_name="Bot user")])
        db.flush()
        mat = MDMMaterial(code="M-1", name="Glazur", unit="kg", category="Xomashyo")
        cp = MDMCounterparty(code="20001", name="Mijoz", type="client")
        jt = JobType(name="Kafelchi", unit_of_measure="m2", price_per_unit=1000)
        db.add_all([mat, cp, jt])
        db.flush()
        emp = Employee(full_name="Ishchi", employee_type="piecework", job_type_id=jt.id, hire_date=date(2026, 1, 1))
        db.add(emp)
        db.flush()
        db.add_all([
            WorkEntry(employee_id=emp.id, job_type_id=jt.id, date=date(2026, 10, 1), quantity=5,
                      unit_price_snapshot=1000, total_amount=5000),
            MonthlySalaryCalculation(employee_id=emp.id, year_month="2026-10", employee_type="piecework",
                                     final_amount=5000),
            CashTransaction(register_id=reg.id, type="kirim", amount=1500000, currency="UZS",
                            counterparty_id=cp.id, date=date(2026, 10, 1)),
            AuditLog(username="boss", action="CREATE", module="Kassa"),
        ])
        db.commit()
        db.close()

    def test_wipes_once_and_keeps_the_logins(self):
        self.fill()
        db = self.Session()
        try:
            self.assertTrue(fresh_start.run_fresh_start(db))
            for model in (MDMMaterial, MDMCounterparty, JobType, Employee, WorkEntry,
                          MonthlySalaryCalculation, CashTransaction):
                self.assertEqual(db.query(model).count(), 0, model.__name__)
            self.assertEqual((db.query(User).count(), db.query(TelegramUser).count(), db.query(Warehouse).count()),
                             (1, 1, 1))
            self.assertEqual(db.query(CashRegister).one().balance, 0.0)
            self.assertEqual([a.module for a in db.query(AuditLog)], ["Tizim"])   # only the wipe itself
            self.assertIsNotNone(db.get(AppFlag, fresh_start.FRESH_START_KEY))

            # Never again: data entered afterwards stays
            db.add(MDMMaterial(code="M-2", name="Yangi", unit="kg", category="Xomashyo"))
            db.commit()
            self.assertFalse(fresh_start.run_fresh_start(db))
            self.assertEqual(db.query(MDMMaterial).count(), 1)
        finally:
            db.close()

    def test_only_on_the_live_site(self):
        for env, due in (("production", True), ("preview", False), ("development", False), (None, False)):
            with mock.patch.dict(os.environ, {} if env is None else {"VERCEL_ENV": env}, clear=False):
                if env is None:
                    os.environ.pop("VERCEL_ENV", None)
                self.assertEqual(fresh_start.due_here(), due, env)


if __name__ == "__main__":
    unittest.main()
