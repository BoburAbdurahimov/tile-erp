"""To'liq demo ma'lumotlar - butun tizimni sinab ko'rish uchun.

    python seed_demo.py            # DATABASE_URL from .env / environment
    python seed_demo.py --force    # add another batch even if demo data exists

The same can be done from the website: Foydalanuvchilar -> "Demo ma'lumot qo'shish".
See backend/services/demo_seed.py for what is added.
"""
import sys

from fastapi import Header
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import create_tables
from backend.api.auth import get_current_user_role, get_current_username
from backend.services import demo_seed


def _role(x_user_role: str = Header(default="Admin")) -> str:
    return "Admin"


def main():
    create_tables()
    try:
        from seed_data import seed_database
        seed_database()          # warehouses, registers, catalogue
    except Exception as e:      # already seeded - fine
        print(f"  (asosiy seed: {e})")
    # Run as Admin without a login token; only for this script.
    app.dependency_overrides[get_current_user_role] = _role
    app.dependency_overrides[get_current_username] = lambda: "demo"
    for step in demo_seed.run(demo_seed.make_caller(TestClient(app)), force="--force" in sys.argv):
        print(f"• {step}", flush=True)


if __name__ == "__main__":
    main()
