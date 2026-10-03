"""Dimensional warehouse for the ERP Telegram bot.

Mirrors the standalone sklad bot: stock is a length x width matrix per
warehouse, a size is one code (680 = 600x80), and a sale is priced per linear
metre or square metre with delivery on top.

Everything lives here rather than in bot.py so the two stay easy to merge.
Wiring into bot.py is three small edits: a menu button, a line in the text
router, and one CallbackQueryHandler.
"""
from __future__ import annotations

import io
import logging
import re
from typing import Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from backend.database import SessionLocal
from backend.models import (
    SKLAD_CONFIG, SKLAD_LENGTHS, SKLAD_WIDTHS,
    SELL_TYPE_METR, SELL_TYPE_MKV, SKLAD_OP_OUT,
)
from backend.services import sklad_service as svc

logger = logging.getLogger("TileERPBot.sklad")

STATE_KEY = "sklad_state"

# Conversation steps
STEP_ITEMS = "items"
STEP_SELL_TYPE = "sell_type"
STEP_PRICE = "price"
STEP_DELIVERY = "delivery"
STEP_CLIENT = "client"


# ==================== free-form parser ====================
# Accepts the shapes the sklad bot accepts: "5 680", "5ta 680", "5 шт 680",
# "+5 680", "680 5", "5 600x80", "5 600 80", "5, 680", "5;680", "5:680".

_UNIT_WORDS = r"\b(ta|sht|шт|штук|dona|дана|pcs|pc|piece|pieces)\b"
_VALID_CODES = {l + w for l in SKLAD_LENGTHS for w in SKLAD_WIDTHS}


def _normalize(text: str) -> list:
    text = (text or "").strip().lower()
    text = text.replace("×", "x").replace("*", "x").replace("х", "x")
    # "4.70" / "4,70" / "4.7" -> "470". Limited to a 1-2 digit fraction so that
    # "5, 680" stays two numbers rather than collapsing into "5680".
    text = re.sub(r"(\d)\s*[.,]\s*(\d{1,2})(?!\d)",
                  lambda m: m.group(1) + (m.group(2) + "0" if len(m.group(2)) == 1 else m.group(2)),
                  text)
    text = re.sub(_UNIT_WORDS, " ", text)
    text = re.sub(r"[,;:=]", " ", text)
    text = re.sub(r"[^\w\s+\-x.\n]", " ", text)
    return [re.sub(r"[ \t]+", " ", ln.strip()) for ln in text.split("\n") if ln.strip()]


def parse_items(text: str) -> tuple[list, list]:
    """Return (items, errors). Each item is {quantity, length, width, code}."""
    items, errors = [], []

    for line in _normalize(text):
        nums = [int(n) for n in re.findall(r"\d+", line.replace("+", " "))]
        if not nums:
            continue

        qty = length = width = None

        # "5 600 80" / "5 600x80" -> qty, length, width
        if len(nums) == 3 and nums[1] in SKLAD_LENGTHS and nums[2] in SKLAD_WIDTHS:
            qty, length, width = nums[0], nums[1], nums[2]
        elif len(nums) >= 2:
            a, b = nums[0], nums[1]
            if b in _VALID_CODES and a not in _VALID_CODES:
                qty, code = a, b                      # "5 680"
            elif a in _VALID_CODES and b not in _VALID_CODES:
                code, qty = a, b                      # "680 5"
            elif b in _VALID_CODES:
                qty, code = a, b                      # both plausible: qty first
            else:
                errors.append(f"{line} - o'lcham tanilmadi")
                continue
            length, width = (code // 100) * 100, code % 100
        else:
            errors.append(f"{line} - miqdor yoki o'lcham yetishmayapti")
            continue

        if qty is None or qty <= 0:
            errors.append(f"{line} - miqdor noto'g'ri")
            continue
        if length not in SKLAD_LENGTHS or width not in SKLAD_WIDTHS:
            errors.append(f"{line} - {length + width} bunday o'lcham yo'q")
            continue

        items.append({"quantity": qty, "length": length, "width": width, "code": length + width})

    return items, errors


# ==================== matrix image ====================

def render_matrix_png(matrix: dict) -> Optional[io.BytesIO]:
    """The bot's look: black corner number, red headers, purple quantities."""
    try:
        from PIL import Image, ImageDraw
        from telegram_bot.table_renderer import get_font
    except Exception as e:
        logger.warning(f"Matrix image unavailable: {e}")
        return None

    rows, cols = matrix["rows"], matrix["cols"]
    by_pos = {(c["length"], c["width"]): c["quantity"] for c in matrix["cells"]}

    cell_w, cell_h = 78, 56
    width = cell_w * (len(cols) + 1) + 2
    height = cell_h * (len(rows) + 1) + 2

    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    f_corner = get_font(30, bold=True)
    f_head = get_font(24, bold=True)
    f_cell = get_font(22, bold=True)

    def centre(text, x, y, w, h, font, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        draw.text((x + (w - (bbox[2] - bbox[0])) / 2,
                   y + (h - (bbox[3] - bbox[1])) / 2 - 3), text, font=font, fill=fill)

    centre(str(matrix["corner_number"]), 1, 1, cell_w, cell_h, f_corner, (0, 0, 0))
    for ci, c in enumerate(cols):
        centre(str(c), cell_w * (ci + 1), 1, cell_w, cell_h, f_head, (220, 0, 0))
    for ri, r in enumerate(rows):
        centre(str(r), 1, cell_h * (ri + 1), cell_w, cell_h, f_head, (220, 0, 0))
        for ci, c in enumerate(cols):
            qty = by_pos.get((r, c), 0)
            if qty:
                centre(str(qty), cell_w * (ci + 1), cell_h * (ri + 1),
                       cell_w, cell_h, f_cell, (90, 50, 140))

    for i in range(len(cols) + 2):
        x = i * cell_w
        draw.line([(x, 0), (x, height)], fill=(0, 0, 0), width=1)
    for i in range(len(rows) + 2):
        y = i * cell_h
        draw.line([(0, y), (width, y)], fill=(0, 0, 0), width=1)

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    out.seek(0)
    return out


# ==================== keyboards ====================

def _warehouse_keyboard(action: str) -> InlineKeyboardMarkup:
    rows, row = [], []
    for s in SKLAD_CONFIG:
        row.append(InlineKeyboardButton(f"{s['name']} {s['eni']}",
                                        callback_data=f"sk_{action}_{s['id']}"))
        if len(row) == 2:
            rows.append(row); row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(rows)


def _menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("Ombor jadvali", callback_data="sk_menu_view")],
        [InlineKeyboardButton("Kirim", callback_data="sk_menu_in"),
         InlineKeyboardButton("Sotish", callback_data="sk_menu_out")],
    ])


# ==================== menu entry ====================

async def handle_sklad_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    """Entry point from the main reply keyboard."""
    context.user_data.pop(STATE_KEY, None)
    db = SessionLocal()
    try:
        totals = svc.get_all_totals(db)
    finally:
        db.close()

    lines = ["Ombor (o'lcham bo'yicha)", ""]
    for t in totals:
        lines.append(f"{t['name']} {t['eni']}: {t['total_qty']} dona")
    lines.append("")
    lines.append("O'lcham bitta kod bilan yoziladi: 680 = 600x80")

    await update.message.reply_text("\n".join(lines), reply_markup=_menu_keyboard())


# ==================== callbacks ====================

async def sklad_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "sk_menu_view":
        await query.message.reply_text("Qaysi ombor?", reply_markup=_warehouse_keyboard("view"))
        return
    if data == "sk_menu_in":
        await query.message.reply_text("Kirim. Qaysi ombor?", reply_markup=_warehouse_keyboard("in"))
        return
    if data == "sk_menu_out":
        await query.message.reply_text("Sotish. Qaysi ombor?", reply_markup=_warehouse_keyboard("out"))
        return

    m = re.match(r"^sk_(view|in|out)_(\d+)$", data)
    if m:
        action, sklad_id = m.group(1), int(m.group(2))
        if action == "view":
            await _send_matrix(query.message, sklad_id)
            return
        context.user_data[STATE_KEY] = {
            "mode": action, "sklad_id": sklad_id, "step": STEP_ITEMS, "items": [],
        }
        label = svc.sklad_label(sklad_id)
        verb = "kirim qilinadigan" if action == "in" else "sotiladigan"
        await query.message.reply_text(
            f"{label}\n\nQaysi {verb} o'lchamlar? Har qatorga bittadan yozing:\n"
            f"5 680\n3 740\n\n(5 ta 600x80, 3 ta 700x40)"
        )
        return

    if data == "sk_confirm":
        await _commit(query.message, context)
        return
    if data == "sk_cancel":
        context.user_data.pop(STATE_KEY, None)
        await query.message.reply_text("Bekor qilindi.")
        return

    m = re.match(r"^sk_type_(metr|mkv)$", data)
    if m:
        state = context.user_data.get(STATE_KEY)
        if not state:
            return
        state["sell_type"] = m.group(1)
        state["step"] = STEP_PRICE
        unit = "metr" if m.group(1) == SELL_TYPE_METR else "m.kv"
        await query.message.reply_text(f"1 {unit} narxi qancha?")
        return


async def _send_matrix(message, sklad_id: int):
    db = SessionLocal()
    try:
        svc.ensure_rows(db, sklad_id)
        matrix = svc.get_matrix(db, sklad_id)
    finally:
        db.close()

    caption = (f"{matrix['name']} {matrix['eni']}\n"
               f"Jami: {matrix['total_qty']} dona | "
               f"{matrix['total_metr']:g} metr | {matrix['total_mkv']:g} m.kv")

    png = render_matrix_png(matrix)
    if png is not None:
        await message.reply_photo(photo=png, caption=caption)
    else:
        rows = [caption, ""]
        for c in sorted(matrix["cells"], key=lambda x: x["code"]):
            rows.append(f"{c['code']} ({c['length']}x{c['width']}): {c['quantity']} dona")
        await message.reply_text("\n".join(rows) if matrix["cells"] else caption + "\n\nOmbor bo'sh.")


# ==================== text steps ====================

async def handle_sklad_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Handle one step of the sklad wizard.

    Returns True when the message was consumed, so bot.py can fall through to
    its own routing when it was not.
    """
    state = context.user_data.get(STATE_KEY)
    if not state:
        return False

    text = (update.message.text or "").strip()
    if text.lower() in ("bekor", "cancel", "/cancel"):
        context.user_data.pop(STATE_KEY, None)
        await update.message.reply_text("Bekor qilindi.")
        return True

    step = state.get("step")

    if step == STEP_ITEMS:
        items, errors = parse_items(text)
        if errors and not items:
            await update.message.reply_text("Tushunmadim:\n" + "\n".join(errors[:5]))
            return True
        if not items:
            await update.message.reply_text("O'lcham topilmadi. Masalan: 5 680")
            return True
        state["items"] = items
        if errors:
            await update.message.reply_text("E'tibor bering:\n" + "\n".join(errors[:5]))

        summary = "\n".join(f"  {i['quantity']} ta - {i['code']}" for i in items)
        if state["mode"] == "in":
            state["step"] = "confirm"
            await update.message.reply_text(
                f"{svc.sklad_label(state['sklad_id'])} - KIRIM\n\n{summary}\n\nTasdiqlaysizmi?",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("Tasdiqlash", callback_data="sk_confirm"),
                    InlineKeyboardButton("Bekor", callback_data="sk_cancel"),
                ]]))
        else:
            state["step"] = STEP_SELL_TYPE
            await update.message.reply_text(
                f"{summary}\n\nQanday sotiladi?",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("Metr bo'yicha", callback_data="sk_type_metr"),
                    InlineKeyboardButton("Metr kvadrat", callback_data="sk_type_mkv"),
                ]]))
        return True

    if step == STEP_PRICE:
        try:
            price = float(re.sub(r"[^\d.]", "", text))
            if price <= 0:
                raise ValueError
        except ValueError:
            await update.message.reply_text("Narxni raqam bilan yozing. Masalan: 7000")
            return True
        state["unit_price"] = price
        state["step"] = STEP_DELIVERY
        await update.message.reply_text("Dastavka narxi qancha? (yo'q bo'lsa 0)")
        return True

    if step == STEP_DELIVERY:
        try:
            delivery = float(re.sub(r"[^\d.]", "", text) or 0)
            if delivery < 0:
                raise ValueError
        except ValueError:
            await update.message.reply_text("Dastavka narxini raqam bilan yozing. Masalan: 150000")
            return True
        state["delivery_cost"] = delivery
        state["step"] = STEP_CLIENT
        await update.message.reply_text("Mijoz ismi va telefoni? (yo'q bo'lsa - deb yozing)")
        return True

    if step == STEP_CLIENT:
        if text != "-":
            phone = re.search(r"\+?\d[\d\s\-()]{6,}", text)
            state["client_phone"] = phone.group(0).strip() if phone else None
            name = text.replace(state["client_phone"], "").strip() if state.get("client_phone") else text
            state["client_name"] = name.strip(" ,;") or None
        state["step"] = "confirm"
        await _show_sale_preview(update.message, state)
        return True

    return True


async def _show_sale_preview(message, state: dict):
    sell_type = state["sell_type"]
    price = state["unit_price"]
    cfg = svc.get_config(state["sklad_id"]) or {}
    eni = cfg.get("eni", 120)
    unit = "metr" if sell_type == SELL_TYPE_METR else "m.kv"

    total_units = 0.0
    lines = []
    for i in state["items"]:
        units = i["quantity"] * svc.piece_units(i["length"], i["width"], eni, sell_type)
        total_units += units
        lines.append(f"  {i['quantity']} ta - {i['code']}  ({units:g} {unit})")

    revenue = total_units * price
    delivery = state.get("delivery_cost", 0.0)

    body = [
        f"{svc.sklad_label(state['sklad_id'])} - SOTISH",
        "",
        *lines,
        "",
        f"Jami: {sum(i['quantity'] for i in state['items'])} dona / {total_units:g} {unit}",
        f"1 {unit} narxi: {price:,.0f}",
        f"Tovar summasi: {revenue:,.0f}",
    ]
    if delivery:
        body.append(f"Dastavka: {delivery:,.0f}")
    body.append(f"Umumiy: {revenue + delivery:,.0f}")
    if state.get("client_name") or state.get("client_phone"):
        body += ["", f"Mijoz: {state.get('client_name') or '-'} {state.get('client_phone') or ''}".strip()]

    await message.reply_text(
        "\n".join(body),
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("Tasdiqlash", callback_data="sk_confirm"),
            InlineKeyboardButton("Bekor", callback_data="sk_cancel"),
        ]]))


async def _commit(message, context: ContextTypes.DEFAULT_TYPE):
    state = context.user_data.get(STATE_KEY)
    if not state or not state.get("items"):
        await message.reply_text("Tasdiqlanadigan amal yo'q.")
        return

    db = SessionLocal()
    try:
        if state["mode"] == "in":
            svc.receive_stock(db, sklad_id=state["sklad_id"], items=state["items"],
                              created_by="telegram")
            await message.reply_text("Kirim saqlandi.")
        else:
            price = state["unit_price"]
            items = [dict(i, unit_price=price) for i in state["items"]]
            movement = svc.sell_stock(
                db,
                sklad_id=state["sklad_id"],
                items=items,
                sell_type=state["sell_type"],
                delivery_cost=state.get("delivery_cost", 0.0),
                client_name=state.get("client_name"),
                client_phone=state.get("client_phone"),
                created_by="telegram",
            )
            total = (movement.total_revenue or 0) + (movement.delivery_cost or 0)
            await message.reply_text(f"Sotuv saqlandi. Umumiy: {total:,.0f}")
        sklad_id = state["sklad_id"]
    except svc.SkladError as e:
        await message.reply_text(f"Rad etildi: {e}")
        return
    except Exception as e:
        logger.exception("Sklad commit failed")
        await message.reply_text(f"Xatolik: {e}")
        return
    finally:
        db.close()
        context.user_data.pop(STATE_KEY, None)

    await _send_matrix(message, sklad_id)
