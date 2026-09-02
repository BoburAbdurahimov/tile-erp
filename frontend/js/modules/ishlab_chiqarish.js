const ProductionModule = {
  rawMaterialsList: [],
  finishedMaterialsList: [],
  allStockBalances: [],
  activeTab: 'orders',

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div class="card-title" style="font-size: 20px; font-weight: 700;">🏭 ${t('mod_prod_title')}</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-warning" onclick="ProductionModule.openLineExpenseModal()" style="font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 5px rgba(234, 179, 8, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer; background: #eab308; color: #ffffff; border: none;">
              <span>⚙️</span> <span>${CURRENT_LANG === 'uz' ? '+ Sarf materiallari (Aralash ombor)' : '+ Расход материалов (Оборудование)'}</span>
            </button>
            <button class="btn btn-primary" onclick="ProductionModule.openNewOrderModal()" style="font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <span>➕</span> <span>${t('btn_new_production')}</span>
            </button>
          </div>
        </div>

        <!-- 5 Lines KPI Breakdown -->
        <div class="grid-5" id="production-lines-grid" style="margin-bottom: 24px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Tabs Header -->
        <div style="display: flex; gap: 10px; margin-top: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; flex-wrap: wrap;">
          <button id="prod-tab-orders" class="btn" onclick="ProductionModule.switchTab('orders')" style="font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; background: #2563eb; color: #ffffff; cursor: pointer;">
            📋 ${CURRENT_LANG === 'uz' ? 'Buyurtmalar va Chiqarilgan Tayyor Mahsulotlar' : 'История выпуска готовой продукции'}
          </button>
          <button id="prod-tab-expenses" class="btn" onclick="ProductionModule.switchTab('expenses')" style="font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; background: #f1f5f9; color: #475569; cursor: pointer;">
            ⚙️ ${CURRENT_LANG === 'uz' ? 'Liniyalar Sarf Materiallari (Zapchastlar)' : 'Расход материалов на линии'}
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

  async loadLinesStats() {
    const grid = document.getElementById("production-lines-grid");
    if (!grid) return;

    try {
      const [lines, stats] = await Promise.all([
        API.getProductionLines(),
        API.get7DayStats()
      ]);

      grid.innerHTML = lines.map(l => {
        const lineVol = stats.line_totals[`Line ${l.line_number}`] || 0;
        const lineTitle = CURRENT_LANG === 'uz' ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`;
        return `
          <div class="kpi-card" style="border-top: 4px solid #3b82f6; border-radius: 12px; padding: 22px 14px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-height: 115px;">
            <div style="font-size: 19px; font-weight: 700; color: #1e293b; margin-bottom: 10px; text-align: center; letter-spacing: 0.5px; width: 100%; display: flex; align-items: center; justify-content: center;">
              ${lineTitle}
            </div>
            <div style="font-size: 26px; font-weight: 800; color: #0f172a; text-align: center; width: 100%; display: flex; align-items: baseline; justify-content: center; gap: 6px;">
              <span>${lineVol.toLocaleString()}</span>
              <span style="font-size: 16px; font-weight: 600; color: #64748b;">${CURRENT_LANG === 'uz' ? 'dona' : 'шт'}</span>
            </div>
          </div>
        `;
      }).join("");
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
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Tegishli Liniyalar' : 'Целевые Линии'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${CURRENT_LANG === 'uz' ? 'Sarflangan Zapchastlar / Materiallar' : 'Списанные материалы / Запчасти'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${CURRENT_LANG === 'uz' ? 'Jami Qiymat ($)' : 'Сумма ($)'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)">${t('th_description')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Liniyalar...' : 'Линии...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Zapchast...' : 'Деталь...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="5" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Izoh...' : 'Описание...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">
                  ⚠️ ${CURRENT_LANG === 'uz' ? 'Hozircha birorta ham liniya sarf materiali yozilmagan' : 'Записей расходов пока нет'}
                </td>
              </tr>
            ` : expenses.map(e => `
              <tr class="${e.status === 'Storno' ? 'storno-row' : ''}">
                <td data-sort-value="${e.date}">${formatDate(e.date)}</td>
                <td data-sort-value="${e.expense_number}"><code>${e.expense_number}</code></td>
                <td data-sort-value="${e.line_names.join(', ')}">
                  <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    ${e.line_names.map(ln => `<span class="badge" style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 6px; font-weight: 600;">${ln}</span>`).join("")}
                  </div>
                </td>
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
                      ↩️ ${t('btn_storno')}
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
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Liniya' : 'Линия'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${CURRENT_LANG === 'uz' ? 'Tayyor mahsulot' : 'Готовая продукция'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Liniya...' : 'Линия...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Mahsulot...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="5" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr class="${o.status === 'Storno' ? 'storno-row' : ''}">
                <td data-sort-value="${o.date}">${formatDate(o.date)}</td>
                <td data-sort-value="${o.order_number}"><code>${o.order_number}</code></td>
                <td data-sort-value="${o.line_name}"><span class="badge" style="background: #f1f5f9; color: #1e293b; padding: 4px 8px; border-radius: 6px; font-weight: 500;">${tr(o.line_name)}</span></td>
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
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="ProductionModule.deleteOrder(${o.id}, '${o.order_number}')" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
                      🗑️
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
    
    // Fetch materials, lines, and stock balances from Warehouse 2 (Ishlab chiqarish uchun materiallar)
    const [lines, finishedMaterials, rawStockItems] = await Promise.all([
      API.getProductionLines(),
      API.getMaterials("Tayyor mahsulot"),
      API.getStockBalances(2)
    ]);
    
    this.finishedMaterialsList = finishedMaterials || [];
    this.wh2StockItems = (rawStockItems || []).filter(s => s.quantity > 0);

    showModal(
      CURRENT_LANG === 'uz' ? "Yangi Ishlab Chiqarish hujjati kiritish" : "Ввод документа выпуска готовой продукции",
      `
        <datalist id="prod-output-mat-datalist">
          ${(this.finishedMaterialsList || []).map(m => `<option value="${m.code} - ${m.name} (${tr(m.unit)})" data-id="${m.id}">${m.code} - ${m.name}</option>`).join("")}
        </datalist>

        <datalist id="prod-consumed-wh2-datalist">
          ${this.wh2StockItems.map(s => `<option value="${s.material_code} - ${s.material_name} (${tr(s.unit)})" data-id="${s.material_id}">${CURRENT_LANG === 'uz' ? 'Omborda mavjud' : 'В наличии'}: ${formatNumber(s.quantity, 0, 2)} ${tr(s.unit)}</option>`).join("")}
        </datalist>

        <form id="new-prod-order-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Ishlab chiqarish liniyasi *' : 'Производственная линия *'}</label>
              <select id="po-line" class="form-control" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required>
                ${lines.map(l => `<option value="${l.id}">${CURRENT_LANG === 'uz' ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_date')} *</label>
              <input type="date" id="po-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>

          <div class="form-row" style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Chiqarilayotgan Tayyor kafel plitasi *' : 'Выпускаемая готовая плитка *'}</label>
              <input 
                type="text" 
                id="po-output-mat-input" 
                list="prod-output-mat-datalist" 
                class="form-control" 
                placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Kafel kodi yoki nomini yozing...' : 'Код или наименование плитки...'}" 
                value="" 
                style="width: 100%; padding: 8px 12px; border-radius: 8px;"
                required 
              />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Chiqarilgan hajm (dona) *' : 'Объем выпуска (шт) *'}</label>
              <input type="number" step="any" id="po-quantity" class="form-control" placeholder="1000" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              🧪 ${CURRENT_LANG === 'uz' ? 'Sarflangan xomashyo va materiallar (2: Ishlab chiqarish uchun materiallar ombori):' : 'Израсходованное сырье (Склад 2):'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ProductionModule.addConsumedRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
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

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_description')}</label>
            <textarea id="po-notes" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? 'Smena yoki partiya izohi...' : 'Примечание к смене / партии...'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const lineId = parseInt(document.getElementById("po-line").value);
        const d = document.getElementById("po-date").value;
        const outMatInput = document.getElementById("po-output-mat-input").value.trim();
        const qty = parseFloat(document.getElementById("po-quantity").value);
        const notes = document.getElementById("po-notes").value.trim();

        const matchedOutMat = ProductionModule.findFinishedMaterialByInput(outMatInput);
        if (!matchedOutMat || !outMatInput) {
          showToast(CURRENT_LANG === 'uz' ? "Chiqarilayotgan tayyor mahsulotni tanlang!" : "Пожалуйста, выберите готовую продукцию из списка!", "warning");
          return false;
        }

        if (!lineId || isNaN(qty) || qty <= 0) {
          showToast(CURRENT_LANG === 'uz' ? "Chiqarilgan hajmni to'g'ri kiriting!" : "Укажите корректный объем!", "warning");
          return false;
        }

        const consumed = [];
        const rows = document.querySelectorAll("#consumed-rows-body tr");
        rows.forEach(rowEl => {
          const matInput = rowEl.querySelector(".row-mat-input") ? rowEl.querySelector(".row-mat-input").value.trim() : "";
          const cQty = parseFloat(rowEl.querySelector(".row-qty").value);
          const matchedRaw = (ProductionModule.wh2StockItems || []).find(s => `${s.material_code} - ${s.material_name} (${tr(s.unit)})`.toLowerCase() === matInput.toLowerCase() || s.material_code.toLowerCase() === matInput.toLowerCase());
          if (matchedRaw && cQty > 0) {
            consumed.push({ material_id: matchedRaw.material_id, warehouse_id: 2, quantity: cQty });
          }
        });

        try {
          await API.createProductionOrder({
            line_id: lineId,
            output_material_id: matchedOutMat.id,
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

    // Add initial clean row
    this.addConsumedRow();
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
          placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Xomashyo kodi yoki nomi...' : 'Код или наименование сырья...'}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" placeholder="0" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" required />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">❌</button>
      </td>
    `;
    tbody.appendChild(trEl);
  },

  async openLineExpenseModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [lines, stockItems] = await Promise.all([
      API.getProductionLines(),
      API.getStockBalances(3) // Fetch from Warehouse 3 (Aralash ombor)
    ]);

    const availableStock = (stockItems || []).filter(s => s.quantity > 0);

    showModal(
      CURRENT_LANG === 'uz' ? "⚙️ Liniyalar uchun Sarf materiallari (Aralash ombor) kiritish" : "⚙️ Списание материалов на линии (Склад 3)",
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

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 700; font-size: 13px; color: #0f172a;">⚙️ ${CURRENT_LANG === 'uz' ? 'Sarf qilingan Ishlab chiqarish liniyalari * (Bir nechta tanlash imkoni)' : 'Задействованные линии *'}</label>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
              ${lines.map(l => `
                <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; cursor: pointer; color: #1e293b;">
                  <input type="checkbox" class="le-line-cb" value="${l.id}" style="width: 18px; height: 18px; cursor: pointer;" />
                  <span>${CURRENT_LANG === 'uz' ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`}</span>
                </label>
              `).join("")}
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              📦 ${CURRENT_LANG === 'uz' ? '3-Aralash ombordan sarflangan zapchast / materiallar:' : 'Списанные материалы со Склада 3:'}
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
            <textarea id="le-notes" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? 'Masalan: Liniya 1-4 stanoklari uchun motor almashtirildi...' : 'Описание...'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const d = document.getElementById("le-date").value;
        const notes = document.getElementById("le-notes").value.trim();
        const lineCbs = document.querySelectorAll(".le-line-cb:checked");
        const lineIds = Array.from(lineCbs).map(cb => parseInt(cb.value, 10));

        if (lineIds.length === 0) {
          showToast(CURRENT_LANG === 'uz' ? "Kamida bitta liniyani tanlang!" : "Выберите хотя бы одну линию!", "warning");
          return false;
        }

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
            line_ids: lineIds,
            items: items,
            notes: notes
          });
          showToast(CURRENT_LANG === 'uz' ? "Liniyalar sarf materiali muvaffaqiyatli saqlandi!" : "Расход материалов успешно сохранен!", "success");
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
          placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Zapchast kodi yoki nomini yozing...' : 'Код или наименование...'}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control le-qty" placeholder="1" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" required />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">❌</button>
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

  findFinishedMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return (this.finishedMaterialsList || []).find(m => {
      const full = `${m.code} - ${m.name} (${tr(m.unit)})`.toLowerCase();
      return full === lower || m.code.toLowerCase() === lower || m.name.toLowerCase() === lower || full.includes(lower) || lower.includes(m.code.toLowerCase());
    }) || null;
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
  }
};
