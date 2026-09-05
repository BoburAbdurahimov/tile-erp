const I18N = {
  uz: {
    app_title: "Kafel Zavodi ERP",
    app_subtitle: "Ishlab chiqarish & Boshqaruv",
    
    // Nav
    nav_dashboard: "Bosh panel",
    // Short labels for the Telegram Mini App bottom bar (long ones wrap on 375px screens)
    nav_dashboard_short: "Bosh",
    nav_production_short: "Ishlab ch.",
    nav_ombor_short: "Ombor",
    nav_kassa_short: "Kassa",
    nav_balances_short: "Balans",
    nav_finance_short: "Moliya",
    nav_mdm: "MDM",
    nav_ombor: "Ombor",
    nav_kassa: "Kassa",
    nav_production: "Ishlab chiqarish",
    nav_balances: "Kontragentlar balansi",
    nav_purchases: "Sotib olish",
    nav_sales: "Sotish",
    nav_finance: "Moliya",
    nav_salary: "Ish haqi",
    nav_users: "Foydalanuvchilar",
    users_title: "Foydalanuvchilar va Rollar",
    
    // Header
    rate_title: "CBU Kursi:",
    rate_edit: "Kursni o'zgartirish",
    month_open: "Davr: Ochiq",
    month_closed: "Davr: Yopilgan (Bloklangan)",
    role_label: "Foydalanuvchi roli:",
    user_default: "Foydalanuvchi",
    user_admin: "Admin",
    
    // Actions & Buttons
    btn_create: "Yaratish",
    btn_save: "Saqlash",
    btn_cancel: "Bekor qilish",
    btn_edit: "Tahrirlash",
    btn_delete: "O'chirish",
    btn_archive: "Arxivlash",
    btn_unarchive: "Faollashtirish",
    btn_storno: "Storno qilish",
    btn_export_excel: "Excelga yuklash",
    btn_add_item: "+ Qator qo'shish",
    btn_close_month: "Oyni yopish (Month Closing)",
    btn_reopen_month: "Oyni qayta ochish (Re-open)",
    btn_adjust_stock: "Qoldiqni qo'lda to'g'rilash (Admin)",
    btn_refresh: "Yangilash",
    btn_filter: "Filtrlash",
    btn_new_production: "Yangi ishlab chiqarish",
    
    // Tabs
    tab_materials: "Materiallar & Mahsulotlar",
    tab_clients: "Mijozlar",
    tab_suppliers: "Yetkazib beruvchilar",
    tab_warehouses: "Omborlar",
    
    // Common Table Headers
    th_code: "KODI",
    th_name: "NOMI",
    th_category: "KATEGORIYASI",
    th_unit: "O'LCHOV BIRLIGI",
    th_quantity: "MIQDORI",
    th_price: "NARXI",
    th_total: "JAMI",
    th_status: "HOLATI",
    th_date: "SANA",
    th_user: "FOYDALANUVCHI",
    th_actions: "AMALLAR",
    th_warehouse: "OMBOR",
    th_contact: "KONTAKT",
    th_balance: "BALANS",
    th_currency: "VALYUTA",
    th_description: "TAVSIF",
    th_type: "TURI",
    th_region: "HUDUD",
    th_resident: "REZIDENTLIK",
    th_phone: "TELEFON",
    th_init_bal: "BOSHLANG'ICH BALANS",
    th_curr_bal: "JORIY BALANS",
    th_doc_num: "HUJJAT №",
    
    // Module Titles & Subtitles
    mod_mdm_title: "MDM: Ma'lumotnomalar va Asosiy Ma'lumotlar",
    mod_mdm_sub: "Materiallar, xomashyo, mijozlar va yetkazib beruvchilar ma'lumotnomasi",
    mod_ombor_title: "Ombor hisobi va Materiallar qoldig'i",
    mod_ombor_sub: "Real vaqtdagi xomashyo va tayyor mahsulotlar skladi",
    mod_kassa_title: "Kassa hisobi va Pul oqimi",
    mod_kassa_sub: "Kassa kirim va chiqim operatsiyalari, valyuta konvertatsiyasi",
    mod_prod_title: "Ishlab chiqarish hisobi",
    mod_prod_sub: "Liniyalar bo'yicha tayyor kafel ishlab chiqarish va xomashyo sarfi",
    mod_balances_title: "Kontragentlar hisob-kitob balansi",
    mod_balances_sub: "Debitorlik va kreditorlik qarzdorliklari tahlili",
    mod_zakup_title: "Sotib olish va Ta'minot",
    mod_zakup_sub: "Xomashyo va materiallar xaridi hisobi",
    mod_sotish_title: "Sotish va Realizatsiya",
    mod_sotish_sub: "Tayyor mahsulotni mijozlarga sotish hisobi",
    mod_finance_title: "Moliya, PnL hisoboti va Oyni yopish",
    mod_finance_sub: "Foyda va zararlar (PnL), bilvosita xarajatlar taqsimoti",
    
    // Kassa specifics
    kassa_income_btn: "📥 Kirim",
    kassa_expense_btn: "📤 Chiqim",
    kassa_cbu_sync_btn: "🔄 CBU dan olish",
    kassa_rate_title: "Valyuta kursi & Markaziy Bank (CBU)",
    kassa_rate_official: "JORIY RASMIY KURS (1 USD)",
    kassa_recent_rates: "So'nggi sanalar kursi:",
    kassa_history_title: "Kassa operatsiyalari tarixi (Kirim va Chiqim)",
    kassa_modal_rate_title: "Valyuta kursini qo'lda kiritish (Manual Override)",
    kassa_modal_rate_new: "Yangi kurs (1 USD = ? UZS) *",
    kassa_reg_select: "Qaysi Kassa? *",
    kassa_amount: "Summa *",
    kassa_category: "Kategoriya *",
    kassa_cp_linked: "Bog'langan Kontragent",
    kassa_cp_hint: "(qidirib yozing yoki tanlang, ixtiyoriy)",
    kassa_desc_placeholder: "To'lov maqsadi yoki izoh yozing...",
    
    // Notifications & Messages
    msg_saved: "Muvaffaqiyatli saqlash amalga oshirildi!",
    msg_storno_ok: "Operatsiya muvaffaqiyatli storno qilindi!",
    msg_error: "Xatolik yuz berdi:",
    msg_month_closed_block: "Ushbu oy yopilgan! O'zgartirish yoki storno qilish taqiqlanadi.",
    msg_admin_only: "Ushbu amal faqat Admin roli uchun ruxsat etilgan!",
    msg_loading: "Yuklanmoqda..."
  },
  ru: {
    app_title: "ERP Завода Плитки",
    app_subtitle: "Производство и Учет",
    
    // Nav
    nav_dashboard: "Дашборд",
    nav_dashboard_short: "Главная",
    nav_production_short: "Произв.",
    nav_ombor_short: "Склад",
    nav_kassa_short: "Касса",
    nav_balances_short: "Баланс",
    nav_finance_short: "Финансы",
    nav_mdm: "MDM",
    nav_ombor: "Склад",
    nav_kassa: "Касса",
    nav_production: "Производство",
    nav_balances: "Балансы контрагентов",
    nav_purchases: "Закупки",
    nav_sales: "Продажи",
    nav_finance: "Финансы",
    nav_salary: "Зарплата",
    nav_users: "Пользователи",
    users_title: "Пользователи и Роли",
    
    // Header
    rate_title: "Курс ЦБ РУз:",
    rate_edit: "Изменить курс",
    month_open: "Период: Открыт",
    month_closed: "Период: Закрыт (Заблокирован)",
    role_label: "Роль пользователя:",
    user_default: "Пользователь",
    user_admin: "Admin",
    
    // Actions & Buttons
    btn_create: "Создать",
    btn_save: "Сохранить",
    btn_cancel: "Отмена",
    btn_edit: "Редактировать",
    btn_delete: "Удалить",
    btn_archive: "В архив",
    btn_unarchive: "Активировать",
    btn_storno: "Сторнировать",
    btn_export_excel: "Экспорт в Excel",
    btn_add_item: "+ Добавить позицию",
    btn_close_month: "Закрыть месяц",
    btn_reopen_month: "Повторно открыть месяц",
    btn_adjust_stock: "Корректировка остатков (Admin)",
    btn_refresh: "Обновить",
    btn_filter: "Фильтр",
    btn_new_production: "Новый выпуск",
    
    // Tabs
    tab_materials: "Материалы & Продукция",
    tab_clients: "Клиенты",
    tab_suppliers: "Поставщики",
    tab_warehouses: "Склады",
    
    // Common Table Headers
    th_code: "КОД",
    th_name: "НАИМЕНОВАНИЕ",
    th_category: "КАТЕГОРИЯ",
    th_unit: "ЕД. ИЗМ.",
    th_quantity: "КОЛИЧЕСТВО",
    th_price: "ЦЕНА",
    th_total: "ИТОГО",
    th_status: "СТАТУС",
    th_date: "ДАТА",
    th_user: "ПОЛЬЗОВАТЕЛЬ",
    th_actions: "ДЕЙСТВИЯ",
    th_warehouse: "СКЛАД",
    th_contact: "КОНТАКТ",
    th_balance: "БАЛАНС",
    th_currency: "ВАЛЮТА",
    th_description: "ОПИСАНИЕ",
    th_type: "ТИП",
    th_region: "РЕГИОН",
    th_resident: "РЕЗИДЕНТСТВО",
    th_phone: "ТЕЛЕФОН",
    th_init_bal: "НАЧ. БАЛАНС",
    th_curr_bal: "ТЕК. БАЛАНС",
    th_doc_num: "ДОКУМЕНТ №",
    
    // Module Titles & Subtitles
    mod_mdm_title: "MDM: Справочники и Мастер-данные",
    mod_mdm_sub: "Справочники материалов, сырья, клиентов и поставщиков",
    mod_ombor_title: "Складской учет и Остатки материалов",
    mod_ombor_sub: "Учет сырья и готовой продукции в реальном времени",
    mod_kassa_title: "Учет денежных средств (Касса)",
    mod_kassa_sub: "Приходные и расходные операции кассы, движение денежных средств",
    mod_prod_title: "Производственный учет",
    mod_prod_sub: "Выпуск готовой плитки и расход сырья по технологическим линиям",
    mod_balances_title: "Взаиморасчеты с контрагентами",
    mod_balances_sub: "Анализ дебиторской и кредиторской задолженности",
    mod_zakup_title: "Закупки и Поступления",
    mod_zakup_sub: "Учет поступления сырья и вспомогательных материалов",
    mod_sotish_title: "Продажи и Реализация",
    mod_sotish_sub: "Реализация готовой плитки покупателям",
    mod_finance_title: "Финансы, PnL отчет и Закрытие месяца",
    mod_finance_sub: "Отчет о прибылях и убытках (PnL), распределение косвенных расходов",

    // Kassa specifics
    kassa_income_btn: "📥 Приход",
    kassa_expense_btn: "📤 Расход",
    kassa_cbu_sync_btn: "🔄 Получить с ЦБ (CBU)",
    kassa_rate_title: "Курс валют & ЦБ РУз (CBU)",
    kassa_rate_official: "ТЕКУЩИЙ ОФИЦИАЛЬНЫЙ КУРС (1 USD)",
    kassa_recent_rates: "Курсы за последние даты:",
    kassa_history_title: "История кассовых операций (Приход и Расход)",
    kassa_modal_rate_title: "Ручной ввод курса валют (Manual Override)",
    kassa_modal_rate_new: "Новый курс (1 USD = ? UZS) *",
    kassa_reg_select: "Касса? *",
    kassa_amount: "Сумма *",
    kassa_category: "Категория *",
    kassa_cp_linked: "Связанный Контрагент",
    kassa_cp_hint: "(введите или выберите, необязательно)",
    kassa_desc_placeholder: "Назначение платежа или комментарий...",
    
    // Notifications & Messages
    msg_saved: "Данные успешно сохранены!",
    msg_storno_ok: "Операция успешно сторнирована!",
    msg_error: "Произошла ошибка:",
    msg_month_closed_block: "Месяц закрыт! Изменение, удаление и сторнирование заблокированы.",
    msg_admin_only: "Данное действие доступно только роли Admin!",
    msg_loading: "Загрузка..."
  }
};

const ENTITY_TRANSLATIONS = {
  // Warehouses
  "Tayyor mahsulotlar": "Готовая продукция",
  "Ishlab chiqarish uchun materiallar": "Материалы для производства",
  "Aralash ombor": "Смешанный склад",
  "Tayyor ishlab chiqarilgan kafel plitalari ombori": "Склад готовых плиточных изделий",
  "Asosiy xomashyo va komponentlar ombori": "Склад основного сырья и компонентов",
  "Yordamchi materiallar, ehtiyot qismlar va qadoqlash ombori": "Склад вспомогательных материалов, запчастей и упаковки",
  "Standart Tizim Skladi": "Системный склад",
  "Qo'shimcha": "Дополнительный",
  
  // Categories
  "Xomashyo": "Сырье",
  "Siryo": "Сырье",
  "Tayyor mahsulot": "Готовая продукция",
  "Ehtiyot qism": "Запчасти",
  "Yordamchi": "Вспомогательные",

  // Kassa Categories & Descriptions
  "Postavshikdan qaytgan pul": "Возврат средств от поставщика",
  "Mijoz to'lovi": "Оплата от клиента",
  "Asoschidan investitsiya": "Инвестиции учредителя",
  "Boshqa kirim": "Прочие доходы / приход",
  "Elektr energiya (Svet)": "Электроэнергия (Свет)",
  "Tabiiy gaz": "Природный газ",
  "Suv va kanalizatsiya": "Водоснабжение и канализация",
  "Uskunalar ta'miri va ehtiyot qismlar": "Ремонт оборудования и запчасти",
  "Sex ijarasi va xizmatlar": "Аренда цеха и услуги",
  "Transport va yoqilg'i": "Транспорт и ГСМ",
  "Ishchilar oyligi / Avans": "Зарплата рабочих / Аванс",
  "Boshqa sex xarajatlari": "Прочие цеховые расходы",
  "Ofis ijarasi": "Аренда офиса",
  "Aloqa, Internet va IT": "Связь, интернет и IT",
  "Buxgalteriya va audit": "Бухгалтерия и аудит",
  "Reklama va marketing": "Реклама и маркетинг",
  "Soliqlar va davlat bojlari": "Налоги и госпошлины",
  "Ofis va xo'jalik xarajatlari": "Хозяйственные и офисные расходы",
  "Boshqa ma'muriy xarajatlar": "Прочие административные расходы",
  "Postavshikka to'lov": "Оплата поставщику",
  "Boshqa chiqim": "Прочий расход",
  "Telegram bot orqali kirim": "Приход через Telegram-бот",
  "Telegram bot orqali chiqim": "Расход через Telegram-бот",
  "Qo'lda kiritilgan (Manual)": "Введено вручную (Manual)",
  "CBU API (Avtomatik)": "ЦБ API (Автоматически)",
  "Bugun": "Сегодня",
  
  // Statuses
  "Faol": "Активен",
  "Arxiv": "В архиве",
  "Arxivlangan": "В архиве",
  "Rezident": "Резидент",
  "Norezident": "Нерезидент",
  "Tasdiqlandi": "Подтверждено",
  "Storno": "Сторнировано",
  "Stornolangan": "Сторнировано",
  "Kutilmoqda": "В ожидании",
  "Ochiq": "Открыт",
  "Yopilgan": "Закрыт",
  
  // Cash registers
  "Kassa USD": "Касса USD",
  "Kassa UZS": "Касса UZS",
  "AQSH Dollari hisob-kitob kassasi": "Касса расчетов в долларах США (USD)",
  "O'zbekiston So'mi milliy valyuta kassasi": "Касса расчетов в национальной валюте (UZS)",
  
  // Units
  "kg": "кг",
  "m2": "м²",
  "dona": "шт",
  "l": "л",
  "t": "т",
  "rul": "рул",
  "litr": "л",
  "tonna": "т",
  "ru": "рул",
  "рулон": "рул",
  "kg.": "кг",
  "m²": "м²",
  "шт": "шт",
  "шт.": "шт",
  "л": "л",
  "т": "т",

  // Production lines
  "Line 1 (30x30 Liniyasi)": "Линия 1",
  "Line 2 (45x45 Liniyasi)": "Линия 2",
  "Line 3 (60x60 Liniyasi)": "Линия 3",
  "Line 4 (80x80 Liniyasi)": "Линия 4",
  "Line 5 (60x120 Liniyasi)": "Линия 5",
  "Liniya 1 (30x30 Standart)": "Линия 1",
  "Liniya 2 (60x60 Katta)": "Линия 2",
  "Liniya 3 (60x120 Granit)": "Линия 3",
  "Liniya 4 (80x80 Premium)": "Линия 4",
  "Liniya 5 (45x45 Mozaik)": "Линия 5",
  "Liniya 1": "Линия 1",
  "Liniya 2": "Линия 2",
  "Liniya 3": "Линия 3",
  "Liniya 4": "Линия 4",
  "Liniya 5": "Линия 5"
};

const UZ_SNAKE_FIXES = {
  "bilvosita_xarajatlar": "Bilvosita xarajatlar",
  "admin_prochee": "Ma'muriy va boshqa xarajatlar",
  "mijoz_tolovi": "Mijoz to'lovi",
  "postavshik_tolovi": "Postavshikka to'lov",
  "asoschidan_investitsiya": "Asoschidan investitsiya",
  "boshqa_kirim": "Boshqa kirim",
  "boshqa_chiqim": "Boshqa chiqim",
  "xomashyo_xaridi": "Xomashyo xaridi",
  "mahsulot_sotuvi": "Mahsulot sotuvi"
};

const RU_SNAKE_FIXES = {
  "bilvosita_xarajatlar": "Косвенные расходы (Цех)",
  "admin_prochee": "Административные расходы",
  "mijoz_tolovi": "Оплата от клиента",
  "postavshik_tolovi": "Оплата поставщику",
  "asoschidan_investitsiya": "Инвестиции учредителя",
  "boshqa_kirim": "Прочие доходы / приход",
  "boshqa_chiqim": "Прочий расход",
  "xomashyo_xaridi": "Закупка сырья",
  "mahsulot_sotuvi": "Продажа продукции"
};

let CURRENT_LANG = localStorage.getItem("erp_lang") || "uz";

function t(key) {
  return (I18N[CURRENT_LANG] && I18N[CURRENT_LANG][key]) || key;
}

function tr(val) {
  if (!val) return "";
  if (CURRENT_LANG === "uz") {
    return UZ_SNAKE_FIXES[val] || val;
  }
  return RU_SNAKE_FIXES[val] || ENTITY_TRANSLATIONS[val] || val;
}

function setLanguage(lang) {
  if (lang === "uz" || lang === "ru") {
    CURRENT_LANG = lang;
    localStorage.setItem("erp_lang", lang);
    if (typeof applyTranslations === "function") {
      applyTranslations();
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  if (typeof dateStr !== "string") {
    if (dateStr instanceof Date) {
      const d = String(dateStr.getDate()).padStart(2, "0");
      const m = String(dateStr.getMonth() + 1).padStart(2, "0");
      const y = dateStr.getFullYear();
      return `${d}.${m}.${y}`;
    }
    dateStr = String(dateStr);
  }
  // If already DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) return dateStr;
  
  // If YYYY-MM-DD or ISO string
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, y, m, d] = match;
    const timeMatch = dateStr.match(/\s(\d{2}:\d{2}(?::\d{2})?)/);
    if (timeMatch) {
      return `${d}.${m}.${y} ${timeMatch[1]}`;
    }
    return `${d}.${m}.${y}`;
  }
  return dateStr;
}
