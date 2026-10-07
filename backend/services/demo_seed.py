"""To'liq demo ma'lumotlar - butun tizimni sinab ko'rish uchun.

Everything goes through the application's own API, so balances, average costs,
the Kassa history and Tarix all agree - nothing is written to tables directly.
Used by `python seed_demo.py` and by the admin-only POST /api/demo/seed.

What it adds:
  - USD/UZS rate, money in every Kassa (UZS, USD, Karta UZS)
  - 6 suppliers, 4 clients
  - purchases of raw materials (Warehouse 2) and consumables / spare parts
    (Warehouse 3), part-paid to the suppliers
  - Ombor stock by size for all 4 owners (120 and 100)
  - Avto sarf norms and production orders that use them
  - materials issued for the equipment, factory overheads and other expenses
  - sales orders: new, delivered, part-paid and paid
"""
from datetime import date, datetime, timedelta
from typing import Callable, List

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.models import CashRegister, MDMMaterial, Purchase

MARK = "[DEMO]"


class DemoError(RuntimeError):
    pass


def has_demo(db) -> bool:
    return db.query(Purchase).filter(Purchase.description.like(f"%{MARK}%")).first() is not None


def make_caller(client: TestClient, headers: dict = None) -> Callable:
    def call(method, path, **kw):
        res = client.request(method, "/api" + path, headers=headers or {}, **kw)
        if res.status_code >= 300:
            raise DemoError(f"{method} {path} -> {res.status_code}: {res.text[:300]}")
        return res.json()
    return call


def run(call: Callable, force: bool = False) -> List[str]:
    """Adds one batch of demo data. Returns the steps done (or why nothing was done)."""
    log: List[str] = []
    db = SessionLocal()
    try:
        if not force and has_demo(db):
            return ["Demo ma'lumotlar allaqachon bor."]

        today = date.today()
        # Documents are dated inside the current month (closed months are locked).
        month_start = today.replace(day=1)

        def day(n_ago):
            return max(today - timedelta(days=n_ago), month_start)

        # ------------------------------------------------------------ rate & Kassa
        log.append("Valyuta kursi va kassalar")
        try:
            call("POST", "/kassa/exchange-rates", json={"date": str(today), "rate_usd_uzs": 12750})
        except DemoError:
            pass  # today's rate already set

        if not db.query(CashRegister).filter(CashRegister.name == "Karta UZS").first():
            db.add(CashRegister(name="Karta UZS", currency="UZS", balance=0.0,
                                description="Plastik karta orqali tushumlar"))
            db.commit()
        regs = {r["name"]: r for r in call("GET", "/kassa/registers")}
        uzs, usd, karta = regs.get("Kassa UZS"), regs.get("Kassa USD"), regs.get("Karta UZS")
        for reg, amount in [(uzs, 250_000_000), (usd, 40_000), (karta, 60_000_000)]:
            if reg:
                call("POST", "/kassa/transactions", json={
                    # cover a negative balance too, so the payments below go through
                    "register_id": reg["id"], "type": "kirim", "currency": reg["currency"],
                    "amount": amount + max(0.0, -(reg.get("balance") or 0.0)),
                    "category": "boshqa", "date": str(day(10)), "description": f"Boshlang'ich qoldiq {MARK}"})

        # ------------------------------------------------------------ counterparties
        log.append("Yetkazib beruvchilar va mijozlar")
        suppliers = []
        for name, region, phone in [
            ("Angren Kaolin Gil MCHJ", "Toshkent viloyati", "+998712001001"),
            ("Nurota Dala Shpati AJ", "Navoiy viloyati", "+998792002002"),
            ("Qizilqum Kvars Qumi MCHJ", "Navoiy viloyati", "+998792003003"),
            ("Esmalglass Glazur (Ispaniya)", "Norezident", "+34964000111"),
            ("Toshkent Qadoq Servis", "Toshkent shahri", "+998712005005"),
            ("Texnopark Ehtiyot Qismlar", "Toshkent shahri", "+998712006006"),
        ]:
            suppliers.append(call("POST", "/mdm/counterparties", json={
                "name": name, "type": "supplier", "region": region, "phone": phone,
                "is_resident": region != "Norezident", "address": region}))
        for name, region, phone in [
            ("Samarqand Qurilish Market", "Samarqand viloyati", "+998662100100"),
            ("Farg'ona Kafel Savdo", "Farg'ona viloyati", "+998732200200"),
            ("Toshkent Remont Centr", "Toshkent shahri", "+998712300300"),
            ("Buxoro Stroy Baza", "Buxoro viloyati", "+998652400400"),
        ]:
            call("POST", "/mdm/counterparties", json={
                "name": name, "type": "client", "region": region, "phone": phone, "address": region})

        # ------------------------------------------------------------ purchases
        log.append("Xaridlar: xomashyo (2-ombor), yordamchi materiallar va zapchastlar (3-ombor)")
        mats = {m.code: m.id for m in db.query(MDMMaterial).all()}
        purchases = [
            (0, 2, [("RM-CLAY-01", 80_000, 0.045)]),
            (1, 2, [("RM-FELD-02", 40_000, 0.080)]),
            (2, 2, [("RM-SAND-03", 50_000, 0.035)]),
            (3, 2, [("RM-GLAZE-04", 4_000, 1.80), ("RM-PIGM-05", 800, 6.50)]),
            (4, 3, [("AUX-BOX-60", 6_000, 0.40), ("AUX-PALLET", 400, 8.0), ("AUX-STRAP", 60, 35.0),
                    ("AUX-FILM", 80, 12.0), ("AUX-GLUE", 400, 2.5)]),
            (5, 3, [("SP-KILN-01", 40, 45.0), ("SP-PRESS-02", 20, 85.0), ("SP-BURN-03", 30, 30.0),
                    ("SP-MILL-04", 80, 25.0), ("SP-PUMP-05", 12, 120.0)]),
        ]
        for i, (sup_idx, wh, items) in enumerate(purchases):
            rows = [{"material_id": mats[c], "quantity": q, "unit_price": p} for c, q, p in items if c in mats]
            if not rows:
                continue
            pur = call("POST", "/savdo/purchases", json={
                "supplier_id": suppliers[sup_idx]["id"], "warehouse_id": wh, "date": str(day(9 - i)),
                "currency": "USD", "items": rows, "description": f"Oylik partiya {MARK}"})
            # Pay 60% now, the rest stays as debt to the supplier.
            if usd:
                call("POST", "/kassa/transactions", json={
                    "register_id": usd["id"], "type": "chiqim", "source_type": "supplier",
                    "counterparty_id": suppliers[sup_idx]["id"], "amount": round(pur["total_amount"] * 0.6, 2),
                    "currency": "USD", "category": "postavshik_tolovi", "date": str(day(8 - i)),
                    "description": f"{pur['purchase_number']} uchun to'lov {MARK}"})

        # ------------------------------------------------------------ Ombor stock
        log.append("Ombor qoldiqlari: Toxir, Kodir, Istam, Aziz (120 va 100)")
        sizes = [680, 740, 835, 540, 620, 760, 590, 470, 350, 820]
        for sklad_id in range(1, 9):
            items = [{"code": c, "quantity": 8 + ((sklad_id * 7 + k * 5) % 25)} for k, c in enumerate(sizes)
                     if (sklad_id + k) % 3 != 0]
            call("POST", "/sklad/kirim", json={"sklad_id": sklad_id, "items": items,
                                               "supplier": f"Boshlang'ich qoldiq {MARK}"})

        # ------------------------------------------------------------ Avto sarf
        log.append("Avto sarf normalari")
        for code, q in [("RM-CLAY-01", 2.4), ("RM-FELD-02", 1.1), ("RM-SAND-03", 0.9),
                        ("RM-GLAZE-04", 0.12), ("RM-PIGM-05", 0.02)]:
            if code in mats:
                call("POST", "/ishlab-chiqarish/auto-sarf", json={"material_id": mats[code], "qty_per_unit": q})

        # ------------------------------------------------------------ production
        log.append("Ishlab chiqarish (avto sarf bilan)")
        plan = [(1, 680, 120), (3, 740, 90), (5, 835, 60), (7, 540, 150),
                (2, 620, 80), (4, 760, 70), (6, 590, 100), (8, 680, 50)]
        for i, (sklad_id, code, qty) in enumerate(plan):
            calc = call("GET", f"/ishlab-chiqarish/auto-sarf/calc?quantity={qty}")
            consumed = [{"material_id": it["material_id"], "warehouse_id": 2, "quantity": it["quantity"]}
                        for it in calc["items"] if it["enough"]]
            call("POST", "/ishlab-chiqarish/orders", json={
                "out_sklad_id": sklad_id, "out_code": code, "quantity": qty,
                "date": str(day(6 - i % 6)), "consumed_materials": consumed,
                "notes": f"Smena {1 + i % 2} {MARK}"})

        # ------------------------------------------------------------ equipment materials
        log.append("Sarf materiallari (3-ombordan)")
        for d_ago, items, note in [
            (5, [("SP-KILN-01", 2), ("AUX-STRAP", 3)], "Pech roligi almashtirildi"),
            (2, [("SP-PRESS-02", 1), ("AUX-FILM", 4)], "Press manjeti va qadoqlash"),
        ]:
            lst = [{"material_id": mats[c], "quantity": q} for c, q in items if c in mats]
            if lst:
                call("POST", "/ishlab-chiqarish/line-expenses", json={
                    "date": str(day(d_ago)), "line_ids": [], "items": lst, "notes": f"{note} {MARK}"})

        # ------------------------------------------------------------ overheads
        log.append("Kassadan zavod xarajatlari (svet, gaz, ofis)")
        if uzs:
            for cat, amount, text, d_ago in [
                ("bilvosita_xarajatlar", 18_500_000, "Elektr energiya (svet)", 7),
                ("bilvosita_xarajatlar", 9_200_000, "Tabiiy gaz", 6),
                ("bilvosita_xarajatlar", 2_400_000, "Suv va kanalizatsiya", 5),
                ("admin_prochee", 1_800_000, "Ofis xo'jalik mollari", 4),
                ("admin_prochee", 650_000, "Internet va aloqa", 3),
            ]:
                call("POST", "/kassa/transactions", json={
                    "register_id": uzs["id"], "type": "chiqim", "amount": amount, "currency": "UZS",
                    "category": cat, "date": str(day(d_ago)), "description": f"{text} {MARK}"})

        # ------------------------------------------------------------ other expenses
        log.append("Boshqa xarajatlar (taksi, bozorlik, abed)")
        if uzs:
            taxi = call("POST", "/expenses/counterparties", json={"name": "Yandex Taksi", "phone": "+998712000000"})
            for cat, amount, text, d_ago, payee in [
                ("Taksi", 45_000, "Bankka borib kelish", 6, taxi["id"]),
                ("Bozorlik", 320_000, "Oshxona uchun mahsulotlar", 4, None),
                ("Abed", 540_000, "Ishchilar tushligi", 2, None),
                ("Taksi", 60_000, "Hujjatlarni soliqqa olib borish", 1, taxi["id"]),
            ]:
                call("POST", "/expenses", json={
                    "date": str(day(d_ago)), "category": cat, "amount": amount, "register_id": uzs["id"],
                    "counterparty_id": payee, "description": f"{text} {MARK}"})

        # ------------------------------------------------------------ sales orders
        log.append("Sotuv buyurtmalari: yangi, yetkazilgan, qisman va to'liq to'langan")
        try:
            call("POST", "/orders/demo")          # demo orders at every stage
        except DemoError:
            pass
        own = []
        for name, phone, sklad_id, items, days in [
            ("Samarqand Qurilish Market", "+998662100100", 1, [(680, 10), (740, 6)], 3),
            ("Farg'ona Kafel Savdo", "+998732200200", 3, [(835, 8)], 5),
            ("Toshkent Remont Centr", "+998712300300", 5, [(540, 12), (620, 5)], 2),
            ("Buxoro Stroy Baza", "+998652400400", 7, [(760, 6)], 7),
        ]:
            own.append(call("POST", "/orders", json={
                "client_name": name, "client_phone": phone, "client_address": name.split()[0],
                "sklad_id": sklad_id, "sell_type": "metr",
                "deadline": (datetime.now() + timedelta(days=days)).replace(microsecond=0).isoformat(),
                "items": [{"code": c, "quantity": q, "unit_price": 95_000} for c, q in items],
                "note": MARK}))
        # Deliver two of them (from whichever owner has the stock) and take money.
        for o, pay in [(own[0], 1.0), (own[2], 0.4)]:
            opts = call("GET", f"/orders/{o['id']}/delivery-options")["options"]
            ship = next((op for op in opts if op["can_ship"]), None)
            if not ship:
                continue
            call("POST", f"/orders/{o['id']}/deliver", json={
                "car_number": "01A777AA", "driver_name": "Jasur", "driver_phone": "+998901234567",
                "sklad_id": ship["sklad_id"], "note": MARK})
            amount = round(o["total_amount"] * pay, 0)
            if amount > 0:
                call("POST", f"/orders/{o['id']}/pay", json={"amount": amount, "method": "naqd", "note": MARK})

        log.append("Tayyor")
        return log
    finally:
        db.close()
