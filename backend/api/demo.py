"""Admin-only: fill the system with demo data from the website itself, or wipe
every document to start from zero."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.auth import get_current_user, is_admin
from backend.auth_utils import create_token
from backend.database import SessionLocal, get_db
from backend.models import User
from backend.services import demo_seed, reset_service

router = APIRouter(prefix="/demo", tags=["DEMO"])


@router.post("/seed")
def seed_demo(force: bool = Query(False), user: User = Depends(get_current_user)):
    if not is_admin(user.role or ""):
        raise HTTPException(status_code=403, detail="Faqat Admin uchun.")
    from backend.main import app   # here, to avoid a circular import
    # Each step runs as this admin, through the normal API and its checks.
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_token(user.id, user.username)}"}
    db = SessionLocal()
    try:
        updated = not force and demo_seed.has_demo(db)   # already there: only bring it up to date
    finally:
        db.close()
    try:
        steps = demo_seed.run(demo_seed.make_caller(client, headers), force=force)
    except demo_seed.DemoError as e:
        raise HTTPException(status_code=400, detail=f"Demo ma'lumot qo'shishda xato: {e}")
    return {"success": True, "updated": updated, "steps": steps}


class ResetRequest(BaseModel):
    confirm: str                 # must be "TOZALASH", so it is never done by a stray click
    keep_norms: bool = False     # keep the Avto sarf norms


@router.post("/reset")
def reset_all(payload: ResetRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin only: delete every document and start from zero. Kassa money and
    counterparties stay (see reset_service)."""
    if not is_admin(user.role or ""):
        raise HTTPException(status_code=403, detail="Faqat Admin uchun.")
    if (payload.confirm or "").strip().upper() != "TOZALASH":
        raise HTTPException(status_code=400, detail="Tasdiqlash uchun TOZALASH deb yozing.")
    result = reset_service.reset_operational_data(db, keep_norms=payload.keep_norms)
    return {"success": True, **result}
