const OmborModule = {
  currentWarehouseId: null,
  currentView: "stock",

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
            <button class="btn btn-primary btn-sm" onclick="OmborModule.openTransferModal()" style="background: #2563eb; color: #ffffff; font-weight: 600; padding: 8px 14px; border-radius: 8px; display: flex; align-items: center; gap: 6px;">
              🔄 ${CURRENT_LANG === 'uz' ? "Ombordan Omborga O'tkazish" : "Перемещение между складами"}
            </button>
            <button class="btn btn-secondary btn-sm" onclick="OmborModule.exportExcel()">📥 ${t('btn_export_excel')}</button>
            <button class="btn btn-warning btn-sm" onclick="OmborModule.openAdjustModal()">⚙️ ${t('btn_adjust_stock')}</button>
          </div>
        </div>

        <!-- Main Module View Tabs -->
        <div style="display: flex; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          <button id="tab-btn-stock" class="btn btn-sm" onclick="OmborModule.switchView('stock')" style="font-weight: 700; padding: 8px 16px; border-radius: 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">
            📦 ${CURRENT_LANG === 'uz' ? 'Ombor Qoldiqlari' : 'Остатки на складах'}
          </button>
          <button id="tab-btn-transfers" class="btn btn-sm" onclick="OmborModule.switchView('transfers')" style="font-weight: 600; padding: 8px 16px; border-radius: 8px; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0;">
            🔄 ${CURRENT_LANG === 'uz' ? "Omborlararo O'tkazmalar Tarixi" : "История перемещений"}
          </button>
        </div>

        <!-- Warehouse Filter Tabs (Visible in Stock view) -->
        <div class="tabs-nav" id="warehouse-tabs" style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn active" onclick="OmborModule.filterWarehouse(null, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid #2563eb; color: #2563eb;">
            ${CURRENT_LANG === 'uz' ? 'Barcha Omborlar' : 'Все Склады'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(1, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            🏢 ${CURRENT_LANG === 'uz' ? '1: Tayyor mahsulotlar' : '1: Готовая продукция'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(2, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            🏭 ${CURRENT_LANG === 'uz' ? '2: Ishlab chiqarish materiallari' : '2: Материалы для производства'}
          </button>
          <button class="tab-btn" onclick="OmborModule.filterWarehouse(3, this)" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; color: #64748b;">
            📦 ${CURRENT_LANG === 'uz' ? '3: Aralash ombor' : '3: Смешанный склад'}
          </button>
        </div>

        <div class="table-container" id="stock-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${t('msg_loading')}</div>
        </div>
      </div>
    `;

    await this.loadStock();
  },

  async switchView(view) {
    this.currentView = view;
    const btnStock = document.getElementById("tab-btn-stock");
    const btnTransfers = document.getElementById("tab-btn-transfers");
    const whTabs = document.getElementById("warehouse-tabs");

    if (view === "stock") {
      if (btnStock) {
        btnStock.style.background = "#eff6ff";
        btnStock.style.color = "#1d4ed8";
        btnStock.style.borderColor = "#bfdbfe";
      }
      if (btnTransfers) {
        btnTransfers.style.background = "#f8fafc";
        btnTransfers.style.color = "#64748b";
        btnTransfers.style.borderColor = "#e2e8f0";
      }
      if (whTabs) whTabs.style.display = "flex";
      await this.loadStock();
    } else {
      if (btnTransfers) {
        btnTransfers.style.background = "#eff6ff";
        btnTransfers.style.color = "#1d4ed8";
        btnTransfers.style.borderColor = "#bfdbfe";
      }
      if (btnStock) {
        btnStock.style.background = "#f8fafc";
        btnStock.style.color = "#64748b";
        btnStock.style.borderColor = "#e2e8f0";
      }
      if (whTabs) whTabs.style.display = "none";
      await this.loadTransfers();
    }
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

  async loadTransfers() {
    const tableDiv = document.getElementById("stock-table-container");
    if (!tableDiv) return;

    try {
      const transfers = await API.getStockTransfers();

      if (!transfers || transfers.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">
            <div style="font-size: 40px; margin-bottom: 10px;">🔄</div>
            <div style="font-size: 16px; font-weight: 600;">${CURRENT_LANG === 'uz' ? "Hali omborlararo o'tkazmalar amalga oshirilmagan" : "Перемещений пока нет"}</div>
            <p style="font-size: 13px; color: #94a3b8; margin-top: 4px;">${CURRENT_LANG === 'uz' ? "Yuqoridagi 'Ombordan Omborga O'tkazish' tugmasini bosib yangi o'tkazma yarating." : "Нажмите кнопку выше, чтобы создать новое перемещение."}</p>
          </div>
        `;
        return;
      }

      tableDiv.innerHTML = `
        <table class="data-table" id="transfers-main-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">Hujjat № <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Qaysi Ombordan (Manba)' : 'Из склада'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${CURRENT_LANG === 'uz' ? 'Qaysi Omborga (Maqsad)' : 'В склад'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)">Mahsulot / Tovar <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right;">Tannarxi ($) <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="text-align: right;">Jami ($) <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, false)">Mas'ul <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 9, false)">${t('th_description')} <span class="sort-icon">↕</span></th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 №..." oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Manba...' : 'Из...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Maqsad...' : 'В...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Tovar...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="8" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Masul...' : 'Ответственный...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="9" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Tavsif...' : 'Описание...'}" oninput="TableFilterSort.filterTable(this)" /></th>
            </tr>
          </thead>
          <tbody>
            ${transfers.map(trf => `
              <tr>
                <td data-sort-value="${trf.date}">${formatDate(trf.date)}</td>
                <td data-sort-value="${trf.transfer_number}"><code>${trf.transfer_number}</code></td>
                <td data-sort-value="${trf.from_warehouse_name}"><span class="badge" style="background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 6px; font-weight: 600;">📤 ${tr(trf.from_warehouse_name)}</span></td>
                <td data-sort-value="${trf.to_warehouse_name}"><span class="badge" style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 6px; font-weight: 600;">📥 ${tr(trf.to_warehouse_name)}</span></td>
                <td data-sort-value="${trf.material_name}"><strong>${trf.material_name}</strong> <span style="font-size: 11px; color: #64748b;">(${trf.material_code})</span></td>
                <td data-sort-value="${trf.quantity}" style="text-align: right;"><strong>${formatNumber(trf.quantity, 0, 2)} ${tr(trf.unit)}</strong></td>
                <td data-sort-value="${trf.unit_cost_usd}" style="text-align: right;">$${formatNumber(trf.unit_cost_usd, 2, 4)}</td>
                <td data-sort-value="${trf.total_cost_usd}" style="text-align: right;"><strong style="color: #2563eb;">$${formatNumber(trf.total_cost_usd, 2, 2)}</strong></td>
                <td data-sort-value="${trf.created_by || ''}">${trf.created_by || 'Admin'}</td>
                <td data-sort-value="${trf.description || ''}">${trf.description || '-'}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      tableDiv.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">${t('msg_error')} ${e.message}</div>`;
    }
  },

  openTransferModal() {
    const todayStr = new Date().toISOString().split("T")[0];

    showModal(
      CURRENT_LANG === 'uz' ? "🔄 Ombordan Omborga Tovarlarni O'tkazish" : "🔄 Перемещение между складами",
      `
        <form id="stock-transfer-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📤 ${CURRENT_LANG === 'uz' ? 'Qaysi Ombordan (Manba)' : 'Из какого склада'} *</label>
              <select id="tr-from-wh" class="form-control" required onchange="OmborModule.populateMaterialsForTransfer()" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;">
                <option value="1">1: Tayyor mahsulotlar</option>
                <option value="2">2: Ishlab chiqarish materiallari</option>
                <option value="3">3: Aralash ombor</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📥 ${CURRENT_LANG === 'uz' ? 'Qaysi Omborga (Maqsad)' : 'В какой склад'} *</label>
              <select id="tr-to-wh" class="form-control" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;">
                <option value="2" selected>2: Ishlab chiqarish materiallari</option>
                <option value="1">1: Tayyor mahsulotlar</option>
                <option value="3">3: Aralash ombor</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📦 O'tkaziladigan Mahsulot / Tovar (Yozish yoki tanlash) *</label>
            <datalist id="tr-mat-datalist"></datalist>
            <input 
              type="text" 
              id="tr-mat-input" 
              list="tr-mat-datalist" 
              class="form-control" 
              placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Tovar kodi yoki nomini yozing...' : 'Поиск товара по коду или наименованию...'}" 
              oninput="OmborModule.onTransferMaterialInputChange()" 
              onchange="OmborModule.onTransferMaterialInputChange()"
              style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
              required 
            />
            <input type="hidden" id="tr-mat-id" value="" />
          </div>

          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📊 O'tkaziladigan Miqdor *</label>
              <input type="text" id="tr-qty" class="form-control" placeholder="0" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-weight: 600;" />
              <div id="tr-qty-hint" style="margin-top: 4px; font-size: 12px; font-weight: 600; color: #2563eb;"></div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📅 ${t('th_date')} *</label>
              <input type="date" id="tr-date" class="form-control" value="${todayStr}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">📝 ${t('th_description')}</label>
            <textarea id="tr-desc" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? "Masalan: Liniyalararo material yetkazish yoki sexga o'tkazish..." : 'Описание...'}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const fromWh = parseInt(document.getElementById("tr-from-wh").value);
        const toWh = parseInt(document.getElementById("tr-to-wh").value);
        const matId = parseInt(document.getElementById("tr-mat-id").value);
        const qty = parseFormattedNumber(document.getElementById("tr-qty").value);
        const d = document.getElementById("tr-date").value;
        const desc = document.getElementById("tr-desc").value.trim();

        if (fromWh === toWh) {
          showToast(CURRENT_LANG === 'uz' ? "Manba ombor va Maqsad ombor bir xil bo'lishi mumkin emas!" : "Исходный и целевой склад ne mogut byt odnakovymi!", "warning");
          return false;
        }

        if (!matId) {
          showToast(CURRENT_LANG === 'uz' ? "Iltimos, o'tkaziladigan tovarni ro'yxatdan tanlang yoki nomini yozing!" : "Выберите товар из списка!", "warning");
          return false;
        }

        if (isNaN(qty) || qty <= 0) {
          showToast(CURRENT_LANG === 'uz' ? "Iltimos, o'tkaziladigan miqdorni to'g'ri kiriting!" : "Введите корректное количество!", "warning");
          return false;
        }

        const matchedMat = (OmborModule.transferMaterialsList || []).find(m => m.id === matId);
        const maxStock = matchedMat ? matchedMat.quantity : 0;
        if (qty > maxStock) {
          showToast(CURRENT_LANG === 'uz' ? `Omborda yetarli qoldiq mavjud emas! Mavjud: ${formatNumber(maxStock, 0, 2)}` : `Недостаточно остатка на складе! Доступно: ${formatNumber(maxStock, 0, 2)}`, "error");
          return false;
        }

        try {
          await API.createStockTransfer({
            from_warehouse_id: fromWh,
            to_warehouse_id: toWh,
            material_id: matId,
            quantity: qty,
            date: d,
            description: desc
          });
          showToast(CURRENT_LANG === 'uz' ? "Tovarlar omborlar o'rtasida muvaffaqiyatli o'tkazildi!" : "Перемещение успешно выполнено!", "success");
          await OmborModule.loadStock();
          if (OmborModule.currentView === "transfers") {
            await OmborModule.loadTransfers();
          }
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );

    setTimeout(() => {
      this.populateMaterialsForTransfer();
      const qtyInput = document.getElementById("tr-qty");
      setupLiveMoneyInput(qtyInput, null, () => "");
    }, 50);
  },

  transferMaterialsList: [],

  async populateMaterialsForTransfer() {
    const fromWhSel = document.getElementById("tr-from-wh");
    const datalist = document.getElementById("tr-mat-datalist");
    const inputEl = document.getElementById("tr-mat-input");
    const idEl = document.getElementById("tr-mat-id");
    const qtyHint = document.getElementById("tr-qty-hint");
    if (!fromWhSel || !datalist || !inputEl) return;

    const fromWhId = parseInt(fromWhSel.value);
    datalist.innerHTML = "";
    inputEl.value = "";
    if (idEl) idEl.value = "";
    if (qtyHint) qtyHint.innerHTML = "";

    try {
      const [materials, stock] = await Promise.all([
        API.getMaterials(),
        API.getStockBalances(fromWhId, "", "")
      ]);

      const stockMap = {};
      (stock || []).forEach(s => {
        stockMap[s.material_id] = s.quantity;
      });

      if (!materials || materials.length === 0) {
        inputEl.placeholder = "⚠️ Birorta ham tovar topilmadi";
        return;
      }

      // Sort materials: items with positive stock first, then others
      const sorted = materials.slice().sort((a, b) => (stockMap[b.id] || 0) - (stockMap[a.id] || 0));

      this.transferMaterialsList = sorted.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        category: m.category,
        unit: m.unit,
        quantity: stockMap[m.id] || 0,
        fullStr: `${m.code} - ${m.name} (${tr(m.category)}) — Mavjud: ${formatNumber(stockMap[m.id] || 0, 0, 2)} ${tr(m.unit)}`
      }));

      datalist.innerHTML = this.transferMaterialsList.map(m => `
        <option value="${m.fullStr}">
          ${m.code} - ${m.name}
        </option>
      `).join("");

      inputEl.value = "";
      if (idEl) idEl.value = "";
      if (qtyHint) qtyHint.innerHTML = "";
    } catch (e) {
      inputEl.placeholder = "Yuklashda xatolik";
    }
  },

  onTransferMaterialInputChange() {
    const inputEl = document.getElementById("tr-mat-input");
    const idEl = document.getElementById("tr-mat-id");
    const qtyHint = document.getElementById("tr-qty-hint");
    if (!inputEl || !idEl || !qtyHint) return;

    const val = inputEl.value.trim().toLowerCase();
    if (!val) {
      idEl.value = "";
      qtyHint.innerHTML = "";
      return;
    }

    const list = this.transferMaterialsList || [];
    let matched = list.find(m => m.fullStr.toLowerCase() === val);
    if (!matched) {
      matched = list.find(m => 
        m.code.toLowerCase() === val || 
        m.name.toLowerCase() === val || 
        `${m.code} - ${m.name}`.toLowerCase() === val ||
        m.fullStr.toLowerCase().includes(val)
      );
    }

    if (matched) {
      idEl.value = matched.id;
      qtyHint.innerHTML = `📌 Manba ombordagi mavjud maksimal qoldiq: <strong style="color: #15803d;">${formatNumber(matched.quantity, 0, 2)} ${tr(matched.unit)}</strong>`;
    } else {
      idEl.value = "";
      qtyHint.innerHTML = `<span style="color: #dc2626;">⚠️ Topilmadi! Iltimos, ro'yxatdan tovar tanlang.</span>`;
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
          await API.adjustStockManual({
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
