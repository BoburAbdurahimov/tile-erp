"""To'liq demo ma'lumotlar - butun tizimni sinab ko'rish uchun.

Everything goes through the application's own API (as an Admin), so balances,
average costs, the Kassa history and Tarix all agree - nothing is written to
tables directly.

    python seed_demo.py            # DATABASE_URL from .env / environment
    python seed_demo.py --force    # add another batch even if demo data exists

What it adds:
  - USD/UZS rate, money in every Kassa (UZS, USD, Karta UZS)
  - 6 suppliers, 4 clients
  - purchases of raw materials (Warehouse 2) and consumables / spare parts
    (Warehouse 3), part-paid to the suppliers
  - Ombor stock by size for all 4 owners (120 and 100)
  - Avto sarf norms, and production orders on every line that use them
  - materials issued to the lines, factory overheads paid from the Kassa
  - sales orders: new, delivered, part-paid and paid
"""
import sys
from datetime import date, datetime, timedelta

from fastapi import Header
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal, create_tables
from backend.api.auth import get_current_user_role, get_current_username
from backend.models import CashRegister, MDMMaterial, ProductionLine, Purchase

MARK = "[DEMO]"
FORCE = "--force" in sys.argv


def _role(x_user_role: str = Header(default="Admin")) -> str:
    return "Admin"


def _username() -> str:
    return "demo"


# Run as Admin without a login token; only for this script.
app.dependency_overrides[get_current_user_role] = _role
app.dependency_overrides[get_current_username] = _username
client = TestClient(app)


def call(method, path, **kw):
    res = client.request(method, "/api" + path, **kw)
    if res.status_code >= 300:
        raise RuntimeError(f"{method} {path} -> {res.status_code}: {res.text[:300]}")
    return res.json()


def step(text):
    print(f"• {text}", flush=True)


def main():
    create_tables()
    try:
        from seed_data import seed_database
        seed_database()          # lines, warehouses, registers, catalogue
    except Exception as e:      # already seeded or partially seeded - fine
        print(f"  (asosiy seed: {e})")

    db = SessionLocal()
    if not FORCE and db.query(Purchase).filter(Purchase.description.like(f"%{MARK}%")).first():
        print("Demo ma'lumotlar allaqachon bor. Yana qo'shish uchun: python seed_demo.py --force")
        return

    today = date.today()
    # Documents are dated inside the current month (closed months are locked).
    month_start = today.replace(day=1)
    def day(n_ago):
        d = today - timedelta(days=n_ago)
        return max(d, month_start)

    # ------------------------------------------------------------ rate & Kassa
    step("Valyuta kursi va kassalar")
    try:
        call("POST", "/kassa/exchange-rates", json={"date": str(today), "rate_usd_uzs": 12750})
    except RuntimeError as e:
        print(f"  (kurs: {e})")

    if not db.query(CashRegister).filter(CashRegister.name == "Karta UZS").first():
        db.add(CashRegister(name="Karta UZS", currency="UZS", balance=0.0,
                            description="Plastik karta orqali tushumlar"))
        db.commit()
    regs = {r["name"]: r for r in call("GET", "/kassa/registers")}
    uzs, usd, karta = regs.get("Kassa UZS"), regs.get("Kassa USD"), regs.get("Karta UZS")
    for reg, amount in [(uzs, 250_000_000), (usd, 40_000), (karta, 60_000_000)]:
        if reg:
            call("POST", "/kassa/transactions", json={
                "register_id": reg["id"], "type": "kirim", "amount": amount, "currency": reg["currency"],
                "category": "boshqa", "date": str(day(10)), "description": f"Boshlang'ich qoldiq {MARK}"})

    # ------------------------------------------------------------ counterparties
    step("Yetkazib beruvchilar va mijozlar")
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
            "name": f"{name}", "type": "supplier", "region": region, "phone": phone,
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
    step("Xaridlar: xomashyo (2-ombor), yordamchi materiallar va zapchastlar (3-ombor)")
    mats = {m.code: m for m in db.query(MDMMaterial).all()}
    def mid(code):
        return mats[code].id if code in mats else None

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
        lines = [{"material_id": mid(c), "quantity": q, "unit_price": p} for c, q, p in items if mid(c)]
        if not lines:
            continue
        pur = call("POST", "/savdo/purchases", json={
            "supplier_id": suppliers[sup_idx]["id"], "warehouse_id": wh, "date": str(day(9 - i)),
            "currency": "USD", "items": lines, "description": f"Oylik partiya {MARK}"})
        # Pay 60% now, the rest stays as debt to the supplier.
        if usd:
            call("POST", "/kassa/transactions", json={
                "register_id": usd["id"], "type": "chiqim", "source_type": "supplier",
                "counterparty_id": suppliers[sup_idx]["id"], "amount": round(pur["total_amount"] * 0.6, 2),
                "currency": "USD", "category": "postavshik_tolovi", "date": str(day(8 - i)),
                "description": f"{pur['purchase_number']} uchun to'lov {MARK}"})

    # ------------------------------------------------------------ Ombor stock
    step("Ombor qoldiqlari: Toxir, Kodir, Istam, Aziz (120 va 100)")
    sizes = [680, 740, 835, 540, 620, 760, 590, 470, 350, 820]
    for sklad_id in range(1, 9):
        items = [{"code": c, "quantity": 8 + ((sklad_id * 7 + k * 5) % 25)} for k, c in enumerate(sizes)
                 if (sklad_id + k) % 3 != 0]
        call("POST", "/sklad/kirim", json={"sklad_id": sklad_id, "items": items,
                                           "supplier": f"Boshlang'ich qoldiq {MARK}"})

    # ------------------------------------------------------------ Avto sarf
    step("Avto sarf normalari")
    lines = db.query(ProductionLine).order_by(ProductionLine.line_number).all()
    general = [("RM-CLAY-01", 2.4), ("RM-FELD-02", 1.1), ("RM-SAND-03", 0.9),
               ("RM-GLAZE-04", 0.12), ("RM-PIGM-05", 0.02)]
    for code, q in general:
        if mid(code):
            call("POST", "/ishlab-chiqarish/auto-sarf", json={"material_id": mid(code), "qty_per_unit": q})
    if len(lines) >= 2:   # bigger tiles on line 2 use more clay and glaze
        for code, q in [("RM-CLAY-01", 3.2), ("RM-GLAZE-04", 0.16)]:
            if mid(code):
                call("POST", "/ishlab-chiqarish/auto-sarf",
                     json={"line_id": lines[1].id, "material_id": mid(code), "qty_per_unit": q})

    # ------------------------------------------------------------ production
    step("Ishlab chiqarish (har bir liniyada, avto sarf bilan)")
    plan = [(0, 1, 680, 120), (1, 3, 740, 90), (2, 5, 835, 60), (3, 7, 540, 150), (4, 2, 620, 80),
            (0, 4, 760, 70), (1, 6, 590, 100), (2, 8, 680, 50)]
    for i, (li, sklad_id, code, qty) in enumerate(plan):
        if li >= len(lines):
            continue
        calc = call("GET", f"/ishlab-chiqarish/auto-sarf/calc?quantity={qty}&line_id={lines[li].id}")
        consumed = [{"material_id": it["material_id"], "warehouse_id": 2, "quantity": it["quantity"]}
                    for it in calc["items"] if it["enough"]]
        call("POST", "/ishlab-chiqarish/orders", json={
            "line_id": lines[li].id, "out_sklad_id": sklad_id, "out_code": code, "quantity": qty,
            "date": str(day(6 - i % 6)), "consumed_materials": consumed,
            "notes": f"Smena {1 + i % 2} {MARK}"})

    # ------------------------------------------------------------ line expenses
    step("Sarf materiallari (3-ombordan)")
    for d_ago, items, note in [
        (5, [("SP-KILN-01", 2), ("AUX-STRAP", 3)], "Pech roligi almashtirildi"),
        (2, [("SP-PRESS-02", 1), ("AUX-FILM", 4)], "Press manjeti va qadoqlash"),
    ]:
        lst = [{"material_id": mid(c), "quantity": q} for c, q in items if mid(c)]
        if lst and lines:
            call("POST", "/ishlab-chiqarish/line-expenses", json={
                "date": str(day(d_ago)), "line_ids": [lines[0].id], "items": lst, "notes": f"{note} {MARK}"})

    # ------------------------------------------------------------ overheads
    step("Kassadan zavod xarajatlari (svet, gaz, ofis)")
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

    # ------------------------------------------------------------ sales orders
    step("Sotuv buyurtmalari: yangi, yetkazilgan, qisman va to'liq to'langan")
    try:
        call("POST", "/orders/demo")          # 9 demo orders at every stage
    except RuntimeError as e:
        print(f"  (demo buyurtmalar: {e})")
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

    db.close()
    print("\nTayyor! Demo ma'lumotlar qo'shildi. Kassa, Ombor, Xomashyo ombori, Ishlab chiqarish,"
          " Sotish, Kontragentlar va Tarix sahifalarini tekshiring.")


if __name__ == "__main__":
    main()
