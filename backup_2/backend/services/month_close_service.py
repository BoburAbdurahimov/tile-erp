from datetime import date
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import MonthClosing

def is_month_closed(db: Session, target_date: date) -> bool:
    year_month = target_date.strftime("%Y-%m")
    closed = db.query(MonthClosing).filter(
        MonthClosing.year_month == year_month,
        MonthClosing.is_closed == True
    ).first()
    return closed is not None

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
    existing.closed_by_username = username
    existing.notes = notes
    db.commit()
    db.refresh(existing)
    return existing

def reopen_month(db: Session, year_month: str, user_role: str) -> MonthClosing:
    if user_role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Faqat Admin roli yopilgan oyni qayta ochish (Re-open) huquqiga ega!"
        )
    existing = db.query(MonthClosing).filter(MonthClosing.year_month == year_month).first()
    if not existing or not existing.is_closed:
        raise HTTPException(status_code=400, detail=f"{year_month} oyi yopiq emas.")
        
    existing.is_closed = False
    db.commit()
    db.refresh(existing)
    return existing
