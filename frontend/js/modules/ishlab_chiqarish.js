const ProductionModule = {
  rawMaterialsList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div class="card-title" style="font-size: 20px; font-weight: 700;">🏭 ${t('mod_prod_title')}</div>
          <button class="btn btn-primary" onclick="ProductionModule.openNewOrderModal()" style="font-weight: 700; font-size: 15px; padding: 10px 22px; border-radius: 8px; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <span>➕</span> <span>${t('btn_new_production')}</span>
          </button>
        </div>

        <!-- 5 Lines KPI Breakdown -->
        <div class="grid-5" id="production-lines-grid" style="margin-bottom: 24px;">
          <!-- Rendered dynamically -->
        </div>

        <!-- Production Orders Table with Storno -->
        <div class="card-header" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div class="card-title">📋 ${CURRENT_LANG === 'uz' ? 'Ishlab chiqarilgan tovarlar va buyurtmalar tarixi' : 'История выпуска готовой продукции'}</div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="exportTableToExcel('production-orders-table', 'ishlab_chiqarish')" style="display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span>${t('btn_export_excel')}</span>
            </button>
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
        const lineTitle = CURRENT_LANG === 'uz' ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`;
        return `
          <div class="kpi-card" style="border-top: 4px solid #3b82f6; border-radius: 12px; padding: 22px 14px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-height: 115px;">
            <div style="font-size: 19px; font-weight: 700; color: #1e293b; margin-bottom: 10px; text-align: center; letter-spacing: 0.5px; width: 100%; display: flex; align-items: center; justify-content: center;">
              ${lineTitle}
            </div>
            <div style="font-size: 26px; font-weight: 800; color: #0f172a; text-align: center; width: 100%; display: flex; align-items: baseline; justify-content: center; gap: 6px;">
              <span>${lineVol.toLocaleString()}</span>
              <span style="font-size: 16px; font-weight: 600; color: #64748b;">${CURRENT_LANG === 'uz' ? 'dona' : 'шт'}</span>
            </div>
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
        <table class="data-table" id="prod-orders-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${CURRENT_LANG === 'uz' ? 'Liniya' : 'Линия'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${CURRENT_LANG === 'uz' ? 'Tayyor mahsulot' : 'Готовая продукция'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="text-align: right;">${t('th_quantity')} (${CURRENT_LANG === 'uz' ? 'dona' : 'шт'}) <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${CURRENT_LANG === 'uz' ? "Tannarx ($)" : "Себестоимость ($)"} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="text-align: right;">${CURRENT_LANG === 'uz' ? "Birlik ($/dona)" : "За единицу ($/шт)"} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, false)">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Liniya...' : 'Линия...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Mahsulot...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="7" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr class="${o.status === 'Storno' ? 'storno-row' : ''}">
                <td data-sort-value="${o.date}">${formatDate(o.date)}</td>
                <td data-sort-value="${o.order_number}"><code>${o.order_number}</code></td>
                <td data-sort-value="${o.line_name}"><span class="badge" style="background: #f1f5f9; color: #1e293b; padding: 4px 8px; border-radius: 6px; font-weight: 500;">${tr(o.line_name)}</span></td>
                <td data-sort-value="${o.output_material_name}">${o.output_material_name} <span style="color: #64748b; font-size: 11px;">(${o.output_material_code})</span></td>
                <td data-sort-value="${o.quantity}" style="text-align: right;">${o.quantity.toLocaleString()} ${tr(o.unit)}</td>
                <td data-sort-value="${o.direct_cost_usd}" style="text-align: right;">$${o.direct_cost_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td data-sort-value="${o.unit_cost_usd}" style="text-align: right;">$${o.unit_cost_usd.toFixed(4)}</td>
                <td data-sort-value="${o.status}">
                  <span class="badge" style="background: ${o.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${o.status === 'Tasdiqlandi' ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 6px; font-weight: 500;">
                    ${tr(o.status)}
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  ${o.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="ProductionModule.stornoOrder(${o.id}, '${o.order_number}')">
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="ProductionModule.deleteOrder(${o.id}, '${o.order_number}')" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
                      🗑️
                    </button>
                  ` : ''}
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

  finishedMaterialsList: [],
  allStockBalances: [],

  async openNewOrderModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Fetch materials, lines, and stock balances
    const [lines, finishedMaterials, allRaw, allStocks] = await Promise.all([
      API.getProductionLines(),
      API.getMaterials("Tayyor mahsulot"),
      API.getMaterials(),
      API.getStockBalances()
    ]);
    
    this.finishedMaterialsList = finishedMaterials || [];
    this.rawMaterialsList = allRaw || [];
    this.allStockBalances = allStocks || [];

    showModal(
      CURRENT_LANG === 'uz' ? "Yangi Ishlab Chiqarish hujjati kiritish" : "Ввод документа выпуска готовой продукции",
      `
        <datalist id="prod-output-mat-datalist">
          ${(this.finishedMaterialsList || []).map(m => `<option value="${m.code} - ${m.name} (${tr(m.unit)})" data-id="${m.id}">${m.code} - ${m.name}</option>`).join("")}
        </datalist>

        <form id="new-prod-order-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Ishlab chiqarish liniyasi *' : 'Производственная линия *'}</label>
              <select id="po-line" class="form-control" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required>
                ${lines.map(l => `<option value="${l.id}">${CURRENT_LANG === 'uz' ? `Liniya ${l.line_number}` : `Линия ${l.line_number}`}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_date')} *</label>
              <input type="date" id="po-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>

          <div class="form-row" style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Chiqarilayotgan Tayyor kafel plitasi *' : 'Выпускаемая готовая плитка *'}</label>
              <input 
                type="text" 
                id="po-output-mat-input" 
                list="prod-output-mat-datalist" 
                class="form-control" 
                placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Kafel kodi yoki nomini yozing...' : 'Код или наименование плитки...'}" 
                value="" 
                style="width: 100%; padding: 8px 12px; border-radius: 8px;"
                required 
              />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; font-size: 13px;">${CURRENT_LANG === 'uz' ? 'Chiqarilgan hajm (dona) *' : 'Объем выпуска (шт) *'}</label>
              <input type="number" step="any" id="po-quantity" class="form-control" placeholder="1000" style="width: 100%; padding: 8px 12px; border-radius: 8px;" required />
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              🧪 ${CURRENT_LANG === 'uz' ? 'Sarflangan xomashyo va butlovchi qismlar:' : 'Израсходованное сырье и материалы:'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ProductionModule.addConsumedRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              ${CURRENT_LANG === 'uz' ? '+ Xomashyo qo\'shish' : '+ Добавить сырье'}
            </button>
          </div>

          <table class="basket-table" id="consumed-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 45%;">${CURRENT_LANG === 'uz' ? 'Xomashyo / Material' : 'Сырье / Материал'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 28%;">${CURRENT_LANG === 'uz' ? 'Sklad (Qayerdan)' : 'Склад (Откуда)'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 19%;">${CURRENT_LANG === 'uz' ? 'Sarflangan miqdor' : 'Расход'}</th>
                <th style="padding: 8px 10px; text-align: center; width: 8%;">${t('th_actions')}</th>
              </tr>
            </thead>
            <tbody id="consumed-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="font-weight: 600; font-size: 13px;">${t('th_description')}</label>
            <textarea id="po-notes" class="form-control" rows="2" placeholder="${CURRENT_LANG === 'uz' ? 'Smena yoki partiya izohi...' : 'Примечание к смене / партии...'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const lineId = parseInt(document.getElementById("po-line").value);
        const d = document.getElementById("po-date").value;
        const outMatInput = document.getElementById("po-output-mat-input").value.trim();
        const qty = parseFloat(document.getElementById("po-quantity").value);
        const notes = document.getElementById("po-notes").value.trim();

        const matchedOutMat = ProductionModule.findFinishedMaterialByInput(outMatInput);
        if (!matchedOutMat || !outMatInput) {
          showToast(CURRENT_LANG === 'uz' ? "Chiqarilayotgan tayyor mahsulotni tanlang!" : "Пожалуйста, выберите готовую продукцию из списка!", "warning");
          return false;
        }

        if (!lineId || isNaN(qty) || qty <= 0) {
          showToast(CURRENT_LANG === 'uz' ? "Iltimos, ishlab chiqarish hajmini to'g'ri kiriting!" : "Пожалуйста, укажите корректный объем выпуска!", "warning");
          return false;
        }

        // Collect consumed rows
        const consumed = [];
        const rows = document.querySelectorAll("#consumed-rows-body tr");
        rows.forEach(tr => {
          const matInput = tr.querySelector(".row-mat-input") ? tr.querySelector(".row-mat-input").value.trim() : "";
          const whId = parseInt(tr.querySelector(".row-wh").value, 10) || 2;
          const cQty = parseFloat(tr.querySelector(".row-qty").value);
          const matchedRaw = ProductionModule.findRawMaterialByInput(matInput);
          if (matchedRaw && whId && cQty > 0) {
            consumed.push({ material_id: matchedRaw.id, warehouse_id: whId, quantity: cQty });
          }
        });

        try {
          await API.createProductionOrder({
            line_id: lineId,
            output_material_id: matchedOutMat.id,
            quantity: qty,
            date: d,
            consumed_materials: consumed,
            notes
          });
          showToast(CURRENT_LANG === 'uz' ? "Ishlab chiqarish buyurtmasi muvaffaqiyatli saqlandi!" : "Документ выпуска успешно сохранен!", "success");
          await ProductionModule.loadLinesStats();
          await ProductionModule.loadOrders();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    // Add initial clean row
    this.addConsumedRow(null, 2, '');
  },

  getMaterialsForWarehouse(whId) {
    const wid = parseInt(whId, 10) || 2;
    if (!this.rawMaterialsList || !Array.isArray(this.rawMaterialsList)) {
      return [];
    }

    const stockMap = {};
    (this.allStockBalances || []).forEach(s => {
      if (s.warehouse_id === wid && s.quantity > 0) {
        stockMap[s.material_id] = s.quantity;
      }
    });

    // Filter ALL materials that have quantity > 0 in warehouse wid (no category restrictions!)
    const availableInStock = this.rawMaterialsList.filter(m => (stockMap[m.id] || 0) > 0);
    return availableInStock.map(m => ({
      ...m,
      stockQty: stockMap[m.id] || 0
    }));
  },

  onWarehouseChange(whSelect) {
    const tr = whSelect.closest("tr");
    if (!tr) return;
    const whId = parseInt(whSelect.value, 10) || 2;
    const rowMatInput = tr.querySelector(".row-mat-input");
    const oldDatalist = tr.querySelector(".row-mat-datalist");
    
    const mats = this.getMaterialsForWarehouse(whId);
    
    if (rowMatInput) {
      const newDlId = 'c_dl_' + Math.random().toString(36).substr(2, 9);
      const newDatalist = document.createElement("datalist");
      newDatalist.id = newDlId;
      newDatalist.className = "row-mat-datalist";

      if (mats.length === 0) {
        newDatalist.innerHTML = `<option value="">⚠️ ${CURRENT_LANG === 'uz' ? 'Bu omborda birorta ham sarf qoldig\'i yo\'q' : 'В этом складе нет остатков'}</option>`;
      } else {
        newDatalist.innerHTML = mats.map(m => `
          <option value="${m.code} - ${m.name} (${tr(m.unit)})" data-id="${m.id}">${CURRENT_LANG === 'uz' ? 'Omborda mavjud' : 'В наличии'}: ${formatNumber(m.stockQty, 0, 2)} ${tr(m.unit)}</option>
        `).join("");
      }

      if (oldDatalist) {
        oldDatalist.replaceWith(newDatalist);
      } else {
        tr.querySelector("td").appendChild(newDatalist);
      }

      rowMatInput.setAttribute("list", newDlId);
      rowMatInput.value = "";
      rowMatInput.focus();
    }
  },

  findFinishedMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return (this.finishedMaterialsList || []).find(m => {
      const full = `${m.code} - ${m.name} (${tr(m.unit)})`.toLowerCase();
      return full === lower || m.code.toLowerCase() === lower || m.name.toLowerCase() === lower || full.includes(lower) || lower.includes(m.code.toLowerCase());
    }) || null;
  },

  findRawMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return (this.rawMaterialsList || []).find(m => {
      const full = `${m.code} - ${m.name} (${tr(m.unit)})`.toLowerCase();
      const code = m.code.toLowerCase();
      const name = m.name.toLowerCase();
      return full === lower || code === lower || name === lower || lower.includes(code) || full.includes(lower);
    }) || null;
  },

  addConsumedRow(defaultCode = null, defaultWh = 2, defaultQty = '') {
    const tbody = document.getElementById("consumed-rows-body");
    if (!tbody) return;

    const whId = (typeof defaultWh === 'number') ? defaultWh : 2;
    const code = (typeof defaultCode === 'string') ? defaultCode : null;
    const qty = (typeof defaultQty === 'number' || (typeof defaultQty === 'string' && defaultQty !== '')) ? defaultQty : '';

    const dlId = 'c_dl_' + Math.random().toString(36).substr(2, 9);
    const mats = this.getMaterialsForWarehouse(whId);

    let defaultMatText = "";
    if (code) {
      const defaultMat = (this.rawMaterialsList || []).find(m => m.code === code);
      if (defaultMat) {
        defaultMatText = `${defaultMat.code} - ${defaultMat.name} (${tr(defaultMat.unit)})`;
      }
    }

    const trEl = document.createElement("tr");
    trEl.style.borderBottom = "1px solid #f1f5f9";
    trEl.innerHTML = `
      <td style="padding: 6px 8px;">
        <datalist id="${dlId}" class="row-mat-datalist">
          ${mats.length === 0 
            ? `<option value="">⚠️ ${CURRENT_LANG === 'uz' ? 'Bu omborda birorta ham sarf qoldig\'i yo\'q' : 'В этом складе нет остатков'}</option>` 
            : mats.map(m => `<option value="${m.code} - ${m.name} (${tr(m.unit)})" data-id="${m.id}">${CURRENT_LANG === 'uz' ? 'Omborda mavjud' : 'В наличии'}: ${formatNumber(m.stockQty, 0, 2)} ${tr(m.unit)}</option>`).join("")
          }
        </datalist>
        <input 
          type="text" 
          list="${dlId}" 
          class="form-control row-mat-input" 
          placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Xomashyo kodi yoki nomi...' : 'Код или наименование сырья...'}" 
          value="${defaultMatText}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <select class="form-control row-wh" onchange="ProductionModule.onWarehouseChange(this)" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
          <option value="2" ${whId === 2 ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? '2: Ishlab chiqarish uchun materiallar' : '2: Материалы для производства'}</option>
          <option value="3" ${whId === 3 ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? '3: Aralash ombor' : '3: Смешанный склад'}</option>
        </select>
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" value="${qty}" placeholder="0" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" required />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">❌</button>
      </td>
    `;
    tbody.appendChild(trEl);
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
  },

  async deleteOrder(id, orderNumber) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `${orderNumber} buyurtmasini butunlay o'chirishni tasdiqlaysizmi?` : `Удалить заказ ${orderNumber} навсегда?`)) return;
    try {
      await API.deleteProductionOrder(id);
      showToast(isUz ? "Buyurtma o'chirildi" : "Заказ удален", "success");
      await this.loadLinesStats();
      await this.loadOrders();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
