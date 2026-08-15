from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import CashRegister, CashTransaction, ExchangeRate, MDMCounterparty
from backend.schemas import (
    CashRegisterResponse, CashTransactionCreate, CashTransactionResponse,
    ExchangeRateCreate, ExchangeRateResponse
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.currency_service import (
    get_exchange_rate_for_date, set_manual_exchange_rate,
    fetch_cbu_rate_today, convert_amount
)
from backend.services.month_close_service import assert_month_open

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
    registers = db.query(CashRegister).all()
    
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
    # Check if month is closed
    assert_month_open(db, payload.date)
    
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
                    f"❌ Kassada yetarli mablag' mavjud emas!\n"
                    f"💵 Kassa: {reg.name}\n"
                    f"🔻 Talab qilingan: {payload.amount:,.2f} {reg.currency}\n"
                    f"📊 Kassadagi mavjud qoldiq: {reg.balance:,.2f} {reg.currency}\n"
                    f"Kassa manfiy songa tushishiga yo'l qo'yilmaydi."
                )
            )
        reg.balance = round(reg.balance - payload.amount, 4)
        normalized_type = "chiqim"
    else:
        raise HTTPException(status_code=400, detail="Tranzaksiya turi faqat 'kirim' yoki 'chiqim' bo'lishi mumkin.")

    # If linked to a counterparty, update their balance
    if payload.counterparty_id:
        cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.counterparty_id).first()
        if cp:
            rate = get_exchange_rate_for_date(db, payload.date)
            # When client pays (kirim): client debt decreases
            if normalized_type == "kirim" and cp.type == "client":
                if payload.currency == "USD":
                    cp.current_balance_usd -= payload.amount
                    cp.current_balance_uzs -= payload.amount * rate
                else:
                    cp.current_balance_uzs -= payload.amount
                    cp.current_balance_usd -= payload.amount / rate if rate > 0 else 0.0
            # When we pay supplier (chiqim): supplier debt to us decreases
            elif normalized_type == "chiqim" and cp.type == "supplier":
                if payload.currency == "USD":
                    cp.current_balance_usd += payload.amount
                    cp.current_balance_uzs += payload.amount * rate
                else:
                    cp.current_balance_uzs -= payload.amount
                    cp.current_balance_usd += payload.amount / rate if rate > 0 else 0.0

    tx = CashTransaction(
        register_id=payload.register_id,
        type=normalized_type,
        source_type=payload.source_type,
        counterparty_id=payload.counterparty_id,
        amount=payload.amount,
        currency=payload.currency,
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
    if role != "Admin":
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
