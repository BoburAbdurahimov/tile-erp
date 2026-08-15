import unittest
from datetime import date
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    MDMMaterial, MDMCounterparty, Warehouse, StockItem,
    ProductionOrder, CashRegister, MonthClosing
)

client = TestClient(app)

class TestTileERP(unittest.TestCase):
    
    def test_01_mdm_materials_and_uniqueness(self):
        # 1. Fetch materials
        res = client.get("/api/mdm/materials", headers={"x-user-role": "Admin"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(len(data), 0)
        
        # 2. Try creating a duplicate product code
        existing_code = data[0]["code"]
        dup_res = client.post("/api/mdm/materials", json={
            "code": existing_code,
            "name": "Dublikat tovar",
            "category": "Siryo",
            "unit": "kg"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(dup_res.status_code, 400)
        self.assertIn("allaqachon mavjud", dup_res.json()["detail"])

    def test_02_mdm_counterparty_autonumbering(self):
        # Create new supplier -> code must be >= 10001
        res_sup = client.post("/api/mdm/counterparties", json={
            "name": "Test Postavshik MCHJ",
            "type": "supplier",
            "is_resident": True,
            "region": "Samarqand",
            "initial_balance_usd": -500.0
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(res_sup.status_code, 200)
        sup_data = res_sup.json()
        self.assertTrue(int(sup_data["code"]) >= 10000)

        # Create new client -> code must be >= 20001
        res_cli = client.post("/api/mdm/counterparties", json={
            "name": "Test Mijoz Savdo",
            "type": "client",
            "is_resident": True,
            "region": "Toshkent shahri",
            "initial_balance_usd": 1200.0
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(res_cli.status_code, 200)
        cli_data = res_cli.json()
        self.assertTrue(int(cli_data["code"]) >= 20000)

    def test_03_ombor_stock_and_admin_adjustment(self):
        # Stock balance view
        res = client.get("/api/ombor/stock", headers={"x-user-role": "Ish boshqaruvchi"})
        self.assertEqual(res.status_code, 200)
        stock = res.json()
        self.assertGreater(len(stock), 0)

        # Non-admin attempt to manually adjust stock -> must be 403
        adj_fail = client.post("/api/ombor/adjust-manual", json={
            "warehouse_id": 2,
            "material_id": stock[0]["material_id"],
            "new_quantity": 99999,
            "reason": "Ruxsatsiz test"
        }, headers={"x-user-role": "Ish boshqaruvchi"})
        self.assertEqual(adj_fail.status_code, 403)

        # Admin adjusts stock
        adj_ok = client.post("/api/ombor/adjust-manual", json={
            "warehouse_id": 2,
            "material_id": stock[0]["material_id"],
            "new_quantity": 35000,
            "reason": "Inventarizatsiya akti №14"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(adj_ok.status_code, 200)
        self.assertEqual(adj_ok.json()["status"], "success")

    def test_04_kassa_operations_and_cbu_rates(self):
        # Check cash registers
        res = client.get("/api/kassa/registers", headers={"x-user-role": "Admin"})
        self.assertEqual(res.status_code, 200)
        regs = res.json()
        self.assertEqual(len(regs), 2) # USD & UZS

        # Record Chiqim (Indirect Expense: Bilvosita xarajat)
        tx_res = client.post("/api/kassa/transactions", json={
            "register_id": 1, # USD
            "type": "chiqim",
            "amount": 250.0,
            "currency": "USD",
            "category": "bilvosita_xarajatlar",
            "date": str(date.today()),
            "description": "Sex nasoslar moyi va texnik xizmat"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(tx_res.status_code, 200)

    def test_05_production_order_and_storno(self):
        # Find raw materials and finished material
        db = SessionLocal()
        raw1 = db.query(MDMMaterial).filter(MDMMaterial.category == "Siryo").first()
        fin1 = db.query(MDMMaterial).filter(MDMMaterial.category == "Tayyor mahsulot").first()
        db.close()

        prod_res = client.post("/api/ishlab-chiqarish/orders", json={
            "line_id": 2,
            "output_material_id": fin1.id,
            "quantity": 500.0,
            "date": str(date.today()),
            "consumed_materials": [
                {"material_id": raw1.id, "warehouse_id": 2, "quantity": 1000.0}
            ],
            "notes": "Test ishlab chiqarish partiyasi"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(prod_res.status_code, 200)
        order_data = prod_res.json()
        order_id = order_data["id"]

        # Storno the production order
        storno_res = client.post(f"/api/ishlab-chiqarish/orders/{order_id}/storno", headers={"x-user-role": "Admin"})
        self.assertEqual(storno_res.status_code, 200)
        self.assertEqual(storno_res.json()["status"], "success")

    def test_06_purchases_sales_and_storno(self):
        db = SessionLocal()
        supplier = db.query(MDMCounterparty).filter(MDMCounterparty.type == "supplier").first()
        client_cp = db.query(MDMCounterparty).filter(MDMCounterparty.type == "client").first()
        raw_mat = db.query(MDMMaterial).filter(MDMMaterial.category == "Siryo").first()
        fin_mat = db.query(MDMMaterial).filter(MDMMaterial.category == "Tayyor mahsulot").first()
        db.close()

        # Create Purchase
        pur_res = client.post("/api/savdo/purchases", json={
            "supplier_id": supplier.id,
            "warehouse_id": 2,
            "date": str(date.today()),
            "currency": "USD",
            "items": [
                {"material_id": raw_mat.id, "quantity": 2000.0, "unit_price": 0.085}
            ],
            "description": "Yangi sement partiyasi"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(pur_res.status_code, 200)
        pur_id = pur_res.json()["id"]

        # Storno purchase
        storno_pur = client.post(f"/api/savdo/purchases/{pur_id}/storno", headers={"x-user-role": "Admin"})
        self.assertEqual(storno_pur.status_code, 200)

        # Create Sale
        sale_res = client.post("/api/savdo/sales", json={
            "client_id": client_cp.id,
            "warehouse_id": 1,
            "date": str(date.today()),
            "currency": "USD",
            "items": [
                {"material_id": fin_mat.id, "quantity": 200.0, "unit_price": 8.50}
            ],
            "description": "Marmar kafel sotuvi"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(sale_res.status_code, 200)
        sale_id = sale_res.json()["id"]

        # Storno sale
        storno_sale = client.post(f"/api/savdo/sales/{sale_id}/storno", headers={"x-user-role": "Admin"})
        self.assertEqual(storno_sale.status_code, 200)

    def test_07_finance_pnl_and_5_line_allocation(self):
        ym = date.today().strftime("%Y-%m")
        # Check PnL
        res = client.get(f"/api/moliya/pnl?year_month={ym}", headers={"x-user-role": "Direktor"})
        self.assertEqual(res.status_code, 200)
        pnl = res.json()
        self.assertIn("revenue_usd", pnl)
        self.assertIn("total_cogs_usd", pnl)
        self.assertIn("line_breakdown", pnl)
        self.assertEqual(len(pnl["line_breakdown"]), 5) # 5 Lines

    def test_08_month_end_closing_and_admin_reopen(self):
        ym = "2026-07" # Test previous month
        # Non-admin cannot close month
        res_fail = client.post("/api/moliya/month-closing/close", json={
            "year_month": ym, "notes": "Test close"
        }, headers={"x-user-role": "Ish boshqaruvchi"})
        self.assertEqual(res_fail.status_code, 403)

        # Admin closes month
        res_close = client.post("/api/moliya/month-closing/close", json={
            "year_month": ym, "notes": "Admin yopdi"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(res_close.status_code, 200)
        self.assertTrue(res_close.json()["is_closed"])

        # Try to post transaction in closed month -> must be blocked
        tx_block = client.post("/api/kassa/transactions", json={
            "register_id": 1,
            "type": "kirim",
            "amount": 100.0,
            "currency": "USD",
            "category": "boshqa",
            "date": "2026-07-15",
            "description": "Yopiq oyga operatsiya"
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(tx_block.status_code, 400)
        self.assertIn("yopilgan", tx_block.json()["detail"])

        # Admin re-opens month
        res_reopen = client.post("/api/moliya/month-closing/reopen", json={
            "year_month": ym
        }, headers={"x-user-role": "Admin"})
        self.assertEqual(res_reopen.status_code, 200)
        self.assertFalse(res_reopen.json()["is_closed"])

    def test_09_excel_export(self):
        res = client.get("/api/ombor/export/excel", headers={"x-user-role": "Admin"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

if __name__ == "__main__":
    unittest.main()
