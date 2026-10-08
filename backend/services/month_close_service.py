"""Month-end closing.

A month closes automatically on the 10th of the following month (Tashkent
time): the first days of a month are for finishing the previous one's papers.
From that day the month counts as closed even before its closing record is
written; the record, with its PnL snapshot, is written by the daily cron
(GET /api/moliya/auto-close) or at start-up. An Admin can still close a month
early, and can reopen one - a reopened month is never closed again by itself.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import extract
from sqlalchemy.orm import Session
from backend.models import MonthClosing

AUTO_CLOSE_DAY = 10
AUTO_CLOSED_BY = "avto (10-sana)"
TASHKENT = timezone(timedelta(hours=5))


def local_today() -> date:
    return datetime.now(TASHKENT).date()


def auto_close_date(year_month: str) -> date:
    """The day a month closes by itself: the 10th of the next month."""
    year, month = map(int, year_month.split("-"))
    year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return date(year, month, AUTO_CLOSE_DAY)


def is_auto_due(year_month: str, today: Optional[date] = None) -> bool:
    return (today or local_today()) >= auto_close_date(year_month)


def is_month_closed(db: Session, target_date: date) -> bool:
    year_month = target_date.strftime("%Y-%m")
    rec = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    if rec:
        return bool(rec.is_closed)          # closed, or reopened by an Admin
    return is_auto_due(year_month)          # past the 10th: closed even before the record exists


def assert_month_open(db: Session, target_date: date):
    if is_month_closed(db, target_date):
        year_month = target_date.strftime("%Y-%m")
        raise HTTPException(
            status_code=400,
            detail=f"{year_month} oyi yopilgan (Month is closed). Ushbu davrdagi operatsiyalarni o'zgartirish, o'chirish yoki storno qilish taqiqlanadi."
        )


def close_month(db: Session, year_month: str, username: str, notes: str = None) -> MonthClosing:
    existing = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    if existing and existing.is_closed:
        raise HTTPException(status_code=400, detail=f"{year_month} oyi allaqachon yopilgan.")

    if not existing:
        existing = MonthClosing(year_month=year_month)
        db.add(existing)

    existing.is_closed = True
    existing.closed_at = datetime.utcnow()
    existing.closed_by_username = username
    existing.notes = notes
    db.commit()
    db.refresh(existing)
    return existing


def close_with_snapshot(db: Session, year_month: str, username: str, notes: str = None) -> MonthClosing:
    """Close a month and keep its PnL as it stood at closing."""
    from backend.services.reports_service import get_pnl_report   # here: reports imports this module's users
    pnl = get_pnl_report(db, year_month)
    rec = close_month(db, year_month, username=username, notes=notes)
    rec.pnl_revenue_usd = pnl["revenue_usd"]
    rec.pnl_cogs_usd = pnl["cogs_direct_materials_usd"]
    rec.pnl_indirect_usd = pnl["cogs_indirect_expenses_usd"]
    rec.pnl_admin_usd = pnl["admin_expenses_usd"]
    rec.pnl_net_profit_usd = pnl["net_profit_usd"]
    rec.total_production_volume = pnl["total_factory_volume_m2"]
    db.commit()
    db.refresh(rec)
    return rec


def _has_activity(db: Session, year_month: str) -> bool:
    from backend.models import CashTransaction, Purchase, ProductionOrder, Sale, SkladMovement
    year, month = map(int, year_month.split("-"))
    for model, col in ((CashTransaction, CashTransaction.date), (Purchase, Purchase.date),
                       (ProductionOrder, ProductionOrder.date), (Sale, Sale.date),
                       (SkladMovement, SkladMovement.occurred_at)):
        if db.query(model).filter(extract("year", col) == year, extract("month", col) == month).first():
            return True
    return False


def auto_close_due_months(db: Session, today: Optional[date] = None, lookback_months: int = 12) -> list:
    """Write the closing record (with its PnL snapshot) for every recent month
    whose 10th-of-next-month has passed and that has none yet. Months an Admin
    reopened have a record, so they are left alone. Safe to run any number of times."""
    today = today or local_today()
    closed = []
    y, m = today.year, today.month
    for _ in range(lookback_months):
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
        ym = f"{y:04d}-{m:02d}"
        if not is_auto_due(ym, today):
            continue
        if db.query(MonthClosing).filter(MonthClosing.year_month == ym).first():
            continue
        if not _has_activity(db, ym):
            continue
        close_with_snapshot(db, ym, AUTO_CLOSED_BY, notes=f"Avtomatik yopildi ({today:%d.%m.%Y})")
        closed.append(ym)
    return closed


def reopen_month(db: Session, year_month: str, user_role: str) -> MonthClosing:
    if "Admin" not in [r.strip() for r in str(user_role or "").split(",")]:
        raise HTTPException(
            status_code=403,
            detail="Faqat Admin roli yopilgan oyni qayta ochish (Re-open) huquqiga ega!"
        )
    existing = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    if not existing:
        if not is_auto_due(year_month):
            raise HTTPException(status_code=400, detail=f"{year_month} oyi yopiq emas.")
        # Closed by date but no record yet: the record marks it reopened, so the
        # automatic closing leaves it alone from now on.
        existing = MonthClosing(year_month=year_month, closed_by_username=AUTO_CLOSED_BY)
        db.add(existing)
    elif not existing.is_closed:
        raise HTTPException(status_code=400, detail=f"{year_month} oyi yopiq emas.")

    existing.is_closed = False
    existing.notes = ((existing.notes or "") + " | Admin qayta ochdi").strip(" |")
    db.commit()
    db.refresh(existing)
    return existing


def month_status(db: Session, year_month: str) -> dict:
    rec = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    auto_date = auto_close_date(year_month)
    if rec:
        closed, by, at, notes = bool(rec.is_closed), rec.closed_by_username, rec.closed_at, rec.notes
    else:
        closed = is_auto_due(year_month)
        by, at, notes = (AUTO_CLOSED_BY if closed else None), None, None
    return {
        "year_month": year_month,
        "is_closed": closed,
        "closed_at": at,
        "closed_by": by,
        "notes": notes,
        "reopened": bool(rec and not rec.is_closed),
        "auto_close_date": auto_date.isoformat(),
    }
