import logging
from datetime import date, datetime
import httpx
from sqlalchemy.orm import Session
from backend.models import ExchangeRate
from backend.config import CBU_API_URL, DEFAULT_USD_UZS_RATE

logger = logging.getLogger(__name__)

async def fetch_cbu_rate_today() -> float:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(CBU_API_URL)
            if resp.status_code == 200:
                data = resp.json()
                for item in data:
                    if item.get("Ccy") == "USD":
                        rate = float(item.get("Rate", DEFAULT_USD_UZS_RATE))
                        logger.info(f"Fetched live USD rate from CBU: {rate}")
                        return rate
    except Exception as e:
        logger.warning(f"Error fetching from CBU API ({e}). Using default rate.")
    return DEFAULT_USD_UZS_RATE

def get_exchange_rate_for_date(db: Session, target_date: date) -> float:
    rate_record = db.query(ExchangeRate).filter(ExchangeRate.date == target_date).first()
    if rate_record:
        return rate_record.rate_usd_uzs
    
    # Try getting the closest past rate
    past_rate = db.query(ExchangeRate).filter(ExchangeRate.date <= target_date).order_by(ExchangeRate.date.desc()).first()
    if past_rate:
        return past_rate.rate_usd_uzs
    
    # Otherwise, return default rate
    return DEFAULT_USD_UZS_RATE

def set_manual_exchange_rate(db: Session, target_date: date, rate: float) -> ExchangeRate:
    rate_record = db.query(ExchangeRate).filter(ExchangeRate.date == target_date).first()
    if rate_record:
        rate_record.rate_usd_uzs = rate
        rate_record.is_manual_override = True
    else:
        rate_record = ExchangeRate(
            date=target_date,
            rate_usd_uzs=rate,
            is_manual_override=True
        )
        db.add(rate_record)
    db.commit()
    db.refresh(rate_record)
    return rate_record

def convert_amount(amount: float, from_curr: str, to_curr: str, on_date: date, db: Session) -> float:
    if from_curr == to_curr or amount == 0:
        return amount
    
    rate = get_exchange_rate_for_date(db, on_date)
    if from_curr == "USD" and to_curr == "UZS":
        return amount * rate
    elif from_curr == "UZS" and to_curr == "USD":
        return amount / rate if rate > 0 else 0.0
    return amount
