from typing import Optional, List
from datetime import datetime, timedelta
import hmac
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import (
    User, TelegramUser, LoginChallenge, MDMMaterial, MDMCounterparty, StockItem,
    ProductionConsumedMaterial, ProductionOrder, SaleItem, Sale,
    PurchaseItem, Purchase, CashExchange, CashTransaction, CashRegister,
    AttendanceEntry, WorkEntry, MonthlySalaryCalculation, SalaryAdjustment, SKLAD_CONFIG
)
from backend.auth_utils import (
    hash_password, verify_password, create_token, decode_token,
    new_otp_code, hash_otp, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS,
)
from backend.services import telegram_otp

router = APIRouter(prefix="/auth", tags=["Authentication & User Management"])

# RBAC Module Permissions mapping
ROLE_PERMISSIONS = {
    # Super Admin
    "Admin": ["dashboard", "mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish", "moliya", "users", "mini_app", "admin_tools", "tarix"],
    
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
    "Ish boshqaruvchi": ["dashboard", "mdm", "ombor", "kassa", "ishlab_chiqarish", "kontragentlar", "zakup", "sotish", "mini_app", "tarix"],
    "Direktor": ["dashboard", "moliya", "ombor", "kontragentlar", "kassa", "ishlab_chiqarish", "zakup", "sotish", "mini_app", "tarix"],
    "Buxgalter": ["dashboard", "kassa", "moliya", "kontragentlar", "zakup", "sotish", "mini_app", "tarix"],
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

def is_admin(role_str: str) -> bool:
    return "Admin" in parse_roles(role_str)

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """The logged-in user, from a signed Bearer token. 401 otherwise."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    data = decode_token(token)
    if not data:
        raise HTTPException(status_code=401, detail="Tizimga qayta kiring (sessiya tugagan).")
    user = db.query(User).filter(User.id == data.get("uid")).first()
    if not user or user.is_archived or not user.is_active:
        raise HTTPException(status_code=401, detail="Foydalanuvchi faol emas. Tizimga qayta kiring.")
    return user

def get_current_user_role(user: User = Depends(get_current_user)) -> str:
    """The role always comes from the database, never from the browser."""
    return user.role or ""

def get_current_username(user: User = Depends(get_current_user)) -> str:
    return user.username

SKLAD_IDS = [c["id"] for c in SKLAD_CONFIG]   # 1..8: Toxir 120, Toxir 100, Kodir 120, ...

def parse_sklads(value: Optional[str]) -> Optional[List[int]]:
    """'3,4' -> [3, 4]; empty -> None (every sklad)."""
    ids = [int(x) for x in str(value or "").split(",") if x.strip().isdigit()]
    return ids or None

def get_ombor_scope(user: User = Depends(get_current_user)) -> Optional[List[int]]:
    """The Ombor sklads this user is limited to, or None for all of them.
    Admins always see every sklad."""
    if is_admin(user.role or ""):
        return None
    return parse_sklads(user.ombor_sklads)

def _clean_sklads(ids: Optional[List[int]]) -> Optional[str]:
    """[] clears the limit; otherwise every id must be a known sklad."""
    ids = sorted(set(ids or []))
    bad = [i for i in ids if i not in SKLAD_IDS]
    if bad:
        raise HTTPException(status_code=400, detail=f"Bunday ombor yo'q: {bad}.")
    return ",".join(str(i) for i in ids) or None

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
    ombor_sklads: Optional[List[int]] = None   # e.g. [3, 4] = Kodir 120 and 100; empty = all

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    ombor_sklads: Optional[List[int]] = None   # [] clears the limit
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None

class TelegramUserApproveRequest(BaseModel):
    role: str
    is_approved: bool = True

# ==================== AUTH ENDPOINTS ====================

def _session(user: User) -> dict:
    return {
        "success": True,
        "token": create_token(user.id, user.username),
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "phone_number": user.phone_number,
            "role": user.role,
            "ombor_sklads": parse_sklads(user.ombor_sklads),
            "is_active": user.is_active,
            "permissions": get_combined_permissions(user.role)
        }
    }

def _mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return f"+{digits[:3]} ** ***-**-{digits[-2:]}" if len(digits) >= 9 else ""

@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username.ilike(payload.username.strip())).first()
    if not user:
        raise HTTPException(status_code=400, detail="Login yoki parol noto'g'ri!")

    if user.is_archived or not user.is_active:
        raise HTTPException(status_code=403, detail="Ushbu foydalanuvchi hisobi nofaol yoki arxivlangan!")

    if not verify_password(payload.password, user.password_hash or ""):
        raise HTTPException(status_code=400, detail="Login yoki parol noto'g'ri!")

    # Second step: a one-time code sent to the user's Telegram. Users with no
    # Telegram linked by phone (or no bot configured) sign in by password.
    tg = telegram_otp.find_telegram_chat(db, user) if telegram_otp.can_send() else None
    if not tg:
        return _session(user)

    challenge = LoginChallenge(
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    db.add(challenge)
    db.flush()
    code = new_otp_code()
    challenge.code_hash = hash_otp(challenge.id, code)
    db.commit()

    if not telegram_otp.send_code(tg.telegram_id, code, tg.language or "uz"):
        challenge.used = True
        db.commit()
        raise HTTPException(status_code=502, detail="Telegram kodini yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.")

    return {
        "success": True,
        "otp_required": True,
        "challenge_id": challenge.id,
        "sent_to": _mask_phone(tg.phone_number),
        "expires_in": OTP_TTL_SECONDS,
    }

class OtpVerifyRequest(BaseModel):
    challenge_id: int
    code: str

@router.post("/verify-otp")
def verify_otp(payload: OtpVerifyRequest, db: Session = Depends(get_db)):
    ch = db.query(LoginChallenge).filter(LoginChallenge.id == payload.challenge_id).first()
    if not ch or ch.used or ch.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Kod muddati tugagan. Qaytadan kiring.")
    if (ch.attempts or 0) >= OTP_MAX_ATTEMPTS:
        ch.used = True
        db.commit()
        raise HTTPException(status_code=429, detail="Urinishlar ko'p bo'ldi. Qaytadan kiring.")

    ch.attempts = (ch.attempts or 0) + 1
    code = "".join(c for c in (payload.code or "") if c.isdigit())
    if not ch.code_hash or not hmac.compare_digest(ch.code_hash, hash_otp(ch.id, code)):
        db.commit()
        left = OTP_MAX_ATTEMPTS - ch.attempts
        raise HTTPException(status_code=400, detail=f"Kod noto'g'ri. Yana {left} ta urinish qoldi.")

    ch.used = True
    user = db.query(User).filter(User.id == ch.user_id).first()
    db.commit()
    if not user or user.is_archived or not user.is_active:
        raise HTTPException(status_code=403, detail="Ushbu foydalanuvchi hisobi nofaol yoki arxivlangan!")
    return _session(user)

@router.get("/roles")
def list_roles():
    return [
        {"role": "Admin", "name": "Admin (Barcha modullar + Foydalanuvchilar)", "desc": "Barcha huquqlar"},
        {"role": "Mini App", "name": "Mini App (Telegram Mini App ochish)", "desc": "Telegram botda Mini App tugmasi"},
        {"role": "Ombor", "name": "Ombor (Sklad qoldiqlari)", "desc": "Ombor hisobi va qoldiqlari"},
        {"role": "Kassa", "name": "Kassa (Kirim & Chiqim)", "desc": "Kassa operatsiyalari"},
        {"role": "Ishlab chiqarish", "name": "Ishlab chiqarish (Omborlar)", "desc": "Omborlar bo'yicha ishlab chiqarish"},
        {"role": "Kontragentlar & Balanslar", "name": "Kontragentlar & Balanslar", "desc": "Mijoz va Yetkazib beruvchi qarzlari"},
        {"role": "Sotib olish (Zakup)", "name": "Sotib olish (Zakup)", "desc": "Xaridlar va ta'minot"},
        {"role": "Sotish (Realizatsiya)", "name": "Sotish (Realizatsiya)", "desc": "Tayyor kafel sotish"},
        {"role": "Moliya & PnL", "name": "Moliya & PnL", "desc": "Foyda-zarar va moliyaviy hisobotlar"},
        {"role": "MDM (Spravochniklar)", "name": "MDM (Spravochniklar)", "desc": "Kataloglar va narxlar"}
    ]

@router.get("/current")
def get_current_status(user: User = Depends(get_current_user)):
    return {
        "username": user.username,
        "role": user.role,
        "ombor_sklads": parse_sklads(user.ombor_sklads),
        "permissions": get_combined_permissions(user.role)
    }

# ==================== USER MANAGEMENT (ADMIN ONLY) ====================

@router.get("/users")
def get_users(include_archived: bool = True, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
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
            "ombor_sklads": parse_sklads(u.ombor_sklads),
            "is_active": u.is_active,
            "is_archived": u.is_archived,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "-"
        }
        for u in users
    ]

@router.post("/users")
def create_user(payload: UserCreateRequest, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
    # Check if username exists
    existing = db.query(User).filter(User.username.ilike(payload.username.strip())).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ushbu login band! Boshqa login tanlang.")
    
    new_user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        phone_number=payload.phone_number.strip() if payload.phone_number else None,
        role=payload.role,
        ombor_sklads=_clean_sklads(payload.ombor_sklads),
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
            "role": new_user.role,
            "ombor_sklads": parse_sklads(new_user.ombor_sklads)
        }
    }

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateRequest, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi!")

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone_number is not None:
        user.phone_number = payload.phone_number.strip()
    if payload.role is not None:
        user.role = payload.role
    if payload.ombor_sklads is not None:
        user.ombor_sklads = _clean_sklads(payload.ombor_sklads)
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
            "ombor_sklads": parse_sklads(user.ombor_sklads),
            "is_active": user.is_active,
            "is_archived": user.is_archived
        }
    }

@router.put("/users/{user_id}/toggle-archive")
@router.post("/users/{user_id}/archive")
def toggle_archive_user(user_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi!")
    if user.username == "Adminshox":
        raise HTTPException(status_code=400, detail="Bosh administrator hisobini arxivlab bo'lmaydi!")
    
    user.is_archived = not user.is_archived
    user.is_active = not user.is_archived
    user.updated_at = datetime.utcnow()
    db.commit()
    return {
        "success": True,
        "message": f"Foydalanuvchi {'arxivlandi' if user.is_archived else 'faollashtirildi'}!",
        "is_archived": user.is_archived
    }

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi!")
    if user.username == "Adminshox":
        raise HTTPException(status_code=400, detail="Bosh administrator hisobini o'chirib bo'lmaydi!")
    
    db.delete(user)
    db.commit()
    return {
        "success": True,
        "message": "Foydalanuvchi butunlay o'chirildi!"
    }


# ==================== TELEGRAM BOT USERS APPROVAL ====================

@router.get("/telegram-users")
def get_telegram_users(db: Session = Depends(get_db), role: str = Depends(get_current_user_role)):
    check_permission("users", role)
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
    check_permission("users", role)
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
    check_permission("users", role)
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram foydalanuvchisi topilmadi!")
    db.delete(user)
    db.commit()
    return {"success": True, "message": "Telegram foydalanuvchisi ro'yxatdan o'chirildi!"}

@router.post("/clean-demo-data")
def clean_demo_data(
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role)
):
    check_permission("admin_tools", role)
    try:
        db.query(ProductionConsumedMaterial).delete()
        db.query(ProductionOrder).delete()
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(PurchaseItem).delete()
        db.query(Purchase).delete()
        db.query(StockItem).delete()
        db.query(SalaryAdjustment).delete()
        db.query(CashExchange).delete()
        db.query(CashTransaction).delete()
        for cr in db.query(CashRegister).all():
            cr.balance = 0.0
        db.query(MDMMaterial).delete()
        db.query(MDMCounterparty).delete()
        db.query(AttendanceEntry).delete()
        db.query(WorkEntry).delete()
        db.query(MonthlySalaryCalculation).delete()
        db.commit()
        return {
            "success": True,
            "message": "Barcha demo MDM, ombor, ishlab chiqarish, savdo va kassa ma'lumotlari tozalandi!"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ma'lumotlarni tozalashda xatolik: {str(e)}")

