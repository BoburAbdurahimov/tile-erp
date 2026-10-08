"""Sales orders on the dimensional warehouse: order -> delivery -> payment.

Stock does not move when an order is taken. Instead, open orders claim the
free stock in deadline order (earliest first), and whatever an order cannot
claim is what must still be produced before its deadline. Goods leave the
Ombor only at delivery, through the same RASXOD path the warehouse uses, and
payments are posted to the Kassa as client receipts.

What a client has paid is read back from the Kassa rather than stored, so a
receipt deleted there re-opens the order's balance instead of leaving the two
out of step.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from backend.models import (
    SkladOrder, SkladOrderItem, SkladOrderPayment, SkladInventory,
    CashRegister, CashTransaction,
    ORDER_NEW, ORDER_DELIVERED, ORDER_CANCELLED, PAY_CASH, PAY_CARD,
    SELL_TYPE_METR, SELL_TYPE_MKV, SKLAD_CONFIG,
)
from backend.services import sklad_service as sklad
from backend.services.sklad_service import SkladError
from backend.services.month_close_service import is_month_closed

ORDER_CURRENCY = "UZS"
CASH_REGISTER_NAME = "Kassa UZS"
CARD_REGISTER_NAME = "Karta UZS"

# Deadlines are Tashkent wall-clock time, but the server (Vercel) runs on UTC.
# Uzbekistan keeps UTC+5 all year, so a fixed offset is exact.
TASHKENT = timezone(timedelta(hours=5))


def local_now() -> datetime:
    """Tashkent wall-clock time, naive, to compare with stored deadlines."""
    return datetime.now(TASHKENT).replace(tzinfo=None)


# ---------------------------------------------------------------- helpers

def _next_number(db: Session) -> str:
    prefix = f"BUY-{local_now():%Y%m%d}-"
    last = (
        db.query(SkladOrder.order_number)
        .filter(SkladOrder.order_number.like(f"{prefix}%"))
        .order_by(SkladOrder.order_number.desc())
        .first()
    )
    seq = int(last[0].rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"


def _parse_line(it: dict) -> tuple[int, int, int, float]:
    qty = int(it.get("quantity") or 0)
    if it.get("code") is not None:
        length, width = sklad.decode_size(int(it["code"]))
    elif it.get("length") is not None and it.get("width") is not None:
        length, width = int(it["length"]), int(it["width"])
        sklad.decode_size(length + width)
    else:
        raise SkladError("Har bir qatorda o'lcham kodi bo'lishi kerak (masalan 680).")
    price = float(it.get("unit_price") or 0.0)
    if qty <= 0:
        raise SkladError(f"{length + width}: miqdor noldan katta bo'lishi kerak.")
    if price < 0:
        raise SkladError("Narx manfiy bo'lishi mumkin emas.")
    return length, width, qty, price


def price_order(sklad_id: int, sell_type: str, items: list,
                discount_percent: float = 0.0, discount_amount: float = 0.0) -> dict:
    """Price an order. A percent discount wins over a fixed amount."""
    if sell_type not in (SELL_TYPE_METR, SELL_TYPE_MKV):
        raise SkladError("Sotuv turi 'metr' yoki 'mkv' bo'lishi kerak.")
    cfg = sklad.get_config(sklad_id)
    if not cfg:
        raise SkladError("Bunday ombor yo'q.")
    if not items:
        raise SkladError("Kamida bitta mahsulot kiriting.")

    lines, subtotal = [], 0.0
    for it in items:
        length, width, qty, price = _parse_line(it)
        units = qty * sklad.piece_units(length, width, cfg["eni"], sell_type)
        total = units * price
        subtotal += total
        lines.append({"length": length, "width": width, "quantity": qty,
                      "unit_price": price, "units": units, "line_total": total})

    pct = float(discount_percent or 0.0)
    if pct < 0 or pct > 100:
        raise SkladError("Chegirma 0 dan 100 foizgacha bo'lishi kerak.")
    if pct:
        discount = subtotal * pct / 100.0
    else:
        discount = float(discount_amount or 0.0)
        if discount < 0:
            raise SkladError("Chegirma manfiy bo'lishi mumkin emas.")
        if discount > subtotal:
            raise SkladError("Chegirma buyurtma summasidan oshib ketdi.")

    return {
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "discount_percent": round(pct, 2),
        "discount_amount": round(discount, 2),
        "total_amount": round(subtotal - discount, 2),
    }


def _register(db: Session, method: str) -> CashRegister:
    """Cash goes to the UZS till; card takes its own register, made on first use."""
    if method == PAY_CASH:
        reg = db.query(CashRegister).filter(CashRegister.name == CASH_REGISTER_NAME).first()
        if not reg:
            reg = db.query(CashRegister).filter(CashRegister.currency == ORDER_CURRENCY).first()
        if not reg:
            raise SkladError("UZS kassasi topilmadi.")
        return reg
    return ensure_card_register(db)


def ensure_card_register(db: Session) -> CashRegister:
    """The plastic card (Karta UZS) register, made on first use."""
    reg = db.query(CashRegister).filter(CashRegister.name == CARD_REGISTER_NAME).first()
    if not reg:
        # The seed inserts registers 1 and 2 with explicit ids, which leaves the
        # Postgres id sequence behind; take the next id ourselves and resync it.
        next_id = (db.query(func.max(CashRegister.id)).scalar() or 0) + 1
        reg = CashRegister(id=next_id, name=CARD_REGISTER_NAME, currency=ORDER_CURRENCY,
                           balance=0.0, description="Plastik karta orqali tushumlar")
        db.add(reg)
        db.flush()
        if db.bind.dialect.name == "postgresql":
            db.execute(text(
                "SELECT setval(pg_get_serial_sequence('cash_registers', 'id'), "
                "(SELECT MAX(id) FROM cash_registers))"
            ))
    return reg


# ---------------------------------------------------------------- reads

def paid_amounts(db: Session, order_ids: list[int]) -> dict[int, float]:
    """Paid per order, counting only receipts that still stand in the Kassa."""
    if not order_ids:
        return {}
    # Matching on order number and amount as well as id, so a transaction id
    # reused after a Kassa deletion can never be credited to the wrong order.
    rows = (
        db.query(SkladOrderPayment.order_id, SkladOrderPayment.amount)
        .join(SkladOrder, SkladOrder.id == SkladOrderPayment.order_id)
        .join(CashTransaction, CashTransaction.id == SkladOrderPayment.cash_transaction_id)
        .filter(CashTransaction.amount == SkladOrderPayment.amount)
        .filter(CashTransaction.description.like("Buyurtma " + SkladOrder.order_number + " %"))
        .filter(SkladOrderPayment.order_id.in_(order_ids))
        .filter(CashTransaction.status != "Storno")
        .all()
    )
    out: dict[int, float] = {}
    for oid, amount in rows:
        out[oid] = out.get(oid, 0.0) + (amount or 0.0)
    return out


def allocate(db: Session, override: Optional[dict[int, int]] = None) -> dict[int, list[dict]]:
    """Share free stock among open orders, earliest deadline first.

    Returns, per open order, each line's claimed and missing quantity.
    `override` maps an order id to a warehouse to try it against instead of
    its own, so delivery can check another owner's stock without saving.
    """
    override = override or {}
    stock = {
        (r.sklad_id, r.length, r.width): r.quantity or 0
        for r in db.query(SkladInventory).all()
    }
    open_orders = (
        db.query(SkladOrder)
        .filter(SkladOrder.status == ORDER_NEW)
        .order_by(SkladOrder.deadline.asc(), SkladOrder.id.asc())
        .all()
    )
    result: dict[int, list[dict]] = {}
    for o in open_orders:
        sid = override.get(o.id, o.sklad_id)
        lines = []
        for it in o.items:
            key = (sid, it.length, it.width)
            free = max(stock.get(key, 0), 0)
            claimed = min(free, it.quantity)
            stock[key] = free - claimed
            lines.append({"item_id": it.id, "claimed": claimed,
                          "shortfall": it.quantity - claimed})
        result[o.id] = lines
    return result


def serialize(o: SkladOrder, alloc: Optional[list[dict]], paid: float) -> dict:
    by_item = {a["item_id"]: a for a in (alloc or [])}
    items = []
    for it in o.items:
        a = by_item.get(it.id)
        items.append({
            "id": it.id,
            "code": it.size_code,
            "length": it.length,
            "width": it.width,
            "quantity": it.quantity,
            "unit_price": it.unit_price,
            "units": round(it.units, 3),
            "line_total": round(it.line_total, 2),
            # Delivered and cancelled orders no longer claim stock.
            "in_stock": a["claimed"] if a else (it.quantity if o.status == ORDER_DELIVERED else 0),
            "shortfall": a["shortfall"] if a else 0,
        })
    total = o.total_amount or 0.0
    paid = round(paid, 2)
    if o.status == ORDER_CANCELLED:
        pay_state = "bekor"
    elif paid <= 0:
        pay_state = "tolanmagan"
    elif paid + 0.005 < total:
        pay_state = "qisman"
    else:
        pay_state = "tolangan"

    return {
        "id": o.id,
        "order_number": o.order_number,
        "client_name": o.client_name,
        "client_phone": o.client_phone,
        "client_address": o.client_address,
        "sklad_id": o.sklad_id,
        "sklad_label": sklad.sklad_label(o.sklad_id),
        "sell_type": o.sell_type,
        "deadline": o.deadline.isoformat() if o.deadline else None,
        "currency": o.currency,
        "subtotal": round(o.subtotal or 0.0, 2),
        "discount_percent": o.discount_percent or 0.0,
        "discount_amount": round(o.discount_amount or 0.0, 2),
        "total_amount": round(total, 2),
        "paid_amount": paid,
        "balance": round(max(total - paid, 0.0), 2),
        "payment_state": pay_state,
        "status": o.status,
        "total_pieces": sum(i["quantity"] for i in items),
        "shortfall_pieces": sum(i["shortfall"] for i in items),
        "items": items,
        "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
        "car_number": o.car_number,
        "driver_name": o.driver_name,
        "driver_phone": o.driver_phone,
        "delivery_note": o.delivery_note,
        "note": o.note,
        "created_by": o.created_by,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "payments": [
            {"id": p.id, "amount": p.amount, "method": p.method,
             "paid_date": p.paid_date.isoformat() if p.paid_date else None,
             "cash_transaction_id": p.cash_transaction_id, "note": p.note}
            for p in o.payments
        ],
    }


def list_orders(db: Session, status: Optional[str] = None) -> list[dict]:
    q = db.query(SkladOrder)
    if status:
        q = q.filter(SkladOrder.status == status)
    orders = q.order_by(SkladOrder.deadline.asc(), SkladOrder.id.asc()).all()
    alloc = allocate(db)
    paid = paid_amounts(db, [o.id for o in orders])
    return [serialize(o, alloc.get(o.id), paid.get(o.id, 0.0)) for o in orders]


def get_order(db: Session, order_id: int) -> dict:
    o = db.query(SkladOrder).filter(SkladOrder.id == order_id).first()
    if not o:
        raise SkladError("Buyurtma topilmadi.")
    return serialize(o, allocate(db).get(o.id), paid_amounts(db, [o.id]).get(o.id, 0.0))


def production_plan(db: Session) -> list[dict]:
    """What must be produced, per warehouse and size, with the nearest deadline."""
    alloc = allocate(db)
    orders = {o.id: o for o in db.query(SkladOrder).filter(SkladOrder.id.in_(list(alloc) or [0]))}
    plan: dict[tuple, dict] = {}
    for oid, lines in alloc.items():
        o = orders.get(oid)
        items = {it.id: it for it in o.items}
        for a in lines:
            if a["shortfall"] <= 0:
                continue
            it = items[a["item_id"]]
            key = (o.sklad_id, it.length, it.width)
            row = plan.setdefault(key, {
                "sklad_id": o.sklad_id,
                "sklad_label": sklad.sklad_label(o.sklad_id),
                "code": it.size_code, "length": it.length, "width": it.width,
                "quantity": 0, "orders": [], "deadline": None,
            })
            row["quantity"] += a["shortfall"]
            row["orders"].append(o.order_number)
            if row["deadline"] is None or o.deadline < row["deadline"]:
                row["deadline"] = o.deadline
    out = sorted(plan.values(), key=lambda r: r["deadline"])
    for r in out:
        r["deadline"] = r["deadline"].isoformat()
    return out


def ombor_products(db: Session) -> list[dict]:
    """Finished goods as the Ombor holds them, with what open orders have claimed."""
    claimed: dict[tuple, int] = {}
    alloc = allocate(db)
    if alloc:
        orders = {o.id: o for o in db.query(SkladOrder).filter(SkladOrder.id.in_(list(alloc)))}
        for oid, lines in alloc.items():
            o = orders[oid]
            items = {it.id: it for it in o.items}
            for a in lines:
                it = items[a["item_id"]]
                key = (o.sklad_id, it.length, it.width)
                claimed[key] = claimed.get(key, 0) + a["claimed"]

    rows = (
        db.query(SkladInventory)
        .filter(SkladInventory.quantity > 0)
        .order_by(SkladInventory.sklad_id, SkladInventory.length, SkladInventory.width)
        .all()
    )
    out = []
    for r in rows:
        cfg = sklad.get_config(r.sklad_id) or {}
        reserved = claimed.get((r.sklad_id, r.length, r.width), 0)
        out.append({
            "sklad_id": r.sklad_id,
            "sklad_label": sklad.sklad_label(r.sklad_id),
            "owner": cfg.get("name"),
            "eni": cfg.get("eni"),
            "code": r.length + r.width,
            "length": r.length,
            "width": r.width,
            "name": f"{r.length}x{r.width} (eni {cfg.get('eni')})",
            "quantity": r.quantity,
            "reserved": reserved,
            "free": max(r.quantity - reserved, 0),
        })
    return out


# ---------------------------------------------------------------- writes

def create_order(db: Session, data: dict, created_by: Optional[str]) -> SkladOrder:
    name = (data.get("client_name") or "").strip()
    phone = (data.get("client_phone") or "").strip()
    if not name:
        raise SkladError("Mijoz ismini kiriting.")
    if not phone:
        raise SkladError("Mijoz telefon raqamini kiriting.")
    deadline = data.get("deadline")
    if not deadline:
        raise SkladError("Muddatni (deadline) kiriting.")

    priced = price_order(
        int(data["sklad_id"]), data.get("sell_type") or SELL_TYPE_METR, data.get("items") or [],
        data.get("discount_percent") or 0.0, data.get("discount_amount") or 0.0,
    )

    order = SkladOrder(
        order_number=_next_number(db),
        client_name=name,
        client_phone=phone,
        client_address=(data.get("client_address") or "").strip() or None,
        sklad_id=int(data["sklad_id"]),
        sell_type=data.get("sell_type") or SELL_TYPE_METR,
        deadline=deadline,
        currency=ORDER_CURRENCY,
        subtotal=priced["subtotal"],
        discount_percent=priced["discount_percent"],
        discount_amount=priced["discount_amount"],
        total_amount=priced["total_amount"],
        status=ORDER_NEW,
        note=(data.get("note") or "").strip() or None,
        created_by=created_by,
    )
    for ln in priced["lines"]:
        order.items.append(SkladOrderItem(
            length=ln["length"], width=ln["width"], quantity=ln["quantity"],
            unit_price=ln["unit_price"], units=round(ln["units"], 3),
            line_total=round(ln["line_total"], 2),
        ))
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def owner_warehouses(sklad_id: int) -> list[dict]:
    """The same sheet width (eni) at each owner - where an order may ship from."""
    cfg = sklad.get_config(sklad_id)
    if not cfg:
        return []
    out, seen = [], set()
    for s in SKLAD_CONFIG:
        if s["eni"] == cfg["eni"] and s["name"] not in seen:
            seen.add(s["name"])
            out.append(s)
    return out


def delivery_options(db: Session, order_id: int) -> dict:
    """For each owner, whether the order could ship from there right now."""
    o = db.query(SkladOrder).filter(SkladOrder.id == order_id).first()
    if not o:
        raise SkladError("Buyurtma topilmadi.")
    items_by_id = {it.id: it for it in o.items}
    options = []
    for cfg in owner_warehouses(o.sklad_id):
        lines = allocate(db, {o.id: cfg["id"]}).get(o.id, [])
        short = [a for a in lines if a["shortfall"] > 0]
        options.append({
            "sklad_id": cfg["id"],
            "name": cfg["name"],
            "eni": cfg["eni"],
            "label": sklad.sklad_label(cfg["id"]),
            "is_order_sklad": cfg["id"] == o.sklad_id,
            "can_ship": not short,
            "shortfall_pieces": sum(a["shortfall"] for a in lines),
            "lines": [{
                "code": items_by_id[a["item_id"]].size_code,
                "quantity": items_by_id[a["item_id"]].quantity,
                "available": a["claimed"],
                "shortfall": a["shortfall"],
            } for a in lines],
        })
    return {"order_id": o.id, "options": options}


def deliver_order(db: Session, order_id: int, car_number: str, driver_name: Optional[str],
                  driver_phone: str, note: Optional[str], created_by: Optional[str],
                  sklad_id: Optional[int] = None) -> SkladOrder:
    o = db.query(SkladOrder).filter(SkladOrder.id == order_id).first()
    if not o:
        raise SkladError("Buyurtma topilmadi.")
    if o.status != ORDER_NEW:
        raise SkladError(f"Buyurtma holati '{o.status}' - yetkazib bo'lmaydi.")
    if not (car_number or "").strip():
        raise SkladError("Mashina raqamini kiriting.")
    if not (driver_phone or "").strip():
        raise SkladError("Haydovchi telefon raqamini kiriting.")

    # The order may ship from another owner's warehouse of the same sheet
    # width; prices were set for that width, so it must not change.
    target = o.sklad_id
    if sklad_id and sklad_id != o.sklad_id:
        if sklad_id not in {c["id"] for c in owner_warehouses(o.sklad_id)}:
            raise SkladError("Bu ombordan yetkazib bo'lmaydi - eni buyurtmanikidan farq qiladi.")
        target = sklad_id

    # Earlier deadlines are served first: stock they have claimed is not
    # available here, even though it is physically on the shelf.
    short = [a for a in allocate(db, {o.id: target}).get(o.id, []) if a["shortfall"] > 0]
    if short:
        items_by_id = {it.id: it for it in o.items}
        detail = ", ".join(
            f"{items_by_id[a['item_id']].size_code}: {a['shortfall']} ta" for a in short
        )
        raise SkladError(
            f"Omborda yetarli emas ({detail}). Qolgan mahsulot muddati oldinroq "
            f"bo'lgan buyurtmalarga band qilingan - avval ishlab chiqaring."
        )

    # The Ombor records the sale at the price actually charged, so the
    # discount is spread across the lines rather than lost.
    factor = (o.total_amount / o.subtotal) if o.subtotal else 1.0
    items = [{"length": it.length, "width": it.width, "quantity": it.quantity,
              "unit_price": round(it.unit_price * factor, 4)} for it in o.items]

    o.sklad_id = target
    o.status = ORDER_DELIVERED
    o.delivered_at = local_now()
    o.car_number = car_number.strip().upper()
    o.driver_name = (driver_name or "").strip() or None
    o.driver_phone = driver_phone.strip()
    o.delivery_note = (note or "").strip() or None
    try:
        # sell_stock checks every line, then commits this order with the stock.
        movement = sklad.sell_stock(
            db, sklad_id=o.sklad_id, items=items, sell_type=o.sell_type,
            client_name=f"{o.client_name} ({o.order_number})",
            client_address=o.client_address, client_phone=o.client_phone,
            created_by=created_by,
        )
    except SkladError:
        db.rollback()
        raise
    o.sklad_movement_id = movement.id
    db.commit()
    db.refresh(o)
    return o


def pay_order(db: Session, order_id: int, amount: float, method: str,
              paid_date: Optional[date], note: Optional[str], created_by: Optional[str]) -> SkladOrder:
    o = db.query(SkladOrder).filter(SkladOrder.id == order_id).first()
    if not o:
        raise SkladError("Buyurtma topilmadi.")
    if o.status == ORDER_CANCELLED:
        raise SkladError("Bekor qilingan buyurtmaga to'lov qabul qilinmaydi.")
    if method not in (PAY_CASH, PAY_CARD):
        raise SkladError("To'lov turi 'naqd' yoki 'karta' bo'lishi kerak.")
    amount = round(float(amount or 0.0), 2)
    if amount <= 0:
        raise SkladError("To'lov summasi musbat bo'lishi kerak.")

    paid = paid_amounts(db, [o.id]).get(o.id, 0.0)
    remaining = round((o.total_amount or 0.0) - paid, 2)
    if amount > remaining + 0.005:
        raise SkladError(f"Ortiqcha to'lov: qolgan qarz {remaining:,.0f} {o.currency}.")

    paid_date = paid_date or local_now().date()
    if is_month_closed(db, paid_date):
        raise SkladError(f"{paid_date:%Y-%m} oyi yopilgan - to'lov kiritib bo'lmaydi.")

    reg = _register(db, method)
    reg.balance = (reg.balance or 0.0) + amount
    label = "naqd" if method == PAY_CASH else "karta"
    tx = CashTransaction(
        register_id=reg.id,
        type="kirim",
        source_type="client",
        counterparty_id=None,
        amount=amount,
        currency=o.currency,
        category="mijoz_tolovi",
        date=paid_date,
        description=(f"Buyurtma {o.order_number} - {o.client_name} ({o.client_phone}), {label}"
                     + (f". {note.strip()}" if note and note.strip() else "")),
    )
    db.add(tx)
    db.flush()
    db.add(SkladOrderPayment(
        order_id=o.id, amount=amount, method=method, register_id=reg.id,
        cash_transaction_id=tx.id, paid_date=paid_date,
        note=(note or "").strip() or None, created_by=created_by,
    ))
    db.commit()
    db.refresh(o)
    return o


def cancel_order(db: Session, order_id: int) -> SkladOrder:
    o = db.query(SkladOrder).filter(SkladOrder.id == order_id).first()
    if not o:
        raise SkladError("Buyurtma topilmadi.")
    if o.status != ORDER_NEW:
        raise SkladError("Faqat yetkazilmagan buyurtmani bekor qilish mumkin.")
    if paid_amounts(db, [o.id]).get(o.id, 0.0) > 0:
        raise SkladError("Buyurtmaga to'lov qilingan - avval Kassada to'lovni qaytaring.")
    o.status = ORDER_CANCELLED
    db.commit()
    db.refresh(o)
    return o
