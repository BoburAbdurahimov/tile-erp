"""Sales order pipeline: Order -> Delivery -> Payment.

Stock is reserved when the order is taken and only deducted when the delivery
is confirmed, so an unshipped order is visible as a claim on the warehouse
without changing the balance. Delivery creates the existing Sale document, so
PnL, client balances and storno keep working exactly as before.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    SalesOrder, SalesOrderItem, OrderDelivery, OrderPayment,
    Sale, SaleItem, StockItem, MDMCounterparty, MDMMaterial, Warehouse,
    CashRegister, CashTransaction,
    ORDER_STATUS_NEW, ORDER_STATUS_DELIVERED, ORDER_STATUS_PAID,
    ORDER_STATUS_CANCELLED,
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.inventory_service import deduct_stock
from backend.services.currency_service import get_exchange_rate_for_date
from backend.services.month_close_service import assert_month_open

router = APIRouter(prefix="/orders", tags=["MODUL 7B: BUYURTMALAR (Sales Orders)"])

# Finished goods live in warehouse 1.
DEFAULT_WAREHOUSE_ID = 1


# ==================== SCHEMAS ====================

class OrderItemInput(BaseModel):
    material_id: int
    quantity: float
    unit_price: float


class OrderCreate(BaseModel):
    # Either an existing client, or a walk-in buyer typed inline.
    client_id: Optional[int] = None
    walkin_name: Optional[str] = None
    walkin_phone: Optional[str] = None

    warehouse_id: int = DEFAULT_WAREHOUSE_ID
    order_date: date = Field(default_factory=date.today)
    deadline: Optional[date] = None
    currency: str = "USD"
    items: List[OrderItemInput]
    description: Optional[str] = None


class DeliveryCreate(BaseModel):
    delivered_date: date = Field(default_factory=date.today)
    car_number: str
    driver_name: str
    driver_phone: Optional[str] = None
    destination: Optional[str] = None
    notes: Optional[str] = None


class PaymentCreate(BaseModel):
    amount: float
    paid_date: date = Field(default_factory=date.today)
    register_id: Optional[int] = None
    note: Optional[str] = None


# ==================== HELPERS ====================

def _reserved_quantities(db: Session, warehouse_id: Optional[int] = None) -> dict:
    """Quantity per material committed to orders that are taken but not shipped."""
    q = (
        db.query(SalesOrderItem.material_id, func.sum(SalesOrderItem.quantity))
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.order_id)
        .filter(SalesOrder.status == ORDER_STATUS_NEW)
    )
    if warehouse_id is not None:
        q = q.filter(SalesOrder.warehouse_id == warehouse_id)
    return {mat_id: float(total or 0.0) for mat_id, total in q.group_by(SalesOrderItem.material_id)}


def _on_hand(db: Session, warehouse_id: int) -> dict:
    rows = db.query(StockItem.material_id, StockItem.quantity).filter(
        StockItem.warehouse_id == warehouse_id
    )
    return {mat_id: float(qty or 0.0) for mat_id, qty in rows}


def _serialize_order(db: Session, o: SalesOrder) -> dict:
    items = []
    for it in o.items:
        mat = it.material
        items.append({
            "id": it.id,
            "material_id": it.material_id,
            "material_code": mat.code if mat else "",
            "material_name": mat.name if mat else "",
            "unit": mat.unit if mat else "",
            "quantity": it.quantity,
            "unit_price": it.unit_price,
            "total_price": it.total_price,
        })

    d = o.delivery
    delivery = None
    if d:
        delivery = {
            "delivered_date": d.delivered_date.isoformat() if d.delivered_date else None,
            "car_number": d.car_number,
            "driver_name": d.driver_name,
            "driver_phone": d.driver_phone,
            "destination": d.destination,
            "notes": d.notes,
        }

    payments = [{
        "id": p.id,
        "amount": p.amount,
        "currency": p.currency,
        "paid_date": p.paid_date.isoformat() if p.paid_date else None,
        "note": p.note,
    } for p in o.payments]

    remaining = round(o.total_amount - o.paid_amount, 2)
    days_left = (o.deadline - date.today()).days if o.deadline else None

    return {
        "id": o.id,
        "order_number": o.order_number,
        "client_id": o.client_id,
        "buyer_name": o.buyer_name,
        "walkin_phone": o.walkin_phone,
        "is_walkin": o.client_id is None,
        "warehouse_id": o.warehouse_id,
        "order_date": o.order_date.isoformat() if o.order_date else None,
        "deadline": o.deadline.isoformat() if o.deadline else None,
        "days_left": days_left,
        "currency": o.currency,
        "total_amount": o.total_amount,
        "paid_amount": o.paid_amount,
        "remaining_amount": remaining,
        "status": o.status,
        "sale_id": o.sale_id,
        "description": o.description,
        "items": items,
        "delivery": delivery,
        "payments": payments,
    }


# ==================== AVAILABILITY (real-time stock check) ====================

@router.get("/availability")
def get_availability(
    warehouse_id: int = DEFAULT_WAREHOUSE_ID,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Free-to-sell stock per finished product.

    free = on hand - reserved by orders that are taken but not yet shipped.
    The order form polls this so the operator sees shortfalls as they type.
    """
    check_permission("sotish", role)

    on_hand = _on_hand(db, warehouse_id)
    reserved = _reserved_quantities(db, warehouse_id)

    materials = db.query(MDMMaterial).filter(
        MDMMaterial.category == "Tayyor mahsulot",
        MDMMaterial.is_archived == False,  # noqa: E712
    ).all()

    out = []
    for m in materials:
        oh = on_hand.get(m.id, 0.0)
        rs = reserved.get(m.id, 0.0)
        out.append({
            "material_id": m.id,
            "code": m.code,
            "name": m.name,
            "unit": m.unit,
            "article_no": m.article_no,
            "article_group": m.article_group,
            "on_hand": round(oh, 2),
            "reserved": round(rs, 2),
            "free": round(oh - rs, 2),
        })
    out.sort(key=lambda r: (r["article_no"] is None, r["article_no"] or 0, r["code"]))
    return {"warehouse_id": warehouse_id, "as_of": date.today().isoformat(), "items": out}


@router.get("/production-plan")
def get_production_plan(
    warehouse_id: int = DEFAULT_WAREHOUSE_ID,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """How much must still be produced to cover open orders, and by when."""
    check_permission("sotish", role)

    on_hand = _on_hand(db, warehouse_id)
    open_orders = db.query(SalesOrder).filter(
        SalesOrder.status == ORDER_STATUS_NEW,
        SalesOrder.warehouse_id == warehouse_id,
    ).all()

    # Earliest deadline wins per material: that is the date production must hit.
    need, earliest = {}, {}
    for o in open_orders:
        for it in o.items:
            need[it.material_id] = need.get(it.material_id, 0.0) + it.quantity
            if o.deadline:
                cur = earliest.get(it.material_id)
                if cur is None or o.deadline < cur:
                    earliest[it.material_id] = o.deadline

    rows = []
    for mat_id, required in need.items():
        available = on_hand.get(mat_id, 0.0)
        shortfall = required - available
        if shortfall <= 0:
            continue
        m = db.query(MDMMaterial).filter(MDMMaterial.id == mat_id).first()
        dl = earliest.get(mat_id)
        rows.append({
            "material_id": mat_id,
            "code": m.code if m else "",
            "name": m.name if m else "",
            "unit": m.unit if m else "",
            "article_no": m.article_no if m else None,
            "ordered": round(required, 2),
            "on_hand": round(available, 2),
            "must_produce": round(shortfall, 2),
            "deadline": dl.isoformat() if dl else None,
            "days_left": (dl - date.today()).days if dl else None,
        })
    rows.sort(key=lambda r: (r["days_left"] is None, r["days_left"] if r["days_left"] is not None else 0))
    return {"warehouse_id": warehouse_id, "rows": rows}


# ==================== ORDERS (stage 1) ====================

@router.get("")
def list_orders(
    status: Optional[str] = Query(None),
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    check_permission("sotish", role)
    q = db.query(SalesOrder)
    if status:
        q = q.filter(SalesOrder.status == status)
    if client_id:
        q = q.filter(SalesOrder.client_id == client_id)
    orders = q.order_by(SalesOrder.id.desc()).all()
    return [_serialize_order(db, o) for o in orders]


@router.get("/{order_id}")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    check_permission("sotish", role)
    o = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    return _serialize_order(db, o)


@router.post("")
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    check_permission("sotish", role)
    assert_month_open(db, payload.order_date)

    if not payload.items:
        raise HTTPException(status_code=400, detail="Buyurtmada kamida bitta mahsulot bo'lishi shart.")

    # Buyer: a registered client, or a walk-in name.
    if payload.client_id:
        client = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.client_id).first()
        if not client or client.type != "client":
            raise HTTPException(status_code=404, detail="Xaridor topilmadi.")
    elif not (payload.walkin_name or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Xaridorni tanlang yoki bir martalik xaridor ismini kiriting.",
        )

    if payload.deadline and payload.deadline < payload.order_date:
        raise HTTPException(status_code=400, detail="Muddat buyurtma sanasidan oldin bo'lishi mumkin emas.")

    count = db.query(func.count(SalesOrder.id)).scalar() or 0
    order_number = f"ORD-{payload.order_date.strftime('%Y%m%d')}-{count + 1:04d}"

    total = 0.0
    items = []
    for it in payload.items:
        if it.quantity <= 0 or it.unit_price < 0:
            continue
        mat = db.query(MDMMaterial).filter(MDMMaterial.id == it.material_id).first()
        if not mat:
            raise HTTPException(status_code=404, detail=f"Mahsulot topilmadi (id={it.material_id}).")
        line = it.quantity * it.unit_price
        total += line
        items.append(SalesOrderItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_price=line,
            currency=payload.currency,
        ))

    if not items:
        raise HTTPException(status_code=400, detail="Buyurtmada yaroqli mahsulot qatori yo'q.")

    order = SalesOrder(
        order_number=order_number,
        client_id=payload.client_id,
        walkin_name=(payload.walkin_name or "").strip() or None,
        walkin_phone=(payload.walkin_phone or "").strip() or None,
        warehouse_id=payload.warehouse_id,
        order_date=payload.order_date,
        deadline=payload.deadline,
        currency=payload.currency,
        total_amount=total,
        paid_amount=0.0,
        status=ORDER_STATUS_NEW,
        description=payload.description,
        items=items,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _serialize_order(db, order)


@router.post("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Release the reservation. Only possible before delivery."""
    check_permission("sotish", role)
    o = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    if o.status != ORDER_STATUS_NEW:
        raise HTTPException(
            status_code=400,
            detail=f"Faqat '{ORDER_STATUS_NEW}' holatidagi buyurtmani bekor qilish mumkin (joriy holat: {o.status}).",
        )
    o.status = ORDER_STATUS_CANCELLED
    db.commit()
    return {"success": True, "order_id": o.id, "status": o.status}


# ==================== DELIVERY (stage 2) ====================

@router.post("/{order_id}/deliver")
def deliver_order(
    order_id: int,
    payload: DeliveryCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Ship the order: deduct stock, create the Sale, raise the receivable."""
    check_permission("sotish", role)
    assert_month_open(db, payload.delivered_date)

    o = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    if o.status != ORDER_STATUS_NEW:
        raise HTTPException(
            status_code=400,
            detail=f"Buyurtma allaqachon '{o.status}' holatida.",
        )

    # Stock must cover it. Ignore this order's own reservation when checking.
    on_hand = _on_hand(db, o.warehouse_id)
    for it in o.items:
        available = on_hand.get(it.material_id, 0.0)
        if available < it.quantity:
            mat = it.material
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Omborda yetarli mahsulot yo'q: {mat.name if mat else it.material_id}. "
                    f"Kerak {it.quantity:g}, mavjud {available:g}."
                ),
            )

    sale_items = []
    for it in o.items:
        deduct_stock(db, o.warehouse_id, it.material_id, it.quantity)
        sale_items.append(SaleItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_price=it.total_price,
            currency=o.currency,
        ))

    sale = None
    # A walk-in buyer has no counterparty record, so no Sale/receivable is
    # created for them: they are settled in cash at the payment step.
    if o.client_id:
        count = db.query(func.count(Sale.id)).scalar() or 0
        sale = Sale(
            sale_number=f"SAL-{payload.delivered_date.strftime('%Y%m%d')}-{count + 1:04d}",
            client_id=o.client_id,
            warehouse_id=o.warehouse_id,
            date=payload.delivered_date,
            currency=o.currency,
            total_amount=o.total_amount,
            status="Tasdiqlandi",
            description=f"{o.order_number} buyurtmasi bo'yicha yetkazib berildi",
            items=sale_items,
        )
        db.add(sale)

        client = db.query(MDMCounterparty).filter(MDMCounterparty.id == o.client_id).first()
        rate = get_exchange_rate_for_date(db, payload.delivered_date)
        if o.currency == "USD":
            client.current_balance_usd += o.total_amount
            client.current_balance_uzs += o.total_amount * rate
        else:
            client.current_balance_uzs += o.total_amount
            client.current_balance_usd += (o.total_amount / rate) if rate > 0 else 0.0

    delivery = OrderDelivery(
        order_id=o.id,
        delivered_date=payload.delivered_date,
        car_number=payload.car_number.strip(),
        driver_name=payload.driver_name.strip(),
        driver_phone=(payload.driver_phone or "").strip() or None,
        destination=(payload.destination or "").strip() or None,
        notes=payload.notes,
    )
    db.add(delivery)

    o.status = ORDER_STATUS_DELIVERED
    db.commit()
    if sale is not None:
        db.refresh(sale)
        o.sale_id = sale.id
        db.commit()
    db.refresh(o)
    return _serialize_order(db, o)


# ==================== PAYMENT (stage 3) ====================

@router.post("/{order_id}/payments")
def add_payment(
    order_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Record a full or partial payment. The order closes once fully paid."""
    check_permission("sotish", role)
    assert_month_open(db, payload.paid_date)

    o = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    if o.status == ORDER_STATUS_CANCELLED:
        raise HTTPException(status_code=400, detail="Bekor qilingan buyurtma uchun to'lov qabul qilinmaydi.")
    if o.status == ORDER_STATUS_NEW:
        raise HTTPException(status_code=400, detail="Avval yetkazib berishni tasdiqlang.")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="To'lov summasi noldan katta bo'lishi kerak.")

    remaining = round(o.total_amount - o.paid_amount, 2)
    if payload.amount > remaining + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"To'lov qoldiqdan oshib ketdi. Qoldiq: {remaining:g} {o.currency}.",
        )

    # Post to the cash register so kassa stays in sync.
    tx = None
    register = None
    if payload.register_id:
        register = db.query(CashRegister).filter(CashRegister.id == payload.register_id).first()
        if not register:
            raise HTTPException(status_code=404, detail="Kassa topilmadi.")
    else:
        register = db.query(CashRegister).filter(CashRegister.currency == o.currency).first()

    if register:
        rate = get_exchange_rate_for_date(db, payload.paid_date)
        amount_in_register_ccy = payload.amount
        if register.currency != o.currency:
            if register.currency == "UZS" and o.currency == "USD":
                amount_in_register_ccy = payload.amount * rate
            elif register.currency == "USD" and o.currency == "UZS":
                amount_in_register_ccy = (payload.amount / rate) if rate > 0 else 0.0

        tx = CashTransaction(
            register_id=register.id,
            type="kirim",
            source_type="client" if o.client_id else "other",
            counterparty_id=o.client_id,
            amount=amount_in_register_ccy,
            currency=register.currency,
            category="mijoz_tolovi",
            date=payload.paid_date,
            status="Tasdiqlandi",
            description=f"{o.order_number} buyurtmasi uchun to'lov ({o.buyer_name})",
        )
        db.add(tx)
        register.balance += amount_in_register_ccy

        # Registered clients owe us; a paid instalment reduces the receivable.
        if o.client_id:
            client = db.query(MDMCounterparty).filter(MDMCounterparty.id == o.client_id).first()
            if client:
                if o.currency == "USD":
                    client.current_balance_usd -= payload.amount
                    client.current_balance_uzs -= payload.amount * rate
                else:
                    client.current_balance_uzs -= payload.amount
                    client.current_balance_usd -= (payload.amount / rate) if rate > 0 else 0.0

    db.flush()
    payment = OrderPayment(
        order_id=o.id,
        amount=payload.amount,
        currency=o.currency,
        paid_date=payload.paid_date,
        register_id=register.id if register else None,
        cash_transaction_id=tx.id if tx is not None else None,
        note=payload.note,
    )
    db.add(payment)

    o.paid_amount = round(o.paid_amount + payload.amount, 2)
    if o.paid_amount >= round(o.total_amount, 2) - 0.01:
        o.status = ORDER_STATUS_PAID

    db.commit()
    db.refresh(o)
    return _serialize_order(db, o)
