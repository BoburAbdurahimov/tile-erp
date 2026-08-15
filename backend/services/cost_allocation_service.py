from datetime import date
from typing import Dict, List, Any
from sqlalchemy import func, extract
from sqlalchemy.orm import Session
from backend.models import ProductionOrder, ProductionLine, CashTransaction, MDMMaterial
from backend.services.currency_service import convert_amount

def calculate_monthly_production_cost_allocation(db: Session, year_month: str) -> Dict[str, Any]:
    """
    Calculates:
    1. Total production volume per line for the month.
    2. Total indirect costs (Bilvosita xarajatlar) from Kassa in USD.
    3. Proportionate allocation of indirect costs to each line:
       Allocated Line Indirect = Total Indirect Costs * (Line Volume / Total Factory Volume)
    4. Unit cost breakdown per line ($/m2 = Direct Materials + Allocated Indirect Overhead).
    """
    try:
        year, month = map(int, year_month.split("-"))
    except ValueError:
        raise ValueError("year_month must be in 'YYYY-MM' format")

    # 1. Fetch all confirmed production orders in this month
    orders = db.query(ProductionOrder).filter(
        extract('year', ProductionOrder.date) == year,
        extract('month', ProductionOrder.date) == month,
        ProductionOrder.status == "Tasdiqlandi"
    ).all()

    # 2. Get production volume & direct costs by line
    line_data: Dict[int, Dict[str, float]] = {}
    lines = db.query(ProductionLine).order_by(ProductionLine.line_number).all()
    for l in lines:
        line_data[l.id] = {
            "line_id": l.id,
            "line_number": l.line_number,
            "line_name": l.name,
            "spec_tile_size": l.spec_tile_size,
            "volume_m2": 0.0,
            "direct_materials_cost_usd": 0.0
        }

    total_factory_volume_m2 = 0.0
    total_direct_materials_cost_usd = 0.0

    for order in orders:
        lid = order.line_id
        if lid in line_data:
            line_data[lid]["volume_m2"] += order.quantity
            line_data[lid]["direct_materials_cost_usd"] += order.direct_cost_usd
            total_factory_volume_m2 += order.quantity
            total_direct_materials_cost_usd += order.direct_cost_usd

    # 3. Fetch all indirect expenses (Bilvosita xarajatlar) from CashTransactions for the month converted to USD
    INDIRECT_CATEGORIES = [
        "bilvosita_xarajatlar", "Bilvosita xarajatlar", "Elektr energiya (Svet)", "Tabiiy gaz", "Suv va kanalizatsiya",
        "Uskunalar ta'miri va ehtiyot qismlar", "Sex ijarasi va xizmatlar", "Transport va yoqilg'i",
        "Ishchilar oyligi / Avans", "Boshqa sex xarajatlari"
    ]
    indirect_txs = db.query(CashTransaction).filter(
        extract('year', CashTransaction.date) == year,
        extract('month', CashTransaction.date) == month,
        CashTransaction.type == "chiqim",
        CashTransaction.category.in_(INDIRECT_CATEGORIES)
    ).all()

    total_indirect_expenses_usd = 0.0
    for tx in indirect_txs:
        usd_amount = convert_amount(tx.amount, tx.currency, "USD", tx.date, db)
        total_indirect_expenses_usd += usd_amount

    # 4. Fetch administrative & other expenses (Admin va Prochee)
    ADMIN_CATEGORIES = [
        "admin_prochee", "Ma'muriy xarajatlar", "Ma'muriy va boshqa xarajatlar",
        "Ofis ijarasi", "Aloqa, Internet va IT", "Buxgalteriya va audit",
        "Reklama va marketing", "Soliqlar va davlat bojlari", "Ofis va xo'jalik xarajatlari",
        "Boshqa ma'muriy xarajatlar"
    ]
    admin_txs = db.query(CashTransaction).filter(
        extract('year', CashTransaction.date) == year,
        extract('month', CashTransaction.date) == month,
        CashTransaction.type == "chiqim",
        CashTransaction.category.in_(ADMIN_CATEGORIES)
    ).all()

    total_admin_expenses_usd = 0.0
    for tx in admin_txs:
        usd_amount = convert_amount(tx.amount, tx.currency, "USD", tx.date, db)
        total_admin_expenses_usd += usd_amount

    # 5. Allocate indirect expenses proportionally across the 5 lines
    line_summaries = []
    for lid, d in line_data.items():
        vol = d["volume_m2"]
        vol_pct = (vol / total_factory_volume_m2 * 100.0) if total_factory_volume_m2 > 0 else 0.0
        
        # Proportionate allocation
        allocated_indirect = (total_indirect_expenses_usd * (vol / total_factory_volume_m2)) if total_factory_volume_m2 > 0 else 0.0
        total_mfg_cost = d["direct_materials_cost_usd"] + allocated_indirect
        unit_cost = (total_mfg_cost / vol) if vol > 0 else 0.0

        line_summaries.append({
            "line_id": d["line_id"],
            "line_number": d["line_number"],
            "line_name": d["line_name"],
            "spec_tile_size": d["spec_tile_size"],
            "production_volume_m2": round(vol, 2),
            "volume_percentage": round(vol_pct, 2),
            "direct_materials_cost_usd": round(d["direct_materials_cost_usd"], 2),
            "allocated_indirect_cost_usd": round(allocated_indirect, 2),
            "total_manufacturing_cost_usd": round(total_mfg_cost, 2),
            "unit_cost_usd_per_m2": round(unit_cost, 4)
        })

    return {
        "year_month": year_month,
        "total_factory_volume_m2": round(total_factory_volume_m2, 2),
        "total_direct_materials_cost_usd": round(total_direct_materials_cost_usd, 2),
        "total_indirect_expenses_usd": round(total_indirect_expenses_usd, 2),
        "total_admin_expenses_usd": round(total_admin_expenses_usd, 2),
        "lines": line_summaries
    }
