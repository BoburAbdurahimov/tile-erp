# 📦 ERP Tizimi To'liq Backup Hujjati (Zaxira Nusxasi)

- **Yaratilgan vaqt:** 2026-08-13
- **Zaxira papkasi:** `backup_project/`
- **Zaxira arxivi:** `backup_project.zip`

---

### 📂 Zaxiralangan tarkibiy qismlar:

1. **`backend/`**
   - FastAPI server, barcha modullar (`ombor`, `ishlab_chiqarish`, `kassa`, `savdo`, `mdm`, `moliya`, `kontragentlar`), xavfsizlik va oylik hisob-kitob servislari.
   - Manfiy ombor qoldig'iga tushishni taqiqlovchi Zero-Negative-Stock himoyasi.

2. **`frontend/`**
   - Zamonaviy Vanilla JS/CSS ERP Web ilovasi, Telegram Mini App interfeysi, MDM foydalanuvchilar va rollarni boshqarish bo'limi.

3. **`telegram_bot/`**
   - `@SamPlitkabot` Telegram boti, ko'p omborli xomashyo kiritish, jonli Excel-jadval rasm hisobotlari generatori, telefon raqam orqali avtorizatsiya va buyurtmalar stornosi.

4. **`tile_erp.db`**
   - SQLite ma'lumotlar bazasining barcha jadvallari, foydalanuvchilari, qoldiqlari va operatsiyalari bilan to'liq nusxasi.

5. **Asosiy ishga tushirish fayllari:**
   - `run.py` - Master ishga tushiruvchi.
   - `seed_data.py` - Standart boshlang'ich ma'lumotlar.
   - `.env` va `requirements.txt` - Muhit sozlamalari va paketlar.

---

### 🔄 Qayta tiklash (Restore) bo'yicha qo'llanma:
Agarda biror o'zgarishni orqaga qaytarmoqchi bo'lsangiz:
1. `backup_project/` papkasidagi fayllarni asosiy loyiha papkasiga ko'chirib qo'yishingiz yoki `backup_project.zip` arxivini ochishingiz kifoya.
