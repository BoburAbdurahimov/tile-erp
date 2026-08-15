from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import StockItem, Warehouse, MDMMaterial
from backend.schemas import StockItemResponse, StockAdjustmentRequest
from backend.api.auth import get_current_user_role, check_permission
from backend.services.inventory_service import adjust_stock_manual
from backend.services.reports_service import generate_stock_excel

router = APIRouter(prefix="/ombor", tags=["MODUL 2: OMBOR (Warehouse & Stock)"])

@router.get("/stock", response_model=List[StockItemResponse])
def get_stock_balances(
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor", role)
    
    query = db.query(StockItem).join(MDMMaterial).join(Warehouse)
    
    if warehouse_id:
        query = query.filter(StockItem.warehouse_id == warehouse_id)
    if category:
        query = query.filter(MDMMaterial.category == category)
    if search:
        s = f"%{search}%"
        query = query.filter((MDMMaterial.name.ilike(s)) | (MDMMaterial.code.ilike(s)))
        
    items = query.all()
    result = []
    for item in items:
        tot_usd = item.quantity * item.avg_cost_usd
        tot_uzs = item.quantity * item.avg_cost_uzs
        result.append(StockItemResponse(
            id=item.id,
            warehouse_id=item.warehouse_id,
            warehouse_name=item.warehouse.name if item.warehouse else "",
            material_id=item.material_id,
            material_code=item.material.code if item.material else "",
            material_name=item.material.name if item.material else "",
            material_category=item.material.category if item.material else "",
            unit=item.material.unit if item.material else "",
            quantity=round(item.quantity, 2),
            avg_cost_usd=round(item.avg_cost_usd, 4),
            avg_cost_uzs=round(item.avg_cost_uzs, 2),
            total_cost_usd=round(tot_usd, 2),
            total_cost_uzs=round(tot_uzs, 2),
            min_stock=item.material.min_stock if item.material else 0.0
        ))
    return result

@router.post("/adjust-manual")
def adjust_stock(
    payload: StockAdjustmentRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor", role)
    item = adjust_stock_manual(
        db=db,
        warehouse_id=payload.warehouse_id,
        material_id=payload.material_id,
        new_quantity=payload.new_quantity,
        reason=payload.reason,
        user_role=role,
        username="admin" if role == "Admin" else "user"
    )
    return {
        "status": "success",
        "message": "Ombor qoldig'i muvaffaqiyatli to'g'rilandi.",
        "warehouse_id": item.warehouse_id,
        "material_id": item.material_id,
        "new_quantity": item.quantity
    }

@router.get("/export/excel")
def export_stock_excel(
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor", role)
    stream = generate_stock_excel(db, warehouse_id)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ombor_qoldiqlari.xlsx"}
    )
