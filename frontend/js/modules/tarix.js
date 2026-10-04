/**
 * History (Tarix): one timeline of every movement - Ombor receipts and
 * sales, orders and deliveries, supplier purchases, production, line
 * expenses, transfers and Kassa. Read-only; built by GET /api/history.
 */
const HistoryModule = {
  data: null,
  filters: { start: "", end: "", group: "", search: "" },

  KINDS: {
    ombor_kirim:      { uz: "Omborga kirim",       ru: "Приход на склад",     color: "#059669", bg: "#ecfdf5", group: "ombor" },
    ombor_sotuv:      { uz: "Ombordan sotuv",      ru: "Продажа со склада",   color: "#dc2626", bg: "#fef2f2", group: "ombor" },
    ombor_storno:     { uz: "Ombor storno",        ru: "Сторно склада",       color: "#64748b", bg: "#f1f5f9", group: "ombor" },
    buyurtma:         { uz: "Buyurtma",            ru: "Заказ",               color: "#2563eb", bg: "#eff6ff", group: "sotuv" },
    yetkazish:        { uz: "Yetkazib berildi",    ru: "Доставлено",          color: "#7c3aed", bg: "#f5f3ff", group: "sotuv" },
    buyurtma_bekor:   { uz: "Buyurtma bekor",      ru: "Заказ отменён",       color: "#64748b", bg: "#f1f5f9", group: "sotuv" },
    sotuv_eski:       { uz: "Sotuv hujjati",       ru: "Документ продажи",    color: "#c026d3", bg: "#fdf4ff", group: "sotuv" },
    xarid:            { uz: "Xarid (ta'minotchi)", ru: "Закупка",             color: "#b45309", bg: "#fffbeb", group: "xarid" },
    ishlab_chiqarish: { uz: "Ishlab chiqarish",    ru: "Производство",        color: "#4f46e5", bg: "#eef2ff", group: "ishlab" },
    sarf:             { uz: "Liniya sarfi",        ru: "Расход на линию",     color: "#0891b2", bg: "#ecfeff", group: "ishlab" },
    kochirish:        { uz: "Ko'chirish",          ru: "Перемещение",         color: "#0f766e", bg: "#f0fdfa", group: "ombor" },
    kassa_kirim:      { uz: "Kassa kirim",         ru: "Касса приход",        color: "#15803d", bg: "#f0fdf4", group: "kassa" },
    kassa_chiqim:     { uz: "Kassa chiqim",        ru: "Касса расход",        color: "#b91c1c", bg: "#fef2f2", group: "kassa" },
  },

  GROUPS: [
    ["", { uz: "Barchasi", ru: "Все" }],
    ["ombor", { uz: "Ombor harakatlari", ru: "Движения склада" }],
    ["sotuv", { uz: "Sotuv va yetkazish", ru: "Продажи и доставка" }],
    ["xarid", { uz: "Xaridlar", ru: "Закупки" }],
    ["ishlab", { uz: "Ishlab chiqarish", ru: "Производство" }],
    ["kassa", { uz: "Kassa", ru: "Касса" }],
  ],

  isUz() { return CURRENT_LANG === "uz"; },

  kindLabel(kind) {
    const k = this.KINDS[kind];
    return k ? (this.isUz() ? k.uz : k.ru) : kind;
  },

  // Calendar day in Tashkent (UTC+5 all year), whatever the browser's zone.
  dayKey(d) {
    const t = new Date(d.getTime() + 5 * 3600 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  },

  async render(container) {
    const isUz = this.isUz();
    if (!this.filters.end) {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      this.filters.start = this.dayKey(from);
      this.filters.end = this.dayKey(today);
    }
    const f = "padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;";

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${isUz ? "Tarix" : "История"}</h2>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
                ${isUz ? "Barcha harakatlar: ombor, buyurtma va yetkazish, xaridlar, ishlab chiqarish, kassa."
                       : "Все движения: склад, заказы и доставка, закупки, производство, касса."}
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="exportTableToPdf('history-table', 'tarix')">${t('btn_export_pdf')}</button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px;">
            <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Dan" : "С"}
              <input type="date" id="hist-start" value="${this.filters.start}" style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('start', this.value)"></label>
            <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Gacha" : "По"}
              <input type="date" id="hist-end" value="${this.filters.end}" style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('end', this.value)"></label>
            <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Turi" : "Тип"}
              <select id="hist-group" style="${f}width:100%;margin-top:4px;" onchange="HistoryModule.setFilter('group', this.value)">
                ${this.GROUPS.map(([k, l]) => `<option value="${k}" ${k === this.filters.group ? "selected" : ""}>${isUz ? l.uz : l.ru}</option>`).join("")}
              </select></label>
            <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Qidirish" : "Поиск"}
              <input id="hist-search" value="${escapeHtml(this.filters.search)}" placeholder="${isUz ? "Hujjat, mijoz, o'lcham..." : "Документ, клиент, размер..."}"
                style="${f}width:100%;margin-top:4px;" oninput="HistoryModule.onSearch(this.value)"></label>
          </div>
          <div id="hist-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;"></div>
        </div>

        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:0;overflow:hidden;">
          <div id="hist-body" style="padding:30px;text-align:center;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
        </div>
      </div>`;
    await this.load();
  },

  setFilter(key, value) {
    this.filters[key] = value;
    if (key === "search") this.renderTable();
    else this.load();
  },

  onSearch(value) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.setFilter("search", value), 200);
  },

  async load() {
    const body = document.getElementById("hist-body");
    try {
      this.data = await API.getHistory({ start: this.filters.start, end: this.filters.end, limit: 1000 });
    } catch (e) {
      if (body) body.innerHTML = `<span style="color:#b91c1c;">${escapeHtml(e.message)}</span>`;
      return;
    }
    this.renderTable();
  },

  visibleEvents() {
    if (!this.data) return [];
    const g = this.filters.group;
    const q = (this.filters.search || "").trim().toLowerCase();
    return this.data.events.filter(e => {
      if (g && (this.KINDS[e.kind] || {}).group !== g) return false;
      if (!q) return true;
      return [e.ref, e.place, e.party, e.details, e.user, this.kindLabel(e.kind)]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  },

  renderChips(events) {
    const el = document.getElementById("hist-chips");
    if (!el) return;
    const counts = {};
    events.forEach(e => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    el.innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
      const c = this.KINDS[k] || { color: "#475569", bg: "#f1f5f9" };
      return `<span style="padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${c.bg};color:${c.color};border:1px solid ${c.color}30;">${this.kindLabel(k)}: ${n}</span>`;
    }).join("");
  },

  renderTable() {
    const isUz = this.isUz();
    const body = document.getElementById("hist-body");
    if (!body) return;
    const events = this.visibleEvents();
    this.renderChips(events);

    if (!events.length) {
      body.style.padding = "30px";
      body.innerHTML = `<span>${isUz ? "Bu davrda harakat topilmadi." : "За этот период движений нет."}</span>`;
      return;
    }

    const fmtAt = at => {
      if (!at) return "-";
      const [d, tm] = at.split("T");
      const [y, m, day] = d.split("-");
      return `${day}.${m}.${y}${tm && tm !== "00:00" ? " " + tm : ""}`;
    };
    const money = e => e.amount == null ? "-" :
      `${formatNumber(e.amount, 0, e.currency === "USD" ? 2 : 0)} ${e.currency || ""}`;

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
            </tr>
          </thead>
          <tbody>
            ${events.map(e => {
              const c = this.KINDS[e.kind] || { color: "#475569", bg: "#f1f5f9" };
              const storno = e.status === "Storno" || e.kind.endsWith("storno") || e.kind === "buyurtma_bekor";
              return `<tr style="${storno ? "opacity:.65;" : ""}">
                <td style="white-space:nowrap;">${fmtAt(e.at)}</td>
                <td><span style="display:inline-block;padding:3px 8px;border-radius:6px;font-size:11.5px;font-weight:700;background:${c.bg};color:${c.color};white-space:nowrap;">${this.kindLabel(e.kind)}</span></td>
                <td style="font-weight:700;white-space:nowrap;">${escapeHtml(e.ref || "-")}</td>
                <td>${escapeHtml(e.place || "-")}</td>
                <td>${escapeHtml(e.party || "-")}</td>
                <td style="max-width:360px;white-space:normal;">${escapeHtml(e.details || "-")}</td>
                <td style="white-space:nowrap;">${escapeHtml(e.quantity || "-")}</td>
                <td style="text-align:right;white-space:nowrap;font-weight:600;">${money(e)}</td>
                <td>${escapeHtml(e.status || "-")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 14px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;">
        ${isUz ? "Jami" : "Всего"}: ${events.length}
      </div>`;
  },
};
