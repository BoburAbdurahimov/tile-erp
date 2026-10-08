from typing import Dict, Any
from sqlalchemy import extract
from sqlalchemy.orm import Session
from backend.models import ProductionOrder, CashTransaction, LineExpense, SKLAD_CONFIG
from backend.services.currency_service import convert_amount

# Production goes into an Ombor (owner x eni) instead of onto a line. Orders made
# before that, with no Ombor, are costed in one "other" bucket so none is lost.
OTHER_BUCKET = 0


def calculate_monthly_production_cost_allocation(db: Session, year_month: str) -> Dict[str, Any]:
    """
    Calculates, for each Ombor production went into this month:
    1. Pieces produced.
    2. Direct raw materials cost (consumed from Warehouse 2).
    3. Spare parts & consumables issued from Warehouse 3 (LineExpense), spread by volume.
    4. General indirect costs (Kassa), spread by volume:
       Allocated Indirect = Total Indirect Costs * (Ombor Volume / Total Factory Volume)
    5. Unit cost ($/dona = Direct Materials + Spare parts + Allocated Overhead) / volume.
    """
    try:
        year, month = map(int, year_month.split("-"))
    except ValueError:
        raise ValueError("year_month must be in 'YYYY-MM' format")

    orders = db.query(ProductionOrder).filter(
        extract('year', ProductionOrder.date) == year,
        extract('month', ProductionOrder.date) == month,
        ProductionOrder.status == "Tasdiqlandi"
    ).all()

    buckets: Dict[int, Dict[str, Any]] = {}
    for s in SKLAD_CONFIG:
        buckets[s["id"]] = {
            "sklad_id": s["id"], "owner": s["name"], "eni": s["eni"], "label": f'{s["name"]} {s["eni"]}',
            "volume": 0.0, "direct": 0.0, "equipment": 0.0,
        }

    def other_bucket():
        if OTHER_BUCKET not in buckets:
            buckets[OTHER_BUCKET] = {
                "sklad_id": OTHER_BUCKET, "owner": "-", "eni": 0, "label": "Boshqa (omborsiz)",
                "volume": 0.0, "direct": 0.0, "equipment": 0.0,
            }
        return buckets[OTHER_BUCKET]

    total_volume = 0.0
    total_direct = 0.0
    for order in orders:
        b = buckets.get(order.out_sklad_id) or other_bucket()
        b["volume"] += order.quantity or 0.0
        b["direct"] += order.direct_cost_usd or 0.0
        total_volume += order.quantity or 0.0
        total_direct += order.direct_cost_usd or 0.0

    # Spare parts & consumables from Warehouse 3: spread over this month's production by volume.
    line_expenses = db.query(LineExpense).filter(
        extract('year', LineExpense.date) == year,
        extract('month', LineExpense.date) == month,
        LineExpense.status == "Tasdiqlandi"
    ).all()
    total_equipment = 0.0
    for le in line_expenses:
        cost = le.total_cost_usd or 0.0
        total_equipment += cost
        if total_volume > 0:
            for b in buckets.values():
                b["equipment"] += cost * (b["volume"] / total_volume)
        else:
            other_bucket()["equipment"] += cost

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
    total_indirect = sum(convert_amount(tx.amount, tx.currency, "USD", tx.date, db) for tx in indirect_txs)

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
    total_admin = sum(convert_amount(tx.amount, tx.currency, "USD", tx.date, db) for tx in admin_txs)

    rows = []
    for b in buckets.values():
        vol = b["volume"]
        share = (vol / total_volume) if total_volume > 0 else 0.0
        indirect = total_indirect * share
        total_cost = b["direct"] + b["equipment"] + indirect
        rows.append({
            "sklad_id": b["sklad_id"],
            "label": b["label"],
            "owner": b["owner"],
            "eni": b["eni"],
            "production_volume": round(vol, 2),
            "volume_percentage": round(share * 100.0, 2),
            "direct_materials_cost_usd": round(b["direct"], 2),
            "equipment_expenses_usd": round(b["equipment"], 2),
            "allocated_indirect_cost_usd": round(indirect, 2),
            "total_manufacturing_cost_usd": round(total_cost, 2),
            "unit_cost_usd": round(total_cost / vol, 4) if vol > 0 else 0.0,
        })

    return {
        "year_month": year_month,
        "total_factory_volume": round(total_volume, 2),
        "total_direct_materials_cost_usd": round(total_direct, 2),
        "total_line_equipment_expenses_usd": round(total_equipment, 2),
        "total_indirect_expenses_usd": round(total_indirect, 2),
        "total_admin_expenses_usd": round(total_admin, 2),
        "ombors": rows,
    }
