"""Read-only mirror of the Telegram warehouse bot's Turso database.

The bot (github.com/BoburAbdurahimov/Skladbot) keeps its stock in Turso as a
2D matrix per warehouse: length (200-800) x width (0-90) -> quantity. A size
is written as a single code, so 680 means length 600, width 80.

This module is deliberately READ-ONLY. It exposes no insert, update or delete,
so nothing done in the ERP can reach the bot's data. Traffic is one way:

    bot writes Turso  ->  ERP reads Turso  ->  ERP shows it

If the ERP ever needs to push stock back to the bot, that has to be added
explicitly and consciously - it cannot happen by accident through this module.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Mirrors bot/db.py
ALLOWED_LENGTHS = [200, 300, 400, 500, 600, 700, 800]
ALLOWED_WIDTHS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]

# Mirrors bot/states.py SKLADS. The names and corner numbers live only in the
# bot's source, not in its database, so they are duplicated here. If the bot's
# SKLADS list changes, update this to match.
SKLADS = [
    {"id": 1, "name": "Toxir", "corner_number": 15, "eni": 120},
    {"id": 2, "name": "Toxir", "corner_number": 15, "eni": 100},
    {"id": 3, "name": "Kodir", "corner_number": 22, "eni": 120},
    {"id": 4, "name": "Kodir", "corner_number": 22, "eni": 100},
    {"id": 5, "name": "Istam", "corner_number": 22, "eni": 120},
    {"id": 6, "name": "Istam", "corner_number": 22, "eni": 100},
    {"id": 7, "name": "Aziz", "corner_number": 15, "eni": 120},
    {"id": 8, "name": "Aziz", "corner_number": 15, "eni": 100},
]

_client = None
_client_failed = False


def is_configured() -> bool:
    return bool(os.getenv("TURSO_DATABASE_URL") and os.getenv("TURSO_AUTH_TOKEN"))


def _get_client():
    """Lazily open a Turso client, caching it for the life of the process.

    Returns None when credentials are missing or the driver is unavailable, so
    callers can degrade to a clear "not configured" message instead of a 500.
    """
    global _client, _client_failed
    if _client is not None:
        return _client
    if _client_failed or not is_configured():
        return None
    try:
        import libsql_client
    except ImportError:
        logger.warning("libsql-client is not installed; bot warehouse mirror disabled.")
        _client_failed = True
        return None
    try:
        _client = libsql_client.create_client_sync(
            url=os.environ["TURSO_DATABASE_URL"],
            auth_token=os.environ["TURSO_AUTH_TOKEN"],
        )
        return _client
    except Exception as e:
        logger.warning(f"Could not connect to the bot's Turso database: {e}")
        _client_failed = True
        return None


def status() -> dict:
    """Whether the mirror can reach the bot's database, and how much it holds."""
    if not is_configured():
        return {
            "configured": False,
            "connected": False,
            "detail": "TURSO_DATABASE_URL va TURSO_AUTH_TOKEN o'rnatilmagan.",
        }
    client = _get_client()
    if client is None:
        return {"configured": True, "connected": False, "detail": "Turso bazasiga ulanib bo'lmadi."}
    try:
        rows = client.execute("SELECT COUNT(*) FROM inventory").rows
        movements = client.execute("SELECT COUNT(*) FROM movements").rows
        return {
            "configured": True,
            "connected": True,
            "inventory_rows": rows[0][0] if rows else 0,
            "movement_rows": movements[0][0] if movements else 0,
            "detail": None,
        }
    except Exception as e:
        return {"configured": True, "connected": False, "detail": str(e)}


def get_matrix(sklad_id: int) -> dict:
    """One warehouse as a length x width grid, exactly as the bot stores it."""
    client = _get_client()
    cfg = next((s for s in SKLADS if s["id"] == sklad_id), None)

    base = {
        "sklad_id": sklad_id,
        "name": cfg["name"] if cfg else f"Sklad {sklad_id}",
        "eni": cfg["eni"] if cfg else None,
        "corner_number": cfg["corner_number"] if cfg else sklad_id,
        "rows": ALLOWED_LENGTHS,
        "cols": ALLOWED_WIDTHS,
        "cells": [],
        "total_qty": 0,
        "total_metr": 0.0,
    }
    if client is None:
        base["available"] = False
        return base

    try:
        rs = client.execute(
            "SELECT length, width, quantity FROM inventory "
            "WHERE sklad_id=? ORDER BY length, width",
            [sklad_id],
        )
    except Exception as e:
        logger.warning(f"Bot warehouse read failed: {e}")
        base["available"] = False
        return base

    cells, total_qty, total_metr = [], 0, 0.0
    for length, width, qty in rs.rows:
        qty = int(qty or 0)
        if qty == 0:
            continue
        cells.append({
            "length": int(length),
            "width": int(width),
            "code": int(length) + int(width),  # the size code the bot accepts, e.g. 680
            "quantity": qty,
        })
        total_qty += qty
        # The bot's "metr" figure: qty * (length + width) / 100
        total_metr += qty * (int(length) + int(width)) / 100

    base["cells"] = cells
    base["total_qty"] = total_qty
    base["total_metr"] = round(total_metr, 2)
    base["available"] = True
    return base


def get_all_totals() -> list:
    """Per-warehouse totals, for the overview strip."""
    client = _get_client()
    out = []
    for s in SKLADS:
        row = {
            "sklad_id": s["id"],
            "name": s["name"],
            "eni": s["eni"],
            "corner_number": s["corner_number"],
            "total_qty": 0,
            "total_metr": 0.0,
            "available": client is not None,
        }
        if client is not None:
            try:
                rs = client.execute(
                    "SELECT COALESCE(SUM(quantity), 0), "
                    "COALESCE(SUM(quantity * (length + width)), 0) "
                    "FROM inventory WHERE sklad_id=?",
                    [s["id"]],
                )
                if rs.rows:
                    row["total_qty"] = int(rs.rows[0][0] or 0)
                    row["total_metr"] = round(float(rs.rows[0][1] or 0) / 100, 2)
            except Exception as e:
                logger.warning(f"Totals read failed for sklad {s['id']}: {e}")
                row["available"] = False
        out.append(row)
    return out


def get_movements(limit: int = 50, sklad_id: Optional[int] = None) -> list:
    """Recent bot operations (PRIXOD / RASXOD / CLEAR), newest first."""
    client = _get_client()
    if client is None:
        return []
    sql = "SELECT sklad_id, operation, details, timestamp FROM movements"
    args = []
    if sklad_id is not None:
        sql += " WHERE sklad_id=?"
        args.append(sklad_id)
    sql += " ORDER BY timestamp DESC LIMIT ?"
    args.append(max(1, min(limit, 500)))

    try:
        rs = client.execute(sql, args)
    except Exception as e:
        logger.warning(f"Movement read failed: {e}")
        return []

    by_id = {s["id"]: s for s in SKLADS}
    out = []
    for sid, operation, details, ts in rs.rows:
        cfg = by_id.get(int(sid))
        out.append({
            "sklad_id": int(sid),
            "sklad_label": f"{cfg['name']} {cfg['eni']}" if cfg else f"Sklad {sid}",
            "operation": operation,
            "details": details,
            "timestamp": float(ts),
        })
    return out
