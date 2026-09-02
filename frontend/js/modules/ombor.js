const OmborModule = {
  currentWarehouseId: null,

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>📦</span> <span>${t('mod_ombor_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">${t('mod_ombor_sub')}</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="OmborModule.exportExcel()">📥 ${t('btn_export_excel')}</button>
            <button class="btn btn-warning btn-sm" onclick="OmborModule.openAdjustModal()">⚙️ ${t('btn_adjust_stock')}</button>
          </div>
        </div>

        <!-- Warehouse Tabs -->
        <div class="tabs-nav" id="warehouse-tabs" style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn active" onclick="OmborModule.filterWarehouse(null, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid #2563eb; color: #2563eb;">
            ${CURRENT_LANG === 'uz' ? 'Barcha Omborlar' : 'Все Склады'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(1, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            🏢 ${CURRENT_LANG === 'uz' ? 'Tayyor mahsulotlar' : 'Готовая продукция'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(2, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            🏭 ${CURRENT_LANG === 'uz' ? 'Ishlab chiqarish materiallari' : 'Материалы для производства'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(3, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            📦 ${CURRENT_LANG === 'uz' ? 'Aralash ombor' : 'Смешанный склад'}
          </button>
        </div>

        <div class="table-container" id="stock-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${t('msg_loading')}</div>
        </div>
      </div>
    `;

    await this.loadStock();
  },

  async filterWarehouse(whId, btnEl) {
    this.currentWarehouseId = whId;
    document.querySelectorAll("#warehouse-tabs .tab-btn").forEach(btn => {
      btn.style.borderBottomColor = "transparent";
      btn.style.color = "#64748b";
    });
    if (btnEl) {
      btnEl.style.borderBottomColor = "#2563eb";
      btnEl.style.color = "#2563eb";
    }
    await this.loadStock();
  },

  async loadStock() {
    const tableDiv = document.getElementById("stock-table-container");
    if (!tableDiv) return;

    try {
      const stock = await API.getStockBalances(this.currentWarehouseId, "", "");
      
      let grandTotalUsd = 0;
      let grandTotalUzs = 0;

      tableDiv.innerHTML = `
        <table class="data-table" id="stock-main-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">
                ${t('th_warehouse')} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">
                ${t('th_code')} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">
                ${t('th_name')} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">
                ${t('th_category')} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">
                ${t('th_quantity')} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">
                AVG Narx (USD) <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right;">
                AVG Narx (UZS) <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="text-align: right;">
                ${CURRENT_LANG === 'uz' ? 'Jami Qiymat ($)' : 'Сумма ($)'} <span class="sort-icon">↕</span>
              </th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, true)" style="text-align: right;">
                ${CURRENT_LANG === 'uz' ? 'Jami Qiymat (UZS)' : 'Сумма (UZS)'} <span class="sort-icon">↕</span>
              </th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Ombor...' : 'Склад...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Kod...' : 'Код...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Nom...' : 'Имя...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Kategoriya...' : 'Категория...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${stock.map(s => {
              grandTotalUsd += s.total_cost_usd;
              grandTotalUzs += s.total_cost_uzs;
              const isLowStock = s.min_stock > 0 && s.quantity <= s.min_stock;
              return `
                <tr>
                  <td data-sort-value="${s.warehouse_name}"><strong>${tr(s.warehouse_name)}</strong></td>
                  <td data-sort-value="${s.material_code}"><code>${s.material_code}</code></td>
                  <td data-sort-value="${s.material_name}">${s.material_name}</td>
                  <td data-sort-value="${s.material_category}"><span class="badge" style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${tr(s.material_category)}</span></td>
                  <td data-sort-value="${s.quantity}" style="text-align: right;">
                    <strong style="color: ${isLowStock ? '#ef4444' : 'inherit'};">
                      ${formatNumber(s.quantity, 0, 2)} ${tr(s.unit)}
                    </strong>
                    ${isLowStock ? '<span class="badge" style="background: #fef2f2; color: #dc2626; margin-left: 4px; padding: 2px 6px;">Kam qoldiq!</span>' : ''}
                  </td>
                  <td data-sort-value="${s.avg_cost_usd}" style="text-align: right;">$${formatNumber(s.avg_cost_usd, 2, 4)}</td>
                  <td data-sort-value="${s.avg_cost_uzs}" style="text-align: right;">${formatNumber(s.avg_cost_uzs, 0, 2)} UZS</td>
                  <td data-sort-value="${s.total_cost_usd}" style="text-align: right;"><strong>$${formatNumber(s.total_cost_usd, 2, 2)}</strong></td>
                  <td data-sort-value="${s.total_cost_uzs}" style="text-align: right;">${formatNumber(Math.round(s.total_cost_uzs), 0, 2)} UZS</td>
                </tr>
              `;
            }).join("")}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: 800; border-top: 2px solid #e2e8f0;">
              <td colspan="7" style="text-align: right; padding: 14px 16px; font-size: 14px;">${CURRENT_LANG === 'uz' ? 'JAMI OMBOR QIYMATI:' : 'ИТОГО СТОИМОСТЬ СКЛАДА:'}</td>
              <td style="color: #10b981; font-size: 16px; text-align: right; padding: 14px 16px;">$${formatNumber(grandTotalUsd, 2, 2)}</td>
              <td style="color: #2563eb; font-size: 15px; text-align: right; padding: 14px 16px;">${formatNumber(Math.round(grandTotalUzs), 0, 2)} UZS</td>
            </tr>
          </tfoot>
        </table>
      `;
    } catch (e) {
      tableDiv.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">${t('msg_error')} ${e.message}</div>`;
      showToast(e.message, "error");
    }
  },

  openAdjustModal() {
    if (CURRENT_ROLE !== "Admin") {
      showToast(t('msg_admin_only'), "error");
      return;
    }

    showModal(
      CURRENT_LANG === 'uz' ? "Ombor qoldig'ini to'g'rilash (Faqat Admin)" : "Корректировка остатков (Только Admin)",
      `
        <form id="adjust-stock-form">
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_warehouse')} *</label>
            <select id="adj-wh" class="form-control" required onchange="OmborModule.populateMaterialsForAdjust()" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
              <option value="1">1: Tayyor mahsulotlar</option>
              <option value="2" selected>2: Ishlab chiqarish uchun materiallar</option>
              <option value="3">3: Aralash ombor</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Material / Tovar *</label>
            <select id="adj-mat" class="form-control" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
              <option value="">${t('msg_loading')}</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Yangi haqiqiy qoldiq (Miqdor) *</label>
            <input type="number" step="any" id="adj-qty" class="form-control" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
          </div>
          <div class="form-group">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">To'g'rilash sababi (Inventarizatsiya akti) *</label>
            <textarea id="adj-reason" class="form-control" rows="2" placeholder="Masalan: Yillik qayta sanash natijasida..." required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const whId = parseInt(document.getElementById("adj-wh").value);
        const matId = parseInt(document.getElementById("adj-mat").value);
        const qty = parseFloat(document.getElementById("adj-qty").value);
        const reason = document.getElementById("adj-reason").value.trim();

        if (!matId || isNaN(qty) || !reason) {
          showToast(CURRENT_LANG === 'uz' ? "Barcha maydonlarni to'ldiring!" : "Заполните все поля!", "warning");
          return false;
        }

        try {
          await API.adjustStock({
            warehouse_id: whId,
            material_id: matId,
            new_quantity: qty,
            reason
          });
          showToast(t('msg_saved'), "success");
          await OmborModule.loadStock();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );

    this.populateMaterialsForAdjust();
  },

  async populateMaterialsForAdjust() {
    const sel = document.getElementById("adj-mat");
    if (!sel) return;
    try {
      const materials = await API.getMaterials();
      sel.innerHTML = materials.map(m => `
        <option value="${m.id}">${m.code} - ${m.name} (${tr(m.unit)})</option>
      `).join("");
    } catch (e) {
      sel.innerHTML = `<option value="">Yuklashda xatolik</option>`;
    }
  },

  exportExcel() {
    window.open(`/api/ombor/export/excel?warehouse_id=${this.currentWarehouseId || ''}`, "_blank");
  }
};
