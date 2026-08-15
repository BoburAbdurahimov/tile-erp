from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import User

router = APIRouter(prefix="/auth", tags=["Authentication & Roles"])

# RBAC Module Permissions mapping
ROLE_PERMISSIONS = {
    "Admin": ["mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish", "moliya", "admin_tools"],
    "Ish boshqaruvchi": ["mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish"], # No moliya
    "Direktor": ["moliya", "ombor", "kontragentlar"] # Only Moliya, Ombor, Mijozlar va Postavshiklar
}

def get_current_user_role(x_user_role: str = Header(default="Admin")) -> str:
    if x_user_role not in ROLE_PERMISSIONS:
        return "Admin"
    return x_user_role

def check_permission(module: str, role: str):
    allowed = ROLE_PERMISSIONS.get(role, [])
    if module not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Sizning rolingiz ({role}) uchun '{module}' moduliga kirish ruxsati berilmagan!"
        )

@router.get("/roles")
def list_roles():
    return [
        {"role": "Admin", "name": "Super Admin (Barcha huquqlar)", "allowed_modules": ROLE_PERMISSIONS["Admin"]},
        {"role": "Ish boshqaruvchi", "name": "Ish boshqaruvchi / Boshqaruvchi (Moliya modulidan tashqari)", "allowed_modules": ROLE_PERMISSIONS["Ish boshqaruvchi"]},
        {"role": "Direktor", "name": "Direktor (Moliya, Ombor, Balanslar)", "allowed_modules": ROLE_PERMISSIONS["Direktor"]}
    ]

@router.get("/current")
def get_current_status(role: str = Depends(get_current_user_role)):
    return {
        "role": role,
        "permissions": ROLE_PERMISSIONS.get(role, [])
    }

from backend.models import TelegramUser
from pydantic import BaseModel

class UserRoleUpdatePayload(BaseModel):
    role: str
    is_approved: bool = True

@router.get("/telegram-users")
def get_telegram_users(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    users = db.query(TelegramUser).order_by(TelegramUser.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "telegram_id": u.telegram_id,
            "phone_number": u.phone_number or "-",
            "username": u.username or "-",
            "first_name": u.first_name or "-",
            "last_name": u.last_name or "",
            "language": u.language or "uz",
            "role": u.role or "Ish boshqaruvchi",
            "is_approved": u.is_approved,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "-"
        }
        for u in users
    ]

@router.put("/telegram-users/{user_id}/role")
def update_telegram_user_role(
    user_id: int,
    payload: UserRoleUpdatePayload,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools", role)
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    
    user.role = payload.role
    user.is_approved = payload.is_approved
    db.commit()
    db.refresh(user)
    return {"message": "Foydalanuvchi roli muvaffaqiyatli yangilandi", "user_id": user.id, "new_role": user.role}

@router.delete("/telegram-users/{user_id}")
def delete_telegram_user(
    user_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools", role)
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    db.delete(user)
    db.commit()
    return {"message": "Foydalanuvchi o'chirildi"}
