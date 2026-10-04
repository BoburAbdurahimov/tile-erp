const SalesModule = {
  finishedProductsList: [],
  clientsList: [],
  stockBalances: [],

  async render(container) {
    const isUz = CURRENT_LANG === 'uz';
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Hi-Tech Sales Header & Action Bar -->
        <div class="card" style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px 24px; box-shadow: var(--shadow-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">

                <div>
                  <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                    ${t('mod_sotish_title')}
                  </h2>
                  <p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px; font-weight: 500;">
                    ${t('mod_sotish_sub')}
                  </p>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" onclick="exportTableToPdf('sales-main-table', 'sotuvlar_realizatsiya')" style="display: flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px; font-weight: 600;">
<span>${t('btn_export_pdf')}</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="SalesModule.openNewSaleModal()" style="display: flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 8px; font-weight: 700; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);">
<span>${isUz ? 'Yangi sotuv hujjatini rasmiylashtirish' : 'Новая продажа'}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Sales KPI Summary Cards -->
        <div id="sales-kpi-container" class="grid-4">
          <div class="kpi-card" style="background: #ffffff; border-left: 4px solid #0284c7; padding: 16px 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left-width: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">${isUz ? 'Bugungi sotuv hajmi' : 'Продажи за сегодня'}</div>
            <div id="sales-kpi-today" style="font-size: 22px; font-weight: 800; color: #0284c7; margin: 4px 0; font-family: var(--font-mono);">$0.00</div>
            <div style="font-size: 11.5px; color: #94a3b8;">${isUz ? 'Bugun tasdiqlangan hujjatlar' : 'Сегодняшние документы'}</div>
          </div>

          <div class="kpi-card" style="background: #ffffff; border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left-width: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">${isUz ? 'Oylik realizatsiya daromadi' : 'Выручка за месяц'}</div>
            <div id="sales-kpi-month" style="font-size: 22px; font-weight: 800; color: #10b981; margin: 4px 0; font-family: var(--font-mono);">$0.00</div>
            <div style="font-size: 11.5px; color: #94a3b8;">${isUz ? 'Joriy oy olingan tushum' : 'Выручка текущего месяца'}</div>
          </div>

          <div class="kpi-card" style="background: #ffffff; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left-width: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">${isUz ? 'Mijozlar qarzdorligi (Nasiya)' : 'Дебиторская задолженность'}</div>
            <div id="sales-kpi-debt" style="font-size: 22px; font-weight: 800; color: #d97706; margin: 4px 0; font-family: var(--font-mono);">$0.00</div>
            <div style="font-size: 11.5px; color: #94a3b8;">${isUz ? 'Mijozlar hisobidagi ochiq balans' : 'Баланс клиентов'}</div>
          </div>

          <div class="kpi-card" style="background: #ffffff; border-left: 4px solid #6366f1; padding: 16px 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left-width: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">${isUz ? 'Hujjatlar soni' : 'Всего документов'}</div>
            <div id="sales-kpi-count" style="font-size: 22px; font-weight: 800; color: #4f46e5; margin: 4px 0; font-family: var(--font-mono);">0 ta</div>
            <div style="font-size: 11.5px; color: #94a3b8;">${isUz ? 'Rasmiylashtirilgan realizatsiyalar' : 'Всего реализаций'}</div>
          </div>
        </div>

        <!-- Sales Data Table Card -->
        <div class="card" style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: var(--shadow-sm);">
          <div class="table-container" id="sales-table-container">
            <div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
          </div>
        </div>
      </div>
    `;

    await this.loadSales();
  },

  async loadSales() {
    const tableDiv = document.getElementById("sales-table-container");
    if (!tableDiv) return;

    const isUz = CURRENT_LANG === 'uz';

    try {
      const [sales, rates] = await Promise.all([API.getSales(), API.getExchangeRates().catch(() => [])]);
      // UZS sales are converted with the real rate; without one they are left out of the USD totals.
      const fx = (rates && rates[0] && rates[0].rate_usd_uzs) || 0;
      
      // Update KPIs
      let todaySum = 0;
      let monthSum = 0;
      const todayStr = new Date().toISOString().split("T")[0];
      const curMonth = todayStr.substring(0, 7);

      (sales || []).forEach(s => {
        if (s.status === "Tasdiqlandi") {
          const amt = s.currency === "USD" ? (s.total_amount || 0) : (fx ? (s.total_amount || 0) / fx : 0);
          if (s.date === todayStr) todaySum += amt;
          if (s.date && s.date.startsWith(curMonth)) monthSum += amt;
        }
      });

      const kpiToday = document.getElementById("sales-kpi-today");
      const kpiMonth = document.getElementById("sales-kpi-month");
      const kpiCount = document.getElementById("sales-kpi-count");

      if (kpiToday) kpiToday.textContent = "$" + formatNumber(todaySum, 2, 2);
      if (kpiMonth) kpiMonth.textContent = "$" + formatNumber(monthSum, 2, 2);
      if (kpiCount) kpiCount.textContent = (sales ? sales.length : 0) + " ta";

      // Load client debts for KPI
      try {
        const clients = await API.getCounterparties("client");
        let totalDebtUsd = 0;
        (clients || []).forEach(c => {
          if (c.balance_usd < 0) totalDebtUsd += Math.abs(c.balance_usd);
        });
        const kpiDebt = document.getElementById("sales-kpi-debt");
        if (kpiDebt) kpiDebt.textContent = "$" + formatNumber(totalDebtUsd, 2, 2);
      } catch (e) {}

      if (!sales || sales.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">

            <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: #0f172a;">${isUz ? 'Hozircha sotuv hujjatlari mavjud emas' : 'Пока нет документов продаж'}</h3>
            <p style="margin: 0; font-size: 13px; color: #64748b;">${isUz ? 'Yangi sotuv hujjatini rasmiylashtirish uchun yuqoridagi tugmani bosing' : 'Нажмите кнопку выше, чтобы добавить продажу'}</p>
          </div>
        `;
        return;
      }

      tableDiv.innerHTML = `
        <table class="data-table" id="sales-main-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase; font-weight: 700;">
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${isUz ? 'Xaridor (Mijoz)' : 'Покупатель (Клиент)'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 14px;">${t('th_warehouse')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 14px;">${isUz ? 'Sotilgan mahsulot' : 'Товар / Продукция'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="padding: 12px 14px; text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="padding: 12px 14px; text-align: right;">${t('th_price')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="padding: 12px 14px; text-align: right;">${t('th_total')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, false)" style="padding: 12px 14px; text-align: center;">${t('th_currency')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 9, false)" style="padding: 12px 14px;">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row" style="background: #f1f5f9;">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${isUz ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${isUz ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${isUz ? 'Mijoz...' : 'Клиент...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="${isUz ? 'Ombor...' : 'Склад...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="${isUz ? 'Mahsulot...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="8" placeholder="${isUz ? 'Valyuta...' : 'Валюта...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="9" placeholder="${isUz ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => {
              const isUsd = s.currency === 'USD';
              const itemsList = s.items || [];
              const matNames = itemsList.map(it => it.material_name).join(', ');
              const totalQty = itemsList.reduce((acc, it) => acc + (it.quantity || 0), 0);

              const matCellHtml = itemsList.length <= 1
                ? `<span style="font-weight: 600; color: #0f172a;">${itemsList[0]?.material_name || '-'}</span>`
                : `<div style="display: flex; flex-direction: column; gap: 4px;">${itemsList.map(it => `<div style="font-weight: 600; color: #0f172a;">${it.material_name}</div>`).join('')}</div>`;

              const qtyCellHtml = itemsList.length <= 1
                ? `<span style="font-family: var(--font-mono); font-weight: 700;">${formatNumber(itemsList[0]?.quantity || 0, 0, 2)} ${tr(itemsList[0]?.unit || '')}</span>`
                : `<div style="display: flex; flex-direction: column; gap: 4px; text-align: right; font-family: var(--font-mono); font-weight: 700;">${itemsList.map(it => `<div>${formatNumber(it.quantity, 0, 2)} ${tr(it.unit)}</div>`).join('')}</div>`;

              const priceCellHtml = itemsList.length <= 1
                ? `<span style="font-family: var(--font-mono);">${formatNumber(itemsList[0]?.unit_price || 0, 2, 2)}</span>`
                : `<div style="display: flex; flex-direction: column; gap: 4px; text-align: right; font-family: var(--font-mono);">${itemsList.map(it => `<div>${formatNumber(it.unit_price, 2, 2)}</div>`).join('')}</div>`;

              return `
              <tr class="${s.status === 'Storno' ? 'storno-row' : ''}" style="border-bottom: 1px solid #f1f5f9; ${s.status === 'Storno' ? 'opacity: 0.6; background: #fff1f2;' : ''}">
                <td data-sort-value="${s.date}" style="padding: 12px 14px; font-weight: 600; color: #475569;">${formatDate(s.date)}</td>
                <td data-sort-value="${s.sale_number}" style="padding: 12px 14px;"><code style="background: #f0f9ff; color: #0284c7; padding: 3px 8px; border-radius: 6px; font-weight: 700; border: 1px solid #bae6fd;">${s.sale_number}</code></td>
                <td data-sort-value="${s.client_name}" style="padding: 12px 14px;"><strong style="color: #0f172a;">${s.client_name}</strong> <span style="color: #64748b; font-size: 11px;">(${s.client_code})</span></td>
                <td data-sort-value="${s.warehouse_name}" style="padding: 12px 14px;"><span class="badge" style="background: #f0f9ff; color: #0284c7; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #bae6fd;">${tr(s.warehouse_name)}</span></td>
                <td data-sort-value="${matNames}" style="padding: 12px 14px;">${matCellHtml}</td>
                <td data-sort-value="${totalQty}" style="padding: 12px 14px; text-align: right;">${qtyCellHtml}</td>
                <td data-sort-value="${itemsList[0]?.unit_price || 0}" style="padding: 12px 14px; text-align: right;">${priceCellHtml}</td>
                <td data-sort-value="${s.total_amount}" style="padding: 12px 14px; text-align: right;">
                  <span style="color: #10b981; font-size: 14px; font-weight: 800; font-family: var(--font-mono);">
                    ${formatNumber(s.total_amount, 2, 2)}
                  </span>
                </td>
                <td data-sort-value="${s.currency}" style="padding: 12px 14px; text-align: center;">
                  <span class="badge" style="font-weight: 700; padding: 4px 10px; border-radius: 6px; background: ${isUsd ? '#ecfdf5' : '#f0f9ff'}; color: ${isUsd ? '#059669' : '#0284c7'}; border: 1px solid ${isUsd ? '#a7f3d0' : '#bae6fd'};">
                    ${s.currency}
                  </span>
                </td>
                <td data-sort-value="${s.status}" style="padding: 12px 14px;">
                  <span class="badge" style="background: ${s.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${s.status === 'Tasdiqlandi' ? '#166534' : '#991b1b'}; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">
                    ${tr(s.status)}
                  </span>
                </td>
                <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                  <button class="btn btn-sm" onclick="SalesModule.printInvoice(${s.id})" title="Faktura chop etish" style="background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-right: 4px;">
                    ${isUz ? 'Faktura' : 'Счет'}
                  </button>
                  ${s.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-sm" onclick="SalesModule.stornoSale(${s.id}, '${s.sale_number}')" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                      ${t('btn_storno')}
                    </button>
                  ` : ''}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="SalesModule.deleteSale(${s.id}, '${s.sale_number}')" title="O'chirish" style="padding: 5px 8px; font-size: 12px; margin-left: 4px;">
                      ${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}
                    </button>
                  ` : ''}
                </td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async openNewSaleModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [clients, materials, warehouses, stockBalances] = await Promise.all([
      API.getCounterparties("client"),
      API.getMaterials("Tayyor mahsulot"),
      API.getWarehouses(),
      API.getStockBalances()
    ]);

    this.clientsList = clients || [];
    this.finishedProductsList = materials || [];
    this.stockBalances = stockBalances || [];

    const isUz = CURRENT_LANG === 'uz';

    showModal(
      isUz ? "Yangi sotuv hujjatini (Realizatsiyasini) rasmiylashtirish" : "Оформление нового документа продажи",
      `
        <form id="new-sale-form">
          <!-- Datalists for Autocomplete & Search -->
          <datalist id="sale-clients-datalist">
            ${this.clientsList.map(c => `<option value="${c.code} - ${c.name} (${c.region || ''})" data-id="${c.id}">${c.code} - ${c.name}</option>`).join("")}
          </datalist>

          <datalist id="sale-materials-datalist">
            <!-- Dynamically populated with stock balances -->
          </datalist>

          <!-- Top Document Meta Section -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  ${isUz ? 'Xaridor (Mijoz) *' : 'Покупатель (Клиент) *'}
                </label>
                <input 
                  type="text" 
                  id="sale-client-input" 
                  list="sale-clients-datalist" 
                  class="form-control" 
                  placeholder="${isUz ? 'Mijozni tanlang yoki yozing...' : 'Выберите или введите клиента...'}" 
                  onchange="SalesModule.onClientSelect(this)"
                  style="width: 100%; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13.5px; font-weight: 600;"
                  required 
                />
                <div id="sale-client-balance-hint" style="margin-top: 4px; font-size: 12px; font-weight: 600; color: #0284c7; display: none;"></div>
              </div>

              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  ${isUz ? 'Chiqariladigan ombor *' : 'Склад отгрузки *'}
                </label>
                <select id="sale-warehouse" class="form-control" onchange="SalesModule.onWarehouseChange(this)" style="width: 100%; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600;" required>
                  ${warehouses.map(w => `<option value="${w.id}" ${w.id === 1 ? 'selected' : ''}>${tr(w.name)}</option>`).join("")}
                </select>
              </div>

              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  ${isUz ? 'Sana *' : 'Дата *'}
                </label>
                <input type="date" id="sale-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600;" required />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  ${isUz ? 'Valyuta *' : 'Валюта *'}
                </label>
                <select id="sale-currency" class="form-control" onchange="SalesModule.recalculateTotals()" style="width: 100%; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 700; color: #0284c7;" required>
                  <option value="USD">USD ($ AQSH Dollari)</option>
                  <option value="UZS">UZS (So'm milliy valyuta)</option>
                </select>
              </div>

              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  ${isUz ? 'To\'lov turi / Holati' : 'Вид оплаты'}
                </label>
                <select id="sale-payment-type" class="form-control" style="width: 100%; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600;">
                  <option value="credit">${isUz ? 'Qarzga (Nasiya / Balansga kiritiladi)' : 'В кредит (На баланс)'}</option>
                  <option value="cash">${isUz ? 'Naqd pul berildi (Kassaga tushadi)' : 'Наличными'}</option>
                  <option value="bank">${isUz ? 'Bank o\'tkazmasi (Hisob-raqamga)' : 'Банковский перевод'}</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Items Table Header -->
          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 0;">
              ${isUz ? 'Sotilayotgan mahsulotlar (Kafel) ro\'yxati:' : 'Список реализуемой продукции:'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SalesModule.addSaleItemRow()" style="font-size: 12.5px; padding: 6px 14px; border-radius: 8px; cursor: pointer; background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; font-weight: 700;">
              ${isUz ? '+ Yangi pozitsiya qo\'shish' : '+ Добавить позицию'}
            </button>
          </div>

          <table class="basket-table" id="sale-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569; font-weight: 700;">
                <th style="padding: 10px 12px; text-align: left; width: 42%;">${isUz ? 'Mahsulot / Kafel' : 'Продукция / Плитка'}</th>
                <th style="padding: 10px 12px; text-align: left; width: 18%;">${isUz ? 'Miqdor (dona/m2)' : 'Количество'}</th>
                <th style="padding: 10px 12px; text-align: left; width: 18%;">${isUz ? 'Sotuv narxi' : 'Цена продажи'}</th>
                <th style="padding: 10px 12px; text-align: right; width: 16%;">${isUz ? 'Jami summa' : 'Сумма'}</th>
                <th style="padding: 10px 12px; text-align: center; width: 6%;">${isUz ? 'Amal' : 'Действие'}</th>
              </tr>
            </thead>
            <tbody id="sale-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <!-- Live Totals Bar -->
          <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 13px; font-weight: 700; color: #0c4a6e;">
              ${isUz ? 'Jami Hujjat Summasi:' : 'Итоговая сумма:'}
            </div>
            <div style="text-align: right;">
              <div id="sale-grand-total-val" style="font-size: 22px; font-weight: 900; color: #0284c7; font-family: var(--font-mono);">$0.00</div>
            </div>
          </div>

          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
            <textarea id="sale-desc" class="form-control" rows="2" placeholder="${isUz ? 'Shartnoma raqami, yetkazib berish shartlari yoki qo\'shimcha izoh...' : 'Номер договора, условия доставки...'}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const clientInput = document.getElementById("sale-client-input").value.trim();
        const d = document.getElementById("sale-date").value;
        const whId = parseInt(document.getElementById("sale-warehouse").value);
        const curr = document.getElementById("sale-currency").value;
        const desc = document.getElementById("sale-desc").value.trim();

        const matchedClient = SalesModule.findClientByInput(clientInput);
        if (!matchedClient) {
          showToast(isUz ? "Iltimos, ro'yxatdan to'g'ri Xaridorni (Mijozni) tanlang!" : "Пожалуйста, выберите клиента из списка!", "error");
          return false;
        }

        const items = [];
        const rows = document.querySelectorAll("#sale-rows-body tr");
        for (const tr of rows) {
          const matInput = tr.querySelector(".row-mat-input").value.trim();
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);

          const matchedMat = SalesModule.findMaterialByInput(matInput);
          if (matchedMat && qty > 0 && price >= 0) {
            items.push({ material_id: matchedMat.id, quantity: qty, unit_price: price });
          }
        }

        if (items.length === 0) {
          showToast(isUz ? "Kamida bitta mahsulot va uning miqdori/narxini kiriting!" : "Введите хотя бы одну позицию!", "warning");
          return false;
        }

        try {
          await API.createSale({
            client_id: matchedClient.id,
            warehouse_id: whId,
            date: d,
            currency: curr,
            items,
            description: desc
          });
          showToast(isUz ? "Sotuv hujjati muvaffaqiyatli rasmiylashtirildi!" : "Документ продажи успешно оформлен!", "success");
          await SalesModule.loadSales();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    // Initial setup for Datalist & First Row
    this.updateMaterialsDatalist(1);
    this.addSaleItemRow();
  },

  onClientSelect(inputEl) {
    const val = inputEl.value.trim();
    const hint = document.getElementById("sale-client-balance-hint");
    if (!hint) return;

    const matched = this.findClientByInput(val);
    if (matched) {
      const balUsd = matched.balance_usd || 0;
      const statusText = balUsd < 0 ? `Qarzdorlik: $${formatNumber(Math.abs(balUsd), 2, 2)}` : `Haqdorlik: +$${formatNumber(balUsd, 2, 2)}`;
      hint.innerHTML = `<strong>${matched.name}</strong> - Balans: <span style="color: ${balUsd < 0 ? '#ef4444' : '#10b981'};">${statusText}</span>`;
      hint.style.display = "block";
    } else {
      hint.style.display = "none";
    }
  },

  onWarehouseChange(selectEl) {
    const whId = parseInt(selectEl.value);
    this.updateMaterialsDatalist(whId);
  },

  updateMaterialsDatalist(whId) {
    const dl = document.getElementById("sale-materials-datalist");
    if (!dl) return;

    const stockMap = {};
    (this.stockBalances || []).forEach(sb => {
      if (sb.warehouse_id === whId) {
        stockMap[sb.material_id] = sb.quantity;
      }
    });

    dl.innerHTML = (this.finishedProductsList || []).map(m => {
      const qty = stockMap[m.id] || 0;
      return `<option value="${m.code} - ${m.name} [Omborda: ${formatNumber(qty, 0, 2)} ${tr(m.unit)}]" data-id="${m.id}" data-qty="${qty}" data-price-usd="${m.current_avg_price_usd}" data-price-uzs="${m.current_avg_price_uzs}">${m.code} - ${m.name}</option>`;
    }).join("");
  },

  addSaleItemRow() {
    const tbody = document.getElementById("sale-rows-body");
    if (!tbody) return;

    const rowId = "sale-row-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const tr = document.createElement("tr");
    tr.id = rowId;
    tr.style.borderBottom = "1px solid #e2e8f0";

    const isUz = CURRENT_LANG === 'uz';

    tr.innerHTML = `
      <td style="padding: 8px 10px;">
        <input type="text" class="form-control row-mat-input" list="sale-materials-datalist" placeholder="${isUz ? 'Mahsulotni tanlang...' : 'Выберите товар...'}" onchange="SalesModule.onRowMatChange('${rowId}')" style="width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-weight: 600;" required />
        <div class="row-stock-hint" style="font-size: 11px; color: #64748b; margin-top: 3px; display: none;"></div>
      </td>
      <td style="padding: 8px 10px;">
        <input type="number" step="any" min="0.01" class="form-control row-qty" value="1" oninput="SalesModule.recalculateTotals()" style="width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-family: var(--font-mono); font-weight: 700;" required />
      </td>
      <td style="padding: 8px 10px;">
        <input type="number" step="any" min="0" class="form-control row-price" value="0" oninput="SalesModule.recalculateTotals()" style="width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-family: var(--font-mono); font-weight: 700;" required />
      </td>
      <td style="padding: 8px 10px; text-align: right;">
        <div class="row-total-val" style="font-size: 14px; font-weight: 800; color: #0284c7; font-family: var(--font-mono);">$0.00</div>
      </td>
      <td style="padding: 8px 10px; text-align: center;">
        <button type="button" onclick="SalesModule.removeRow('${rowId}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;">✕</button>
      </td>
    `;

    tbody.appendChild(tr);
    this.recalculateTotals();
  },

  onRowMatChange(rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) return;

    const inputVal = tr.querySelector(".row-mat-input").value.trim();
    const hint = tr.querySelector(".row-stock-hint");
    const priceInput = tr.querySelector(".row-price");
    const curr = document.getElementById("sale-currency")?.value || "USD";

    const matched = this.findMaterialByInput(inputVal);
    if (matched) {
      const whId = parseInt(document.getElementById("sale-warehouse")?.value || 1);
      const stockItem = (this.stockBalances || []).find(sb => sb.warehouse_id === whId && sb.material_id === matched.id);
      const availQty = stockItem ? stockItem.quantity : 0;

      if (hint) {
        hint.innerHTML = `Omborda: <strong style="color: ${availQty > 0 ? '#10b981' : '#ef4444'};">${formatNumber(availQty, 0, 2)} ${tr(matched.unit)}</strong>`;
        hint.style.display = "block";
      }

      if (priceInput && (!priceInput.value || parseFloat(priceInput.value) === 0)) {
        priceInput.value = curr === "USD" ? (matched.current_avg_price_usd || 0) : (matched.current_avg_price_uzs || 0);
      }
    } else {
      if (hint) hint.style.display = "none";
    }

    this.recalculateTotals();
  },

  removeRow(rowId) {
    const tr = document.getElementById(rowId);
    if (tr) {
      tr.remove();
      this.recalculateTotals();
    }
  },

  recalculateTotals() {
    let grandTotal = 0;
    const curr = document.getElementById("sale-currency")?.value || "USD";
    const symbol = curr === "USD" ? "$" : "UZS ";

    const rows = document.querySelectorAll("#sale-rows-body tr");
    rows.forEach(tr => {
      const qty = parseFloat(tr.querySelector(".row-qty")?.value) || 0;
      const price = parseFloat(tr.querySelector(".row-price")?.value) || 0;
      const rowTotal = qty * price;
      grandTotal += rowTotal;

      const totalDiv = tr.querySelector(".row-total-val");
      if (totalDiv) {
        totalDiv.textContent = symbol + formatNumber(rowTotal, 2, 2);
      }
    });

    const grandTotalDiv = document.getElementById("sale-grand-total-val");
    if (grandTotalDiv) {
      grandTotalDiv.textContent = symbol + formatNumber(grandTotal, 2, 2);
    }
  },

  findClientByInput(val) {
    if (!val) return null;
    return (this.clientsList || []).find(c =>
      val.includes(c.code) || val.includes(c.name) || (c.code + " - " + c.name) === val
    );
  },

  findMaterialByInput(val) {
    if (!val) return null;
    return (this.finishedProductsList || []).find(m =>
      val.includes(m.code) || val.includes(m.name) || (m.code + " - " + m.name) === val
    );
  },

  async printInvoice(saleId) {
    try {
      const sales = await API.getSales();
      const sale = (sales || []).find(s => s.id === saleId);
      if (!sale) {
        showToast("Sotuv hujjati topilmadi", "error");
        return;
      }

      const isUz = CURRENT_LANG === 'uz';
      const itemsList = sale.items || [];
      const totalSum = sale.total_amount || 0;

      showModal(
        `Xisob-Faktura / Nakladnaya № ${sale.sale_number}`,
        `
          <div id="invoice-printable-area" style="background: #ffffff; padding: 24px; font-family: 'Outfit', sans-serif; color: #0f172a;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">

                  <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0284c7;">KAFEL ZAVODI ERP</h2>
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Toshkent v., Zangiota t., Sanoat zonasi #4</div>
                <div style="font-size: 12px; color: #64748b;">Tel: +998 (71) 200-00-00 | Web: tile-erp.uz</div>
              </div>
              <div style="text-align: right;">
                <div style="background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; font-size: 16px; font-weight: 800; padding: 6px 14px; border-radius: 8px; display: inline-block;">
                  FACTURA № ${sale.sale_number}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Sana: <strong>${formatDate(sale.date)}</strong></div>
              </div>
            </div>

            <!-- Customer & Warehouse Info -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">${isUz ? 'XARIDOR (MIJOZ):' : 'ПОКУПАТЕЛЬ:'}</div>
                <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${sale.client_name}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Mijoz kodi: <code>${sale.client_code}</code></div>
              </div>
              <div>
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">${isUz ? 'YETKAZIB BERUVCHI OMBOR:' : 'СКЛАД:'}</div>
                <div style="font-size: 14px; font-weight: 700; color: #0284c7;">${tr(sale.warehouse_name)}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Valyuta: <strong>${sale.currency}</strong></div>
              </div>
            </div>

            <!-- Invoice Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background: #0284c7; color: #ffffff; text-align: left;">
                  <th style="padding: 10px 12px;">№</th>
                  <th style="padding: 10px 12px;">Mahsulot Nomi (Kafel)</th>
                  <th style="padding: 10px 12px; text-align: right;">Miqdor</th>
                  <th style="padding: 10px 12px; text-align: right;">Narxi</th>
                  <th style="padding: 10px 12px; text-align: right;">Jami Summa</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList.map((it, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 12px; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${it.material_name}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 700;">${formatNumber(it.quantity, 0, 2)} ${tr(it.unit)}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono);">${formatNumber(it.unit_price, 2, 2)} ${sale.currency}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 800; color: #0284c7;">${formatNumber(it.total_price || (it.quantity * it.unit_price), 2, 2)} ${sale.currency}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <!-- Summary Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 8px; padding: 14px 18px;">
              <div style="font-size: 13px; font-weight: 700; color: #0c4a6e;">TO'LANISHI KERAK BO'LGAN JAMI SUMMA:</div>
              <div style="font-size: 22px; font-weight: 900; color: #0284c7; font-family: var(--font-mono);">${formatNumber(totalSum, 2, 2)} ${sale.currency}</div>
            </div>

            <!-- Signatures -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; font-size: 12px; color: #475569;">
              <div>
                <div style="border-bottom: 1px solid #94a3b8; padding-bottom: 4px; margin-bottom: 6px;">Topshirdi (Zavod vakili): ________________________</div>
                <div>(Imzo va Muhr o'rni)</div>
              </div>
              <div>
                <div style="border-bottom: 1px solid #94a3b8; padding-bottom: 4px; margin-bottom: 6px;">Qabul qildi (Xaridor): ________________________</div>
                <div>(Imzo)</div>
              </div>
            </div>
          </div>
        `,
        async () => {
          window.print();
          return true;
        },
        "modal-lg"
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async stornoSale(saleId, saleNumber) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `Haqiqatdan ham ${saleNumber} sonli sotuv hujjatini bekor qilmoqchimisiz (Storno)?` : `Отменить продажу ${saleNumber}?`)) return;

    try {
      await API.stornoSale(saleId);
      showToast(isUz ? `${saleNumber} sotuv hujjati bekor qilindi (Storno)` : `Продажа ${saleNumber} отменеna`, "success");
      await this.loadSales();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteSale(saleId, saleNumber) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `Haqiqatdan ham ${saleNumber} sotuv hujjatini butunlay o'chirmoqchimisiz?` : `Удалить продажу ${saleNumber}?`)) return;

    try {
      await API.deleteSale(saleId);
      showToast(isUz ? `${saleNumber} o'chirildi` : `Удалено`, "success");
      await this.loadSales();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
