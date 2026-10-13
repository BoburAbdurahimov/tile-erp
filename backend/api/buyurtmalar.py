"""Sales orders on the dimensional warehouse: order -> delivery -> payment."""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission, is_admin, check_action, get_ombor_scope, check_ombor
from backend.models import SELL_TYPE_METR, PAY_CASH
from backend.services import order_service as svc
from backend.services import demo_service
from backend.services.sklad_service import SkladError
from backend.services.currency_service import get_exchange_rate_for_date

router = APIRouter(prefix="/orders", tags=["MODUL 6B: SOTUV BUYURTMALARI (Order -> Delivery -> Payment)"])


# ==================== SCHEMAS ====================

class OrderItemInput(BaseModel):
    code: Optional[int] = None       # 680
    length: Optional[int] = None
    width: Optional[int] = None
    quantity: int
    unit_price: float = 0.0          # per metr / m.kv


class OrderCreate(BaseModel):
    client_name: str
    client_phone: str
    client_address: Optional[str] = None
    sklad_id: int
    sell_type: str = SELL_TYPE_METR
    deadline: datetime
    items: List[OrderItemInput]
    discount_percent: float = 0.0
    discount_amount: float = 0.0
    note: Optional[str] = None


class OrderPreview(BaseModel):
    sklad_id: int
    sell_type: str = SELL_TYPE_METR
    items: List[OrderItemInput]
    discount_percent: float = 0.0
    discount_amount: float = 0.0


class DeliverRequest(BaseModel):
    car_number: str
    driver_name: Optional[str] = None
    driver_phone: str
    note: Optional[str] = None
    sklad_id: Optional[int] = None   # ship from another owner (same eni)


class PayRequest(BaseModel):
    amount: Optional[float] = None       # so'm (naqd / karta)
    method: str = PAY_CASH               # naqd | karta | dollar
    amount_usd: Optional[float] = None   # dollar: dollars received into Kassa USD
    rate: Optional[float] = None         # dollar: so'm per dollar
    paid_date: Optional[date] = None
    note: Optional[str] = None


def _guard(fn):
    try:
        return fn()
    except SkladError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _mine(rows: list, scope: Optional[List[int]]) -> list:
    """Only the rows of the Ombors the user is tied to (scope None = all)."""
    return rows if scope is None else [r for r in rows if r.get("sklad_id") in scope]


def _check_order(db: Session, order_id: int, scope: Optional[List[int]]) -> dict:
    o = _guard(lambda: svc.get_order(db, order_id))
    check_ombor(o["sklad_id"], scope)
    return o


def _check_any(role: str, *modules: str):
    """Pass if the role may use any one of the modules."""
    last = None
    for m in modules:
        try:
            check_permission(m, role)
            return
        except HTTPException as e:
            last = e
    raise last


# ==================== READS ====================

@router.get("")
def list_orders(
    status: Optional[str] = Query(None, description="Yangi | Yetkazildi | Bekor"),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("sotish", role)
    return {"orders": _mine(svc.list_orders(db, status=status), scope)}


@router.get("/production-plan")
def production_plan(db: Session = Depends(get_db), role: str = Depends(get_current_user_role),
                    scope: Optional[List[int]] = Depends(get_ombor_scope)):
    """Sizes open orders still need produced, nearest deadline first."""
    _check_any(role, "sotish", "ishlab_chiqarish", "ombor")
    return {"plan": _mine(svc.production_plan(db), scope)}


@router.get("/products")
def ombor_products(db: Session = Depends(get_db), role: str = Depends(get_current_user_role),
                   scope: Optional[List[int]] = Depends(get_ombor_scope)):
    """Finished goods (tayyor mahsulot) as held in the Ombor."""
    _check_any(role, "sotish", "mdm", "ombor")
    return {"products": _mine(svc.ombor_products(db), scope)}


@router.get("/usd-rate")
def usd_rate(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    """Today's so'm per dollar, as the default for a dollar payment."""
    check_permission("sotish", role)
    today = svc.local_now().date()
    return {"date": str(today), "rate": get_exchange_rate_for_date(db, today)}


@router.post("/demo")
def load_demo(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    """Admin only: replace the demo set (tagged DEMO) with a fresh one."""
    check_permission("admin_tools", role)
    return _guard(lambda: demo_service.load_demo(db))


@router.delete("/demo")
def clear_demo(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    """Admin only: remove demo orders, receipts and stock; real data is untouched."""
    check_permission("admin_tools", role)
    return demo_service.clear_demo(db)


@router.get("/{order_id}/delivery-options")
def delivery_options(order_id: int, db: Session = Depends(get_db),
                     role: str = Depends(get_current_user_role), scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    _check_order(db, order_id, scope)
    res = _guard(lambda: svc.delivery_options(db, order_id))
    res["options"] = _mine(res["options"], scope)
    return res


@router.get("/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role),
              scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    return _check_order(db, order_id, scope)


# ==================== WRITES ====================

@router.post("/preview")
def preview(payload: OrderPreview, role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    return _guard(lambda: svc.price_order(
        payload.sklad_id, payload.sell_type, [i.model_dump() for i in payload.items],
        payload.discount_percent, payload.discount_amount,
    ))


@router.post("")
def create_order(payload: OrderCreate, db: Session = Depends(get_db),
                 role: str = Depends(get_current_user_role), scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    check_ombor(payload.sklad_id, scope)
    data = payload.model_dump()
    # Stored as local wall-clock time; drop any offset the browser sent.
    data["deadline"] = payload.deadline.replace(tzinfo=None)
    order = _guard(lambda: svc.create_order(db, data, created_by=role))
    return svc.get_order(db, order.id)


@router.post("/{order_id}/deliver")
def deliver(order_id: int, payload: DeliverRequest, db: Session = Depends(get_db),
            role: str = Depends(get_current_user_role), scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    _check_order(db, order_id, scope)
    if payload.sklad_id:
        check_ombor(payload.sklad_id, scope)
    _guard(lambda: svc.deliver_order(
        db, order_id, payload.car_number, payload.driver_name,
        payload.driver_phone, payload.note, created_by=role,
        sklad_id=payload.sklad_id,
    ))
    return svc.get_order(db, order_id)


@router.post("/{order_id}/pay")
def pay(order_id: int, payload: PayRequest, db: Session = Depends(get_db),
        role: str = Depends(get_current_user_role), scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    _check_order(db, order_id, scope)
    _guard(lambda: svc.pay_order(
        db, order_id, payload.amount, payload.method,
        payload.paid_date, payload.note, created_by=role,
        amount_usd=payload.amount_usd, rate=payload.rate,
    ))
    return svc.get_order(db, order_id)


@router.post("/{order_id}/payments/{payment_id}/cancel")
def cancel_payment(order_id: int, payment_id: int, db: Session = Depends(get_db),
                   role: str = Depends(get_current_user_role), scope: Optional[List[int]] = Depends(get_ombor_scope)):
    """Needs the Storno right: it takes money back out of the Kassa."""
    check_permission("sotish", role)
    check_action("storno", role)
    _check_order(db, order_id, scope)
    _guard(lambda: svc.cancel_payment(db, order_id, payment_id))
    return svc.get_order(db, order_id)


@router.post("/{order_id}/cancel")
def cancel(order_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role),
           scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("sotish", role)
    check_action("storno", role)
    _check_order(db, order_id, scope)
    _guard(lambda: svc.cancel_order(db, order_id))
    return svc.get_order(db, order_id)
