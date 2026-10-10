from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (CashRegister, CashTransaction, ExchangeRate, MDMCounterparty,
                            MonthlySalaryCalculation, OtherExpense)
from backend.schemas import (
    CashRegisterResponse, CashTransactionCreate, CashTransactionResponse,
    ExchangeRateCreate, ExchangeRateResponse
)
from backend.api.auth import get_current_user_role, get_current_username, check_permission, is_admin
from backend.services.currency_service import (
    get_exchange_rate_for_date, set_manual_exchange_rate,
    fetch_cbu_rate_today, convert_amount
)
from backend.services.counterparty_service import move_cash
from backend.services.salary_service import calculate_employee_salary, release_transaction_adjustments
from backend.services.cash_exchange_service import (
    exchange_between_registers, exchange_of_transaction, undo_exchange
)
from backend.services.order_service import ensure_card_register

router = APIRouter(prefix="/kassa", tags=["MODUL 3: KASSA (Treasury & Cash)"])


@router.get("/registers", response_model=List[CashRegisterResponse])
def get_cash_registers(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    if not target_date:
        target_date = date.today()
        
    rate = get_exchange_rate_for_date(db, target_date)
    # Plastic card payments have their own UZS register; make sure it is there.
    if not db.query(CashRegister).filter(CashRegister.name == "Karta UZS").first():
        ensure_card_register(db)
        db.commit()
    registers = db.query(CashRegister).order_by(CashRegister.id).all()
    
    result = []
    for reg in registers:
        if reg.currency == "USD":
            other_bal = reg.balance * rate
        else:
            other_bal = reg.balance / rate if rate > 0 else 0.0
            
        result.append(CashRegisterResponse(
            id=reg.id,
            name=reg.name,
            currency=reg.currency,
            balance=round(reg.balance, 2),
            balance_in_other_currency=round(other_bal, 2),
            current_rate=rate,
            description=reg.description
        ))
    return result

@router.get("/transactions", response_model=List[CashTransactionResponse])
def get_cash_transactions(
    register_id: Optional[int] = None,
    type: Optional[str] = None, # "kirim" or "chiqim"
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    query = db.query(CashTransaction).join(CashRegister)
    
    if register_id:
        query = query.filter(CashTransaction.register_id == register_id)
    if type:
        query = query.filter(CashTransaction.type == type)
    if category:
        query = query.filter(CashTransaction.category == category)
    if start_date:
        query = query.filter(CashTransaction.date >= start_date)
    if end_date:
        query = query.filter(CashTransaction.date <= end_date)
        
    txs = query.order_by(CashTransaction.date.desc(), CashTransaction.id.desc()).all()
    
    result = []
    for tx in txs:
        result.append(CashTransactionResponse(
            id=tx.id,
            register_id=tx.register_id,
            register_name=tx.register.name if tx.register else "",
            type=tx.type,
            source_type=tx.source_type,
            counterparty_id=tx.counterparty_id,
            counterparty_name=tx.counterparty.name if tx.counterparty else None,
            amount=round(tx.amount, 2),
            currency=tx.currency,
            category=tx.category,
            date=tx.date,
            description=tx.description,
            created_at=tx.created_at
        ))
    return result

@router.post("/transactions", response_model=CashTransactionResponse)
def create_cash_transaction(
    payload: CashTransactionCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    
    reg = db.query(CashRegister).filter(CashRegister.id == payload.register_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Kassa topilmadi.")
        
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Tranzaksiya summasi musbat bo'lishi shart.")

    tx_type = payload.type.strip().lower()
    # Update cash register balance
    if tx_type in ("kirim", "приход", "income"):
        reg.balance += payload.amount
        normalized_type = "kirim"
    elif tx_type in ("chiqim", "расход", "expense"):
        if round(reg.balance, 4) < round(payload.amount, 4):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Kassada yetarli mablag' mavjud emas!\n"
                    f"Kassa: {reg.name}\n"
                    f"Talab qilingan: {payload.amount:,.2f} {reg.currency}\n"
                    f"Kassadagi mavjud qoldiq: {reg.balance:,.2f} {reg.currency}\n"
                    f"Kassa manfiy songa tushishiga yo'l qo'yilmaydi."
                )
            )
        reg.balance = round(reg.balance - payload.amount, 4)
        normalized_type = "chiqim"
    else:
        raise HTTPException(status_code=400, detail="Tranzaksiya turi faqat 'kirim' yoki 'chiqim' bo'lishi mumkin.")

    # The money is in the register's own currency, whatever the form sent.
    currency = reg.currency
    source_type = payload.source_type

    # If linked to a counterparty, update their balance
    if payload.counterparty_id:
        cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.counterparty_id).first()
        if not cp:
            raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
        move_cash(cp, normalized_type, currency, payload.amount,
                           get_exchange_rate_for_date(db, payload.date))
        if source_type in (None, "", "other"):
            source_type = cp.type          # client / supplier

    tx = CashTransaction(
        register_id=payload.register_id,
        type=normalized_type,
        source_type=source_type,
        counterparty_id=payload.counterparty_id,
        amount=payload.amount,
        currency=currency,
        category=payload.category,
        date=payload.date,
        description=payload.description
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    
    return CashTransactionResponse(
        id=tx.id,
        register_id=tx.register_id,
        register_name=reg.name,
        type=tx.type,
        source_type=tx.source_type,
        counterparty_id=tx.counterparty_id,
        counterparty_name=tx.counterparty.name if tx.counterparty else None,
        amount=round(tx.amount, 2),
        currency=tx.currency,
        category=tx.category,
        date=tx.date,
        description=tx.description,
        created_at=tx.created_at
    )

@router.delete("/transactions/{transaction_id}")
def delete_cash_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    username: str = Depends(get_current_username),
):
    check_permission("admin_tools" if is_admin(role) else "kassa", role)
    if not is_admin(role):
        raise HTTPException(status_code=403, detail="O'chirish faqat Admin uchun ruxsat etilgan!")
    tx = db.query(CashTransaction).filter(CashTransaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Tranzaksiya topilmadi.")

    # One side of a konvertatsiya: both sides go and both registers get their money back.
    exchange = exchange_of_transaction(db, tx.id)
    if exchange:
        try:
            undo_exchange(db, exchange, current_user=username)
        except ValueError as ve:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(ve))
        db.commit()
        return {"success": True, "message": "Konvertatsiya bekor qilindi: ikkala kassadagi yozuv ham o'chirildi.",
                "id": transaction_id}

    # Reverse register balance
    reg = db.query(CashRegister).filter(CashRegister.id == tx.register_id).first()
    if reg:
        if tx.type.lower() == "kirim":
            reg.balance -= tx.amount
        else: # chiqim
            reg.balance += tx.amount
            
    # Reverse counterparty balance if attached
    if tx.counterparty_id:
        cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == tx.counterparty_id).first()
        if cp:
            move_cash(cp, tx.type.lower(), tx.currency, tx.amount,
                               get_exchange_rate_for_date(db, tx.date), sign=-1)

    # Documents paid through this entry go back to unpaid / cancelled, so Ish
    # haqi and Xarajatlar agree with Kassa (and the salary's foreign key does
    # not stop the delete).
    for calc in db.query(MonthlySalaryCalculation).filter(
            MonthlySalaryCalculation.cash_transaction_id == tx.id).all():
        calc.cash_transaction_id = None
        calc.status = "finalized" if calc.finalized_at else "draft"
        calc.paid_at = None
        calc.paid_by = None
    for exp in db.query(OtherExpense).filter(OtherExpense.cash_transaction_id == tx.id).all():
        exp.status = "Bekor"
        exp.cash_transaction_id = None
    # An avans paid through it is no longer paid: it goes from Ish haqi too.
    try:
        avans_paid_to = release_transaction_adjustments(db, tx.id)
    except ValueError as ve:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Bu avans Ish haqida: {ve} Avval oyni qayta oching.")
    db.flush()

    db.delete(tx)
    db.commit()
    for employee_id, year_month in avans_paid_to:
        calculate_employee_salary(db, employee_id, year_month)
    return {"success": True, "message": "Kassa tranzaksiyasi muvaffaqiyatli o'chirildi.", "id": transaction_id}

# ----------------- KONVERTATSIYA (USD <-> UZS, kassadan kassaga) -----------------

class CashExchangeCreate(BaseModel):
    from_register_id: int
    to_register_id: int
    amount: float                   # in the from register's currency
    rate: Optional[float] = None    # so'm per dollar; the day's rate when not given
    date: date
    note: Optional[str] = None

@router.post("/exchange")
def exchange_money(
    payload: CashExchangeCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    username: str = Depends(get_current_username),
):
    check_permission("kassa", role)
    try:
        ex = exchange_between_registers(db, payload.from_register_id, payload.to_register_id, payload.amount,
                                        payload.date, rate=payload.rate, note=payload.note, current_user=username)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    return {
        "status": "success", "id": ex.id, "from_amount": ex.from_amount, "to_amount": ex.to_amount,
        "rate": ex.rate, "out_tx_id": ex.out_tx_id, "in_tx_id": ex.in_tx_id,
    }

# ----------------- EXCHANGE RATES -----------------

@router.get("/exchange-rates", response_model=List[ExchangeRateResponse])
def get_exchange_rates(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    return db.query(ExchangeRate).order_by(ExchangeRate.date.desc()).limit(30).all()

@router.post("/exchange-rates")
def set_exchange_rate(
    payload: ExchangeRateCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    if not is_admin(role):
        raise HTTPException(status_code=403, detail="Valyuta kursini qo'lda o'zgartirish faqat Admin uchun ruxsat etilgan!")
        
    rate = set_manual_exchange_rate(db, payload.date, payload.rate_usd_uzs)
    return {
        "status": "success",
        "date": rate.date,
        "rate_usd_uzs": rate.rate_usd_uzs,
        "is_manual_override": rate.is_manual_override
    }

@router.post("/exchange-rates/fetch-cbu")
async def sync_cbu_rate(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kassa", role)
    today = date.today()
    live_rate = await fetch_cbu_rate_today()
    
    existing = db.query(ExchangeRate).filter(ExchangeRate.date == today).first()
    if existing:
        existing.rate_usd_uzs = live_rate
        existing.is_manual_override = False
    else:
        existing = ExchangeRate(
            date=today,
            rate_usd_uzs=live_rate,
            is_manual_override=False
        )
        db.add(existing)
    db.commit()
    return {"date": today, "rate_usd_uzs": live_rate, "source": "CBU API"}
