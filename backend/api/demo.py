"""Admin-only: fill the system with demo data from the website itself."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.testclient import TestClient

from backend.api.auth import get_current_user, is_admin
from backend.auth_utils import create_token
from backend.models import User
from backend.services import demo_seed

router = APIRouter(prefix="/demo", tags=["DEMO"])


@router.post("/seed")
def seed_demo(force: bool = Query(False), user: User = Depends(get_current_user)):
    if not is_admin(user.role or ""):
        raise HTTPException(status_code=403, detail="Faqat Admin uchun.")
    from backend.main import app   # here, to avoid a circular import
    # Each step runs as this admin, through the normal API and its checks.
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_token(user.id, user.username)}"}
    try:
        steps = demo_seed.run(demo_seed.make_caller(client, headers), force=force)
    except demo_seed.DemoError as e:
        raise HTTPException(status_code=400, detail=f"Demo ma'lumot qo'shishda xato: {e}")
    return {"success": True, "steps": steps}
