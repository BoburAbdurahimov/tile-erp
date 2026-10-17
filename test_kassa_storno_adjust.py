"""Kassa storno keeps the entry, marked, and gives the money back; the tile
Ombor's count can be set by hand by an Admin."""
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


class TestKassaStorno(unittest.TestCase):

    def test_storno_gives_the_money_back_and_keeps_the_entry(self):
        reg = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["currency"] == "UZS")
        sup = ok(client.post("/api/mdm/counterparties", headers=ADMIN, json={"name": "Storno Test MCHJ", "type": "supplier"}))
        try:
            tx = ok(client.post("/api/kassa/transactions", headers=ADMIN, json={
                "register_id": reg["id"], "type": "chiqim", "amount": 250000, "currency": "UZS", "source_type": "supplier",
                "counterparty_id": sup["id"], "category": "postavshik_tolovi", "date": str(date.today()), "description": "storno testi"}))
            reg1 = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["id"] == reg["id"])
            self.assertAlmostEqual(reg1["balance"], reg["balance"] - 250000, places=2)

            self.assertEqual(client.post(f"/api/kassa/transactions/{tx['id']}/storno", headers={"x-user-role": "Kassa"}).status_code, 403)
            ok(client.post(f"/api/kassa/transactions/{tx['id']}/storno", headers={"x-user-role": "Kassa,Storno"}))
            reg2 = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["id"] == reg["id"])
            self.assertAlmostEqual(reg2["balance"], reg["balance"], places=2)                  # money back
            listed = next(t for t in ok(client.get("/api/kassa/transactions", headers=ADMIN)) if t["id"] == tx["id"])
            self.assertEqual(listed["status"], "Storno")                                       # still listed
            self.assertEqual(client.post(f"/api/kassa/transactions/{tx['id']}/storno", headers=ADMIN).status_code, 400)
            ledger = ok(client.get(f"/api/kontragentlar/{sup['id']}/ledger", headers=ADMIN))
            self.assertNotIn("storno testi", str(ledger))                                      # not in the ledger
            # Deleting a storno entry does not give the money back twice
            ok(client.delete(f"/api/kassa/transactions/{tx['id']}", headers=ADMIN))
            reg3 = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["id"] == reg["id"])
            self.assertAlmostEqual(reg3["balance"], reg["balance"], places=2)
        finally:
            client.delete(f"/api/mdm/counterparties/{sup['id']}", headers=ADMIN)


class TestSkladAdjust(unittest.TestCase):

    def test_admin_sets_the_count(self):
        ok(client.post("/api/sklad/kirim", headers=ADMIN, json={"sklad_id": 5, "items": [{"code": 470, "quantity": 9}]}))
        cell = lambda: next((c["quantity"] for c in ok(client.get("/api/sklad/matrix?sklad_id=5", headers=ADMIN))["cells"]
                             if c["code"] == 470), 0)
        before = cell()
        self.assertEqual(client.post("/api/sklad/tuzatish", headers={"x-user-role": "Ombor"},
                                     json={"sklad_id": 5, "code": 470, "quantity": 1, "reason": "x"}).status_code, 403)
        self.assertEqual(client.post("/api/sklad/tuzatish", headers=ADMIN,
                                     json={"sklad_id": 5, "code": 470, "quantity": 1, "reason": " "}).status_code, 400)
        ok(client.post("/api/sklad/tuzatish", headers=ADMIN, json={"sklad_id": 5, "code": 470, "quantity": before - 2,
                                                                   "reason": "Inventarizatsiya"}))
        self.assertEqual(cell(), before - 2)
        move = ok(client.get("/api/sklad/movements?sklad_id=5&limit=1", headers=ADMIN))["movements"][0]
        self.assertEqual((move["operation"], move["details"], move["client_name"]),
                         ("TUZATISH", f"470: {before} → {before - 2} TA", "Inventarizatsiya"))


if __name__ == "__main__":
    unittest.main()
