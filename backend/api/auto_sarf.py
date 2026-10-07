"""Avto sarf: material norms per piece produced, so a new production order
can fill its consumed materials automatically (the user may still enter them
by hand instead)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.auth import get_current_user_role, check_permission
from backend.models import AutoSarfRule, ProductionLine, MDMMaterial, StockItem

router = APIRouter(prefix="/ishlab-chiqarish/auto-sarf", tags=["MODUL 4: AVTO SARF"])

# Production consumes raw materials from Warehouse 2 (Ishlab chiqarish uchun materiallar).
PRODUCTION_WAREHOUSE_ID = 2


class RuleCreate(BaseModel):
    line_id: Optional[int] = None          # None = every line
    material_id: int
    qty_per_unit: float = Field(gt=0)


def _serialize(r: AutoSarfRule) -> dict:
    return {
        "id": r.id,
        "line_id": r.line_id,
        "line_number": r.line.line_number if r.line else None,
        "material_id": r.material_id,
        "material_code": r.material.code if r.material else "",
        "material_name": r.material.name if r.material else "",
        "unit": r.material.unit if r.material else "",
        "qty_per_unit": r.qty_per_unit,
    }


@router.get("")
def list_rules(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    rules = (db.query(AutoSarfRule).filter(AutoSarfRule.is_active == True)  # noqa: E712
             .order_by(AutoSarfRule.line_id.is_(None).desc(), AutoSarfRule.line_id, AutoSarfRule.id).all())
    return [_serialize(r) for r in rules]


@router.post("")
def add_rule(payload: RuleCreate, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("ishlab_chiqarish", role)
    if payload.line_id is not None and not db.query(ProductionLine).filter(ProductionLine.id == payload.line_id).first():
        raise HTTPException(status_code=404, detail="Liniya topilmadi.")
    if not db.query(MDMMaterial).filter(MDMMaterial.id == payload.material_id).first():
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    # One norm per (line, material): saving again updates it.
    rule = db.query(AutoSarfRule).filter(
        AutoSarfRule.line_id.is_(None) if payload.line_id is None else AutoSarfRule.line_id == payload.line_id,
        AutoSarfRule.material_id == payload.material_id,
        AutoSarfRule.is_active == True,  # noqa: E712
    ).first()
    if rule:
        rule.qty_per_unit = payload.qty_per_unit
    else:
        rule = AutoSarfRule(line_id=payload.line_id, material_id=payload.material_id,
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
    line_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Materials for `quantity` pieces on a line: the line's own norms, plus the
    general norms for materials the line has no norm for."""
    check_permission("ishlab_chiqarish", role)
    rules = db.query(AutoSarfRule).filter(AutoSarfRule.is_active == True).all()  # noqa: E712
    by_material: dict[int, AutoSarfRule] = {}
    for r in rules:
        if r.line_id is None and r.material_id not in by_material:
            by_material[r.material_id] = r
    for r in rules:
        if line_id is not None and r.line_id == line_id:
            by_material[r.material_id] = r          # line norm wins
    stock = {
        s.material_id: s.quantity or 0.0
        for s in db.query(StockItem).filter(StockItem.warehouse_id == PRODUCTION_WAREHOUSE_ID).all()
    }
    items = []
    for mid, r in by_material.items():
        need = round(r.qty_per_unit * quantity, 4)
        items.append({
            "material_id": mid,
            "material_code": r.material.code if r.material else "",
            "material_name": r.material.name if r.material else "",
            "unit": r.material.unit if r.material else "",
            "qty_per_unit": r.qty_per_unit,
            "quantity": need,
            "available": round(stock.get(mid, 0.0), 4),
            "enough": stock.get(mid, 0.0) + 1e-9 >= need,
            "from_line": r.line_id is not None,
        })
    items.sort(key=lambda x: x["material_code"])
    return {"items": items, "configured": bool(items)}
