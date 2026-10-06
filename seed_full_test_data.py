import logging
from datetime import date, datetime, timedelta
from backend.database import SessionLocal, create_tables
from backend.models import (
    Warehouse, MDMMaterial, MDMCounterparty, StockItem,
    CashRegister, CashTransaction, ProductionLine, ProductionOrder,
    ProductionConsumedMaterial, Purchase, PurchaseItem, Sale, SaleItem,
    ExchangeRate, User, Employee, JobType, AttendanceEntry, WorkEntry, MonthlySalaryCalculation
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_full_test_data")

def run():
    create_tables()
    db = SessionLocal()

    today = date.today()

    logger.info("1. Verifying Warehouses...")
    wh1 = db.query(Warehouse).filter(Warehouse.id == 1).first() or Warehouse(id=1, code="WH-01", name="Tayyor mahsulotlar", is_system_default=True, description="Tayyor ishlab chiqarilgan kafel plitalari ombori")
    wh2 = db.query(Warehouse).filter(Warehouse.id == 2).first() or Warehouse(id=2, code="WH-02", name="Ishlab chiqarish uchun materiallar", is_system_default=True, description="Asosiy xomashyo va komponentlar ombori")
    wh3 = db.query(Warehouse).filter(Warehouse.id == 3).first() or Warehouse(id=3, code="WH-03", name="Aralash ombor", is_system_default=True, description="Yordamchi materiallar, ehtiyot qismlar va qadoqlash ombori")
    db.add_all([wh1, wh2, wh3])
    db.commit()

    logger.info("2. Seeding / Updating 25 MDM Materials...")
    materials_def = [
        # --- 10 TAYYOR MAHSULOT ---
        {"code": "Tile30-W", "name": "Kafel 30x30 Oq Matoviy", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 1000, "price_usd": 3.0, "price_uzs": 38500, "wh_id": 1, "stock_qty": 12500.0},
        {"code": "Tile30-B", "name": "Kafel 30x30 Qora Glossy", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 1000, "price_usd": 3.2, "price_uzs": 41000, "wh_id": 1, "stock_qty": 8000.0},
        {"code": "Tile45-M", "name": "Kafel 45x45 Mozaik Terracotta", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 800, "price_usd": 4.5, "price_uzs": 57800, "wh_id": 1, "stock_qty": 6400.0},
        {"code": "Tile60-G", "name": "Granit 60x60 Mramor Bej", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 500, "price_usd": 6.8, "price_uzs": 87300, "wh_id": 1, "stock_qty": 5200.0},
        {"code": "Tile60-S", "name": "Granit 60x60 Seriy Beton", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 500, "price_usd": 6.5, "price_uzs": 83500, "wh_id": 1, "stock_qty": 4800.0},
        {"code": "Tile60-120", "name": "Keramogranit 60x120 Onyx Gold", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 300, "price_usd": 14.0, "price_uzs": 179900, "wh_id": 1, "stock_qty": 2100.0},
        {"code": "Tile80-P", "name": "Keramogranit 80x80 Calacatta White", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 400, "price_usd": 12.5, "price_uzs": 160600, "wh_id": 1, "stock_qty": 3400.0},
        {"code": "Tile20-40", "name": "Devor Kafeli 20x40 Glazurlangan Oq", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 1200, "price_usd": 2.2, "price_uzs": 28200, "wh_id": 1, "stock_qty": 15000.0},
        {"code": "Tile30-60", "name": "Devor Kafeli 30x60 Relefli Karamel", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 800, "price_usd": 5.0, "price_uzs": 64250, "wh_id": 1, "stock_qty": 7200.0},
        {"code": "Tile15-60", "name": "Kafel Parket 15x60 Derevo Dub", "category": "Tayyor mahsulot", "unit": "dona", "min_stock": 900, "price_usd": 4.2, "price_uzs": 53970, "wh_id": 1, "stock_qty": 6000.0},

        # --- 5 XOMASHYO ---
        {"code": "RM-CLAY-01", "name": "Bentonit oq gil (Angren koni)", "category": "Xomashyo", "unit": "kg", "min_stock": 50000, "price_usd": 0.04, "price_uzs": 514, "wh_id": 2, "stock_qty": 120000.0},
        {"code": "RM-FELD-02", "name": "Dala shpati (Feldspar ultra)", "category": "Xomashyo", "unit": "kg", "min_stock": 30000, "price_usd": 0.07, "price_uzs": 8995, "wh_id": 2, "stock_qty": 85000.0},
        {"code": "RM-SAND-03", "name": "Kvars qumi boyitilgan", "category": "Xomashyo", "unit": "kg", "min_stock": 40000, "price_usd": 0.03, "price_uzs": 385, "wh_id": 2, "stock_qty": 95000.0},
        {"code": "RM-GLAZE-04", "name": "Kafel glazur siri (Ispaniya)", "category": "Xomashyo", "unit": "kg", "min_stock": 2000, "price_usd": 1.80, "price_uzs": 23130, "wh_id": 2, "stock_qty": 8500.0},
        {"code": "RM-PIGM-05", "name": "Keramik pigment boyoq (Italiya)", "category": "Xomashyo", "unit": "kg", "min_stock": 500, "price_usd": 4.50, "price_uzs": 57825, "wh_id": 2, "stock_qty": 2400.0},

        # --- 5 YORDAMCHI MATERIAL ---
        {"code": "AUX-BOX-60", "name": "Gofrokarton quti (60x60 kafel uchun)", "category": "Yordamchi materiallar", "unit": "dona", "min_stock": 3000, "price_usd": 0.40, "price_uzs": 5140, "wh_id": 3, "stock_qty": 25000.0},
        {"code": "AUX-PALLET", "name": "Yevro poddon yog'och (1200x800)", "category": "Yordamchi materiallar", "unit": "dona", "min_stock": 200, "price_usd": 8.0, "price_uzs": 102800, "wh_id": 3, "stock_qty": 1800.0},
        {"code": "AUX-STRAP", "name": "Polipropilen o'rash lentasi (PET 16mm)", "category": "Yordamchi materiallar", "unit": "rulon", "min_stock": 30, "price_usd": 35.0, "price_uzs": 449750, "wh_id": 3, "stock_qty": 120.0},
        {"code": "AUX-FILM", "name": "Stretch plyonka qadoqlash (500mm)", "category": "Yordamchi materiallar", "unit": "rulon", "min_stock": 50, "price_usd": 12.0, "price_uzs": 154200, "wh_id": 3, "stock_qty": 250.0},
        {"code": "AUX-GLUE", "name": "Termo qadoq yelim xomashyosi", "category": "Yordamchi materiallar", "unit": "kg", "min_stock": 100, "price_usd": 2.5, "price_uzs": 32125, "wh_id": 3, "stock_qty": 800.0},

        # --- 5 EHTIYOT QISMLAR ---
        {"code": "SP-KILN-01", "name": "Konveyer roligi (keramik 2200mm)", "category": "Ehtiyot qismlar", "unit": "dona", "min_stock": 20, "price_usd": 45.0, "price_uzs": 578250, "wh_id": 3, "stock_qty": 150.0},
        {"code": "SP-PRESS-02", "name": "Gidravlik press porshen manjeti", "category": "Ehtiyot qismlar", "unit": "dona", "min_stock": 10, "price_usd": 85.0, "price_uzs": 1092250, "wh_id": 3, "stock_qty": 40.0},
        {"code": "SP-BURN-03", "name": "Gaz gorelka soplo (italiya)", "category": "Ehtiyot qismlar", "unit": "dona", "min_stock": 15, "price_usd": 30.0, "price_uzs": 385500, "wh_id": 3, "stock_qty": 60.0},
        {"code": "SP-MILL-04", "name": "Sharli tegirmon futovka plitasi", "category": "Ehtiyot qismlar", "unit": "dona", "min_stock": 50, "price_usd": 25.0, "price_uzs": 321250, "wh_id": 3, "stock_qty": 200.0},
        {"code": "SP-PUMP-05", "name": "Shlam nasosi parrak perchatkasi", "category": "Ehtiyot qismlar", "unit": "dona", "min_stock": 8, "price_usd": 120.0, "price_uzs": 1542000, "wh_id": 3, "stock_qty": 30.0},
    ]

    mat_map = {}
    for mdef in materials_def:
        mat = db.query(MDMMaterial).filter(MDMMaterial.code == mdef["code"]).first()
        if not mat:
            mat = MDMMaterial(
                code=mdef["code"],
                name=mdef["name"],
                category=mdef["category"],
                unit=mdef["unit"],
                min_stock=mdef["min_stock"],
                current_avg_price_usd=mdef["price_usd"],
                current_avg_price_uzs=mdef["price_uzs"],
                is_archived=False
            )
            db.add(mat)
            db.commit()
            db.refresh(mat)
        else:
            mat.name = mdef["name"]
            mat.category = mdef["category"]
            mat.unit = mdef["unit"]
            mat.min_stock = mdef["min_stock"]
            mat.current_avg_price_usd = mdef["price_usd"]
            mat.current_avg_price_uzs = mdef["price_uzs"]
            mat.is_archived = False
            db.commit()
        mat_map[mdef["code"]] = mat

        # Seed / Update StockItem
        stock = db.query(StockItem).filter(StockItem.warehouse_id == mdef["wh_id"], StockItem.material_id == mat.id).first()
        if not stock:
            stock = StockItem(
                warehouse_id=mdef["wh_id"],
                material_id=mat.id,
                quantity=mdef["stock_qty"]
            )
            db.add(stock)
        else:
            stock.quantity = mdef["stock_qty"]
        db.commit()

    logger.info("3. Seeding / Updating Counterparties (10 Clients & 10 Suppliers)...")
    cps_def = [
        # 10 KLIYENT
        {"code": "20001", "name": "Qurilish Invest MCHJ", "type": "client", "is_resident": True, "region": "Toshkent shahri", "phone": "+998901112233", "address": "Toshkent sh., Yunusobod t., 4-mavze", "bal_uzs": 50000000.0, "bal_usd": 0.0},
        {"code": "20002", "name": "Silk Road Building MCHJ", "type": "client", "is_resident": True, "region": "Samarqand viloyati", "phone": "+998662223344", "address": "Samarqand sh., Registon ko'chasi 15", "bal_uzs": 0.0, "bal_usd": 12500.0},
        {"code": "20003", "name": "Valley Ceramics Trade XK", "type": "client", "is_resident": True, "region": "Andijon viloyati", "phone": "+998743334455", "address": "Andijon sh., Amir Temur shoh ko'chasi 8", "bal_uzs": 18500000.0, "bal_usd": 0.0},
        {"code": "20004", "name": "Buxoro Stroy Market YTT", "type": "client", "is_resident": True, "region": "Buxoro viloyati", "phone": "+998654445566", "address": "Buxoro sh., Navoiy shoh ko'chasi 42", "bal_uzs": 0.0, "bal_usd": 4200.0},
        {"code": "20005", "name": "Asia Tile Distribution MCHJ", "type": "client", "is_resident": True, "region": "Toshkent shahri", "phone": "+998975556677", "address": "Toshkent sh., Chilonzor t., 19-kvartal", "bal_uzs": 95000000.0, "bal_usd": 0.0},
        {"code": "20006", "name": "Chirchiq Obodon UK", "type": "client", "is_resident": True, "region": "Toshkent viloyati", "phone": "+998706667788", "address": "Chirchiq sh., Sanoatzonasi 3", "bal_uzs": 24000000.0, "bal_usd": 0.0},
        {"code": "20007", "name": "Namangan Keramika MCHJ", "type": "client", "is_resident": True, "region": "Namangan viloyati", "phone": "+998697778899", "address": "Namangan sh., Kosonsoy ko'chasi 11", "bal_uzs": 0.0, "bal_usd": 8900.0},
        {"code": "20008", "name": "KazStroyImport Ltd", "type": "client", "is_resident": False, "region": "Qozog'iston (Chimkent)", "phone": "+77011234567", "address": "Chimkent sh., Tauke Khan ave. 88", "bal_uzs": 0.0, "bal_usd": 35000.0},
        {"code": "20009", "name": "Bishkek Tile House Co", "type": "client", "is_resident": False, "region": "Qirg'iziston (Bishkek)", "phone": "+996312987654", "address": "Bishkek sh., Chuy prospect 120", "bal_uzs": 0.0, "bal_usd": 18400.0},
        {"code": "20010", "name": "Tajikistan Commerce Group", "type": "client", "is_resident": False, "region": "Tojikiston (Dushanbe)", "phone": "+992935551122", "address": "Dushanbe sh., Rudaki ave. 45", "bal_uzs": 0.0, "bal_usd": 27500.0},

        # 10 POSTAVSHIK
        {"code": "10001", "name": "O'zkimyosanoat AJ", "type": "supplier", "is_resident": True, "region": "Toshkent shahri", "phone": "+998712001122", "address": "Toshkent sh., Navoiy ko'chasi 38", "bal_uzs": -45000000.0, "bal_usd": 0.0},
        {"code": "10002", "name": "Kvars Koni MCHJ", "type": "supplier", "is_resident": True, "region": "Navoiy viloyati", "phone": "+998793332211", "address": "Navoiy sh., Sanoat ko'chasi 1", "bal_uzs": 0.0, "bal_usd": -8500.0},
        {"code": "10003", "name": "Qizilqum Bentoni MCHJ", "type": "supplier", "is_resident": True, "region": "Navoiy viloyati", "phone": "+998794445566", "address": "Zarafshon sh., Mustaqillik 12", "bal_uzs": -28500000.0, "bal_usd": 0.0},
        {"code": "10004", "name": "Toshkent Pack Co MCHJ", "type": "supplier", "is_resident": True, "region": "Toshkent viloyati", "phone": "+998905554433", "address": "Zangiota t., Eshonguzar", "bal_uzs": -14000000.0, "bal_usd": 0.0},
        {"code": "10005", "name": "O'zbekneftgaz Sanoat MCHJ", "type": "supplier", "is_resident": True, "region": "Toshkent shahri", "phone": "+998712334455", "address": "Toshkent sh., Yakkasaroy t.", "bal_uzs": -62000000.0, "bal_usd": 0.0},
        {"code": "10006", "name": "Samarqand Ehtiyot Qismlar MCHJ", "type": "supplier", "is_resident": True, "region": "Samarqand viloyati", "phone": "+998664443322", "address": "Samarqand sh., Sanoat zona", "bal_uzs": 0.0, "bal_usd": -3600.0},
        {"code": "10007", "name": "Angren Gil Koni MCHJ", "type": "supplier", "is_resident": True, "region": "Toshkent viloyati", "phone": "+998705556677", "address": "Angren sh., Konchilar ko'chasi 5", "bal_uzs": -33000000.0, "bal_usd": 0.0},
        {"code": "10008", "name": "Sacmi Impianti S.p.A.", "type": "supplier", "is_resident": False, "region": "Italiya (Imola)", "phone": "+390542607111", "address": "Via Selice Provinciale 17/A, Imola, Italy", "bal_uzs": 0.0, "bal_usd": -150000.0},
        {"code": "10009", "name": "Colorobbia España S.A.", "type": "supplier", "is_resident": False, "region": "Ispaniya (Castellón)", "phone": "+34964386000", "address": "Carretera Onda-Valencia km 2.5, Spain", "bal_uzs": 0.0, "bal_usd": -42000.0},
        {"code": "10010", "name": "Foshan Tile Machinery Corp", "type": "supplier", "is_resident": False, "region": "Xitoy (Foshan)", "phone": "+8675783301122", "address": "Jihua 5th Road, Chancheng, Foshan, China", "bal_uzs": 0.0, "bal_usd": -85000.0},
    ]

    for cpdef in cps_def:
        cp = db.query(MDMCounterparty).filter(MDMCounterparty.code == cpdef["code"]).first()
        if not cp:
            cp = MDMCounterparty(
                code=cpdef["code"],
                name=cpdef["name"],
                type=cpdef["type"],
                is_resident=cpdef["is_resident"],
                region=cpdef["region"],
                phone=cpdef["phone"],
                address=cpdef["address"],
                initial_balance_uzs=cpdef["bal_uzs"],
                initial_balance_usd=cpdef["bal_usd"],
                current_balance_uzs=cpdef["bal_uzs"],
                current_balance_usd=cpdef["bal_usd"],
                is_archived=False
            )
            db.add(cp)
        else:
            cp.name = cpdef["name"]
            cp.type = cpdef["type"]
            cp.is_resident = cpdef["is_resident"]
            cp.region = cpdef["region"]
            cp.phone = cpdef["phone"]
            cp.address = cpdef["address"]
            cp.current_balance_uzs = cpdef["bal_uzs"]
            cp.current_balance_usd = cpdef["bal_usd"]
            cp.is_archived = False
        db.commit()

    logger.info("4. Seeding Cash Registers balances for testing...")
    cr1 = db.query(CashRegister).filter(CashRegister.id == 1).first()
    if cr1: cr1.balance = 250000.0 # $250k
    cr2 = db.query(CashRegister).filter(CashRegister.id == 2).first()
    if cr2: cr2.balance = 850000000.0 # 850 mln UZS
    cr3 = db.query(CashRegister).filter(CashRegister.id == 3).first()
    if cr3: cr3.balance = 320000000.0 # 320 mln UZS
    db.commit()

    logger.info("Successfully seeded complete test data!")

if __name__ == "__main__":
    run()
