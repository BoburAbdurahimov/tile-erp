"""Dates as the factory sees them: Tashkent time (UTC+5)."""
from datetime import date, datetime, timedelta, timezone

TASHKENT = timezone(timedelta(hours=5))


def local_today() -> date:
    return datetime.now(TASHKENT).date()
