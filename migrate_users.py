from sqlalchemy import text
from backend.database import init_engine, engine, SessionLocal
from backend.models import User
from backend.auth_utils import hash_password

init_engine()

with engine.connect() as conn:
    # 1. Update users table columns if missing
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
        conn.commit()
        print("Users table columns updated.")
    except Exception as e:
        print("Users columns migration error:", e)

# 2. Seed Adminshox user
db = SessionLocal()
try:
    admin_user = db.query(User).filter(User.username == "Adminshox").first()
    if not admin_user:
        admin_user = User(
            username="Adminshox",
            full_name="Adminshox Administrator",
            phone_number="+998901234567",
            role="Admin",
            password_hash=hash_password("test0101"),
            is_active=True,
            is_archived=False
        )
        db.add(admin_user)
        db.commit()
        print("Admin user Adminshox created successfully!")
    else:
        admin_user.password_hash = hash_password("test0101")
        admin_user.role = "Admin"
        admin_user.is_active = True
        admin_user.is_archived = False
        db.commit()
        print("Admin user Adminshox password and role updated!")
finally:
    db.close()
