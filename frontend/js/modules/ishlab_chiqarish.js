const ProductionModule = {
  rawMaterialsList: [],
  allStockBalances: [],
  activeTab: 'orders',

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div class="card-title" style="font-size: 20px; font-weight: 700;">${t('mod_prod_title')}</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary" onclick="ProductionModule.openAutoSarfSettings()" style="font-weight: 700; font-size: 14px; padding: 10px 16px; border-radius: 8px; cursor: pointer; border: 1.5px solid #7c3aed; color: #6d28d9; background: #f5f3ff;">
              ${CURRENT_LANG === 'uz' ? 'Avto sarf' : 'Авто расход'}
            </button>
            <button class="btn btn-secondary" onclick="ProductionModule.exportPdf()" style="font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
<span>${t('btn_export_pdf')}</span>
            </button>
            <button class="btn btn-warning" onclick="ProductionModule.openLineExpenseModal()" style="font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 5px rgba(234, 179, 8, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer; background: #eab308; color: #ffffff; border: none;">
<span>${CURRENT_LANG === 'uz' ? '+ Sarf materiallari (Aralash ombor)' : '+ Расход материалов (Оборудование)'}</span>
            </button>
            <button class="btn btn-primary" onclick="ProductionModule.openNewOrderModal()" style="font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
<span>${t('btn_new_production')}</span>
            </button>
          </div>
        </div>

        <!-- 4 Ombor owners: stock and total length -->
        <div class="grid-5" id="production-lines-grid" style="margin-bottom: 24px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Tabs Header -->
        <div style="display: flex; gap: 10px; margin-top: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; flex-wrap: wrap;">
          <button id="prod-tab-orders" class="btn" onclick="ProductionModule.switchTab('orders')" style="font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; background: #2563eb; color: #ffffff; cursor: pointer;">
            ${CURRENT_LANG === 'uz' ? 'Buyurtmalar va Chiqarilgan Tayyor Mahsulotlar' : 'История выпуска готовой продукции'}
          </button>
          <button id="prod-tab-expenses" class="btn" onclick="ProductionModule.switchTab('expenses')" style="font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; background: #f1f5f9; color: #475569; cursor: pointer;">
            ${CURRENT_LANG === 'uz' ? 'Sarf materiallari (zapchastlar)' : 'Расход материалов'}
          </button>
        </div>

        <div id="prod-tab-content" style="margin-top: 16px;">
          <div class="table-container" id="prod-orders-table-container">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>
    `;

    await Promise.all([this.loadLinesStats(), this.loadOrders()]);
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    const tabOrdersBtn = document.getElementById("prod-tab-orders");
    const tabExpensesBtn = document.getElementById("prod-tab-expenses");
    if (tabOrdersBtn && tabExpensesBtn) {
      if (tabName === 'orders') {
        tabOrdersBtn.style.background = "#2563eb";
        tabOrdersBtn.style.color = "#ffffff";
        tabExpensesBtn.style.background = "#f1f5f9";
        tabExpensesBtn.style.color = "#475569";
        this.loadOrders();
      } else {
        tabExpensesBtn.style.background = "#2563eb";
        tabExpensesBtn.style.color = "#ffffff";
        tabOrdersBtn.style.background = "#f1f5f9";
        tabOrdersBtn.style.color = "#475569";
        this.loadLineExpenses();
      }
    }
  },

  // The cards at the top: the 4 Ombor owners with stock and total length.
  async loadLinesStats() {
    const grid = document.getElementById("production-lines-grid");
    if (!grid) return;
    try {
      const res = await API.getSkladWarehouses();
      grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
      grid.innerHTML = renderSkladOwnerCards(res.warehouses || []);
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async loadLineExpenses() {
    const tableDiv = document.getElementById("prod-orders-table-container");
    if (!tableDiv) return;

    try {
      const expenses = await API.getLineExpenses();
      tableDiv.innerHTML = `
        <table class="data-table" id="line-expenses-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Sarflangan Zapchastlar / Materiallar' : 'Списанные материалы / Запчасти'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, true)" style="text-align: right;">${CURRENT_LANG === 'uz' ? 'Jami Qiymat ($)' : 'Сумма ($)'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)">${t('th_description')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${CURRENT_LANG === 'uz' ? 'Zapchast...' : 'Деталь...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="${CURRENT_LANG === 'uz' ? 'Izoh...' : 'Описание...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">
                  ${CURRENT_LANG === 'uz' ? 'Hozircha sarf materiali yozilmagan' : 'Записей расходов пока нет'}
                </td>
              </tr>
            ` : expenses.map(e => `
              <tr class="${e.status === 'Storno' ? 'storno-row' : ''}">
                <td data-sort-value="${e.date}">${formatDate(e.date)}</td>
                <td data-sort-value="${e.expense_number}"><code>${e.expense_number}</code></td>
                <td data-sort-value="${e.items.map(i => i.material_name).join(', ')}">
                  ${e.items.map(i => `<div style="font-size: 13px;"><b>${i.material_code} - ${i.material_name}</b>: ${formatNumber(i.quantity, 0, 2)} ${tr(i.unit)} ($${formatNumber(i.total_cost_usd, 2, 2)})</div>`).join("")}
                </td>
                <td data-sort-value="${e.total_cost_usd}" style="text-align: right; font-weight: 700; color: #1e293b;">$${formatNumber(e.total_cost_usd, 2, 2)}</td>
                <td data-sort-value="${e.notes || ''}">${e.notes || '-'}</td>
                <td data-sort-value="${e.status}">
                  <span class="badge" style="background: ${e.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${e.status === 'Tasdiqlandi' ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 6px; font-weight: 500;">
                    ${tr(e.status)}
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  ${e.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="ProductionModule.stornoLineExpense(${e.id}, '${e.expense_number}')">
                      ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async loadOrders() {
    const tableDiv = document.getElementById("prod-orders-table-container");
    if (!tableDiv) return;

    try {
      const orders = await API.getProductionOrders();
      tableDiv.innerHTML = `
        <table class="data-table" id="prod-orders-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Ombor' : 'Склад'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${CURRENT_LANG === 'uz' ? 'Tayyor mahsulot' : 'Готовая продукция'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${CURRENT_LANG === 'uz' ? 'Ombor...' : 'Склад...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="${CURRENT_LANG === 'uz' ? 'Mahsulot...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="5" placeholder="${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr class="${o.status === 'Storno' ? 'storno-row' : ''}">
                <td data-sort-value="${o.date}">${formatDate(o.date)}</td>
                <td data-sort-value="${o.order_number}"><code>${o.order_number}</code></td>
                <td data-sort-value="${o.ombor_label}"><span class="badge" style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${escapeHtml(o.ombor_label || '-')}</span></td>
                <td data-sort-value="${o.output_material_name}">${o.output_material_name} <span style="color: #64748b; font-size: 11px;">(${o.output_material_code})</span></td>
                <td data-sort-value="${o.quantity}" style="text-align: right;">${o.quantity.toLocaleString()} ${tr(o.unit)}</td>
                <td data-sort-value="${o.status}">
                  <span class="badge" style="background: ${o.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${o.status === 'Tasdiqlandi' ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 6px; font-weight: 500;">
                    ${tr(o.status)}
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  ${o.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="ProductionModule.stornoOrder(${o.id}, '${o.order_number}')">
                      ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="ProductionModule.deleteOrder(${o.id}, '${o.order_number}')" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
                      ${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}
                    </button>
                  ` : ''}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async openNewOrderModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Ombor config and raw-material stock from Warehouse 2 (Ishlab chiqarish uchun materiallar)
    const [skladConfig, rawStockItems] = await Promise.all([
      API.getSkladConfig(),
      API.getStockBalances(2)
    ]);

    // Finished sheets go into the Ombor: owner + sheet width (eni) + size code.
    this.skladConfig = skladConfig || { warehouses: [], lengths: [], widths: [] };
    const owners = [...new Set(this.skladConfig.warehouses.map(w => w.name))];
    const enis = [...new Set(this.skladConfig.warehouses.map(w => w.eni))];
    this.wh2StockItems = (rawStockItems || []).filter(s => s.quantity > 0);

    showModal(
      CURRENT_LANG === 'uz' ? "Yangi Ishlab Chiqarish hujjati kiritish" : "Ввод документа выпуска готовой продукции",
      `
        <datalist id="prod-consumed-wh2-datalist">
          ${this.wh2StockItems.map(s => `<option value="${s.material_code} - ${s.material_name} (${tr(s.unit)})" data-id="${s.material_id}">${CURRENT_LANG === 'uz' ? 'Omborda mavjud' : 'В наличии'}: ${formatNumber(s.quantity, 0, 2)} ${tr(s.unit)}</option>`).join("")}
        </datalist>

        <form id="new-prod-order-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_date')} *</label>
              <input type="date" id="po-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>

          <div class="form-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px; margin-bottom: 6px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Qaysi omborga *' : 'На какой склад *'}</label>
              <select id="po-owner" class="form-control" style="width: 100%; padding: 8px 12px; border-radius: 8px;" onchange="ProductionModule.refreshAutoSarf()" required>
                ${owners.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Eni *' : 'Ширина листа *'}</label>
              <select id="po-eni" class="form-control" style="width: 100%; padding: 8px 12px; border-radius: 8px;" onchange="ProductionModule.refreshAutoSarf()" required>
                ${enis.map(e => `<option value="${e}">${e}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? "O'lcham kodi *" : 'Код размера *'}</label>
              <input type="text" inputmode="numeric" id="po-size-code" class="form-control" placeholder="680" style="width: 100%; padding: 8px 12px; border-radius: 8px;" oninput="ProductionModule.updateSizeHint()" required />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Miqdor (dona) *' : 'Количество (шт) *'}</label>
              <input type="number" step="1" min="1" id="po-quantity" class="form-control" placeholder="100" style="width: 100%; padding: 8px 12px; border-radius: 8px;" oninput="ProductionModule.refreshAutoSarf()" required />
            </div>
          </div>
          <div id="po-size-hint" style="font-size: 12px; color: #64748b; margin-bottom: 14px;">
            ${CURRENT_LANG === 'uz' ? "O'lcham bitta kod bilan: 680 = 600×80" : 'Размер одним кодом: 680 = 600×80'}
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
                ${CURRENT_LANG === 'uz' ? 'Sarflangan xomashyo va materiallar (2: Ishlab chiqarish uchun materiallar ombori):' : 'Израсходованное сырье (Склад 2):'}
              </label>
              <label style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: #f5f3ff; border: 1.5px solid #c4b5fd; font-size: 13px; font-weight: 700; color: #6d28d9; cursor: pointer; margin: 0;">
                <input type="checkbox" id="po-auto-sarf" onchange="ProductionModule.onAutoSarfToggle()" style="width: 16px; height: 16px; cursor: pointer;" />
                ${CURRENT_LANG === 'uz' ? 'Avto sarf' : 'Авто расход'}
              </label>
            </div>
            <button type="button" id="po-add-row-btn" class="btn btn-secondary btn-sm" onclick="ProductionModule.addConsumedRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              ${CURRENT_LANG === 'uz' ? '+ Xomashyo qo\'shish' : '+ Добавить сырье'}
            </button>
          </div>

          <table class="basket-table" id="consumed-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 68%;">${CURRENT_LANG === 'uz' ? 'Xomashyo / Material' : 'Сырье / Материал'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 22%;">${CURRENT_LANG === 'uz' ? 'Sarflangan miqdor' : 'Расход'}</th>
                <th style="padding: 8px 10px; text-align: center; width: 10%;">${t('th_actions')}</th>
              </tr>
            </thead>
            <tbody id="consumed-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>
          <div id="po-auto-sarf-hint" style="display: none; font-size: 12px; margin: -6px 0 12px;"></div>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_description')}</label>
            <textarea id="po-notes" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? 'Smena yoki partiya izohi...' : 'Примечание к смене / партии...'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const d = document.getElementById("po-date").value;
        const qty = parseFloat(document.getElementById("po-quantity").value);
        const notes = document.getElementById("po-notes").value.trim();
        const outSklad = ProductionModule.selectedSklad();
        const size = ProductionModule.decodeSize(document.getElementById("po-size-code").value);

        if (!outSklad) {
          showToast(CURRENT_LANG === 'uz' ? "Omborni tanlang!" : "Выберите склад!", "warning");
          return false;
        }
        if (!size) {
          showToast(CURRENT_LANG === 'uz' ? "O'lcham kodini to'g'ri kiriting (masalan 680)!" : "Введите корректный код размера (например 680)!", "warning");
          return false;
        }
        if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
          showToast(CURRENT_LANG === 'uz' ? "Chiqarilgan hajmni to'g'ri kiriting!" : "Укажите корректный объем!", "warning");
          return false;
        }

        const consumed = [];
        const rows = document.querySelectorAll("#consumed-rows-body tr");
        rows.forEach(rowEl => {
          const matInput = rowEl.querySelector(".row-mat-input") ? rowEl.querySelector(".row-mat-input").value.trim() : "";
          const cQty = parseFloat(rowEl.querySelector(".row-qty").value);
          const autoId = parseInt(rowEl.dataset.materialId || "0", 10);
          if (autoId && cQty > 0) {
            consumed.push({ material_id: autoId, warehouse_id: 2, quantity: cQty });
            return;
          }
          const matchedRaw = (ProductionModule.wh2StockItems || []).find(s => `${s.material_code} - ${s.material_name} (${tr(s.unit)})`.toLowerCase() === matInput.toLowerCase() || s.material_code.toLowerCase() === matInput.toLowerCase());
          if (matchedRaw && cQty > 0) {
            consumed.push({ material_id: matchedRaw.material_id, warehouse_id: 2, quantity: cQty });
          }
        });

        try {
          await API.createProductionOrder({
            out_sklad_id: outSklad.id,
            out_code: size.length + size.width,
            quantity: qty,
            date: d,
            consumed_materials: consumed,
            notes
          });
          showToast(CURRENT_LANG === 'uz' ? "Ishlab chiqarish buyurtmasi muvaffaqiyatli saqlandi!" : "Документ выпуска успешно сохранен!", "success");
          await ProductionModule.loadLinesStats();
          await ProductionModule.loadOrders();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    // Add initial clean row, then apply Avto sarf if it was on last time.
    this.addConsumedRow();
    let autoOn = false;
    try { autoOn = localStorage.getItem("prod_auto_sarf") === "1"; } catch (_) {}
    const cb = document.getElementById("po-auto-sarf");
    if (cb && autoOn) {
      cb.checked = true;
      this.onAutoSarfToggle();
    }
  },

  // ------------------------------------------------------------ Avto sarf (form)

  onAutoSarfToggle() {
    const on = !!document.getElementById("po-auto-sarf")?.checked;
    try { localStorage.setItem("prod_auto_sarf", on ? "1" : "0"); } catch (_) {}
    const addBtn = document.getElementById("po-add-row-btn");
    if (addBtn) addBtn.style.display = on ? "none" : "";
    if (on) {
      this.refreshAutoSarf();
    } else {
      // Manual entry: start again from one empty row.
      const tbody = document.getElementById("consumed-rows-body");
      if (tbody) tbody.innerHTML = "";
      const hint = document.getElementById("po-auto-sarf-hint");
      if (hint) hint.style.display = "none";
      this.addConsumedRow();
    }
  },

  async refreshAutoSarf() {
    if (!document.getElementById("po-auto-sarf")?.checked) return;
    const isUz = CURRENT_LANG === 'uz';
    const tbody = document.getElementById("consumed-rows-body");
    const hint = document.getElementById("po-auto-sarf-hint");
    if (!tbody) return;
    const qty = parseFloat(document.getElementById("po-quantity")?.value || "0");
    const showHint = (html, color) => { if (hint) { hint.style.display = "block"; hint.style.color = color; hint.innerHTML = html; } };

    if (!qty || qty <= 0) {
      tbody.innerHTML = "";
      showHint(isUz ? "Miqdorni kiriting - sarf avtomatik hisoblanadi." : "Введите количество - расход посчитается автоматически.", "#64748b");
      return;
    }
    const reqId = (this._autoReq = (this._autoReq || 0) + 1);
    let res;
    try {
      res = await API.calcAutoSarf(qty, (this.selectedSklad() || {}).id);
    } catch (e) {
      showHint(escapeHtml(e.message), "#b91c1c");
      return;
    }
    if (reqId !== this._autoReq) return;   // a newer quantity was typed meanwhile
    tbody.innerHTML = "";
    if (!res.configured) {
      showHint(isUz
        ? "Avto sarf hali sozlanmagan. Yuqoridagi «Avto sarf» tugmasi orqali normalarni kiriting yoki galochkani olib, qo'lda kiriting."
        : "Авто расход ещё не настроен. Задайте нормы кнопкой «Авто расход» или снимите галочку и введите вручную.", "#b45309");
      return;
    }
    res.items.forEach(it => {
      const rowEl = document.createElement("tr");
      rowEl.dataset.materialId = it.material_id;
      rowEl.style.borderBottom = "1px solid #f1f5f9";
      rowEl.innerHTML = `
        <td style="padding: 6px 8px;">
          <input type="text" class="form-control row-mat-input" value="${escapeHtml(`${it.material_code} - ${it.material_name}`)}" readonly
            style="width: 100%; padding: 7px 10px; border: 1px solid #ddd6fe; border-radius: 6px; font-size: 13px; background: #faf5ff;" />
        </td>
        <td style="padding: 6px 8px;">
          <input type="number" class="form-control row-qty" value="${it.quantity}" readonly
            style="width: 100%; padding: 7px 10px; border: 1px solid #ddd6fe; border-radius: 6px; font-size: 13px; background: #faf5ff;" />
        </td>
        <td style="padding: 6px 8px; text-align: center; font-size: 11.5px; font-weight: 700; white-space: nowrap; color: ${it.enough ? "#15803d" : "#b91c1c"};">
          ${it.enough ? (isUz ? "Yetarli" : "Хватает") : (isUz ? "Yetmaydi" : "Не хватает")}
          <div style="font-weight: 500; color: #64748b;">${isUz ? "bor" : "есть"}: ${formatNumber(it.available, 0, 2)} ${tr(it.unit)}</div>
        </td>`;
      tbody.appendChild(rowEl);
    });
    const short = res.items.filter(it => !it.enough).length;
    showHint(short
      ? (isUz ? `${short} ta material omborda yetarli emas - saqlashda xato beriladi.` : `${short} материал(ов) не хватает на складе - сохранение не пройдёт.`)
      : (isUz ? "Sarf normalar bo'yicha avtomatik hisoblandi." : "Расход рассчитан автоматически по нормам."),
      short ? "#b91c1c" : "#6d28d9");
  },

  // ------------------------------------------------------------ Avto sarf (settings)

  async openAutoSarfSettings() {
    const isUz = CURRENT_LANG === 'uz';
    let materials = [], config = {};
    try {
      [materials, config] = await Promise.all([API.getMaterials(), API.getSkladConfig()]);
    } catch (e) {
      showToast(e.message, "error");
      return;
    }
    this.autoSarfSklads = config.warehouses || [];
    // Norms are for raw materials and consumables, not finished tiles.
    this.autoSarfMaterials = (materials || []).filter(m => m.category !== "Tayyor mahsulot" && !m.is_archived);
    const f = "width:100%;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;";
    const l = "display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;";

    showModal(isUz ? "Avto sarf sozlamalari" : "Настройки авто расхода", `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <p style="margin:0;font-size:13px;color:#64748b;">
          ${isUz ? "1 dona mahsulot uchun qancha material sarflanishini kiriting. Ishlab chiqarishda «Avto sarf» belgilansa, sarf shu normalar bo'yicha avtomatik hisoblanadi. Ombor uchun alohida norma (masalan Kodir 100) umumiy normadan ustun turadi."
                 : "Укажите расход материала на 1 штуку. При отмеченном «Авто расход» расход считается по этим нормам. Норма для склада (например Кодир 100) важнее общей."}
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
          <div><label style="${l}">${isUz ? "Ombor" : "Склад"}</label>
            <select id="as-sklad" style="${f}">
              <option value="">${isUz ? "Barcha omborlar" : "Все склады"}</option>
              ${this.autoSarfSklads.map(w => `<option value="${w.id}">${escapeHtml(w.name)} ${w.eni}</option>`).join("")}
            </select></div>
          <div style="grid-column: span 2;"><label style="${l}">${isUz ? "Material" : "Материал"}</label>
            <select id="as-material" style="${f}">
              ${this.autoSarfMaterials.map(m => `<option value="${m.id}">${escapeHtml(m.code)} - ${escapeHtml(m.name)} (${tr(m.unit)})</option>`).join("")}
            </select></div>
          <div><label style="${l}">${isUz ? "1 dona uchun miqdor" : "Расход на 1 шт"}</label>
            <input id="as-qty" type="number" min="0" step="any" placeholder="0.25" style="${f}"></div>
          <div><button type="button" class="btn btn-primary btn-sm" onclick="ProductionModule.saveAutoSarfRule()" style="width:100%;padding:9px 12px;">${isUz ? "+ Qo'shish" : "+ Добавить"}</button></div>
        </div>
        <div id="as-rules"><div style="padding:16px;text-align:center;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div></div>
      </div>`, null, "modal-lg");
    await this.loadAutoSarfRules();
  },

  async loadAutoSarfRules() {
    const isUz = CURRENT_LANG === 'uz';
    const box = document.getElementById("as-rules");
    if (!box) return;
    let rules = [];
    try {
      rules = await API.getAutoSarfRules();
    } catch (e) {
      box.innerHTML = `<div style="color:#b91c1c;">${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!rules.length) {
      box.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:10px;">${isUz ? "Hali norma kiritilmagan." : "Нормы ещё не заданы."}</div>`;
      return;
    }
    box.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr>
            <th>${isUz ? "Ombor" : "Склад"}</th>
            <th>${isUz ? "Material" : "Материал"}</th>
            <th style="text-align:right;">${isUz ? "1 dona uchun" : "На 1 шт"}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rules.map(r => `<tr>
              <td>${r.sklad_id ? escapeHtml(r.sklad_label || "") : `<b>${isUz ? "Barcha omborlar" : "Все склады"}</b>`}</td>
              <td>${escapeHtml(r.material_code)} - ${escapeHtml(r.material_name)}</td>
              <td style="text-align:right;">${formatNumber(r.qty_per_unit, 0, 4)} ${tr(r.unit)}</td>
              <td style="text-align:right;"><button type="button" class="btn btn-sm" onclick="ProductionModule.deleteAutoSarfRule(${r.id})"
                style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;padding:4px 10px;border-radius:6px;">${isUz ? "O'chirish" : "Удалить"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  async saveAutoSarfRule() {
    const isUz = CURRENT_LANG === 'uz';
    const qty = parseFloat(document.getElementById("as-qty")?.value || "0");
    const materialId = parseInt(document.getElementById("as-material")?.value || "0", 10);
    const skladId = parseInt(document.getElementById("as-sklad")?.value || "0", 10) || null;
    if (!materialId) { showToast(isUz ? "Materialni tanlang" : "Выберите материал", "error"); return; }
    if (!qty || qty <= 0) { showToast(isUz ? "1 dona uchun miqdorni kiriting" : "Укажите расход на 1 шт", "error"); return; }
    try {
      await API.addAutoSarfRule({ sklad_id: skladId, material_id: materialId, qty_per_unit: qty });
      document.getElementById("as-qty").value = "";
      showToast(isUz ? "Norma saqlandi" : "Норма сохранена", "success");
      await this.loadAutoSarfRules();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteAutoSarfRule(id) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? "Bu normani o'chirasizmi?" : "Удалить эту норму?")) return;
    try {
      await API.deleteAutoSarfRule(id);
      await this.loadAutoSarfRules();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  addConsumedRow() {
    const tbody = document.getElementById("consumed-rows-body");
    if (!tbody) return;

    const trEl = document.createElement("tr");
    trEl.style.borderBottom = "1px solid #f1f5f9";
    trEl.innerHTML = `
      <td style="padding: 6px 8px;">
        <input 
          type="text" 
          list="prod-consumed-wh2-datalist" 
          class="form-control row-mat-input" 
          placeholder="${CURRENT_LANG === 'uz' ? 'Xomashyo kodi yoki nomi...' : 'Код или наименование сырья...'}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" placeholder="0" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" required />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>
      </td>
    `;
    tbody.appendChild(trEl);
  },

  async openLineExpenseModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const stockItems = await API.getStockBalances(3); // Warehouse 3 (Aralash ombor)

    const availableStock = (stockItems || []).filter(s => s.quantity > 0);

    showModal(
      CURRENT_LANG === 'uz' ? "Sarf materiallari (Aralash ombor) kiritish" : "Списание материалов (Склад 3)",
      `
        <datalist id="le-mat-datalist">
          ${availableStock.map(s => `<option value="${s.material_code} - ${s.material_name} (${tr(s.unit)})" data-id="${s.material_id}">${CURRENT_LANG === 'uz' ? 'Mavjud' : 'Доступно'}: ${formatNumber(s.quantity, 0, 2)} ${tr(s.unit)}</option>`).join("")}
        </datalist>

        <form id="line-expense-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_date')} *</label>
              <input type="date" id="le-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>


          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              ${CURRENT_LANG === 'uz' ? '3-Aralash ombordan sarflangan zapchast / materiallar:' : 'Списанные материалы со Склада 3:'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ProductionModule.addLineExpenseRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              ${CURRENT_LANG === 'uz' ? '+ Material qo\'shish' : '+ Добавить материал'}
            </button>
          </div>

          <table class="basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 68%;">${CURRENT_LANG === 'uz' ? 'Zapchast / Material (Aralash ombor)' : 'Материал (Склад 3)'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 22%;">${CURRENT_LANG === 'uz' ? 'Sarflangan miqdor' : 'Расход'}</th>
                <th style="padding: 8px 10px; text-align: center; width: 10%;">${t('th_actions')}</th>
              </tr>
            </thead>
            <tbody id="le-items-body">
              <!-- Dynamic rows -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_description')}</label>
            <textarea id="le-notes" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? 'Masalan: press uchun motor almashtirildi...' : 'Описание...'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const d = document.getElementById("le-date").value;
        const notes = document.getElementById("le-notes").value.trim();

        const items = [];
        const rows = document.querySelectorAll("#le-items-body tr");
        rows.forEach(rowEl => {
          const matInput = rowEl.querySelector(".le-mat-input") ? rowEl.querySelector(".le-mat-input").value.trim() : "";
          const qty = parseFloat(rowEl.querySelector(".le-qty") ? rowEl.querySelector(".le-qty").value : 0);
          const matchedMat = availableStock.find(s => `${s.material_code} - ${s.material_name} (${tr(s.unit)})`.toLowerCase() === matInput.toLowerCase() || s.material_code.toLowerCase() === matInput.toLowerCase());
          if (matchedMat && qty > 0) {
            items.push({ material_id: matchedMat.material_id, quantity: qty });
          }
        });

        if (items.length === 0) {
          showToast(CURRENT_LANG === 'uz' ? "Kamida bitta materialni ro'yxatdan to'g'ri tanlang va miqdorini kiriting!" : "Добавьте хотя бы один материал!", "warning");
          return false;
        }

        try {
          await API.createLineExpense({
            date: d,
            line_ids: [],
            items: items,
            notes: notes
          });
          showToast(CURRENT_LANG === 'uz' ? "Sarf materiali muvaffaqiyatli saqlandi!" : "Расход материалов успешно сохранен!", "success");
          if (ProductionModule.activeTab === 'expenses') {
            await ProductionModule.loadLineExpenses();
          } else {
            await ProductionModule.loadOrders();
          }
          return true;
        } catch (e) {
          showToast(e.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    this.addLineExpenseRow();
  },

  addLineExpenseRow() {
    const tbody = document.getElementById("le-items-body");
    if (!tbody) return;

    const trEl = document.createElement("tr");
    trEl.style.borderBottom = "1px solid #f1f5f9";
    trEl.innerHTML = `
      <td style="padding: 6px 8px;">
        <input 
          type="text" 
          list="le-mat-datalist" 
          class="form-control le-mat-input" 
          placeholder="${CURRENT_LANG === 'uz' ? 'Zapchast kodi yoki nomini yozing...' : 'Код или наименование...'}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control le-qty" placeholder="1" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" required />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>
      </td>
    `;
    tbody.appendChild(trEl);
  },

  async stornoLineExpense(id, expNum) {
    if (!confirm(`${expNum} hujjatini STORNO qilishni tasdiqlaysizmi?\nBarcha sarflangan zapchastlar Aralash omborga qaytariladi.`)) {
      return;
    }

    try {
      await API.stornoLineExpense(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadLineExpenses();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async stornoOrder(id, orderNum) {
    if (!confirm(`${orderNum} buyurtmasini STORNO qilishni tasdiqlaysizmi?\nBarcha sarflangan xomashyo omborga qaytariladi va tayyor mahsulot qoldig'i kamaytiriladi.`)) {
      return;
    }

    try {
      await API.stornoProductionOrder(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadLinesStats();
      await this.loadOrders();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteOrder(id, orderNumber) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `${orderNumber} buyurtmasini butunlay o'chirishni tasdiqlaysizmi?` : `Удалить заказ ${orderNumber} навсегда?`)) return;
    try {
      await API.deleteProductionOrder(id);
      showToast(isUz ? "Buyurtma o'chirildi" : "Заказ удален", "success");
      await this.loadLinesStats();
      await this.loadOrders();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  selectedSklad() {
    const owner = document.getElementById("po-owner")?.value;
    const eni = parseInt(document.getElementById("po-eni")?.value || "0", 10);
    return ((this.skladConfig || {}).warehouses || []).find(w => w.name === owner && w.eni === eni) || null;
  },

  decodeSize(code) {
    const c = parseInt(String(code || "").trim(), 10);
    if (!c) return null;
    const length = Math.floor(c / 100) * 100, width = c % 100;
    const cfg = this.skladConfig || { lengths: [], widths: [] };
    if (!cfg.lengths.includes(length) || !cfg.widths.includes(width)) return null;
    return { length, width };
  },

  updateSizeHint() {
    const el = document.getElementById("po-size-hint");
    if (!el) return;
    const isUz = CURRENT_LANG === 'uz';
    const raw = document.getElementById("po-size-code").value.trim();
    const size = this.decodeSize(raw);
    if (!raw) {
      el.style.color = "#64748b";
      el.textContent = isUz ? "O'lcham bitta kod bilan: 680 = 600×80" : "Размер одним кодом: 680 = 600×80";
    } else if (size) {
      el.style.color = "#15803d";
      el.textContent = `${raw} = ${size.length}×${size.width}`;
    } else {
      el.style.color = "#b91c1c";
      el.textContent = isUz ? `${raw} — bunday o'lcham yo'q` : `${raw} — такого размера нет`;
    }
  },

  exportPdf() {
    const tableId = this.activeTab === 'orders' ? 'prod-orders-table' : 'line-expenses-table';
    const filename = this.activeTab === 'orders' ? 'ishlab_chiqarish_buyurtmalari' : 'sarf_materiallari';
    exportTableToPdf(tableId, filename);
  }
};
