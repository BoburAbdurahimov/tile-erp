"""History: one timeline of every movement in the factory.

Nothing is stored here. Each source (Ombor movements, orders, purchases,
production, Kassa, ...) is read for the requested period and turned into a
common event shape, newest first.
"""
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission
from backend.models import (
    SkladMovement, SkladOrder, Purchase, Sale, ProductionOrder, LineExpense,
    StockTransfer, CashTransaction, AuditLog,
    SKLAD_OP_IN, SKLAD_OP_OUT, SKLAD_OP_STORNO, ORDER_DELIVERED, ORDER_CANCELLED,
    SKLAD_CONFIG,
)
from backend.services import sklad_service as sklad
from backend.services import order_service

router = APIRouter(prefix="/history", tags=["MODUL: TARIX (Barcha harakatlar)"])

# Stored UTC timestamps are shown in Tashkent time (UTC+5 all year).
TASHKENT_OFFSET = timedelta(hours=5)

KINDS = [
    "ombor_kirim", "ombor_sotuv", "ombor_storno",
    "buyurtma", "yetkazish", "buyurtma_bekor",
    "xarid", "sotuv_eski", "ishlab_chiqarish", "sarf",
    "kochirish", "kassa_kirim", "kassa_chiqim", "amal",
]

# Ombor movements written by other modules are shown by those modules'
# own, richer events instead.
PRODUCTION_PREFIXES = ("Ishlab chiqarish PRD-", "Storno PRD-")


def _local(dt: Optional[datetime]) -> Optional[datetime]:
    return dt + TASHKENT_OFFSET if dt else None


def _at(d: Optional[date], created: Optional[datetime]) -> datetime:
    """Sort key: the creation moment, or the business date if that is all we have."""
    if created:
        return _local(created)
    if d:
        return datetime(d.year, d.month, d.day)
    return datetime.min


def _event(kind, at, ref=None, place=None, party=None, details=None,
           quantity=None, amount=None, currency=None, status=None, user=None,
           sklad_id=None):
    cfg = sklad.get_config(sklad_id) if sklad_id else None
    return {
        "kind": kind,
        "at": at.isoformat(timespec="minutes") if at and at != datetime.min else None,
        "ref": ref, "place": place, "party": party, "details": details,
        "quantity": quantity, "amount": round(amount, 2) if amount is not None else None,
        "currency": currency, "status": status, "user": user,
        # Ombor owner (Toxir / Kodir / Istam / Aziz) for the owner filter
        "owner": cfg["name"] if cfg else None,
    }


def _sizes(items) -> str:
    return ", ".join(f"{i.length + i.width} × {i.quantity}" for i in items)


def collect(db: Session, start: datetime, end: datetime, limit: int) -> list[dict]:
    events: list[dict] = []
    d0, d1 = start.date(), (end - timedelta(seconds=1)).date()
    utc0, utc1 = start - TASHKENT_OFFSET, end - TASHKENT_OFFSET

    # --- Ombor (dimensional warehouse) movements
    for m in (db.query(SkladMovement)
              .filter(SkladMovement.occurred_at >= utc0, SkladMovement.occurred_at < utc1)
              .order_by(SkladMovement.occurred_at.desc()).limit(limit).all()):
        if (m.client_name or "").startswith(PRODUCTION_PREFIXES):
            continue
        if m.operation == SKLAD_OP_OUT and m.client_name and "(BUY-" in m.client_name:
            continue  # shown as the order's delivery
        kind = {SKLAD_OP_IN: "ombor_kirim", SKLAD_OP_OUT: "ombor_sotuv",
                SKLAD_OP_STORNO: "ombor_storno"}.get(m.operation)
        if not kind:
            continue
        pieces = sum(i.quantity for i in m.items)
        events.append(_event(
            kind, _local(m.occurred_at), ref=f"#{m.id}", place=sklad.sklad_label(m.sklad_id),
            sklad_id=m.sklad_id,
            party=m.client_name, details=_sizes(m.items) or m.details,
            quantity=f"{pieces} dona",
            amount=m.grand_total if m.operation == SKLAD_OP_OUT else None,
            currency="UZS" if m.operation == SKLAD_OP_OUT else None, user=m.created_by,
        ))

    # --- Sales orders: taken, delivered, cancelled
    for o in (db.query(SkladOrder)
              .filter(SkladOrder.created_at >= utc0, SkladOrder.created_at < utc1)
              .order_by(SkladOrder.created_at.desc()).limit(limit).all()):
        events.append(_event(
            "buyurtma_bekor" if o.status == ORDER_CANCELLED else "buyurtma",
            _local(o.created_at), ref=o.order_number, place=sklad.sklad_label(o.sklad_id),
            sklad_id=o.sklad_id,
            party=f"{o.client_name} · {o.client_phone}", details=_sizes(o.items),
            quantity=f"{sum(i.quantity for i in o.items)} dona",
            amount=o.total_amount, currency=o.currency, status=o.status, user=o.created_by,
        ))
    for o in (db.query(SkladOrder)
              .filter(SkladOrder.status == ORDER_DELIVERED,
                      SkladOrder.delivered_at >= start, SkladOrder.delivered_at < end)
              .order_by(SkladOrder.delivered_at.desc()).limit(limit).all()):
        car = " · ".join(x for x in [o.car_number, o.driver_name, o.driver_phone] if x)
        events.append(_event(
            "yetkazish", o.delivered_at, ref=o.order_number, place=sklad.sklad_label(o.sklad_id),
            sklad_id=o.sklad_id,
            party=f"{o.client_name} · {o.client_phone}",
            details=f"{_sizes(o.items)}" + (f" — {car}" if car else ""),
            quantity=f"{sum(i.quantity for i in o.items)} dona",
            amount=o.total_amount, currency=o.currency, status=o.status, user=o.created_by,
        ))

    # --- Purchases from suppliers
    for p in (db.query(Purchase).filter(Purchase.date >= d0, Purchase.date <= d1)
              .order_by(Purchase.date.desc()).limit(limit).all()):
        lines = []
        for it in p.items:
            if it.sklad_id and it.length is not None:
                lines.append(f"{sklad.sklad_label(it.sklad_id)} {it.length + it.width} × {it.quantity:g}")
            elif it.material:
                lines.append(f"{it.material.name} × {it.quantity:g} {it.material.unit}")
        events.append(_event(
            "xarid", _at(p.date, p.created_at), ref=p.purchase_number,
            place=p.warehouse.name if p.warehouse else None,
            party=p.supplier.name if p.supplier else None, details=", ".join(lines),
            amount=p.total_amount, currency=p.currency, status=p.status,
        ))

    # --- Legacy sales documents
    for s in (db.query(Sale).filter(Sale.date >= d0, Sale.date <= d1)
              .order_by(Sale.date.desc()).limit(limit).all()):
        events.append(_event(
            "sotuv_eski", _at(s.date, s.created_at), ref=s.sale_number,
            place=s.warehouse.name if s.warehouse else None,
            party=s.client.name if s.client else None,
            details=", ".join(f"{i.material.name if i.material else ''} × {i.quantity:g}" for i in s.items),
            amount=s.total_amount, currency=s.currency, status=s.status,
        ))

    # --- Production
    for o in (db.query(ProductionOrder)
              .filter(ProductionOrder.date >= d0, ProductionOrder.date <= d1)
              .order_by(ProductionOrder.date.desc()).limit(limit).all()):
        if o.out_sklad_id and o.out_length is not None:
            out = f"{sklad.sklad_label(o.out_sklad_id)} {o.out_length + o.out_width}"
            prod_sklad = o.out_sklad_id
            unit = "dona"
        else:
            out = o.output_material.name if o.output_material else ""
            prod_sklad = None
            unit = o.output_material.unit if o.output_material else ""
        used = ", ".join(f"{c.material.name if c.material else ''} {c.quantity:g}"
                         for c in o.consumed_materials)
        events.append(_event(
            "ishlab_chiqarish", _at(o.date, o.created_at), ref=o.order_number,
            place=o.line.name if o.line else None,
            details=out + (f" — sarf: {used}" if used else ""),
            quantity=f"{o.quantity:g} {unit}".strip(),
            amount=o.total_cost_usd, currency="USD", status=o.status, sklad_id=prod_sklad,
        ))

    # --- Line expenses (consumables issued to lines)
    for e in (db.query(LineExpense).filter(LineExpense.date >= d0, LineExpense.date <= d1)
              .order_by(LineExpense.date.desc()).limit(limit).all()):
        events.append(_event(
            "sarf", _at(e.date, e.created_at), ref=e.expense_number,
            place=e.warehouse.name if e.warehouse else None,
            party=f"Liniya: {e.line_ids_str}",
            details=", ".join(f"{i.material.name if i.material else ''} × {i.quantity:g}" for i in e.items),
            amount=e.total_cost_usd, currency="USD", status=e.status,
        ))

    # --- Transfers between the material warehouses
    for t in (db.query(StockTransfer).filter(StockTransfer.date >= d0, StockTransfer.date <= d1)
              .order_by(StockTransfer.date.desc()).limit(limit).all()):
        events.append(_event(
            "kochirish", _at(t.date, t.created_at), ref=t.transfer_number,
            place=f"{t.from_warehouse.name if t.from_warehouse else ''} → {t.to_warehouse.name if t.to_warehouse else ''}",
            details=t.material.name if t.material else None,
            quantity=f"{t.quantity:g} {t.material.unit if t.material else ''}".strip(),
            amount=t.total_cost_usd, currency="USD", user=t.created_by,
        ))

    # --- Kassa
    for c in (db.query(CashTransaction)
              .filter(CashTransaction.date >= d0, CashTransaction.date <= d1)
              .order_by(CashTransaction.date.desc()).limit(limit).all()):
        events.append(_event(
            "kassa_kirim" if c.type == "kirim" else "kassa_chiqim", _at(c.date, c.created_at),
            ref=f"#{c.id}", place=c.register.name if c.register else None,
            party=c.counterparty.name if c.counterparty else None,
            details=" — ".join(x for x in [c.category, c.description] if x),
            amount=c.amount, currency=c.currency, status=c.status,
        ))

    # --- Who did what (every change made through the API)
    for a in (db.query(AuditLog)
              .filter(AuditLog.created_at >= utc0, AuditLog.created_at < utc1)
              .order_by(AuditLog.created_at.desc()).limit(limit).all()):
        events.append(_event(
            "amal", _local(a.created_at), ref=a.entity_id and f"#{a.entity_id}",
            place=a.module, details=a.details, status=a.action, user=a.username or "-",
        ))

    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return events


@router.get("")
def history(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    kind: Optional[str] = Query(None, description="Comma-separated event kinds"),
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    check_permission("tarix", role)
    end = end or (datetime.utcnow() + TASHKENT_OFFSET).date()
    start = start or (end - timedelta(days=30))
    start_dt = datetime(start.year, start.month, start.day)
    end_dt = datetime(end.year, end.month, end.day) + timedelta(days=1)

    events = collect(db, start_dt, end_dt, limit)

    if kind:
        wanted = {k.strip() for k in kind.split(",") if k.strip()}
        events = [e for e in events if e["kind"] in wanted]
    if search:
        q = search.strip().lower()
        events = [e for e in events if any(
            q in str(e.get(f) or "").lower() for f in ("ref", "place", "party", "details", "user")
        )]

    debts = [
        {
            "order_number": o["order_number"],
            "client_name": o["client_name"],
            "client_phone": o["client_phone"],
            "place": o["sklad_label"],
            "owner": (sklad.get_config(o["sklad_id"]) or {}).get("name"),
            "delivered_at": o.get("delivered_at"),
            "total": o["total_amount"],
            "paid": o["paid_amount"],
            "balance": round(o["total_amount"] - o["paid_amount"], 2),
            "currency": o["currency"],
        }
        for o in order_service.list_orders(db, status=ORDER_DELIVERED)
        if o["total_amount"] - o["paid_amount"] > 0.005
    ]
    debts.sort(key=lambda d: d["delivered_at"] or "")

    counts: dict[str, int] = {}
    for e in events:
        counts[e["kind"]] = counts.get(e["kind"], 0) + 1

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "kinds": KINDS,
        "counts": counts,
        "events": events[:limit],
        "debts": debts,
        "owners": sorted({c["name"] for c in SKLAD_CONFIG}),
    }
