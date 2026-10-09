/**
 * Dimensional warehouse (Sklad).
 *
 * Stock is a length x width matrix per warehouse, the same shape the Telegram
 * sklad bot uses. A size is one code: 680 means 600 x 80.
 *
 * Sales are priced per linear metre ("metr") or square metre ("mkv"):
 *   linear     = (length + width) / 100
 *   piece_size = linear            for metr
 *   piece_size = linear * eni/100  for mkv
 * Delivery is added on top and split across lines in proportion to units.
 */
const SkladModule = {
  config: null,
  warehouses: [],
  currentSkladId: 3,
  matrix: null,
  movements: [],
  view: "matrix",           // matrix | movements | stats
  sellLines: [],
  receiveLines: [],

  async render(container) {
    const isUz = CURRENT_LANG === "uz";
    container.innerHTML = `
      <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px;">
<span>${isUz ? "Ombor (o'lcham bo'yicha)" : "Склад (по размерам)"}</span>
            </h2>
            <p style="margin:4px 0 0 0;color:#64748b;font-size:13px;">
              ${isUz
                ? "Uzunlik × kenglik jadvali. O'lcham bitta kod bilan yoziladi: 680 = 600×80"
                : "Таблица длина × ширина. Размер пишется одним кодом: 680 = 600×80"}
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="SkladModule.openReceiveModal()"
              style="background:#059669;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;">
              + ${isUz ? "Kirim" : "Приход"}
            </button>
            <button class="btn btn-sm" onclick="SkladModule.openSellModal()"
              style="background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;">
              ${isUz ? "Sotish" : "Продажа"}
            </button>
          </div>
        </div>

        <div style="display:flex;gap:6px;border-bottom:1px solid #e2e8f0;margin-bottom:16px;flex-wrap:wrap;">
          ${[["matrix", isUz ? "Ombor jadvali" : "Таблица склада"],
             ["movements", isUz ? "Harakatlar" : "Движения"],
             ["stats", isUz ? "Hisobot" : "Отчет"]].map(([k, label]) =>
            `<button id="sklad-tab-${k}" class="tab-btn" onclick="SkladModule.setView('${k}')"
               style="padding:10px 16px;font-weight:600;font-size:13.5px;border:none;background:transparent;cursor:pointer;border-bottom:3px solid transparent;color:#64748b;">${label}</button>`
          ).join("")}
        </div>

        <div id="sklad-content">
          <div style="text-align:center;padding:40px;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
        </div>
      </div>
    `;
    await this.loadAll();
    this.setView("matrix");
  },

  async loadAll() {
    try {
      if (!this.config) this.config = await API.getSkladConfig();
      const whs = await API.getSkladWarehouses();
      this.warehouses = whs.warehouses || [];
      // A user limited to some warehouses starts on the first of them.
      if (this.warehouses.length && !this.warehouses.some(w => w.sklad_id === this.currentSkladId)) {
        this.currentSkladId = this.warehouses[0].sklad_id;
      }
      this.matrix = await API.getSkladMatrix(this.currentSkladId);
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async setView(v) {
    this.view = v;
    ["matrix", "movements", "stats"].forEach(k => {
      const b = document.getElementById(`sklad-tab-${k}`);
      if (b) {
        b.style.borderBottomColor = k === v ? "#2563eb" : "transparent";
        b.style.color = k === v ? "#2563eb" : "#64748b";
      }
    });
    const el = document.getElementById("sklad-content");
    if (!el) return;

    if (v === "matrix") {
      el.innerHTML = this.matrixView();
    } else if (v === "movements") {
      el.innerHTML = `<div style="padding:30px;text-align:center;color:#94a3b8;">...</div>`;
      try {
        const r = await API.getSkladMovements(50);
        this.movements = r.movements || [];
        el.innerHTML = this.movementsView();
      } catch (e) { el.innerHTML = `<div style="padding:20px;color:#dc2626;">${e.message}</div>`; }
    } else {
      el.innerHTML = `<div style="padding:30px;text-align:center;color:#94a3b8;">...</div>`;
      try {
        el.innerHTML = this.statsView(await API.getSkladStatistics());
      } catch (e) { el.innerHTML = `<div style="padding:20px;color:#dc2626;">${e.message}</div>`; }
    }
    if (typeof makeTablesScrollable === "function") makeTablesScrollable(el);
  },

  async selectSklad(id) {
    this.currentSkladId = id;
    try {
      this.matrix = await API.getSkladMatrix(id);
      const [whs] = await Promise.all([API.getSkladWarehouses()]);
      this.warehouses = whs.warehouses || [];
    } catch (e) { showToast(e.message, "error"); }
    await this.setView(this.view);
  },

  // ---------- warehouse picker ----------
  picker() {
    const isUz = CURRENT_LANG === "uz";
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
        ${this.warehouses.map(w => {
          const on = w.sklad_id === this.currentSkladId;
          return `<button class="btn btn-sm" onclick="SkladModule.selectSklad(${w.sklad_id})"
            style="padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;
                   background:${on ? "#0f172a" : "#f1f5f9"};color:${on ? "#fff" : "#475569"};
                   border:1px solid ${on ? "#0f172a" : "#e2e8f0"};">
            ${w.name} <span style="opacity:.75;font-weight:500;">${w.eni}</span>
            <span style="display:block;font-size:10px;font-weight:600;opacity:.85;">${formatNumber(w.total_qty)} ${isUz ? "dona" : "шт"}</span>
          </button>`;
        }).join("")}
      </div>`;
  },

  // ---------- matrix ----------
  matrixView() {
    const isUz = CURRENT_LANG === "uz";
    const m = this.matrix;
    if (!m) return `<div style="padding:30px;color:#94a3b8;">—</div>`;

    const byPos = {};
    (m.cells || []).forEach(c => { byPos[`${c.length}_${c.width}`] = c; });

    const head = `<tr>
      <th style="background:#0f172a;color:#fff;font-size:18px;font-weight:800;text-align:center;min-width:58px;">${m.corner_number}</th>
      ${m.cols.map(c => `<th style="background:#f8fafc;color:#dc2626;font-weight:800;text-align:center;font-size:14px;">${c}</th>`).join("")}
    </tr>`;

    const body = m.rows.map(r => `
      <tr>
        <th style="background:#f8fafc;color:#dc2626;font-weight:800;text-align:center;font-size:14px;">${r}</th>
        ${m.cols.map(c => {
          const cell = byPos[`${r}_${c}`];
          if (!cell || !cell.quantity) return `<td style="text-align:center;color:#e2e8f0;">·</td>`;
          return `<td title="${r}×${c} = ${isUz ? "kod" : "код"} ${cell.code}"
                      style="text-align:center;font-weight:800;font-size:15px;color:#6d28d9;">${formatNumber(cell.quantity)}</td>`;
        }).join("")}
      </tr>`).join("");

    return `
      ${this.picker()}
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;">
        <div><strong>${m.name} ${m.eni}</strong></div>
        <div style="color:#64748b;">${isUz ? "Jami" : "Всего"}: <strong>${formatNumber(m.total_qty)}</strong> ${isUz ? "dona" : "шт"}</div>
        <div style="color:#64748b;">${isUz ? "Metr" : "Метр"}: <strong>${formatNumber(m.total_metr, 0, 2)}</strong></div>
        <div style="color:#64748b;">m²: <strong>${formatNumber(m.total_mkv, 0, 2)}</strong></div>
      </div>
      <div class="sklad-matrix-wrap">
        <div class="table-container">
          <table class="data-table" id="sklad-matrix-table" style="width:100%;border-collapse:collapse;">
            <thead>${head}</thead><tbody>${body}</tbody>
          </table>
        </div>
        <div style="margin-top:8px;font-size:11.5px;color:#94a3b8;">
          ${isUz ? "Qator = uzunlik, ustun = kenglik. 680 = 600×80." : "Строка = длина, столбец = ширина. 680 = 600×80."}
        </div>
      </div>
      ${this.phoneList()}`;
  },

  // On a phone the grid is wider than the screen and mostly empty, so the
  // sizes in stock are listed instead, grouped by length.
  phoneList() {
    const isUz = CURRENT_LANG === "uz";
    const m = this.matrix;
    const pcs = isUz ? "dona" : "шт";
    const cells = (m.cells || []).filter(c => c.quantity)
      .sort((a, b) => a.length - b.length || a.width - b.width);
    if (!cells.length) {
      return `<div class="sklad-phone-list" style="text-align:center;padding:28px;color:#94a3b8;">${t("ombor_phone_empty")}</div>`;
    }
    const groups = [];
    cells.forEach(c => {
      let g = groups[groups.length - 1];
      if (!g || g.length !== c.length) { g = { length: c.length, qty: 0, cells: [] }; groups.push(g); }
      g.qty += c.quantity;
      g.cells.push(c);
    });
    const metr = c => c.quantity * (c.length + c.width) / 100;
    return `
      <div class="sklad-phone-list">
        ${groups.map(g => `
          <div style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;overflow:hidden;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <span style="font-weight:800;color:#dc2626;font-size:15px;">${g.length}</span>
              <span style="font-size:12.5px;color:#64748b;">${formatNumber(g.qty)} ${pcs}</span>
            </div>
            ${g.cells.map(c => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #f1f5f9;">
                <div>
                  <div style="font-weight:700;font-size:15px;color:#0f172a;">${c.length} × ${c.width}</div>
                  <div style="font-size:11.5px;color:#94a3b8;">${isUz ? "kod" : "код"} ${c.code}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800;font-size:16px;color:#6d28d9;">${formatNumber(c.quantity)} <span style="font-size:12px;font-weight:600;color:#64748b;">${pcs}</span></div>
                  <div style="font-size:11.5px;color:#64748b;">${formatNumber(metr(c), 0, 2)} ${isUz ? "metr" : "м"}</div>
                </div>
              </div>`).join("")}
          </div>`).join("")}
      </div>`;
  },

  // ---------- movements ----------
  movementsView() {
    const isUz = CURRENT_LANG === "uz";
    if (!this.movements.length) {
      return `${this.picker()}<div style="text-align:center;padding:44px;color:#64748b;">

        <p style="margin:0;">${isUz ? "Harakatlar yo'q" : "Движений нет"}</p></div>`;
    }
    const col = op => op === "PRIXOD" ? "#059669" : (op === "RASXOD" ? "#dc2626" : "#64748b");
    return `
      ${this.picker()}
      <div class="table-container">
        <table class="data-table" id="sklad-movements-table" style="width:100%;">
          <thead><tr>
            <th>${isUz ? "Sana" : "Дата"}</th><th>${isUz ? "Ombor" : "Склад"}</th>
            <th>${isUz ? "Amal" : "Операция"}</th><th>${isUz ? "O'lchamlar" : "Размеры"}</th>
            <th style="text-align:right;">${isUz ? "Birlik" : "Единиц"}</th>
            <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
            <th style="text-align:right;">${isUz ? "Dastavka" : "Доставка"}</th>
            <th style="text-align:right;">${isUz ? "Jami" : "Итого"}</th>
            <th>${isUz ? "Mijoz" : "Клиент"}</th>
          </tr></thead>
          <tbody>
            ${this.movements.map(m => `<tr>
              <td style="white-space:nowrap;font-size:12px;">${m.occurred_at ? new Date(m.occurred_at).toLocaleString() : "-"}</td>
              <td>${m.sklad_label}</td>
              <td><strong style="color:${col(m.operation)};">${m.operation}</strong>
                  ${m.sell_type ? `<div style="font-size:11px;color:#64748b;">${m.sell_type === "mkv" ? "m²" : "metr"}</div>` : ""}</td>
              <td style="font-size:12px;">${m.details}</td>
              <td style="text-align:right;">${m.total_units != null ? formatNumber(m.total_units, 0, 2) : "-"}</td>
              <td style="text-align:right;">${m.total_revenue != null ? formatNumber(m.total_revenue, 0, 0) : "-"}</td>
              <td style="text-align:right;">${m.delivery_cost ? formatNumber(m.delivery_cost, 0, 0) : "-"}</td>
              <td style="text-align:right;font-weight:700;">${m.operation === "RASXOD" ? formatNumber(m.grand_total, 0, 0) : "-"}</td>
              <td style="font-size:12px;">${m.client_name || "-"}${m.client_phone ? `<div style="color:#64748b;">${m.client_phone}</div>` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  statsView(s) {
    const isUz = CURRENT_LANG === "uz";
    const tile = (label, value, colour) => `
      <div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
        <div style="font-size:11.5px;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${colour};margin-top:4px;">${value}</div>
      </div>`;
    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        ${tile(isUz ? "Sotuvlar" : "Продаж", formatNumber(s.sales_count), "#0f172a")}
        ${tile(isUz ? "Tovar summasi" : "Сумма товара", formatNumber(s.total_revenue, 0, 0), "#16a34a")}
        ${tile(isUz ? "Dastavka" : "Доставка", formatNumber(s.total_delivery, 0, 0), "#b45309")}
        ${tile(isUz ? "Umumiy" : "Итого", formatNumber(s.grand_total, 0, 0), "#2563eb")}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${tile(isUz ? "Sotilgan metr" : "Продано метр", formatNumber(s.units_metr, 0, 2), "#475569")}
        ${tile(isUz ? "Sotilgan m²" : "Продано m²", formatNumber(s.units_mkv, 0, 2), "#475569")}
      </div>`;
  },

  // ================= KIRIM (goods in) =================
  openReceiveModal() {
    const isUz = CURRENT_LANG === "uz";
    this.receiveLines = [{ code: "", quantity: 1 }];
    showModal(
      isUz ? "Kirim" : "Приход",
      `<div style="margin-bottom:12px;">
         <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Ombor" : "Склад"}</label>
         <select id="rcv-sklad" class="form-control">
           ${this.warehouses.map(w => `<option value="${w.sklad_id}" ${w.sklad_id === this.currentSkladId ? "selected" : ""}>${w.name} ${w.eni}</option>`).join("")}
         </select>
       </div>
       <div style="margin-bottom:12px;">
         <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Kimdan" : "От кого"}</label>
         <input id="rcv-supplier" class="form-control" placeholder="${isUz ? "Yetkazib beruvchi" : "Поставщик"}" />
       </div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
         <strong style="font-size:13px;">${isUz ? "O'lchamlar" : "Размеры"}</strong>
         <button type="button" class="btn btn-sm btn-secondary" onclick="SkladModule.addReceiveLine()">+ ${isUz ? "Qator" : "Строка"}</button>
       </div>
       <div id="rcv-lines"></div>
       <div style="margin-top:8px;font-size:11.5px;color:#94a3b8;">
         ${isUz ? "O'lcham kodi: 680 = 600×80, 835 = 800×35" : "Код размера: 680 = 600×80, 835 = 800×35"}
       </div>`,
      async () => await this.submitReceive()
    );
    this.renderReceiveLines();
  },

  addReceiveLine() { this.receiveLines.push({ code: "", quantity: 1 }); this.renderReceiveLines(); },
  removeReceiveLine(i) {
    this.receiveLines.splice(i, 1);
    if (!this.receiveLines.length) this.receiveLines.push({ code: "", quantity: 1 });
    this.renderReceiveLines();
  },
  updateReceiveLine(i, f, v) {
    this.receiveLines[i][f] = f === "code" ? v : parseFloat(v || 0);
    this.renderReceiveLines();
  },

  renderReceiveLines() {
    const wrap = document.getElementById("rcv-lines");
    if (!wrap) return;
    const isUz = CURRENT_LANG === "uz";
    wrap.innerHTML = this.receiveLines.map((ln, i) => {
      const hint = this.describeCode(ln.code);
      return `<div style="display:grid;grid-template-columns:1.4fr 1fr auto;gap:8px;align-items:start;margin-bottom:8px;">
        <div>
          <input class="form-control" value="${ln.code}" inputmode="numeric"
                 onchange="SkladModule.updateReceiveLine(${i},'code',this.value)"
                 placeholder="${isUz ? "O'lcham kodi (680)" : "Код размера (680)"}" />
          <div style="font-size:11px;margin-top:3px;color:${hint.ok ? "#059669" : "#dc2626"};">${hint.text}</div>
        </div>
        <input type="number" min="1" step="1" class="form-control" value="${ln.quantity}"
               onchange="SkladModule.updateReceiveLine(${i},'quantity',this.value)" placeholder="${isUz ? "Soni" : "Кол-во"}" />
        <button type="button" class="btn btn-sm" onclick="SkladModule.removeReceiveLine(${i})"
                style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;cursor:pointer;">✕</button>
      </div>`;
    }).join("");
  },

  /** Validate a typed size code against the allowed lengths and widths. */
  describeCode(code) {
    const isUz = CURRENT_LANG === "uz";
    const n = parseInt(code, 10);
    if (!code || isNaN(n)) return { ok: false, text: isUz ? "Kod kiriting" : "Введите код" };
    const length = Math.floor(n / 100) * 100;
    const width = n % 100;
    const cfg = this.config;
    if (!cfg) return { ok: true, text: `${length}×${width}` };
    if (!cfg.lengths.includes(length) || !cfg.widths.includes(width)) {
      return { ok: false, text: isUz ? `${n} — bunday o'lcham yo'q` : `${n} — такого размера нет` };
    }
    return { ok: true, text: `${length}×${width}` };
  },

  async submitReceive() {
    const isUz = CURRENT_LANG === "uz";
    const items = this.receiveLines
      .filter(l => l.code && l.quantity > 0)
      .map(l => ({ code: parseInt(l.code, 10), quantity: parseInt(l.quantity, 10) }));
    if (!items.length) {
      showToast(isUz ? "Kamida bitta o'lcham kiriting" : "Введите хотя бы один размер", "error");
      return false;
    }
    try {
      await API.skladKirim({
        sklad_id: parseInt(document.getElementById("rcv-sklad").value, 10),
        supplier: (document.getElementById("rcv-supplier").value || "").trim(),
        items
      });
      showToast(isUz ? "Kirim saqlandi" : "Приход сохранен", "success");
      await this.loadAll();
      await this.setView("matrix");
      return true;
    } catch (e) { showToast(e.message, "error"); return false; }
  },

  // ================= SOTISH (sale) =================
  openSellModal() {
    const isUz = CURRENT_LANG === "uz";
    const cfg = this.matrix;
    this.sellLines = [{ code: "", quantity: 1, unit_price: 0, eni: cfg ? cfg.eni : 120 }];
    showModal(
      isUz ? "Sotish" : "Продажа",
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
         <div>
           <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Ombor" : "Склад"}</label>
           <select id="sell-sklad" class="form-control" onchange="SkladModule.onSellSkladChange()">
             ${this.warehouses.map(w => `<option value="${w.sklad_id}" ${w.sklad_id === this.currentSkladId ? "selected" : ""}>${w.name} ${w.eni}</option>`).join("")}
           </select>
         </div>
         <div>
           <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Sotuv turi" : "Тип продажи"}</label>
           <select id="sell-type" class="form-control" onchange="SkladModule.refreshPreview()">
             <option value="metr">${isUz ? "Metr bo'yicha" : "По метрам"}</option>
             <option value="mkv">${isUz ? "Metr kvadrat bo'yicha" : "По м²"}</option>
           </select>
         </div>
       </div>

       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
         <strong style="font-size:13px;">${isUz ? "Tovarlar" : "Товары"}</strong>
         <button type="button" class="btn btn-sm btn-secondary" onclick="SkladModule.addSellLine()">+ ${isUz ? "Qator" : "Строка"}</button>
       </div>
       <div id="sell-lines"></div>

       <div style="margin:12px 0;">
         <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Dastavka narxi" : "Стоимость доставки"}</label>
         <input type="number" id="sell-delivery" class="form-control" min="0" step="any" value="0"
                onchange="SkladModule.refreshPreview()" />
       </div>

       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
         <div>
           <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Mijoz" : "Клиент"}</label>
           <input id="sell-client" class="form-control" placeholder="${isUz ? "Ismi" : "Имя"}" />
         </div>
         <div>
           <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Telefon" : "Телефон"}</label>
           <input id="sell-phone" class="form-control" placeholder="+998..." />
         </div>
         <div style="grid-column:1/-1;">
           <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Manzil" : "Адрес"}</label>
           <input id="sell-address" class="form-control" placeholder="${isUz ? "Yetkazish manzili" : "Адрес доставки"}" />
         </div>
       </div>

       <div id="sell-summary" style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;"></div>`,
      async () => await this.submitSell(),
      "modal-lg"
    );
    this.renderSellLines();
  },

  onSellSkladChange() {
    const id = parseInt(document.getElementById("sell-sklad").value, 10);
    const w = this.warehouses.find(x => x.sklad_id === id);
    if (w) this.sellLines.forEach(l => { l.eni = w.eni; });
    this.renderSellLines();
  },

  addSellLine() {
    const last = this.sellLines[this.sellLines.length - 1];
    this.sellLines.push({ code: "", quantity: 1, unit_price: last ? last.unit_price : 0, eni: last ? last.eni : 120 });
    this.renderSellLines();
  },
  removeSellLine(i) {
    this.sellLines.splice(i, 1);
    if (!this.sellLines.length) this.sellLines.push({ code: "", quantity: 1, unit_price: 0, eni: 120 });
    this.renderSellLines();
  },
  updateSellLine(i, f, v) {
    this.sellLines[i][f] = f === "code" ? v : parseFloat(v || 0);
    this.renderSellLines();
  },

  renderSellLines() {
    const wrap = document.getElementById("sell-lines");
    if (!wrap) return;
    const isUz = CURRENT_LANG === "uz";
    wrap.innerHTML = this.sellLines.map((ln, i) => {
      const hint = this.describeCode(ln.code);
      return `<div style="display:grid;grid-template-columns:1.3fr .7fr .8fr 1fr auto;gap:7px;align-items:start;margin-bottom:8px;">
        <div>
          <input class="form-control" value="${ln.code}" inputmode="numeric"
                 onchange="SkladModule.updateSellLine(${i},'code',this.value)"
                 placeholder="${isUz ? "Kod (680)" : "Код (680)"}" />
          <div style="font-size:11px;margin-top:3px;color:${hint.ok ? "#059669" : "#dc2626"};">${hint.text}</div>
        </div>
        <input type="number" min="1" step="1" class="form-control" value="${ln.quantity}"
               onchange="SkladModule.updateSellLine(${i},'quantity',this.value)" placeholder="${isUz ? "Soni" : "Кол"}" />
        <select class="form-control" onchange="SkladModule.updateSellLine(${i},'eni',this.value)">
          <option value="120" ${ln.eni === 120 ? "selected" : ""}>eni 120</option>
          <option value="100" ${ln.eni === 100 ? "selected" : ""}>eni 100</option>
        </select>
        <input type="number" min="0" step="any" class="form-control" value="${ln.unit_price}"
               onchange="SkladModule.updateSellLine(${i},'unit_price',this.value)" placeholder="${isUz ? "Narx" : "Цена"}" />
        <button type="button" class="btn btn-sm" onclick="SkladModule.removeSellLine(${i})"
                style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;cursor:pointer;">✕</button>
      </div>`;
    }).join("");
    this.refreshPreview();
  },

  /** Ask the server to price the draft, so the form always shows the real figures. */
  async refreshPreview() {
    const box = document.getElementById("sell-summary");
    if (!box) return;
    const isUz = CURRENT_LANG === "uz";
    const items = this.sellLines
      .filter(l => l.code && l.quantity > 0)
      .map(l => ({ code: parseInt(l.code, 10), quantity: parseInt(l.quantity, 10),
                   unit_price: l.unit_price || 0, eni: l.eni || 120 }));
    if (!items.length) { box.innerHTML = ""; return; }

    try {
      const p = await API.skladPreview({
        sklad_id: parseInt(document.getElementById("sell-sklad").value, 10),
        sell_type: document.getElementById("sell-type").value,
        delivery_cost: parseFloat(document.getElementById("sell-delivery").value || 0),
        items
      });
      const unitLabel = p.sell_type === "mkv" ? "m²" : (isUz ? "metr" : "метр");
      box.innerHTML = `
        <div style="font-size:12.5px;color:#475569;">
          ${p.lines.map(l => `<div style="display:flex;justify-content:space-between;padding:2px 0;">
            <span>${l.quantity} × ${l.code} <span style="color:#94a3b8;">(${formatNumber(l.units, 0, 2)} ${unitLabel})</span></span>
            <span>${formatNumber(l.line_total, 0, 0)}${l.delivery_share ? ` <span style="color:#b45309;">+${formatNumber(l.delivery_share, 0, 0)}</span>` : ""}</span>
          </div>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;color:#64748b;">
          <span>${isUz ? "Jami" : "Всего"}: ${formatNumber(p.total_pieces)} ${isUz ? "dona" : "шт"} / ${formatNumber(p.total_units, 0, 2)} ${unitLabel}</span>
          <span>${formatNumber(p.total_revenue, 0, 0)}</span>
        </div>
        ${p.delivery_cost ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#b45309;">
          <span>${isUz ? "Dastavka" : "Доставка"}</span><span>${formatNumber(p.delivery_cost, 0, 0)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:16px;font-weight:800;">
          <span>${isUz ? "Umumiy" : "Итого"}</span><span>${formatNumber(p.grand_total, 0, 0)}</span>
        </div>`;
    } catch (e) {
      box.innerHTML = `<div style="color:#dc2626;font-size:12px;">${e.message}</div>`;
    }
  },

  async submitSell() {
    const isUz = CURRENT_LANG === "uz";
    const items = this.sellLines
      .filter(l => l.code && l.quantity > 0)
      .map(l => ({ code: parseInt(l.code, 10), quantity: parseInt(l.quantity, 10),
                   unit_price: l.unit_price || 0, eni: l.eni || 120 }));
    if (!items.length) {
      showToast(isUz ? "Kamida bitta tovar kiriting" : "Добавьте хотя бы один товар", "error");
      return false;
    }
    try {
      await API.skladSotish({
        sklad_id: parseInt(document.getElementById("sell-sklad").value, 10),
        sell_type: document.getElementById("sell-type").value,
        delivery_cost: parseFloat(document.getElementById("sell-delivery").value || 0),
        client_name: (document.getElementById("sell-client").value || "").trim(),
        client_phone: (document.getElementById("sell-phone").value || "").trim(),
        client_address: (document.getElementById("sell-address").value || "").trim(),
        items
      });
      showToast(isUz ? "Sotuv saqlandi" : "Продажа сохранена", "success");
      await this.loadAll();
      await this.setView("movements");
      return true;
    } catch (e) { showToast(e.message, "error"); return false; }
  }
};

window.SkladModule = SkladModule;
