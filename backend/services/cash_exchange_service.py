"""Konvertatsiya: money moved from one Kassa to another.

Dollars are sold for so'm (Kassa USD -> Kassa UZS) or bought with them at a
rate - the day's rate unless another is given - and money can also move
between two registers of one currency (Kassa UZS -> Karta UZS). It is a
chiqim from one register and a kirim into the other, tied together by a
CashExchange: deleting either one in the Kassa undoes both. It is neither
income nor an expense, so the cash flow report leaves it out.
"""
from __future__ import annotations

from datetime import date
from typing import Optional, Set

from sqlalchemy import extract, or_
from sqlalchemy.orm import Session

from backend.models import AuditLog, CashExchange, CashRegister, CashTransaction
from backend.services.currency_service import get_exchange_rate_for_date
from backend.services.month_close_service import is_month_closed

EXCHANGE_CATEGORY = "Konvertatsiya"


def _money(amount: float, currency: str) -> str:
    text = f"{amount:,.2f}" if currency == "USD" else f"{amount:,.0f}"
    return f"{text.replace(',', ' ')} {'USD' if currency == 'USD' else 'UZS'}"


def exchange_between_registers(
    db: Session,
    from_register_id: int,
    to_register_id: int,
    amount: float,
    entry_date: date,
    rate: Optional[float] = None,
    note: Optional[str] = None,
    current_user: str = "Admin",
) -> CashExchange:
    """Move `amount` (in the from register's currency) into the other register.
    Between dollars and so'm: received = amount x rate (USD -> UZS) or
    amount / rate (UZS -> USD), rate in so'm per dollar."""
    src = db.query(CashRegister).filter(CashRegister.id == from_register_id).first()
    dst = db.query(CashRegister).filter(CashRegister.id == to_register_id).first()
    if not src or not dst:
        raise ValueError("Kassa topilmadi")
    if src.id == dst.id:
        raise ValueError("Pul boshqa kassaga o'tkaziladi: ikkinchi kassani tanlang")
    amount = round(float(amount or 0.0), 2)
    if amount <= 0:
        raise ValueError("Summa musbat bo'lishi kerak")
    if round(src.balance or 0.0, 2) < amount:
        raise ValueError(f"{src.name} da yetarli mablag' yo'q: {_money(src.balance or 0.0, src.currency)} bor, "
                         f"kerak {_money(amount, src.currency)}.")
    if is_month_closed(db, entry_date):
        raise ValueError(f"{entry_date:%Y-%m} oyi yopilgan - kassaga yozib bo'lmaydi.")

    note = (note or "").strip() or None
    if src.currency == dst.currency:
        used_rate = None
        received = amount
        how = _money(amount, src.currency)
    else:
        used_rate = round(float(rate), 4) if rate else get_exchange_rate_for_date(db, entry_date)
        if not used_rate or used_rate <= 0:
            raise ValueError("Kurs musbat bo'lishi kerak")
        if src.currency == "USD":
            received = amount * used_rate
            how = f"{_money(amount, 'USD')} x {used_rate:,.2f}".replace(",", " ") + f" = {_money(round(received, 2), 'UZS')}"
        else:
            received = amount / used_rate
            how = f"{_money(amount, 'UZS')} / {used_rate:,.2f}".replace(",", " ") + f" = {_money(round(received, 2), 'USD')}"
    received = round(received, 2)
    if received <= 0:
        raise ValueError("Summa juda kichik")

    text = f"Konvertatsiya: {src.name} -> {dst.name}, {how}" + (f" ({note})" if note else "")
    out_tx = CashTransaction(register_id=src.id, type="chiqim", source_type="other", amount=amount,
                             currency=src.currency, category=EXCHANGE_CATEGORY, date=entry_date,
                             description=text, status="Tasdiqlandi")
    in_tx = CashTransaction(register_id=dst.id, type="kirim", source_type="other", amount=received,
                            currency=dst.currency, category=EXCHANGE_CATEGORY, date=entry_date,
                            description=text, status="Tasdiqlandi")
    db.add_all([out_tx, in_tx])
    src.balance = round((src.balance or 0.0) - amount, 4)
    dst.balance = round((dst.balance or 0.0) + received, 4)
    db.flush()

    ex = CashExchange(date=entry_date, from_register_id=src.id, to_register_id=dst.id,
                      from_amount=amount, to_amount=received, rate=used_rate,
                      out_tx_id=out_tx.id, in_tx_id=in_tx.id, note=note, entered_by=current_user)
    db.add(ex)
    db.add(AuditLog(username=current_user, action="CREATE", module="Kassa / Konvertatsiya",
                    entity_id=str(out_tx.id), details=text))
    db.commit()
    db.refresh(ex)
    return ex


def exchange_of_transaction(db: Session, tx_id: int) -> Optional[CashExchange]:
    return db.query(CashExchange).filter(
        or_(CashExchange.out_tx_id == tx_id, CashExchange.in_tx_id == tx_id)).first()


def undo_exchange(db: Session, ex: CashExchange, current_user: str = "Admin") -> None:
    """Both entries go and both registers get their money back. Refused when
    the received money has already been spent. Does not commit."""
    if is_month_closed(db, ex.date):
        raise ValueError(f"{ex.date:%Y-%m} oyi yopilgan - konvertatsiyani bekor qilib bo'lmaydi.")
    out_tx = db.query(CashTransaction).filter(CashTransaction.id == ex.out_tx_id).first() if ex.out_tx_id else None
    in_tx = db.query(CashTransaction).filter(CashTransaction.id == ex.in_tx_id).first() if ex.in_tx_id else None
    src = db.query(CashRegister).filter(CashRegister.id == ex.from_register_id).first()
    dst = db.query(CashRegister).filter(CashRegister.id == ex.to_register_id).first()
    if in_tx and dst and round(dst.balance or 0.0, 2) < round(in_tx.amount, 2):
        raise ValueError(f"{dst.name} da {_money(dst.balance or 0.0, dst.currency)} bor - "
                         f"{_money(in_tx.amount, dst.currency)} ni qaytarib bo'lmaydi (pul allaqachon ishlatilgan).")
    if in_tx and dst:
        dst.balance = round((dst.balance or 0.0) - in_tx.amount, 4)
    if out_tx and src:
        src.balance = round((src.balance or 0.0) + out_tx.amount, 4)
    details = (out_tx or in_tx).description if (out_tx or in_tx) else f"Konvertatsiya #{ex.id}"
    db.delete(ex)
    db.flush()
    for tx in (out_tx, in_tx):
        if tx:
            db.delete(tx)
    db.add(AuditLog(username=current_user, action="DELETE", module="Kassa / Konvertatsiya",
                    entity_id=str(ex.out_tx_id or ex.in_tx_id or ex.id), details=f"Bekor qilindi: {details}"))


def exchange_transaction_ids(db: Session, year: int, month: int) -> Set[int]:
    """The Kassa entries of a month's konvertatsiyalar."""
    ids: Set[int] = set()
    for out_id, in_id in db.query(CashExchange.out_tx_id, CashExchange.in_tx_id).filter(
            extract('year', CashExchange.date) == year, extract('month', CashExchange.date) == month):
        ids.update(i for i in (out_id, in_id) if i)
    return ids
