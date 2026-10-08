"""A month closes by itself on the 10th of the next month (Tashkent time)."""
import os
import unittest
from datetime import date
from unittest import mock

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import MonthClosing
from backend.services import month_close_service as mcs
from tests_support import use_header_roles

use_header_roles()
client = TestClient(app)
ADMIN = {"x-user-role": "Admin"}
YM = "2026-03"           # a month no other test uses


def ok(res):
    assert res.status_code < 300, (res.status_code, res.text)
    return res.json()


def kassa_in(on_day):
    reg = next(r for r in ok(client.get("/api/kassa/registers", headers=ADMIN)) if r["name"] == "Kassa UZS")
    return client.post("/api/kassa/transactions", json={
        "register_id": reg["id"], "type": "kirim", "amount": 1000, "currency": "UZS",
        "category": "boshqa", "date": on_day, "description": "avto yopish testi"}, headers=ADMIN)


def record():
    db = SessionLocal()
    try:
        return db.query(MonthClosing).filter(MonthClosing.year_month == YM).first()
    finally:
        db.close()


class TestMonthAutoClose(unittest.TestCase):

    def test_auto_close(self):
        self.assertEqual(mcs.auto_close_date("2026-03"), date(2026, 4, 10))
        self.assertEqual(mcs.auto_close_date("2026-12"), date(2027, 1, 10))

        with mock.patch.object(mcs, "local_today", return_value=date(2026, 4, 9)):
            self.assertEqual(kassa_in("2026-03-20").status_code, 200)        # still open on the 9th
            st = ok(client.get(f"/api/moliya/month-closing/status?year_month={YM}", headers=ADMIN))
            self.assertFalse(st["is_closed"])
            self.assertEqual(st["auto_close_date"], "2026-04-10")

        with mock.patch.object(mcs, "local_today", return_value=date(2026, 4, 10)):
            # Closed from the 10th, even before the record is written.
            res = kassa_in("2026-03-21")
            self.assertEqual(res.status_code, 400)
            self.assertIn("yopilgan", res.json()["detail"])
            self.assertTrue(ok(client.get(f"/api/moliya/pnl?year_month={YM}", headers=ADMIN))["is_closed"])

            # The cron writes the record with its PnL snapshot, once.
            self.assertIn(YM, ok(client.get("/api/moliya/auto-close"))["closed"])
            self.assertNotIn(YM, ok(client.get("/api/moliya/auto-close"))["closed"])
            rec = record()
            self.assertTrue(rec.is_closed)
            self.assertEqual(rec.closed_by_username, mcs.AUTO_CLOSED_BY)
            st = ok(client.get(f"/api/moliya/month-closing/status?year_month={YM}", headers=ADMIN))
            self.assertTrue(st["is_closed"])

            # An Admin can reopen it, and it is not closed again by itself.
            ok(client.post("/api/moliya/month-closing/reopen", json={"year_month": YM}, headers=ADMIN))
            self.assertEqual(kassa_in("2026-03-22").status_code, 200)
            self.assertNotIn(YM, ok(client.get("/api/moliya/auto-close"))["closed"])
            self.assertTrue(ok(client.get(f"/api/moliya/month-closing/status?year_month={YM}", headers=ADMIN))["reopened"])

    def test_reopen_before_the_record_exists(self):
        ym = "2026-02"
        with mock.patch.object(mcs, "local_today", return_value=date(2026, 3, 15)):
            ok(client.post("/api/moliya/month-closing/reopen", json={"year_month": ym}, headers=ADMIN))
            self.assertNotIn(ym, ok(client.get("/api/moliya/auto-close"))["closed"])
            self.assertFalse(ok(client.get(f"/api/moliya/month-closing/status?year_month={ym}", headers=ADMIN))["is_closed"])

    def test_cron_secret(self):
        with mock.patch.dict(os.environ, {"CRON_SECRET": "s3cret"}):
            self.assertEqual(client.get("/api/moliya/auto-close").status_code, 401)
            self.assertEqual(client.get("/api/moliya/auto-close", headers={"Authorization": "Bearer s3cret"}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
