from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (
    MDMMaterial, MDMCounterparty, Warehouse, StockItem,
    ProductionConsumedMaterial, SaleItem, PurchaseItem,
    CashTransaction, Sale, Purchase, SupplierPrice
)
from backend.schemas import (
    MaterialCreate, MaterialUpdate, MaterialResponse,
    CounterpartyCreate, CounterpartyUpdate, CounterpartyResponse,
    WarehouseCreate, WarehouseUpdate, WarehouseResponse,
    SupplierPriceItem, SupplierPriceResponse
)
from backend.api.auth import get_current_user_role, check_permission, is_admin
from backend.services.reports_service import generate_mdm_excel

router = APIRouter(prefix="/mdm", tags=["MODUL 1: MDM (Master Data)"])

# ----------------- MATERIALS -----------------

@router.get("/materials", response_model=List[MaterialResponse])
def get_materials(
    category: Optional[str] = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    query = db.query(MDMMaterial)
    if not include_archived:
        query = query.filter(MDMMaterial.is_archived == False)
    if category:
        query = query.filter(MDMMaterial.category == category)
    return query.order_by(MDMMaterial.name).all()

@router.post("/materials", response_model=MaterialResponse)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    # Check uniqueness of product code
    existing = db.query(MDMMaterial).filter(MDMMaterial.code == payload.code.strip()).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Bunday mahsulot kodi ({payload.code}) allaqachon mavjud! Mahsulot kodi takrorlanmas (unikal) bo'lishi shart."
        )
    
    mat = MDMMaterial(
        code=payload.code.strip(),
        name=payload.name.strip(),
        category=payload.category,
        unit=payload.unit,
        min_stock=payload.min_stock,
        description=payload.description
    )
    db.add(mat)
    db.commit()
    db.refresh(mat)
    return mat

@router.put("/materials/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    mat = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    
    if payload.code is not None and payload.code.strip():
        new_code = payload.code.strip()
        if new_code != mat.code:
            existing = db.query(MDMMaterial).filter(MDMMaterial.code == new_code).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Bunday mahsulot kodi ({new_code}) allaqachon mavjud!")
            mat.code = new_code

    if payload.name is not None:
        mat.name = payload.name.strip()
    if payload.category is not None:
        mat.category = payload.category
    if payload.unit is not None:
        mat.unit = payload.unit
    if payload.min_stock is not None:
        mat.min_stock = payload.min_stock
    if payload.description is not None:
        mat.description = payload.description
        
    db.commit()
    db.refresh(mat)
    return mat

@router.post("/materials/{material_id}/archive")
def toggle_archive_material(
    material_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    mat = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    mat.is_archived = not mat.is_archived
    db.commit()
    return {"id": mat.id, "is_archived": mat.is_archived}

@router.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools" if is_admin(role) else "mdm", role)
    if not is_admin(role):
        raise HTTPException(status_code=403, detail="O'chirish faqat Admin uchun ruxsat etilgan!")
    mat = db.query(MDMMaterial).filter(MDMMaterial.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material topilmadi.")
    
    # Cascade clean dependencies
    db.query(StockItem).filter(StockItem.material_id == material_id).delete()
    db.query(ProductionConsumedMaterial).filter(ProductionConsumedMaterial.material_id == material_id).delete()
    db.query(SaleItem).filter(SaleItem.material_id == material_id).delete()
    db.query(PurchaseItem).filter(PurchaseItem.material_id == material_id).delete()
    db.query(SupplierPrice).filter(SupplierPrice.material_id == material_id).delete()
    
    db.delete(mat)
    db.commit()
    return {"success": True, "message": f"{mat.name} muvaffaqiyatli o'chirildi.", "id": material_id}

# ----------------- COUNTERPARTIES (Clients & Suppliers) -----------------

@router.get("/counterparties", response_model=List[CounterpartyResponse])
def get_counterparties(
    type: Optional[str] = None, # "client" or "supplier"
    search: Optional[str] = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("kontragentlar" if role == "Direktor" else "mdm", role)
    query = db.query(MDMCounterparty)
    if not include_archived:
        query = query.filter(MDMCounterparty.is_archived == False)
    if type:
        query = query.filter(MDMCounterparty.type == type)
    if search:
        s = f"%{search}%"
        query = query.filter((MDMCounterparty.name.ilike(s)) | (MDMCounterparty.code.ilike(s)))
    return query.order_by(MDMCounterparty.code).all()

@router.post("/counterparties", response_model=CounterpartyResponse)
def create_counterparty(
    payload: CounterpartyCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    
    # Auto-numbering:
    # Supplier: 10001, 10002...
    # Client: 20001, 20002...
    if payload.type == "supplier":
        base_code = 10000
        count = db.query(func.count(MDMCounterparty.id)).filter(MDMCounterparty.type == "supplier").scalar() or 0
        new_code = str(base_code + count + 1)
        while db.query(MDMCounterparty).filter(MDMCounterparty.code == new_code).first():
            count += 1
            new_code = str(base_code + count + 1)
    else: # client
        base_code = 20000
        count = db.query(func.count(MDMCounterparty.id)).filter(MDMCounterparty.type == "client").scalar() or 0
        new_code = str(base_code + count + 1)
        while db.query(MDMCounterparty).filter(MDMCounterparty.code == new_code).first():
            count += 1
            new_code = str(base_code + count + 1)

    cp = MDMCounterparty(
        code=new_code,
        name=payload.name.strip(),
        type=payload.type,
        is_resident=payload.is_resident,
        region=payload.region,
        phone=payload.phone,
        address=payload.address,
        initial_balance_usd=payload.initial_balance_usd,
        initial_balance_uzs=payload.initial_balance_uzs,
        current_balance_usd=payload.initial_balance_usd,
        current_balance_uzs=payload.initial_balance_uzs
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp

@router.put("/counterparties/{counterparty_id}", response_model=CounterpartyResponse)
def update_counterparty(
    counterparty_id: int,
    payload: CounterpartyUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == counterparty_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
    
    if payload.code is not None and payload.code.strip():
        new_code = payload.code.strip()
        if new_code != cp.code:
            existing = db.query(MDMCounterparty).filter(MDMCounterparty.code == new_code).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Bunday kontragent kodi ({new_code}) allaqachon mavjud!")
            cp.code = new_code

    if payload.name is not None:
        cp.name = payload.name.strip()
    if payload.is_resident is not None:
        cp.is_resident = payload.is_resident
    if payload.region is not None:
        cp.region = payload.region
    if payload.phone is not None:
        cp.phone = payload.phone
    if payload.address is not None:
        cp.address = payload.address
        
    db.commit()
    db.refresh(cp)
    return cp

@router.post("/counterparties/{counterparty_id}/archive")
def toggle_archive_counterparty(
    counterparty_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == counterparty_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
    cp.is_archived = not cp.is_archived
    db.commit()
    return {"id": cp.id, "is_archived": cp.is_archived}

@router.delete("/counterparties/{counterparty_id}")
def delete_counterparty(
    counterparty_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools" if is_admin(role) else "mdm", role)
    if not is_admin(role):
        raise HTTPException(status_code=403, detail="O'chirish faqat Admin uchun ruxsat etilgan!")
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == counterparty_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
    
    # Nullify or clean related transactions
    for tx in db.query(CashTransaction).filter(CashTransaction.counterparty_id == counterparty_id).all():
        tx.counterparty_id = None
    db.query(SupplierPrice).filter(SupplierPrice.counterparty_id == counterparty_id).delete()
    
    db.delete(cp)
    db.commit()
    return {"success": True, "message": f"{cp.name} muvaffaqiyatli o'chirildi.", "id": counterparty_id}

# ----------------- SUPPLIER PRICES (what each supplier sells, at what price) -----------------
PRICE_CURRENCIES = ("UZS", "USD")


def _supplier(db: Session, counterparty_id: int) -> MDMCounterparty:
    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == counterparty_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Kontragent topilmadi.")
    if cp.type != "supplier":
        raise HTTPException(status_code=400, detail="Material va narx faqat yetkazib beruvchiga biriktiriladi.")
    return cp


def _price_rows(db: Session, counterparty_id: int) -> List[dict]:
    rows = db.query(SupplierPrice).filter(SupplierPrice.counterparty_id == counterparty_id).all()
    return [{
        "material_id": r.material_id, "price": r.price, "currency": r.currency,
        "material_code": r.material.code if r.material else "", "material_name": r.material.name if r.material else "",
        "unit": r.material.unit if r.material else "", "category": r.material.category if r.material else "",
    } for r in sorted(rows, key=lambda r: (r.material.name if r.material else ""))]


@router.get("/counterparties/{counterparty_id}/prices", response_model=List[SupplierPriceResponse])
def get_supplier_prices(
    counterparty_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    # Sotib olish reads it to offer the supplier's materials.
    try:
        check_permission("zakup", role)
    except HTTPException:
        check_permission("mdm", role)
    _supplier(db, counterparty_id)
    return _price_rows(db, counterparty_id)


@router.put("/counterparties/{counterparty_id}/prices", response_model=List[SupplierPriceResponse])
def set_supplier_prices(
    counterparty_id: int,
    payload: List[SupplierPriceItem],
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    """The supplier's whole list: what is sent replaces what was there."""
    check_permission("mdm", role)
    _supplier(db, counterparty_id)
    seen = set()
    for item in payload:
        if item.material_id in seen:
            raise HTTPException(status_code=400, detail="Bir material ikki marta tanlangan.")
        seen.add(item.material_id)
        if not db.query(MDMMaterial).filter(MDMMaterial.id == item.material_id).first():
            raise HTTPException(status_code=404, detail="Material topilmadi.")
        if item.price is None or item.price <= 0:
            raise HTTPException(status_code=400, detail="Narx musbat bo'lishi kerak.")
        if (item.currency or "").upper() not in PRICE_CURRENCIES:
            raise HTTPException(status_code=400, detail="Valyuta UZS yoki USD bo'lishi kerak.")

    db.query(SupplierPrice).filter(SupplierPrice.counterparty_id == counterparty_id).delete()
    for item in payload:
        db.add(SupplierPrice(counterparty_id=counterparty_id, material_id=item.material_id,
                             price=round(float(item.price), 4), currency=item.currency.upper()))
    db.commit()
    return _price_rows(db, counterparty_id)

# ----------------- WAREHOUSES -----------------

@router.get("/warehouses", response_model=List[WarehouseResponse])
def get_warehouses(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("ombor" if role in ["Direktor", "Ish boshqaruvchi"] else "mdm", role)
    return db.query(Warehouse).order_by(Warehouse.id).all()

@router.post("/warehouses", response_model=WarehouseResponse)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    existing = db.query(Warehouse).filter((Warehouse.code == payload.code.strip()) | (Warehouse.name == payload.name.strip())).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Bunday ombor kodi yoki nomi ({payload.code} / {payload.name}) allaqachon mavjud!")
    
    wh = Warehouse(
        code=payload.code.strip(),
        name=payload.name.strip(),
        description=payload.description,
        is_system_default=payload.is_system_default
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh

@router.put("/warehouses/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Ombor topilmadi.")
    
    if payload.code is not None and payload.code.strip():
        new_code = payload.code.strip()
        if new_code != wh.code:
            existing = db.query(Warehouse).filter(Warehouse.code == new_code).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Bunday ombor kodi ({new_code}) allaqachon mavjud!")
            wh.code = new_code
            
    if payload.name is not None and payload.name.strip():
        wh.name = payload.name.strip()
    if payload.description is not None:
        wh.description = payload.description
        
    db.commit()
    db.refresh(wh)
    return wh

@router.delete("/warehouses/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Ombor topilmadi.")
    if wh.is_system_default:
        raise HTTPException(status_code=400, detail="Standart tizim omborlarini o'chirish taqiqlanadi!")
    
    db.delete(wh)
    db.commit()
    return {"message": "Ombor o'chirildi", "id": warehouse_id}

# ----------------- EXCEL EXPORT -----------------

@router.get("/export/excel")
def export_mdm_excel(
    entity: str = Query(..., regex="^(materials|clients|suppliers)$"),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("mdm", role)
    stream = generate_mdm_excel(db, entity)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=mdm_{entity}.xlsx"}
    )
