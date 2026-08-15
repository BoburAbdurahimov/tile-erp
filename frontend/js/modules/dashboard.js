const DashboardModule = {
  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏭 ${CURRENT_LANG === 'uz' ? 'Zavodning umumiy holati' : 'Общее состояние завода'}</div>
          <button class="btn btn-secondary btn-sm" onclick="DashboardModule.refresh()">🔄 ${CURRENT_LANG === 'uz' ? 'Yangilash' : 'Обновить'}</button>
        </div>
        <div class="grid-4" id="kpi-grid">
          <div class="kpi-card"><div class="kpi-title">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 ${CURRENT_LANG === 'uz' ? "So'nggi 7 kunlik ishlab chiqarish (5 Liniya)" : "Производство за 7 дней (5 Линий)"}</div>
          </div>
          <div style="position: relative; height: 260px;">
            <canvas id="productionChart"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">💵 ${CURRENT_LANG === 'uz' ? 'Kassa qoldiqlari va Valyuta holati' : 'Остатки в кассе и Курс'}</div>
          </div>
          <div id="cash-overview-list" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 ${CURRENT_LANG === 'uz' ? "So'nggi ishlab chiqarish operatsiyalari" : "Последние производственные операции"}</div>
        </div>
        <div class="table-container" id="recent-production-table">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadData();
  },

  async refresh() {
    await this.loadData();
    showToast(CURRENT_LANG === 'uz' ? "Ma'lumotlar yangilandi" : "Данные обновлены", "success");
  },

  async loadData() {
    try {
      const [stats7d, registers, pnl, orders] = await Promise.all([
        API.get7DayStats(),
        API.getCashRegisters(),
        API.getPnL(),
        API.getProductionOrders()
      ]);

      // Render KPIs
      const kpiGrid = document.getElementById("kpi-grid");
      if (kpiGrid) {
        const kassaUsdObj = registers.find(r => r.currency === "USD");
        const kassaUzsObj = registers.find(r => r.currency === "UZS");
        const kassaUsd = kassaUsdObj?.balance || 0;
        const kassaUzs = kassaUzsObj?.balance || 0;
        const fxRate = kassaUsdObj?.current_rate || kassaUzsObj?.current_rate || 12850;

        const kassaUzsInUsd = kassaUzs / (fxRate || 12850);
        const kassaUsdInUzs = kassaUsd * (fxRate || 12850);
        
        kpiGrid.innerHTML = `
          <div class="kpi-card">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? "7 kunlik hajm" : "Объем за 7 дней"}</span>
            <span class="kpi-value">${stats7d.total_7d_volume_m2.toLocaleString()} m²</span>
            <span class="kpi-sub">${CURRENT_LANG === 'uz' ? "5 ta liniya bo'yicha" : "По 5 линиям"}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? "Kassa USD" : "Касса USD"}</span>
            <span class="kpi-value" style="color: #10b981;">$${kassaUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            <span class="kpi-sub">≈ ${Math.round(kassaUsdInUzs).toLocaleString()} UZS</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? "Kassa UZS" : "Касса UZS"}</span>
            <span class="kpi-value" style="color: #2563eb;">${(kassaUzs / 1e6).toFixed(1)} mln</span>
            <span class="kpi-sub">≈ $${kassaUzsInUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">${CURRENT_LANG === 'uz' ? "Joriy oy Sof Foyda" : "Чистая прибыль (мес.)"}</span>
            <span class="kpi-value" style="color: ${pnl.net_profit_usd >= 0 ? '#10b981' : '#ef4444'};">$${pnl.net_profit_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            <span class="kpi-sub">${CURRENT_LANG === 'uz' ? 'Tushum:' : 'Выручка:'} $${pnl.revenue_usd.toLocaleString()}</span>
          </div>
        `;
      }

      // Render Cash Overview
      const cashList = document.getElementById("cash-overview-list");
      if (cashList) {
        cashList.innerHTML = registers.map(r => `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 15px;">${r.name}</div>
              <div style="font-size: 12px; color: #64748b;">${r.description || ''}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 800; color: ${r.currency === 'USD' ? '#10b981' : '#2563eb'};">
                ${r.currency === 'USD' ? '$' + r.balance.toLocaleString() : r.balance.toLocaleString() + ' UZS'}
              </div>
              <div style="font-size: 12px; color: #94a3b8;">
                ≈ ${r.currency === 'USD' ? r.balance_in_other_currency.toLocaleString() + ' UZS' : '$' + r.balance_in_other_currency.toLocaleString()}
              </div>
            </div>
          </div>
        `).join("");
      }

      // Render Recent Orders Table
      const recentTable = document.getElementById("recent-production-table");
      if (recentTable) {
        recentTable.innerHTML = `
          <table class="data-table" id="dashboard-recent-table">
            <thead>
              <tr>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">№ <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Liniya' : 'Линия'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${t('th_name')} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${CURRENT_LANG === 'uz' ? "Tannarx ($)" : "Себестоимость ($)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              </tr>
              <tr class="filter-row">
                <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? '№...' : '№...'}" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Liniya...' : 'Линия...'}" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Nom...' : 'Имя...'}" /></th>
                <th></th>
                <th></th>
                <th><input type="text" class="table-col-filter" data-col-idx="6" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" /></th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(o => `
                <tr class="${o.status === 'Storno' ? 'storno-row' : ''}">
                  <td data-sort-value="${o.date}">${formatDate(o.date)}</td>
                  <td data-sort-value="${o.order_number}"><strong>${o.order_number}</strong></td>
                  <td data-sort-value="${o.line_name}"><span class="badge" style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${tr(o.line_name)}</span></td>
                  <td data-sort-value="${o.output_material_name}">${o.output_material_name}</td>
                  <td data-sort-value="${o.quantity}" style="text-align: right;"><strong>${o.quantity.toLocaleString()} ${tr(o.unit)}</strong></td>
                  <td data-sort-value="${o.direct_cost_usd}" style="text-align: right;">$${o.direct_cost_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ($${o.unit_cost_usd.toFixed(2)}/${tr(o.unit)})</td>
                  <td data-sort-value="${o.status}"><span class="badge" style="background: ${o.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${o.status === 'Tasdiqlandi' ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${tr(o.status)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      }

      // Render Simple Canvas Production Chart
      this.drawChart(stats7d);

    } catch (e) {
      console.error("Dashboard error:", e);
    }
  },

  drawChart(stats) {
    const canvas = document.getElementById("productionChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    // Set actual pixel dimensions
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 240;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const days = Object.keys(stats.daily_breakdown || {});
    if (days.length === 0) return;

    const totals = days.map(d => stats.daily_breakdown[d].total);
    const maxVal = Math.max(...totals, 100);

    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    const stepX = chartWidth / (days.length - 1 || 1);

    // Draw Grid Lines
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      const val = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px Inter";
      ctx.textAlign = "right";
      ctx.fillText(`${val}m²`, padding - 6, y + 3);
    }

    // Draw Gradient Area
    ctx.beginPath();
    const grad = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
    grad.addColorStop(0, "rgba(37, 99, 235, 0.35)");
    grad.addColorStop(1, "rgba(37, 99, 235, 0.0)");

    days.forEach((d, idx) => {
      const x = padding + idx * stepX;
      const y = padding + chartHeight - (totals[idx] / maxVal) * chartHeight;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineTo(padding + (days.length - 1) * stepX, canvas.height - padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Main Line
    ctx.beginPath();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    days.forEach((d, idx) => {
      const x = padding + idx * stepX;
      const y = padding + chartHeight - (totals[idx] / maxVal) * chartHeight;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Points & Day Labels
    days.forEach((d, idx) => {
      const x = padding + idx * stepX;
      const y = padding + chartHeight - (totals[idx] / maxVal) * chartHeight;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#64748b";
      ctx.font = "11px Inter";
      ctx.textAlign = "center";
      ctx.fillText(d.slice(5), x, canvas.height - padding + 16);
    });
  }
};
