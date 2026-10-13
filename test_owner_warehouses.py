"""Xomashyo and aralash belong to an Ombor owner, like the tiles: a user tied
to Toxir buys into Toxir's warehouses without choosing, produces from Toxir's
raw materials, issues spare parts from Toxir's aralash, and sees only those."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import User, StockItem
from backend.auth_utils import create_token
from backend.api.auth import get_current_user_role, get_current_username, get_ombor_scope
from backend.services import material_warehouses as mw
from backend.services.cost_allocation_service import calculate_monthly_production_cost_allocation
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
TODAY = date.today()


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def login_as(username, role, sklads=None):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, full_name=username, role=role, password_hash="x")
            db.add(u)
        u.role, u.is_active, u.is_archived = role, True, False
        u.ombor_sklads = sklads
        db.commit()
        return {"Authorization": f"Bearer {create_token(u.id, u.username)}"}
    finally:
        db.close()


def wh(owner, kind):
    db = SessionLocal()
    try:
        return mw.warehouse_id(db, owner, kind)
    finally:
        db.close()


def stock(warehouse_id, material_id):
    db = SessionLocal()
    try:
        row = db.query(StockItem).filter(StockItem.warehouse_id == warehouse_id,
                                         StockItem.material_id == material_id).first()
        return row.quantity if row else 0
    finally:
        db.close()


class TestOwnerWarehouses(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.saved = {d: app.dependency_overrides.pop(d, None)
                     for d in (get_current_user_role, get_current_username, get_ombor_scope)}
        cls.admin = login_as("t_ow_admin", "Admin")
        cls.tohir = login_as("t_ow_tohir", "Ombor,Ishlab chiqarish,Sotib olish (Zakup)", "1,2")
        cls.sup = ok(client.post("/api/mdm/counterparties", headers=cls.admin,
                                 json={"name": "Ombor Egasi Test MCHJ", "type": "supplier"}))
        cls.clay = ok(client.post("/api/mdm/materials", headers=cls.admin, json={
            "code": "OW-LOY", "name": "Egasi test loy", "category": "Xomashyo", "unit": "kg", "min_stock": 0}))
        cls.part = ok(client.post("/api/mdm/materials", headers=cls.admin, json={
            "code": "OW-POD", "name": "Egasi test podshipnik", "category": "Ehtiyot qism", "unit": "dona", "min_stock": 0}))
        ok(client.put(f"/api/mdm/counterparties/{cls.sup['id']}/prices", headers=cls.admin, json=[
            {"material_id": cls.clay["id"], "price": 1000}, {"material_id": cls.part["id"], "price": 50000}]))

    @classmethod
    def tearDownClass(cls):
        for d, fn in cls.saved.items():
            if fn:
                app.dependency_overrides[d] = fn

    def buy(self, who, items, **extra):
        return client.post("/api/savdo/purchases", headers=who, json={
            "supplier_id": self.sup["id"], "date": str(TODAY), "items": items, **extra})

    def test_every_ombor_has_its_own_pair(self):
        db = SessionLocal()
        try:
            ids = {(o, k): mw.warehouse_id(db, o, k) for o in mw.OWNERS for k in mw.KINDS}
        finally:
            db.close()
        self.assertEqual(len(set(ids.values())), 8)
        mine = ok(client.get("/api/ombor/warehouses", headers=self.tohir))
        self.assertEqual(mine["owners"], ["Toxir"])
        self.assertEqual([w["name"] for w in mine["warehouses"]], ["Toxir xomashyo", "Toxir aralash"])
        everything = ok(client.get("/api/ombor/warehouses", headers=self.admin))
        self.assertEqual(everything["owners"], ["Toxir", "Kodir", "Istam", "Aziz"])
        self.assertEqual(len(everything["warehouses"]), 10)             # 8 + the old shared two

    def test_tohir_buys_into_toxir_without_choosing(self):
        clay0 = stock(wh("Toxir", mw.XOMASHYO), self.clay["id"])
        pur = ok(self.buy(self.tohir, [{"material_id": self.clay["id"], "quantity": 300}]))
        self.assertEqual((pur["ombor"], pur["warehouse_id"]), ("Toxir", wh("Toxir", mw.XOMASHYO)))
        self.assertEqual(stock(wh("Toxir", mw.XOMASHYO), self.clay["id"]) - clay0, 300)
        part = ok(self.buy(self.tohir, [{"material_id": self.part["id"], "quantity": 2}]))
        self.assertEqual(part["warehouse_id"], wh("Toxir", mw.ARALASH))   # spare parts -> Toxir aralash

        self.assertEqual(self.buy(self.tohir, [{"material_id": self.clay["id"], "quantity": 1}], ombor="Kodir").status_code, 403)
        self.assertEqual(self.buy(self.tohir, [{"material_id": self.clay["id"], "quantity": 1}],
                                  warehouse_id=wh("Kodir", mw.XOMASHYO)).status_code, 403)
        # An Admin says which Ombor it is for
        self.assertEqual(self.buy(self.admin, [{"material_id": self.clay["id"], "quantity": 1}]).status_code, 400)
        kodir = ok(self.buy(self.admin, [{"material_id": self.clay["id"], "quantity": 50}], ombor="Kodir"))
        self.assertEqual(kodir["warehouse_id"], wh("Kodir", mw.XOMASHYO))

        mine = [p["id"] for p in ok(client.get("/api/savdo/purchases", headers=self.tohir))]
        self.assertIn(pur["id"], mine)
        self.assertNotIn(kodir["id"], mine)
        self.assertEqual(client.post(f"/api/savdo/purchases/{kodir['id']}/storno",
                                     headers=login_as("t_ow_tohir2", "Sotib olish (Zakup),Storno", "1,2")).status_code, 403)

    def test_production_and_spare_parts_use_the_ombors_own(self):
        ok(self.buy(self.tohir, [{"material_id": self.clay["id"], "quantity": 200}]))
        ok(self.buy(self.tohir, [{"material_id": self.part["id"], "quantity": 3}]))
        xom, arl = wh("Toxir", mw.XOMASHYO), wh("Toxir", mw.ARALASH)
        clay0, part0 = stock(xom, self.clay["id"]), stock(arl, self.part["id"])

        prod = ok(client.post("/api/ishlab-chiqarish/orders", headers=self.tohir, json={
            "out_sklad_id": 2, "out_code": 680, "quantity": 10,
            "consumed_materials": [{"material_id": self.clay["id"], "quantity": 40}]}))
        self.assertEqual(clay0 - stock(xom, self.clay["id"]), 40)
        self.assertEqual(prod["consumed_materials"][0]["warehouse_id"], xom)
        # Kodir's production cannot use Toxir's clay
        res = client.post("/api/ishlab-chiqarish/orders", headers=self.admin, json={
            "out_sklad_id": 3, "out_code": 680, "quantity": 1,
            "consumed_materials": [{"material_id": self.clay["id"], "quantity": 999999}]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Kodir xomashyo", res.json()["detail"])

        def equipment():
            db = SessionLocal()
            try:
                rows = calculate_monthly_production_cost_allocation(db, f"{TODAY:%Y-%m}")["ombors"]
                return {r["sklad_id"]: r["equipment_expenses_usd"] for r in rows}
            finally:
                db.close()
        before = equipment()
        le = ok(client.post("/api/ishlab-chiqarish/line-expenses", headers=self.tohir, json={
            "items": [{"material_id": self.part["id"], "quantity": 1}], "notes": "test"}))
        # Toxir's spare parts are costed on Toxir's production only
        grew = {s: round(v - before.get(s, 0.0), 2) for s, v in equipment().items() if round(v - before.get(s, 0.0), 2)}
        self.assertTrue(grew and set(grew) <= {1, 2}, grew)
        self.assertAlmostEqual(sum(grew.values()), le["total_cost_usd"], delta=0.02)
        self.assertEqual((le["warehouse_id"], le["warehouse_name"]), (arl, "Toxir aralash"))
        self.assertEqual(part0 - stock(arl, self.part["id"]), 1)
        self.assertEqual(client.post("/api/ishlab-chiqarish/line-expenses", headers=self.tohir, json={
            "items": [{"material_id": self.part["id"], "quantity": 1}], "ombor": "Aziz"}).status_code, 403)
        self.assertIn(le["id"], [e["id"] for e in ok(client.get("/api/ishlab-chiqarish/line-expenses", headers=self.tohir))])


        storno = login_as("t_ow_tohir3", "Ishlab chiqarish,Storno", "1,2")
        ok(client.post(f"/api/ishlab-chiqarish/line-expenses/{le['id']}/storno", headers=storno))
        self.assertEqual(part0 - stock(arl, self.part["id"]), 0)          # back into Toxir aralash
        ok(client.post(f"/api/ishlab-chiqarish/orders/{prod['id']}/storno", headers=storno))

    def test_xomashyo_ombori_page_is_scoped(self):
        ok(self.buy(self.admin, [{"material_id": self.clay["id"], "quantity": 5}], ombor="Aziz"))
        ok(self.buy(self.tohir, [{"material_id": self.clay["id"], "quantity": 5}]))
        seen = {s["warehouse_name"] for s in ok(client.get("/api/ombor/stock", headers=self.tohir))}
        self.assertTrue(seen and seen <= {"Toxir xomashyo", "Toxir aralash"}, seen)
        self.assertIn("Aziz xomashyo", {s["warehouse_name"] for s in ok(client.get("/api/ombor/stock", headers=self.admin))})
        move = {"from_warehouse_id": wh("Aziz", mw.XOMASHYO), "to_warehouse_id": wh("Toxir", mw.XOMASHYO),
                "material_id": self.clay["id"], "quantity": 1}
        self.assertEqual(client.post("/api/ombor/transfer", headers=self.tohir, json=move).status_code, 403)
        ok(client.post("/api/ombor/transfer", headers=self.admin, json=move))        # Admin moves between Ombors
        self.assertTrue(all(w["owner"] == "Toxir" for w in ok(client.get("/api/mdm/warehouses",
                                                                         headers=login_as("t_ow_mdm", "MDM", "1,2")))))

    def test_header_rate_for_everyone(self):
        self.assertEqual(client.get("/api/kassa/exchange-rates", headers=self.tohir).status_code, 200)


if __name__ == "__main__":
    unittest.main()
