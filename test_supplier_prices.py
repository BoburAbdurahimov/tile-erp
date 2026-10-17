"""A supplier's materials and prices are set in MDM; Sotib olish then asks
only who, what, how many and when, and the money comes from that list:
the supplier's balance (what we owe) shows it, and the Kassa pays it."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models import MDMCounterparty, StockItem, SupplierPrice
from backend.services.currency_service import convert_amount
from backend.services import material_warehouses as mw
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
DAY = date(2026, 10, 13)


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


class TestSupplierPrices(unittest.TestCase):

    def setUp(self):
        self.made = []
        self.supplier = ok(client.post("/api/mdm/counterparties", headers=ADMIN, json={
            "name": "Narx Test Sement", "type": "supplier"}))
        self.clay = self.material("NT-LOY", "Narx test loy", "Xomashyo", "kg")
        self.glaze = self.material("NT-GLZ", "Narx test glazur", "Xomashyo", "kg")
        self.spare = self.material("NT-POD", "Narx test podshipnik", "Ehtiyot qism", "dona")

    def tearDown(self):
        for pid in self.made:
            client.post(f"/api/savdo/purchases/{pid}/storno", headers=ADMIN)
            client.delete(f"/api/savdo/purchases/{pid}", headers=ADMIN)
        client.delete(f"/api/mdm/counterparties/{self.supplier['id']}", headers=ADMIN)
        for m in (self.clay, self.glaze, self.spare):
            client.delete(f"/api/mdm/materials/{m['id']}", headers=ADMIN)

    def material(self, code, name, category, unit):
        return ok(client.post("/api/mdm/materials", headers=ADMIN, json={
            "code": code, "name": name, "category": category, "unit": unit, "min_stock": 0}))

    def prices(self, items, cp_id=None):
        return client.put(f"/api/mdm/counterparties/{cp_id or self.supplier['id']}/prices", headers=ADMIN, json=items)

    def buy(self, items, ombor="Toxir", **extra):
        res = client.post("/api/savdo/purchases", headers=ADMIN, json={
            "supplier_id": self.supplier["id"], "date": str(DAY), "items": items, "ombor": ombor, **extra})
        if res.status_code == 200:
            self.made.append(res.json()["id"])
        return res

    def balance(self):
        db = SessionLocal()
        try:
            cp = db.get(MDMCounterparty, self.supplier["id"])
            return cp.current_balance_uzs, cp.current_balance_usd
        finally:
            db.close()

    def stock(self, warehouse_id, material_id):
        db = SessionLocal()
        try:
            row = db.query(StockItem).filter(StockItem.warehouse_id == warehouse_id,
                                             StockItem.material_id == material_id).first()
            return row.quantity if row else 0
        finally:
            db.close()

    def test_price_list_is_kept_and_checked(self):
        listed = ok(self.prices([
            {"material_id": self.clay["id"], "price": 1500, "currency": "UZS"},
            {"material_id": self.glaze["id"], "price": 2.5, "currency": "usd"},
        ]))
        self.assertEqual({(r["material_name"], r["price"], r["currency"]) for r in listed},
                         {("Narx test loy", 1500, "UZS"), ("Narx test glazur", 2.5, "USD")})
        self.assertEqual(len(ok(client.get(f"/api/mdm/counterparties/{self.supplier['id']}/prices", headers=ADMIN))), 2)

        # Sent again it replaces the list
        ok(self.prices([{"material_id": self.clay["id"], "price": 1600, "currency": "UZS"}]))
        self.assertEqual([(r["material_id"], r["price"]) for r in
                          ok(client.get(f"/api/mdm/counterparties/{self.supplier['id']}/prices", headers=ADMIN))],
                         [(self.clay["id"], 1600)])

        dup = [{"material_id": self.clay["id"], "price": 1}, {"material_id": self.clay["id"], "price": 2}]
        self.assertEqual(self.prices(dup).status_code, 400)
        self.assertEqual(self.prices([{"material_id": self.clay["id"], "price": 0}]).status_code, 400)
        self.assertEqual(self.prices([{"material_id": self.clay["id"], "price": 5, "currency": "EUR"}]).status_code, 400)
        buyer = ok(client.post("/api/mdm/counterparties", headers=ADMIN, json={"name": "Narx Test Mijoz", "type": "client"}))
        try:
            self.assertEqual(self.prices([], cp_id=buyer["id"]).status_code, 400)       # clients have no price list
        finally:
            client.delete(f"/api/mdm/counterparties/{buyer['id']}", headers=ADMIN)

    def test_purchase_takes_the_price_from_mdm(self):
        ok(self.prices([
            {"material_id": self.clay["id"], "price": 1500, "currency": "UZS"},
            {"material_id": self.glaze["id"], "price": 2, "currency": "USD"},
            {"material_id": self.spare["id"], "price": 40000, "currency": "UZS"},
        ]))
        uzs0, _ = self.balance()
        db = SessionLocal()
        try:
            xom, arl = mw.warehouse_id(db, "Toxir", mw.XOMASHYO), mw.warehouse_id(db, "Toxir", mw.ARALASH)
        finally:
            db.close()
        clay0 = self.stock(xom, self.clay["id"])

        pur = ok(self.buy([{"material_id": self.clay["id"], "quantity": 200},
                           {"material_id": self.glaze["id"], "quantity": 10}]))
        db = SessionLocal()
        try:
            glaze_uzs = convert_amount(2, "USD", "UZS", DAY, db)
        finally:
            db.close()
        # In the first line's currency; the dollar line converted at the day's rate
        self.assertEqual(pur["currency"], "UZS")
        self.assertAlmostEqual(pur["total_amount"], 200 * 1500 + 10 * glaze_uzs, delta=0.01)
        self.assertEqual(self.stock(xom, self.clay["id"]) - clay0, 200)              # raw material -> Toxir xomashyo
        uzs1, _ = self.balance()
        self.assertAlmostEqual(uzs1 - uzs0, -pur["total_amount"], delta=0.01)          # we owe them that much

        spare = ok(self.buy([{"material_id": self.spare["id"], "quantity": 3}]))
        self.assertEqual(spare["warehouse_id"], arl)                                   # spare parts -> Toxir aralash
        self.assertEqual(spare["ombor"], "Toxir")
        self.assertEqual(self.stock(arl, self.spare["id"]), 3)

        self.assertEqual(self.buy([{"material_id": self.clay["id"], "quantity": 5},
                                   {"material_id": self.spare["id"], "quantity": 1}]).status_code, 400)  # two warehouses

    def test_both_currencies(self):
        listed = ok(self.prices([
            {"material_id": self.clay["id"], "price_uzs": 13000, "price_usd": 1},
            {"material_id": self.glaze["id"], "price_usd": 2},
        ]))
        got = {r["material_id"]: (r["price_uzs"], r["price_usd"]) for r in listed}
        self.assertEqual(got[self.clay["id"]], (13000, 1))
        self.assertEqual(got[self.glaze["id"]], (None, 2))
        self.assertEqual(self.prices([{"material_id": self.clay["id"]}]).status_code, 400)          # no price at all

        # Bought in dollars: the clay's own dollar price, not its so'm price converted
        usd = ok(self.buy([{"material_id": self.clay["id"], "quantity": 10}], currency="USD"))
        self.assertEqual((usd["currency"], usd["total_amount"]), ("USD", 10))
        # In so'm: the clay at 13 000, the glaze (dollars only) converted at the day's rate
        uzs = ok(self.buy([{"material_id": self.clay["id"], "quantity": 10},
                           {"material_id": self.glaze["id"], "quantity": 1}], currency="UZS"))
        db = SessionLocal()
        try:
            glaze = convert_amount(2, "USD", "UZS", DAY, db)
        finally:
            db.close()
        self.assertAlmostEqual(uzs["total_amount"], 130000 + glaze, delta=0.01)
        # Not said: so'm, as the first line has it
        self.assertEqual(ok(self.buy([{"material_id": self.clay["id"], "quantity": 1}]))["currency"], "UZS")

    def test_no_price_no_purchase(self):
        res = self.buy([{"material_id": self.clay["id"], "quantity": 5}])
        self.assertEqual(res.status_code, 400)
        self.assertIn("MDM", res.json()["detail"])

    def test_deleting_keeps_the_list_tidy(self):
        ok(self.prices([{"material_id": self.clay["id"], "price": 1500}]))
        ok(client.delete(f"/api/mdm/materials/{self.clay['id']}", headers=ADMIN))
        db = SessionLocal()
        try:
            self.assertEqual(db.query(SupplierPrice).filter(SupplierPrice.material_id == self.clay["id"]).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
