const FinanceModule = {
  currentPeriod: new Date().toISOString().slice(0, 7), // "YYYY-MM"

  async render(container) {
    const isUz = CURRENT_LANG === 'uz';

    if (CURRENT_ROLE === "Ish boshqaruvchi") {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 50px;">
          <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
          <h2>${isUz ? "Kirish huquqi cheklangan" : "Доступ ограничен"}</h2>
          <p style="color: #64748b; max-width: 450px; margin: 8px auto;">
            ${isUz 
              ? `Sizning rolingiz (<strong>${CURRENT_ROLE}</strong>) Moliya va PnL modulini ko'rish huquqiga ega emas.` 
              : `Ваша роль (<strong>${CURRENT_ROLE}</strong>) не имеет прав на просмотр модуля Финансов и PnL.`}
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 ${t('mod_finance_title')}</div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <label style="font-size: 13px; font-weight: 600;">${isUz ? "Hisobot davri:" : "Отчетный период:"}</label>
            <input type="month" id="finance-month-picker" class="form-control" style="width: 170px;" value="${this.currentPeriod}" onchange="FinanceModule.changePeriod(this.value)" />
            <button class="btn btn-secondary btn-sm" onclick="exportTableToExcel('moliya-lines-table', 'pnl_tannarx_taqsimoti')" style="display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span>${t('btn_export_excel')}</span>
            </button>
            <div id="month-action-buttons">
              <!-- Rendered dynamically (Close / Reopen) -->
            </div>
          </div>
        </div>

        <!-- PnL Summary Cards -->
        <div class="grid-4" id="pnl-kpi-grid" style="margin-bottom: 24px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- 5 Lines Manufacturing Cost Allocation Table -->
        <div class="card-header" style="margin-top: 10px;">
          <div class="card-title">🏭 ${isUz ? "5 ta Liniya bo'yicha ishlab chiqarish tannarxi va bilvosita xarajatlar taqsimoti" : "Себестоимость производства и распределение косвенных расходов по 5 линиям"}</div>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: -12px; margin-bottom: 16px;">
          ${isUz 
            ? "⚡ Qoida: Bilvosita xarajatlar (svet, gaz, sex maoshi, ijara) 5 ta liniyaga ularning oylik ishlab chiqarish hajmiga proporsional ravishda taqsimlanadi." 
            : "⚡ Правило: Косвенные расходы (свет, газ, зарплата цеха, аренда) распределяются по 5 линиям пропорционально их месячному объему выпуска."}
        </p>

        <div class="table-container" id="lines-allocation-table-container" style="margin-bottom: 28px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Cash Flow Statement -->
        <div class="card-header">
          <div class="card-title">💵 ${isUz ? "Pul mablag'lari harakati to'g'risida hisobot (Cash Flow)" : "Отчет о движении денежных средств (Cash Flow)"}</div>
        </div>
        <div class="table-container" id="cf-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadFinanceData();
  },

  async changePeriod(period) {
    this.currentPeriod = period;
    await this.loadFinanceData();
  },

  async loadFinanceData() {
    const isUz = CURRENT_LANG === 'uz';
    const kpiGrid = document.getElementById("pnl-kpi-grid");
    const linesTable = document.getElementById("lines-allocation-table-container");
    const cfTable = document.getElementById("cf-table-container");
    const actionBtns = document.getElementById("month-action-buttons");

    try {
      const [pnl, cf] = await Promise.all([
        API.getPnL(this.currentPeriod),
        API.getCashFlow(this.currentPeriod)
      ]);

      // Render Month Close / Reopen button
      if (actionBtns) {
        if (pnl.is_closed) {
          actionBtns.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="FinanceModule.reopenMonth()" ${CURRENT_ROLE !== 'Admin' ? 'disabled title="' + (isUz ? 'Faqat Admin uchun' : 'Только для Admin') + '"' : ''}>
              🔓 ${t('btn_reopen_month')} (Admin)
            </button>
          `;
        } else {
          actionBtns.innerHTML = `
            <button class="btn btn-danger btn-sm" onclick="FinanceModule.closeMonth()" ${CURRENT_ROLE !== 'Admin' ? 'disabled title="' + (isUz ? 'Faqat Admin uchun' : 'Только для Admin') + '"' : ''}>
              🔒 ${t('btn_close_month')} (Admin)
            </button>
          `;
        }
      }

      // Render KPIs
      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">📈 ${isUz ? "Tushum (Revenue)" : "Выручка (Revenue)"}</span>
            <span class="kpi-value" style="color: #10b981;">$${pnl.revenue_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Sotuvlar jami summasi" : "Общая сумма продаж"}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">📉 ${isUz ? "Tannarx (COGS)" : "Себестоимость (COGS)"}</span>
            <span class="kpi-value" style="color: #ef4444;">$${pnl.total_cogs_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Xomashyo" : "Сырье"} ($${formatNumber(pnl.cogs_direct_materials_usd, 0, 2)}) + ${isUz ? "Zapchast va ta'mirlash" : "Запчасти и ремонт"} ($${formatNumber(pnl.cogs_line_expenses_usd || 0, 0, 2)}) + ${isUz ? "Bilvosita" : "Косвенные"} ($${formatNumber(pnl.cogs_indirect_expenses_usd, 0, 2)})</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
            <span class="kpi-title">🏢 ${isUz ? "Ma'muriy xarajatlar" : "Административные расходы"}</span>
            <span class="kpi-value" style="color: #f59e0b;">$${pnl.admin_expenses_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Ofis va boshqa xarajatlar" : "Офис и прочие расходы"}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #2563eb;">
            <span class="kpi-title">💎 ${isUz ? "Sof Foyda (Net Profit)" : "Чистая прибыль (Net Profit)"}</span>
            <span class="kpi-value" style="color: ${pnl.net_profit_usd >= 0 ? '#10b981' : '#ef4444'}; font-size: 26px;">$${pnl.net_profit_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Rentabellik:" : "Рентабельность:"} ${pnl.revenue_usd > 0 ? ((pnl.net_profit_usd / pnl.revenue_usd) * 100).toFixed(1) : 0}%</span>
          </div>
        `;
      }

      // Render 5 Lines Allocation Table
      if (linesTable) {
        linesTable.innerHTML = `
          <table class="data-table" id="moliya-lines-table">
            <thead>
              <tr>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${isUz ? "Liniya №" : "Линия №"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${isUz ? "Liniya Nomi" : "Наименование линии"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${isUz ? "Kafel O'lchami" : "Размер плитки"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, true)" style="text-align: right;">${isUz ? "Hajmi (dona)" : "Объем (шт)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${isUz ? "Ulush (%)" : "Доля (%)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${isUz ? "To'g'ridan-to'g'ri xomashyo ($)" : "Прямое сырье ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right; color: #b45309;">${isUz ? "Sarf materiallari va ta'mirlash ($)" : "Запчасти и ремонт ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="text-align: right;">${isUz ? "Bilvosita ($)" : "Косвенные ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, true)" style="text-align: right;">${isUz ? "Jami ($)" : "Итого ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 9, true)" style="text-align: right;">${isUz ? "1 dona Tannarx ($/dona)" : "Себестоимость 1 шт ($/шт)"} <span class="sort-icon">↕</span></th>
              </tr>
            </thead>
            <tbody>
              ${pnl.line_breakdown.map(l => `
                <tr>
                  <td data-sort-value="${l.line_number}">${isUz ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`}</td>
                  <td data-sort-value="${l.line_name}">${tr(l.line_name)}</td>
                  <td data-sort-value="${l.spec_tile_size}"><span class="badge badge-info">${l.spec_tile_size}</span></td>
                  <td data-sort-value="${l.production_volume_m2}" style="text-align: right;">${formatNumber(l.production_volume_m2, 0, 2)} ${isUz ? 'dona' : 'шт'}</td>
                  <td data-sort-value="${l.volume_percentage}" style="text-align: right;">${l.volume_percentage}%</td>
                  <td data-sort-value="${l.direct_materials_cost_usd}" style="text-align: right;">$${formatNumber(l.direct_materials_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${l.line_equipment_expenses_usd || 0}" style="text-align: right; color: #d97706; font-weight: 600;">$${formatNumber(l.line_equipment_expenses_usd || 0, 2, 2)}</td>
                  <td data-sort-value="${l.allocated_indirect_cost_usd}" style="text-align: right;">$${formatNumber(l.allocated_indirect_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${l.total_manufacturing_cost_usd}" style="text-align: right; font-weight: 700;">$${formatNumber(l.total_manufacturing_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${l.unit_cost_usd_per_m2}" style="text-align: right;"><span style="color: #2563eb; font-size: 13px; font-weight: 600;">$${l.unit_cost_usd_per_m2.toFixed(4)} / ${isUz ? 'dona' : 'шт'}</span></td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
                <td colspan="3" style="text-align: right; padding: 12px 14px;">${isUz ? "JAMI ZAVOD BO'YICHA:" : "ИТОГО ПО ЗАВОДУ:"}</td>
                <td style="text-align: right; padding: 12px 14px;">${formatNumber(pnl.total_factory_volume_m2, 0, 2)} ${isUz ? 'dona' : 'шт'}</td>
                <td style="text-align: right; padding: 12px 14px;">100%</td>
                <td style="text-align: right; padding: 12px 14px;">$${formatNumber(pnl.cogs_direct_materials_usd, 2, 2)}</td>
                <td style="color: #d97706; text-align: right; padding: 12px 14px; font-weight: 700;">$${formatNumber(pnl.cogs_line_expenses_usd || 0, 2, 2)}</td>
                <td style="text-align: right; padding: 12px 14px;">$${formatNumber(pnl.cogs_indirect_expenses_usd, 2, 2)}</td>
                <td style="color: #ef4444; text-align: right; padding: 12px 14px;">$${formatNumber(pnl.total_cogs_usd, 2, 2)}</td>
                <td style="text-align: right; padding: 12px 14px;">$${pnl.total_factory_volume_m2 > 0 ? (pnl.total_cogs_usd / pnl.total_factory_volume_m2).toFixed(4) : 0} / ${isUz ? 'dona' : 'шт'}</td>
              </tr>
            </tfoot>
          </table>
        `;
      }

      // Render Cash Flow Table
      if (cfTable) {
        cfTable.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>${isUz ? "Kategoriya" : "Категория"}</th>
                <th>${isUz ? "Kirim ($)" : "Приход ($)"}</th>
                <th>${isUz ? "Chiqim ($)" : "Расход ($)"}</th>
                <th>${isUz ? "Sof Pul Oqimi ($)" : "Чистый Денежный Поток ($)"}</th>
              </tr>
            </thead>
            <tbody>
              ${cf.breakdown_by_category.map(item => `
                <tr>
                  <td>${tr(item.category)}</td>
                  <td style="color: #10b981;">+$${item.inflow_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td style="color: #ef4444;">-$${item.outflow_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td>
                    <span style="color: ${item.net_usd >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
                      ${item.net_usd >= 0 ? '+' : ''}$${item.net_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: 700; font-size: 13px;">
                <td>${isUz ? "JAMI PUL OQIMI:" : "ИТОГО ДЕНЕЖНЫЙ ПОТОК:"}</td>
                <td style="color: #10b981;">+$${cf.total_inflows_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="color: #ef4444;">-$${cf.total_outflows_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="color: ${cf.net_cash_flow_usd >= 0 ? '#10b981' : '#ef4444'}; font-size: 14px;">
                  ${cf.net_cash_flow_usd >= 0 ? '+' : ''}$${cf.net_cash_flow_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
              </tr>
            </tfoot>
          </table>
        `;
      }

      updateMonthStatusBadge(pnl.is_closed);

    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async closeMonth() {
    const isUz = CURRENT_LANG === 'uz';
    if (CURRENT_ROLE !== "Admin") {
      showToast(isUz ? "Oyni yopish faqat Admin roli uchun ruxsat etilgan!" : "Закрытие месяца разрешено только роли Admin!", "error");
      return;
    }

    const confirmMsg = isUz
      ? `${this.currentPeriod} oyini YOPISH (Month-End Closing) ni tasdiqlaysizmi?\n\nDIQQAT: Oy yopilgandan so'ng barcha ishlab chiqarish, kassa, xarid va sotuv operatsiyalari to'liq bloklanadi!`
      : `Подтверждаете ЗАКРЫТИЕ МЕСЯЦА ${this.currentPeriod}?\n\nВНИМАНИЕ: После закрытия месяца все операции производства, кассы, закупок и продаж будут заблокированы!`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await API.closeMonth({ year_month: this.currentPeriod, notes: isUz ? "Oylik yakuniy yopish" : "Итоговое закрытие месяца" });
      showToast(res.message, "success");
      await this.loadFinanceData();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async reopenMonth() {
    const isUz = CURRENT_LANG === 'uz';
    if (CURRENT_ROLE !== "Admin") {
      showToast(isUz ? "Oyni qayta ochish faqat Admin roli uchun ruxsat etilgan!" : "Повторное открытие месяца разрешено только роли Admin!", "error");
      return;
    }

    const confirmMsg = isUz
      ? `${this.currentPeriod} oyini QAYTA OCHISH (Re-open) ni tasdiqlaysizmi?`
      : `Подтверждаете ПОВТОРНОЕ ОТКРЫТИЕ МЕСЯЦА ${this.currentPeriod}?`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await API.reopenMonth({ year_month: this.currentPeriod });
      showToast(res.message, "success");
      await this.loadFinanceData();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
