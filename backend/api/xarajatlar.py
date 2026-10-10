"""Other expenses (prochie rasxodlar): bozorlik, taksi puli, abed and the like.

Each expense is paid from a Kassa, so saving one posts a 'chiqim' there under
the admin_prochee category (which the PnL counts as admin & other costs).
A counterparty can be attached to show who was paid; it does not change that
counterparty's balance. Cancelling removes the Kassa entry and returns the
money to the register.
"""
from datetime import date
from datetime import date as dt_date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_username, get_current_user_role, check_permission
from backend.models import OtherExpense, CashRegister, CashTransaction, MDMCounterparty
from backend.services.numbering import next_number

router = APIRouter(prefix="/expenses", tags=["MODUL: BOSHQA XARAJATLAR (Prochie rasxodlar)"])

KASSA_CATEGORY = "admin_prochee"
STATUS_OK = "Tasdiqlandi"
STATUS_CANCELLED = "Bekor"

DEFAULT_CATEGORIES = [
    "Bozorlik", "Taksi", "Abed (ovqat)", "Yoqilg'i", "Kommunal to'lovlar",
    "Aloqa va internet", "Xo'jalik mollari", "Ta'mirlash", "Ijara", "Boshqa",
]


class ExpenseCreate(BaseModel):
    date: dt_date = Field(default_factory=dt_date.today)
    category: str
    amount: float = Field(gt=0)
    register_id: int
    counterparty_id: Optional[int] = None
    description: Optional[str] = None


def _serialize(e: OtherExpense) -> dict:
    return {
        "id": e.id,
        "expense_number": e.expense_number,
        "date": e.date.isoformat() if e.date else None,
        "category": e.category,
        "amount": round(e.amount, 2),
        "currency": e.currency,
        "register_id": e.register_id,
        "register_name": e.register.name if e.register else "",
        "counterparty_id": e.counterparty_id,
        "counterparty_name": e.counterparty.name if e.counterparty else None,
        "description": e.description,
        "status": e.status,
        "created_by": e.created_by,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("/categories")
def categories(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("kassa", role)
    used = [c for (c,) in db.query(OtherExpense.category).distinct().all() if c]
    return DEFAULT_CATEGORIES + sorted(c for c in set(used) if c not in DEFAULT_CATEGORIES)


@router.get("")
def list_expenses(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    category: Optional[str] = Query(None),
    register_id: Optional[int] = Query(None),
    counterparty_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    check_permission("kassa", role)
    q = db.query(OtherExpense)
    if start:
        q = q.filter(OtherExpense.date >= start)
    if end:
        q = q.filter(OtherExpense.date <= end)
    if category:
        q = q.filter(OtherExpense.category == category)
    if register_id:
        q = q.filter(OtherExpense.register_id == register_id)
    if counterparty_id:
        q = q.filter(OtherExpense.counterparty_id == counterparty_id)
    if status:
        q = q.filter(OtherExpense.status == status)
    rows = q.order_by(OtherExpense.date.desc(), OtherExpense.id.desc()).all()
    return {"expenses": [_serialize(e) for e in rows]}


@router.post("")
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_username),
    role: str = Depends(get_current_user_role),
):
    check_permission("kassa", role)
    category = (payload.category or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="Xarajat turini tanlang.")
    reg = db.query(CashRegister).filter(CashRegister.id == payload.register_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Kassa topilmadi.")
    cp = None
    if payload.counterparty_id:
        cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.counterparty_id).first()
        if not cp:
            raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
    if round(reg.balance or 0.0, 4) < round(payload.amount, 4):
        raise HTTPException(
            status_code=400,
            detail=(f"Kassada yetarli mablag' yo'q. {reg.name}: {reg.balance:,.2f} {reg.currency}, "
                    f"kerak: {payload.amount:,.2f} {reg.currency}."),
        )

    number = next_number(db, OtherExpense.expense_number, f"XR-{payload.date.strftime('%Y%m%d')}-")
    desc = (payload.description or "").strip() or None
    text = f"Xarajat {number}: {category}"
    if cp:
        text += f" ({cp.name})"
    if desc:
        text += f" - {desc}"

    reg.balance = round((reg.balance or 0.0) - payload.amount, 4)
    # No counterparty on the Kassa entry: an expense must not move their balance.
    tx = CashTransaction(
        register_id=reg.id, type="chiqim", source_type="other", counterparty_id=None,
        amount=payload.amount, currency=reg.currency, category=KASSA_CATEGORY,
        date=payload.date, description=text,
    )
    db.add(tx)
    db.flush()
    exp = OtherExpense(
        expense_number=number, date=payload.date, category=category,
        amount=payload.amount, currency=reg.currency, register_id=reg.id,
        counterparty_id=cp.id if cp else None, description=desc,
        status=STATUS_OK, cash_transaction_id=tx.id, created_by=username,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


@router.post("/{expense_id}/cancel")
def cancel_expense(expense_id: int, db: Session = Depends(get_db),
                   role: str = Depends(get_current_user_role)):
    check_permission("kassa", role)
    exp = db.query(OtherExpense).filter(OtherExpense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Xarajat topilmadi.")
    if exp.status == STATUS_CANCELLED:
        raise HTTPException(status_code=400, detail="Bu xarajat allaqachon bekor qilingan.")

    tx = db.query(CashTransaction).filter(CashTransaction.id == exp.cash_transaction_id).first() \
        if exp.cash_transaction_id else None
    if tx:
        reg = db.query(CashRegister).filter(CashRegister.id == tx.register_id).first()
        if reg:
            reg.balance = round((reg.balance or 0.0) + tx.amount, 4)
        db.delete(tx)
    exp.status = STATUS_CANCELLED
    exp.cash_transaction_id = None
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


# ---------------------------------------------------------------- counterparties
# The expense form needs to pick (or quickly add) who was paid. These use the
# Kassa permission, so a cashier does not need access to the whole MDM.

class PayeeCreate(BaseModel):
    name: str
    phone: Optional[str] = None


@router.get("/counterparties")
def payees(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("kassa", role)
    rows = (db.query(MDMCounterparty).filter(MDMCounterparty.is_archived == False)  # noqa: E712
            .order_by(MDMCounterparty.name).all())
    return [{"id": c.id, "name": c.name, "phone": c.phone, "type": c.type} for c in rows]


@router.post("/counterparties")
def add_payee(payload: PayeeCreate, db: Session = Depends(get_db),
              role: str = Depends(get_current_user_role)):
    check_permission("kassa", role)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Kontragent nomini kiriting.")
    # Payees are suppliers in MDM (codes 10001+), numbered after the highest one.
    codes = [int(c) for (c,) in db.query(MDMCounterparty.code).all() if str(c).isdigit() and 10000 < int(c) < 20000]
    code = str(max(codes, default=10000) + 1)
    cp = MDMCounterparty(code=code, name=name, type="supplier", phone=(payload.phone or "").strip() or None,
                         region="Toshkent shahri", is_resident=True)
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return {"id": cp.id, "name": cp.name, "phone": cp.phone, "type": cp.type}
