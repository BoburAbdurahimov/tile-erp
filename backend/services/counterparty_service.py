"""Counterparty balances and the clients behind Ombor orders.

A balance is positive when they owe us and negative when we owe them. It is
kept in dollars and in so'm; an amount in one currency is carried into the
other at that day's rate.

Ombor orders (Sotish) are taken for a client by name and phone. Each order is
tied to a Kontragent client with that phone (one is created when there is
none), so the client's debt and payments show in Kontragentlar and their
Akt-sverka: a delivered order adds its total, each payment through the Kassa
takes its amount off.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.models import CashTransaction, MDMCounterparty, SkladOrder, SkladOrderPayment
from backend.services.currency_service import get_exchange_rate_for_date

CLIENT = "client"


def add_to_balance(cp: MDMCounterparty, currency: str, amount: float, rate: float) -> None:
    """Change the balance by `amount` (in `currency`; negative lowers it)."""
    if currency == "USD":
        cp.current_balance_usd = (cp.current_balance_usd or 0.0) + amount
        cp.current_balance_uzs = (cp.current_balance_uzs or 0.0) + amount * rate
    else:
        cp.current_balance_uzs = (cp.current_balance_uzs or 0.0) + amount
        cp.current_balance_usd = (cp.current_balance_usd or 0.0) + (amount / rate if rate > 0 else 0.0)


def move_cash(cp: MDMCounterparty, tx_type: str, currency: str, amount: float, rate: float, sign: int = 1) -> None:
    """Kassa money: in from them lowers their balance, out to them raises it.

    That one rule covers both sides: a client paying (kirim) owes less, a
    supplier being paid (chiqim) is owed less (purchases make a supplier's
    balance negative), and refunds go the other way. sign=-1 undoes it."""
    add_to_balance(cp, currency, (-amount if tx_type == "kirim" else amount) * sign, rate)


def phone_key(phone: Optional[str]) -> str:
    """Last 9 digits: "+998 90 123-45-67", "998901234567" and "901234567" match."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-9:]


def _next_client_code(db: Session) -> str:
    # Clients are numbered 20001, 20002, ... (suppliers 10001, ...).
    n = db.query(MDMCounterparty).filter(MDMCounterparty.type == CLIENT).count() + 1
    while db.query(MDMCounterparty).filter(MDMCounterparty.code == str(20000 + n)).first():
        n += 1
    return str(20000 + n)


def client_for(db: Session, name: str, phone: str) -> MDMCounterparty:
    """The Kontragent client with this phone, created if there is none."""
    key = phone_key(phone)
    if key:
        for cp in db.query(MDMCounterparty).filter(MDMCounterparty.type == CLIENT).order_by(MDMCounterparty.id):
            if phone_key(cp.phone) == key:
                return cp
    cp = MDMCounterparty(code=_next_client_code(db), name=name.strip(), type=CLIENT, phone=phone.strip())
    db.add(cp)
    db.flush()
    return cp


def charge_delivery(db: Session, order: SkladOrder, sign: int = 1) -> None:
    """A delivered order: the client owes its total."""
    if not order.counterparty_id:
        return
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == order.counterparty_id).first()
    if cp:
        day = order.delivered_at.date() if order.delivered_at else date.today()
        add_to_balance(cp, order.currency or "UZS", (order.total_amount or 0.0) * sign,
                       get_exchange_rate_for_date(db, day))


def credit_payment(db: Session, tx: CashTransaction, sign: int = 1) -> None:
    """A payment received through the Kassa (tx carries the client)."""
    if not tx.counterparty_id:
        return
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == tx.counterparty_id).first()
    if cp:
        move_cash(cp, "kirim", tx.currency, tx.amount, get_exchange_rate_for_date(db, tx.date), sign=sign)


def link_order_clients(db: Session) -> int:
    """Tie orders taken before this existed to their Kontragent client and
    book what they already did: the delivery and the payments still standing
    in the Kassa. Safe to run again and from two places at once - an order is
    claimed with a conditional update before anything is booked."""
    from backend.services.order_service import ORDER_DELIVERED, _standing_payments

    linked = 0
    for o in db.query(SkladOrder).filter(SkladOrder.counterparty_id.is_(None)).order_by(SkladOrder.id).all():
        cp = client_for(db, o.client_name, o.client_phone)
        claimed = db.execute(
            update(SkladOrder)
            .where(SkladOrder.id == o.id, SkladOrder.counterparty_id.is_(None))
            .values(counterparty_id=cp.id)
            .execution_options(synchronize_session=False)
        ).rowcount
        if not claimed:
            continue
        o.counterparty_id = cp.id
        if o.status == ORDER_DELIVERED:
            charge_delivery(db, o)
        payment_ids = [pid for pid, _, _ in _standing_payments(db, [o.id])]
        for p in db.query(SkladOrderPayment).filter(SkladOrderPayment.id.in_(payment_ids)).all():
            tx = db.query(CashTransaction).filter(CashTransaction.id == p.cash_transaction_id).first()
            if tx and not tx.counterparty_id:
                tx.counterparty_id = cp.id
                credit_payment(db, tx)
        db.commit()
        linked += 1
    return linked
