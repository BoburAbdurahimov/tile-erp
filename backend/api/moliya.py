import hmac
import os
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas import (
    PnLReportResponse, CashFlowReportResponse,
    MonthCloseRequest, MonthReopenRequest
)
from backend.api.auth import get_current_user_role, check_permission, is_admin
from backend.services.reports_service import get_pnl_report, get_cash_flow_report
from backend.services.month_close_service import (
    reopen_month, close_with_snapshot, auto_close_due_months, month_status,
)

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
    return month_status(db, year_month)

@router.post("/month-closing/close")
def close_month_action(
    payload: MonthCloseRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("moliya", role)
    if not is_admin(role):
        raise HTTPException(
            status_code=403,
            detail="Oyni yopish (Month-End Closing) faqat Admin roli uchun ruxsat etilgan!"
        )
    rec = close_with_snapshot(db, payload.year_month, username="admin", notes=payload.notes)
    return {
        "status": "success",
        "message": f"{payload.year_month} oyi muvaffaqiyatli yopildi va barcha operatsiyalar bloklandi.",
        "year_month": rec.year_month,
        "is_closed": True
    }

@router.get("/auto-close")
def auto_close(authorization: Optional[str] = Header(default=None), db: Session = Depends(get_db)):
    """Daily Vercel Cron: close every month whose 10th-of-next-month has passed.
    Vercel sends 'Authorization: Bearer <CRON_SECRET>' when CRON_SECRET is set;
    without it this is still harmless - it only writes what the date already decides."""
    secret = os.getenv("CRON_SECRET")
    if secret and not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Ruxsat yo'q.")
    return {"closed": auto_close_due_months(db)}

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
