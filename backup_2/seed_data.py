import logging
from datetime import date, timedelta
from backend.database import SessionLocal, create_tables
from backend.models import (
    Warehouse, MDMMaterial, MDMCounterparty, StockItem,
    CashRegister, CashTransaction, ProductionLine, ProductionOrder,
    ProductionConsumedMaterial, Purchase, PurchaseItem, Sale, SaleItem,
    ExchangeRate, User
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

    # 2. Warehouses (3 Default)
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
        cr1 = CashRegister(id=1, name="Kassa USD", currency="USD", balance=48500.0, description="AQSH Dollari hisob-kitob kassasi")
        cr2 = CashRegister(id=2, name="Kassa UZS", currency="UZS", balance=420000000.0, description="O'zbekiston So'mi milliy valyuta kassasi")
        db.add_all([cr1, cr2])
        db.commit()

    # 5. MDM Materials (Raw materials & Finished goods)
    if not db.query(MDMMaterial).first():
        materials = [
            # Raw materials (Siryo / Xomashyo)
            MDMMaterial(code="Smt60", name="Siment 60%", category="Siryo", unit="kg", min_stock=5000.0, current_avg_price_usd=0.08, current_avg_price_uzs=1028.0),
            MDMMaterial(code="Qum01", name="Kvarsli Qum", category="Siryo", unit="kg", min_stock=10000.0, current_avg_price_usd=0.03, current_avg_price_uzs=385.5),
            MDMMaterial(code="Kao01", name="Kaolin loyi", category="Siryo", unit="kg", min_stock=8000.0, current_avg_price_usd=0.05, current_avg_price_uzs=642.5),
            MDMMaterial(code="Fld01", name="Dala shpati (Feldspar)", category="Siryo", unit="kg", min_stock=6000.0, current_avg_price_usd=0.07, current_avg_price_uzs=899.5),
            MDMMaterial(code="Glz01", name="Kafel emali (Glazur)", category="Siryo", unit="kg", min_stock=2000.0, current_avg_price_usd=0.85, current_avg_price_uzs=10922.5),
            MDMMaterial(code="Pgm01", name="Italiya rangli pigment", category="Siryo", unit="kg", min_stock=500.0, current_avg_price_usd=4.50, current_avg_price_uzs=57825.0),
            MDMMaterial(code="Blt01", name="Konveyer tishli tasma", category="Ehtiyot qism", unit="dona", min_stock=10.0, current_avg_price_usd=45.0, current_avg_price_uzs=578250.0),
            MDMMaterial(code="Box01", name="Gofrokarton quti (60x60)", category="Yordamchi", unit="dona", min_stock=3000.0, current_avg_price_usd=0.40, current_avg_price_uzs=5140.0),
            
            # Finished Tiles (Tayyor mahsulotlar)
            MDMMaterial(code="Tile30", name="Kafel 30x30 Oq Matoviy", category="Tayyor mahsulot", unit="m2", min_stock=1000.0, current_avg_price_usd=3.20, current_avg_price_uzs=41120.0),
            MDMMaterial(code="Tile60", name="Kafel 60x60 Oq Marmar Glyanets", category="Tayyor mahsulot", unit="m2", min_stock=1500.0, current_avg_price_usd=5.40, current_avg_price_uzs=69390.0),
            MDMMaterial(code="Tile120", name="Kafel 60x120 Qora Granit", category="Tayyor mahsulot", unit="m2", min_stock=800.0, current_avg_price_usd=8.90, current_avg_price_uzs=114365.0),
            MDMMaterial(code="Tile80", name="Kafel 80x80 Royal Bej", category="Tayyor mahsulot", unit="m2", min_stock=600.0, current_avg_price_usd=7.80, current_avg_price_uzs=100230.0),
            MDMMaterial(code="Tile45", name="Kafel 45x45 Terracotta Mozaik", category="Tayyor mahsulot", unit="m2", min_stock=500.0, current_avg_price_usd=4.10, current_avg_price_uzs=52685.0),
        ]
        db.add_all(materials)
        db.commit()

    # 6. Counterparties (Suppliers 10001+, Clients 20001+)
    if not db.query(MDMCounterparty).first():
        cps = [
            # Suppliers (Postavshiklar)
            MDMCounterparty(code="10001", name="Bekobod Sement Zavodi AJ", type="supplier", is_resident=True, region="Toshkent viloyati", phone="+998901112233", initial_balance_usd=-2500.0, current_balance_usd=-2500.0),
            MDMCounterparty(code="10002", name="Navoiy Kimyo Kvars MCHJ", type="supplier", is_resident=True, region="Navoiy", phone="+998934445566", initial_balance_usd=-1200.0, current_balance_usd=-1200.0),
            MDMCounterparty(code="10003", name="Colorobbia Italia S.p.A", type="supplier", is_resident=False, region="Toshkent shahri", phone="+3905717091", initial_balance_usd=-8500.0, current_balance_usd=-8500.0),
            
            # Clients (Mijozlar)
            MDMCounterparty(code="20001", name="Samarqand City Stroy MCHJ", type="client", is_resident=True, region="Samarqand", phone="+998912223344", initial_balance_usd=8400.0, current_balance_usd=8400.0),
            MDMCounterparty(code="20002", name="Toshkent Qurilish Invest", type="client", is_resident=True, region="Toshkent shahri", phone="+998971110022", initial_balance_usd=14200.0, current_balance_usd=14200.0),
            MDMCounterparty(code="20003", name="Farg'ona Kafel Baza", type="client", is_resident=True, region="Farg'ona", phone="+998905557788", initial_balance_usd=5600.0, current_balance_usd=5600.0),
        ]
        db.add_all(cps)
        db.commit()

    # 7. Stock Items in Warehouses
    if not db.query(StockItem).first():
        mats = {m.code: m for m in db.query(MDMMaterial).all()}
        stock_data = [
            # Raw materials in Warehouse 2 (Ishlab chiqarish uchun materiallar)
            (2, mats["Smt60"].id, 28000.0, 0.08, 1028.0),
            (2, mats["Qum01"].id, 45000.0, 0.03, 385.5),
            (2, mats["Kao01"].id, 18000.0, 0.05, 642.5),
            (2, mats["Fld01"].id, 14000.0, 0.07, 899.5),
            (2, mats["Glz01"].id, 3500.0, 0.85, 10922.5),
            (2, mats["Pgm01"].id, 620.0, 4.50, 57825.0),
            
            # Auxiliaries in Warehouse 3 (Aralash ombor)
            (3, mats["Blt01"].id, 24.0, 45.0, 578250.0),
            (3, mats["Box01"].id, 8500.0, 0.40, 5140.0),
            
            # Finished Tiles in Warehouse 1 (Tayyor mahsulotlar)
            (1, mats["Tile30"].id, 3200.0, 3.20, 41120.0),
            (1, mats["Tile60"].id, 4800.0, 5.40, 69390.0),
            (1, mats["Tile120"].id, 1900.0, 8.90, 114365.0),
            (1, mats["Tile80"].id, 1400.0, 7.80, 100230.0),
            (1, mats["Tile45"].id, 1100.0, 4.10, 52685.0),
        ]
        for wh_id, mat_id, qty, avg_u, avg_z in stock_data:
            db.add(StockItem(warehouse_id=wh_id, material_id=mat_id, quantity=qty, avg_cost_usd=avg_u, avg_cost_uzs=avg_z))
        db.commit()

    # 8. Sample Cash Transactions for Indirect & Administrative Expenses
    if not db.query(CashTransaction).first():
        sample_txs = [
            # Indirect Manufacturing Costs (Bilvosita xarajatlar)
            CashTransaction(register_id=2, type="chiqim", source_type="other", amount=24000000.0, currency="UZS", category="bilvosita_xarajatlar", date=today - timedelta(days=5), description="Zavod elektr energiyasi to'lovi (Gaz/Svet)"),
            CashTransaction(register_id=2, type="chiqim", source_type="other", amount=18000000.0, currency="UZS", category="bilvosita_xarajatlar", date=today - timedelta(days=10), description="Tsex ishchilari va ustalari oylik maoshi"),
            CashTransaction(register_id=1, type="chiqim", source_type="other", amount=1500.0, currency="USD", category="bilvosita_xarajatlar", date=today - timedelta(days=12), description="Zavod binosi va ombor ijara to'lovi"),
            CashTransaction(register_id=2, type="chiqim", source_type="other", amount=6500000.0, currency="UZS", category="bilvosita_xarajatlar", date=today - timedelta(days=3), description="Texnologik liniyalarga texnik xizmat ko'rsatish"),
            
            # Administrative Costs (Admin va Prochee)
            CashTransaction(register_id=2, type="chiqim", source_type="other", amount=4500000.0, currency="UZS", category="admin_prochee", date=today - timedelta(days=7), description="Ofis xarajatlari, kantselyariya va aloqa"),
            CashTransaction(register_id=1, type="chiqim", source_type="other", amount=800.0, currency="USD", category="admin_prochee", date=today - timedelta(days=14), description="Buxgalteriya va yuridik xizmatlar"),
            
            # Client payments (Kirim)
            CashTransaction(register_id=1, type="kirim", source_type="client", counterparty_id=1, amount=6000.0, currency="USD", category="mijoz_tolovi", date=today - timedelta(days=2), description="Samarqand City Stroy kafel to'lovi"),
            CashTransaction(register_id=2, type="kirim", source_type="client", counterparty_id=2, amount=85000000.0, currency="UZS", category="mijoz_tolovi", date=today - timedelta(days=4), description="Toshkent Qurilish Invest 60x60 to'lovi"),
        ]
        db.add_all(sample_txs)
        db.commit()

    # 9. Sample Production Orders for the 5 Lines
    if not db.query(ProductionOrder).first():
        mats = {m.code: m for m in db.query(MDMMaterial).all()}
        orders_data = [
            (1, mats["Tile30"].id, 1200.0, today - timedelta(days=6), 2500.0),
            (2, mats["Tile60"].id, 1600.0, today - timedelta(days=5), 4800.0),
            (3, mats["Tile120"].id, 950.0, today - timedelta(days=4), 4500.0),
            (4, mats["Tile80"].id, 850.0, today - timedelta(days=3), 3900.0),
            (5, mats["Tile45"].id, 1100.0, today - timedelta(days=2), 2700.0),
            (2, mats["Tile60"].id, 1400.0, today - timedelta(days=1), 4200.0),
            (1, mats["Tile30"].id, 1000.0, today, 2100.0),
        ]
        for idx, (lid, out_mid, qty, o_date, d_cost) in enumerate(orders_data, start=1):
            ord_obj = ProductionOrder(
                order_number=f"PRD-{o_date.strftime('%Y%m%d')}-{idx:04d}",
                line_id=lid,
                output_material_id=out_mid,
                quantity=qty,
                date=o_date,
                status="Tasdiqlandi",
                direct_cost_usd=d_cost,
                allocated_indirect_cost_usd=0.0,
                total_cost_usd=d_cost,
                unit_cost_usd=d_cost / qty,
                notes=f"Liniya {lid} smenasi muvaffaqiyatli topshirildi"
            )
            db.add(ord_obj)
            db.flush()
            # Add consumed materials
            db.add(ProductionConsumedMaterial(
                production_order_id=ord_obj.id,
                material_id=mats["Smt60"].id,
                warehouse_id=2,
                quantity=qty * 12.0,
                unit_cost_usd=0.08,
                total_cost_usd=qty * 12.0 * 0.08
            ))
            db.add(ProductionConsumedMaterial(
                production_order_id=ord_obj.id,
                material_id=mats["Qum01"].id,
                warehouse_id=2,
                quantity=qty * 25.0,
                unit_cost_usd=0.03,
                total_cost_usd=qty * 25.0 * 0.03
            ))
        db.commit()

    # 10. Sample Sales
    if not db.query(Sale).first():
        mats = {m.code: m for m in db.query(MDMMaterial).all()}
        s1 = Sale(
            sale_number="SAL-20260810-0001",
            client_id=1,
            warehouse_id=1,
            date=today - timedelta(days=3),
            currency="USD",
            total_amount=16200.0,
            status="Tasdiqlandi",
            description="Samarqand City Stroy 60x60 marmar kafel sotuvi"
        )
        db.add(s1)
        db.flush()
        db.add(SaleItem(sale_id=s1.id, material_id=mats["Tile60"].id, quantity=2000.0, unit_price=8.10, total_price=16200.0, currency="USD"))
        
        s2 = Sale(
            sale_number="SAL-20260812-0002",
            client_id=2,
            warehouse_id=1,
            date=today - timedelta(days=1),
            currency="USD",
            total_amount=17800.0,
            status="Tasdiqlandi",
            description="Toshkent Qurilish Invest 60x120 granit kafel sotuvi"
        )
        db.add(s2)
        db.flush()
        db.add(SaleItem(sale_id=s2.id, material_id=mats["Tile120"].id, quantity=1400.0, unit_price=12.71, total_price=17800.0, currency="USD"))
        db.commit()

    db.close()
    logger.info("Seed data successfully inserted into database.")

if __name__ == "__main__":
    seed_database()
    print("Database seeding completed.")
