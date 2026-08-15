from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    MDMCounterparty, Sale, SaleItem, Purchase, PurchaseItem,
    CashTransaction, ExchangeRate
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.currency_service import get_exchange_rate_for_date, convert_amount

router = APIRouter(prefix="/kontragentlar", tags=["MODUL 5: MIJOZLAR VA POSTAVSHIKLAR BALANSI"])

@router.get("/summary")
def get_counterparties_summary(
    view_currency: str = "USD", # "USD" or "UZS"
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kontragentlar", role)
    today = date.today()
    today_rate = get_exchange_rate_for_date(db, today)

    clients = db.query(MDMCounterparty).filter(
        MDMCounterparty.type == "client",
        MDMCounterparty.is_archived == False
    ).all()
    
    suppliers = db.query(MDMCounterparty).filter(
        MDMCounterparty.type == "supplier",
        MDMCounterparty.is_archived == False
    ).all()

    total_clients_usd = sum(c.current_balance_usd for c in clients)
    total_suppliers_usd = sum(s.current_balance_usd for s in suppliers)

    if view_currency == "UZS":
        total_clients_disp = total_clients_usd * today_rate
        total_suppliers_disp = total_suppliers_usd * today_rate
    else:
        total_clients_disp = total_clients_usd
        total_suppliers_disp = total_suppliers_usd

    def format_list(cps):
        res = []
        for cp in cps:
            if view_currency == "UZS":
                bal = cp.current_balance_usd * today_rate
                init_bal = cp.initial_balance_usd * today_rate
            else:
                bal = cp.current_balance_usd
                init_bal = cp.initial_balance_usd
                
            res.append({
                "id": cp.id,
                "code": cp.code,
                "name": cp.name,
                "type": cp.type,
                "is_resident": cp.is_resident,
                "region": cp.region,
                "phone": cp.phone,
                "initial_balance": round(init_bal, 2),
                "current_balance": round(bal, 2),
                "current_balance_usd": round(cp.current_balance_usd or 0.0, 2),
                "current_balance_uzs": round((cp.current_balance_usd or 0.0) * today_rate, 2),
                "balance_usd": round(cp.current_balance_usd or 0.0, 2),
                "balance_uzs": round((cp.current_balance_usd or 0.0) * today_rate, 2),
                "currency": view_currency
            })
        return res

    return {
        "view_currency": view_currency,
        "exchange_rate": today_rate,
        "total_clients_balance": round(total_clients_disp, 2),
        "total_suppliers_balance": round(total_suppliers_disp, 2),
        "clients": format_list(clients),
        "suppliers": format_list(suppliers)
    }

@router.get("/{counterparty_id}/ledger")
def get_counterparty_ledger(
    counterparty_id: int,
    view_currency: str = "USD",
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kontragentlar", role)
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == counterparty_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Kontragent topilmadi.")

    ledger_entries = []

    # 1. Initial Balance Entry
    init_bal = cp.initial_balance_usd if view_currency == "USD" else cp.initial_balance_uzs
    ledger_entries.append({
        "id": "INIT",
        "date": cp.created_at.date() if cp.created_at else date(2026, 1, 1),
        "type": "Boshlang'ich qoldiq",
        "item_name": "Boshlang'ich balans",
        "quantity": 1,
        "unit": "dona",
        "price": round(init_bal, 2),
        "doc_currency": "USD" if view_currency == "USD" else "UZS",
        "doc_amount": round(init_bal, 2),
        "rate_on_date": 1.0,
        "amount_view_currency": round(init_bal, 2),
        "description": "Tizimga kiritilgan boshlang'ich qoldiq"
    })

    # 2. Sales (if client)
    if cp.type == "client":
        sales = db.query(Sale).filter(
            Sale.client_id == counterparty_id,
            Sale.status == "Tasdiqlandi"
        ).all()
        for s in sales:
            hist_rate = get_exchange_rate_for_date(db, s.date)
            for item in s.items:
                conv_amount = convert_amount(item.total_price, s.currency, view_currency, s.date, db)
                ledger_entries.append({
                    "id": f"SALE-{s.sale_number}-{item.id}",
                    "date": s.date,
                    "type": "Sotuv (Tovarlar berildi)",
                    "item_name": item.material.name if item.material else "Mahsulot",
                    "quantity": item.quantity,
                    "unit": item.material.unit if item.material else "m2",
                    "price": item.unit_price,
                    "doc_currency": s.currency,
                    "doc_amount": round(item.total_price, 2),
                    "rate_on_date": hist_rate,
                    "amount_view_currency": round(conv_amount, 2),
                    "description": s.description or f"Sotuv #{s.sale_number}"
                })

    # 3. Purchases (if supplier)
    if cp.type == "supplier":
        purchases = db.query(Purchase).filter(
            Purchase.supplier_id == counterparty_id,
            Purchase.status == "Tasdiqlandi"
        ).all()
        for p in purchases:
            hist_rate = get_exchange_rate_for_date(db, p.date)
            for item in p.items:
                conv_amount = convert_amount(item.total_price, p.currency, view_currency, p.date, db)
                ledger_entries.append({
                    "id": f"PUR-{p.purchase_number}-{item.id}",
                    "date": p.date,
                    "type": "Xarid (Material olindi)",
                    "item_name": item.material.name if item.material else "Material",
                    "quantity": item.quantity,
                    "unit": item.material.unit if item.material else "kg",
                    "price": item.unit_price,
                    "doc_currency": p.currency,
                    "doc_amount": round(item.total_price, 2),
                    "rate_on_date": hist_rate,
                    "amount_view_currency": round(-conv_amount, 2), # debt we owe
                    "description": p.description or f"Xarid #{p.purchase_number}"
                })

    # 4. Cash Payments (Kassa Kirim / Chiqim)
    cash_txs = db.query(CashTransaction).filter(CashTransaction.counterparty_id == counterparty_id).all()
    for tx in cash_txs:
        hist_rate = get_exchange_rate_for_date(db, tx.date)
        conv_amount = convert_amount(tx.amount, tx.currency, view_currency, tx.date, db)
        
        if tx.type == "kirim":
            tx_type_label = "To'lov qabul qilindi (Kassa Kirim)"
            effect = -conv_amount if cp.type == "client" else conv_amount
        else:
            tx_type_label = "To'lov amalga oshirildi (Kassa Chiqim)"
            effect = conv_amount if cp.type == "client" else -conv_amount
            
        ledger_entries.append({
            "id": f"CASH-{tx.id}",
            "date": tx.date,
            "type": tx_type_label,
            "item_name": f"Kassa to'lovi ({tx.currency})",
            "quantity": 1,
            "unit": "to'lov",
            "price": tx.amount,
            "doc_currency": tx.currency,
            "doc_amount": round(tx.amount, 2),
            "rate_on_date": hist_rate,
            "amount_view_currency": round(effect, 2),
            "description": tx.description or f"Kassa #{tx.register_id}"
        })

    # Sort ledger entries chronologically
    ledger_entries.sort(key=lambda x: x["date"])

    return {
        "counterparty_id": cp.id,
        "code": cp.code,
        "name": cp.name,
        "type": cp.type,
        "view_currency": view_currency,
        "current_balance_usd": round(cp.current_balance_usd, 2),
        "ledger": ledger_entries
    }
