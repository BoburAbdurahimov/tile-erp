/**
 * Boshqa xarajatlar (prochie rasxodlar): bozorlik, taksi, abed and other
 * costs outside production. Each expense is paid from a Kassa (posted there
 * as a 'chiqim'); a counterparty can be attached to show who was paid.
 */
const ExpensesModule = {
  data: [],
  categories: [],
  registers: [],
  counterparties: [],
  view: "list",             // list | kontragent
  filters: { preset: "month", start: "", end: "", category: "", register: "", counterparty: "", status: "active", search: "" },

  PRESETS: [
    ["today", { uz: "Bugun", ru: "Сегодня" }],
    ["7", { uz: "7 kun", ru: "7 дней" }],
    ["month", { uz: "Shu oy", ru: "Этот месяц" }],
    ["30", { uz: "30 kun", ru: "30 дней" }],
    ["custom", { uz: "Boshqa sana", ru: "Другие даты" }],
  ],

  isUz() { return CURRENT_LANG === "uz"; },
  L(o) { return this.isUz() ? o.uz : o.ru; },

  // Calendar day in Tashkent (UTC+5), whatever the browser's zone.
  dayKey(d) {
    const t = new Date(d.getTime() + 5 * 3600 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  },

  presetRange(p) {
    const now = new Date(), day = 86400000, today = this.dayKey(now);
    if (p === "today") return [today, today];
    if (p === "7") return [this.dayKey(new Date(now.getTime() - 6 * day)), today];
    if (p === "30") return [this.dayKey(new Date(now.getTime() - 29 * day)), today];
    return [today.slice(0, 8) + "01", today];
  },

  btn(active, onclick, label, extra = "") {
    return `<button type="button" onclick="${onclick}"
      style="padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;
             background:${active ? "#0f172a" : "#f1f5f9"};color:${active ? "#fff" : "#475569"};
             border:1px solid ${active ? "#0f172a" : "#e2e8f0"};${extra}">${label}</button>`;
  },

  async render(container) {
    const isUz = this.isUz();
    if (!this.filters.start) [this.filters.start, this.filters.end] = this.presetRange(this.filters.preset);
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${isUz ? "Boshqa xarajatlar" : "Прочие расходы"}</h2>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
                ${isUz ? "Ishlab chiqarishdan tashqari xarajatlar: bozorlik, taksi, abed va boshqalar. Har biri kassadan chiqim bo'ladi."
                       : "Расходы вне производства: базар, такси, обед и прочее. Каждый списывается из кассы."}
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="ExpensesModule.load()">${isUz ? "Yangilash" : "Обновить"}</button>
              <button class="btn btn-secondary btn-sm" onclick="ExpensesModule.resetFilters()">${isUz ? "Filtrlarni tozalash" : "Сбросить фильтры"}</button>
              <button class="btn btn-secondary btn-sm" onclick="exportTableToPdf('expenses-table', 'boshqa_xarajatlar')">${t('btn_export_pdf')}</button>
              <button class="btn btn-primary btn-sm" onclick="ExpensesModule.openCreate()">+ ${isUz ? "Yangi xarajat" : "Новый расход"}</button>
            </div>
          </div>
          <div id="exp-views" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:16px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;"></div>
          <div id="exp-filters" style="display:flex;flex-direction:column;gap:12px;margin-top:14px;"></div>
        </div>
        <div id="exp-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;"></div>
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:0;overflow:hidden;">
          <div id="exp-body" style="padding:30px;text-align:center;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
        </div>
      </div>`;
    try {
      const [cats, regs, cps] = await Promise.all([
        API.getExpenseCategories(), API.getCashRegisters(), API.getExpensePayees(),
      ]);
      this.categories = cats || [];
      this.registers = regs || [];
      this.counterparties = cps || [];
    } catch (e) {
      showToast(e.message, "error");
    }
    await this.load();
  },

  async load() {
    const body = document.getElementById("exp-body");
    try {
      const res = await API.getExpenses({ start: this.filters.start, end: this.filters.end });
      this.data = res.expenses || [];
    } catch (e) {
      if (body) body.innerHTML = `<span style="color:#b91c1c;">${escapeHtml(e.message)}</span>`;
      return;
    }
    this.renderFilters();
    this.renderView();
  },

  // ------------------------------------------------------------ filters

  setPreset(p) {
    this.filters.preset = p;
    if (p !== "custom") {
      [this.filters.start, this.filters.end] = this.presetRange(p);
      this.load();
    } else {
      this.renderFilters();
    }
  },

  setDate(key, value) {
    if (!value) return;
    this.filters[key] = value;
    this.load();
  },

  setFilter(key, value) {
    this.filters[key] = value;
    if (key === "category") this.renderFilters();
    this.renderView();
  },

  setView(v) {
    this.view = v;
    this.renderView();
  },

  onSearch(value) {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setFilter("search", value), 200);
  },

  resetFilters() {
    this.filters = { preset: "month", start: "", end: "", category: "", register: "", counterparty: "", status: "active", search: "" };
    [this.filters.start, this.filters.end] = this.presetRange("month");
    this.view = "list";
    this.load();
  },

  // Everything but the category, so the category buttons show honest sums.
  baseRows() {
    const f = this.filters;
    const q = (f.search || "").trim().toLowerCase();
    return this.data.filter(e => {
      if (f.register && String(e.register_id) !== f.register) return false;
      if (f.counterparty && String(e.counterparty_id || "") !== f.counterparty) return false;
      if (f.status === "active" && e.status !== "Tasdiqlandi") return false;
      if (f.status === "cancelled" && e.status === "Tasdiqlandi") return false;
      if (!q) return true;
      return [e.expense_number, e.category, e.description, e.counterparty_name, e.register_name, e.created_by]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  },

  rows() {
    return this.baseRows().filter(e => !this.filters.category || e.category === this.filters.category);
  },

  renderFilters() {
    const isUz = this.isUz();
    const el = document.getElementById("exp-filters");
    if (!el) return;
    const f = "padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;";
    const lbl = "font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;min-width:84px;";

    // Category buttons with the sum in UZS for the period
    const sums = {};
    this.baseRows().forEach(e => {
      if (e.status !== "Tasdiqlandi") return;
      sums[e.category] = (sums[e.category] || 0) + (e.currency === "UZS" ? e.amount : 0);
    });
    const cats = [...new Set([...this.categories, ...Object.keys(sums)])].filter(c => sums[c] || this.filters.category === c);

    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="${lbl}">${isUz ? "Davr" : "Период"}</span>
        ${this.PRESETS.map(([k, l]) => this.btn(this.filters.preset === k, `ExpensesModule.setPreset('${k}')`, this.L(l))).join("")}
        ${this.filters.preset === "custom" ? `
          <input type="date" value="${this.filters.start}" style="${f}" onchange="ExpensesModule.setDate('start', this.value)">
          <span style="color:#94a3b8;">—</span>
          <input type="date" value="${this.filters.end}" style="${f}" onchange="ExpensesModule.setDate('end', this.value)">` : ""}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="${lbl}">${isUz ? "Turi" : "Тип"}</span>
        ${this.btn(!this.filters.category, "ExpensesModule.setFilter('category', '')", isUz ? "Hammasi" : "Все")}
        ${cats.map(c => this.btn(this.filters.category === c, `ExpensesModule.setFilter('category', ${JSON.stringify(c).replace(/"/g, "&quot;")})`,
          `${escapeHtml(c)}${sums[c] ? ` <span style="opacity:.7;font-weight:600;">${formatNumber(sums[c], 0, 0)}</span>` : ""}`)).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Kassa" : "Касса"}
          <select style="${f}width:100%;margin-top:4px;" onchange="ExpensesModule.setFilter('register', this.value)">
            <option value="">${isUz ? "Hammasi" : "Все"}</option>
            ${this.registers.map(r => `<option value="${r.id}" ${this.filters.register === String(r.id) ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
          </select></label>
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Kontragent" : "Контрагент"}
          <select style="${f}width:100%;margin-top:4px;" onchange="ExpensesModule.setFilter('counterparty', this.value)">
            <option value="">${isUz ? "Hammasi" : "Все"}</option>
            ${this.counterparties.map(c => `<option value="${c.id}" ${this.filters.counterparty === String(c.id) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select></label>
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Holat" : "Статус"}
          <select style="${f}width:100%;margin-top:4px;" onchange="ExpensesModule.setFilter('status', this.value)">
            <option value="active" ${this.filters.status === "active" ? "selected" : ""}>${isUz ? "Amaldagilar" : "Действующие"}</option>
            <option value="cancelled" ${this.filters.status === "cancelled" ? "selected" : ""}>${isUz ? "Bekor qilinganlar" : "Отменённые"}</option>
            <option value="" ${!this.filters.status ? "selected" : ""}>${isUz ? "Hammasi" : "Все"}</option>
          </select></label>
        <label style="font-size:12px;font-weight:700;color:#475569;">${isUz ? "Qidirish" : "Поиск"}
          <input value="${escapeHtml(this.filters.search)}" placeholder="${isUz ? "Izoh, raqam, kontragent..." : "Описание, номер, контрагент..."}"
            style="${f}width:100%;margin-top:4px;" oninput="ExpensesModule.onSearch(this.value)"></label>
      </div>`;
  },

  // ------------------------------------------------------------ views

  card(label, value, color = "#0f172a", sub = "") {
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${sub}</div>` : ""}
    </div>`;
  },

  renderView() {
    const isUz = this.isUz();
    const views = document.getElementById("exp-views");
    if (views) {
      views.innerHTML = [
        ["list", isUz ? "Xarajatlar ro'yxati" : "Список расходов"],
        ["kontragent", isUz ? "Kontragentlar bo'yicha" : "По контрагентам"],
      ].map(([k, l]) => this.btn(this.view === k, `ExpensesModule.setView('${k}')`, l, "padding:9px 14px;font-size:13px;")).join("");
    }
    const rows = this.rows();
    const ok = rows.filter(e => e.status === "Tasdiqlandi");
    const sum = cur => ok.filter(e => e.currency === cur).reduce((s, e) => s + e.amount, 0);
    const byCat = {};
    ok.forEach(e => { if (e.currency === "UZS") byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const sumEl = document.getElementById("exp-summary");
    if (sumEl) {
      sumEl.innerHTML = [
        this.card(isUz ? "Xarajatlar soni" : "Кол-во расходов", formatNumber(ok.length, 0, 0)),
        this.card(isUz ? "Jami (UZS)" : "Итого (UZS)", formatNumber(sum("UZS"), 0, 0), "#b91c1c"),
        this.card(isUz ? "Jami (USD)" : "Итого (USD)", formatNumber(sum("USD"), 0, 2), "#7c3aed"),
        this.card(isUz ? "Eng ko'p" : "Больше всего", top ? escapeHtml(top[0]) : "-", "#0f172a", top ? `${formatNumber(top[1], 0, 0)} UZS` : ""),
      ].join("");
    }
    if (this.view === "kontragent") return this.renderByCounterparty(ok);
    this.renderList(rows);
  },

  renderList(rows) {
    const isUz = this.isUz();
    const body = document.getElementById("exp-body");
    if (!body) return;
    if (!rows.length) {
      body.style.padding = "30px";
      body.innerHTML = isUz ? "Tanlangan filtrlar bo'yicha xarajat yo'q." : "По выбранным фильтрам расходов нет.";
      return;
    }
    body.style.padding = "0";
    body.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" id="expenses-table">
          <thead><tr>
            <th>${isUz ? "Sana" : "Дата"}</th>
            <th>${isUz ? "Raqam" : "Номер"}</th>
            <th>${isUz ? "Turi" : "Тип"}</th>
            <th>${isUz ? "Kontragent" : "Контрагент"}</th>
            <th>${isUz ? "Izoh" : "Описание"}</th>
            <th>${isUz ? "Kassa" : "Касса"}</th>
            <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
            <th>${isUz ? "Kim" : "Кто"}</th>
            <th>${isUz ? "Holat" : "Статус"}</th>
            <th>${isUz ? "Amallar" : "Действия"}</th>
          </tr></thead>
          <tbody>
            ${rows.map(e => `<tr style="${e.status !== "Tasdiqlandi" ? "opacity:.55;" : ""}">
              <td style="white-space:nowrap;">${formatDate(e.date)}</td>
              <td style="white-space:nowrap;font-weight:700;">${escapeHtml(e.expense_number)}</td>
              <td><span style="padding:3px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-weight:700;font-size:12px;white-space:nowrap;">${escapeHtml(e.category)}</span></td>
              <td>${e.counterparty_name ? `<a href="#" onclick="ExpensesModule.showCounterparty(${e.counterparty_id});return false;" style="color:#2563eb;text-decoration:none;font-weight:600;">${escapeHtml(e.counterparty_name)}</a>` : "-"}</td>
              <td style="max-width:320px;white-space:normal;">${escapeHtml(e.description || "-")}</td>
              <td style="white-space:nowrap;">${escapeHtml(e.register_name)}</td>
              <td style="text-align:right;white-space:nowrap;font-weight:700;color:#b91c1c;">${formatNumber(e.amount, 0, e.currency === "USD" ? 2 : 0)} ${e.currency}</td>
              <td>${escapeHtml(e.created_by || "-")}</td>
              <td>${escapeHtml(e.status)}</td>
              <td>${e.status === "Tasdiqlandi" ? `<button class="btn btn-sm" onclick="ExpensesModule.cancel(${e.id}, '${escapeHtml(e.expense_number)}')"
                  style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">${isUz ? "Bekor qilish" : "Отменить"}</button>` : "-"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  // Kontragent integration: who was paid, how much, in which categories.
  renderByCounterparty(ok) {
    const isUz = this.isUz();
    const body = document.getElementById("exp-body");
    if (!body) return;
    const groups = {};
    ok.forEach(e => {
      const key = e.counterparty_id || 0;
      const g = groups[key] || (groups[key] = { id: e.counterparty_id, name: e.counterparty_name || (isUz ? "Kontragentsiz" : "Без контрагента"), count: 0, uzs: 0, usd: 0, cats: {}, last: "" });
      g.count++;
      if (e.currency === "USD") g.usd += e.amount; else g.uzs += e.amount;
      g.cats[e.category] = (g.cats[e.category] || 0) + 1;
      if (e.date > g.last) g.last = e.date;
    });
    const list = Object.values(groups).sort((a, b) => b.uzs - a.uzs);
    if (!list.length) {
      body.style.padding = "30px";
      body.innerHTML = isUz ? "Xarajat yo'q." : "Расходов нет.";
      return;
    }
    body.style.padding = "0";
    body.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" id="expenses-table">
          <thead><tr>
            <th>${isUz ? "Kontragent" : "Контрагент"}</th>
            <th>${isUz ? "Xarajatlar" : "Расходов"}</th>
            <th>${isUz ? "Turlari" : "Типы"}</th>
            <th>${isUz ? "Oxirgi" : "Последний"}</th>
            <th style="text-align:right;">UZS</th>
            <th style="text-align:right;">USD</th>
            <th>${isUz ? "Amallar" : "Действия"}</th>
          </tr></thead>
          <tbody>
            ${list.map(g => `<tr>
              <td style="font-weight:700;">${escapeHtml(g.name)}</td>
              <td>${g.count}</td>
              <td style="white-space:normal;">${Object.keys(g.cats).map(c => escapeHtml(c)).join(", ")}</td>
              <td style="white-space:nowrap;">${formatDate(g.last)}</td>
              <td style="text-align:right;font-weight:700;color:#b91c1c;">${formatNumber(g.uzs, 0, 0)}</td>
              <td style="text-align:right;">${g.usd ? formatNumber(g.usd, 0, 2) : "-"}</td>
              <td>${g.id ? `<button class="btn btn-secondary btn-sm" onclick="ExpensesModule.showCounterparty(${g.id})">${isUz ? "Xarajatlarini ko'rish" : "Показать расходы"}</button>` : "-"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  showCounterparty(id) {
    this.filters.counterparty = String(id);
    this.view = "list";
    this.renderFilters();
    this.renderView();
  },

  // ------------------------------------------------------------ actions

  // Most expenses are paid in cash so'm: default to the UZS cash register.
  defaultRegisterId() {
    const uzs = this.registers.filter(r => r.currency === "UZS");
    const cash = uzs.find(r => r.name === "Kassa UZS") || uzs.sort((a, b) => b.balance - a.balance)[0] || this.registers[0];
    return cash ? cash.id : null;
  },

  openCreate() {
    const isUz = this.isUz();
    const f = "width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;";
    const l = "display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;";
    const today = this.dayKey(new Date());
    showModal(isUz ? "Yangi xarajat" : "Новый расход", `
      <datalist id="exp-cat-list">${this.categories.map(c => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="${l}">${isUz ? "Xarajat turi" : "Тип расхода"} *</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            ${this.categories.slice(0, 10).map(c => `<button type="button" onclick="document.getElementById('exp-cat').value=this.dataset.c" data-c="${escapeHtml(c)}"
              style="padding:5px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">${escapeHtml(c)}</button>`).join("")}
          </div>
          <input id="exp-cat" list="exp-cat-list" style="${f}" placeholder="${isUz ? "Masalan: Bozorlik yoki yangi tur yozing" : "Например: Базар или новый тип"}">
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
          <div><label style="${l}">${isUz ? "Summa" : "Сумма"} *</label>
            <input id="exp-amount" type="number" min="0" step="any" style="${f}" placeholder="0"></div>
          <div><label style="${l}">${isUz ? "Qaysi kassadan" : "Из какой кассы"} *</label>
            <select id="exp-reg" style="${f}">
              ${this.registers.map(r => `<option value="${r.id}" ${r.id === this.defaultRegisterId() ? "selected" : ""}>${escapeHtml(r.name)} — ${formatNumber(r.balance, 0, r.currency === "USD" ? 2 : 0)} ${r.currency}</option>`).join("")}
            </select></div>
          <div><label style="${l}">${isUz ? "Sana" : "Дата"} *</label>
            <input id="exp-date" type="date" value="${today}" style="${f}"></div>
        </div>
        <div>
          <label style="${l}">${isUz ? "Kontragent (kimga to'landi, ixtiyoriy)" : "Контрагент (кому оплачено, необязательно)"}</label>
          <div style="display:flex;gap:6px;">
            <select id="exp-cp" style="${f}">
              <option value="">${isUz ? "— Tanlanmagan —" : "— Не выбран —"}</option>
              ${this.counterparties.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.phone ? " · " + escapeHtml(c.phone) : ""}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ExpensesModule.quickCounterparty()" style="white-space:nowrap;">+ ${isUz ? "Yangi" : "Новый"}</button>
          </div>
          <p style="margin:4px 0 0;font-size:11.5px;color:#64748b;">${isUz ? "Kontragent balansi o'zgarmaydi - faqat kimga to'langani ko'rinadi." : "Баланс контрагента не меняется — только видно, кому оплачено."}</p>
        </div>
        <div><label style="${l}">${isUz ? "Izoh" : "Описание"}</label>
          <input id="exp-desc" style="${f}" placeholder="${isUz ? "Masalan: sex uchun choy, shakar" : "Например: чай, сахар для цеха"}"></div>
      </div>`, async () => {
        const v = id => (document.getElementById(id)?.value || "").trim();
        const amount = parseFloat(v("exp-amount"));
        if (!v("exp-cat")) { showToast(isUz ? "Xarajat turini kiriting" : "Укажите тип расхода", "error"); return false; }
        if (!amount || amount <= 0) { showToast(isUz ? "Summani kiriting" : "Укажите сумму", "error"); return false; }
        await API.createExpense({
          category: v("exp-cat"), amount, register_id: parseInt(v("exp-reg"), 10), date: v("exp-date"),
          counterparty_id: v("exp-cp") ? parseInt(v("exp-cp"), 10) : null, description: v("exp-desc") || null,
        });
        showToast(isUz ? "Xarajat saqlandi va kassadan chiqim qilindi" : "Расход сохранён и списан из кассы", "success");
        this.categories = await API.getExpenseCategories().catch(() => this.categories);
        this.registers = await API.getCashRegisters().catch(() => this.registers);
        await this.load();
        return true;
      });
  },

  // Add a payee without leaving the form (saved in MDM as a supplier).
  async quickCounterparty() {
    const isUz = this.isUz();
    const name = (prompt(isUz ? "Yangi kontragent nomi (masalan: Taksi Yandex, Do'kon)" : "Название нового контрагента") || "").trim();
    if (!name) return;
    const phone = (prompt(isUz ? "Telefon (ixtiyoriy)" : "Телефон (необязательно)") || "").trim();
    try {
      const cp = await API.createExpensePayee({ name, phone: phone || null });
      this.counterparties.push(cp);
      const sel = document.getElementById("exp-cp");
      if (sel) {
        sel.insertAdjacentHTML("beforeend", `<option value="${cp.id}">${escapeHtml(cp.name)}</option>`);
        sel.value = String(cp.id);
      }
      showToast(isUz ? "Kontragent qo'shildi" : "Контрагент добавлен", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async cancel(id, number) {
    const isUz = this.isUz();
    if (!confirm(isUz ? `${number} xarajatini bekor qilasizmi? Pul kassaga qaytariladi.` : `Отменить расход ${number}? Деньги вернутся в кассу.`)) return;
    try {
      await API.cancelExpense(id);
      showToast(isUz ? "Bekor qilindi, pul kassaga qaytdi" : "Отменено, деньги возвращены в кассу", "success");
      this.registers = await API.getCashRegisters().catch(() => this.registers);
      await this.load();
    } catch (e) {
      showToast(e.message, "error");
    }
  },
};
