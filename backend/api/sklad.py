"""Read-only view of the Telegram warehouse bot's stock.

Every endpoint here only reads. There is deliberately no write path, so the ERP
can never change what the bot sees.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.api.auth import get_current_user_role, check_permission
from backend.services import sklad_mirror

router = APIRouter(prefix="/sklad", tags=["MODUL 2B: BOT OMBORI (read-only mirror)"])


@router.get("/status")
def get_status(role: str = Depends(get_current_user_role)):
    check_permission("ombor", role)
    return sklad_mirror.status()


@router.get("/warehouses")
def list_warehouses(role: str = Depends(get_current_user_role)):
    check_permission("ombor", role)
    return {
        "configured": sklad_mirror.is_configured(),
        "warehouses": sklad_mirror.get_all_totals(),
    }


@router.get("/matrix")
def get_matrix(
    sklad_id: int = Query(1, ge=1),
    role: str = Depends(get_current_user_role),
):
    check_permission("ombor", role)
    return sklad_mirror.get_matrix(sklad_id)


@router.get("/movements")
def get_movements(
    limit: int = Query(50, ge=1, le=500),
    sklad_id: Optional[int] = None,
    role: str = Depends(get_current_user_role),
):
    check_permission("ombor", role)
    return {"movements": sklad_mirror.get_movements(limit=limit, sklad_id=sklad_id)}
