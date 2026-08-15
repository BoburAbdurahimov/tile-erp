const BalancesModule = {
  currentTab: "clients",
  viewCurrency: "USD",

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">👥 ${t('mod_balances_title')}</div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <label style="font-size: 13px; font-weight: 600;">Hisobot Valyutasi:</label>
            <div style="display: flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
              <button class="btn ${this.viewCurrency === 'USD' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="BalancesModule.setCurrency('USD')">💵 USD ($)</button>
              <button class="btn ${this.viewCurrency === 'UZS' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="BalancesModule.setCurrency('UZS')">🇺🇿 UZS (So'm)</button>
            </div>
          </div>
        </div>

        <!-- Total Balances KPI Cards -->
        <div class="grid-2" id="balances-kpi-grid" style="margin-bottom: 20px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Tabs -->
        <div class="tabs-nav">
          <button class="tab-btn ${this.currentTab === 'clients' ? 'active' : ''}" onclick="BalancesModule.switchTab('clients')">👤 Mijozlar (Debitorlik - Bizga qarz)</button>
          <button class="tab-btn ${this.currentTab === 'suppliers' ? 'active' : ''}" onclick="BalancesModule.switchTab('suppliers')">🚚 Yetkazib beruvchilar (Kreditorlik - Bizning qarz)</button>
        </div>

        <div style="margin-bottom: 16px;">
          <input type="text" id="cp-balance-search" class="form-control" style="max-width: 320px;" placeholder="Qidiruv (nom yoki kod bo'yicha)..." oninput="BalancesModule.loadTabContent()" />
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
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");
    await this.loadTabContent();
  },

  async loadTabContent() {
    const tableDiv = document.getElementById("balances-table-container");
    const kpiGrid = document.getElementById("balances-kpi-grid");
    if (!tableDiv) return;

    const search = document.getElementById("cp-balance-search")?.value.toLowerCase() || "";

    try {
      const summary = await API.getCounterpartiesSummary(this.viewCurrency);
      const isUsd = this.viewCurrency === "USD";
      const sym = isUsd ? "$" : " UZS";

      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">👤 Jami Mijozlar Qarzdorligi (Bizga to'lanishi kerak)</span>
            <span class="kpi-value" style="color: #10b981;">${isUsd ? '$' : ''}${summary.total_clients_balance.toLocaleString()}${!isUsd ? ' UZS' : ''}</span>
            <span class="kpi-sub">Debitorlik qoldig'i</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">🏢 Jami Yetkazib beruvchilarga Qarz (Biz to'lashimiz kerak)</span>
            <span class="kpi-value" style="color: #ef4444;">${isUsd ? '$' : ''}${Math.abs(summary.total_suppliers_balance).toLocaleString()}${!isUsd ? ' UZS' : ''}</span>
            <span class="kpi-sub">Kreditorlik qoldig'i</span>
          </div>
        `;
      }

      let list = this.currentTab === "clients" ? summary.clients : summary.suppliers;
      if (search) {
        list = list.filter(c => c.name.toLowerCase().includes(search) || c.code.toLowerCase().includes(search));
      }

      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_code')}</th>
              <th>${t('th_name')}</th>
              <th>Viloyat</th>
              <th>Telefon</th>
              <th>Boshlang'ich Balans (${this.viewCurrency})</th>
              <th>Joriy Balans (${this.viewCurrency})</th>
              <th>USD ekvivalenti</th>
              <th>${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(cp => `
              <tr>
                <td><code>${cp.code}</code></td>
                <td><strong>${cp.name}</strong></td>
                <td>${cp.region}</td>
                <td>${cp.phone || '-'}</td>
                <td>${isUsd ? '$' : ''}${cp.initial_balance.toLocaleString()}${!isUsd ? ' UZS' : ''}</td>
                <td>
                  <strong style="color: ${cp.current_balance >= 0 ? '#10b981' : '#ef4444'}; font-size: 14px;">
                    ${isUsd ? '$' : ''}${cp.current_balance.toLocaleString()}${!isUsd ? ' UZS' : ''}
                  </strong>
                </td>
                <td>$${cp.balance_usd.toLocaleString()}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="BalancesModule.openLedgerModal(${cp.id})">
                    📑 Akt Sverka / Tarix
                  </button>
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

  async openLedgerModal(cpId) {
    try {
      const data = await API.getCounterpartyLedger(cpId, this.viewCurrency);
      const isUsd = this.viewCurrency === "USD";

      showModal(
        `📑 O'zaro hisob-kitob tarixi (Akt Sverka): ${data.code} - ${data.name}`,
        `
          <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px 16px; border-radius: 8px;">
            <div>
              <strong>Kontragent:</strong> ${data.name} (<code>${data.code}</code>)<br />
              <small style="color: #64748b;">Hisob-kitob valyutasi: <strong>${this.viewCurrency}</strong></small>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #64748b;">Joriy Yakuniy Balans:</div>
              <div style="font-size: 18px; font-weight: 800; color: ${data.current_balance_usd >= 0 ? '#10b981' : '#ef4444'};">
                $${data.current_balance_usd.toLocaleString()} USD
              </div>
            </div>
          </div>

          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Sana</th>
                  <th>Operatsiya turi</th>
                  <th>Tovar / Xizmat</th>
                  <th>Miqdor</th>
                  <th>Hujjat narxi</th>
                  <th>Sana kursi (CBU)</th>
                  <th>Balans ta'siri (${this.viewCurrency})</th>
                  <th>Izoh</th>
                </tr>
              </thead>
              <tbody>
                ${data.ledger.map(entry => `
                  <tr>
                    <td>${entry.date}</td>
                    <td><strong>${entry.type}</strong></td>
                    <td>${entry.item_name}</td>
                    <td>${entry.quantity} ${entry.unit}</td>
                    <td>${entry.doc_amount.toLocaleString()} ${entry.doc_currency}</td>
                    <td>1$ = ${entry.rate_on_date.toLocaleString()} UZS</td>
                    <td>
                      <strong style="color: ${entry.amount_view_currency >= 0 ? '#10b981' : '#ef4444'};">
                        ${entry.amount_view_currency >= 0 ? '+' : ''}${isUsd ? '$' : ''}${entry.amount_view_currency.toLocaleString()}${!isUsd ? ' UZS' : ''}
                      </strong>
                    </td>
                    <td><small>${entry.description || '-'}</small></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `,
        null, // No submit button, only close
        "modal-lg"
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
