"""Avto sarf: material norms per piece produced, so a new production order
can fill its consumed materials automatically (the user may still enter them
by hand instead)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission
from backend.models import AutoSarfRule, MDMMaterial, StockItem

router = APIRouter(prefix="/ishlab-chiqarish/auto-sarf", tags=["MODUL 4: AVTO SARF"])

# Production consumes raw materials from Warehouse 2 (Ishlab chiqarish uchun materiallar).
PRODUCTION_WAREHOUSE_ID = 2


class RuleCreate(BaseModel):
    material_id: int
    qty_per_unit: float = Field(gt=0)


def _serialize(r: AutoSarfRule) -> dict:
    return {
        "id": r.id,
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
    return [_serialize(r) for r in _active(db).order_by(AutoSarfRule.id).all()]


@router.post("")
def add_rule(payload: RuleCreate, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    if not db.query(MDMMaterial).filter(MDMMaterial.id == payload.material_id).first():
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    # One norm per material: saving again updates it.
    rule = _active(db).filter(AutoSarfRule.material_id == payload.material_id).first()
    if rule:
        rule.qty_per_unit = payload.qty_per_unit
    else:
        rule = AutoSarfRule(material_id=payload.material_id, qty_per_unit=payload.qty_per_unit)
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
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Materials needed for `quantity` pieces, with the stock in the production warehouse."""
    check_permission("ishlab_chiqarish", role)
    stock = {
        s.material_id: s.quantity or 0.0
        for s in db.query(StockItem).filter(StockItem.warehouse_id == PRODUCTION_WAREHOUSE_ID).all()
    }
    items = []
    for r in _active(db).all():
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
        })
    items.sort(key=lambda x: x["material_code"])
    return {"items": items, "configured": bool(items)}
