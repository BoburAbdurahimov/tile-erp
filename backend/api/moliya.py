from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas import PnLReportResponse, CashFlowReportResponse
from backend.api.auth import get_current_user_role, check_permission
from backend.services.reports_service import get_pnl_report, get_cash_flow_report

router = APIRouter(prefix="/moliya", tags=["MODUL 8: MOLIYA (Finance & Reports)"])

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
