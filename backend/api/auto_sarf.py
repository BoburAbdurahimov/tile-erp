"""Avto sarf: material norms per piece produced, so a new production order
can fill its consumed materials automatically (the user may still enter them
by hand instead).

A norm is either for every Ombor (sklad_id NULL) or for one Ombor such as
Kodir 100; an Ombor's own norm wins over the general one for that material."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission
from backend.models import AutoSarfRule, MDMMaterial, StockItem
from backend.services import sklad_service

router = APIRouter(prefix="/ishlab-chiqarish/auto-sarf", tags=["MODUL 4: AVTO SARF"])

# Production consumes raw materials from Warehouse 2 (Ishlab chiqarish uchun materiallar).
PRODUCTION_WAREHOUSE_ID = 2


class RuleCreate(BaseModel):
    sklad_id: Optional[int] = None     # None = every Ombor
    material_id: int
    qty_per_unit: float = Field(gt=0)


def _serialize(r: AutoSarfRule) -> dict:
    return {
        "id": r.id,
        "sklad_id": r.sklad_id,
        "sklad_label": sklad_service.sklad_label(r.sklad_id) if r.sklad_id else None,
        "material_id": r.material_id,
        "material_code": r.material.code if r.material else "",
        "material_name": r.material.name if r.material else "",
        "unit": r.material.unit if r.material else "",
        "qty_per_unit": r.qty_per_unit,
    }


def _active(db: Session):
    return db.query(AutoSarfRule).filter(AutoSarfRule.is_active == True)  # noqa: E712


@router.get("")
def list_rules(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    rules = _active(db).order_by(AutoSarfRule.sklad_id.is_(None).desc(), AutoSarfRule.sklad_id, AutoSarfRule.id).all()
    return [_serialize(r) for r in rules]


@router.post("")
def add_rule(payload: RuleCreate, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    if payload.sklad_id is not None and not sklad_service.get_config(payload.sklad_id):
        raise HTTPException(status_code=404, detail="Bunday ombor yo'q.")
    if not db.query(MDMMaterial).filter(MDMMaterial.id == payload.material_id).first():
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    # One norm per (Ombor, material): saving again updates it.
    same_sklad = (AutoSarfRule.sklad_id.is_(None) if payload.sklad_id is None
                  else AutoSarfRule.sklad_id == payload.sklad_id)
    rule = _active(db).filter(same_sklad, AutoSarfRule.material_id == payload.material_id).first()
    if rule:
        rule.qty_per_unit = payload.qty_per_unit
    else:
        rule = AutoSarfRule(sklad_id=payload.sklad_id, material_id=payload.material_id,
                            qty_per_unit=payload.qty_per_unit)
        db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize(rule)


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    rule = db.query(AutoSarfRule).filter(AutoSarfRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Norma topilmadi.")
    db.delete(rule)
    db.commit()
    return {"success": True, "id": rule_id}


@router.get("/calc")
def calculate(
    quantity: float = Query(..., gt=0),
    sklad_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Materials needed for `quantity` pieces going into an Ombor: that Ombor's
    own norms, plus the general norms for materials it has none for."""
    check_permission("ishlab_chiqarish", role)
    rules = _active(db).all()
    by_material = {r.material_id: r for r in rules if r.sklad_id is None}
    if sklad_id is not None:
        by_material.update({r.material_id: r for r in rules if r.sklad_id == sklad_id})
    stock = {
        s.material_id: s.quantity or 0.0
        for s in db.query(StockItem).filter(StockItem.warehouse_id == PRODUCTION_WAREHOUSE_ID).all()
    }
    items = []
    for r in by_material.values():
        need = round(r.qty_per_unit * quantity, 4)
        have = stock.get(r.material_id, 0.0)
        items.append({
            "material_id": r.material_id,
            "material_code": r.material.code if r.material else "",
            "material_name": r.material.name if r.material else "",
            "unit": r.material.unit if r.material else "",
            "qty_per_unit": r.qty_per_unit,
            "quantity": need,
            "available": round(have, 4),
            "enough": have + 1e-9 >= need,
            "from_sklad": r.sklad_id is not None,
        })
    items.sort(key=lambda x: x["material_code"])
    return {"items": items, "configured": bool(items)}
