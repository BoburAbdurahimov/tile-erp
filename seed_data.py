import logging
from datetime import date, timedelta
from backend.database import SessionLocal, create_tables
from backend.models import (
    Warehouse, MDMMaterial, MDMCounterparty, StockItem,
    CashRegister, CashTransaction, ProductionLine, ProductionOrder,
    ProductionConsumedMaterial, Purchase, PurchaseItem, Sale, SaleItem,
    ExchangeRate, User, Employee, JobType, AttendanceEntry, WorkEntry, MonthlySalaryCalculation
)

logger = logging.getLogger(__name__)

def seed_database():
    create_tables()
    db = SessionLocal()
    
    # Run auto-migrations for postgres/sqlite
    try:
        from sqlalchemy import text
        with db.bind.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT '1-Liniya';"))
                conn.execute(text("ALTER TABLE monthly_salary_calculations ADD COLUMN IF NOT EXISTS department VARCHAR(100);"))
                conn.commit()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Migration note: {e}")
    
    # 0. PURGE ALL OLD DEMO DATA SO THE SYSTEM IS 100% BLANK FOR MANUAL USER TESTING
    try:
        db.query(ProductionConsumedMaterial).delete()
        db.query(ProductionOrder).delete()
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(PurchaseItem).delete()
        db.query(Purchase).delete()
        db.query(StockItem).delete()
        db.query(CashTransaction).delete()
        for cr in db.query(CashRegister).all():
            cr.balance = 0.0
        db.query(MDMMaterial).delete()
        db.query(MDMCounterparty).delete()
        db.query(AttendanceEntry).delete()
        db.query(WorkEntry).delete()
        db.query(MonthlySalaryCalculation).delete()
        db.query(Employee).delete()
        db.query(JobType).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error purging demo data: {e}")

    # 1. Exchange Rate
    today = date.today()
    if not db.query(ExchangeRate).first():
        db.add(ExchangeRate(date=today, rate_usd_uzs=12850.0, is_manual_override=False))
        db.add(ExchangeRate(date=today - timedelta(days=7), rate_usd_uzs=12800.0, is_manual_override=False))
        db.add(ExchangeRate(date=today - timedelta(days=30), rate_usd_uzs=12750.0, is_manual_override=False))
        db.commit()

    # 2. Warehouses (3 Default system warehouses)
    if not db.query(Warehouse).first():
        wh1 = Warehouse(id=1, code="WH-01", name="Tayyor mahsulotlar", is_system_default=True, description="Tayyor ishlab chiqarilgan kafel plitalari ombori")
        wh2 = Warehouse(id=2, code="WH-02", name="Ishlab chiqarish uchun materiallar", is_system_default=True, description="Asosiy xomashyo va komponentlar ombori")
        wh3 = Warehouse(id=3, code="WH-03", name="Aralash ombor", is_system_default=True, description="Yordamchi materiallar, ehtiyot qismlar va qadoqlash ombori")
        db.add_all([wh1, wh2, wh3])
        db.commit()

    # 3. Production Lines (5 Lines)
    if not db.query(ProductionLine).first():
        lines = [
            ProductionLine(line_number=1, name="Liniya 1 (30x30 Standart)", spec_tile_size="30x30 cm", daily_capacity_m2=1200.0),
            ProductionLine(line_number=2, name="Liniya 2 (60x60 Katta)", spec_tile_size="60x60 cm", daily_capacity_m2=1500.0),
            ProductionLine(line_number=3, name="Liniya 3 (60x120 Granit)", spec_tile_size="60x120 cm", daily_capacity_m2=1000.0),
            ProductionLine(line_number=4, name="Liniya 4 (80x80 Premium)", spec_tile_size="80x80 cm", daily_capacity_m2=900.0),
            ProductionLine(line_number=5, name="Liniya 5 (45x45 Mozaik)", spec_tile_size="45x45 cm", daily_capacity_m2=1100.0),
        ]
        db.add_all(lines)
        db.commit()

    # 4. Cash Registers (2 Registers - Initial 0.0 balance for clean manual accounting)
    if not db.query(CashRegister).first():
        cr1 = CashRegister(id=1, name="Kassa USD", currency="USD", balance=0.0, description="AQSH Dollari hisob-kitob kassasi")
        cr2 = CashRegister(id=2, name="Kassa UZS", currency="UZS", balance=0.0, description="O'zbekiston So'mi milliy valyuta kassasi")
        db.add_all([cr1, cr2])
        db.commit()

    # 5. Default Admin User (Adminshox / test0101)
    from backend.auth_utils import hash_password
    admin_u = db.query(User).filter(User.username == "Adminshox").first()
    if not admin_u:
        db.add(User(
            username="Adminshox",
            full_name="Adminshox Boshqaruvchi",
            phone_number="+998901234567",
            role="Admin",
            password_hash=hash_password("test0101"),
            is_active=True,
            is_archived=False
        ))
        db.commit()
    else:
        admin_u.password_hash = hash_password("test0101")
        admin_u.role = "Admin"
        admin_u.is_active = True
        admin_u.is_archived = False
        db.commit()

    bobur_u = db.query(User).filter(User.username == "Boburjon").first()
    if not bobur_u:
        db.add(User(
            username="Boburjon",
            full_name="Boburjon Menejer",
            phone_number="+998909876543",
            role="Ombor,Kassa,Ishlab chiqarish,Kontragentlar & Balanslar,Sotib olish (Zakup),Sotish (Realizatsiya),MDM (Spravochniklar),Ish haqi",
            password_hash=hash_password("test0101"),
            is_active=True,
            is_archived=False
        ))
        db.commit()

    db.close()
    logger.info("Database initialized in 100% clean state.")

if __name__ == "__main__":
    seed_database()
    print("Database is completely clean and initialized.")
