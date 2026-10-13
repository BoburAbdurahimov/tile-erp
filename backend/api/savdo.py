from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (
    Purchase, PurchaseItem, Sale, SaleItem,
    MDMCounterparty, MDMMaterial, Warehouse, SupplierPrice
)
from backend.schemas import (
    PurchaseCreate, PurchaseResponse, PurchaseItemResponse,
    SaleCreate, SaleResponse, SaleItemResponse
)
from backend.api.auth import get_current_user_role, check_permission, is_admin, check_action, get_ombor_scope, check_ombor
from backend.services import sklad_service as sklad_svc
from backend.services.inventory_service import (
    add_stock_with_avg_valuation, deduct_stock
)
from backend.services.currency_service import get_exchange_rate_for_date, convert_amount
from backend.services.numbering import next_number
from backend.services import material_warehouses as mw

router = APIRouter(prefix="/savdo", tags=["MODUL 6 & 7: SOTIB OLISH VA SOTISH (Trade)"])

# ----------------- PURCHASES (ZAKUP) -----------------

@router.get("/purchases", response_model=List[PurchaseResponse])
def get_purchases(
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("zakup", role)
    query = db.query(Purchase).join(MDMCounterparty).join(Warehouse)
    allowed = mw.allowed_ids(db, scope)
    if allowed is not None:
        query = query.filter(Purchase.warehouse_id.in_(allowed))
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
            is_sheet = it.sklad_id is not None
            size_code = (it.length + it.width) if (it.length is not None and it.width is not None) else None
            items_list.append(PurchaseItemResponse(
                id=it.id,
                material_id=it.material_id,
                material_code=(str(size_code) if is_sheet else (it.material.code if it.material else "")),
                material_name=(f"{sklad_svc.sklad_label(it.sklad_id)} - {it.length}x{it.width}"
                               if is_sheet else (it.material.name if it.material else "")),
                sklad_id=it.sklad_id,
                size_code=size_code,
                quantity=it.quantity,
                unit=("dona" if is_sheet else (it.material.unit if it.material else "kg")),
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
            ombor=(p.warehouse.owner or "") if p.warehouse else "",
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
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("zakup", role)
    
    supplier = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.supplier_id).first()
    if not supplier or supplier.type != "supplier":
        raise HTTPException(status_code=404, detail="Yetkazib beruvchi (Postavshik) topilmadi.")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="Xarid qilish uchun kamida bitta tovar/material tanlanishi shart.")

    pur_num = next_number(db, Purchase.purchase_number, f"PUR-{payload.date.strftime('%Y%m%d')}-")

    # A line without a price takes the supplier's price for that material
    # from MDM, so Sotib olish only asks who, what, how many and when.
    price_list = {p.material_id: p for p in
                  db.query(SupplierPrice).filter(SupplierPrice.counterparty_id == supplier.id).all()}
    lines = []                                   # (input, price, its currency or None = the purchase's)
    for it in payload.items:
        if it.quantity <= 0:
            continue
        if it.unit_price is not None and it.unit_price > 0:
            lines.append((it, it.unit_price, None))
            continue
        if it.sklad_id or not it.material_id:
            raise HTTPException(status_code=400, detail="Bu qator uchun narx kiritilmagan.")
        listed = price_list.get(it.material_id)
        if not listed:
            mat = db.query(MDMMaterial).filter(MDMMaterial.id == it.material_id).first()
            raise HTTPException(status_code=400, detail=(
                f"{supplier.name} uchun {mat.name if mat else 'bu material'} narxi MDM da biriktirilmagan. "
                "MDM > Yetkazib beruvchilar da material va narxini qo'shing."))
        lines.append((it, listed.price, listed.currency))
    if not lines:
        raise HTTPException(status_code=400, detail="Xarid qilish uchun kamida bitta tovar/material va uning miqdori kerak.")

    currency = payload.currency or next((cur for _, _, cur in lines if cur), None) or "UZS"

    # Which Ombor's warehouses the materials go to: the one chosen, or the
    # user's own when they work in one Ombor.
    owner = None
    if payload.warehouse_id:
        mw.check_warehouse(db, payload.warehouse_id, scope)
    elif any(it.material_id and not it.sklad_id for it, _, _ in lines):
        owner = mw.pick_owner(scope, payload.ombor)

    total_amount = 0.0
    purchase_items = []
    header_warehouse = payload.warehouse_id

    for it, unit_price, price_currency in lines:
        if price_currency and price_currency != currency:
            unit_price = convert_amount(unit_price, price_currency, currency, payload.date, db)
        line_tot = it.quantity * unit_price
        total_amount += line_tot

        if it.sklad_id:
            # Sheets bought by size go to the dimensional warehouse. Raw
            # materials cannot: clay and glaze have no length or width.
            if not sklad_svc.get_config(it.sklad_id):
                raise HTTPException(status_code=404, detail="Bunday ombor yo'q.")
            check_ombor(it.sklad_id, scope)
            try:
                if it.code is not None:
                    length, width = sklad_svc.decode_size(int(it.code))
                elif it.length is not None and it.width is not None:
                    length, width = int(it.length), int(it.width)
                    sklad_svc.decode_size(length + width)
                else:
                    raise HTTPException(status_code=400, detail="O'lchamni kiriting (masalan 680).")
            except sklad_svc.SkladError as e:
                raise HTTPException(status_code=400, detail=str(e))

            purchase_items.append(PurchaseItem(
                material_id=None, sklad_id=it.sklad_id, length=length, width=width,
                quantity=it.quantity, unit_price=unit_price,
                total_price=line_tot, currency=currency
            ))
            sklad_svc.receive_stock(
                db,
                sklad_id=it.sklad_id,
                items=[{"length": length, "width": width, "quantity": int(it.quantity)}],
                client_name=supplier.name,
                note=f"Xarid {pur_num}",
                created_by=role,
            )
            continue

        if not it.material_id:
            raise HTTPException(
                status_code=400,
                detail="Har bir qatorda material yoki ombor o'lchami ko'rsatilishi kerak."
            )
        material = db.query(MDMMaterial).filter(MDMMaterial.id == it.material_id).first()
        if not material:
            raise HTTPException(status_code=404, detail="Material topilmadi.")
        # Spare parts go to the Ombor's aralash warehouse, the rest (raw and
        # auxiliary materials) to its xomashyo warehouse.
        warehouse_id = payload.warehouse_id or mw.warehouse_id(db, owner, mw.kind_for_category(material.category))
        if header_warehouse and warehouse_id != header_warehouse:
            # Storno takes a purchase back from one warehouse.
            raise HTTPException(status_code=400, detail="Ehtiyot qism va xomashyoni alohida xarid qiling.")
        header_warehouse = warehouse_id

        purchase_items.append(PurchaseItem(
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=unit_price,
            total_price=line_tot,
            currency=currency
        ))

        # Add to warehouse and recalculate moving AVG price
        add_stock_with_avg_valuation(
            db=db,
            warehouse_id=warehouse_id,
            material_id=it.material_id,
            quantity=it.quantity,
            unit_price=unit_price,
            currency=currency,
            trans_date=payload.date
        )

    # Update supplier balance (we owe them more -> negative balance or increased payable)
    rate = get_exchange_rate_for_date(db, payload.date)
    if currency == "USD":
        supplier.current_balance_usd -= total_amount
        supplier.current_balance_uzs -= total_amount * rate
    else:
        supplier.current_balance_uzs -= total_amount
        supplier.current_balance_usd -= total_amount / rate if rate > 0 else 0.0

    purchase = Purchase(
        purchase_number=pur_num,
        supplier_id=payload.supplier_id,
        warehouse_id=header_warehouse or 2,
        date=payload.date,
        currency=currency,
        total_amount=total_amount,
        status="Tasdiqlandi",
        description=payload.description,
        items=purchase_items
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    return next(p for p in get_purchases(supplier_id=purchase.supplier_id, start_date=purchase.date,
                                         end_date=purchase.date, db=db, role=role, scope=None)
                if p.id == purchase.id)

@router.post("/purchases/{purchase_id}/storno")
def storno_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("zakup", role)
    check_action("storno", role)
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Xarid topilmadi.")
    mw.check_warehouse(db, purchase.warehouse_id, scope)
    if purchase.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu xarid allaqachon storno qilingan.")
        

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

@router.delete("/purchases/{purchase_id}")
def delete_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
    scope: Optional[List[int]] = Depends(get_ombor_scope),
):
    check_permission("zakup", role)
    check_action("delete", role)
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Xarid hujjati topilmadi.")
    mw.check_warehouse(db, purchase.warehouse_id, scope)
    # Deleting does not touch stock or balances, so only a reversed document may go.
    if purchase.storno_ref_id:
        raise HTTPException(status_code=400, detail="Bu storno yozuvi - asl hujjatni o'chiring.")
    if purchase.status != "Storno":
        raise HTTPException(status_code=400, detail="Avval xaridni STORNO qiling, keyin o'chirish mumkin (aks holda ombor va ta'minotchi balansi noto'g'ri qoladi).")
    
    # Delete purchase items
    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()
    # Delete mirror stornos
    db.query(Purchase).filter(Purchase.storno_ref_id == purchase_id).delete()

    db.delete(purchase)
    db.commit()
    return {"success": True, "message": f"{purchase.purchase_number} xaridi muvaffaqiyatli o'chirildi.", "id": purchase_id}

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
    
    client = db.query(MDMCounterparty).filter(MDMCounterparty.id == payload.client_id).first()
    if not client or client.type != "client":
        raise HTTPException(status_code=404, detail="Xaridor (Kliyent) topilmadi.")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="Sotuv uchun kamida bitta mahsulot tanlanishi shart.")

    sale_num = next_number(db, Sale.sale_number, f"SAL-{payload.date.strftime('%Y%m%d')}-")

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
    check_action("storno", role)
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sotuv topilmadi.")
    if sale.status == "Storno":
        raise HTTPException(status_code=400, detail="Ushbu sotuv allaqachon storno qilingan.")
        

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

@router.delete("/sales/{sale_id}")
def delete_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("sotish", role)
    check_action("delete", role)
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sotuv hujjati topilmadi.")
    # Deleting does not touch stock or balances, so only a reversed document may go.
    if sale.storno_ref_id:
        raise HTTPException(status_code=400, detail="Bu storno yozuvi - asl hujjatni o'chiring.")
    if sale.status != "Storno":
        raise HTTPException(status_code=400, detail="Avval sotuvni STORNO qiling, keyin o'chirish mumkin (aks holda ombor va mijoz balansi noto'g'ri qoladi).")
    
    # Delete sale items
    db.query(SaleItem).filter(SaleItem.sale_id == sale_id).delete()
    # Delete mirror stornos
    db.query(Sale).filter(Sale.storno_ref_id == sale_id).delete()

    db.delete(sale)
    db.commit()
    return {"success": True, "message": f"{sale.sale_number} sotuvi muvaffaqiyatli o'chirildi.", "id": sale_id}

