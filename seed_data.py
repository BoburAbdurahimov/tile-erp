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
    
    # 1. Exchange Rate
    today = date.today()
    if not db.query(ExchangeRate).first():
        db.add(ExchangeRate(date=today, rate_usd_uzs=12850.0, is_manual_override=False))
        db.add(ExchangeRate(date=today - timedelta(days=7), rate_usd_uzs=12800.0, is_manual_override=False))
        db.add(ExchangeRate(date=today - timedelta(days=30), rate_usd_uzs=12750.0, is_manual_override=False))
        db.commit()

    # 2. Warehouses (3 Default system warehouses - UNTOUCHED)
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

    # 4. Cash Registers (2 Registers)
    if not db.query(CashRegister).first():
        cr1 = CashRegister(id=1, name="Kassa USD", currency="USD", balance=0.0, description="AQSH Dollari hisob-kitob kassasi")
        cr2 = CashRegister(id=2, name="Kassa UZS", currency="UZS", balance=0.0, description="O'zbekiston So'mi milliy valyuta kassasi")
        db.add_all([cr1, cr2])
        db.commit()

    # 5. Default Users (Adminshox & Boburjon)
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

    # 6. SEED 25 MATERIALS FOR MDM (10 Finished Goods - unit 'dona', 5 Spare Parts, 5 Auxiliary, 5 Raw Materials)
    if db.query(MDMMaterial).count() != 25:
        db.query(MDMMaterial).delete()
        db.commit()
        materials_list = [
            # 10 TA TAYYOR MAHSULOT (STRIKT DONA)
            MDMMaterial(code="Tile30-W", name="Kafel 30x30 Oq Matoviy", category="Tayyor mahsulot", unit="dona", min_stock=1000, current_avg_price_usd=3.0, current_avg_price_uzs=38500),
            MDMMaterial(code="Tile30-B", name="Kafel 30x30 Qora Glossy", category="Tayyor mahsulot", unit="dona", min_stock=1000, current_avg_price_usd=3.2, current_avg_price_uzs=41000),
            MDMMaterial(code="Tile45-M", name="Kafel 45x45 Mozaik Terracotta", category="Tayyor mahsulot", unit="dona", min_stock=800, current_avg_price_usd=4.5, current_avg_price_uzs=57800),
            MDMMaterial(code="Tile60-G", name="Granit 60x60 Mramor Bej", category="Tayyor mahsulot", unit="dona", min_stock=500, current_avg_price_usd=6.8, current_avg_price_uzs=87300),
            MDMMaterial(code="Tile60-S", name="Granit 60x60 Seriy Beton", category="Tayyor mahsulot", unit="dona", min_stock=500, current_avg_price_usd=6.5, current_avg_price_uzs=83500),
            MDMMaterial(code="Tile60-120", name="Keramogranit 60x120 Onyx Gold", category="Tayyor mahsulot", unit="dona", min_stock=300, current_avg_price_usd=14.0, current_avg_price_uzs=179900),
            MDMMaterial(code="Tile80-P", name="Keramogranit 80x80 Calacatta White", category="Tayyor mahsulot", unit="dona", min_stock=400, current_avg_price_usd=12.5, current_avg_price_uzs=160600),
            MDMMaterial(code="Tile20-40", name="Devor Kafeli 20x40 Glazurlangan Oq", category="Tayyor mahsulot", unit="dona", min_stock=1200, current_avg_price_usd=2.2, current_avg_price_uzs=28200),
            MDMMaterial(code="Tile30-60", name="Devor Kafeli 30x60 Relefli Karamel", category="Tayyor mahsulot", unit="dona", min_stock=800, current_avg_price_usd=5.0, current_avg_price_uzs=64250),
            MDMMaterial(code="Tile15-60", name="Kafel Parket 15x60 Derevo Dub", category="Tayyor mahsulot", unit="dona", min_stock=900, current_avg_price_usd=4.2, current_avg_price_uzs=53970),

            # 5 TA ZAPCHAST (Ehtiyot qismlar)
            MDMMaterial(code="SP-KILN-01", name="Konveyer roligi (keramik 2200mm)", category="Ehtiyot qismlar", unit="dona", min_stock=20, current_avg_price_usd=45.0, current_avg_price_uzs=578250),
            MDMMaterial(code="SP-PRESS-02", name="Gidravlik press porshen manjeti", category="Ehtiyot qismlar", unit="dona", min_stock=10, current_avg_price_usd=85.0, current_avg_price_uzs=1092250),
            MDMMaterial(code="SP-BURN-03", name="Gaz gorelka soplo (italiya)", category="Ehtiyot qismlar", unit="dona", min_stock=15, current_avg_price_usd=30.0, current_avg_price_uzs=385500),
            MDMMaterial(code="SP-MILL-04", name="Sharli tegirmon futovka plitasi", category="Ehtiyot qismlar", unit="dona", min_stock=50, current_avg_price_usd=25.0, current_avg_price_uzs=321250),
            MDMMaterial(code="SP-PUMP-05", name="Shlam nasosi parrak perchatkasi", category="Ehtiyot qismlar", unit="dona", min_stock=8, current_avg_price_usd=120.0, current_avg_price_uzs=1542000),

            # 5 TA YORDAMCHI MAHSULOT (Yordamchi materiallar)
            MDMMaterial(code="AUX-BOX-60", name="Gofrokarton quti (60x60 kafel uchun)", category="Yordamchi materiallar", unit="dona", min_stock=3000, current_avg_price_usd=0.40, current_avg_price_uzs=5140),
            MDMMaterial(code="AUX-PALLET", name="Yevro poddon yog'och (1200x800)", category="Yordamchi materiallar", unit="dona", min_stock=200, current_avg_price_usd=8.0, current_avg_price_uzs=102800),
            MDMMaterial(code="AUX-STRAP", name="Polipropilen o'rash lentasi (PET 16mm)", category="Yordamchi materiallar", unit="rulon", min_stock=30, current_avg_price_usd=35.0, current_avg_price_uzs=449750),
            MDMMaterial(code="AUX-FILM", name="Stretch plyonka qadoqlash (500mm)", category="Yordamchi materiallar", unit="rulon", min_stock=50, current_avg_price_usd=12.0, current_avg_price_uzs=154200),
            MDMMaterial(code="AUX-GLUE", name="Termo qadoq yelim xomashyosi", category="Yordamchi materiallar", unit="kg", min_stock=100, current_avg_price_usd=2.5, current_avg_price_uzs=32125),

            # 5 TA XOMASHYO (Xomashyo)
            MDMMaterial(code="RM-CLAY-01", name="Bentonit oq gil (Angren koni)", category="Xomashyo", unit="kg", min_stock=50000, current_avg_price_usd=0.04, current_avg_price_uzs=514),
            MDMMaterial(code="RM-FELD-02", name="Dala shpati (Feldspar ultra)", category="Xomashyo", unit="kg", min_stock=30000, current_avg_price_usd=0.07, current_avg_price_uzs=8995),
            MDMMaterial(code="RM-SAND-03", name="Kvars qumi boyitilgan", category="Xomashyo", unit="kg", min_stock=40000, current_avg_price_usd=0.03, current_avg_price_uzs=385),
            MDMMaterial(code="RM-GLAZE-04", name="Kafel glazur siri (Ispaniya)", category="Xomashyo", unit="kg", min_stock=2000, current_avg_price_usd=1.80, current_avg_price_uzs=23130),
            MDMMaterial(code="RM-PIGM-05", name="Keramik pigment boyoq (Italiya)", category="Xomashyo", unit="kg", min_stock=500, current_avg_price_usd=4.50, current_avg_price_uzs=57825)
        ]
        db.add_all(materials_list)
        db.commit()
        logger.info("Seeded 25 materials into MDM.")

    # 7. SEED 10 CLIENTS & 10 SUPPLIERS FOR MDM (3 Foreign Clients, 3 Foreign Suppliers)
    if db.query(MDMCounterparty).count() == 0:
        cps = [
            # --- 10 TA KLIYENT (7 Rezident, 3 Chet ellik) ---
            MDMCounterparty(code="20001", name="Qurilish Invest MCHJ", type="client", is_resident=True, region="Toshkent shahri", phone="+998901112233", address="Toshkent sh., Yunusobod t., 4-mavze", initial_balance_uzs=50000000.0, initial_balance_usd=0.0, current_balance_uzs=50000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="20002", name="Silk Road Building MCHJ", type="client", is_resident=True, region="Samarqand viloyati", phone="+998662223344", address="Samarqand sh., Registon ko'chasi 15", initial_balance_uzs=0.0, initial_balance_usd=12500.0, current_balance_uzs=0.0, current_balance_usd=12500.0),
            MDMCounterparty(code="20003", name="Valley Ceramics Trade XK", type="client", is_resident=True, region="Andijon viloyati", phone="+998743334455", address="Andijon sh., Amir Temur shoh ko'chasi 8", initial_balance_uzs=18500000.0, initial_balance_usd=0.0, current_balance_uzs=18500000.0, current_balance_usd=0.0),
            MDMCounterparty(code="20004", name="Buxoro Stroy Market YTT", type="client", is_resident=True, region="Buxoro viloyati", phone="+998654445566", address="Buxoro sh., Navoiy shoh ko'chasi 42", initial_balance_uzs=0.0, initial_balance_usd=4200.0, current_balance_uzs=0.0, current_balance_usd=4200.0),
            MDMCounterparty(code="20005", name="Asia Tile Distribution MCHJ", type="client", is_resident=True, region="Toshkent shahri", phone="+998975556677", address="Toshkent sh., Chilonzor t., 19-kvartal", initial_balance_uzs=95000000.0, initial_balance_usd=0.0, current_balance_uzs=95000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="20006", name="Chirchiq Obodon UK", type="client", is_resident=True, region="Toshkent viloyati", phone="+998706667788", address="Chirchiq sh., Sanoatzonasi 3", initial_balance_uzs=24000000.0, initial_balance_usd=0.0, current_balance_uzs=24000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="20007", name="Namangan Keramika MCHJ", type="client", is_resident=True, region="Namangan viloyati", phone="+998697778899", address="Namangan sh., Kosonsoy ko'chasi 11", initial_balance_uzs=0.0, initial_balance_usd=8900.0, current_balance_uzs=0.0, current_balance_usd=8900.0),
            # 3 TA CHET ELLIK KLIYENT
            MDMCounterparty(code="20008", name="KazStroyImport Ltd", type="client", is_resident=False, region="Qozog'iston (Chimkent)", phone="+77011234567", address="Chimkent sh., Tauke Khan ave. 88", initial_balance_uzs=0.0, initial_balance_usd=35000.0, current_balance_uzs=0.0, current_balance_usd=35000.0),
            MDMCounterparty(code="20009", name="Bishkek Tile House Co", type="client", is_resident=False, region="Qirg'iziston (Bishkek)", phone="+996312987654", address="Bishkek sh., Chuy prospect 120", initial_balance_uzs=0.0, initial_balance_usd=18400.0, current_balance_uzs=0.0, current_balance_usd=18400.0),
            MDMCounterparty(code="20010", name="Tajikistan Commerce Group", type="client", is_resident=False, region="Tojikiston (Dushanbe)", phone="+992935551122", address="Dushanbe sh., Rudaki ave. 45", initial_balance_uzs=0.0, initial_balance_usd=27500.0, current_balance_uzs=0.0, current_balance_usd=27500.0),

            # --- 10 TA POSTAVSHIK (7 Rezident, 3 Chet ellik) ---
            MDMCounterparty(code="10001", name="O'zkimyosanoat AJ", type="supplier", is_resident=True, region="Toshkent shahri", phone="+998712001122", address="Toshkent sh., Navoiy ko'chasi 38", initial_balance_uzs=-45000000.0, initial_balance_usd=0.0, current_balance_uzs=-45000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="10002", name="Kvars Koni MCHJ", type="supplier", is_resident=True, region="Navoiy viloyati", phone="+998793332211", address="Navoiy sh., Sanoat ko'chasi 1", initial_balance_uzs=0.0, initial_balance_usd=-8500.0, current_balance_uzs=0.0, current_balance_usd=-8500.0),
            MDMCounterparty(code="10003", name="Qizilqum Bentoni MCHJ", type="supplier", is_resident=True, region="Navoiy viloyati", phone="+998794445566", address="Zarafshon sh., Mustaqillik 12", initial_balance_uzs=-28500000.0, initial_balance_usd=0.0, current_balance_uzs=-28500000.0, current_balance_usd=0.0),
            MDMCounterparty(code="10004", name="Toshkent Pack Co MCHJ", type="supplier", is_resident=True, region="Toshkent viloyati", phone="+998905554433", address="Zangiota t., Eshonguzar", initial_balance_uzs=-14000000.0, initial_balance_usd=0.0, current_balance_uzs=-14000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="10005", name="O'zbekneftgaz Sanoat MCHJ", type="supplier", is_resident=True, region="Toshkent shahri", phone="+998712334455", address="Toshkent sh., Yakkasaroy t.", initial_balance_uzs=-62000000.0, initial_balance_usd=0.0, current_balance_uzs=-62000000.0, current_balance_usd=0.0),
            MDMCounterparty(code="10006", name="Samarqand Ehtiyot Qismlar MCHJ", type="supplier", is_resident=True, region="Samarqand viloyati", phone="+998664443322", address="Samarqand sh., Sanoat zona", initial_balance_uzs=0.0, initial_balance_usd=-3600.0, current_balance_uzs=0.0, current_balance_usd=-3600.0),
            MDMCounterparty(code="10007", name="Angren Gil Koni MCHJ", type="supplier", is_resident=True, region="Toshkent viloyati", phone="+998705556677", address="Angren sh., Konchilar ko'chasi 5", initial_balance_uzs=-33000000.0, initial_balance_usd=0.0, current_balance_uzs=-33000000.0, current_balance_usd=0.0),
            # 3 TA CHET ELLIK POSTAVSHIK
            MDMCounterparty(code="10008", name="Sacmi Impianti S.p.A.", type="supplier", is_resident=False, region="Italiya (Imola)", phone="+390542607111", address="Via Selice Provinciale 17/A, Imola, Italy", initial_balance_uzs=0.0, initial_balance_usd=-150000.0, current_balance_uzs=0.0, current_balance_usd=-150000.0),
            MDMCounterparty(code="10009", name="Colorobbia España S.A.", type="supplier", is_resident=False, region="Ispaniya (Castellón)", phone="+34964386000", address="Carretera Onda-Valencia km 2.5, Spain", initial_balance_uzs=0.0, initial_balance_usd=-42000.0, current_balance_uzs=0.0, current_balance_usd=-42000.0),
            MDMCounterparty(code="10010", name="Foshan Tile Machinery Corp", type="supplier", is_resident=False, region="Xitoy (Foshan)", phone="+8675783301122", address="Jihua 5th Road, Chancheng, Foshan, China", initial_balance_uzs=0.0, initial_balance_usd=-85000.0, current_balance_uzs=0.0, current_balance_usd=-85000.0)
        ]
        db.add_all(cps)
        db.commit()
        logger.info("Seeded 10 Clients & 10 Suppliers into MDM.")

    # 8. SEED 57 EMPLOYEES & HR SALARY DATA FOR ALL 6 DEPARTMENTS (5 IDENTICAL TILE FACTORY LINES + ADMIN)
    if db.query(Employee).count() < 50:
        db.query(WorkEntry).delete()
        db.query(AttendanceEntry).delete()
        db.query(MonthlySalaryCalculation).delete()
        db.query(JobType).delete()
        db.query(Employee).delete()
        db.commit()

        # A. Job Types (Ish turlari va narxlar)
        job_types = [
            JobType(name="Pressovka va Formovka (30x30)", unit_of_measure="dona", price_per_unit=15.0),
            JobType(name="Pressovka va Formovka (60x60)", unit_of_measure="dona", price_per_unit=25.0),
            JobType(name="Pressovka va Formovka (60x120)", unit_of_measure="dona", price_per_unit=45.0),
            JobType(name="Pressovka va Formovka (40x40)", unit_of_measure="dona", price_per_unit=20.0),
            JobType(name="Pressovka va Formovka (80x80)", unit_of_measure="dona", price_per_unit=50.0),
            JobType(name="Glazurlash va Linya Bo'yoq", unit_of_measure="dona", price_per_unit=12.0),
            JobType(name="Pechda Kuydirish Nazorati", unit_of_measure="dona", price_per_unit=10.0),
            JobType(name="Saralash va Sifat Nazorati", unit_of_measure="dona", price_per_unit=8.0),
            JobType(name="Qadoqlash va Poddon Yig'ish", unit_of_measure="poddon", price_per_unit=3500.0)
        ]
        db.add_all(job_types)
        db.commit()
        jt_map = {jt.name: jt for jt in db.query(JobType).all()}

        # B. 57 Employees
        raw_employees = [
            # --- Ma'muriyat & Ofis (7 xodim) ---
            ("Boburov Shaxzodbek", "Ma'muriyat", "Bosh Direktor", "fixed", 25000000.0),
            ("Abdurahimov Bobur", "Ma'muriyat", "Texnik Direktor", "fixed", 20000000.0),
            ("Ismoilova Feruza", "Ma'muriyat", "Bosh Buxgalter", "fixed", 18000000.0),
            ("Karimov Sardor", "Ma'muriyat", "Moliya Menejeri", "fixed", 15000000.0),
            ("Mirzayeva Malika", "Ma'muriyat", "HR va Xodimlar Menejeri", "fixed", 12000000.0),
            ("Narzullayev Otabek", "Ma'muriyat", "Sotuv Boshlig'i", "fixed", 14000000.0),
            ("Xoliqov Jasur", "Ma'muriyat", "IT va Tizim Admini", "fixed", 13000000.0),

            # --- 1-Liniya (30x30 Standart Zavod) (10 xodim) ---
            ("Axmedov Rustam", "1-Liniya", "Zavod Liniya Masteri", "fixed", 10000000.0),
            ("Yusupov Botir", "1-Liniya", "Press Operatori", "piecework", 0.0),
            ("Raximov Sherzod", "1-Liniya", "Press Operatori (Yordamchi)", "piecework", 0.0),
            ("Zokirov Anvar", "1-Liniya", "Glazur Master", "piecework", 0.0),
            ("Ergashev Umid", "1-Liniya", "Pech Operatori", "piecework", 0.0),
            ("Toshmatov Dilshod", "1-Liniya", "Kafel Saralovchi", "piecework", 0.0),
            ("Qodirov Baxodir", "1-Liniya", "Qadoqlovchi", "piecework", 0.0),
            ("Sulaymonov Alisher", "1-Liniya", "Karoxona Haydovchisi", "fixed", 6500000.0),
            ("Meliyev Javoxir", "1-Liniya", "Mexanik (Zapchastlar)", "fixed", 8000000.0),
            ("Umarov Sanjar", "1-Liniya", "Elektrik", "fixed", 7500000.0),

            # --- 2-Liniya (60x60 Katta Zavod) (10 xodim) ---
            ("Sobirov Farrux", "2-Liniya", "Zavod Liniya Masteri", "fixed", 10500000.0),
            ("Xamidov Abror", "2-Liniya", "Press Operatori", "piecework", 0.0),
            ("Botirov Jamshid", "2-Liniya", "Press Operatori (Yordamchi)", "piecework", 0.0),
            ("Nazarov Eldor", "2-Liniya", "Glazur Master", "piecework", 0.0),
            ("Usmonov Timur", "2-Liniya", "Pech Operatori", "piecework", 0.0),
            ("Jo'rayev Olim", "2-Liniya", "Kafel Saralovchi", "piecework", 0.0),
            ("Xakimov Nodir", "2-Liniya", "Qadoqlovchi", "piecework", 0.0),
            ("Ortiqov Shohrux", "2-Liniya", "Karoxona Haydovchisi", "fixed", 6500000.0),
            ("G'ofurov Bunyod", "2-Liniya", "Mexanik (Zapchastlar)", "fixed", 8000000.0),
            ("Bozorov Ilhom", "2-Liniya", "Elektrik", "fixed", 7500000.0),

            # --- 3-Liniya (60x120 Granit Zavod) (10 xodim) ---
            ("Oripov Akmal", "3-Liniya", "Zavod Liniya Masteri", "fixed", 11000000.0),
            ("Kamilov Bekzod", "3-Liniya", "Press Operatori", "piecework", 0.0),
            ("Raimov Azamat", "3-Liniya", "Press Operatori (Yordamchi)", "piecework", 0.0),
            ("Valiyev Sarvar", "3-Liniya", "Glazur Master", "piecework", 0.0),
            ("Xursandov Sherali", "3-Liniya", "Pech Operatori", "piecework", 0.0),
            ("Niyazov Farxod", "3-Liniya", "Kafel Saralovchi", "piecework", 0.0),
            ("Matniyazov Mansur", "3-Liniya", "Qadoqlovchi", "piecework", 0.0),
            ("Isroilov Zafar", "3-Liniya", "Karoxona Haydovchisi", "fixed", 6800000.0),
            ("Nurmamatov Xurshid", "3-Liniya", "Mexanik (Zapchastlar)", "fixed", 8500000.0),
            ("Turdiyev Shahram", "3-Liniya", "Elektrik", "fixed", 7800000.0),

            # --- 4-Liniya (40x40 Premium Zavod) (10 xodim) ---
            ("Davronov Jalol", "4-Liniya", "Zavod Liniya Masteri", "fixed", 10000000.0),
            ("Xolmatov Muzaffar", "4-Liniya", "Press Operatori", "piecework", 0.0),
            ("Mirzayev Otabek", "4-Liniya", "Press Operatori (Yordamchi)", "piecework", 0.0),
            ("Yoqubov Laziz", "4-Liniya", "Glazur Master", "piecework", 0.0),
            ("Shamsiyev Kamron", "4-Liniya", "Pech Operatori", "piecework", 0.0),
            ("Sotvoldiyev Ulug'bek", "4-Liniya", "Kafel Saralovchi", "piecework", 0.0),
            ("G'aniyev Ravshan", "4-Liniya", "Qadoqlovchi", "piecework", 0.0),
            ("Eshonqulov Xikmat", "4-Liniya", "Karoxona Haydovchisi", "fixed", 6500000.0),
            ("Vahobov Murod", "4-Liniya", "Mexanik (Zapchastlar)", "fixed", 8000000.0),
            ("Sultonov Jamol", "4-Liniya", "Elektrik", "fixed", 7500000.0),

            # --- 5-Liniya (80x80 Keramogranit Zavod) (10 xodim) ---
            ("Murodov Bobomurod", "5-Liniya", "Zavod Liniya Masteri", "fixed", 11500000.0),
            ("Norboyev Komil", "5-Liniya", "Press Operatori", "piecework", 0.0),
            ("Jumayev Rustam", "5-Liniya", "Press Operatori (Yordamchi)", "piecework", 0.0),
            ("Ro'ziyev Sardor", "5-Liniya", "Glazur Master", "piecework", 0.0),
            ("Xudoyberdiyev Elbek", "5-Liniya", "Pech Operatori", "piecework", 0.0),
            ("Yo'ldoshev Faxriddin", "5-Liniya", "Kafel Saralovchi", "piecework", 0.0),
            ("Allabergenov Doniyor", "5-Liniya", "Qadoqlovchi", "piecework", 0.0),
            ("Tangriberdiyev Oybek", "5-Liniya", "Karoxona Haydovchisi", "fixed", 6800000.0),
            ("Mamirov Shavkat", "5-Liniya", "Mexanik (Zapchastlar)", "fixed", 8500000.0),
            ("Xaitov Bahrom", "5-Liniya", "Elektrik", "fixed", 7800000.0)
        ]

        emp_objects = []
        for name, dept, pos, stype, msal in raw_employees:
            emp_objects.append(Employee(
                full_name=name,
                department=dept,
                position=pos,
                employee_type=stype,
                monthly_salary=msal,
                standard_work_days=26,
                hire_date=date(2026, 1, 1),
                is_active=True
            ))
        db.add_all(emp_objects)
        db.commit()
        logger.info(f"Seeded {len(emp_objects)} employees for all 6 departments.")

        # C. Generate Attendance and Daily Work Entries for 2026-08 and 2026-09
        from backend.services.salary_service import recalculate_all_salaries
        
        all_emps = db.query(Employee).all()
        job_press_30 = jt_map.get("Pressovka va Formovka (30x30)")
        job_press_60 = jt_map.get("Pressovka va Formovka (60x60)")
        job_press_120 = jt_map.get("Pressovka va Formovka (60x120)")
        job_press_40 = jt_map.get("Pressovka va Formovka (40x40)")
        job_press_80 = jt_map.get("Pressovka va Formovka (80x80)")
        job_glaze = jt_map.get("Glazurlash va Linya Bo'yoq")
        job_kiln = jt_map.get("Pechda Kuydirish Nazorati")
        job_sort = jt_map.get("Saralash va Sifat Nazorati")
        job_pack = jt_map.get("Qadoqlash va Poddon Yig'ish")

        dept_job_mapping = {
            "1-Liniya": (job_press_30, 800.0),
            "2-Liniya": (job_press_60, 600.0),
            "3-Liniya": (job_press_120, 350.0),
            "4-Liniya": (job_press_40, 700.0),
            "5-Liniya": (job_press_80, 300.0),
        }

        # Days to seed in 2026-08 (1 to 26)
        for day in range(1, 27):
            d_aug = date(2026, 8, day)
            d_sep = date(2026, 9, min(day, 2))
            
            for emp in all_emps:
                status = "absent" if (day in [7, 14, 21]) else "present"
                db.add(AttendanceEntry(employee_id=emp.id, date=d_aug, status=status, entered_by="Admin"))
                if day <= 2:
                    db.add(AttendanceEntry(employee_id=emp.id, date=d_sep, status="present", entered_by="Admin"))

                if emp.employee_type == "piecework" and status == "present" and emp.department in dept_job_mapping:
                    jtype, base_qty = dept_job_mapping[emp.department]
                    if jtype:
                        if "Press" in emp.position:
                            target_jt = jtype
                            qty = base_qty
                        elif "Glazur" in emp.position:
                            target_jt = job_glaze
                            qty = base_qty * 0.95
                        elif "Pech" in emp.position:
                            target_jt = job_kiln
                            qty = base_qty * 0.92
                        elif "Saral" in emp.position:
                            target_jt = job_sort
                            qty = base_qty * 0.90
                        else:
                            target_jt = job_pack
                            qty = round(base_qty / 40.0, 1)

                        amt = qty * target_jt.price_per_unit
                        db.add(WorkEntry(
                            employee_id=emp.id,
                            job_type_id=target_jt.id,
                            date=d_aug,
                            quantity=qty,
                            unit_price_snapshot=target_jt.price_per_unit,
                            total_amount=amt,
                            entered_by="Admin"
                        ))

        db.commit()

        # Recalculate monthly salaries for 2026-08 & 2026-09
        recalculate_all_salaries(db, "2026-08")
        recalculate_all_salaries(db, "2026-09")
        logger.info("Seeded 57 employees, attendance, work entries & calculated salaries for 2026-08 & 2026-09.")

    db.close()
    logger.info("Database initialized successfully.")

if __name__ == "__main__":
    seed_database()
    print("Database seeding completed.")
