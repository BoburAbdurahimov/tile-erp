# 📦 ERP Tizimi To'liq Backup Hujjati (Zaxira Nusxasi)

- **Yaratilgan vaqt:** 2026-09-02 14:00 (Sentyabr 2026)
- **Zaxira papkasi:** `last backup/`
- **GitHub Repozitoriyalari:** `BoburAbdurahimov/tile-erp` & `shohruxpy/tile-erp`

---

### 📂 Zaxiralangan tarkibiy qismlar va oxirgi bajarilgan ishlar:

1. **`backend/`**
   - FastAPI server, barcha modullar (`ombor`, `ishlab_chiqarish`, `kassa`, `savdo`, `mdm`, `moliya`, `kontragentlar`, `ish_haqi`, `users`).
   - **Liniyalar Sarf Materiallari (`LineExpense`)**: 3-Aralash ombordan ehtiyot qismlar va zapchastlarni ko'p liniyali taqsimlash moduli (`POST /api/ishlab-chiqarish/line-expenses`).
   - **Target-Line Cost Allocation**: 3-ombordan sarflangan zapchastlar va ta'mirlash xarajatlarini Moliya PnL modulida tanlangan liniyalar o'rtasida ishlab chiqarish hajmiga proporsional taqsimlash servisi (`backend/services/cost_allocation_service.py`).
   - **PnL Hisoboti (`backend/services/reports_service.py`)**: `cogs_line_expenses_usd` hamda 5 ta liniya bo'yicha alohida `Sarf materiallari va ta'mirlash ($)` ustuni hisob-kitobi.

2. **`frontend/`**
   - **Universal Excel Export (`exportTableToExcel` in `app.js`)**:
     - Bir nechta tovarga ega hujjatlar (Xarid/Sotuv/Ishlab chiqarish) Excel faylida har bir tovar **o'zining alohida qatorida (Individual Item Row)** chiqadigan 1C ERP standarti bo'yicha eksport qilinadi.
     - Excel'da har bir tovarning aniq miqdori, o'lchov birligi, dona narxi va alohida summasi (`Miqdor * Narx`) hisoblanib yoziladi.
     - UTF-8 BOM (`\ufeff`) bilan kodlanib, o'zbekcha va kirill alifbosidagi matnlar buzilmasdan chiqadi.
   - **Kengaytirilgan Modal Oynalar**: Modal max-width o'lchamlari 1380px – 1650px ga kengaytirilib, gorizontal scrollbar'larsiz to'liq sig'dirildi.
   - **Datalist'da Ombor Qoldig'i Display**: Sotib olish va Sotish modullarida tovar tanlash datalist'ida tovarninig nomi ostida 2-qatorda tanlangan ombordagi joriy qoldiq miqdori dinamik ko'rsatiladi.

3. **`telegram_bot/`**
   - `@SamPlitkabot` Telegram boti, ko'p omborli xomashyo kiritish, jonli Excel-jadval rasm hisobotlari generatori, telefon raqam orqali avtorizatsiya va buyurtmalar stornosi.

4. **`tile_erp.db`**
   - SQLite ma'lumotlar bazasining barcha jadvallari, foydalanuvchilari, qoldiqlari va operatsiyalari bilan to'liq nusxasi.

5. **Asosiy ishga tushirish fayllari:**
   - `run.py` - Master ishga tushiruvchi.
   - `seed_data.py` - Standart boshlang'ich ma'lumotlar.
   - `sync_to_github.py` - Avtomatik GitHub versiyalash va deployment skripti.
   - `.env` va `requirements.txt` - Muhit sozlamalari va paketlar.

---

### 🔄 Qayta tiklash (Restore) bo'yicha qo'llanma:
Agarda biror o'zgarishni orqaga qaytarmoqchi bo'lsangiz:
1. `last backup/` papkasidagi fayllarni asosiy loyiha papkasiga ko'chirib qo'yishingiz kifoya.
