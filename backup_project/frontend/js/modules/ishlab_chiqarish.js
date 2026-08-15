const ProductionModule = {
  rawMaterialsList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏭 ${t('mod_prod_title')}</div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary btn-sm" onclick="ProductionModule.openNewOrderModal()">➕ Yangi Ishlab Chiqarish</button>
          </div>
        </div>

        <!-- 5 Lines KPI Breakdown -->
        <div class="grid-5" id="production-lines-grid" style="margin-bottom: 20px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Production Orders Table with Storno -->
        <div class="card-header" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <div class="card-title">📋 Ishlab chiqarilgan tovarlar va buyurtmalar tarixi</div>
          <div style="display: flex; gap: 10px;">
            <select id="prod-line-filter" class="form-control" style="width: 180px;" onchange="ProductionModule.loadOrders()">
              <option value="">Barcha 5 ta liniya</option>
              <option value="1">Liniya 1 (30x30)</option>
              <option value="2">Liniya 2 (60x60)</option>
              <option value="3">Liniya 3 (60x120)</option>
              <option value="4">Liniya 4 (80x80)</option>
              <option value="5">Liniya 5 (45x45)</option>
            </select>
          </div>
        </div>

        <div class="table-container" id="prod-orders-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await Promise.all([this.loadLinesStats(), this.loadOrders()]);
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
        return `
          <div class="kpi-card" style="border-left: 4px solid #3b82f6;">
            <span class="kpi-title">${l.name}</span>
            <span class="kpi-value" style="font-size: 20px;">${lineVol.toLocaleString()} m²</span>
            <span class="kpi-sub">Format: ${l.spec_tile_size}</span>
          </div>
        `;
      }).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async loadOrders() {
    const tableDiv = document.getElementById("prod-orders-table-container");
    if (!tableDiv) return;

    const lineId = document.getElementById("prod-line-filter")?.value || "";

    try {
      const orders = await API.getProductionOrders(lineId);
      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_date')}</th>
              <th>Hujjat №</th>
              <th>${CURRENT_LANG === 'uz' ? 'Liniya' : 'Линия'}</th>
              <th>Tayyor mahsulot</th>
              <th>Miqdor (m²)</th>
              <th>To'g'ridan-to'g'ri tannarx ($)</th>
              <th>Birlik tannarxi ($/m²)</th>
              <th>${t('th_status')}</th>
              <th>${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr class="${o.status === 'Storno' ? 'storno-row' : ''}">
                <td>${o.date}</td>
                <td><strong>${o.order_number}</strong></td>
                <td><span class="badge badge-info">${o.line_name}</span></td>
                <td><strong>${o.output_material_name}</strong> (<code>${o.output_material_code}</code>)</td>
                <td><strong>${o.quantity.toLocaleString()} ${o.unit}</strong></td>
                <td>$${o.direct_cost_usd.toLocaleString()}</td>
                <td>$${o.unit_cost_usd.toFixed(4)}</td>
                <td>
                  <span class="badge ${o.status === 'Tasdiqlandi' ? 'badge-success' : 'badge-danger'}">
                    ${o.status}
                  </span>
                </td>
                <td>
                  ${o.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="ProductionModule.stornoOrder(${o.id}, '${o.order_number}')">
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">Stornolangan</span>'}
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
    
    // Fetch materials & lines
    const [lines, finishedMaterials, allRaw] = await Promise.all([
      API.getProductionLines(),
      API.getMaterials("Tayyor mahsulot"),
      API.getMaterials()
    ]);
    
    this.rawMaterialsList = allRaw;

    showModal(
      "Yangi Ishlab Chiqarish hujjati kiritish",
      `
        <form id="new-prod-order-form">
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Ishlab chiqarish liniyasi *</label>
              <select id="po-line" class="form-control" required>
                ${lines.map(l => `<option value="${l.id}">${l.name} (${l.spec_tile_size})</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Sana *</label>
              <input type="date" id="po-date" class="form-control" value="${todayStr}" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label class="form-label">Chiqarilayotgan Tayyor kafel plitasi *</label>
              <select id="po-output-mat" class="form-control" required>
                ${finishedMaterials.map(m => `<option value="${m.id}">${m.code} - ${m.name} (${m.unit})</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Chiqarilgan hajm (m²) *</label>
              <input type="number" step="any" id="po-quantity" class="form-control" placeholder="1000" required />
            </div>
          </div>

          <div style="margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 14px; margin-bottom: 0;">🧪 Sarflangan xomashyo va butlovchi qismlar:</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ProductionModule.addConsumedRow()">+ Xomashyo qo'shish</button>
          </div>

          <table class="basket-table" id="consumed-basket-table">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <th>Xomashyo / Material</th>
                <th>Sklad (Qayerdan)</th>
                <th>Sarflangan miqdor</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody id="consumed-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">${t('th_description')}</label>
            <textarea id="po-notes" class="form-control" rows="2" placeholder="Smena yoki partiya izohi..."></textarea>
          </div>
        </form>
      `,
      async () => {
        const lineId = parseInt(document.getElementById("po-line").value);
        const d = document.getElementById("po-date").value;
        const outMatId = parseInt(document.getElementById("po-output-mat").value);
        const qty = parseFloat(document.getElementById("po-quantity").value);
        const notes = document.getElementById("po-notes").value.trim();

        if (!lineId || !outMatId || isNaN(qty) || qty <= 0) {
          showToast("Iltimos, ishlab chiqarish hajmini to'g'ri kiriting!", "warning");
          return false;
        }

        // Collect consumed rows
        const consumed = [];
        const rows = document.querySelectorAll("#consumed-rows-body tr");
        rows.forEach(tr => {
          const matId = parseInt(tr.querySelector(".row-mat").value);
          const whId = parseInt(tr.querySelector(".row-wh").value);
          const cQty = parseFloat(tr.querySelector(".row-qty").value);
          if (matId && whId && cQty > 0) {
            consumed.push({ material_id: matId, warehouse_id: whId, quantity: cQty });
          }
        });

        try {
          await API.createProductionOrder({
            line_id: lineId,
            output_material_id: outMatId,
            quantity: qty,
            date: d,
            consumed_materials: consumed,
            notes
          });
          showToast("Ishlab chiqarish buyurtmasi muvaffaqiyatli saqlandi!", "success");
          await ProductionModule.loadLinesStats();
          await ProductionModule.loadOrders();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );

    // Add default initial rows (e.g. Cement, Sand, Glaze)
    this.addConsumedRow("Smt60", 2, 12000);
    this.addConsumedRow("Qum01", 2, 25000);
    this.addConsumedRow("Glz01", 2, 850);
  },

  addConsumedRow(defaultCode = null, defaultWh = 2, defaultQty = 0) {
    const tbody = document.getElementById("consumed-rows-body");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <select class="form-control row-mat" style="font-size: 13px;">
          ${this.rawMaterialsList.map(m => `
            <option value="${m.id}" ${defaultCode && m.code === defaultCode ? 'selected' : ''}>
              ${m.code} - ${m.name} (${m.unit})
            </option>
          `).join("")}
        </select>
      </td>
      <td>
        <select class="form-control row-wh" style="font-size: 13px;">
          <option value="2" ${defaultWh === 2 ? 'selected' : ''}>2: Ishlab chiqarish uchun materiallar</option>
          <option value="3" ${defaultWh === 3 ? 'selected' : ''}>3: Aralash ombor</option>
        </select>
      </td>
      <td>
        <input type="number" step="any" class="form-control row-qty" value="${defaultQty}" style="font-size: 13px;" required />
      </td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('tr').remove()">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
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
  }
};
