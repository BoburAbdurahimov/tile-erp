import logging
import asyncio
from datetime import date
from typing import List, Optional, Dict
from sqlalchemy import func
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup,
    ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
)
from telegram.request import HTTPXRequest
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, ContextTypes, filters
)

from backend.config import TELEGRAM_BOT_TOKEN
from backend.database import SessionLocal
from backend.models import (
    TelegramUser, Warehouse, StockItem, CashRegister, CashTransaction,
    MDMCounterparty, ProductionOrder, ProductionConsumedMaterial,
    ProductionLine, MDMMaterial, ExchangeRate
)
from backend.services.currency_service import get_exchange_rate_for_date, convert_amount
from backend.services.inventory_service import deduct_stock, add_stock_with_avg_valuation
from backend.services.month_close_service import is_month_closed
from backend.services.reports_service import get_pnl_report
from telegram_bot.table_renderer import render_excel_table_image

logger = logging.getLogger("TileERPBot")

WEBAPP_HTTPS_URL = "https://imposed-butler-ability-encourage.trycloudflare.com/webapp"

BOT_TEXTS = {
    "uz": {
        "welcome": "👋 **Assalomu alaykum!**\nKafel zavodi ERP tizimiga xush kelibsiz.\n\n👇 **🚀 ERP Mini App** orqali to'liq tizimni ochishingiz yoki quyidagi menyudan foydalanishingiz mumkin:",
        "choose_lang": "🌐 Iltimos, tilni tanlang / Пожалуйста, выберите язык:",
        "lang_set": "✅ Til o'zbek tiliga o'rnatildi!",
        "btn_webapp": "🚀 ERP Mini Appni ochish",
        "menu_warehouse": "📦 Ombor qoldiqlari",
        "menu_cash": "💵 Kassa holati",
        "menu_production": "🏭 Ishlab chiqarish",
        "menu_balances": "👥 Balanslar",
        "menu_finance": "📊 Moliya & PnL",
        "btn_change_lang": "🌐 Tilni o'zgartirish",
        "select_warehouse": "Qaysi omborni ko'rmoqchisiz?",
        "select_currency": "Qaysi valyutada hisoblansin?",
        "cbu_rate": "Valyuta kursi (CBU)"
    },
    "ru": {
        "welcome": "👋 **Здравствуйте!**\nДобро пожаловать в ERP-систему завода по производству плитки.\n\n👇 Нажмите **🚀 Открыть ERP Mini App** для быстрого управления или выберите раздел ниже:",
        "choose_lang": "🌐 Пожалуйста, выберите язык / Iltimos, tilni tanlang:",
        "lang_set": "✅ Язык успешно изменен на русский!",
        "btn_webapp": "🚀 Открыть ERP Mini App",
        "menu_warehouse": "📦 Остатки на складе",
        "menu_cash": "💵 Состояние кассы",
        "menu_production": "🏭 Производство",
        "menu_balances": "👥 Балансы контрагентов",
        "menu_finance": "📊 Финансы & PnL",
        "btn_change_lang": "🌐 Сменить язык",
        "select_warehouse": "Какой склад вы хотите просмотреть?",
        "select_currency": "В какой валюте отобразить цены?",
        "cbu_rate": "Курс ЦБ РУз"
    }
}

def get_user_lang(tg_id: int) -> str:
    db = SessionLocal()
    try:
        user = db.query(TelegramUser).filter(TelegramUser.telegram_id == tg_id).first()
        return user.language if user else "uz"
    finally:
        db.close()

def set_user_lang(tg_id: int, lang: str, username: str = "", first_name: str = ""):
    db = SessionLocal()
    try:
        user = db.query(TelegramUser).filter(TelegramUser.telegram_id == tg_id).first()
        if not user:
            user = TelegramUser(telegram_id=tg_id, username=username, first_name=first_name, language=lang, role="Kutilmoqda", is_approved=False)
            db.add(user)
        else:
            user.language = lang
        db.commit()
    finally:
        db.close()

def check_bot_user_auth(user_id: int):
    db = SessionLocal()
    try:
        u = db.query(TelegramUser).filter(TelegramUser.telegram_id == user_id).first()
        if not u or not u.phone_number:
            return False, "NotRegistered", None
        if not u.is_approved or u.role in [None, "", "Kutilmoqda"]:
            return False, "Kutilmoqda", u
        return True, u.role, u
    finally:
        db.close()

def parse_roles_list(role_str: str) -> List[str]:
    if not role_str:
        return []
    return [r.strip() for r in str(role_str).split(",") if r.strip()]

def get_role_capabilities(role_str: str):
    roles = parse_roles_list(role_str)
    is_admin = "Admin" in roles
    return {
        "mini_app": is_admin or "Mini App" in roles or "Ish boshqaruvchi" in roles or "Direktor" in roles,
        "ombor": is_admin or "Ombor" in roles or "Omborchi" in roles or "Ish boshqaruvchi" in roles or "Direktor" in roles,
        "kassa": is_admin or "Kassa" in roles or "Kassir" in roles or "Buxgalter" in roles or "Ish boshqaruvchi" in roles or "Direktor" in roles,
        "production": is_admin or "Ishlab chiqarish" in roles or "Sex boshlig'i" in roles or "Ish boshqaruvchi" in roles or "Direktor" in roles,
        "balances": is_admin or "Kontragentlar & Balanslar" in roles or "Balanslar" in roles or "Buxgalter" in roles or "Kassir" in roles or "Ish boshqaruvchi" in roles or "Direktor" in roles,
        "finance": is_admin or "Moliya & PnL" in roles or "Moliya" in roles or "Moliyachi" in roles or "Buxgalter" in roles or "Direktor" in roles
    }

def get_main_keyboard(lang: str, role_str: str = "Admin") -> ReplyKeyboardMarkup:
    t = BOT_TEXTS[lang]
    caps = get_role_capabilities(role_str)

    keyboard = []

    # 1. Mini App button (ONLY IF HAS MINI APP PERMISSION)
    if caps["mini_app"]:
        keyboard.append([KeyboardButton(text=t["btn_webapp"], web_app=WebAppInfo(url=WEBAPP_HTTPS_URL))])
    
    # 2. Ombor & Kassa row
    row1 = []
    if caps["ombor"]:
        row1.append(KeyboardButton(text=t["menu_warehouse"]))
    if caps["kassa"]:
        row1.append(KeyboardButton(text=t["menu_cash"]))
    if row1:
        keyboard.append(row1)
        
    # 3. Production & Balances row
    row2 = []
    if caps["production"]:
        row2.append(KeyboardButton(text=t["menu_production"]))
    if caps["balances"]:
        row2.append(KeyboardButton(text=t["menu_balances"]))
    if row2:
        keyboard.append(row2)
        
    # 4. Finance & Language switch
    row3 = []
    if caps["finance"]:
        row3.append(KeyboardButton(text=t["menu_finance"]))
    row3.append(KeyboardButton(text=t["btn_change_lang"]))
    keyboard.append(row3)
    
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    keyboard = [
        [
            InlineKeyboardButton("🇺🇿 O'zbekcha", callback_data="lang_uz"),
            InlineKeyboardButton("🇷🇺 Русский", callback_data="lang_ru")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        f"👋 Assalomu alaykum, {user.first_name}!\nIltimos, tilni tanlang / Пожалуйста, выберите язык:",
        reply_markup=reply_markup
    )

async def lang_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    lang = query.data.split("_")[1]
    user = query.from_user
    set_user_lang(user.id, lang, user.username or "", user.first_name or "")

    is_appr, u_role, db_user = check_bot_user_auth(user.id)
    t = BOT_TEXTS[lang]

    # If phone number is missing, prompt to share contact!
    if not db_user or not db_user.phone_number:
        contact_kb = [
            [KeyboardButton(text="📱 Telefon raqamni yuborish" if lang == "uz" else "📱 Отправить номер телефона", request_contact=True)]
        ]
        msg = (
            f"✅ {t['lang_set']}\n\n"
            f"📱 **Hurmatli {user.first_name}!**\n"
            f"ERP tizimidan foydalanish va administrator sizga rol biriktirishi uchun, iltimos, **telefon raqamingizni yuboring** (pastdagi tugmani bosing):"
            if lang == "uz" else
            f"✅ {t['lang_set']}\n\n"
            f"📱 **Уважаемый {user.first_name}!**\n"
            f"Для доступа к ERP-системе и назначения вам роли Администратором, пожалуйста, **отправьте ваш номер телефона** (нажмите кнопку ниже):"
        )
        await query.message.reply_text(
            msg,
            reply_markup=ReplyKeyboardMarkup(contact_kb, resize_keyboard=True, one_time_keyboard=True),
            parse_mode="Markdown"
        )
    elif not is_appr:
        pending_msg = (
            f"✅ {t['lang_set']}\n\n"
            f"⏳ **Hurmatli {user.first_name}!**\n"
            f"Sizning telefon raqamingiz (`{db_user.phone_number}`) tizimga yuborilgan.\n\n"
            f"Administrator profilingizni tasdiqlab, sizga mos **rol** (omborchi, kassir, ish boshqaruvchi va h.k.) bergach, barcha operatsiyalar avtomatik ochiladi."
            if lang == "uz" else
            f"✅ {t['lang_set']}\n\n"
            f"⏳ **Уважаемый {user.first_name}!**\n"
            f"Ваш номер телефона (`{db_user.phone_number}`) отправлен в систему.\n\n"
            f"Ожидается подтверждение и назначение вам роли Администратором."
        )
        await query.message.reply_text(pending_msg, parse_mode="Markdown")
    else:
        await query.message.reply_text(
            f"{t['lang_set']}\n\n{t['welcome']}",
            reply_markup=get_main_keyboard(lang, u_role),
            parse_mode="Markdown"
        )

async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    contact = update.message.contact
    phone = contact.phone_number if contact else ""
    if not phone:
        return
    if not phone.startswith("+"):
        phone = "+" + phone

    db = SessionLocal()
    is_approved = False
    user_role = "Kutilmoqda"
    try:
        db_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
        if not db_user:
            db_user = TelegramUser(
                telegram_id=user.id,
                phone_number=phone,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                language=get_user_lang(user.id),
                role="Kutilmoqda",
                is_approved=False
            )
            db.add(db_user)
        else:
            db_user.phone_number = phone
            db_user.username = user.username
            db_user.first_name = user.first_name
            db_user.last_name = user.last_name
            is_approved = db_user.is_approved
            user_role = db_user.role or "Kutilmoqda"
        db.commit()
    finally:
        db.close()

    lang = get_user_lang(user.id)

    if not is_approved or user_role in [None, "", "Kutilmoqda"]:
        pending_text = (
            f"✅ **Telefon raqamingiz qabul qilindi:** `{phone}`\n\n"
            f"⏳ **Holat:** `Kutilmoqda (Admin tasdig'i talab etiladi)`\n\n"
            f"Administrator web boshqaruv paneli orqali profilingizni ko'rib chiqadi va sizga tegishli **rol** biriktiradi. Shundan so'ng botdan foydalanishingiz mumkin bo'ladi."
            if lang == "uz" else
            f"✅ **Ваш номер телефона принят:** `{phone}`\n\n"
            f"⏳ **Статус:** `Ожидает подтверждения Администратором`\n\n"
            f"Администратор назначит вам роль в веб-панели управления, после чего бот станет доступен."
        )
        await update.message.reply_text(
            pending_text,
            reply_markup=ReplyKeyboardRemove(),
            parse_mode="Markdown"
        )
    else:
        reply_text = (
            f"✅ **Telefon raqamingiz tasdiqlangan:** `{phone}`\n"
            f"🎭 **Sizning rolingiz:** `{user_role}`\n\n"
            f"Barcha amallarni bajarish uchun quyidagi menyudan foydalanishingiz mumkin:"
            if lang == "uz" else
            f"✅ **Ваш номер телефона подтвержден:** `{phone}`\n"
            f"🎭 **Ваша роль:** `{user_role}`\n\n"
            f"Вы можете приступать к работе в системе:"
        )
        await update.message.reply_text(
            reply_text,
            reply_markup=get_main_keyboard(lang, user_role),
            parse_mode="Markdown"
        )

# ==================== 1. WAREHOUSE MODULE ====================
async def handle_warehouse_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    t = BOT_TEXTS[lang]
    db = SessionLocal()
    try:
        warehouses = db.query(Warehouse).all()
        keyboard = []
        for w in warehouses:
            keyboard.append([InlineKeyboardButton(f"🏢 {w.name}", callback_data=f"wh_{w.id}")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(f"📦 {t['select_warehouse']}", reply_markup=reply_markup)
    finally:
        db.close()

async def warehouse_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    is_appr, u_role, db_user = check_bot_user_auth(query.from_user.id)
    if not is_appr or not get_role_capabilities(u_role)["ombor"]:
        await query.message.reply_text(f"⛔ Sizning rolingizda (`{u_role}`) Ombor amallariga ruxsat yo'q.")
        return

    data = query.data
    lang = get_user_lang(query.from_user.id)
    t = BOT_TEXTS[lang]

    if data.startswith("wh_"):
        wh_id = int(data.split("_")[1])
        keyboard = [
            [
                InlineKeyboardButton("💵 USD ($)", callback_data=f"whcur_{wh_id}_USD"),
                InlineKeyboardButton("🇺🇿 UZS (So'm)", callback_data=f"whcur_{wh_id}_UZS")
            ]
        ]
        await query.message.edit_text(
            f"💱 {t['select_currency']}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    elif data.startswith("whcur_"):
        parts = data.split("_")
        wh_id = int(parts[1])
        currency = parts[2]
        
        db = SessionLocal()
        try:
            wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
            items = db.query(StockItem).filter(StockItem.warehouse_id == wh_id).all()
            today_rate = get_exchange_rate_for_date(db, date.today())
            wh_name = wh.name if wh else "Ombor"

            headers = ["Mahsulot nomi", "Miqdor", f"Narxi ({currency})", f"Jami ({currency})"] if lang == "uz" else ["Наименование", "Остаток", f"Цена ({currency})", f"Сумма ({currency})"]
            col_aligns = ["left", "right", "right", "right"]

            rows = []
            total_sum = 0.0

            for it in items:
                mat = it.material
                if not mat:
                    continue
                qty = it.quantity
                if currency == "USD":
                    price = it.avg_cost_usd
                    total_p = qty * price
                else:
                    price = it.avg_cost_uzs
                    total_p = qty * price
                
                total_sum += total_p
                rows.append([
                    mat.name,
                    f"{qty:,.1f} {mat.unit}",
                    f"{price:,.2f}",
                    f"{total_p:,.2f}"
                ])

            total_row = [
                "JAMI QIYMAT:" if lang == "uz" else "ИТОГО:",
                "",
                "",
                f"{total_sum:,.2f} {currency}"
            ]

            title = f"📦 {wh_name} ({currency})"
            subtitle = f"📅 Sana: {date.today()} | 📈 1 USD = {today_rate:,.0f} UZS"

            img_buf = render_excel_table_image(
                title=title,
                subtitle=subtitle,
                headers=headers,
                rows=rows,
                col_alignments=col_aligns,
                total_row=total_row
            )

            await query.message.reply_photo(
                photo=img_buf,
                caption=f"📦 **{wh_name}** ({currency})\n💰 Jami: `{total_sum:,.2f} {currency}`",
                parse_mode="Markdown"
            )
        finally:
            db.close()

# ==================== 2. CASH MODULE (KIRIM & CHIQIM) ====================
async def handle_cash_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    db = SessionLocal()
    try:
        registers = db.query(CashRegister).all()
        today_rate = get_exchange_rate_for_date(db, date.today())

        headers = ["Kassa", "Valyuta", "Qoldiq", "Ekvivalent (CBU)"] if lang == "uz" else ["Касса", "Валюта", "Остаток", "Эквивалент (ЦБ)"]
        col_aligns = ["left", "center", "right", "right"]

        rows = []
        for reg in registers:
            if reg.currency == "USD":
                equiv = reg.balance * today_rate
                main_str = f"${reg.balance:,.2f}"
                equiv_str = f"{equiv:,.0f} UZS"
            else:
                equiv = reg.balance / today_rate if today_rate > 0 else 0.0
                main_str = f"{reg.balance:,.0f} UZS"
                equiv_str = f"${equiv:,.2f}"

            rows.append([
                reg.name,
                reg.currency,
                main_str,
                equiv_str
            ])

        title = "💵 Kassa qoldiqlari" if lang == "uz" else "💵 Состояние кассы"
        subtitle = f"📅 Sana: {date.today()} | 📈 1 USD = {today_rate:,.0f} UZS"

        img_buf = render_excel_table_image(
            title=title,
            subtitle=subtitle,
            headers=headers,
            rows=rows,
            col_alignments=col_aligns
        )

        keyboard = [
            [
                InlineKeyboardButton("➕ Kirim qilish" if lang == "uz" else "➕ Поступление (Приход)", callback_data="cash_kirim_start"),
                InlineKeyboardButton("➖ Chiqim qilish" if lang == "uz" else "➖ Расход (Выплата)", callback_data="cash_chiqim_start")
            ]
        ]

        await update.message.reply_photo(
            photo=img_buf,
            caption="💵 **Kassa amallari:** Pul kirimi yoki chiqimini kiritish uchun tugmalardan foydalaning:" if lang == "uz" else "💵 **Кассовые операции:** Для оформления прихода или расхода нажмите кнопку ниже:",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    finally:
        db.close()

# Helper to execute cash transaction in DB
async def execute_cash_transaction_db(target_message, context: ContextTypes.DEFAULT_TYPE, desc: str, lang: str):
    state = context.user_data.get("cash_tx", {})
    if not state:
        return

    reg_id = state.get("reg_id")
    action = state.get("action") # "kirim" or "chiqim"
    category = state.get("category", "Boshqa")
    cp_id = state.get("cp_id")
    amt = state.get("amount", 0.0)

    db = SessionLocal()
    try:
        reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
        if not reg:
            await target_message.reply_text("❌ Kassa topilmadi.")
            return

        today = date.today()
        if is_month_closed(db, today):
            await target_message.reply_text("❌ Ushbu oy yopilgan! Operatsiya bajarilmadi.")
            return

        if action == "chiqim" and round(reg.balance, 4) < round(amt, 4):
            await target_message.reply_text(
                f"❌ **Kassada yetarli mablag' mavjud emas!**\n"
                f"💵 Kassa: `{reg.name}`\n"
                f"🔻 Talab qilingan: `{amt:,.2f} {reg.currency}`\n"
                f"📊 Mavjud qoldiq: `{reg.balance:,.2f} {reg.currency}`\n\n"
                f"Kassa manfiy songa tushishiga yo'l qo'yilmaydi.",
                parse_mode="Markdown"
            )
            return

        rate = get_exchange_rate_for_date(db, today)
        
        # Update Register Balance
        if action == "kirim":
            reg.balance += amt
        else:
            reg.balance -= amt

        # Update Counterparty if selected
        cp = None
        if cp_id:
            cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == cp_id).first()
            if cp:
                if action == "kirim":
                    # Client payment reduces debt
                    if reg.currency == "USD":
                        cp.current_balance_usd -= amt
                        cp.current_balance_uzs -= amt * rate
                    else:
                        cp.current_balance_uzs -= amt
                        cp.current_balance_usd -= amt / rate if rate > 0 else 0.0
                elif action == "chiqim":
                    # Paying supplier reduces our payable
                    if reg.currency == "USD":
                        cp.current_balance_usd += amt
                        cp.current_balance_uzs += amt * rate
                    else:
                        cp.current_balance_uzs += amt
                        cp.current_balance_usd += amt / rate if rate > 0 else 0.0

        final_desc = desc if desc else f"Telegram bot orqali {action}"

        tx = CashTransaction(
            register_id=reg_id,
            date=today,
            type=action,
            source_type="counterparty" if cp_id else "other",
            category=category,
            amount=amt,
            currency=reg.currency,
            counterparty_id=cp_id,
            status="Tasdiqlandi",
            description=final_desc
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)

        # Clear state
        context.user_data["cash_tx"] = {}

        storno_kb = [
            [InlineKeyboardButton("↩️ Storno qilish (Bekor qilish)" if lang == "uz" else "↩️ Сторнировать", callback_data=f"ctx_storno_{tx.id}")]
        ]

        title = "✅ KASSA KIRIMI TASDIQLANDI!" if action == "kirim" else "✅ KASSA CHIQIMI TASDIQLANDI!"
        symbol = "+" if action == "kirim" else "-"
        
        msg = (
            f"**{title}**\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"📋 **Hujjat №:** `CSH-{tx.id:04d}`\n"
            f"💵 **Kassa:** `{reg.name}`\n"
            f"💰 **Summa:** `{symbol}{amt:,.2f} {reg.currency}`\n"
            f"📋 **Toifa / Manba:** `{category}` {f'({cp.name})' if cp else ''}\n"
            f"📝 **Izoh:** _{final_desc}_\n"
            f"📈 **Yangi kassa qoldig'i:** `{reg.balance:,.2f} {reg.currency}`\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"ℹ️ _Xatolik bo'lsa, quyidagi Storno tugmasi orqali bekor qilishingiz mumkin._"
        )
        try:
            await target_message.reply_text(msg, reply_markup=InlineKeyboardMarkup(storno_kb), parse_mode="Markdown")
        except Exception as err:
            logger.warning(f"Markdown send failed, falling back to plain text: {err}")
            plain_msg = (
                f"{title}\n"
                f"━━━━━━━━━━━━━━━━━━━\n"
                f"📋 Hujjat №: CSH-{tx.id:04d}\n"
                f"💵 Kassa: {reg.name}\n"
                f"💰 Summa: {symbol}{amt:,.2f} {reg.currency}\n"
                f"📋 Toifa / Manba: {category} {f'({cp.name})' if cp else ''}\n"
                f"📝 Izoh: {final_desc}\n"
                f"📈 Yangi kassa qoldig'i: {reg.balance:,.2f} {reg.currency}\n"
                f"━━━━━━━━━━━━━━━━━━━\n"
                f"ℹ️ Xatolik bo'lsa, quyidagi Storno tugmasi orqali bekor qilishingiz mumkin."
            )
            await target_message.reply_text(plain_msg, reply_markup=InlineKeyboardMarkup(storno_kb))
    finally:
        db.close()

# Cash Kirim & Chiqim Callbacks
async def cash_ops_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    is_appr, u_role, db_user = check_bot_user_auth(query.from_user.id)
    if not is_appr or not get_role_capabilities(u_role)["kassa"]:
        await query.message.reply_text(f"⛔ Sizning rolingizda (`{u_role}`) Kassa amallariga ruxsat yo'q.")
        return

    data = query.data
    lang = get_user_lang(query.from_user.id)

    db = SessionLocal()
    try:
        # ================= KIRIM FLOW =================
        # Step 1: Select Register for Kirim
        if data == "cash_kirim_start":
            registers = db.query(CashRegister).all()
            keyboard = []
            for r in registers:
                keyboard.append([InlineKeyboardButton(f"💵 {r.name} ({r.currency})", callback_data=f"ckr_reg_{r.id}")])
            await query.message.reply_text(
                "📥 **KIRIM: Pul qaysi kassaga qabul qilinsin?**" if lang == "uz" else "📥 **ПРИХОД: Выберите кассу поступления:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2: Select Category/Source for Kirim
        elif data.startswith("ckr_reg_"):
            reg_id = int(data.split("_")[2])
            keyboard = [
                [InlineKeyboardButton("👤 Mijozdan to'lov (Debitorlik yopish)" if lang == "uz" else "👤 Оплата от клиента", callback_data=f"ckr_src_{reg_id}_client")],
                [InlineKeyboardButton("🚚 Postavshikdan qaytgan pul" if lang == "uz" else "🚚 Возврат от поставщика", callback_data=f"ckr_src_{reg_id}_supplier")],
                [InlineKeyboardButton("💼 Asoschidan investitsiya / Pul kiritish" if lang == "uz" else "💼 Взнос учредителя", callback_data=f"ckr_src_{reg_id}_founder")],
                [InlineKeyboardButton("💰 Boshqa kirimlar" if lang == "uz" else "💰 Прочий приход", callback_data=f"ckr_src_{reg_id}_other")]
            ]
            await query.message.reply_text(
                "📋 **Kirim manbasini tanlang:**" if lang == "uz" else "📋 **Выберите источник прихода:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 3: Specific Source Selection
        elif data.startswith("ckr_src_"):
            parts = data.split("_")
            reg_id = int(parts[2])
            src_type = parts[3]

            if src_type == "client":
                clients = db.query(MDMCounterparty).filter(MDMCounterparty.type == "client", MDMCounterparty.is_archived == False).all()
                keyboard = []
                for c in clients:
                    keyboard.append([InlineKeyboardButton(f"👤 {c.name} (${c.current_balance_usd:,.0f})", callback_data=f"ckr_cp_{reg_id}_{c.id}_client")])
                await query.message.reply_text(
                    "👤 **Qaysi mijozdan to'lov qabul qilindi?**" if lang == "uz" else "👤 **Выберите клиента:**",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode="Markdown"
                )
            elif src_type == "supplier":
                suppliers = db.query(MDMCounterparty).filter(MDMCounterparty.type == "supplier", MDMCounterparty.is_archived == False).all()
                keyboard = []
                for s in suppliers:
                    keyboard.append([InlineKeyboardButton(f"🏢 {s.name}", callback_data=f"ckr_cp_{reg_id}_{s.id}_supplier")])
                await query.message.reply_text(
                    "🏢 **Qaysi yetkazib beruvchidan pul qaytgan?**" if lang == "uz" else "🏢 **Выберите поставщика:**",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode="Markdown"
                )
            else:
                cat_name = "Asoschidan investitsiya" if src_type == "founder" else "Boshqa kirim"
                reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
                context.user_data["cash_tx"] = {
                    "action": "kirim",
                    "reg_id": reg_id,
                    "category": cat_name,
                    "cp_id": None,
                    "cp_name": None,
                    "step": "await_cash_amount"
                }
                await query.message.reply_text(
                    f"💵 **Kassaga kirim qilinadigan summani yozing ({reg.currency if reg else 'UZS'}):**\n"
                    f"🏢 Kassa: **{reg.name if reg else 'Kassa'}**\n"
                    f"📥 Kirim turi: **{cat_name}**\n\n"
                    f"_Aniq summani raqam bilan yozib yuboring (masalan: 15000000 yoki 1250):_",
                    parse_mode="Markdown"
                )

        elif data.startswith("ckr_cp_"):
            parts = data.split("_")
            reg_id = int(parts[2])
            cp_id = int(parts[3])
            cp_type = parts[4]

            reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
            cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == cp_id).first()
            cat_name = "Mijoz to'lovi" if cp_type == "client" else "Postavshikdan qaytgan pul"

            context.user_data["cash_tx"] = {
                "action": "kirim",
                "reg_id": reg_id,
                "category": cat_name,
                "cp_id": cp_id,
                "cp_name": cp.name if cp else "Kontragent",
                "step": "await_cash_amount"
            }

            debt_str = f"${cp.current_balance_usd:,.2f}" if cp else "$0.00"
            await query.message.reply_text(
                f"💵 **{cp.name if cp else 'Kontragent'} to'lagan summani yozing ({reg.currency if reg else 'UZS'}):**\n"
                f"🏢 Kassa: **{reg.name if reg else 'Kassa'}**\n"
                f"📊 Joriy qarzdorlik: **{debt_str}**\n\n"
                f"_Aniq summani raqam bilan yozib yuboring (masalan: 5000000 yoki 500):_",
                parse_mode="Markdown"
            )

        # ================= CHIQIM FLOW =================
        # Step 1: Select Register for Chiqim
        elif data == "cash_chiqim_start":
            registers = db.query(CashRegister).all()
            keyboard = []
            for r in registers:
                keyboard.append([InlineKeyboardButton(f"💵 {r.name} ({r.balance:,.0f} {r.currency})", callback_data=f"cch_reg_{r.id}")])
            await query.message.reply_text(
                "📤 **CHIQIM: Pul qaysi kassadan to'lansin?**" if lang == "uz" else "📤 **РАСХОД: Выберите кассу списания:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2: Main Expense Groups
        elif data.startswith("cch_reg_"):
            reg_id = int(data.split("_")[2])
            keyboard = [
                [InlineKeyboardButton("⚡ Bilvosita ishlab chiqarish xarajatlari" if lang == "uz" else "⚡ Косвенные производственные расходы", callback_data=f"cch_grp_{reg_id}_indirect")],
                [InlineKeyboardButton("🏢 Ma'muriyat va ofis xarajatlari" if lang == "uz" else "🏢 Административные расходы", callback_data=f"cch_grp_{reg_id}_admin")],
                [InlineKeyboardButton("🚚 Postavshikka to'lov (Yetkazib beruvchi)" if lang == "uz" else "🚚 Оплата поставщику", callback_data=f"cch_grp_{reg_id}_supplier")],
                [InlineKeyboardButton("💼 Boshqa chiqimlar" if lang == "uz" else "💼 Прочий расход", callback_data=f"cch_grp_{reg_id}_other")]
            ]
            await query.message.reply_text(
                "📋 **Xarajat toifasini tanlang:**" if lang == "uz" else "📋 **Выберите категорию расхода:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2.1: Indirect Production Expenses Subcategories
        elif data.startswith("cch_grp_") and data.endswith("_indirect"):
            reg_id = int(data.split("_")[2])
            keyboard = [
                [InlineKeyboardButton("⚡ Elektr energiya (Svet)", callback_data=f"cch_sub_{reg_id}_Elektr energiya (Svet)")],
                [InlineKeyboardButton("🔥 Tabiiy gaz", callback_data=f"cch_sub_{reg_id}_Tabiiy gaz")],
                [InlineKeyboardButton("💧 Suv va kanalizatsiya", callback_data=f"cch_sub_{reg_id}_Suv va kanalizatsiya")],
                [InlineKeyboardButton("🛠️ Uskunalar ta'miri va ehtiyot qismlar", callback_data=f"cch_sub_{reg_id}_Uskunalar ta'miri")],
                [InlineKeyboardButton("🏭 Sex ijarasi va xizmatlar", callback_data=f"cch_sub_{reg_id}_Sex ijarasi")],
                [InlineKeyboardButton("🚚 Transport va yoqilg'i", callback_data=f"cch_sub_{reg_id}_Transport va yoqilgi")],
                [InlineKeyboardButton("👥 Ishchilar oyligi / Avans", callback_data=f"cch_sub_{reg_id}_Ishchilar oyligi")],
                [InlineKeyboardButton("📦 Boshqa sex xarajatlari", callback_data=f"cch_sub_{reg_id}_Boshqa sex xarajati")]
            ]
            await query.message.reply_text(
                "⚡ **Aynan qaysi bilvosita ishlab chiqarish xarajati?**" if lang == "uz" else "⚡ **Выберите статью косвенных расходов:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2.2: Administrative Expenses Subcategories
        elif data.startswith("cch_grp_") and data.endswith("_admin"):
            reg_id = int(data.split("_")[2])
            keyboard = [
                [InlineKeyboardButton("🏢 Ofis ijarasi", callback_data=f"cch_sub_{reg_id}_Ofis ijarasi")],
                [InlineKeyboardButton("💻 Aloqa, Internet va IT", callback_data=f"cch_sub_{reg_id}_Aloqa va IT")],
                [InlineKeyboardButton("📑 Buxgalteriya va audit", callback_data=f"cch_sub_{reg_id}_Buxgalteriya")],
                [InlineKeyboardButton("📢 Reklama va marketing", callback_data=f"cch_sub_{reg_id}_Reklama va marketing")],
                [InlineKeyboardButton("🏛️ Soliqlar va davlat bojlari", callback_data=f"cch_sub_{reg_id}_Soliqlar va bojlar")],
                [InlineKeyboardButton("☕ Ofis va xo'jalik xarajatlari", callback_data=f"cch_sub_{reg_id}_Ofis xo'jalik")],
                [InlineKeyboardButton("📁 Boshqa ma'muriy xarajatlar", callback_data=f"cch_sub_{reg_id}_Boshqa ma'muriy")]
            ]
            await query.message.reply_text(
                "🏢 **Aynan qaysi ma'muriy xarajat?**" if lang == "uz" else "🏢 **Выберите статью административных расходов:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2.3: Supplier Payment Selection
        elif data.startswith("cch_grp_") and data.endswith("_supplier"):
            reg_id = int(data.split("_")[2])
            suppliers = db.query(MDMCounterparty).filter(MDMCounterparty.type == "supplier", MDMCounterparty.is_archived == False).all()
            keyboard = []
            for s in suppliers:
                keyboard.append([InlineKeyboardButton(f"🏢 {s.name} (${abs(s.current_balance_usd):,.0f})", callback_data=f"cch_cp_{reg_id}_{s.id}")])
            await query.message.reply_text(
                "🏢 **Qaysi yetkazib beruvchiga to'lov qilinmoqda?**" if lang == "uz" else "🏢 **Выберите поставщика:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2.4: Other Expense Selection
        elif data.startswith("cch_grp_") and data.endswith("_other"):
            reg_id = int(data.split("_")[2])
            reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
            context.user_data["cash_tx"] = {
                "action": "chiqim",
                "reg_id": reg_id,
                "category": "Boshqa chiqim",
                "cp_id": None,
                "cp_name": None,
                "step": "await_cash_amount"
            }
            await query.message.reply_text(
                f"💸 **Chiqim qilinadigan summani yozing ({reg.currency if reg else 'UZS'}):**\n"
                f"🏢 Kassa: **{reg.name if reg else 'Kassa'}** (Mavjud: {reg.balance:,.2f} {reg.currency if reg else ''})\n"
                f"📋 Xarajat toifasi: **Boshqa chiqim**\n\n"
                f"_Aniq summani raqam bilan yozib yuboring (masalan: 3500000 yoki 450):_",
                parse_mode="Markdown"
            )

        # Selected Subcategory prompt for Amount
        elif data.startswith("cch_sub_"):
            parts = data.split("_")
            reg_id = int(parts[2])
            cat_name = parts[3]

            reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
            context.user_data["cash_tx"] = {
                "action": "chiqim",
                "reg_id": reg_id,
                "category": cat_name,
                "cp_id": None,
                "cp_name": None,
                "step": "await_cash_amount"
            }
            await query.message.reply_text(
                f"💸 **Chiqim qilinadigan summani yozing ({reg.currency if reg else 'UZS'}):**\n"
                f"🏢 Kassa: **{reg.name if reg else 'Kassa'}** (Mavjud qoldiq: {reg.balance:,.2f} {reg.currency if reg else ''})\n"
                f"📋 Xarajat toifasi: **{cat_name}**\n\n"
                f"_Aniq summani raqam bilan yozib yuboring (masalan: 3500000 yoki 450):_",
                parse_mode="Markdown"
            )

        # Selected Supplier prompt for Amount
        elif data.startswith("cch_cp_"):
            parts = data.split("_")
            reg_id = int(parts[2])
            cp_id = int(parts[3])

            reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()
            cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == cp_id).first()

            context.user_data["cash_tx"] = {
                "action": "chiqim",
                "reg_id": reg_id,
                "category": "Postavshikka to'lov",
                "cp_id": cp_id,
                "cp_name": cp.name if cp else "Postavshik",
                "step": "await_cash_amount"
            }
            debt_str = f"${abs(cp.current_balance_usd):,.2f}" if cp else "$0.00"
            await query.message.reply_text(
                f"💸 **{cp.name if cp else 'Postavshik'}ga to'lanadigan summani yozing ({reg.currency if reg else 'UZS'}):**\n"
                f"🏢 Kassa: **{reg.name if reg else 'Kassa'}** (Mavjud qoldiq: {reg.balance:,.2f} {reg.currency if reg else ''})\n"
                f"📊 Qarzimiz: **{debt_str}**\n\n"
                f"_Aniq summani raqam bilan yozib yuboring (masalan: 12000000 yoki 1000):_",
                parse_mode="Markdown"
            )

        # Save without description
        elif data == "cash_save_no_desc":
            action = context.user_data.get("cash_tx", {}).get("action", "kassa")
            default_desc = f"Telegram bot orqali {action}"
            await execute_cash_transaction_db(query.message, context, default_desc, lang)

        # Cancel cash transaction
        elif data == "cash_cancel":
            context.user_data["cash_tx"] = {}
            await query.message.reply_text("❌ Kassa operatsiyasi bekor qilindi.", parse_mode="Markdown")

        # Storno Cash Transaction
        elif data.startswith("ctx_storno_"):
            tx_id = int(data.split("_")[2])
            tx = db.query(CashTransaction).filter(CashTransaction.id == tx_id).first()
            if not tx:
                await query.message.reply_text("❌ Kassa operatsiyasi topilmadi.")
                return
            if tx.status == "Storno":
                await query.message.reply_text("ℹ️ Ushbu operatsiya allaqachon storno qilingan.")
                return

            today = date.today()
            if is_month_closed(db, today):
                await query.message.reply_text("❌ Ushbu oy yopilgan! Operatsiya bajarilmadi.")
                return

            today_rate = get_exchange_rate_for_date(db, today)
            reg = db.query(CashRegister).filter(CashRegister.id == tx.register_id).first()
            if tx.type == "kirim":
                if reg.balance < tx.amount:
                    await query.message.reply_text("❌ Kassada storno qilish uchun yetarli mablag' qolmagan!")
                    return
                reg.balance -= tx.amount
                if tx.counterparty_id:
                    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == tx.counterparty_id).first()
                    if cp:
                        if tx.currency == "USD":
                            cp.current_balance_usd += tx.amount
                            cp.current_balance_uzs += tx.amount * today_rate
                        else:
                            cp.current_balance_uzs += tx.amount
                            cp.current_balance_usd += tx.amount / today_rate if today_rate > 0 else 0.0
            else: # chiqim
                reg.balance += tx.amount
                if tx.counterparty_id:
                    cp = db.query(MDMCounterparty).filter(MDMCounterparty.id == tx.counterparty_id).first()
                    if cp:
                        if tx.currency == "USD":
                            cp.current_balance_usd -= tx.amount
                            cp.current_balance_uzs -= tx.amount * today_rate
                        else:
                            cp.current_balance_uzs -= tx.amount
                            cp.current_balance_usd -= tx.amount / today_rate if today_rate > 0 else 0.0

            mirror_tx = CashTransaction(
                register_id=tx.register_id,
                date=today,
                type=tx.type,
                source_type=tx.source_type,
                category=tx.category,
                amount=-tx.amount,
                currency=tx.currency,
                counterparty_id=tx.counterparty_id,
                status="Storno",
                storno_ref_id=tx.id,
                description=f"Stornolangan: CSH-{tx.id:04d}"
            )
            db.add(mirror_tx)
            tx.status = "Storno"
            db.commit()

            await query.message.reply_text(
                f"↩️ **STORNO BAJARILDI!**\n`CSH-{tx.id:04d}` bekor qilindi.\nKassa va hisob-kitoblar qaytarildi.",
                parse_mode="Markdown"
            )
    finally:
        db.close()

# ==================== 3. PRODUCTION MODULE (5 LINES + CUSTOM WAREHOUSE ROUTING) ====================
async def handle_production_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    db = SessionLocal()
    try:
        lines = db.query(ProductionLine).order_by(ProductionLine.line_number).all()
        orders = db.query(ProductionOrder).filter(ProductionOrder.status == "Tasdiqlandi").all()

        line_totals = {l.id: 0.0 for l in lines}
        for o in orders:
            if o.line_id in line_totals:
                line_totals[o.line_id] += o.quantity

        total_m2 = sum(line_totals.values())

        headers = ["Liniya", "Kafel O'lchami", "Ishlab chiqarildi", "Ulush (%)"] if lang == "uz" else ["Линия", "Размер плитки", "Выпуск", "Доля (%)"]
        col_aligns = ["left", "center", "right", "center"]

        rows = []
        for l in lines:
            vol = line_totals.get(l.id, 0.0)
            pct = (vol / total_m2 * 100.0) if total_m2 > 0 else 0.0
            rows.append([
                l.name,
                l.spec_tile_size,
                f"{vol:,.1f} m²",
                f"{pct:.1f}%"
            ])

        total_row = [
            "JAMI ZAVOD:",
            "",
            f"{total_m2:,.1f} m²",
            "100.0%"
        ]

        title = "🏭 Ishlab chiqarish (5 Liniya)" if lang == "uz" else "🏭 Производство (5 Линий)"
        subtitle = f"📅 Sana: {date.today()} | 📐 Jami hajm: {total_m2:,.1f} m²"

        img_buf = render_excel_table_image(
            title=title,
            subtitle=subtitle,
            headers=headers,
            rows=rows,
            col_alignments=col_aligns,
            total_row=total_row
        )

        keyboard = [
            [InlineKeyboardButton("➕ Yangi ishlab chiqarishni kiritish" if lang == "uz" else "➕ Ввести выпуск продукции", callback_data="prod_wizard_start")],
            [InlineKeyboardButton("🚀 Mini App orqali ochish" if lang == "uz" else "🚀 Открыть в Mini App", web_app=WebAppInfo(url=WEBAPP_HTTPS_URL))]
        ]

        await update.message.reply_photo(
            photo=img_buf,
            caption=f"🏭 **Ishlab chiqarish:** Jami `{total_m2:,.1f} m²`\n\nYangi partiyani kiritish uchun quyidagi tugmani bosing:",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    finally:
        db.close()

# Production Wizard: Step 1 -> Line, Step 2 -> Tile, Step 3 -> Output Qty, Step 4 -> 2 Raw Warehouses -> Dynamic Stock Picker -> Increment Materials -> Execute
async def production_wizard_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    is_appr, u_role, db_user = check_bot_user_auth(query.from_user.id)
    if not is_appr or not get_role_capabilities(u_role)["production"]:
        await query.message.reply_text(f"⛔ Sizning rolingizda (`{u_role}`) Ishlab chiqarish amallariga ruxsat yo'q.")
        return

    data = query.data
    lang = get_user_lang(query.from_user.id)

    db = SessionLocal()
    try:
        # Step 1: Select Clean Line (Liniya 1..5)
        if data == "prod_wizard_start":
            lines = db.query(ProductionLine).order_by(ProductionLine.line_number).all()
            keyboard = []
            row = []
            for l in lines:
                row.append(InlineKeyboardButton(f"🏭 Liniya {l.line_number}", callback_data=f"pw_line_{l.id}"))
                if len(row) == 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            
            await query.message.reply_text(
                "🏭 **1-QADAM: Ishlab chiqarish liniyasini tanlang:**" if lang == "uz" else "🏭 **ШАГ 1: Выберите производственную линию:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 2: Select Tile
        elif data.startswith("pw_line_"):
            line_id = int(data.split("_")[2])
            tiles = db.query(MDMMaterial).filter(MDMMaterial.category == "Tayyor mahsulot").all()
            keyboard = []
            for t_item in tiles:
                keyboard.append([InlineKeyboardButton(f"🧱 {t_item.name}", callback_data=f"pw_tile_{line_id}_{t_item.id}")])
            
            await query.message.reply_text(
                "🧱 **2-QADAM: Chiqarilgan kafel turini tanlang:**" if lang == "uz" else "🧱 **ШАГ 2: Выберите готовую плитку:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 3: Prompt User to TYPE Output Tile Quantity
        elif data.startswith("pw_tile_"):
            parts = data.split("_")
            line_id = int(parts[2])
            mat_id = int(parts[3])

            context.user_data["pw_state"] = {
                "line_id": line_id,
                "mat_id": mat_id,
                "step": "await_qty",
                "custom_materials": {}
            }

            prompt = (
                "✏️ **3-QADAM: Chiqarilgan tayyor kafel hajmini (m²) yozib yuboring:**\n\n"
                "_Masalan: 1250 yoki 850.5 deb yuboring._"
                if lang == "uz" else
                "✏️ **ШАГ 3: Напишите и отправьте объем выпуска (м²):**\n\n"
                "_Например: отправьте 1250 или 850.5_"
            )
            await query.message.reply_text(prompt, parse_mode="Markdown")

        # Step 4: User selects Raw Materials Warehouse (WH-02 or WH-03)
        elif data.startswith("pw_raw_wh_"):
            src_wh_id = int(data.split("_")[3])
            if "pw_state" not in context.user_data:
                context.user_data["pw_state"] = {}
            if "custom_materials" not in context.user_data["pw_state"]:
                context.user_data["pw_state"]["custom_materials"] = {}
            
            context.user_data["pw_state"]["src_wh_id"] = src_wh_id
            context.user_data["pw_state"]["step"] = "picking_mats"

            await show_raw_material_picker(query.message, context, db, lang)

        # Switch warehouse menu
        elif data == "pw_switch_wh":
            keyboard = [
                [InlineKeyboardButton("🏢 Xomashyo ombori (Materiallar)" if lang == "uz" else "🏢 Склад сырья (Материалы)", callback_data="pw_raw_wh_2")],
                [InlineKeyboardButton("🏢 Aralash ombor" if lang == "uz" else "🏢 Смешанный склад", callback_data="pw_raw_wh_3")],
                [InlineKeyboardButton("🔙 Hozirgi omborga qaytish" if lang == "uz" else "🔙 Назад", callback_data="pw_show_mats")]
            ]
            await query.message.reply_text(
                "🔄 **Qaysi ombordan xomashyo qo'shmoqchisiz?**" if lang == "uz" else "🔄 **Выберите склад для списания материалов:**",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )

        # Step 5: User clicks a specific material from that warehouse
        elif data.startswith("pw_pick_mat_"):
            parts = data.split("_")
            wh_id = int(parts[3])
            mat_id = int(parts[4])
            
            mat = db.query(MDMMaterial).filter(MDMMaterial.id == mat_id).first()
            wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
            stock = db.query(StockItem).filter(StockItem.warehouse_id == wh_id, StockItem.material_id == mat_id).first()
            stock_qty = stock.quantity if stock else 0.0
            mat_name = mat.name if mat else "Material"
            mat_unit = mat.unit if mat else "kg"
            wh_name = wh.name if wh else "Ombor"

            context.user_data["pw_state"]["current_pick_wh_id"] = wh_id
            context.user_data["pw_state"]["current_pick_mat_id"] = mat_id
            context.user_data["pw_state"]["step"] = "await_mat_pick_qty"

            prompt = (
                f"🧪 **{mat_name}** dan qancha sarflandi ({mat_unit})?\n"
                f"🏢 _Tanlangan ombor: **{wh_name}** (Qoldiq: {stock_qty:,.1f} {mat_unit})_\n\n"
                f"_Aniq sarflangan miqdorni raqam bilan yozib yuboring (masalan: 12500 yoki agar sarflanmagan bo'lsa 0):_"
                if lang == "uz" else
                f"🧪 Сколько израсходовано **{mat_name}** ({mat_unit})?\n"
                f"🏢 _Склад: **{wh_name}** (Остаток: {stock_qty:,.1f} {mat_unit})_\n\n"
                f"_Напишите количество числом (например: 12500 или 0):_"
            )
            await query.message.reply_text(prompt, parse_mode="Markdown")

        # Refresh material picker
        elif data == "pw_show_mats":
            await show_raw_material_picker(query.message, context, db, lang)

        # Cancel production callback
        elif data == "pw_cancel":
            context.user_data["pw_state"] = {}
            await query.message.reply_text("❌ Ishlab chiqarish bekor qilindi.", parse_mode="Markdown")

        # Step 6: Final Execution in Database
        elif data == "pw_exec_final":
            state = context.user_data.get("pw_state", {})
            line_id = state.get("line_id", 1)
            mat_id = state.get("mat_id", 1)
            qty = state.get("qty", 1000.0)
            dst_wh_id = 1 # Always WH-01 (Tayyor mahsulotlar ombori)
            custom_mats = state.get("custom_materials", {})

            today = date.today()
            if is_month_closed(db, today):
                await query.message.reply_text("❌ Ushbu oy yopilgan! Operatsiya bajarilmadi.")
                return

            line = db.query(ProductionLine).filter(ProductionLine.id == line_id).first()
            output_mat = db.query(MDMMaterial).filter(MDMMaterial.id == mat_id).first()
            dst_wh = db.query(Warehouse).filter(Warehouse.id == dst_wh_id).first()

            count = db.query(func.count(ProductionOrder.id)).scalar() or 0
            order_num = f"PRD-{today.strftime('%Y%m%d')}-{count + 1:04d}"

            consumed_records = []
            direct_cost = 0.0
            consumed_summary_text = ""

            try:
                for key, item in custom_mats.items():
                    c_wh_id = item["wh_id"]
                    c_mat_id = item["mat_id"]
                    c_qty = item["qty"]

                    if c_qty <= 0:
                        continue
                    mat_obj = db.query(MDMMaterial).filter(MDMMaterial.id == c_mat_id).first()
                    wh_obj = db.query(Warehouse).filter(Warehouse.id == c_wh_id).first()
                    if not mat_obj:
                        continue
                    
                    u_cost = deduct_stock(db, c_wh_id, c_mat_id, c_qty)
                    tot_c = c_qty * u_cost
                    direct_cost += tot_c
                    consumed_records.append(ProductionConsumedMaterial(
                        material_id=c_mat_id,
                        warehouse_id=c_wh_id,
                        quantity=c_qty,
                        unit_cost_usd=u_cost,
                        total_cost_usd=tot_c
                    ))
                    consumed_summary_text += f"  • [{wh_obj.name if wh_obj else 'Ombor'}] {mat_obj.name}: `{c_qty:,.1f} {mat_obj.unit}` (`${tot_c:,.2f}`)\n"

                unit_direct_cost = direct_cost / qty if qty > 0 else 0.0

                order = ProductionOrder(
                    order_number=order_num,
                    line_id=line_id,
                    output_material_id=mat_id,
                    quantity=qty,
                    date=today,
                    status="Tasdiqlandi",
                    direct_cost_usd=direct_cost,
                    allocated_indirect_cost_usd=0.0,
                    total_cost_usd=direct_cost,
                    unit_cost_usd=unit_direct_cost,
                    notes=f"Telegram bot orqali kiritildi. Kirim: {dst_wh.name if dst_wh else 'Tayyor mahsulotlar'}",
                    consumed_materials=consumed_records
                )
                db.add(order)
                db.flush()

                # Add Finished Goods to WH-01 (Tayyor mahsulotlar ombori)
                add_stock_with_avg_valuation(
                    db=db,
                    warehouse_id=dst_wh_id,
                    material_id=mat_id,
                    quantity=qty,
                    unit_price=unit_direct_cost,
                    currency="USD",
                    trans_date=today
                )
                db.commit()
                db.refresh(order)
            except HTTPException as he:
                db.rollback()
                await query.message.reply_text(he.detail, parse_mode="Markdown")
                return
            except Exception as e:
                db.rollback()
                await query.message.reply_text(f"❌ Xatolik yuz berdi: {str(e)}", parse_mode="Markdown")
                return

            # Clear state
            context.user_data["pw_state"] = {}

            storno_kb = [
                [InlineKeyboardButton("↩️ Storno qilish (Bekor qilish)" if lang == "uz" else "↩️ Сторнировать", callback_data=f"pw_storno_{order.id}_{dst_wh_id}")]
            ]

            confirm_msg = (
                f"✅ **ISHLAB CHIQARISH TASDIQLANDI!**\n"
                f"━━━━━━━━━━━━━━━━━━━\n"
                f"📋 **Hujjat №:** `{order.order_number}`\n"
                f"🏭 **Liniya:** `{line.name if line else 'Liniya'}`\n"
                f"🧱 **Mahsulot:** `{output_mat.name if output_mat else 'Kafel'}`\n"
                f"📐 **Kiritilgan hajm:** `{qty:,.1f} m²`\n"
                f"💵 **Jami xomashyo tannarxi:** `${direct_cost:,.2f}` (`${unit_direct_cost:.2f} / m²`)\n"
                f"📥 **Kirim ombori:** `{dst_wh.name if dst_wh else 'Tayyor mahsulotlar'}` (+{qty:,.1f} m²)\n\n"
                f"🧪 **Sarflangan materiallar (Omborlar bo'yicha):**\n"
                f"{consumed_summary_text if consumed_summary_text else '  • Xomashyo sarflanmadi'}"
                f"━━━━━━━━━━━━━━━━━━━\n"
                f"ℹ️ _Xatolik bo'lsa, quyidagi Storno tugmasi orqali bekor qilishingiz mumkin._"
            )

            await query.message.reply_text(
                confirm_msg,
                reply_markup=InlineKeyboardMarkup(storno_kb),
                parse_mode="Markdown"
            )

        elif data.startswith("pw_storno_"):
            parts = data.split("_")
            order_id = int(parts[2])
            dst_wh_id = int(parts[3]) if len(parts) > 3 else 1

            order = db.query(ProductionOrder).filter(ProductionOrder.id == order_id).first()
            if not order:
                await query.message.reply_text("❌ Buyurtma topilmadi.")
                return
            if order.status == "Storno":
                await query.message.reply_text("ℹ️ Ushbu buyurtma allaqachon storno qilingan.")
                return

            deduct_stock(db, dst_wh_id, order.output_material_id, order.quantity)

            for c in order.consumed_materials:
                add_stock_with_avg_valuation(
                    db=db,
                    warehouse_id=c.warehouse_id,
                    material_id=c.material_id,
                    quantity=c.quantity,
                    unit_price=c.unit_cost_usd,
                    currency="USD",
                    trans_date=order.date
                )

            mirror_order = ProductionOrder(
                order_number=f"STORNO-{order.order_number}",
                line_id=order.line_id,
                output_material_id=order.output_material_id,
                quantity=-order.quantity,
                date=order.date,
                status="Storno",
                direct_cost_usd=-order.direct_cost_usd,
                allocated_indirect_cost_usd=0.0,
                total_cost_usd=-order.total_cost_usd,
                unit_cost_usd=order.unit_cost_usd,
                storno_ref_id=order.id,
                notes=f"Stornolangan: {order.order_number}"
            )
            db.add(mirror_order)
            order.status = "Storno"
            db.commit()

            await query.message.reply_text(
                f"↩️ **STORNO BAJARILDI!**\n`{order.order_number}` bekor qilindi.\nXomashyo omborga qaytarildi.",
                parse_mode="Markdown"
            )
    finally:
        db.close()

async def show_raw_material_picker(message, context: ContextTypes.DEFAULT_TYPE, db, lang: str):
    state = context.user_data.get("pw_state", {})
    line_id = state.get("line_id", 1)
    mat_id = state.get("mat_id", 1)
    qty = state.get("qty", 1000.0)
    src_wh_id = state.get("src_wh_id", 2)
    custom_mats = state.get("custom_materials", {})

    line = db.query(ProductionLine).filter(ProductionLine.id == line_id).first()
    output_mat = db.query(MDMMaterial).filter(MDMMaterial.id == mat_id).first()
    src_wh = db.query(Warehouse).filter(Warehouse.id == src_wh_id).first()

    # Query all raw materials in that warehouse with current stock
    raw_mats = (
        db.query(MDMMaterial, StockItem)
        .outerjoin(StockItem, (StockItem.material_id == MDMMaterial.id) & (StockItem.warehouse_id == src_wh_id))
        .filter(MDMMaterial.category != "Tayyor mahsulot", MDMMaterial.is_archived == False)
        .order_by(MDMMaterial.id)
        .all()
    )

    direct_cost = 0.0
    mat_lines = []
    for key, item in custom_mats.items():
        m_wh_id = item["wh_id"]
        m_id = item["mat_id"]
        m_qty = item["qty"]

        if m_qty > 0:
            m_obj = db.query(MDMMaterial).filter(MDMMaterial.id == m_id).first()
            wh_obj = db.query(Warehouse).filter(Warehouse.id == m_wh_id).first()
            sb = db.query(StockItem).filter(StockItem.warehouse_id == m_wh_id, StockItem.material_id == m_id).first()
            unit_price = sb.avg_cost_usd if (sb and sb.avg_cost_usd > 0) else (m_obj.current_avg_price_usd if m_obj else 0.08)
            line_tot = m_qty * unit_price
            direct_cost += line_tot
            wh_label = f"[{wh_obj.name}] " if wh_obj else ""
            mat_lines.append(f"  • {wh_label}**{m_obj.name if m_obj else 'Material'}**: `{m_qty:,.1f} {m_obj.unit if m_obj else 'kg'}` (~`${line_tot:,.2f}`)")

    unit_cost = direct_cost / qty if qty > 0 else 0.0

    keyboard = []
    for m, si in raw_mats:
        stock_qty = si.quantity if (si and si.quantity is not None) else 0.0
        k = f"{src_wh_id}_{m.id}"
        added_item = custom_mats.get(k)
        added_qty = added_item["qty"] if added_item else 0.0
        
        if added_qty > 0:
            btn_label = f"✅ {m.name} ({added_qty:,.0f} {m.unit} kiritildi)"
        else:
            btn_label = f"🧪 {m.name} (Qoldiq: {stock_qty:,.0f} {m.unit})"
        
        keyboard.append([InlineKeyboardButton(btn_label, callback_data=f"pw_pick_mat_{src_wh_id}_{m.id}")])

    # Action navigation buttons
    keyboard.append([
        InlineKeyboardButton("🔄 Boshqa omborga o'tish" if lang == "uz" else "🔄 Перейти на другой склад", callback_data="pw_switch_wh")
    ])
    if len(custom_mats) > 0:
        keyboard.append([InlineKeyboardButton("✅ Barcha sarf xomashyolar kiritildi (Tasdiqlash)" if lang == "uz" else "✅ Подтвердить все введенные материалы", callback_data="pw_exec_final")])
    keyboard.append([InlineKeyboardButton("❌ Bekor qilish" if lang == "uz" else "❌ Отмена", callback_data="pw_cancel")])

    summary_header = (
        f"🏭 **Liniya:** `{line.name if line else 'Liniya'}` | 🧱 **Mahsulot:** `{output_mat.name if output_mat else 'Kafel'}` ({qty:,.1f} m²)\n"
        f"📥 **Kirim:** `Tayyor mahsulotlar ombori`\n"
        f"📍 **Hozirgi tanlangan ombor:** `{src_wh.name if src_wh else 'Xomashyo ombori'}`\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
    )

    if mat_lines:
        content_text = (
            f"{summary_header}"
            f"📋 **Hozircha kiritilgan sarf materiallari:**\n"
            f"{chr(10).join(mat_lines)}\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"💵 **Hisoblangan tannarx:** `${direct_cost:,.2f}` (`${unit_cost:.2f} / m²`)\n\n"
            f"👇 **Ushbu ombordan material tanlang, boshqa omborga o'ting yoki tasdiqlang:**"
        )
    else:
        content_text = (
            f"{summary_header}"
            f"🧪 **{src_wh.name if src_wh else 'Ombor'}dagi mavjud materiallar:**\n\n"
            f"👇 **Sarflangan materialni tanlang va qancha ketganini yozing:**"
        )

    await message.reply_text(
        content_text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

# ==================== 4. BALANCES MODULE (CLIENT VS SUPPLIER SELECTION FIRST) ====================
async def handle_balances_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    keyboard = [
        [
            InlineKeyboardButton("👤 Mijozlar balansi (Debitorlik)" if lang == "uz" else "👤 Балансы клиентов (Дебиторка)", callback_data="bal_type_client")
        ],
        [
            InlineKeyboardButton("🏢 Yetkazib beruvchilar (Kreditorlik)" if lang == "uz" else "🏢 Поставщики (Кредиторка)", callback_data="bal_type_supplier")
        ]
    ]
    await update.message.reply_text(
        "👥 **Kimlarning balansini ko'rmoqchisiz?**" if lang == "uz" else "👥 **Чей баланс вы хотите посмотреть?**",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def balances_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    is_appr, u_role, db_user = check_bot_user_auth(query.from_user.id)
    if not is_appr or not get_role_capabilities(u_role)["balances"]:
        await query.message.reply_text(f"⛔ Sizning rolingizda (`{u_role}`) Balanslarni ko'rish ruxsati yo'q.")
        return

    data = query.data
    lang = get_user_lang(query.from_user.id)
    cp_type = "client" if data == "bal_type_client" else "supplier"

    db = SessionLocal()
    try:
        cps = db.query(MDMCounterparty).filter(MDMCounterparty.type == cp_type, MDMCounterparty.is_archived == False).all()
        today_rate = get_exchange_rate_for_date(db, date.today())

        if cp_type == "client":
            headers = ["Mijoz nomi", "Viloyat", "Qarzdorlik (USD)", "Qarzdorlik (UZS)"] if lang == "uz" else ["Клиент", "Регион", "Долг (USD)", "Долг (UZS)"]
            title = "👤 Mijozlar qarzdorligi (Debitorlik)" if lang == "uz" else "👤 Задолженность клиентов (Дебиторка)"
        else:
            headers = ["Postavshik nomi", "Viloyat", "Qarzimiz (USD)", "Qarzimiz (UZS)"] if lang == "uz" else ["Поставщик", "Регион", "Наш долг (USD)", "Наш долг (UZS)"]
            title = "🏢 Yetkazib beruvchilarga qarz (Kreditorlik)" if lang == "uz" else "🏢 Задолженность поставщикам (Кредиторка)"

        col_aligns = ["left", "left", "right", "right"]
        rows = []
        total_usd = 0.0

        for cp in cps:
            bal_usd = abs(cp.current_balance_usd)
            total_usd += bal_usd
            rows.append([
                cp.name,
                cp.region or "-",
                f"${bal_usd:,.2f}",
                f"{bal_usd * today_rate:,.0f} UZS"
            ])

        total_row = [
            "JAMI QARZDORLIK:" if lang == "uz" else "ИТОГО:",
            "",
            f"${total_usd:,.2f}",
            f"{total_usd * today_rate:,.0f} UZS"
        ]

        subtitle = f"📅 Sana: {date.today()} | 📈 CBU: 1 USD = {today_rate:,.0f} UZS"

        img_buf = render_excel_table_image(
            title=title,
            subtitle=subtitle,
            headers=headers,
            rows=rows,
            col_alignments=col_aligns,
            total_row=total_row
        )

        await query.message.reply_photo(
            photo=img_buf,
            caption=f"👥 **{title}**\n💰 Jami: `${total_usd:,.2f}` (`{total_usd * today_rate:,.0f} UZS`)",
            parse_mode="Markdown"
        )
    finally:
        db.close()

# ==================== 5. FINANCE & PnL MODULE ====================
async def handle_finance_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang: str):
    db = SessionLocal()
    try:
        ym = date.today().strftime("%Y-%m")
        pnl = get_pnl_report(db, ym)

        headers = ["Ko'rsatkich", "Summa (USD $)", "Izoh"] if lang == "uz" else ["Показатель", "Сумма (USD $)", "Описание"]
        col_aligns = ["left", "right", "left"]

        rows = [
            ["📈 Tushum (Revenue)", f"${pnl['revenue_usd']:,.2f}", "Sotuvlar summasi"],
            ["🧱 To'g'ridan-to'g'ri xomashyo", f"${pnl['cogs_direct_materials_usd']:,.2f}", "Sarflangan xomashyo (AVG)"],
            ["⚡ Taqsimlangan xarajatlar", f"${pnl['cogs_indirect_expenses_usd']:,.2f}", "Elektr, gaz, ijara, maosh"],
            ["📉 JAMI TANNARX (COGS)", f"${pnl['total_cogs_usd']:,.2f}", "Xomashyo + Bilvosita"],
            ["🏢 Ma'muriy xarajatlar", f"${pnl['admin_expenses_usd']:,.2f}", "Ofis va boshqa xarajatlar"],
            ["💎 SOF FOYDA (Net Profit)", f"${pnl['net_profit_usd']:,.2f}", f"Rentabellik: {((pnl['net_profit_usd']/pnl['revenue_usd']*100) if pnl['revenue_usd']>0 else 0):.1f}%"]
        ]

        title = f"📊 Foyda va Zarar (PnL: {ym})" if lang == "uz" else f"📊 Отчет о прибылях (PnL: {ym})"
        subtitle = f"🔒 Holati: {'Yopilgan (Locked)' if pnl['is_closed'] else 'Davr Ochiq'} | Valyuta: USD"

        img_buf = render_excel_table_image(
            title=title,
            subtitle=subtitle,
            headers=headers,
            rows=rows,
            col_alignments=col_aligns
        )

        await update.message.reply_photo(
            photo=img_buf,
            caption=f"📊 **PnL Moliyaviy hisobot ({ym})**\n💎 Sof foyda: `${pnl['net_profit_usd']:,.2f}`"
        )
    finally:
        db.close()

# ==================== TEXT MESSAGES DISPATCHER ====================
async def handle_text_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw_text = (update.message.text or "").strip()
    text = raw_text.lower()
    user = update.effective_user
    lang = get_user_lang(user.id)
    
    # 0. Check if user is in Cash Wizard
    cash_tx = context.user_data.get("cash_tx", {})
    c_step = cash_tx.get("step")

    if c_step:
        db = SessionLocal()
        try:
            if c_step == "await_cash_amount":
                try:
                    amt = float(raw_text.replace(",", ".").replace(" ", ""))
                    if amt <= 0:
                        raise ValueError()

                    reg_id = cash_tx.get("reg_id")
                    action = cash_tx.get("action")
                    reg = db.query(CashRegister).filter(CashRegister.id == reg_id).first()

                    # Strict non-negative cash balance check
                    if action == "chiqim" and reg and round(reg.balance, 4) < round(amt, 4):
                        await update.message.reply_text(
                            f"❌ **Kassada yetarli mablag' mavjud emas!**\n"
                            f"🏢 Kassa: **{reg.name}**\n"
                            f"🔻 Talab qilingan: `{amt:,.2f} {reg.currency}`\n"
                            f"📊 Mavjud qoldiq: `{reg.balance:,.2f} {reg.currency}`\n\n"
                            f"⚠️ _Iltimos, mavjud mablag'dan ({reg.balance:,.2f} {reg.currency}) oshmagan summa kiriting:_",
                            parse_mode="Markdown"
                        )
                        return

                    context.user_data["cash_tx"]["amount"] = amt
                    context.user_data["cash_tx"]["step"] = "await_cash_description"

                    cat_name = cash_tx.get("category", "")
                    cp_name = cash_tx.get("cp_name")
                    target_label = f"{cat_name} ({cp_name})" if cp_name else cat_name

                    keyboard = [
                        [InlineKeyboardButton("⏩ Izohsiz saqlash (Tasdiqlash)" if lang == "uz" else "⏩ Сохранить без описания", callback_data="cash_save_no_desc")],
                        [InlineKeyboardButton("❌ Bekor qilish" if lang == "uz" else "❌ Отмена", callback_data="cash_cancel")]
                    ]

                    action_str = "Kirim" if action == "kirim" else "Chiqim"
                    await update.message.reply_text(
                        f"📝 **{action_str} operatsiyasi uchun izoh (opisaniye) kiritasizmi?**\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"💵 **Kassa:** `{reg.name if reg else 'Kassa'}`\n"
                        f"💰 **Kiritilgan summa:** `{amt:,.2f} {reg.currency if reg else 'UZS'}`\n"
                        f"📋 **Toifa / Manba:** `{target_label}`\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"_Izohni quyida matn ko'rinishida yozib yuborishingiz yoki izohsiz saqlash tugmasini bosishingiz mumkin:_"
                        if lang == "uz" else
                        f"📝 **Хотите добавить описание (комментарий)?**\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"💵 **Касса:** `{reg.name if reg else 'Касса'}`\n"
                        f"💰 **Сумма:** `{amt:,.2f} {reg.currency if reg else 'UZS'}`\n"
                        f"📋 **Статья / Источник:** `{target_label}`\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"_Напишите комментарий в сообщении или нажмите кнопку сохранить без описания:_",
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="Markdown"
                    )
                    return
                except Exception:
                    await update.message.reply_text(
                        "⚠️ **Iltimos, summani to'g'ri raqamda kiriting:**\n_Masalan: 5000000 yoki 1250.50_"
                        if lang == "uz" else
                        "⚠️ **Пожалуйста, введите корректную сумму:**\n_Например: 5000000 или 1250.50_",
                        parse_mode="Markdown"
                    )
                    return

            elif c_step == "await_cash_description":
                desc = raw_text.strip()
                await execute_cash_transaction_db(update.message, context, desc, lang)
                return
        finally:
            db.close()

    # 1. Check if user is in Production Wizard
    pw_state = context.user_data.get("pw_state", {})
    step = pw_state.get("step")

    if step:
        db = SessionLocal()
        try:
            # 1.1 Produced Quantity (m²) -> Auto WH-01 and Prompt 2 Raw Warehouses
            if step == "await_qty":
                try:
                    qty = float(raw_text.replace(",", ".").replace(" ", ""))
                    if qty <= 0:
                        raise ValueError()
                    context.user_data["pw_state"]["qty"] = qty
                    context.user_data["pw_state"]["dst_wh_id"] = 1 # WH-01 Tayyor mahsulotlar ombori
                    context.user_data["pw_state"]["step"] = "await_raw_wh"

                    # Only 2 warehouses for raw materials: WH-02 (Xomashyo ombori) and WH-03 (Aralash ombor)
                    keyboard = [
                        [InlineKeyboardButton("🏢 Xomashyo ombori (Materiallar)" if lang == "uz" else "🏢 Склад сырья (Материалы)", callback_data="pw_raw_wh_2")],
                        [InlineKeyboardButton("🏢 Aralash ombor" if lang == "uz" else "🏢 Смешанный склад", callback_data="pw_raw_wh_3")]
                    ]

                    msg = (
                        f"✅ Tayyor kafel hajmi: **{qty:,.1f} m²**\n"
                        f"📥 Mahsulot to'g'ridan-to'g'ri **\"Tayyor mahsulotlar ombori\"**ga kirim qilinadi.\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"🧪 **4-QADAM: Sarflanadigan xomashyolar QAYSI OMBORDAN chiqim qilinsin?**"
                        if lang == "uz" else
                        f"✅ Объем плитки: **{qty:,.1f} м²**\n"
                        f"📥 Продукция автоматически приходуется на **\"Склад готовой продукции\"**.\n"
                        f"━━━━━━━━━━━━━━━━━━━\n"
                        f"🧪 **ШАГ 4: С какого склада списать сырье и материалы?**"
                    )
                    
                    await update.message.reply_text(
                        msg,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="Markdown"
                    )
                    return
                except Exception:
                    await update.message.reply_text(
                        "⚠️ **Iltimos, hajm miqdorini to'g'ri raqamda kiriting:**\n_Masalan: 1250 yoki 850.5_"
                        if lang == "uz" else
                        "⚠️ **Пожалуйста, введите корректное число:**\n_Например: 1250 или 850.5_",
                        parse_mode="Markdown"
                    )
                    return

            # 1.2 Picked Material Quantity Input
            elif step == "await_mat_pick_qty":
                try:
                    mat_qty = float(raw_text.replace(",", ".").replace(" ", ""))
                    if mat_qty < 0:
                        raise ValueError()
                    
                    mat_id = context.user_data["pw_state"].get("current_pick_mat_id")
                    wh_id = context.user_data["pw_state"].get("current_pick_wh_id", 2)
                    if mat_id:
                        mat_obj = db.query(MDMMaterial).filter(MDMMaterial.id == mat_id).first()
                        wh_obj = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
                        stock = db.query(StockItem).filter(StockItem.warehouse_id == wh_id, StockItem.material_id == mat_id).first()
                        stock_qty = stock.quantity if stock else 0.0
                        mat_unit = mat_obj.unit if mat_obj else "kg"
                        mat_name = mat_obj.name if mat_obj else "Material"
                        wh_name = wh_obj.name if wh_obj else "Ombor"

                        # Strict check: Cannot deduct more than available in warehouse
                        if mat_qty > stock_qty:
                            await update.message.reply_text(
                                f"❌ **Omborda yetarli qoldiq mavjud emas!**\n"
                                f"🏢 Ombor: **{wh_name}**\n"
                                f"📦 Mahsulot: **{mat_name}**\n"
                                f"🔻 Talab qilingan: `{mat_qty:,.1f} {mat_unit}`\n"
                                f"📊 Ombordagi mavjud qoldiq: `{stock_qty:,.1f} {mat_unit}`\n\n"
                                f"⚠️ _Iltimos, mavjud qoldiqdan ({stock_qty:,.1f} {mat_unit}) oshmagan miqdor kiriting yoki 0 deb yuboring:_",
                                parse_mode="Markdown"
                            )
                            return

                        k = f"{wh_id}_{mat_id}"
                        if mat_qty > 0:
                            context.user_data["pw_state"]["custom_materials"][k] = {
                                "wh_id": wh_id,
                                "mat_id": mat_id,
                                "qty": mat_qty
                            }
                        else:
                            context.user_data["pw_state"]["custom_materials"].pop(k, None)

                    context.user_data["pw_state"]["step"] = "picking_mats"
                    await show_raw_material_picker(update.message, context, db, lang)
                    return
                except Exception:
                    await update.message.reply_text("⚠️ Iltimos, miqdorni to'g'ri raqamda kiriting (masalan: 12500 yoki 0):")
                    return
        finally:
            db.close()

    # 2. Main menu handlers with authorization check
    is_appr, u_role, db_user = check_bot_user_auth(update.effective_user.id)
    if not is_appr and ("ombor" in text or "склад" in text or "kassa" in text or "касс" in text or "ishlab" in text or "производ" in text or "balans" in text or "баланс" in text or "moliya" in text or "финанс" in text):
        await update.message.reply_text(
            "⏳ **Hurmatli xodim!**\nSizning akkauntingiz administrator tomonidan tasdiqlanishi kutilmoqda. Administrator sizga rol berganidan so'ng ushbu bo'limlardan foydalanishingiz mumkin."
            if lang == "uz" else
            "⏳ **Уважаемый сотрудник!**\nВаш аккаунт ожидает подтверждения Администратором. Доступ откроется после назначения роли.",
            parse_mode="Markdown"
        )
        return

    caps = get_role_capabilities(u_role if is_appr else "")

    if "ombor" in text or "склад" in text:
        if not caps["ombor"]:
            await update.message.reply_text(
                f"⛔ Sizning biriktirilgan rollaringizda (`{u_role}`) **Ombor** bo'limiga kirish ruxsati yo'q."
                if lang == "uz" else
                f"⛔ В ваших назначенных ролях (`{u_role}`) нет доступа к разделу **Склад**."
            )
            return
        await handle_warehouse_menu(update, context, lang)
    elif "kassa" in text or "касс" in text:
        if not caps["kassa"]:
            await update.message.reply_text(
                f"⛔ Sizning biriktirilgan rollaringizda (`{u_role}`) **Kassa** bo'limiga kirish ruxsati yo'q."
                if lang == "uz" else
                f"⛔ В ваших назначенных ролях (`{u_role}`) нет доступа к разделу **Касса**."
            )
            return
        await handle_cash_menu(update, context, lang)
    elif "ishlab" in text or "производ" in text:
        if not caps["production"]:
            await update.message.reply_text(
                f"⛔ Sizning biriktirilgan rollaringizda (`{u_role}`) **Ishlab chiqarish** bo'limiga kirish ruxsati yo'q."
                if lang == "uz" else
                f"⛔ В ваших назначенных ролях (`{u_role}`) нет доступа к разделу **Производство**."
            )
            return
        await handle_production_menu(update, context, lang)
    elif "balans" in text or "баланс" in text:
        if not caps["balances"]:
            await update.message.reply_text(
                f"⛔ Sizning biriktirilgan rollaringizda (`{u_role}`) **Balanslar** bo'limiga kirish ruxsati yo'q."
                if lang == "uz" else
                f"⛔ В ваших назначенных ролях (`{u_role}`) нет доступа к разделу **Балансы**."
            )
            return
        await handle_balances_menu(update, context, lang)
    elif "moliya" in text or "финанс" in text or "pnl" in text:
        if not caps["finance"]:
            await update.message.reply_text(
                f"⛔ Sizning biriktirilgan rollaringizda (`{u_role}`) **Moliya** bo'limiga kirish ruxsati yo'q."
                if lang == "uz" else
                f"⛔ В ваших назначенных ролях (`{u_role}`) нет доступа к разделу **Финансы**."
            )
            return
        await handle_finance_menu(update, context, lang)
    elif "til" in text or "язык" in text or "сменить" in text:
        await start_cmd(update, context)
    else:
        await update.message.reply_text(BOT_TEXTS[lang]["welcome"], reply_markup=get_main_keyboard(lang, u_role if is_appr else ""), parse_mode="Markdown")

def create_bot_app():
    req = HTTPXRequest(
        connection_pool_size=8,
        read_timeout=60.0,
        write_timeout=60.0,
        connect_timeout=30.0,
        pool_timeout=30.0
    )
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).request(req).build()
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CallbackQueryHandler(lang_callback, pattern="^lang_"))
    app.add_handler(CallbackQueryHandler(warehouse_callback, pattern="^wh"))
    app.add_handler(CallbackQueryHandler(cash_ops_callback, pattern="^cash_|^ckr_|^cch_|^ctx_"))
    app.add_handler(CallbackQueryHandler(production_wizard_callback, pattern="^pw_|^prod_wizard_start"))
    app.add_handler(CallbackQueryHandler(balances_callback, pattern="^bal_type_"))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_messages))
    return app

async def start_telegram_bot():
    try:
        bot_app = create_bot_app()
        logger.info("Initializing Telegram Bot Polling...")
        await bot_app.initialize()
        await bot_app.start()
        await bot_app.updater.start_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)
        return bot_app
    except Exception as e:
        logger.warning(f"Telegram bot polling notice ({e}).")
        return None
