from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (
    ProductionOrder, ProductionConsumedMaterial, ProductionLine,
    MDMMaterial, Warehouse, StockItem, LineExpense, LineExpenseItem
)
from backend.schemas import (
    ProductionOrderCreate, ProductionOrderResponse, ProductionLineResponse,
    ConsumedMaterialResponse, LineExpenseCreate, LineExpenseResponse, LineExpenseItemResponse
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.inventory_service import (
    get_or_create_stock_item, deduct_stock, add_stock_with_avg_valuation
)
from backend.services.month_close_service import assert_month_open

router = APIRouter(prefix="/ishlab-chiqarish", tags=["MODUL 4: ISHLAB CHIQARISH (Production)"])

@router.get("/lines", response_model=List[ProductionLineResponse])
def get_production_lines(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    return db.query(ProductionLine).order_by(ProductionLine.line_number).all()

@router.get("/stats-7-days")
def get_7_day_production_stats(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    today = date.today()
    start_date = today - timedelta(days=6)
    
    # Get all confirmed production in the last 7 days
    orders = db.query(ProductionOrder).filter(
        ProductionOrder.date >= start_date,
        ProductionOrder.date <= today,
        ProductionOrder.status == "Tasdiqlandi"
    ).all()
    
    # Aggregate by date and by line
    days_map = {}
    for i in range(7):
        d_str = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        days_map[d_str] = {f"Line {l}": 0.0 for l in range(1, 6)}
        days_map[d_str]["total"] = 0.0

    lines = {l.id: l.line_number for l in db.query(ProductionLine).all()}
    
    for order in orders:
        d_str = order.date.strftime("%Y-%m-%d")
        line_num = lines.get(order.line_id, 1)
        line_key = f"Line {line_num}"
        if d_str in days_map:
            days_map[d_str][line_key] = round(days_map[d_str].get(line_key, 0.0) + order.quantity, 2)
            days_map[d_str]["total"] = round(days_map[d_str]["total"] + order.quantity, 2)
            
    # Also calculate total 7-day volume per line
    line_totals = {f"Line {l}": 0.0 for l in range(1, 6)}
    total_7d = 0.0
    for day, data in days_map.items():
        for l in range(1, 6):
            line_totals[f"Line {l}"] += data[f"Line {l}"]
            total_7d += data[f"Line {l}"]

    return {
        "start_date": start_date,
        "end_date": today,
        "total_7d_volume_m2": round(total_7d, 2),
        "line_totals": {k: round(v, 2) for k, v in line_totals.items()},
        "daily_breakdown": days_map
    }

@router.get("/orders", response_model=List[ProductionOrderResponse])
def get_production_orders(
    line_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    query = db.query(ProductionOrder).join(ProductionLine).join(MDMMaterial)
    
    if line_id:
        query = query.filter(ProductionOrder.line_id == line_id)
    if status:
        query = query.filter(ProductionOrder.status == status)
    if start_date:
        query = query.filter(ProductionOrder.date >= start_date)
    if end_date:
        query = query.filter(ProductionOrder.date <= end_date)
        
    orders = query.order_by(ProductionOrder.date.desc(), ProductionOrder.id.desc()).all()
    
    result = []
    for o in orders:
        consumed_list = []
        for c in o.consumed_materials:
            consumed_list.append(ConsumedMaterialResponse(
                material_id=c.material_id,
                material_code=c.material.code if c.material else "",
                material_name=c.material.name if c.material else "",
                warehouse_id=c.warehouse_id,
                warehouse_name=c.warehouse.name if c.warehouse else "",
                quantity=c.quantity,
                unit=c.material.unit if c.material else "",
                unit_cost_usd=round(c.unit_cost_usd, 4),
                total_cost_usd=round(c.total_cost_usd, 2)
            ))
            
        result.append(ProductionOrderResponse(
            id=o.id,
            order_number=o.order_number,
            line_id=o.line_id,
            line_name=o.line.name if o.line else "",
            line_number=o.line.line_number if o.line else 1,
            output_material_id=o.output_material_id,
            output_material_code=o.output_material.code if o.output_material else "",
            output_material_name=o.output_material.name if o.output_material else "",
            quantity=round(o.quantity, 2),
            unit=o.output_material.unit if o.output_material else "m2",
            date=o.date,
            status=o.status,
            direct_cost_usd=round(o.direct_cost_usd, 2),
            allocated_indirect_cost_usd=round(o.allocated_indirect_cost_usd, 2),
            total_cost_usd=round(o.total_cost_usd, 2),
            unit_cost_usd=round(o.unit_cost_usd, 4),
            storno_ref_id=o.storno_ref_id,
            notes=o.notes,
            consumed_materials=consumed_list,
            created_at=o.created_at
        ))
    return result

@router.post("/orders", response_model=ProductionOrderResponse)
def create_production_order(
    payload: ProductionOrderCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    assert_month_open(db, payload.date)
    
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ishlab chiqarish hajmi musbat bo'lishi shart.")
        
    line = db.query(ProductionLine).filter(ProductionLine.id == payload.line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Liniya topilmadi.")
        
    output_mat = db.query(MDMMaterial).filter(MDMMaterial.id == payload.output_material_id).first()
    if not output_mat:
        raise HTTPException(status_code=404, detail="Chiqarilayotgan tayyor mahsulot topilmadi.")

    # Generate order number
    count = db.query(func.count(ProductionOrder.id)).scalar() or 0
    order_num = f"PRD-{payload.date.strftime('%Y%m%d')}-{count + 1:04d}"

    # Deduct consumed raw materials from warehouses at AVG cost
    direct_cost_usd = 0.0
    consumed_records = []

    for c in payload.consumed_materials:
        if c.quantity <= 0:
            continue
        # Direct production consumed materials strictly deduct from Warehouse 2 (Ishlab chiqarish materiallari)
        wh_id = 2
        unit_cost = deduct_stock(db, wh_id, c.material_id, c.quantity)
        line_cost = c.quantity * unit_cost
        direct_cost_usd += line_cost
        
        consumed_records.append(ProductionConsumedMaterial(
            material_id=c.material_id,
            warehouse_id=wh_id,
            quantity=c.quantity,
            unit_cost_usd=unit_cost,
            total_cost_usd=line_cost
        ))

    unit_direct_cost = direct_cost_usd / payload.quantity if payload.quantity > 0 else 0.0

    order = ProductionOrder(
        order_number=order_num,
        line_id=payload.line_id,
        output_material_id=payload.output_material_id,
        quantity=payload.quantity,
        date=payload.date,
        status="Tasdiqlandi",
        direct_cost_usd=direct_cost_usd,
        allocated_indirect_cost_usd=0.0,
        total_cost_usd=direct_cost_usd,
        unit_cost_usd=unit_direct_cost,
        notes=payload.notes,
        consumed_materials=consumed_records
    )
    db.add(order)
    
    # Increase finished goods stock in Warehouse 1 (Tayyor mahsulotlar)
    add_stock_with_avg_valuation(
        db=db,
        warehouse_id=1,
        material_id=payload.output_material_id,
        quantity=payload.quantity,
        unit_price=unit_direct_cost,
        currency="USD",
        trans_date=payload.date
    )
    
    db.commit()
    db.refresh(order)

    # Return full response
    consumed_list = [
        ConsumedMaterialResponse(
            material_id=c.material_id,
            material_code=c.material.code if c.material else "",
            material_name=c.material.name if c.material else "",
            warehouse_id=c.warehouse_id,
            warehouse_name=c.warehouse.name if c.warehouse else "",
            quantity=c.quantity,
            unit=c.material.unit if c.material else "",
            unit_cost_usd=round(c.unit_cost_usd, 4),
            total_cost_usd=round(c.total_cost_usd, 2)
        ) for c in order.consumed_materials
    ]

    return ProductionOrderResponse(
        id=order.id,
        order_number=order.order_number,
        line_id=order.line_id,
        line_name=order.line.name if order.line else "",
        line_number=order.line.line_number if order.line else 1,
        output_material_id=order.output_material_id,
        output_material_code=order.output_material.code if order.output_material else "",
        output_material_name=order.output_material.name if order.output_material else "",
        quantity=round(order.quantity, 2),
        unit=order.output_material.unit if order.output_material else "m2",
        date=order.date,
        status=order.status,
        direct_cost_usd=round(order.direct_cost_usd, 2),
        allocated_indirect_cost_usd=round(order.allocated_indirect_cost_usd, 2),
        total_cost_usd=round(order.total_cost_usd, 2),
        unit_cost_usd=round(order.unit_cost_usd, 4),
        storno_ref_id=order.storno_ref_id,
        notes=order.notes,
        consumed_materials=consumed_list,
        created_at=order.created_at
    )

@router.get("/line-expenses", response_model=List[LineExpenseResponse])
def get_line_expenses(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    query = db.query(LineExpense)
    if start_date:
        query = query.filter(LineExpense.date >= start_date)
    if end_date:
        query = query.filter(LineExpense.date <= end_date)
        
    expenses = query.order_by(LineExpense.date.desc(), LineExpense.id.desc()).all()
    
    lines_map = {l.id: l.name for l in db.query(ProductionLine).all()}
    wh_map = {w.id: w.name for w in db.query(Warehouse).all()}

    result = []
    for e in expenses:
        line_ids = [int(x) for x in e.line_ids_str.split(",") if x.strip().isdigit()]
        line_names = [lines_map.get(lid, f"Liniya {lid}") for lid in line_ids]

        items_list = []
        for it in e.items:
            items_list.append(LineExpenseItemResponse(
                id=it.id,
                material_id=it.material_id,
                material_code=it.material.code if it.material else "",
                material_name=it.material.name if it.material else "",
                unit=it.material.unit if it.material else "",
                quantity=it.quantity,
                unit_cost_usd=round(it.unit_cost_usd, 4),
                total_cost_usd=round(it.total_cost_usd, 2)
            ))

        result.append(LineExpenseResponse(
            id=e.id,
            expense_number=e.expense_number,
            date=e.date,
            warehouse_id=e.warehouse_id,
            warehouse_name=wh_map.get(e.warehouse_id, "Aralash ombor"),
            line_ids=line_ids,
            line_names=line_names,
            total_cost_usd=round(e.total_cost_usd, 2),
            status=e.status,
            notes=e.notes,
            items=items_list,
            created_at=e.created_at
        ))
    return result

@router.post("/line-expenses", response_model=LineExpenseResponse)
def create_line_expense(
    payload: LineExpenseCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    assert_month_open(db, payload.date)

    if not payload.line_ids or len(payload.line_ids) == 0:
        raise HTTPException(status_code=400, detail="Kamida bitta liniyani tanlang.")

    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=400, detail="Kamida bitta sarf materialini kiritishingiz shart.")

    count = db.query(func.count(LineExpense.id)).scalar() or 0
    exp_num = f"LINE-EXP-{payload.date.strftime('%Y%m%d')}-{count + 1:04d}"
    line_ids_str = ",".join(str(lid) for lid in payload.line_ids)

    total_cost_usd = 0.0
    items_records = []

    # Deduct items strictly from Warehouse 3 (Aralash ombor)
    for it in payload.items:
        if it.quantity <= 0:
            continue
        unit_cost = deduct_stock(db, 3, it.material_id, it.quantity)
        line_cost = it.quantity * unit_cost
        total_cost_usd += line_cost

        items_records.append(LineExpenseItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_cost_usd=unit_cost,
            total_cost_usd=line_cost
        ))

    expense = LineExpense(
        expense_number=exp_num,
        date=payload.date,
        warehouse_id=3,
        line_ids_str=line_ids_str,
        total_cost_usd=total_cost_usd,
        status="Tasdiqlandi",
        notes=payload.notes,
        items=items_records
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    lines_map = {l.id: l.name for l in db.query(ProductionLine).all()}
    line_names = [lines_map.get(lid, f"Liniya {lid}") for lid in payload.line_ids]

    items_list = []
    for it in expense.items:
        items_list.append(LineExpenseItemResponse(
            id=it.id,
            material_id=it.material_id,
            material_code=it.material.code if it.material else "",
            material_name=it.material.name if it.material else "",
            unit=it.material.unit if it.material else "",
            quantity=it.quantity,
            unit_cost_usd=round(it.unit_cost_usd, 4),
            total_cost_usd=round(it.total_cost_usd, 2)
        ))

    return LineExpenseResponse(
        id=expense.id,
        expense_number=expense.expense_number,
        date=expense.date,
        warehouse_id=3,
        warehouse_name="Aralash ombor",
        line_ids=payload.line_ids,
        line_names=line_names,
        total_cost_usd=round(total_cost_usd, 2),
        status=expense.status,
        notes=expense.notes,
        items=items_list,
        created_at=expense.created_at
    )

@router.post("/line-expenses/{expense_id}/storno")
def storno_line_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    expense = db.query(LineExpense).filter(LineExpense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Hujjat topilmadi.")

    if expense.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu hujjat allaqachon storno qilingan.")

    assert_month_open(db, expense.date)

    # Return materials back to Warehouse 3
    for it in expense.items:
        add_stock_with_avg_valuation(
            db=db,
            warehouse_id=3,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_cost_usd,
            currency="USD",
            trans_date=expense.date
        )

    expense.status = "Storno"
    db.commit()
    return {"status": "success", "message": f"{expense.expense_number} muvaffaqiyatli storno qilindi."}

@router.post("/orders/{order_id}/storno")
def storno_production_order(
    order_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ishlab_chiqarish", role)
    order = db.query(ProductionOrder).filter(ProductionOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ishlab chiqarish buyurtmasi topilmadi.")
        
    if order.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu buyurtma allaqachon STORNO qilingan.")
        
    assert_month_open(db, order.date)

    # 1. Deduct output finished goods from Warehouse 1
    deduct_stock(db, 1, order.output_material_id, order.quantity)

    # 2. Return consumed raw materials back to warehouses
    for c in order.consumed_materials:
        add_stock_with_avg_valuation(
            db=db,
            warehouse_id=c.warehouse_id,
            material_id=c.material_id,
            quantity=c.quantity,
            unit_price=c.unit_cost_usd,
            currency="USD",
            trans_date=order.date
        )

    # 3. Create mirrored negative record
    mirror_order = ProductionOrder(
        order_number=f"STORNO-{order.order_number}",
        line_id=order.line_id,
        output_material_id=order.output_material_id,
        quantity=-order.quantity,
        date=order.date,
        status="Storno",
        direct_cost_usd=-order.direct_cost_usd,
        allocated_indirect_cost_usd=0.0,
        total_cost_usd=-order.total_cost_usd,
        unit_cost_usd=order.unit_cost_usd,
        storno_ref_id=order.id,
        notes=f"Stornolangan buyurtma: {order.order_number}"
    )
    db.add(mirror_order)

    # 4. Mark original as Storno
    order.status = "Storno"
    db.commit()

    return {"status": "success", "message": f"{order.order_number} ishlab chiqarish buyurtmasi muvaffaqiyatli storno qilindi."}

@router.delete("/orders/{order_id}")
def delete_production_order(
    order_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools" if role == "Admin" else "ishlab_chiqarish", role)
    if role != "Admin":
        raise HTTPException(status_code=403, detail="O'chirish faqat Admin uchun ruxsat etilgan!")
    order = db.query(ProductionOrder).filter(ProductionOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    
    # Delete consumed materials first
    db.query(ProductionConsumedMaterial).filter(ProductionConsumedMaterial.production_order_id == order_id).delete()
    
    # Delete mirror storno orders referencing this order
    db.query(ProductionOrder).filter(ProductionOrder.storno_ref_id == order_id).delete()

    db.delete(order)
    db.commit()
    return {"success": True, "message": f"{order.order_number} ishlab chiqarish buyurtmasi muvaffaqiyatli o'chirildi.", "id": order_id}
