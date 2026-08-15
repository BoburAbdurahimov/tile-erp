from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (
    Purchase, PurchaseItem, Sale, SaleItem,
    MDMCounterparty, MDMMaterial, Warehouse
)
from backend.schemas import (
    PurchaseCreate, PurchaseResponse, PurchaseItemResponse,
    SaleCreate, SaleResponse, SaleItemResponse
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.inventory_service import (
    add_stock_with_avg_valuation, deduct_stock
)
from backend.services.currency_service import get_exchange_rate_for_date
from backend.services.month_close_service import assert_month_open

router = APIRouter(prefix="/savdo", tags=["MODUL 6 & 7: SOTIB OLISH VA SOTISH (Trade)"])

# ----------------- PURCHASES (ZAKUP) -----------------

@router.get("/purchases", response_model=List[PurchaseResponse])
def get_purchases(
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("zakup", role)
    query = db.query(Purchase).join(MDMCounterparty).join(Warehouse)
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    if status:
        query = query.filter(Purchase.status == status)
    if start_date:
        query = query.filter(Purchase.date >= start_date)
    if end_date:
        query = query.filter(Purchase.date <= end_date)
        
    purchases = query.order_by(Purchase.date.desc(), Purchase.id.desc()).all()
    
    result = []
    for p in purchases:
        items_list = []
        for it in p.items:
            items_list.append(PurchaseItemResponse(
                id=it.id,
                material_id=it.material_id,
                material_code=it.material.code if it.material else "",
                material_name=it.material.name if it.material else "",
                quantity=it.quantity,
                unit=it.material.unit if it.material else "kg",
                unit_price=it.unit_price,
                total_price=it.total_price,
                currency=it.currency
            ))
            
        result.append(PurchaseResponse(
            id=p.id,
            purchase_number=p.purchase_number,
            supplier_id=p.supplier_id,
            supplier_name=p.supplier.name if p.supplier else "",
            supplier_code=p.supplier.code if p.supplier else "",
            warehouse_id=p.warehouse_id,
            warehouse_name=p.warehouse.name if p.warehouse else "",
            date=p.date,
            currency=p.currency,
            total_amount=round(p.total_amount, 2),
            status=p.status,
            storno_ref_id=p.storno_ref_id,
            description=p.description,
            items=items_list,
            created_at=p.created_at
        ))
    return result

@router.post("/purchases", response_model=PurchaseResponse)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("zakup", role)
    assert_month_open(db, payload.date)
    
    supplier = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.supplier_id).first()
    if not supplier or supplier.type != "supplier":
        raise HTTPException(status_code=404, detail="Yetkazib beruvchi (Postavshik) topilmadi.")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="Xarid qilish uchun kamida bitta tovar/material tanlanishi shart.")

    count = db.query(func.count(Purchase.id)).scalar() or 0
    pur_num = f"PUR-{payload.date.strftime('%Y%m%d')}-{count + 1:04d}"

    total_amount = 0.0
    purchase_items = []
    
    for it in payload.items:
        if it.quantity <= 0 or it.unit_price <= 0:
            continue
        line_tot = it.quantity * it.unit_price
        total_amount += line_tot
        
        purchase_items.append(PurchaseItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_price=line_tot,
            currency=payload.currency
        ))

        # Add to warehouse and recalculate moving AVG price
        add_stock_with_avg_valuation(
            db=db,
            warehouse_id=payload.warehouse_id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            currency=payload.currency,
            trans_date=payload.date
        )

    # Update supplier balance (we owe them more -> negative balance or increased payable)
    rate = get_exchange_rate_for_date(db, payload.date)
    if payload.currency == "USD":
        supplier.current_balance_usd -= total_amount
        supplier.current_balance_uzs -= total_amount * rate
    else:
        supplier.current_balance_uzs -= total_amount
        supplier.current_balance_usd -= total_amount / rate if rate > 0 else 0.0

    purchase = Purchase(
        purchase_number=pur_num,
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        date=payload.date,
        currency=payload.currency,
        total_amount=total_amount,
        status="Tasdiqlandi",
        description=payload.description,
        items=purchase_items
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    return get_purchases(supplier_id=purchase.supplier_id, start_date=purchase.date, end_date=purchase.date, db=db, role=role)[0]

@router.post("/purchases/{purchase_id}/storno")
def storno_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("zakup", role)
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Xarid topilmadi.")
    if purchase.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu xarid allaqachon storno qilingan.")
        
    assert_month_open(db, purchase.date)

    # 1. Deduct stock from warehouse
    for it in purchase.items:
        deduct_stock(db, purchase.warehouse_id, it.material_id, it.quantity)

    # 2. Reverse supplier balance
    supplier = db.query(MDMCounterparty).filter(MDMCounterparty.id == purchase.supplier_id).first()
    if supplier:
        rate = get_exchange_rate_for_date(db, purchase.date)
        if purchase.currency == "USD":
            supplier.current_balance_usd += purchase.total_amount
            supplier.current_balance_uzs += purchase.total_amount * rate
        else:
            supplier.current_balance_uzs += purchase.total_amount
            supplier.current_balance_usd += purchase.total_amount / rate if rate > 0 else 0.0

    # 3. Create mirrored negative record
    mirror_purchase = Purchase(
        purchase_number=f"STORNO-{purchase.purchase_number}",
        supplier_id=purchase.supplier_id,
        warehouse_id=purchase.warehouse_id,
        date=purchase.date,
        currency=purchase.currency,
        total_amount=-purchase.total_amount,
        status="Storno",
        storno_ref_id=purchase.id,
        description=f"Stornolangan xarid: {purchase.purchase_number}"
    )
    db.add(mirror_purchase)

    # 4. Update status of original
    purchase.status = "Storno"
    db.commit()

    return {"status": "success", "message": f"{purchase.purchase_number} xaridi muvaffaqiyatli storno qilindi."}

# ----------------- SALES (SOTISH) -----------------

@router.get("/sales", response_model=List[SaleResponse])
def get_sales(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("sotish", role)
    query = db.query(Sale).join(MDMCounterparty).join(Warehouse)
    if client_id:
        query = query.filter(Sale.client_id == client_id)
    if status:
        query = query.filter(Sale.status == status)
    if start_date:
        query = query.filter(Sale.date >= start_date)
    if end_date:
        query = query.filter(Sale.date <= end_date)
        
    sales = query.order_by(Sale.date.desc(), Sale.id.desc()).all()
    
    result = []
    for s in sales:
        items_list = []
        for it in s.items:
            items_list.append(SaleItemResponse(
                id=it.id,
                material_id=it.material_id,
                material_code=it.material.code if it.material else "",
                material_name=it.material.name if it.material else "",
                quantity=it.quantity,
                unit=it.material.unit if it.material else "m2",
                unit_price=it.unit_price,
                total_price=it.total_price,
                currency=it.currency
            ))
            
        result.append(SaleResponse(
            id=s.id,
            sale_number=s.sale_number,
            client_id=s.client_id,
            client_name=s.client.name if s.client else "",
            client_code=s.client.code if s.client else "",
            warehouse_id=s.warehouse_id,
            warehouse_name=s.warehouse.name if s.warehouse else "",
            date=s.date,
            currency=s.currency,
            total_amount=round(s.total_amount, 2),
            status=s.status,
            storno_ref_id=s.storno_ref_id,
            description=s.description,
            items=items_list,
            created_at=s.created_at
        ))
    return result

@router.post("/sales", response_model=SaleResponse)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("sotish", role)
    assert_month_open(db, payload.date)
    
    client = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.client_id).first()
    if not client or client.type != "client":
        raise HTTPException(status_code=404, detail="Xaridor (Kliyent) topilmadi.")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="Sotuv uchun kamida bitta mahsulot tanlanishi shart.")

    count = db.query(func.count(Sale.id)).scalar() or 0
    sale_num = f"SAL-{payload.date.strftime('%Y%m%d')}-{count + 1:04d}"

    total_amount = 0.0
    sale_items = []
    
    for it in payload.items:
        if it.quantity <= 0 or it.unit_price <= 0:
            continue
        line_tot = it.quantity * it.unit_price
        total_amount += line_tot
        
        sale_items.append(SaleItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_price=line_tot,
            currency=payload.currency
        ))

        # Deduct finished product from Warehouse 1 (Tayyor mahsulotlar)
        deduct_stock(db, payload.warehouse_id, it.material_id, it.quantity)

    # Update client balance (they owe us more -> positive receivable)
    rate = get_exchange_rate_for_date(db, payload.date)
    if payload.currency == "USD":
        client.current_balance_usd += total_amount
        client.current_balance_uzs += total_amount * rate
    else:
        client.current_balance_uzs += total_amount
        client.current_balance_usd += total_amount / rate if rate > 0 else 0.0

    sale = Sale(
        sale_number=sale_num,
        client_id=payload.client_id,
        warehouse_id=payload.warehouse_id,
        date=payload.date,
        currency=payload.currency,
        total_amount=total_amount,
        status="Tasdiqlandi",
        description=payload.description,
        items=sale_items
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)

    return get_sales(client_id=sale.client_id, start_date=sale.date, end_date=sale.date, db=db, role=role)[0]

@router.post("/sales/{sale_id}/storno")
def storno_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("sotish", role)
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sotuv topilmadi.")
    if sale.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu sotuv allaqachon storno qilingan.")
        
    assert_month_open(db, sale.date)

    # 1. Return goods back to warehouse
    for it in sale.items:
        add_stock_with_avg_valuation(
            db=db,
            warehouse_id=sale.warehouse_id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            currency=sale.currency,
            trans_date=sale.date
        )

    # 2. Reverse client balance
    client = db.query(MDMCounterparty).filter(MDMCounterparty.id == sale.client_id).first()
    if client:
        rate = get_exchange_rate_for_date(db, sale.date)
        if sale.currency == "USD":
            client.current_balance_usd -= sale.total_amount
            client.current_balance_uzs -= sale.total_amount * rate
        else:
            client.current_balance_uzs -= sale.total_amount
            client.current_balance_usd -= sale.total_amount / rate if rate > 0 else 0.0

    # 3. Create mirrored negative record
    mirror_sale = Sale(
        sale_number=f"STORNO-{sale.sale_number}",
        client_id=sale.client_id,
        warehouse_id=sale.warehouse_id,
        date=sale.date,
        currency=sale.currency,
        total_amount=-sale.total_amount,
        status="Storno",
        storno_ref_id=sale.id,
        description=f"Stornolangan sotuv: {sale.sale_number}"
    )
    db.add(mirror_sale)

    # 4. Update status of original
    sale.status = "Storno"
    db.commit()

    return {"status": "success", "message": f"{sale.sale_number} sotuvi muvaffaqiyatli storno qilindi."}
