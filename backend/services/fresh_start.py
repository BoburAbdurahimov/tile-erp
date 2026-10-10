"""One-off fresh start of the live system.

Everything entered while the system was being tried out - test and demo
data - goes: every document, the Kassa money and history, counterparties,
materials, employees, Ish turlari, Avto sarf norms and the audit history.
What stays: the logins (web and Telegram), the warehouses, the production
lines, the Kassa registers (now empty) and the exchange rates.

It runs once, at the first production start-up after the deploy that
brings it (see backend/main.py): writing the FRESH_START_KEY marker claims
the job in the same transaction as the wipe, so a second instance starting
at the same time waits and then finds it done.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import (
    AppFlag, AttendanceEntry, AuditLog, AutoSarfRule, CashExchange, CashRegister, CashTransaction,
    Employee, JobType, LineExpense, LineExpenseItem, MDMCounterparty, MDMMaterial,
    MonthlySalaryCalculation, OtherExpense, ProductionConsumedMaterial, ProductionOrder,
    Purchase, PurchaseItem, SalaryAdjustment, Sale, SaleItem, SkladInventory, SkladMovement,
    SkladMovementItem, SkladOrder, SkladOrderItem, SkladOrderPayment, StockItem, StockTransfer,
    WorkEntry,
)

logger = logging.getLogger(__name__)

FRESH_START_KEY = "fresh-start-2026-10"


def due_here() -> bool:
    """Only the live site: never previews, local runs or tests."""
    return os.getenv("VERCEL_ENV") == "production"


def _wipe(db: Session) -> dict:
    removed = {}

    def wipe(model, name):
        removed[name] = db.query(model).delete(synchronize_session=False)

    # Children before parents; self-references cleared first.
    wipe(SkladOrderPayment, "order_payments")
    wipe(SkladOrderItem, "order_items")
    wipe(SkladOrder, "orders")
    wipe(SkladMovementItem, "ombor_movement_items")
    wipe(SkladMovement, "ombor_movements")
    wipe(SkladInventory, "ombor_stock")
    wipe(ProductionConsumedMaterial, "production_materials")
    db.query(ProductionOrder).update({ProductionOrder.storno_ref_id: None}, synchronize_session=False)
    wipe(ProductionOrder, "production_orders")
    wipe(LineExpenseItem, "material_issue_items")
    wipe(LineExpense, "material_issues")
    wipe(PurchaseItem, "purchase_items")
    db.query(Purchase).update({Purchase.storno_ref_id: None}, synchronize_session=False)
    wipe(Purchase, "purchases")
    wipe(SaleItem, "sale_items")
    db.query(Sale).update({Sale.storno_ref_id: None}, synchronize_session=False)
    wipe(Sale, "sales")
    wipe(StockTransfer, "stock_transfers")
    wipe(StockItem, "stock_rows")
    wipe(OtherExpense, "other_expenses")

    wipe(SalaryAdjustment, "salary_adjustments")
    wipe(MonthlySalaryCalculation, "salary_calculations")
    wipe(WorkEntry, "work_entries")
    wipe(AttendanceEntry, "attendance")
    wipe(Employee, "employees")
    wipe(JobType, "job_types")
    wipe(AutoSarfRule, "auto_sarf_norms")

    wipe(CashExchange, "kassa_exchanges")
    db.query(CashTransaction).update({CashTransaction.storno_ref_id: None}, synchronize_session=False)
    wipe(CashTransaction, "kassa_transactions")
    db.query(CashRegister).update({CashRegister.balance: 0.0}, synchronize_session=False)

    wipe(MDMCounterparty, "counterparties")
    wipe(MDMMaterial, "materials")
    wipe(AuditLog, "audit_log")
    # Left over from the removed month closing.
    if inspect(db.get_bind()).has_table("month_closings"):
        removed["month_closings"] = db.execute(text("DELETE FROM month_closings")).rowcount
    return removed


def run_fresh_start(db: Session) -> bool:
    """Wipe once. True when this call did it."""
    if db.query(AppFlag).filter(AppFlag.key == FRESH_START_KEY).first():
        return False
    try:
        db.add(AppFlag(key=FRESH_START_KEY, value="started"))
        db.flush()                       # claims the job (unique key)
        removed = _wipe(db)
        summary = ", ".join(f"{k}: {v}" for k, v in removed.items() if v)
        db.query(AppFlag).filter(AppFlag.key == FRESH_START_KEY).update({AppFlag.value: summary or "empty"})
        db.add(AuditLog(username="tizim", action="DELETE", module="Tizim",
                        details=f"Toza boshlash: sinov va demo ma'lumotlar o'chirildi ({summary or 'bo`sh edi'})"))
        db.commit()
    except IntegrityError:
        db.rollback()                    # another instance did it
        return False
    logger.info(f"Fresh start done: {summary}")
    return True
