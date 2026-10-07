"""Dimensional warehouse API.

Stock is held as a length x width matrix per warehouse, matching the Telegram
sklad bot, and sales are priced by linear metre or square metre.
"""
from datetime import datetime, date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission, get_ombor_scope
from backend.models import (
    SKLAD_CONFIG, SKLAD_LENGTHS, SKLAD_WIDTHS,
    SKLAD_OP_IN, SKLAD_OP_OUT,
    SELL_TYPE_METR, SELL_TYPE_MKV,
)
from backend.services import sklad_service as svc

router = APIRouter(prefix="/sklad", tags=["MODUL 2B: OMBOR (Sklad - o'lcham bo'yicha)"])


# ==================== SCHEMAS ====================

class SkladItemInput(BaseModel):
    """A size line. Give `code` (680) or `length` + `width` (600, 80)."""
    code: Optional[int] = None
    length: Optional[int] = None
    width: Optional[int] = None
    quantity: int
    eni: Optional[int] = None          # bill against the other eni of this owner
    unit_price: Optional[float] = None  # sales only


class ReceiveRequest(BaseModel):
    sklad_id: int
    items: List[SkladItemInput]
    supplier: Optional[str] = None
    note: Optional[str] = None


class SellRequest(BaseModel):
    sklad_id: int
    items: List[SkladItemInput]
    sell_type: str = Field(default=SELL_TYPE_METR, description="metr | mkv")
    delivery_cost: float = 0.0
    client_name: Optional[str] = None
    client_address: Optional[str] = None
    client_phone: Optional[str] = None


def _items_as_dicts(items: List[SkladItemInput]) -> list:
    return [i.model_dump() for i in items]


def _allowed(scope: Optional[List[int]]) -> Optional[List[int]]:
    """Sklad ids a limited user may use (from get_ombor_scope); None = all."""
    return scope or None


def _check_sklad(sklad_id: int, scope: Optional[List[int]]):
    if not svc.get_config(sklad_id):
        raise HTTPException(status_code=404, detail="Bunday ombor yo'q.")
    if scope and sklad_id not in scope:
        names = ", ".join(svc.sklad_label(i) for i in scope)
        raise HTTPException(status_code=403, detail=f"Sizga faqat shu omborlar biriktirilgan: {names}.")


def _guard(fn):
    """Turn a SkladError into a 400 with its message."""
    try:
        return fn()
    except svc.SkladError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== READS ====================

@router.get("/config")
def get_sklad_config(role: str = Depends(get_current_user_role),
                     scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("ombor", role)
    allowed = _allowed(scope)
    return {
        "warehouses": [c for c in SKLAD_CONFIG if allowed is None or c["id"] in allowed],
        "ombor_sklads": scope,
        "lengths": SKLAD_LENGTHS,
        "widths": SKLAD_WIDTHS,
        "sell_types": [
            {"value": SELL_TYPE_METR, "label": "Metr bo'yicha"},
            {"value": SELL_TYPE_MKV, "label": "Metr kvadrat bo'yicha"},
        ],
    }


@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db), role: str = Depends(get_current_user_role),
                    scope: Optional[List[int]] = Depends(get_ombor_scope)):
    check_permission("ombor", role)
    allowed = _allowed(scope)
    return {"warehouses": [w for w in svc.get_all_totals(db) if allowed is None or w["sklad_id"] in allowed]}


@router.get("/matrix")
def get_matrix(
    sklad_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("ombor", role)
    _check_sklad(sklad_id, scope)
    svc.ensure_rows(db, sklad_id)
    return svc.get_matrix(db, sklad_id)


@router.get("/movements")
def get_movements(
    limit: int = Query(50, ge=1, le=500),
    sklad_id: Optional[int] = None,
    operation: Optional[str] = Query(None, description="PRIXOD | RASXOD"),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("ombor", role)
    if sklad_id is not None:
        _check_sklad(sklad_id, scope)
    return {"movements": svc.get_movements(db, limit=limit, sklad_id=sklad_id, operation=operation,
                                           sklad_ids=_allowed(scope))}


@router.get("/statistics")
def get_statistics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("ombor", role)
    start = datetime.combine(start_date, datetime.min.time()) if start_date else None
    # end_date is inclusive, so run to the start of the following day.
    end = datetime.combine(end_date + timedelta(days=1), datetime.min.time()) if end_date else None
    return svc.get_statistics(db, start=start, end=end, sklad_ids=_allowed(scope))


@router.get("/decode/{code}")
def decode_size(code: int, role: str = Depends(get_current_user_role)):
    """680 -> 600 x 80. Used by the UI to validate a typed size code."""
    check_permission("ombor", role)
    length, width = _guard(lambda: svc.decode_size(code))
    return {"code": code, "length": length, "width": width}


# ==================== WRITES ====================

@router.post("/kirim")
def receive(
    payload: ReceiveRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    """PRIXOD - goods in."""
    check_permission("ombor", role)
    _check_sklad(payload.sklad_id, scope)

    movement = _guard(lambda: svc.receive_stock(
        db,
        sklad_id=payload.sklad_id,
        items=_items_as_dicts(payload.items),
        client_name=payload.supplier,
        note=payload.note,
        created_by=role,
    ))
    return svc.get_movements(db, limit=1, sklad_id=payload.sklad_id)[0]


@router.post("/sotish")
def sell(
    payload: SellRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    """RASXOD - a sale, priced by metr or m.kv with delivery on top."""
    check_permission("sotish", role)
    _check_sklad(payload.sklad_id, scope)

    movement = _guard(lambda: svc.sell_stock(
        db,
        sklad_id=payload.sklad_id,
        items=_items_as_dicts(payload.items),
        sell_type=payload.sell_type,
        delivery_cost=payload.delivery_cost,
        client_name=payload.client_name,
        client_address=payload.client_address,
        client_phone=payload.client_phone,
        created_by=role,
    ))
    return svc.get_movements(db, limit=1, sklad_id=payload.sklad_id, operation=SKLAD_OP_OUT)[0]


@router.post("/preview")
def preview_sale(
    payload: SellRequest,
    role: str = Depends(get_current_user_role),
):
    """Price a sale without touching stock, so the form can show live totals."""
    check_permission("sotish", role)
    if payload.sell_type not in (SELL_TYPE_METR, SELL_TYPE_MKV):
        raise HTTPException(status_code=400, detail="Sotuv turi 'metr' yoki 'mkv' bo'lishi kerak.")

    cfg = svc.get_config(payload.sklad_id)
    default_eni = cfg["eni"] if cfg else 120

    lines, total_units, total_revenue = [], 0.0, 0.0
    for it in payload.items:
        qty = int(it.quantity or 0)
        if qty <= 0:
            continue
        if it.code is not None:
            length, width = _guard(lambda c=it.code: svc.decode_size(int(c)))
        elif it.length is not None and it.width is not None:
            length, width = int(it.length), int(it.width)
            _guard(lambda: svc.decode_size(length + width))
        else:
            continue
        eni = int(it.eni or default_eni)
        price = float(it.unit_price or 0.0)
        units = qty * svc.piece_units(length, width, eni, payload.sell_type)
        line_total = units * price
        total_units += units
        total_revenue += line_total
        lines.append({
            "code": length + width, "length": length, "width": width,
            "quantity": qty, "eni": eni, "unit_price": price,
            "units": round(units, 3), "line_total": round(line_total, 2),
        })

    delivery = float(payload.delivery_cost or 0.0)
    per_unit = (delivery / total_units) if total_units else 0.0
    for ln in lines:
        ln["delivery_share"] = round(ln["units"] * per_unit, 2)

    return {
        "sell_type": payload.sell_type,
        "lines": lines,
        "total_pieces": sum(ln["quantity"] for ln in lines),
        "total_units": round(total_units, 3),
        "total_revenue": round(total_revenue, 2),
        "delivery_cost": round(delivery, 2),
        "grand_total": round(total_revenue + delivery, 2),
    }
