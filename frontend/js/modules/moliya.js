const FinanceModule = {
  currentPeriod: new Date().toISOString().slice(0, 7), // "YYYY-MM"

  async render(container) {
    const isUz = CURRENT_LANG === 'uz';

    if (CURRENT_ROLE === "Ish boshqaruvchi") {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 50px;">

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
          <div class="card-title">${t('mod_finance_title')}</div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <label style="font-size: 13px; font-weight: 600;">${isUz ? "Hisobot davri:" : "Отчетный период:"}</label>
            <input type="month" id="finance-month-picker" class="form-control" style="width: 170px;" value="${this.currentPeriod}" onchange="FinanceModule.changePeriod(this.value)" />
            <button class="btn btn-secondary btn-sm btn-icon" onclick="exportTableToPdf('moliya-lines-table', 'pnl_tannarx_taqsimoti')" title="${t('btn_export_pdf')}" aria-label="${t('btn_export_pdf')}">${uiIcon("pdf")}</button>
          </div>
        </div>

        <!-- PnL Summary Cards -->
        <div class="grid-4" id="pnl-kpi-grid" style="margin-bottom: 24px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Manufacturing cost by Ombor -->
        <div class="card-header" style="margin-top: 10px;">
          <div class="card-title">${isUz ? "Omborlar bo'yicha ishlab chiqarish tannarxi va bilvosita xarajatlar taqsimoti" : "Себестоимость производства и распределение косвенных расходов по складам"}</div>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: -12px; margin-bottom: 16px;">
          ${isUz
            ? "Qoida: Xomashyo tannarxi mahsulot chiqqan yo'nalishga yoziladi. Ish haqi xodim ishlaydigan omborga (uning 2 yo'nalishiga hajm bo'yicha), Ma'muriyat oyligi esa ma'muriy xarajatga yoziladi. Zapchastlar va bilvosita xarajatlar (svet, gaz, ijara) oylik ishlab chiqarish hajmiga proporsional taqsimlanadi."
            : "Правило: Сырьё относится на направление, куда вышла продукция. Зарплата относится на склад, где работает сотрудник (по объему его 2 направлений), зарплата администрации — на административные расходы. Запчасти и косвенные расходы (свет, газ, аренда) распределяются пропорционально месячному объему выпуска."}
        </p>

        <div class="table-container" id="lines-allocation-table-container" style="margin-bottom: 28px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Cash Flow Statement -->
        <div class="card-header">
          <div class="card-title">${isUz ? "Pul mablag'lari harakati to'g'risida hisobot (Cash Flow)" : "Отчет о движении денежных средств (Cash Flow)"}</div>
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

    try {
      const [pnl, cf] = await Promise.all([
        API.getPnL(this.currentPeriod),
        API.getCashFlow(this.currentPeriod),
      ]);
      // Render KPIs
      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">${isUz ? "Tushum (Revenue)" : "Выручка (Revenue)"}</span>
            <span class="kpi-value" style="color: #10b981;">$${pnl.revenue_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Ombor sotuvlari va buyurtmalar" : "Продажи со склада и заказы"} ($${formatNumber(pnl.revenue_ombor_usd || 0, 0, 2)})${pnl.revenue_sales_usd ? ` + ${isUz ? "Sotish hujjatlari" : "Документы продаж"} ($${formatNumber(pnl.revenue_sales_usd, 0, 2)})` : ''}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">${isUz ? "Tannarx (COGS)" : "Себестоимость (COGS)"}</span>
            <span class="kpi-value" style="color: #ef4444;">$${pnl.total_cogs_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Xomashyo" : "Сырье"} ($${formatNumber(pnl.cogs_direct_materials_usd, 0, 2)}) + ${isUz ? "Zapchast va ta'mirlash" : "Запчасти и ремонт"} ($${formatNumber(pnl.cogs_line_expenses_usd || 0, 0, 2)}) + ${isUz ? "Ish haqi" : "Зарплата"} ($${formatNumber(pnl.cogs_salary_usd || 0, 0, 2)}) + ${isUz ? "Bilvosita" : "Косвенные"} ($${formatNumber(pnl.cogs_indirect_expenses_usd, 0, 2)})</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
            <span class="kpi-title">${isUz ? "Ma'muriy xarajatlar" : "Административные расходы"}</span>
            <span class="kpi-value" style="color: #f59e0b;">$${pnl.admin_expenses_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Ofis va boshqa xarajatlar" : "Офис и прочие расходы"}${pnl.admin_salary_usd ? ` (${isUz ? "shundan Ma'muriyat oyligi" : "в т.ч. зарплата администрации"} $${formatNumber(pnl.admin_salary_usd, 0, 2)})` : ''}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #2563eb;">
            <span class="kpi-title">${isUz ? "Sof Foyda (Net Profit)" : "Чистая прибыль (Net Profit)"}</span>
            <span class="kpi-value" style="color: ${pnl.net_profit_usd >= 0 ? '#10b981' : '#ef4444'}; font-size: 26px;">$${pnl.net_profit_usd.toLocaleString()}</span>
            <span class="kpi-sub">${isUz ? "Rentabellik:" : "Рентабельность:"} ${pnl.revenue_usd > 0 ? ((pnl.net_profit_usd / pnl.revenue_usd) * 100).toFixed(1) : 0}%</span>
          </div>
        `;
      }

      // Render the cost-by-Ombor table
      if (linesTable) {
        linesTable.innerHTML = `
          <table class="data-table" id="moliya-lines-table">
            <thead>
              <tr>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${isUz ? "Yo'nalish" : "Направление"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${isUz ? "Ombor" : "Склад"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, true)">${isUz ? "Eni" : "Ширина"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, true)" style="text-align: right;">${isUz ? "Hajmi (dona)" : "Объем (шт)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${isUz ? "Ulush (%)" : "Доля (%)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${isUz ? "To'g'ridan-to'g'ri xomashyo ($)" : "Прямое сырье ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right; color: #b45309;">${isUz ? "Sarf materiallari va ta'mirlash ($)" : "Запчасти и ремонт ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="text-align: right; color: #7c3aed;">${isUz ? "Ish haqi ($)" : "Зарплата ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, true)" style="text-align: right;">${isUz ? "Bilvosita ($)" : "Косвенные ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 9, true)" style="text-align: right;">${isUz ? "Jami ($)" : "Итого ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 10, true)" style="text-align: right;">${isUz ? "1 dona Tannarx ($/dona)" : "Себестоимость 1 шт ($/шт)"} <span class="sort-icon">↕</span></th>
              </tr>
            </thead>
            <tbody>
              ${(pnl.ombor_breakdown || []).map(o => `
                <tr style="${o.production_volume > 0 ? '' : 'color: #94a3b8;'}">
                  <td data-sort-value="${o.sklad_id}"><strong>${o.sklad_id ? escapeHtml(o.label) : (isUz ? "Boshqa (omborsiz)" : "Прочее (без склада)")}</strong></td>
                  <td data-sort-value="${escapeHtml(o.owner)}">${escapeHtml(o.owner)}</td>
                  <td data-sort-value="${o.eni}">${o.eni ? `<span class="badge badge-info">${o.eni}</span>` : '-'}</td>
                  <td data-sort-value="${o.production_volume}" style="text-align: right;">${formatNumber(o.production_volume, 0, 2)} ${isUz ? 'dona' : 'шт'}</td>
                  <td data-sort-value="${o.volume_percentage}" style="text-align: right;">${o.volume_percentage}%</td>
                  <td data-sort-value="${o.direct_materials_cost_usd}" style="text-align: right;">$${formatNumber(o.direct_materials_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${o.equipment_expenses_usd || 0}" style="text-align: right; color: #d97706; font-weight: 600;">$${formatNumber(o.equipment_expenses_usd || 0, 2, 2)}</td>
                  <td data-sort-value="${o.salary_cost_usd || 0}" style="text-align: right; color: #7c3aed; font-weight: 600;">$${formatNumber(o.salary_cost_usd || 0, 2, 2)}</td>
                  <td data-sort-value="${o.allocated_indirect_cost_usd}" style="text-align: right;">$${formatNumber(o.allocated_indirect_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${o.total_manufacturing_cost_usd}" style="text-align: right; font-weight: 700;">$${formatNumber(o.total_manufacturing_cost_usd, 2, 2)}</td>
                  <td data-sort-value="${o.unit_cost_usd}" style="text-align: right;"><span style="color: #2563eb; font-size: 13px; font-weight: 600;">$${o.unit_cost_usd.toFixed(4)} / ${isUz ? 'dona' : 'шт'}</span></td>
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
                <td style="color: #7c3aed; text-align: right; padding: 12px 14px; font-weight: 700;">$${formatNumber(pnl.cogs_salary_usd || 0, 2, 2)}</td>
                <td style="text-align: right; padding: 12px 14px;">$${formatNumber(pnl.cogs_indirect_expenses_usd, 2, 2)}</td>
                <td style="color: #ef4444; text-align: right; padding: 12px 14px;">$${formatNumber(pnl.total_cogs_usd, 2, 2)}</td>
                <td style="text-align: right; padding: 12px 14px;">$${pnl.total_factory_volume_m2 > 0 ? (pnl.total_cogs_usd / pnl.total_factory_volume_m2).toFixed(4) : 0} / ${isUz ? 'dona' : 'шт'}</td>
              </tr>
            </tfoot>
          </table>
        `;
      }

      // Render Cash Flow: real so'm and dollars per category, everything in $ at
      // each day's rate, then what clients paid in.
      if (cfTable) {
        const som = v => v ? `${formatNumber(v, 0, 0)}` : '<span style="color:#cbd5e1;">-</span>';
        const usd = v => v ? `$${formatNumber(v, 2, 2)}` : '<span style="color:#cbd5e1;">-</span>';
        const net = v => `<span style="color:${v >= 0 ? '#10b981' : '#ef4444'};font-weight:700;">${v >= 0 ? '+' : ''}$${formatNumber(v, 2, 2)}</span>`;
        const receipts = cf.client_receipts || [];
        const recUzs = receipts.filter(r => r.currency === "UZS").reduce((s, r) => s + r.amount, 0);
        const recUsd = receipts.filter(r => r.currency !== "UZS").reduce((s, r) => s + r.amount, 0);
        cfTable.innerHTML = `
          <table class="data-table" id="moliya-cashflow-table">
            <thead>
              <tr>
                <th rowspan="2">${isUz ? "Kategoriya" : "Категория"}</th>
                <th colspan="2" style="text-align:center;color:#15803d;">${isUz ? "Kirim" : "Приход"}</th>
                <th colspan="2" style="text-align:center;color:#b91c1c;">${isUz ? "Chiqim" : "Расход"}</th>
                <th rowspan="2" style="text-align:right;">${isUz ? "Sof oqim ($, kurs bo'yicha)" : "Чистый поток ($, по курсу)"}</th>
              </tr>
              <tr>
                <th style="text-align:right;">so'm</th><th style="text-align:right;">$</th>
                <th style="text-align:right;">so'm</th><th style="text-align:right;">$</th>
              </tr>
            </thead>
            <tbody>
              ${cf.breakdown_by_category.map(item => `
                <tr>
                  <td><strong>${tr(item.category)}</strong></td>
                  <td style="text-align:right;color:#10b981;">${som(item.inflow_uzs)}</td>
                  <td style="text-align:right;color:#10b981;">${usd(item.inflow_usd_cash)}</td>
                  <td style="text-align:right;color:#ef4444;">${som(item.outflow_uzs)}</td>
                  <td style="text-align:right;color:#ef4444;">${usd(item.outflow_usd_cash)}</td>
                  <td style="text-align:right;">${net(item.net_usd)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: 700; font-size: 13px;">
                <td>${isUz ? "JAMI PUL OQIMI:" : "ИТОГО ДЕНЕЖНЫЙ ПОТОК:"}</td>
                <td style="text-align:right;color:#10b981;">${som(cf.total_inflows_uzs)}</td>
                <td style="text-align:right;color:#10b981;">${usd(cf.total_inflows_usd_cash)}</td>
                <td style="text-align:right;color:#ef4444;">${som(cf.total_outflows_uzs)}</td>
                <td style="text-align:right;color:#ef4444;">${usd(cf.total_outflows_usd_cash)}</td>
                <td style="text-align:right;font-size:14px;">${net(cf.net_cash_flow_usd)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:22px 0 10px;">
            <div style="font-size:15px;font-weight:800;color:#0f172a;">${isUz ? "Mijozlardan olingan pullar" : "Деньги, полученные от клиентов"}</div>
            <div style="font-size:13px;color:#475569;">${isUz ? "Jami" : "Итого"}:
              <b style="color:#15803d;">${formatNumber(recUzs, 0, 0)} so'm</b>${recUsd ? ` + <b style="color:#15803d;">$${formatNumber(recUsd, 2, 2)}</b>` : ""}
              · ${receipts.length} ${isUz ? "ta to'lov" : "платежей"}</div>
          </div>
          <table class="data-table" id="moliya-client-receipts">
            <thead><tr>
              <th>${isUz ? "Sana" : "Дата"}</th>
              <th>${isUz ? "Kassa" : "Касса"}</th>
              <th>${isUz ? "Mijoz / izoh" : "Клиент / описание"}</th>
              <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th style="text-align:right;">${isUz ? "$ kurs bo'yicha" : "$ по курсу"}</th>
            </tr></thead>
            <tbody>
              ${receipts.length ? receipts.map(r => `
                <tr>
                  <td>${r.date}</td>
                  <td>${escapeHtml(tr(r.register_name))}</td>
                  <td>${r.client ? `<b>${escapeHtml(r.client)}</b><br>` : ""}<span style="font-size:12px;color:#64748b;">${escapeHtml(r.description || "")}</span></td>
                  <td style="text-align:right;font-weight:700;color:#15803d;white-space:nowrap;">${r.currency === "UZS" ? `${formatNumber(r.amount, 0, 0)} so'm` : `$${formatNumber(r.amount, 2, 2)}`}</td>
                  <td style="text-align:right;color:#64748b;">$${formatNumber(r.amount_usd, 2, 2)}</td>
                </tr>`).join("")
              : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:18px;">${isUz ? "Bu oyda mijozlardan pul tushmagan" : "В этом месяце оплат от клиентов не было"}</td></tr>`}
            </tbody>
          </table>
        `;
      }

    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
