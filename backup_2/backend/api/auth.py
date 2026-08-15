from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import User, TelegramUser
from backend.auth_utils import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication & User Management"])

# RBAC Module Permissions mapping
ROLE_PERMISSIONS = {
    # Super Admin
    "Admin": ["dashboard", "mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish", "moliya", "users", "mini_app", "admin_tools"],
    
    # Granular individual permissions
    "Mini App": ["mini_app"],
    "Ombor": ["ombor", "mdm", "zakup"],
    "Kassa": ["kassa"],
    "Ishlab chiqarish": ["ishlab_chiqarish", "ombor"],
    "Kontragentlar & Balanslar": ["kontragentlar"],
    "Balanslar": ["kontragentlar"],
    "Sotib olish (Zakup)": ["zakup", "ombor"],
    "Sotish (Realizatsiya)": ["sotish", "kontragentlar"],
    "Moliya & PnL": ["moliya"],
    "Moliya": ["moliya"],
    "MDM (Spravochniklar)": ["mdm"],
    "MDM": ["mdm"],

    # Legacy role aliases
    "Ish boshqaruvchi": ["dashboard", "mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish", "mini_app"],
    "Direktor": ["dashboard", "moliya", "ombor", "kontragentlar", "kassa", "ishlab_chiqarish", "zakup", "sotish", "mini_app"],
    "Buxgalter": ["dashboard", "kassa", "moliya", "kontragentlar", "zakup", "sotish", "mini_app"],
    "Omborchi": ["dashboard", "ombor", "mdm", "zakup", "mini_app"],
    "Kassir": ["dashboard", "kassa", "kontragentlar", "mini_app"],
    "Sex boshlig'i": ["dashboard", "ishlab_chiqarish", "ombor", "mini_app"],
    "Moliyachi": ["dashboard", "moliya", "kontragentlar", "mini_app"]
}

def parse_roles(role_str: str) -> List[str]:
    if not role_str:
        return []
    return [r.strip() for r in str(role_str).split(",") if r.strip()]

def get_combined_permissions(role_str: str) -> List[str]:
    roles = parse_roles(role_str)
    if "Admin" in roles:
        return ROLE_PERMISSIONS["Admin"]
    perms = set()
    for r in roles:
        for p in ROLE_PERMISSIONS.get(r, []):
            perms.add(p)
    return list(perms)

def get_current_user_role(x_user_role: str = Header(default="Admin")) -> str:
    return x_user_role

def check_permission(module: str, role_str: str):
    roles = parse_roles(role_str)
    if "Admin" in roles:
        return
    perms = get_combined_permissions(role_str)
    if module not in perms:
        raise HTTPException(
            status_code=403,
            detail=f"Sizning rollaringiz ({role_str}) uchun '{module}' moduliga kirish ruxsati berilmagan!"
        )

# ==================== SCHEMAS ====================
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreateRequest(BaseModel):
    username: str
    full_name: str
    phone_number: Optional[str] = None
    role: str = "Ish boshqaruvchi"
    password: str

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None

class TelegramUserApproveRequest(BaseModel):
    role: str
    is_approved: bool = True

# ==================== AUTH ENDPOINTS ====================

@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username.ilike(payload.username.strip())).first()
    if not user:
        raise HTTPException(status_code=400, detail="Login yoki parol noto'g'ri!")
    
    if user.is_archived or not user.is_active:
        raise HTTPException(status_code=403, detail="Ushbu foydalanuvchi hisobi nofaol yoki arxivlangan!")

    if not verify_password(payload.password, user.password_hash or ""):
        raise HTTPException(status_code=400, detail="Login yoki parol noto'g'ri!")

    token = f"erp_token_{user.id}_{int(datetime.utcnow().timestamp())}"
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "phone_number": user.phone_number,
            "role": user.role,
            "is_active": user.is_active,
            "permissions": get_combined_permissions(user.role)
        }
    }

@router.get("/roles")
def list_roles():
    return [
        {"role": "Admin", "name": "👑 Admin (Barcha modullar + Foydalanuvchilar)", "desc": "Barcha huquqlar"},
        {"role": "Mini App", "name": "🚀 Mini App (Telegram Mini App ochish)", "desc": "Telegram botda Mini App tugmasi"},
        {"role": "Ombor", "name": "📦 Ombor (Sklad qoldiqlari)", "desc": "Ombor hisobi va qoldiqlari"},
        {"role": "Kassa", "name": "💵 Kassa (Kirim & Chiqim)", "desc": "Kassa operatsiyalari"},
        {"role": "Ishlab chiqarish", "name": "🏭 Ishlab chiqarish (Liniyalar)", "desc": "5 ta ishlab chiqarish liniyasi"},
        {"role": "Kontragentlar & Balanslar", "name": "👥 Kontragentlar & Balanslar", "desc": "Mijoz va Yetkazib beruvchi qarzlari"},
        {"role": "Sotib olish (Zakup)", "name": "🛒 Sotib olish (Zakup)", "desc": "Xaridlar va ta'minot"},
        {"role": "Sotish (Realizatsiya)", "name": "🏷️ Sotish (Realizatsiya)", "desc": "Tayyor kafel sotish"},
        {"role": "Moliya & PnL", "name": "📈 Moliya & PnL", "desc": "Foyda-zarar va moliyaviy hisobotlar"},
        {"role": "MDM (Spravochniklar)", "name": "🗂️ MDM (Spravochniklar)", "desc": "Kataloglar va narxlar"}
    ]

@router.get("/current")
def get_current_status(role: str = Depends(get_current_user_role)):
    return {
        "role": role,
        "permissions": ROLE_PERMISSIONS.get(role, [])
    }

# ==================== USER MANAGEMENT (ADMIN ONLY) ====================

@router.get("/users")
def get_users(include_archived: bool = True, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    query = db.query(User)
    if not include_archived:
        query = query.filter(User.is_archived == False)
    users = query.order_by(User.id.asc()).all()
    
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "phone_number": u.phone_number or "-",
            "role": u.role,
            "is_active": u.is_active,
            "is_archived": u.is_archived,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "-"
        }
        for u in users
    ]

@router.post("/users")
def create_user(payload: UserCreateRequest, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    # Check if username exists
    existing = db.query(User).filter(User.username.ilike(payload.username.strip())).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ushbu login band! Boshqa login tanlang.")
    
    new_user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        phone_number=payload.phone_number.strip() if payload.phone_number else None,
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_archived=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "success": True,
        "message": "Yangi foydalanuvchi muvaffaqiyatli yaratildi!",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "phone_number": new_user.phone_number,
            "role": new_user.role
        }
    }

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateRequest, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi!")

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone_number is not None:
        user.phone_number = payload.phone_number.strip()
    if payload.role is not None:
        user.role = payload.role
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_archived is not None:
        user.is_archived = payload.is_archived
        if payload.is_archived:
            user.is_active = False

    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": "Foydalanuvchi ma'lumotlari yangilandi!",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "phone_number": user.phone_number,
            "role": user.role,
            "is_active": user.is_active,
            "is_archived": user.is_archived
        }
    }

@router.delete("/users/{user_id}")
def archive_or_delete_user(user_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi!")
    if user.username == "Adminshox":
        raise HTTPException(status_code=400, detail="Bosh administrator hisobini o'chirib bo'lmaydi!")
    
    # Toggle archive
    user.is_archived = not user.is_archived
    user.is_active = not user.is_archived
    db.commit()
    return {
        "success": True,
        "message": f"Foydalanuvchi {'arxivlandi' if user.is_archived else 'faollashtirildi'}!",
        "is_archived": user.is_archived
    }

# ==================== TELEGRAM BOT USERS APPROVAL ====================

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
            "role": u.role or "Kutilmoqda",
            "is_approved": u.is_approved,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "-"
        }
        for u in users
    ]

@router.put("/telegram-users/{user_id}/approve")
def approve_telegram_user(
    user_id: int,
    payload: TelegramUserApproveRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram foydalanuvchisi topilmadi!")
    
    user.role = payload.role
    user.is_approved = payload.is_approved
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {
        "success": True,
        "message": f"Foydalanuvchi tasdiqlandi va '{user.role}' roli biriktirildi!",
        "user_id": user.id,
        "role": user.role,
        "is_approved": user.is_approved
    }

@router.delete("/telegram-users/{user_id}")
def delete_telegram_user(
    user_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram foydalanuvchisi topilmadi!")
    db.delete(user)
    db.commit()
    return {"success": True, "message": "Telegram foydalanuvchisi ro'yxatdan o'chirildi!"}
