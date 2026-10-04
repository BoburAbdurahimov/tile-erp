"""Sales orders on the dimensional warehouse: order -> delivery -> payment."""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission
from backend.models import SELL_TYPE_METR, PAY_CASH
from backend.services import order_service as svc
from backend.services.sklad_service import SkladError

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


class PayRequest(BaseModel):
    amount: float = Field(gt=0)
    method: str = PAY_CASH          # naqd | karta
    paid_date: Optional[date] = None
    note: Optional[str] = None


def _guard(fn):
    try:
        return fn()
    except SkladError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
):
    check_permission("sotish", role)
    return {"orders": svc.list_orders(db, status=status)}


@router.get("/production-plan")
def production_plan(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    """Sizes open orders still need produced, nearest deadline first."""
    _check_any(role, "sotish", "ishlab_chiqarish", "ombor")
    return {"plan": svc.production_plan(db)}


@router.get("/products")
def ombor_products(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    """Finished goods (tayyor mahsulot) as held in the Ombor."""
    _check_any(role, "sotish", "mdm", "ombor")
    return {"products": svc.ombor_products(db)}


@router.get("/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    return _guard(lambda: svc.get_order(db, order_id))


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
                 role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    data = payload.model_dump()
    # Stored as local wall-clock time; drop any offset the browser sent.
    data["deadline"] = payload.deadline.replace(tzinfo=None)
    order = _guard(lambda: svc.create_order(db, data, created_by=role))
    return svc.get_order(db, order.id)


@router.post("/{order_id}/deliver")
def deliver(order_id: int, payload: DeliverRequest, db: Session = Depends(get_db),
            role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    _guard(lambda: svc.deliver_order(
        db, order_id, payload.car_number, payload.driver_name,
        payload.driver_phone, payload.note, created_by=role,
    ))
    return svc.get_order(db, order_id)


@router.post("/{order_id}/pay")
def pay(order_id: int, payload: PayRequest, db: Session = Depends(get_db),
        role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    _guard(lambda: svc.pay_order(
        db, order_id, payload.amount, payload.method,
        payload.paid_date, payload.note, created_by=role,
    ))
    return svc.get_order(db, order_id)


@router.post("/{order_id}/cancel")
def cancel(order_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("sotish", role)
    _guard(lambda: svc.cancel_order(db, order_id))
    return svc.get_order(db, order_id)
