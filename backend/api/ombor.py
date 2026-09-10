from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    StockItem, Warehouse, MDMMaterial, StockTransfer,
    SalesOrder, SalesOrderItem,
)
from backend.schemas import StockItemResponse, StockAdjustmentRequest, StockTransferCreate, StockTransferResponse
from backend.api.auth import get_current_user_role, check_permission
from backend.services.inventory_service import adjust_stock_manual, transfer_stock_between_warehouses
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

@router.post("/transfer", response_model=StockTransferResponse)
def create_stock_transfer(
    payload: StockTransferCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor", role)
    trans_date = payload.date or date.today()
    transfer = transfer_stock_between_warehouses(
        db=db,
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        material_id=payload.material_id,
        quantity=payload.quantity,
        trans_date=trans_date,
        description=payload.description or "",
        username=role
    )
    return StockTransferResponse(
        id=transfer.id,
        transfer_number=transfer.transfer_number,
        date=str(transfer.date),
        from_warehouse_id=transfer.from_warehouse_id,
        from_warehouse_name=transfer.from_warehouse.name if transfer.from_warehouse else "",
        to_warehouse_id=transfer.to_warehouse_id,
        to_warehouse_name=transfer.to_warehouse.name if transfer.to_warehouse else "",
        material_id=transfer.material_id,
        material_code=transfer.material.code if transfer.material else "",
        material_name=transfer.material.name if transfer.material else "",
        unit=transfer.material.unit if transfer.material else "",
        quantity=round(transfer.quantity, 2),
        unit_cost_usd=round(transfer.unit_cost_usd, 4),
        total_cost_usd=round(transfer.total_cost_usd, 2),
        description=transfer.description,
        created_by=transfer.created_by
    )

@router.get("/transfers", response_model=List[StockTransferResponse])
def get_stock_transfers(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor", role)
    transfers = db.query(StockTransfer).order_by(StockTransfer.id.desc()).all()
    res = []
    for t in transfers:
        res.append(StockTransferResponse(
            id=t.id,
            transfer_number=t.transfer_number,
            date=str(t.date),
            from_warehouse_id=t.from_warehouse_id,
            from_warehouse_name=t.from_warehouse.name if t.from_warehouse else "",
            to_warehouse_id=t.to_warehouse_id,
            to_warehouse_name=t.to_warehouse.name if t.to_warehouse else "",
            material_id=t.material_id,
            material_code=t.material.code if t.material else "",
            material_name=t.material.name if t.material else "",
            unit=t.material.unit if t.material else "",
            quantity=round(t.quantity, 2),
            unit_cost_usd=round(t.unit_cost_usd, 4),
            total_cost_usd=round(t.total_cost_usd, 2),
            description=t.description,
            created_by=t.created_by
        ))
    return res

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


@router.get("/grid")
def get_stock_grid(
    warehouse_id: int = 1,
    group: Optional[str] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    """Finished stock as an article grid: rows are hundreds, columns are tens.

    Article 234 sits at row 200, column 30. `group` is the code shown in the
    grid's top-left corner; omitting it returns the first group found.
    """
    check_permission("ombor", role)

    groups = [
        g[0] for g in db.query(MDMMaterial.article_group)
        .filter(MDMMaterial.article_group.isnot(None))
        .distinct().order_by(MDMMaterial.article_group)
    ]
    if group is None:
        group = groups[0] if groups else None

    q = db.query(MDMMaterial).filter(
        MDMMaterial.article_no.isnot(None),
        MDMMaterial.is_archived == False  # noqa: E712
    )
    if group is not None:
        q = q.filter(MDMMaterial.article_group == group)
    materials = q.all()

    stock = {
        mat_id: float(qty or 0.0)
        for mat_id, qty in db.query(StockItem.material_id, StockItem.quantity)
        .filter(StockItem.warehouse_id == warehouse_id)
    }

    # Reserved by orders that are taken but not yet shipped.
    reserved = {
        mat_id: float(total or 0.0)
        for mat_id, total in db.query(
            SalesOrderItem.material_id, func.sum(SalesOrderItem.quantity)
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.order_id)
        .filter(SalesOrder.status == "Yangi", SalesOrder.warehouse_id == warehouse_id)
        .group_by(SalesOrderItem.material_id)
    }

    cells = []
    for m in materials:
        art = int(m.article_no)
        on_hand = stock.get(m.id, 0.0)
        res = reserved.get(m.id, 0.0)
        cells.append({
            "article_no": art,
            "row": (art // 100) * 100,
            "col": (art % 100) // 10 * 10,
            "material_id": m.id,
            "code": m.code,
            "name": m.name,
            "unit": m.unit,
            "quantity": round(on_hand, 2),
            "reserved": round(res, 2),
            "free": round(on_hand - res, 2),
        })

    rows = sorted({c["row"] for c in cells})
    return {
        "warehouse_id": warehouse_id,
        "group": group,
        "available_groups": groups,
        "rows": rows or [200, 300, 400, 500, 600, 700, 800],
        "cols": list(range(0, 100, 10)),
        "cells": cells,
    }
