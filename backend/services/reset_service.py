"""Start over from zero: remove every document (demo or not), keeping the money
in the Kassa and the counterparties.

Kept: users, MDM catalogue (materials, counterparties, warehouses), employees
and job types, exchange rates, the audit log, and - if asked - the Avto sarf
norms. Each Kassa keeps its balance, written as one opening receipt so the
history still adds up. Counterparty balances go back to the opening balance
entered with them, since the documents behind them are gone.
"""
from datetime import date

from sqlalchemy.orm import Session

from backend.models import (
    SkladOrderPayment, SkladOrderItem, SkladOrder,
    SkladMovementItem, SkladMovement, SkladInventory,
    ProductionConsumedMaterial, ProductionOrder,
    LineExpenseItem, LineExpense,
    PurchaseItem, Purchase, SaleItem, Sale,
    StockTransfer, StockItem, OtherExpense,
    MonthlySalaryCalculation, WorkEntry, AttendanceEntry,
    AutoSarfRule, CashTransaction, CashRegister, MonthClosing, MDMCounterparty,
)

OPENING_NOTE = "Boshlang'ich qoldiq (0 dan boshlash)"


def reset_operational_data(db: Session, keep_norms: bool = False) -> dict:
    registers = {r.id: round(r.balance or 0.0, 2) for r in db.query(CashRegister).all()}
    removed = {}

    def wipe(model, name):
        removed[name] = db.query(model).delete(synchronize_session=False)

    # Children before parents; self-references cleared first.
    wipe(SkladOrderPayment, "order_payments")
    wipe(SkladOrderItem, "order_items")
    wipe(SkladOrder, "orders")
    wipe(SkladMovementItem, "ombor_movement_items")
    wipe(SkladMovement, "ombor_movements")
    wipe(SkladInventory, "ombor_stock_rows")

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

    wipe(MonthlySalaryCalculation, "salary_calculations")
    wipe(WorkEntry, "work_entries")
    wipe(AttendanceEntry, "attendance_entries")
    if not keep_norms:
        wipe(AutoSarfRule, "auto_sarf_norms")

    db.query(CashTransaction).update({CashTransaction.storno_ref_id: None}, synchronize_session=False)
    wipe(CashTransaction, "kassa_transactions")
    wipe(MonthClosing, "month_closings")

    # Back to the opening balance entered with the counterparty (usually 0), which
    # is where the Akt-sverka starts.
    for cp in db.query(MDMCounterparty).all():
        cp.current_balance_usd = cp.initial_balance_usd or 0.0
        cp.current_balance_uzs = cp.initial_balance_uzs or 0.0

    # The money stays: one opening receipt per register for what it holds.
    today = date.today()
    for reg in db.query(CashRegister).all():
        bal = registers.get(reg.id, 0.0)
        reg.balance = bal
        if bal:
            db.add(CashTransaction(
                register_id=reg.id, type="kirim" if bal > 0 else "chiqim", source_type="other",
                amount=abs(bal), currency=reg.currency, category="boshqa", date=today,
                description=OPENING_NOTE,
            ))
    db.commit()
    return {"removed": removed, "kassa": {r.name: round(r.balance or 0.0, 2) for r in db.query(CashRegister).all()}}
