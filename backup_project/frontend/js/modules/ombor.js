const OmborModule = {
  currentWarehouseId: null,

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">📦 ${t('mod_ombor_title')}</div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="OmborModule.exportExcel()">📥 ${t('btn_export_excel')}</button>
            <button class="btn btn-warning btn-sm" onclick="OmborModule.openAdjustModal()">⚙️ ${t('btn_adjust_stock')}</button>
          </div>
        </div>

        <!-- Warehouse Tabs -->
        <div class="tabs-nav" id="warehouse-tabs">
          <button class="tab-btn active" onclick="OmborModule.filterWarehouse(null)">Barcha Skladlar</button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(1)">🏢 Tayyor mahsulotlar</button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(2)">🏭 Ishlab chiqarish uchun materiallar</button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(3)">📦 Aralash ombor</button>
        </div>

        <div style="display: flex; gap: 14px; margin-bottom: 16px;">
          <input type="text" id="stock-search" class="form-control" style="max-width: 320px;" placeholder="Qidiruv (nom yoki kod bo'yicha)..." oninput="OmborModule.loadStock()" />
          <select id="stock-category-filter" class="form-control" style="max-width: 220px;" onchange="OmborModule.loadStock()">
            <option value="">Barcha kategoriyalar</option>
            <option value="Siryo">Siryo / Xomashyo</option>
            <option value="Tayyor mahsulot">Tayyor mahsulot</option>
            <option value="Ehtiyot qism">Ehtiyot qism</option>
            <option value="Yordamchi">Yordamchi material</option>
          </select>
        </div>

        <div class="table-container" id="stock-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadStock();
  },

  async filterWarehouse(whId) {
    this.currentWarehouseId = whId;
    document.querySelectorAll("#warehouse-tabs .tab-btn").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");
    await this.loadStock();
  },

  async loadStock() {
    const tableDiv = document.getElementById("stock-table-container");
    if (!tableDiv) return;

    const search = document.getElementById("stock-search")?.value || "";
    const category = document.getElementById("stock-category-filter")?.value || "";

    try {
      const stock = await API.getStockBalances(this.currentWarehouseId, category, search);
      
      let grandTotalUsd = 0;
      let grandTotalUzs = 0;

      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_warehouse')}</th>
              <th>${t('th_code')}</th>
              <th>${t('th_name')}</th>
              <th>${t('th_category')}</th>
              <th>${t('th_quantity')}</th>
              <th>AVG Narx (USD)</th>
              <th>AVG Narx (UZS)</th>
              <th>Jami Qiymat ($)</th>
              <th>Jami Qiymat (UZS)</th>
            </tr>
          </thead>
          <tbody>
            ${stock.map(s => {
              grandTotalUsd += s.total_cost_usd;
              grandTotalUzs += s.total_cost_uzs;
              const isLowStock = s.min_stock > 0 && s.quantity <= s.min_stock;
              return `
                <tr>
                  <td><strong>${s.warehouse_name}</strong></td>
                  <td><code>${s.material_code}</code></td>
                  <td>${s.material_name}</td>
                  <td><span class="badge badge-primary">${s.material_category}</span></td>
                  <td>
                    <strong style="color: ${isLowStock ? '#ef4444' : 'inherit'};">
                      ${s.quantity.toLocaleString()} ${s.unit}
                    </strong>
                    ${isLowStock ? '<span class="badge badge-danger" style="margin-left: 4px;">Kam qoldiq!</span>' : ''}
                  </td>
                  <td>$${s.avg_cost_usd.toFixed(4)}</td>
                  <td>${s.avg_cost_uzs.toLocaleString()} UZS</td>
                  <td><strong>$${s.total_cost_usd.toLocaleString()}</strong></td>
                  <td>${s.total_cost_uzs.toLocaleString()} UZS</td>
                </tr>
              `;
            }).join("")}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: 700;">
              <td colspan="7" style="text-align: right;">JAMI OMBOR QIYMATI:</td>
              <td style="color: #10b981; font-size: 15px;">$${grandTotalUsd.toLocaleString()}</td>
              <td style="color: #2563eb;">${grandTotalUzs.toLocaleString()} UZS</td>
            </tr>
          </tfoot>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  openAdjustModal() {
    if (CURRENT_ROLE !== "Admin") {
      showToast(t('msg_admin_only'), "error");
      return;
    }

    showModal(
      "Ombor qoldig'ini qo'lda to'g'rilash (Faqat Admin)",
      `
        <form id="adjust-stock-form">
          <div class="form-group">
            <label class="form-label">Sklad (Ombor) *</label>
            <select id="adj-wh" class="form-control" required onchange="OmborModule.populateMaterialsForAdjust()">
              <option value="1">1: Tayyor mahsulotlar</option>
              <option value="2" selected>2: Ishlab chiqarish uchun materiallar</option>
              <option value="3">3: Aralash ombor</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Material / Tovar *</label>
            <select id="adj-mat" class="form-control" required>
              <option value="">Yuklanmoqda...</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Yangi haqiqiy qoldiq (Miqdor) *</label>
            <input type="number" step="any" id="adj-qty" class="form-control" required />
          </div>
          <div class="form-group">
            <label class="form-label">To'g'rilash sababi (Inventarizatsiya akti) *</label>
            <textarea id="adj-reason" class="form-control" rows="2" placeholder="Masalan: Yillik qayta sanash natijasida..." required></textarea>
          </div>
        </form>
      `,
      async () => {
        const whId = parseInt(document.getElementById("adj-wh").value);
        const matId = parseInt(document.getElementById("adj-mat").value);
        const newQty = parseFloat(document.getElementById("adj-qty").value);
        const reason = document.getElementById("adj-reason").value.trim();

        if (!matId || isNaN(newQty) || !reason) {
          showToast("Barcha maydonlarni to'ldiring!", "warning");
          return false;
        }

        try {
          await API.adjustStockManual({
            warehouse_id: whId,
            material_id: matId,
            new_quantity: newQty,
            reason
          });
          showToast("Qoldiq muvaffaqiyatli to'g'rilandi va Audit logga yozildi!", "success");
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
    const matSelect = document.getElementById("adj-mat");
    if (!matSelect) return;
    try {
      const materials = await API.getMaterials();
      matSelect.innerHTML = materials.map(m => `
        <option value="${m.id}">${m.code} - ${m.name} (${m.unit})</option>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  exportExcel() {
    let url = "/api/ombor/export/excel";
    if (this.currentWarehouseId) url += `?warehouse_id=${this.currentWarehouseId}`;
    window.open(url, "_blank");
  }
};
