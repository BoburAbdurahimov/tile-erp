/**
 * History (Tarix): one timeline of every movement - Ombor receipts and
 * sales, orders and deliveries, supplier purchases, production, line
 * expenses, transfers and Kassa - plus unpaid deliveries (Qarzlar).
 * Read-only; built by GET /api/history.
 *
 * Each section (Ombor, Sotuv, Xarid, Ishlab chiqarish, Kassa, Qarzlar) is a
 * separate tab; inside it the period, owner, type and status filters apply.
 */
const HistoryModule = {
  data: null,
  section: "all",
  filters: { preset: "30", start: "", end: "", owner: "", kind: "", status: "", user: "", search: "" },

  KINDS: {
    ombor_kirim:      { uz: "Omborga kirim",       ru: "Приход на склад",     color: "#059669", bg: "#ecfdf5", section: "ombor" },
    ombor_sotuv:      { uz: "Ombordan sotuv",      ru: "Продажа со склада",   color: "#dc2626", bg: "#fef2f2", section: "ombor" },
    ombor_storno:     { uz: "Ombor storno",        ru: "Сторно склада",       color: "#64748b", bg: "#f1f5f9", section: "ombor" },
    kochirish:        { uz: "Ko'chirish",          ru: "Перемещение",         color: "#0f766e", bg: "#f0fdfa", section: "ombor" },
    buyurtma:         { uz: "Buyurtma",            ru: "Заказ",               color: "#2563eb", bg: "#eff6ff", section: "sotuv" },
    yetkazish:        { uz: "Yetkazib berildi",    ru: "Доставлено",          color: "#7c3aed", bg: "#f5f3ff", section: "sotuv" },
    buyurtma_bekor:   { uz: "Buyurtma bekor",      ru: "Заказ отменён",       color: "#64748b", bg: "#f1f5f9", section: "sotuv" },
    sotuv_eski:       { uz: "Sotuv hujjati",       ru: "Документ продажи",    color: "#c026d3", bg: "#fdf4ff", section: "sotuv" },
    xarid:            { uz: "Xarid (ta'minotchi)", ru: "Закупка",             color: "#b45309", bg: "#fffbeb", section: "xarid" },
    ishlab_chiqarish: { uz: "Ishlab chiqarish",    ru: "Производство",        color: "#4f46e5", bg: "#eef2ff", section: "ishlab" },
    sarf:             { uz: "Ishlab chiqarish sarfi", ru: "Расход на производство",     color: "#0891b2", bg: "#ecfeff", section: "ishlab" },
    kassa_kirim:      { uz: "Kassa kirim",         ru: "Касса приход",        color: "#15803d", bg: "#f0fdf4", section: "kassa" },
    kassa_chiqim:     { uz: "Kassa chiqim",        ru: "Касса расход",        color: "#b91c1c", bg: "#fef2f2", section: "kassa" },
    xarajat:          { uz: "Boshqa xarajat",      ru: "Прочий расход",       color: "#92400e", bg: "#fef3c7", section: "kassa" },
    amal:             { uz: "Foydalanuvchi amali", ru: "Действие пользователя", color: "#334155", bg: "#f1f5f9", section: "amal" },
  },

  // Audit actions shown in words: POST = created, PUT = changed, DELETE = deleted.
  ACTIONS: {
    POST:   { uz: "Yaratdi / bajardi", ru: "Создал / выполнил" },
    PUT:    { uz: "O'zgartirdi", ru: "Изменил" },
    PATCH:  { uz: "O'zgartirdi", ru: "Изменил" },
    DELETE: { uz: "O'chirdi", ru: "Удалил" },
  },

  SECTIONS: [
    ["all",    { uz: "Barchasi", ru: "Все" }],
    ["ombor",  { uz: "Ombor", ru: "Склад" }],
    ["sotuv",  { uz: "Sotuv va yetkazish", ru: "Продажи и доставка" }],
    ["xarid",  { uz: "Xaridlar", ru: "Закупки" }],
    ["ishlab", { uz: "Ishlab chiqarish", ru: "Производство" }],
    ["kassa",  { uz: "Kassa", ru: "Касса" }],
    ["qarz",   { uz: "Qarzlar", ru: "Долги" }],
    ["amal",   { uz: "Foydalanuvchi amallari", ru: "Действия пользователей" }],
  ],

  PRESETS: [
    ["today", { uz: "Bugun", ru: "Сегодня" }],
    ["yesterday", { uz: "Kecha", ru: "Вчера" }],
    ["7", { uz: "7 kun", ru: "7 дней" }],
    ["30", { uz: "30 kun", ru: "30 дней" }],
    ["month", { uz: "Shu oy", ru: "Этот месяц" }],
    ["custom", { uz: "Boshqa sana", ru: "Другие даты" }],
  ],

  isUz() { return CURRENT_LANG === "uz"; },
  L(o) { return this.isUz() ? o.uz : o.ru; },

  kindLabel(kind) {
    const k = this.KINDS[kind];
    return k ? this.L(k) : kind;
  },

  // Calendar day in Tashkent (UTC+5 all year), whatever the browser's zone.
  dayKey(d) {
    const t = new Date(d.getTime() + 5 * 3600 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  },

  presetRange(preset) {
    const now = new Date();
    const day = 86400000;
    const today = this.dayKey(now);
    switch (preset) {
      case "today": return [today, today];
      case "yesterday": { const y = this.dayKey(new Date(now.getTime() - day)); return [y, y]; }
      case "7": return [this.dayKey(new Date(now.getTime() - 6 * day)), today];
      case "month": return [today.slice(0, 8) + "01", today];
      case "30":
      default: return [this.dayKey(new Date(now.getTime() - 29 * day)), today];
    }
  },

  // ------------------------------------------------------------ layout

  async render(container) {
    if (!this.filters.start) [this.filters.start, this.filters.end] = this.presetRange(this.filters.preset);
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div id="hist-head"></div>
          <div id="hist-sections" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:16px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;"></div>
          <div id="hist-filters" style="display:flex;flex-direction:column;gap:12px;margin-top:14px;"></div>
        </div>
        <div id="hist-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;"></div>
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:0;overflow:hidden;">
          <div id="hist-body" style="padding:30px;text-align:center;color:#94a3b8;">${this.isUz() ? "Yuklanmoqda..." : "Загрузка..."}</div>
        </div>
      </div>`;
    this.renderHead();
    this.renderFilters();
    await this.load();
  },

  btn(active, onclick, label, extra = "") {
    return `<button type="button" onclick="${onclick}"
      style="padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;
             background:${active ? "#0f172a" : "#f1f5f9"};color:${active ? "#fff" : "#475569"};
             border:1px solid ${active ? "#0f172a" : "#e2e8f0"};${extra}">${label}</button>`;
  },

  renderHead() {
    const isUz = this.isUz();
    const el = document.getElementById("hist-head");
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${isUz ? "Tarix" : "История"}</h2>
          <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
            ${isUz ? "Barcha harakatlar: ombor, buyurtma va yetkazish, xaridlar, ishlab chiqarish, kassa, qarzlar."
                   : "Все движения: склад, заказы и доставка, закупки, производство, касса, долги."}
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="HistoryModule.load()">${isUz ? "Yangilash" : "Обновить"}</button>
          <button class="btn btn-secondary btn-sm" onclick="HistoryModule.resetFilters()">${isUz ? "Filtrlarni tozalash" : "Сбросить фильтры"}</button>
          <button class="btn btn-primary btn-sm" onclick="exportTableToPdf('history-table', 'tarix_' + HistoryModule.section)">${t('btn_export_pdf')}</button>
        </div>
      </div>`;
  },

  renderSections() {
    const el = document.getElementById("hist-sections");
    if (!el) return;
    const counts = this.sectionCounts();
    el.innerHTML = this.SECTIONS.map(([k, label]) => {
      const n = counts[k] || 0;
      const on = this.section === k;
      const badge = `<span style="margin-left:6px;padding:1px 7px;border-radius:999px;font-size:11px;
        background:${on ? "rgba(255,255,255,.2)" : (k === "qarz" && n ? "#fee2e2" : "#e2e8f0")};
        color:${on ? "#fff" : (k === "qarz" && n ? "#b91c1c" : "#475569")};">${n}</span>`;
      return this.btn(on, `HistoryModule.setSection('${k}')`, this.L(label) + badge, "padding:9px 14px;font-size:13px;");
    }).join("");
  },

  renderFilters() {
    const isUz = this.isUz();
    const el = document.getElementById("hist-filters");
    if (!el) return;
    const f = "padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;";
    const lbl = "font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;min-width:84px;";
    const owners = (this.data && this.data.owners) || ["Aziz", "Istam", "Kodir", "Toxir"];
    const kinds = Object.entries(this.KINDS).filter(([, v]) => this.section === "all" || v.section === this.section);
    const isDebt = this.section === "qarz";

    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="${lbl}">${isUz ? "Davr" : "Период"}</span>
        ${this.PRESETS.map(([k, l]) => this.btn(this.filters.preset === k, `HistoryModule.setPreset('${k}')`, this.L(l))).join("")}
        ${this.filters.preset === "custom" ? `
          <input type="date" value="${this.filters.start}" style="${f}" onchange="HistoryModule.setDate('start', this.value)">
          <span style="color:#94a3b8;">—</span>
          <input type="date" value="${this.filters.end}" style="${f}" onchange="HistoryModule.setDate('end', this.value)">` : `
          <span style="font-size:12px;color:#64748b;">${this.fmtDay(this.filters.start)} — ${this.fmtDay(this.filters.end)}</span>`}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="${lbl}">${isUz ? "Ombor egasi" : "Владелец"}</span>
        ${this.btn(!this.filters.owner, "HistoryModule.setFilter('owner', '')", isUz ? "Hammasi" : "Все")}
        ${owners.map(o => this.btn(this.filters.owner === o, `HistoryModule.setFilter('owner', '${o}')`, escapeHtml(o))).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        ${isDebt ? "" : `
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Harakat turi" : "Тип движения"}
          <select style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('kind', this.value)">
            <option value="">${isUz ? "Hammasi" : "Все"}</option>
            ${kinds.map(([k, v]) => `<option value="${k}" ${this.filters.kind === k ? "selected" : ""}>${this.L(v)}</option>`).join("")}
          </select></label>
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Holat" : "Статус"}
          <select style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('status', this.value)">
            <option value="" ${!this.filters.status ? "selected" : ""}>${isUz ? "Hammasi" : "Все"}</option>
            <option value="active" ${this.filters.status === "active" ? "selected" : ""}>${isUz ? "Faqat amaldagilar" : "Только действующие"}</option>
            <option value="storno" ${this.filters.status === "storno" ? "selected" : ""}>${isUz ? "Storno va bekor qilinganlar" : "Сторно и отменённые"}</option>
          </select></label>`}
        ${isDebt ? "" : `
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Foydalanuvchi" : "Пользователь"}
          <select style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('user', this.value)">
            <option value="">${isUz ? "Hammasi" : "Все"}</option>
            ${this.users().map(u => `<option value="${escapeHtml(u)}" ${this.filters.user === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}
          </select></label>`}
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Qidirish" : "Поиск"}
          <input value="${escapeHtml(this.filters.search)}" placeholder="${isUz ? "Hujjat, mijoz, telefon, o'lcham..." : "Документ, клиент, телефон, размер..."}"
            style="${f}width:100%;margin-top:4px;" oninput="HistoryModule.onSearch(this.value)"></label>
      </div>`;
  },

  // ------------------------------------------------------------ state

  setSection(k) {
    this.section = k;
    // A type from another section would hide everything.
    if (this.filters.kind && k !== "all" && (this.KINDS[this.filters.kind] || {}).section !== k) this.filters.kind = "";
    this.renderFilters();
    this.renderView();
  },

  setPreset(p) {
    this.filters.preset = p;
    if (p !== "custom") {
      [this.filters.start, this.filters.end] = this.presetRange(p);
      this.renderFilters();
      this.load();
    } else {
      this.renderFilters();
    }
  },

  setDate(key, value) {
    if (!value) return;
    this.filters[key] = value;
    if (this.filters.start > this.filters.end) {
      showToast(this.isUz() ? "Boshlanish sanasi tugash sanasidan keyin bo'lmasin" : "Дата начала позже даты конца", "warning");
      return;
    }
    this.load();
  },

  setFilter(key, value) {
    this.filters[key] = value;
    if (key === "owner") this.renderFilters();
    this.renderView();
  },

  onSearch(value) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.setFilter("search", value), 200);
  },

  resetFilters() {
    this.section = "all";
    this.filters = { preset: "30", start: "", end: "", owner: "", kind: "", status: "", user: "", search: "" };
    [this.filters.start, this.filters.end] = this.presetRange("30");
    this.renderFilters();
    this.load();
  },

  async load() {
    const body = document.getElementById("hist-body");
    if (body) { body.style.padding = "30px"; body.innerHTML = this.isUz() ? "Yuklanmoqda..." : "Загрузка..."; }
    try {
      this.data = await API.getHistory({ start: this.filters.start, end: this.filters.end, limit: 2000 });
    } catch (e) {
      if (body) body.innerHTML = `<span style="color:#b91c1c;">${escapeHtml(e.message)}</span>`;
      return;
    }
    this.renderFilters();
    this.renderView();
  },

  // ------------------------------------------------------------ filtering

  isStorno(e) {
    return e.status === "Storno" || e.status === "Bekor" || e.kind === "ombor_storno" || e.kind === "buyurtma_bekor"
      || String(e.ref || "").startsWith("STORNO-");
  },

  users() {
    const set = new Set();
    ((this.data && this.data.events) || []).forEach(e => { if (e.user && e.user !== "-") set.add(e.user); });
    return [...set].sort();
  },

  matchesSearch(values) {
    const q = (this.filters.search || "").trim().toLowerCase();
    return !q || values.some(v => String(v || "").toLowerCase().includes(q));
  },

  // Events passing every filter except the section, so tab counts stay honest.
  baseEvents() {
    if (!this.data) return [];
    const { owner, kind, status, user } = this.filters;
    return this.data.events.filter(e => {
      if (owner && e.owner !== owner) return false;
      if (user && e.user !== user) return false;
      if (kind && e.kind !== kind) return false;
      if (status === "active" && this.isStorno(e)) return false;
      if (status === "storno" && !this.isStorno(e)) return false;
      return this.matchesSearch([e.ref, e.place, e.party, e.details, e.user, e.status, this.kindLabel(e.kind)]);
    });
  },

  visibleDebts() {
    if (!this.data) return [];
    return (this.data.debts || []).filter(d =>
      (!this.filters.owner || d.owner === this.filters.owner) &&
      this.matchesSearch([d.order_number, d.client_name, d.client_phone, d.place]));
  },

  sectionCounts() {
    const counts = { all: 0 };
    this.baseEvents().forEach(e => {
      if (e.kind !== "amal") counts.all++;
      const s = (this.KINDS[e.kind] || {}).section;
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    counts.qarz = this.visibleDebts().length;
    return counts;
  },

  // ------------------------------------------------------------ rendering

  fmtDay(d) {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  },

  fmtAt(at) {
    if (!at) return "-";
    const [d, tm] = at.split("T");
    return this.fmtDay(d) + (tm && tm !== "00:00" ? " " + tm.slice(0, 5) : "");
  },

  money(amount, currency) {
    if (amount == null) return "-";
    return `${formatNumber(amount, 0, currency === "USD" ? 2 : 0)} ${currency || ""}`;
  },

  card(label, value, color = "#0f172a", sub = "") {
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${sub}</div>` : ""}
    </div>`;
  },

  renderView() {
    this.renderSections();
    if (this.section === "qarz") return this.renderDebts();
    this.renderEvents();
  },

  renderEvents() {
    const isUz = this.isUz();
    const body = document.getElementById("hist-body");
    const sum = document.getElementById("hist-summary");
    if (!body) return;
    const events = this.baseEvents().filter(e => this.section === "all"
      ? e.kind !== "amal"
      : (this.KINDS[e.kind] || {}).section === this.section);

    // Totals in each currency, counting storno and cancelled rows out.
    const active = events.filter(e => !this.isStorno(e));
    const total = cur => active.filter(e => e.currency === cur).reduce((s, e) => s + (e.amount || 0), 0);
    const kirim = active.filter(e => e.kind === "kassa_kirim").reduce((s, e) => s + (e.currency === "UZS" ? e.amount || 0 : 0), 0);
    const chiqim = active.filter(e => e.kind === "kassa_chiqim").reduce((s, e) => s + (e.currency === "UZS" ? e.amount || 0 : 0), 0);
    if (sum) {
      sum.innerHTML = [
        this.card(isUz ? "Harakatlar" : "Движений", formatNumber(events.length, 0, 0), "#0f172a",
          `${events.length - active.length} ${isUz ? "ta storno / bekor" : "сторно / отмен"}`),
        this.card(isUz ? "Summa (UZS)" : "Сумма (UZS)", formatNumber(total("UZS"), 0, 0), "#2563eb"),
        this.card(isUz ? "Summa (USD)" : "Сумма (USD)", formatNumber(total("USD"), 0, 2), "#7c3aed"),
        this.section === "kassa" || this.section === "all"
          ? this.card(isUz ? "Kassa: kirim − chiqim" : "Касса: приход − расход", formatNumber(kirim - chiqim, 0, 0),
              kirim - chiqim >= 0 ? "#15803d" : "#b91c1c", "UZS")
          : "",
      ].join("");
    }

    if (!events.length) {
      body.style.padding = "30px";
      body.innerHTML = `<span>${isUz ? "Tanlangan filtrlar bo'yicha harakat topilmadi." : "По выбранным фильтрам движений нет."}</span>`;
      return;
    }

    body.style.padding = "0";
    body.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" id="history-table">
          <thead>
            <tr>
              <th>${isUz ? "Vaqt" : "Время"}</th>
              <th>${isUz ? "Turi" : "Тип"}</th>
              <th>${isUz ? "Hujjat" : "Документ"}</th>
              <th>${isUz ? "Joy" : "Место"}</th>
              <th>${isUz ? "Kontragent" : "Контрагент"}</th>
              <th>${isUz ? "Tafsilot" : "Детали"}</th>
              <th>${isUz ? "Miqdor" : "Кол-во"}</th>
              <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th>${isUz ? "Holat" : "Статус"}</th>
              <th>${isUz ? "Kim" : "Кто"}</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(e => {
              const c = this.KINDS[e.kind] || { color: "#475569", bg: "#f1f5f9" };
              return `<tr style="${this.isStorno(e) ? "opacity:.6;" : ""}">
                <td style="white-space:nowrap;">${this.fmtAt(e.at)}</td>
                <td><span style="display:inline-block;padding:3px 8px;border-radius:6px;font-size:11.5px;font-weight:700;background:${c.bg};color:${c.color};white-space:nowrap;">${this.kindLabel(e.kind)}</span></td>
                <td style="font-weight:700;white-space:nowrap;">${escapeHtml(e.ref || "-")}</td>
                <td>${escapeHtml(e.place || "-")}</td>
                <td>${escapeHtml(e.party || "-")}</td>
                <td style="max-width:360px;white-space:normal;">${escapeHtml(e.details || "-")}</td>
                <td style="white-space:nowrap;">${escapeHtml(e.quantity || "-")}</td>
                <td style="text-align:right;white-space:nowrap;font-weight:600;">${this.money(e.amount, e.currency)}</td>
                <td>${escapeHtml(e.kind === "amal" && this.ACTIONS[e.status] ? this.L(this.ACTIONS[e.status]) : (e.status || "-"))}</td>
                <td>${escapeHtml(e.user || "-")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 14px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;">
        ${isUz ? "Ko'rsatilgan" : "Показано"}: ${events.length}
      </div>`;
  },

  renderDebts() {
    const isUz = this.isUz();
    const body = document.getElementById("hist-body");
    const sum = document.getElementById("hist-summary");
    if (!body) return;
    const debts = this.visibleDebts();
    const balance = debts.reduce((s, d) => s + d.balance, 0);
    const paid = debts.reduce((s, d) => s + d.paid, 0);
    if (sum) {
      sum.innerHTML = [
        this.card(isUz ? "Qarzdor buyurtmalar" : "Заказов с долгом", formatNumber(debts.length, 0, 0)),
        this.card(isUz ? "Umumiy qarz" : "Общий долг", formatNumber(balance, 0, 0), "#b91c1c", "UZS"),
        this.card(isUz ? "Shundan to'langan" : "Из них оплачено", formatNumber(paid, 0, 0), "#15803d", "UZS"),
      ].join("");
    }
    if (!debts.length) {
      body.style.padding = "30px";
      body.innerHTML = `<span>${isUz ? "Qarz yo'q: barcha yetkazilgan buyurtmalar to'langan." : "Долгов нет: все доставленные заказы оплачены."}</span>`;
      return;
    }
    body.style.padding = "0";
    body.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" id="history-table">
          <thead>
            <tr>
              <th>${isUz ? "Buyurtma" : "Заказ"}</th>
              <th>${isUz ? "Mijoz" : "Клиент"}</th>
              <th>${isUz ? "Telefon" : "Телефон"}</th>
              <th>${isUz ? "Ombor" : "Склад"}</th>
              <th>${isUz ? "Yetkazilgan" : "Доставлен"}</th>
              <th style="text-align:right;">${isUz ? "Jami" : "Итого"}</th>
              <th style="text-align:right;">${isUz ? "To'langan" : "Оплачено"}</th>
              <th style="text-align:right;">${isUz ? "Qarz" : "Долг"}</th>
              <th>${isUz ? "Amallar" : "Действия"}</th>
            </tr>
          </thead>
          <tbody>
            ${debts.map(d => `<tr>
              <td style="font-weight:700;white-space:nowrap;">${escapeHtml(d.order_number)}</td>
              <td>${escapeHtml(d.client_name || "-")}</td>
              <td style="white-space:nowrap;"><a href="tel:${escapeHtml(d.client_phone || "")}" style="color:#2563eb;text-decoration:none;">${escapeHtml(d.client_phone || "-")}</a></td>
              <td>${escapeHtml(d.place || "-")}</td>
              <td style="white-space:nowrap;">${this.fmtAt(d.delivered_at)}</td>
              <td style="text-align:right;white-space:nowrap;">${this.money(d.total, d.currency)}</td>
              <td style="text-align:right;white-space:nowrap;color:#15803d;">${this.money(d.paid, d.currency)}</td>
              <td style="text-align:right;white-space:nowrap;font-weight:800;color:#b91c1c;">${this.money(d.balance, d.currency)}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="navigateTo('sales')" style="white-space:nowrap;">${isUz ? "Sotuvga o'tish" : "К продажам"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },
};
