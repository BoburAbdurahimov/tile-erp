"""Deleting and storno are rights of their own ("O'chirish", "Storno"),
given on top of the module the record belongs to."""
import unittest
from datetime import date

from fastapi.testclient import TestClient

from backend.main import app
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def as_role(role):
    return {"x-user-role": role}


class TestRights(unittest.TestCase):

    def test_rights_are_offered(self):
        roles = [r["role"] for r in ok(client.get("/api/auth/roles"))]
        self.assertIn("O'chirish", roles)
        self.assertIn("Storno", roles)

    def test_purchase_storno_and_delete(self):
        sup = ok(client.post("/api/mdm/counterparties", headers=ADMIN, json={"name": "Huquq Test Sement", "type": "supplier"}))
        mat = ok(client.post("/api/mdm/materials", headers=ADMIN, json={
            "code": "HQ-1", "name": "Huquq test loy", "category": "Xomashyo", "unit": "kg", "min_stock": 0}))
        try:
            ok(client.put(f"/api/mdm/counterparties/{sup['id']}/prices", headers=ADMIN,
                          json=[{"material_id": mat["id"], "price": 100}]))
            zakup = "Sotib olish (Zakup)"
            pur = ok(client.post("/api/savdo/purchases", headers=as_role(zakup), json={
                "supplier_id": sup["id"], "date": str(date.today()), "ombor": "Toxir",
                "items": [{"material_id": mat["id"], "quantity": 5}]}))

            res = client.post(f"/api/savdo/purchases/{pur['id']}/storno", headers=as_role(zakup))
            self.assertEqual(res.status_code, 403)
            self.assertIn("Storno", res.json()["detail"])
            ok(client.post(f"/api/savdo/purchases/{pur['id']}/storno", headers=as_role(f"{zakup},Storno")))

            res = client.delete(f"/api/savdo/purchases/{pur['id']}", headers=as_role(f"{zakup},Storno"))
            self.assertEqual(res.status_code, 403)
            self.assertIn("O'chirish", res.json()["detail"])
            # The right does not open a module the user does not have
            self.assertEqual(client.delete(f"/api/savdo/purchases/{pur['id']}", headers=as_role("O'chirish")).status_code, 403)
            ok(client.delete(f"/api/savdo/purchases/{pur['id']}", headers=as_role(f"{zakup},O'chirish")))
        finally:
            client.delete(f"/api/mdm/counterparties/{sup['id']}", headers=ADMIN)
            client.delete(f"/api/mdm/materials/{mat['id']}", headers=ADMIN)

    def test_kassa_delete_and_order_cancel(self):
        reg = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["currency"] == "UZS")
        tx = ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
            "register_id": reg["id"], "type": "kirim", "amount": 1000, "currency": "UZS",
            "category": "Boshqa kirim", "date": str(date.today()), "description": "huquq testi"}))
        self.assertEqual(client.delete(f"/api/kassa/transactions/{tx['id']}", headers=as_role("Kassa")).status_code, 403)
        ok(client.delete(f"/api/kassa/transactions/{tx['id']}", headers=as_role("Kassa,O'chirish")))

        order = ok(client.post("/api/orders", headers=ADMIN, json={
            "client_name": "Huquq test", "client_phone": "+998900000321", "sklad_id": 3,
            "deadline": "2030-01-01T18:00:00", "items": [{"code": 680, "quantity": 1, "unit_price": 1000}]}))
        sotish = "Sotish (Realizatsiya)"
        self.assertEqual(client.post(f"/api/orders/{order['id']}/cancel", headers=as_role(sotish)).status_code, 403)
        ok(client.post(f"/api/orders/{order['id']}/cancel", headers=as_role(f"{sotish},Storno")))

    def test_old_all_round_roles_keep_both(self):
        self.assertEqual(client.post("/api/orders/999999/cancel", headers=as_role("Direktor")).status_code, 400)
        self.assertEqual(client.post("/api/orders/999999/cancel", headers=as_role("Sotish (Realizatsiya)")).status_code, 403)


if __name__ == "__main__":
    unittest.main()
