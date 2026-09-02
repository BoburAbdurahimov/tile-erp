const BalancesModule = {
  currentTab: "clients",
  viewCurrency: "USD",

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div class="card-title">👥 ${t('mod_balances_title')}</div>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <label style="font-size: 13px; font-weight: 600;">${CURRENT_LANG === 'uz' ? 'Valyuta:' : 'Валюта:'}</label>
              <div style="display: flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                <button class="btn ${this.viewCurrency === 'USD' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="BalancesModule.setCurrency('USD')">💵 USD ($)</button>
                <button class="btn ${this.viewCurrency === 'UZS' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="BalancesModule.setCurrency('UZS')">🇺🇿 UZS</button>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="exportTableToExcel('balances-table', 'kontragentlar_balansi')" style="display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span>${t('btn_export_excel')}</span>
            </button>
          </div>
        </div>

        <!-- Total Balances KPI Cards -->
        <div class="grid-2" id="balances-kpi-grid" style="margin-bottom: 20px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Tabs -->
        <div class="tabs-nav" style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn ${this.currentTab === 'clients' ? 'active' : ''}" onclick="BalancesModule.switchTab('clients')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'clients' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'clients' ? '#2563eb' : '#64748b'};">
            👤 ${CURRENT_LANG === 'uz' ? 'Mijozlar' : 'Клиенты'}
          </button>
          <button class="tab-btn ${this.currentTab === 'suppliers' ? 'active' : ''}" onclick="BalancesModule.switchTab('suppliers')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'suppliers' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'suppliers' ? '#2563eb' : '#64748b'};">
            🚚 ${CURRENT_LANG === 'uz' ? 'Yetkazib beruvchilar' : 'Поставщики'}
          </button>
        </div>

        <div class="table-container" id="balances-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  async setCurrency(curr) {
    this.viewCurrency = curr;
    await this.render(document.getElementById("module-container"));
  },

  async switchTab(tab) {
    this.currentTab = tab;
    await this.render(document.getElementById("module-container"));
  },

  async loadTabContent() {
    const tableDiv = document.getElementById("balances-table-container");
    const kpiGrid = document.getElementById("balances-kpi-grid");
    if (!tableDiv) return;

    try {
      const summary = await API.getCounterpartiesSummary(this.viewCurrency);
      const isUsd = this.viewCurrency === "USD";
      const altCurrency = isUsd ? "UZS" : "USD";

      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? '👤 Jami mijozlar balansi' : '👤 Общий баланс клиентов'}</span>
            <span class="kpi-value" style="color: #10b981;">${isUsd ? '$' : ''}${summary.total_clients_balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}${!isUsd ? ' UZS' : ''}</span>
            <span class="kpi-sub">${CURRENT_LANG === 'uz' ? 'Debitorlik qoldig\'i' : 'Дебиторская задолженность'}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? '🏢 Jami yetkazib beruvchilar balansi' : '🏢 Общий баланс поставщиков'}</span>
            <span class="kpi-value" style="color: #ef4444;">${isUsd ? '$' : ''}${Math.abs(summary.total_suppliers_balance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}${!isUsd ? ' UZS' : ''}</span>
            <span class="kpi-sub">${CURRENT_LANG === 'uz' ? 'Kreditorlik qoldig\'i' : 'Кредиторская задолженность'}</span>
          </div>
        `;
      }

      let list = this.currentTab === "clients" ? summary.clients : summary.suppliers;

      tableDiv.innerHTML = `
        <table class="data-table" id="balances-main-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_code')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${t('th_name')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${t('th_region')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${t('th_phone')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${t('th_init_bal')} (${this.viewCurrency}) <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${t('th_curr_bal')} (${this.viewCurrency}) <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right;">${altCurrency} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Kod...' : 'Код...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Nom...' : 'Имя...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Viloyat...' : 'Регион...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Tel...' : 'Тел...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(cp => {
              const initBal = cp.initial_balance || 0;
              const curBal = cp.current_balance || 0;
              const altVal = isUsd 
                ? (cp.current_balance_uzs ?? cp.balance_uzs ?? 0)
                : (cp.current_balance_usd ?? cp.balance_usd ?? 0);
              const altFormatted = isUsd
                ? `${altVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} UZS`
                : `$${altVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

              return `
                <tr>
                  <td data-sort-value="${cp.code}"><code>${cp.code}</code></td>
                  <td data-sort-value="${cp.name}">${cp.name}</td>
                  <td data-sort-value="${cp.region || ''}">${cp.region || '-'}</td>
                  <td data-sort-value="${cp.phone || ''}">${cp.phone || '-'}</td>
                  <td data-sort-value="${initBal}" style="text-align: right;">${isUsd ? '$' : ''}${initBal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}${!isUsd ? ' UZS' : ''}</td>
                  <td data-sort-value="${curBal}" style="text-align: right;">
                    <span style="color: ${curBal >= 0 ? '#10b981' : '#ef4444'}; font-size: 13px; font-weight: 600;">
                      ${isUsd ? '$' : ''}${curBal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}${!isUsd ? ' UZS' : ''}
                    </span>
                  </td>
                  <td data-sort-value="${altVal}" style="text-align: right;">${altFormatted}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="BalancesModule.openActSverka(${cp.id}, '${cp.name}')">
                      📜 ${CURRENT_LANG === 'uz' ? 'Akt-Sverka' : 'Акт-Сверка'}
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async openActSverka(cpId, cpName) {
    return this.openLedgerModal(cpId);
  },

  async openLedgerModal(cpId) {
    try {
      const data = await API.getCounterpartyLedger(cpId, this.viewCurrency);
      const isUsd = this.viewCurrency === "USD";
      const curBalUsd = data.current_balance_usd ?? 0;

      showModal(
        CURRENT_LANG === 'uz' ? `📑 O'zaro hisob-kitob tarixi (Akt Sverka): ${data.code} - ${data.name}` : `📑 Акт-Сверка взаиморасчетов: ${data.code} - ${data.name}`,
        `
          <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px 16px; border-radius: 8px;">
            <div>
              <strong>${CURRENT_LANG === 'uz' ? 'Kontragent:' : 'Контрагент:'}</strong> ${data.name} (<code>${data.code}</code>)<br />
              <small style="color: #64748b;">${CURRENT_LANG === 'uz' ? 'Hisob-kitob valyutasi:' : 'Валюта отчета:'} <strong>${this.viewCurrency}</strong></small>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #64748b;">${CURRENT_LANG === 'uz' ? 'Joriy Yakuniy Balans:' : 'Итоговый текущий баланс:'}</div>
              <div style="font-size: 18px; font-weight: 800; color: ${curBalUsd >= 0 ? '#10b981' : '#ef4444'};">
                $${curBalUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD
              </div>
            </div>
          </div>

          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('th_date')}</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Operatsiya turi' : 'Тип операции'}</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Tovar / Xizmat' : 'Товар / Услуга'}</th>
                  <th>${t('th_quantity')}</th>
                  <th style="text-align: right;">${CURRENT_LANG === 'uz' ? 'Hujjat summasi' : 'Сумма документа'}</th>
                  <th style="text-align: center;">${t('th_currency')}</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Sana kursi (CBU)' : 'Курс ЦБ на дату'}</th>
                  <th style="text-align: right;">${CURRENT_LANG === 'uz' ? 'Balans ta\'siri' : 'Влияние на баланс'}</th>
                  <th style="text-align: center;">${t('th_currency')}</th>
                  <th>${t('th_description')}</th>
                </tr>
              </thead>
              <tbody>
                ${(data.ledger || []).map(entry => {
                  const docAmt = entry.doc_amount || 0;
                  const rateDate = entry.rate_on_date || 0;
                  const viewAmt = entry.amount_view_currency || 0;
                  return `
                    <tr>
                      <td>${formatDate(entry.date)}</td>
                      <td><strong>${tr(entry.type)}</strong></td>
                      <td>${entry.item_name || '-'}</td>
                      <td>${(entry.quantity || 0).toLocaleString()} ${tr(entry.unit) || ''}</td>
                      <td style="text-align: right;"><strong>${docAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                      <td style="text-align: center;"><span class="badge" style="font-weight: 700; background: #eff6ff; color: #2563eb;">${entry.doc_currency}</span></td>
                      <td>1$ = ${rateDate.toLocaleString()} UZS</td>
                      <td style="text-align: right;">
                        <strong style="color: ${viewAmt >= 0 ? '#10b981' : '#ef4444'};">
                          ${viewAmt >= 0 ? '+' : ''}${viewAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </strong>
                      </td>
                      <td style="text-align: center;"><span class="badge" style="font-weight: 700; background: #eff6ff; color: #2563eb;">${this.viewCurrency}</span></td>
                      <td><small>${tr(entry.description) || '-'}</small></td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        `,
        null, // No submit button, only close
        "modal-xl"
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
