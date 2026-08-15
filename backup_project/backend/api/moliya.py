from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import MonthClosing
from backend.schemas import (
    PnLReportResponse, CashFlowReportResponse,
    MonthCloseRequest, MonthReopenRequest
)
from backend.api.auth import get_current_user_role, check_permission
from backend.services.reports_service import get_pnl_report, get_cash_flow_report
from backend.services.month_close_service import close_month, reopen_month

router = APIRouter(prefix="/moliya", tags=["MODUL 8: MOLIYA VA OYNI YOPISH (Finance & Reports)"])

@router.get("/pnl", response_model=PnLReportResponse)
def get_profit_and_loss(
    year_month: Optional[str] = None, # "YYYY-MM"
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    if not year_month:
        year_month = date.today().strftime("%Y-%m")
        
    return get_pnl_report(db, year_month)

@router.get("/cash-flow", response_model=CashFlowReportResponse)
def get_cash_flow(
    year_month: Optional[str] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    if not year_month:
        year_month = date.today().strftime("%Y-%m")
        
    return get_cash_flow_report(db, year_month)

@router.get("/month-closing/status")
def get_month_status(
    year_month: Optional[str] = None,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    if not year_month:
        year_month = date.today().strftime("%Y-%m")
        
    record = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    return {
        "year_month": year_month,
        "is_closed": record.is_closed if record else False,
        "closed_at": record.closed_at if record else None,
        "closed_by": record.closed_by_username if record else None,
        "notes": record.notes if record else None
    }

@router.post("/month-closing/close")
def close_month_action(
    payload: MonthCloseRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    if role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Oyni yopish (Month-End Closing) faqat Admin roli uchun ruxsat etilgan!"
        )
    
    # Calculate snapshot PnL
    pnl = get_pnl_report(db, payload.year_month)
    
    rec = close_month(
        db=db,
        year_month=payload.year_month,
        username="admin",
        notes=payload.notes
    )
    rec.pnl_revenue_usd = pnl["revenue_usd"]
    rec.pnl_cogs_usd = pnl["cogs_direct_materials_usd"]
    rec.pnl_indirect_usd = pnl["cogs_indirect_expenses_usd"]
    rec.pnl_admin_usd = pnl["admin_expenses_usd"]
    rec.pnl_net_profit_usd = pnl["net_profit_usd"]
    rec.total_production_volume = pnl["total_factory_volume_m2"]
    db.commit()

    return {
        "status": "success",
        "message": f"{payload.year_month} oyi muvaffaqiyatli yopildi va barcha operatsiyalar bloklandi.",
        "year_month": rec.year_month,
        "is_closed": True
    }

@router.post("/month-closing/reopen")
def reopen_month_action(
    payload: MonthReopenRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    rec = reopen_month(db, payload.year_month, user_role=role)
    return {
        "status": "success",
        "message": f"{payload.year_month} oyi muvaffaqiyatli qayta ochildi (Re-opened).",
        "year_month": rec.year_month,
        "is_closed": False
    }
