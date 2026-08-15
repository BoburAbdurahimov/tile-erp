const FinanceModule = {
  currentPeriod: new Date().toISOString().slice(0, 7), // "YYYY-MM"

  async render(container) {
    if (CURRENT_ROLE === "Ish boshqaruvchi") {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 50px;">
          <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
          <h2>Kirish huquqi cheklangan</h2>
          <p style="color: #64748b; max-width: 450px; margin: 8px auto;">
            Sizning rolingiz (<strong>${CURRENT_ROLE}</strong>) Moliya va PnL modulini ko'rish huquqiga ega emas.
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
            <label style="font-size: 13px; font-weight: 600;">Hisobot davri:</label>
            <input type="month" id="finance-month-picker" class="form-control" style="width: 170px;" value="${this.currentPeriod}" onchange="FinanceModule.changePeriod(this.value)" />
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
          <div class="card-title">🏭 5 ta Liniya bo'yicha ishlab chiqarish tannarxi va bilvosita xarajatlar taqsimoti</div>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: -12px; margin-bottom: 16px;">
          ⚡ Qoida: Bilvosita xarajatlar (svet, gaz, sex maoshi, ijara) 5 ta liniyaga ularning oylik ishlab chiqarish hajmiga proporsional ravishda taqsimlanadi.
        </p>

        <div class="table-container" id="lines-allocation-table-container" style="margin-bottom: 28px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Cash Flow Statement -->
        <div class="card-header">
          <div class="card-title">💵 Pul mablag'lari harakati to'g'risida hisobot (Cash Flow)</div>
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
            <button class="btn btn-secondary btn-sm" onclick="FinanceModule.reopenMonth()" ${CURRENT_ROLE !== 'Admin' ? 'disabled title="Faqat Admin uchun"' : ''}>
              🔓 ${t('btn_reopen_month')} (Admin)
            </button>
          `;
        } else {
          actionBtns.innerHTML = `
            <button class="btn btn-danger btn-sm" onclick="FinanceModule.closeMonth()" ${CURRENT_ROLE !== 'Admin' ? 'disabled title="Faqat Admin uchun"' : ''}>
              🔒 ${t('btn_close_month')} (Admin)
            </button>
          `;
        }
      }

      // Render KPIs
      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">📈 Tushum (Revenue)</span>
            <span class="kpi-value" style="color: #10b981;">$${pnl.revenue_usd.toLocaleString()}</span>
            <span class="kpi-sub">Sotuvlar jami summasi</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">📉 Tannarx (COGS)</span>
            <span class="kpi-value" style="color: #ef4444;">$${pnl.total_cogs_usd.toLocaleString()}</span>
            <span class="kpi-sub">Xomashyo ($${pnl.cogs_direct_materials_usd.toLocaleString()}) + Bilvosita ($${pnl.cogs_indirect_expenses_usd.toLocaleString()})</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
            <span class="kpi-title">🏢 Ma'muriy xarajatlar</span>
            <span class="kpi-value" style="color: #f59e0b;">$${pnl.admin_expenses_usd.toLocaleString()}</span>
            <span class="kpi-sub">Ofis va boshqa xarajatlar</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #2563eb;">
            <span class="kpi-title">💎 Sof Foyda (Net Profit)</span>
            <span class="kpi-value" style="color: ${pnl.net_profit_usd >= 0 ? '#10b981' : '#ef4444'}; font-size: 26px;">$${pnl.net_profit_usd.toLocaleString()}</span>
            <span class="kpi-sub">Rentabellik: ${pnl.revenue_usd > 0 ? ((pnl.net_profit_usd / pnl.revenue_usd) * 100).toFixed(1) : 0}%</span>
          </div>
        `;
      }

      // Render 5 Lines Allocation Table
      if (linesTable) {
        linesTable.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Liniya №</th>
                <th>Liniya Nomi</th>
                <th>Kafel O'lchami</th>
                <th>Ishlab chiqarish hajmi (m²)</th>
                <th>Hajm ulushi (%)</th>
                <th>To'g'ridan-to'g'ri Xomashyo ($)</th>
                <th>Taqsimlangan Bilvosita ($)</th>
                <th>Jami Tannarx ($)</th>
                <th>1 m² Birlik Tannarxi ($/m²)</th>
              </tr>
            </thead>
            <tbody>
              ${pnl.line_breakdown.map(l => `
                <tr>
                  <td><strong>Liniya ${l.line_number}</strong></td>
                  <td>${l.line_name}</td>
                  <td><span class="badge badge-info">${l.spec_tile_size}</span></td>
                  <td><strong>${l.production_volume_m2.toLocaleString()} m²</strong></td>
                  <td>${l.volume_percentage}%</td>
                  <td>$${l.direct_materials_cost_usd.toLocaleString()}</td>
                  <td>$${l.allocated_indirect_cost_usd.toLocaleString()}</td>
                  <td><strong>$${l.total_manufacturing_cost_usd.toLocaleString()}</strong></td>
                  <td><strong style="color: #2563eb; font-size: 14px;">$${l.unit_cost_usd_per_m2.toFixed(4)} / m²</strong></td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: 700;">
                <td colspan="3" style="text-align: right;">JAMI ZAVOD BO'YICHA:</td>
                <td>${pnl.total_factory_volume_m2.toLocaleString()} m²</td>
                <td>100%</td>
                <td>$${pnl.cogs_direct_materials_usd.toLocaleString()}</td>
                <td>$${pnl.cogs_indirect_expenses_usd.toLocaleString()}</td>
                <td style="color: #ef4444;">$${pnl.total_cogs_usd.toLocaleString()}</td>
                <td>$${pnl.total_factory_volume_m2 > 0 ? (pnl.total_cogs_usd / pnl.total_factory_volume_m2).toFixed(4) : 0} / m²</td>
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
                <th>Kategoriya</th>
                <th>Kirim (Inflows $)</th>
                <th>Chiqim (Outflows $)</th>
                <th>Sof Oqim (Net Cash Flow $)</th>
              </tr>
            </thead>
            <tbody>
              ${cf.breakdown_by_category.map(item => `
                <tr>
                  <td><strong>${item.category}</strong></td>
                  <td style="color: #10b981;">+$${item.inflow_usd.toLocaleString()}</td>
                  <td style="color: #ef4444;">-$${item.outflow_usd.toLocaleString()}</td>
                  <td>
                    <strong style="color: ${item.net_usd >= 0 ? '#10b981' : '#ef4444'};">
                      ${item.net_usd >= 0 ? '+' : ''}$${item.net_usd.toLocaleString()}
                    </strong>
                  </td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: 700; font-size: 14px;">
                <td>JAMI PUL OQIMI:</td>
                <td style="color: #10b981;">+$${cf.total_inflows_usd.toLocaleString()}</td>
                <td style="color: #ef4444;">-$${cf.total_outflows_usd.toLocaleString()}</td>
                <td style="color: ${cf.net_cash_flow_usd >= 0 ? '#10b981' : '#ef4444'}; font-size: 16px;">
                  ${cf.net_cash_flow_usd >= 0 ? '+' : ''}$${cf.net_cash_flow_usd.toLocaleString()}
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
    if (CURRENT_ROLE !== "Admin") {
      showToast("Oyni yopish faqat Admin roli uchun ruxsat etilgan!", "error");
      return;
    }

    if (!confirm(`${this.currentPeriod} oyini YOPISH (Month-End Closing) ni tasdiqlaysizmi?\n\nDIQQAT: Oy yopilgandan so'ng barcha ishlab chiqarish, kassa, xarid va sotuv operatsiyalari to'liq bloklanadi!`)) {
      return;
    }

    try {
      const res = await API.closeMonth({ year_month: this.currentPeriod, notes: "Oylik yakuniy yopish" });
      showToast(res.message, "success");
      await this.loadFinanceData();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async reopenMonth() {
    if (CURRENT_ROLE !== "Admin") {
      showToast("Oyni qayta ochish faqat Admin roli uchun ruxsat etilgan!", "error");
      return;
    }

    if (!confirm(`${this.currentPeriod} oyini QAYTA OCHISH (Re-open) ni tasdiqlaysizmi?`)) {
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
