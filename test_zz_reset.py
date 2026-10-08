"""'0 dan boshlash': every document goes, Kassa money and counterparties stay.

Named to run last: it empties the test database."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    User, Purchase, ProductionOrder, SkladOrder, SkladInventory, SkladMovement, StockItem,
    CashTransaction, CashRegister, MDMCounterparty, MDMMaterial, AutoSarfRule,
)
from backend.auth_utils import create_token
from backend.services import demo_seed
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def token(username, role):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, full_name=username, role=role, password_hash="x")
            db.add(u)
        u.role, u.is_active, u.is_archived = role, True, False
        db.commit()
        return {"Authorization": f"Bearer {create_token(u.id, u.username)}"}
    finally:
        db.close()


def count(model):
    db = SessionLocal()
    try:
        return db.query(model).count()
    finally:
        db.close()


class TestResetToZero(unittest.TestCase):

    def test_reset(self):
        demo_seed.run(demo_seed.make_caller(client), force=True)   # plenty of documents
        self.assertGreater(count(Purchase), 0)
        self.assertGreater(count(SkladOrder), 0)
        db = SessionLocal()
        balances = {r.name: round(r.balance, 2) for r in db.query(CashRegister).all()}
        cps = db.query(MDMCounterparty).count()
        mats = db.query(MDMMaterial).count()
        db.close()

        admin = token("t_reset_admin", "Admin")
        self.assertEqual(client.post("/api/demo/reset", json={"confirm": "TOZALASH"},
                                     headers=token("t_reset_kassir", "Kassir")).status_code, 403)
        self.assertEqual(client.post("/api/demo/reset", json={"confirm": "ha"}, headers=admin).status_code, 400)

        res = ok(client.post("/api/demo/reset", json={"confirm": "tozalash", "keep_norms": True}, headers=admin))
        self.assertEqual(res["kassa"], balances)                       # the money stays
        for model in (Purchase, ProductionOrder, SkladOrder, SkladInventory, SkladMovement, StockItem):
            self.assertEqual(count(model), 0, model.__name__)
        self.assertGreater(count(AutoSarfRule), 0)                     # kept on request

        db = SessionLocal()
        txs = db.query(CashTransaction).all()
        self.assertEqual(len(txs), sum(1 for b in balances.values() if b))   # one opening receipt each
        for t in txs:
            reg = db.query(CashRegister).get(t.register_id)
            self.assertAlmostEqual(t.amount, abs(reg.balance), places=2)
        self.assertEqual(db.query(MDMCounterparty).count(), cps)
        self.assertTrue(all((c.current_balance_usd or 0) == 0 for c in db.query(MDMCounterparty).all()))
        self.assertEqual(db.query(MDMMaterial).count(), mats)
        clay = db.query(MDMMaterial).filter(MDMMaterial.code == "RM-CLAY-01").first().id
        sup = db.query(MDMCounterparty).filter(MDMCounterparty.type == "supplier").first().id
        db.close()

        # Work starts again from zero: buy, produce, and the cost shows in Moliya.
        ok(client.post("/api/savdo/purchases", json={
            "supplier_id": sup, "warehouse_id": 2, "date": str(date.today()), "currency": "USD",
            "items": [{"material_id": clay, "quantity": 1000, "unit_price": 0.05}]}, headers=ADMIN))
        ok(client.post("/api/ishlab-chiqarish/orders", json={
            "out_sklad_id": 4, "out_code": 680, "quantity": 10, "date": str(date.today()),
            "consumed_materials": [{"material_id": clay, "warehouse_id": 2, "quantity": 200}]}, headers=ADMIN))
        pnl = ok(client.get(f"/api/moliya/pnl?year_month={date.today():%Y-%m}", headers=ADMIN))
        k100 = next(o for o in pnl["ombor_breakdown"] if o["sklad_id"] == 4)
        self.assertEqual(k100["production_volume"], 10)
        self.assertAlmostEqual(k100["direct_materials_cost_usd"], 10.0, places=2)   # 200 kg x $0.05
        self.assertAlmostEqual(k100["unit_cost_usd"], 1.0, places=4)

        # Norms go too unless kept.
        ok(client.post("/api/demo/reset", json={"confirm": "TOZALASH"}, headers=admin))
        self.assertEqual(count(AutoSarfRule), 0)


if __name__ == "__main__":
    unittest.main()
