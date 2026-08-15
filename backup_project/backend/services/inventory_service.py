from datetime import datetime, date
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import StockItem, MDMMaterial, Warehouse, AuditLog
from backend.services.currency_service import get_exchange_rate_for_date, convert_amount

def get_or_create_stock_item(db: Session, warehouse_id: int, material_id: int) -> StockItem:
    item = db.query(StockItem).filter(
        StockItem.warehouse_id == warehouse_id,
        StockItem.material_id == material_id
    ).first()
    
    if not item:
        mat = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
        initial_avg_usd = mat.current_avg_price_usd if mat else 0.0
        initial_avg_uzs = mat.current_avg_price_uzs if mat else 0.0
        
        item = StockItem(
            warehouse_id=warehouse_id,
            material_id=material_id,
            quantity=0.0,
            avg_cost_usd=initial_avg_usd,
            avg_cost_uzs=initial_avg_uzs
        )
        db.add(item)
        db.flush()
    return item

def add_stock_with_avg_valuation(
    db: Session,
    warehouse_id: int,
    material_id: int,
    quantity: float,
    unit_price: float,
    currency: str,
    trans_date: date
):
    """
    Updates stock balance and recalculates Moving Weighted Average (AVG) cost.
    """
    if quantity <= 0:
        return
    
    stock_item = get_or_create_stock_item(db, warehouse_id, material_id)
    material = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
    
    # Convert unit price to USD and UZS for storage
    rate = get_exchange_rate_for_date(db, trans_date)
    if currency == "USD":
        price_usd = unit_price
        price_uzs = unit_price * rate
    else: # UZS
        price_uzs = unit_price
        price_usd = unit_price / rate if rate > 0 else 0.0

    current_qty = stock_item.quantity
    current_avg_usd = stock_item.avg_cost_usd
    current_avg_uzs = stock_item.avg_cost_uzs

    new_total_qty = current_qty + quantity
    if new_total_qty > 0:
        # AVG formula: (Old Qty * Old Avg + New Qty * New Price) / Total Qty
        new_avg_usd = ((current_qty * current_avg_usd) + (quantity * price_usd)) / new_total_qty
        new_avg_uzs = ((current_qty * current_avg_uzs) + (quantity * price_uzs)) / new_total_qty
    else:
        new_avg_usd = price_usd
        new_avg_uzs = price_uzs

    stock_item.quantity = new_total_qty
    stock_item.avg_cost_usd = round(new_avg_usd, 4)
    stock_item.avg_cost_uzs = round(new_avg_uzs, 2)
    
    if material:
        material.current_avg_price_usd = round(new_avg_usd, 4)
        material.current_avg_price_uzs = round(new_avg_uzs, 2)
        
    db.flush()

def deduct_stock(
    db: Session,
    warehouse_id: int,
    material_id: int,
    quantity: float
) -> float:
    """
    Deducts stock and returns the AVG unit cost in USD.
    Strictly forbids negative stock balances across all modules (Production, Sales, Transfers).
    """
    if quantity <= 0:
        return 0.0

    stock_item = get_or_create_stock_item(db, warehouse_id, material_id)
    material = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    
    mat_name = material.name if material else f"ID:{material_id}"
    mat_unit = material.unit if material else "birlik"
    wh_name = warehouse.name if warehouse else f"Ombor #{warehouse_id}"

    # Strict Validation: stock cannot drop below requested quantity
    if round(stock_item.quantity, 4) < round(quantity, 4):
        raise HTTPException(
            status_code=400,
            detail=(
                f"❌ Omborda yetarli qoldiq mavjud emas!\n"
                f"🏢 Ombor: {wh_name}\n"
                f"📦 Mahsulot: {mat_name}\n"
                f"🔻 Talab qilingan: {quantity:,.2f} {mat_unit}\n"
                f"📊 Ombordagi mavjud qoldiq: {stock_item.quantity:,.2f} {mat_unit}\n"
                f"Operatsiya bekor qilindi, ombor manfiy songa tushishiga yo'l qo'yilmaydi."
            )
        )
    
    unit_cost_usd = stock_item.avg_cost_usd
    stock_item.quantity = round(stock_item.quantity - quantity, 4)
    db.flush()
    return unit_cost_usd

def adjust_stock_manual(
    db: Session,
    warehouse_id: int,
    material_id: int,
    new_quantity: float,
    reason: str,
    user_role: str,
    username: str
) -> StockItem:
    """
    Manual stock correction strictly permitted only for Admin role.
    """
    if user_role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Ombor qoldig'ini qo'lda to'g'rilash (Manual stock adjustment) faqat Admin uchun ruxsat etilgan!"
        )
    
    stock_item = get_or_create_stock_item(db, warehouse_id, material_id)
    old_quantity = stock_item.quantity
    stock_item.quantity = new_quantity
    
    # Create Audit Log
    log = AuditLog(
        username=username,
        action="ADJUST_STOCK",
        module="Ombor",
        entity_id=f"W:{warehouse_id}-M:{material_id}",
        details=f"Eski miqdor: {old_quantity}, Yangi miqdor: {new_quantity}. Sabab: {reason}"
    )
    db.add(log)
    db.commit()
    db.refresh(stock_item)
    return stock_item
