"""Test helper: act as a role without logging in.

The API takes the role from a signed login token. Feature tests are not about
login, so they stand in a role from the X-User-Role header instead.
test_auth.py removes this override to test the real login.
"""
from fastapi import Header

from backend.main import app
from backend.api.auth import get_current_user_role


def _role_from_header(x_user_role: str = Header(default="Admin")) -> str:
    return x_user_role


def use_header_roles():
    app.dependency_overrides[get_current_user_role] = _role_from_header
