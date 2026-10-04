"""Dimensional warehouse: stock, receipts and sales.

Stock is held per warehouse as a length x width matrix, the same shape the
Telegram sklad bot uses, so the two systems describe goods identically.

Pricing follows the bot exactly:

    linear     = (length + width) / 100            linear metres per piece
    piece_size = linear                            when selling by "metr"
    piece_size = linear * (eni / 100)              when selling by "mkv"
    units      = quantity * piece_size
    line_total = units * unit_price

Delivery is charged on top of the goods and is spread across the lines in
proportion to their units, so every line carries its share.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import (
    SkladInventory, SkladMovement, SkladMovementItem,
    SKLAD_CONFIG, SKLAD_LENGTHS, SKLAD_WIDTHS,
    SKLAD_OP_IN, SKLAD_OP_OUT, SKLAD_OP_CLEAR, SKLAD_OP_STORNO,
    SELL_TYPE_METR, SELL_TYPE_MKV,
)


class SkladError(Exception):
    """Raised for anything the caller did wrong - surfaced as a 400."""


# ---------------------------------------------------------------- config

def get_config(sklad_id: int) -> Optional[dict]:
    return next((s for s in SKLAD_CONFIG if s["id"] == sklad_id), None)


def sklad_label(sklad_id: int) -> str:
    cfg = get_config(sklad_id)
    return f"{cfg['name']} {cfg['eni']}" if cfg else f"Sklad {sklad_id}"


def resolve_sklad_by_eni(sklad_id: int, target_eni: Optional[int]) -> int:
    """The bot lets a line be billed against the same owner's other eni."""
    if not target_eni:
        return sklad_id
    cfg = get_config(sklad_id)
    if not cfg:
        return sklad_id
    for s in SKLAD_CONFIG:
        if s["name"] == cfg["name"] and s["eni"] == target_eni:
            return s["id"]
    return sklad_id


def decode_size(code: int) -> tuple[int, int]:
    """680 -> (600, 80). Raises if the size is not one the warehouse holds."""
    length = (code // 100) * 100
    width = code % 100
    if length not in SKLAD_LENGTHS or width not in SKLAD_WIDTHS:
        raise SkladError(
            f"{code} - bunday o'lcham yo'q. "
            f"Uzunlik: {SKLAD_LENGTHS}, kenglik: {SKLAD_WIDTHS}."
        )
    return length, width


def piece_units(length: int, width: int, eni: int, sell_type: str) -> float:
    """Metres (or square metres) in a single piece of this size."""
    linear = (length + width) / 100.0
    if sell_type == SELL_TYPE_MKV:
        return linear * (eni / 100.0)
    return linear


# ---------------------------------------------------------------- reads

def ensure_rows(db: Session, sklad_id: int) -> None:
    """Make sure every cell of the matrix exists, so the grid is never ragged."""
    existing = {
        (r.length, r.width)
        for r in db.query(SkladInventory.length, SkladInventory.width)
        .filter(SkladInventory.sklad_id == sklad_id)
    }
    missing = [
        SkladInventory(sklad_id=sklad_id, length=l, width=w, quantity=0)
        for l in SKLAD_LENGTHS for w in SKLAD_WIDTHS
        if (l, w) not in existing
    ]
    if missing:
        db.add_all(missing)
        db.commit()


def get_matrix(db: Session, sklad_id: int) -> dict:
    cfg = get_config(sklad_id)
    rows = db.query(SkladInventory).filter(
        SkladInventory.sklad_id == sklad_id,
        SkladInventory.quantity != 0,
    ).all()

    cells = [{
        "length": r.length,
        "width": r.width,
        "code": r.length + r.width,
        "quantity": r.quantity,
    } for r in rows]

    total_qty = sum(c["quantity"] for c in cells)
    total_metr = sum(c["quantity"] * (c["length"] + c["width"]) / 100 for c in cells)
    eni = cfg["eni"] if cfg else 120
    total_mkv = sum(
        c["quantity"] * piece_units(c["length"], c["width"], eni, SELL_TYPE_MKV)
        for c in cells
    )

    return {
        "sklad_id": sklad_id,
        "name": cfg["name"] if cfg else f"Sklad {sklad_id}",
        "eni": eni,
        "corner_number": cfg["corner_number"] if cfg else sklad_id,
        "rows": SKLAD_LENGTHS,
        "cols": SKLAD_WIDTHS,
        "cells": cells,
        "total_qty": total_qty,
        "total_metr": round(total_metr, 2),
        "total_mkv": round(total_mkv, 2),
    }


def get_all_totals(db: Session) -> list:
    sums = dict(
        db.query(SkladInventory.sklad_id, func.sum(SkladInventory.quantity))
        .group_by(SkladInventory.sklad_id)
        .all()
    )
    out = []
    for s in SKLAD_CONFIG:
        out.append({
            "sklad_id": s["id"],
            "name": s["name"],
            "eni": s["eni"],
            "corner_number": s["corner_number"],
            "total_qty": int(sums.get(s["id"]) or 0),
        })
    return out


# ---------------------------------------------------------------- writes

def _apply_delta(db: Session, sklad_id: int, length: int, width: int, delta: int) -> int:
    row = db.query(SkladInventory).filter(
        SkladInventory.sklad_id == sklad_id,
        SkladInventory.length == length,
        SkladInventory.width == width,
    ).first()
    if row is None:
        row = SkladInventory(sklad_id=sklad_id, length=length, width=width, quantity=0)
        db.add(row)
        db.flush()
    row.quantity = (row.quantity or 0) + delta
    return row.quantity


def receive_stock(
    db: Session,
    sklad_id: int,
    items: list,
    client_name: Optional[str] = None,
    note: Optional[str] = None,
    created_by: Optional[str] = None,
) -> SkladMovement:
    """PRIXOD - goods in. `items` are {code | length+width, quantity}."""
    if not items:
        raise SkladError("Kamida bitta o'lcham kiriting.")

    parsed = []
    for it in items:
        qty = int(it.get("quantity") or 0)
        if qty <= 0:
            continue
        if it.get("code") is not None:
            length, width = decode_size(int(it["code"]))
        else:
            length, width = int(it["length"]), int(it["width"])
            decode_size(length + width)
        parsed.append((length, width, qty))

    if not parsed:
        raise SkladError("Miqdor noldan katta bo'lishi kerak.")

    movement = SkladMovement(
        sklad_id=sklad_id,
        operation=SKLAD_OP_IN,
        details="; ".join(f"{q} TA {l + w}" for l, w, q in parsed),
        occurred_at=datetime.utcnow(),
        client_name=client_name,
        client_address=note,
        created_by=created_by,
    )
    db.add(movement)
    db.flush()

    for length, width, qty in parsed:
        _apply_delta(db, sklad_id, length, width, qty)
        db.add(SkladMovementItem(
            movement_id=movement.id,
            length=length, width=width, quantity=qty,
            eni=(get_config(sklad_id) or {}).get("eni", 120),
        ))

    db.commit()
    db.refresh(movement)
    return movement


def reverse_receipt(
    db: Session,
    sklad_id: int,
    length: int,
    width: int,
    quantity: int,
    client_name: Optional[str] = None,
    created_by: Optional[str] = None,
) -> SkladMovement:
    """Take back pieces that were received (STORNO). Does not commit."""
    qty = int(quantity or 0)
    if qty <= 0:
        raise SkladError("Miqdor noldan katta bo'lishi kerak.")
    row = db.query(SkladInventory).filter(
        SkladInventory.sklad_id == sklad_id,
        SkladInventory.length == length,
        SkladInventory.width == width,
    ).first()
    on_hand = (row.quantity or 0) if row else 0
    if on_hand < qty:
        raise SkladError(
            f"{sklad_label(sklad_id)}: {length + width} o'lchamdan omborda {on_hand} ta bor, "
            f"{qty} ta qaytarib bo'lmaydi - mahsulot allaqachon sotilgan."
        )
    movement = SkladMovement(
        sklad_id=sklad_id,
        operation=SKLAD_OP_STORNO,
        details=f"{qty} TA {length + width}",
        occurred_at=datetime.utcnow(),
        client_name=client_name,
        created_by=created_by,
    )
    db.add(movement)
    db.flush()
    _apply_delta(db, sklad_id, length, width, -qty)
    db.add(SkladMovementItem(
        movement_id=movement.id,
        length=length, width=width, quantity=qty,
        eni=(get_config(sklad_id) or {}).get("eni", 120),
    ))
    return movement


def sell_stock(
    db: Session,
    sklad_id: int,
    items: list,
    sell_type: str,
    delivery_cost: float = 0.0,
    client_name: Optional[str] = None,
    client_address: Optional[str] = None,
    client_phone: Optional[str] = None,
    created_by: Optional[str] = None,
) -> SkladMovement:
    """RASXOD - a sale. Each item may carry its own unit_price and eni.

    Stock is checked for every line before anything is written, so a sale
    either goes through whole or not at all.
    """
    if sell_type not in (SELL_TYPE_METR, SELL_TYPE_MKV):
        raise SkladError("Sotuv turi 'metr' yoki 'mkv' bo'lishi kerak.")
    if not items:
        raise SkladError("Kamida bitta o'lcham kiriting.")

    default_eni = (get_config(sklad_id) or {}).get("eni", 120)

    parsed = []
    for it in items:
        qty = int(it.get("quantity") or 0)
        if qty <= 0:
            continue
        if it.get("code") is not None:
            length, width = decode_size(int(it["code"]))
        else:
            length, width = int(it["length"]), int(it["width"])
            decode_size(length + width)
        eni = int(it.get("eni") or default_eni)
        price = float(it.get("unit_price") or 0.0)
        if price < 0:
            raise SkladError("Narx manfiy bo'lishi mumkin emas.")
        # A line billed against the other eni comes off that warehouse.
        source = resolve_sklad_by_eni(sklad_id, eni) if eni != default_eni else sklad_id
        parsed.append({
            "length": length, "width": width, "quantity": qty,
            "eni": eni, "unit_price": price, "source_sklad": source,
        })

    if not parsed:
        raise SkladError("Miqdor noldan katta bo'lishi kerak.")

    # Check every line can be covered before writing anything.
    needed: dict[tuple, int] = {}
    for p in parsed:
        key = (p["source_sklad"], p["length"], p["width"])
        needed[key] = needed.get(key, 0) + p["quantity"]

    for (src, length, width), qty in needed.items():
        row = db.query(SkladInventory).filter(
            SkladInventory.sklad_id == src,
            SkladInventory.length == length,
            SkladInventory.width == width,
        ).first()
        have = row.quantity if row else 0
        if have < qty:
            raise SkladError(
                f"Yetarli emas: {length}x{width} ({length + width}) "
                f"{sklad_label(src)} omborida {have} ta bor, {qty} ta so'ralmoqda."
            )

    # Units and money.
    total_units = 0.0
    for p in parsed:
        p["units"] = p["quantity"] * piece_units(p["length"], p["width"], p["eni"], sell_type)
        p["line_total"] = p["units"] * p["unit_price"]
        total_units += p["units"]

    total_revenue = sum(p["line_total"] for p in parsed)
    delivery_cost = float(delivery_cost or 0.0)

    prices = {p["unit_price"] for p in parsed if p["unit_price"]}
    movement = SkladMovement(
        sklad_id=sklad_id,
        operation=SKLAD_OP_OUT,
        details="; ".join(f"{p['quantity']} TA {p['length'] + p['width']}" for p in parsed),
        occurred_at=datetime.utcnow(),
        sell_type=sell_type,
        # One price across the sale is reported as that price; a mixed sale
        # reports its average per unit instead of an arbitrary one.
        unit_price=(prices.pop() if len(prices) == 1
                    else (round(total_revenue / total_units, 2) if total_units else None)),
        total_units=round(total_units, 3),
        total_revenue=round(total_revenue, 2),
        delivery_cost=round(delivery_cost, 2),
        client_name=client_name,
        client_address=client_address,
        client_phone=client_phone,
        created_by=created_by,
    )
    db.add(movement)
    db.flush()

    for p in parsed:
        _apply_delta(db, p["source_sklad"], p["length"], p["width"], -p["quantity"])
        db.add(SkladMovementItem(
            movement_id=movement.id,
            length=p["length"], width=p["width"], quantity=p["quantity"],
            eni=p["eni"], unit_price=p["unit_price"],
            units=round(p["units"], 3), line_total=round(p["line_total"], 2),
        ))

    db.commit()
    db.refresh(movement)
    return movement


def delivery_share(movement: SkladMovement) -> dict:
    """Delivery spread across lines in proportion to their units."""
    total_units = sum((i.units or 0.0) for i in movement.items)
    delivery = movement.delivery_cost or 0.0
    per_unit = (delivery / total_units) if total_units else 0.0
    return {
        i.id: round((i.units or 0.0) * per_unit, 2)
        for i in movement.items
    }


# ---------------------------------------------------------------- reporting

def get_movements(db: Session, limit: int = 50, sklad_id: Optional[int] = None,
                  operation: Optional[str] = None) -> list:
    q = db.query(SkladMovement)
    if sklad_id is not None:
        q = q.filter(SkladMovement.sklad_id == sklad_id)
    if operation:
        q = q.filter(SkladMovement.operation == operation)
    movements = q.order_by(SkladMovement.occurred_at.desc()).limit(max(1, min(limit, 500))).all()

    out = []
    for m in movements:
        share = delivery_share(m) if m.operation == SKLAD_OP_OUT else {}
        out.append({
            "id": m.id,
            "sklad_id": m.sklad_id,
            "sklad_label": sklad_label(m.sklad_id),
            "operation": m.operation,
            "details": m.details,
            "occurred_at": m.occurred_at.isoformat() if m.occurred_at else None,
            "sell_type": m.sell_type,
            "unit_price": m.unit_price,
            "total_units": m.total_units,
            "total_revenue": m.total_revenue,
            "delivery_cost": m.delivery_cost,
            "grand_total": round(m.grand_total, 2),
            "client_name": m.client_name,
            "client_address": m.client_address,
            "client_phone": m.client_phone,
            "items": [{
                "length": i.length, "width": i.width, "code": i.length + i.width,
                "quantity": i.quantity, "eni": i.eni,
                "unit_price": i.unit_price, "units": i.units,
                "line_total": i.line_total,
                "delivery_share": share.get(i.id, 0.0),
            } for i in m.items],
        })
    return out


def get_statistics(db: Session, start: Optional[datetime] = None,
                   end: Optional[datetime] = None) -> dict:
    q = db.query(SkladMovement)
    if start:
        q = q.filter(SkladMovement.occurred_at >= start)
    if end:
        q = q.filter(SkladMovement.occurred_at < end)

    sales = q.filter(SkladMovement.operation == SKLAD_OP_OUT).all()
    revenue = sum((m.total_revenue or 0.0) for m in sales)
    delivery = sum((m.delivery_cost or 0.0) for m in sales)
    units_metr = sum((m.total_units or 0.0) for m in sales if m.sell_type == SELL_TYPE_METR)
    units_mkv = sum((m.total_units or 0.0) for m in sales if m.sell_type == SELL_TYPE_MKV)

    return {
        "sales_count": len(sales),
        "total_revenue": round(revenue, 2),
        "total_delivery": round(delivery, 2),
        "grand_total": round(revenue + delivery, 2),
        "units_metr": round(units_metr, 2),
        "units_mkv": round(units_mkv, 2),
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
    }
