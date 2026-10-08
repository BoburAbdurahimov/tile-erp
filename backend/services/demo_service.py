"""Demo data for the Ombor and the order -> delivery -> payment flow.

Everything created here is tagged created_by="DEMO", so clear_demo() removes
exactly that and nothing a real user entered. Deadlines are relative to the
current Tashkent time, so reloading the demo always gives live countdowns.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from backend.models import (
    SkladOrder, SkladOrderPayment, SkladMovement, SkladInventory,
    CashRegister, CashTransaction,
    SKLAD_OP_IN, SKLAD_OP_OUT, PAY_CASH, PAY_CARD, SELL_TYPE_METR, SELL_TYPE_MKV,
)
from backend.services import sklad_service as sklad
from backend.services import order_service as orders

DEMO = "DEMO"

# (sklad_id, [(size code, pieces)])  -  1 Toxir 120, 3 Kodir 120, 8 Aziz 100
DEMO_STOCK = [
    (3, [(680, 40), (740, 25), (835, 12), (540, 30), (620, 18)]),
    (1, [(680, 20), (760, 15)]),
    (8, [(590, 10)]),
]


def _apply(db: Session, sklad_id: int, length: int, width: int, delta: int) -> None:
    row = db.query(SkladInventory).filter(
        SkladInventory.sklad_id == sklad_id,
        SkladInventory.length == length,
        SkladInventory.width == width,
    ).first()
    if row:
        row.quantity = max((row.quantity or 0) + delta, 0)


def clear_demo(db: Session) -> dict:
    """Remove demo orders, their Kassa receipts and their stock movements."""
    removed = {"orders": 0, "payments": 0, "movements": 0}

    demo_ids = [o.id for o in db.query(SkladOrder.id).filter(SkladOrder.created_by == DEMO)]
    pays = db.query(SkladOrderPayment).filter(SkladOrderPayment.order_id.in_(demo_ids or [0])).all()
    for p in pays:
        tx = db.query(CashTransaction).filter(CashTransaction.id == p.cash_transaction_id).first()
        # Only a receipt this payment really made (same amount, its order number).
        received = p.pay_amount if p.pay_amount is not None else p.amount   # dollars for a dollar payment
        if tx and tx.amount == received and (tx.description or "").startswith("Buyurtma "):
            reg = db.query(CashRegister).filter(CashRegister.id == tx.register_id).first()
            if reg:
                reg.balance = round((reg.balance or 0.0) - tx.amount, 4)
            db.delete(tx)
        removed["payments"] += 1

    for o in db.query(SkladOrder).filter(SkladOrder.created_by == DEMO).all():
        db.delete(o)
        removed["orders"] += 1

    # Undo what the demo movements did to the shelf. Net them per cell first:
    # undoing one at a time would clamp at zero part-way and leave residue.
    net: dict[tuple, int] = {}
    for m in db.query(SkladMovement).filter(SkladMovement.created_by == DEMO).all():
        default_eni = (sklad.get_config(m.sklad_id) or {}).get("eni", 120)
        for it in m.items:
            if m.operation == SKLAD_OP_IN:
                key, delta = (m.sklad_id, it.length, it.width), -it.quantity
            elif m.operation == SKLAD_OP_OUT:
                src = sklad.resolve_sklad_by_eni(m.sklad_id, it.eni) if it.eni != default_eni else m.sklad_id
                key, delta = (src, it.length, it.width), it.quantity
            else:
                continue
            net[key] = net.get(key, 0) + delta
        db.delete(m)
        removed["movements"] += 1
    for (sklad_id, length, width), delta in net.items():
        _apply(db, sklad_id, length, width, delta)

    db.commit()
    return removed


def load_demo(db: Session) -> dict:
    """Replace any previous demo with a fresh set covering every stage."""
    clear_demo(db)
    now = orders.local_now().replace(second=0, microsecond=0)

    for sklad_id, items in DEMO_STOCK:
        sklad.receive_stock(
            db, sklad_id=sklad_id,
            items=[{"code": c, "quantity": q} for c, q in items],
            client_name="Demo kirim", created_by=DEMO,
        )

    def order(name, phone, hours, sklad_id, items, sell_type=SELL_TYPE_METR, address=None, **disc):
        return orders.create_order(db, {
            "client_name": name, "client_phone": phone, "client_address": address,
            "sklad_id": sklad_id, "sell_type": sell_type,
            "deadline": now + timedelta(hours=hours),
            "items": [{"code": c, "quantity": q, "unit_price": p} for c, q, p in items],
            "note": "Demo buyurtma", **disc,
        }, created_by=DEMO)

    def deliver(o, car, driver, phone, days_ago):
        orders.deliver_order(db, o.id, car, driver, phone, None, created_by=DEMO)
        o.delivered_at = now - timedelta(days=days_ago, hours=2)
        db.commit()

    def pay(o, amount, method, days_ago):
        orders.pay_order(db, o.id, amount, method, (now - timedelta(days=days_ago)).date(),
                         None, created_by=DEMO)

    # Stage 3 first: delivered orders take their goods off the shelf before the
    # open orders below share out what is left.
    paid = order("Rustam Qodirov", "+998901234501", -50, 3, [(540, 6, 42000)], address="Chilonzor 9")
    deliver(paid, "01A321BA", "Jasur", "+998935550011", 2)
    pay(paid, round(paid.total_amount * 0.6), PAY_CASH, 2)
    pay(paid, paid.total_amount - round(paid.total_amount * 0.6), PAY_CARD, 1)

    part = order("Gulnora Karimova", "+998977001122", -6, 3, [(620, 6, 45000)], discount_percent=3)
    deliver(part, "10B555CA", "Sardor", "+998901231231", 0)
    pay(part, 500000, PAY_CASH, 0)

    unpaid = order("Farhod Usmonov", "+998935557788", -30, 1, [(760, 5, 50000)], address="Yunusobod 4")
    deliver(unpaid, "01C777DD", "Bobur", "+998909998877", 1)

    # Stage 1 / 2: open orders, earliest deadline first claims the stock.
    order("Akmal Rahimov", "+998901112233", -20, 3, [(680, 25, 45000), (835, 15, 50000)],
          address="Sergeli 12")                                            # overdue, 835 short
    order("Dilshod Ergashev", "+998935556677", 5, 3, [(740, 10, 47000)],
          discount_amount=150000)                                          # due today, in stock
    order("Nodira Yusupova", "+998977778899", 28, 3, [(680, 25, 46000)],
          discount_percent=5)                                              # tomorrow, partly short
    order("Bekzod Tursunov", "+998901234500", 75, 3, [(540, 12, 40000), (740, 8, 40000)],
          sell_type=SELL_TYPE_MKV)                                         # 3 days, m2 pricing
    order("Shahzoda Aliyeva", "+998909990011", 140, 1, [(680, 12, 44000)]) # ~6 days, Toxir
    order("Sherzod Nazarov", "+998998887766", 50, 8, [(590, 14, 52000)])   # 2 days, Aziz 100, short

    return {
        "orders": db.query(SkladOrder).filter(SkladOrder.created_by == DEMO).count(),
        "movements": db.query(SkladMovement).filter(SkladMovement.created_by == DEMO).count(),
    }
