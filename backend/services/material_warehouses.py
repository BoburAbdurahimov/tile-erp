"""Xomashyo and aralash warehouses, one pair per Ombor owner.

The finished tiles are already kept per owner (Toxir, Kodir, Istam, Aziz -
see SKLAD_CONFIG). Raw materials (xomashyo) and spare parts / consumables
(aralash) follow the same split: each owner has its own two warehouses, so a
purchase for Toxir lands in Toxir's, Toxir's production uses Toxir's clay, and
a user tied to Toxir sees and moves only those.

Warehouses 2 and 3 are the old shared ones (owner NULL). Their stock stays
where it is; an Admin moves it to an owner with "Ombordan omborga o'tkazish".
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models import SKLAD_CONFIG, Warehouse

XOMASHYO = "xomashyo"
ARALASH = "aralash"
KINDS = (XOMASHYO, ARALASH)
OWNERS: List[str] = list(dict.fromkeys(c["name"] for c in SKLAD_CONFIG))   # Toxir, Kodir, Istam, Aziz

# The shared warehouses from before the split, by kind.
SHARED = {XOMASHYO: 2, ARALASH: 3}
_SHARED_NAMES = {2: (XOMASHYO, "Ishlab chiqarish uchun materiallar", "Umumiy xomashyo"),
                 3: (ARALASH, "Aralash ombor", "Umumiy aralash")}


def kind_for_category(category: Optional[str]) -> str:
    """Spare parts go to the aralash warehouse, everything else to xomashyo."""
    return ARALASH if category == "Ehtiyot qism" else XOMASHYO


def _code(owner: str, kind: str) -> str:
    return f"WH-{owner.upper()}-{'XOM' if kind == XOMASHYO else 'ARL'}"


def _label(owner: str, kind: str) -> str:
    return f"{owner} {'xomashyo' if kind == XOMASHYO else 'aralash'}"


def _sync_id_sequence(db: Session) -> None:
    """Seeded rows were inserted with explicit ids; on Postgres move the id
    sequence past them so a new row does not collide."""
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT setval(pg_get_serial_sequence('warehouses', 'id'), "
                        "GREATEST((SELECT COALESCE(MAX(id), 1) FROM warehouses), 1))"))


def ensure_owner_warehouses(db: Session) -> None:
    """Create any missing owner warehouse and mark the shared ones. Runs on
    every start; does nothing until the base warehouses are seeded."""
    if not db.query(Warehouse).filter(Warehouse.id == 2).first():
        return
    changed = False
    for wid, (kind, old_name, new_name) in _SHARED_NAMES.items():
        wh = db.query(Warehouse).filter(Warehouse.id == wid).first()
        if wh and (wh.kind != kind or wh.name == old_name):
            wh.kind = kind
            if wh.name == old_name:
                wh.name = new_name
            changed = True
    missing = [(o, k) for o in OWNERS for k in KINDS
               if not db.query(Warehouse).filter(Warehouse.code == _code(o, k)).first()]
    if missing:
        _sync_id_sequence(db)
        for owner, kind in missing:
            db.add(Warehouse(code=_code(owner, kind), name=_label(owner, kind), owner=owner, kind=kind,
                             is_system_default=True,
                             description=f"{owner} omborining {'xomashyosi' if kind == XOMASHYO else 'ehtiyot qism va yordamchi materiallari'}"))
        changed = True
    if changed:
        db.commit()


def warehouse_id(db: Session, owner: str, kind: str) -> int:
    wh = db.query(Warehouse).filter(Warehouse.code == _code(owner, kind)).first()
    if not wh:
        ensure_owner_warehouses(db)
        wh = db.query(Warehouse).filter(Warehouse.code == _code(owner, kind)).first()
    return wh.id


# ---------------------------------------------------------------- who sees what

def scope_owners(scope: Optional[List[int]]) -> List[str]:
    """The owners of the user's Ombor sklads (scope None = every owner)."""
    if scope is None:
        return list(OWNERS)
    return [o for o in OWNERS if any(c["name"] == o and c["id"] in scope for c in SKLAD_CONFIG)]


def single_owner(scope: Optional[List[int]]) -> Optional[str]:
    owners = scope_owners(scope)
    return owners[0] if scope is not None and len(owners) == 1 else None


def allowed_ids(db: Session, scope: Optional[List[int]]) -> Optional[List[int]]:
    """Material warehouses the user may see and move; None = all of them."""
    if scope is None:
        return None
    owners = scope_owners(scope)
    return [w.id for w in db.query(Warehouse).filter(Warehouse.owner.in_(owners or [""])).all()]


def check_warehouse(db: Session, wid: int, scope: Optional[List[int]]) -> None:
    allowed = allowed_ids(db, scope)
    if allowed is not None and wid not in allowed:
        raise HTTPException(status_code=403,
                            detail=f"Sizga faqat shu omborlar biriktirilgan: {', '.join(scope_owners(scope))}.")


def pick_owner(scope: Optional[List[int]], requested: Optional[str]) -> str:
    """The owner a purchase / expense is for: the one asked for (it must be
    the user's), or the user's only Ombor."""
    owners = scope_owners(scope)
    if requested:
        if requested not in OWNERS:
            raise HTTPException(status_code=400, detail=f"Bunday ombor yo'q: {requested}.")
        if requested not in owners:
            raise HTTPException(status_code=403, detail=f"Sizga faqat shu omborlar biriktirilgan: {', '.join(owners)}.")
        return requested
    only = single_owner(scope)
    if only:
        return only
    raise HTTPException(status_code=400, detail=f"Qaysi ombor uchunligini tanlang: {', '.join(owners)}.")


def owner_of_sklad(sklad_id: Optional[int]) -> Optional[str]:
    cfg = next((c for c in SKLAD_CONFIG if c["id"] == sklad_id), None)
    return cfg["name"] if cfg else None


def describe(wh: Warehouse) -> dict:
    return {"id": wh.id, "code": wh.code, "name": wh.name, "owner": wh.owner, "kind": wh.kind}
