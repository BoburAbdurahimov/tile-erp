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

    # 5. Default Users (Adminshox / test0101 & Boburjon)
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

    # 6. Default Job Types (Piecework Catalog)
    if not db.query(JobType).first():
        job_types = [
            JobType(name="Kafel saralash va navlash", unit_of_measure="m2", price_per_unit=500.0, is_active=True, created_by="Admin"),
            JobType(name="Pechga xom kafel ortish", unit_of_measure="taglik", price_per_unit=15000.0, is_active=True, created_by="Admin"),
            JobType(name="Gofrokartonga qadoqlash", unit_of_measure="quti", price_per_unit=800.0, is_active=True, created_by="Admin"),
            JobType(name="Glazur va emal sepish", unit_of_measure="m2", price_per_unit=450.0, is_active=True, created_by="Admin"),
            JobType(name="Xomashyo aralashtirish va maydalash", unit_of_measure="tonna", price_per_unit=25000.0, is_active=True, created_by="Admin"),
            JobType(name="Tayyor kafelni omborga tashish", unit_of_measure="taglik", price_per_unit=12000.0, is_active=True, created_by="Admin"),
        ]
        db.add_all(job_types)
        db.commit()

    # 7. Default Employees (6 Departments)
    if not db.query(Employee).first():
        employees = [
            # Ma'muriyat (Admin & Management & Warehouse Head)
            Employee(full_name="Qodirov Alisher", department="Ma'muriyat", employee_type="fixed", position="Bosh Texnolog / Usta", phone_number="+998901234501", monthly_salary=8500000.0, standard_work_days=26, hire_date=today - timedelta(days=90), is_active=True),
            Employee(full_name="Azizova Nargiza", department="Ma'muriyat", employee_type="fixed", position="Bosh Hisobchi", phone_number="+998901234504", monthly_salary=7000000.0, standard_work_days=26, hire_date=today - timedelta(days=120), is_active=True),
            Employee(full_name="Toirov Jasur", department="Ma'muriyat", employee_type="fixed", position="Ombor Mudiri", phone_number="+998901234503", monthly_salary=5000000.0, standard_work_days=26, hire_date=today - timedelta(days=45), is_active=True),
            
            # 1-Liniya (Formovka & Press)
            Employee(full_name="Karimov Dilshod", department="1-Liniya", employee_type="fixed", position="1-Liniya Katta Ustasi", phone_number="+998901234502", monthly_salary=6500000.0, standard_work_days=26, hire_date=today - timedelta(days=60), is_active=True),
            Employee(full_name="Nurmatov Ilhom", department="1-Liniya", employee_type="piecework", position="Press operatori", phone_number="+998912223344", monthly_salary=0.0, standard_work_days=26, hire_date=today - timedelta(days=35), is_active=True),
            
            # 2-Liniya (Glazurlash & Naqsh)
            Employee(full_name="Mirzayev Jamshid", department="2-Liniya", employee_type="piecework", position="Glazur sepuvchi", phone_number="+998908889900", monthly_salary=0.0, standard_work_days=26, hire_date=today - timedelta(days=50), is_active=True),

            # 3-Liniya (Pech & Kuydirish)
            Employee(full_name="Sultonov Bekzod", department="3-Liniya", employee_type="piecework", position="Pech yuklovchisi", phone_number="+998946663344", monthly_salary=0.0, standard_work_days=26, hire_date=today - timedelta(days=40), is_active=True),

            # 4-Liniya (Saralash & Sifat nazorati)
            Employee(full_name="Rustamov Otabek", department="4-Liniya", employee_type="piecework", position="Saralash ustasi", phone_number="+998935551122", monthly_salary=0.0, standard_work_days=26, hire_date=today - timedelta(days=30), is_active=True),

            # 5-Liniya (Qadoqlash & Yuklash)
            Employee(full_name="Yuldashev Farrux", department="5-Liniya", employee_type="piecework", position="Qadoqlovchi", phone_number="+998977775566", monthly_salary=0.0, standard_work_days=26, hire_date=today - timedelta(days=20), is_active=True),
        ]
        db.add_all(employees)
        db.commit()

    db.close()
    logger.info("System initial configuration verified.")

if __name__ == "__main__":
    seed_database()
    print("Clean database seeding completed.")
