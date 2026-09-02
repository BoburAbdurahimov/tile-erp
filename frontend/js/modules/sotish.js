const SalesModule = {
  finishedProductsList: [],
  clientsList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>🏷️</span> <span>${t('mod_sotish_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              ${t('mod_sotish_sub')}
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="exportTableToExcel('sales-table', 'sotuvlar_realizatsiya')" style="display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span>${t('btn_export_excel')}</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="SalesModule.openNewSaleModal()" style="display: flex; align-items: center; gap: 6px;">
              <span>➕</span> <span>${CURRENT_LANG === 'uz' ? 'Yangi sotuv' : 'Новая продажа'}</span>
            </button>
          </div>
        </div>

        <div class="table-container" id="sales-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
        </div>
      </div>
    `;

    await this.loadSales();
  },

  async loadSales() {
    const tableDiv = document.getElementById("sales-table-container");
    if (!tableDiv) return;

    try {
      const sales = await API.getSales();
      if (!sales || sales.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">
            <div style="font-size: 40px; margin-bottom: 10px;">🏷️</div>
            <h3>${CURRENT_LANG === 'uz' ? 'Hozircha sotuv hujjatlari mavjud emas' : 'Пока нет документов продаж'}</h3>
            <p>${CURRENT_LANG === 'uz' ? 'Yangi sotuv qo\'shish uchun yuqoridagi tugmani bosing' : 'Нажмите кнопку выше, чтобы добавить продажу'}</p>
          </div>
        `;
        return;
      }

      tableDiv.innerHTML = `
        <table class="data-table" id="sales-main-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Xaridor (Mijoz)' : 'Покупатель (Клиент)'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 14px;">${t('th_warehouse')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Sotilgan mahsulot' : 'Товар / Продукция'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="padding: 12px 14px; text-align: right;">${t('th_quantity')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="padding: 12px 14px; text-align: right;">${t('th_price')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, true)" style="padding: 12px 14px; text-align: right;">${t('th_total')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 8, false)" style="padding: 12px 14px; text-align: center;">${t('th_currency')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 9, false)" style="padding: 12px 14px;">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Hujjat №...' : 'Документ №...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Mijoz...' : 'Клиент...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Ombor...' : 'Склад...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Mahsulot...' : 'Товар...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
              <th></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="8" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Valyuta...' : 'Валюта...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="9" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => {
              const isUsd = s.currency === 'USD';
              const itemsList = s.items || [];
              const matNames = itemsList.map(it => it.material_name).join(', ');
              const totalQty = itemsList.reduce((acc, it) => acc + (it.quantity || 0), 0);

              const matCellHtml = itemsList.length <= 1
                ? `<span>${itemsList[0]?.material_name || '-'}</span>`
                : `<div style="display: flex; flex-direction: column; gap: 3px;">${itemsList.map(it => `<div>${it.material_name}</div>`).join('')}</div>`;

              const qtyCellHtml = itemsList.length <= 1
                ? `<span>${formatNumber(itemsList[0]?.quantity || 0, 0, 2)} ${tr(itemsList[0]?.unit || '')}</span>`
                : `<div style="display: flex; flex-direction: column; gap: 3px; text-align: right;">${itemsList.map(it => `<div>${formatNumber(it.quantity, 0, 2)} ${tr(it.unit)}</div>`).join('')}</div>`;

              const priceCellHtml = itemsList.length <= 1
                ? `${formatNumber(itemsList[0]?.unit_price || 0, 2, 2)}`
                : `<div style="display: flex; flex-direction: column; gap: 3px; text-align: right;">${itemsList.map(it => `<div>${formatNumber(it.unit_price, 2, 2)}</div>`).join('')}</div>`;

              return `
              <tr class="${s.status === 'Storno' ? 'storno-row' : ''}" style="border-bottom: 1px solid #f1f5f9; ${s.status === 'Storno' ? 'opacity: 0.6; background: #fff1f2;' : ''}">
                <td data-sort-value="${s.date}" style="padding: 12px 14px;">${formatDate(s.date)}</td>
                <td data-sort-value="${s.sale_number}" style="padding: 12px 14px;"><code>${s.sale_number}</code></td>
                <td data-sort-value="${s.client_name}" style="padding: 12px 14px;">${s.client_name} <span style="color: #64748b; font-size: 11px;">(${s.client_code})</span></td>
                <td data-sort-value="${s.warehouse_name}" style="padding: 12px 14px;"><span class="badge" style="background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;">${tr(s.warehouse_name)}</span></td>
                <td data-sort-value="${matNames}" style="padding: 12px 14px;">${matCellHtml}</td>
                <td data-sort-value="${totalQty}" style="padding: 12px 14px; text-align: right;">${qtyCellHtml}</td>
                <td data-sort-value="${itemsList[0]?.unit_price || 0}" style="padding: 12px 14px; text-align: right;">${priceCellHtml}</td>
                <td data-sort-value="${s.total_amount}" style="padding: 12px 14px; text-align: right;">
                  <span style="color: #10b981; font-size: 13px; font-weight: 600;">
                    ${formatNumber(s.total_amount, 2, 2)}
                  </span>
                </td>
                <td data-sort-value="${s.currency}" style="padding: 12px 14px; text-align: center;">
                  <span class="badge" style="font-weight: 600; padding: 4px 8px; border-radius: 6px; background: ${isUsd ? '#ecfdf5' : '#eff6ff'}; color: ${isUsd ? '#059669' : '#2563eb'}; border: 1px solid ${isUsd ? '#a7f3d0' : '#bfdbfe'};">
                    ${s.currency}
                  </span>
                </td>
                <td data-sort-value="${s.status}" style="padding: 12px 14px;">
                  <span class="badge" style="background: ${s.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${s.status === 'Tasdiqlandi' ? '#166534' : '#991b1b'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                    ${tr(s.status)}
                  </span>
                </td>
                <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                  ${s.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-sm" onclick="SalesModule.stornoSale(${s.id}, '${s.sale_number}')" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="SalesModule.deleteSale(${s.id}, '${s.sale_number}')" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
                      🗑️
                    </button>
                  ` : ''}
                </td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async openNewSaleModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [clients, materials, warehouses, stockBalances] = await Promise.all([
      API.getCounterparties("client"),
      API.getMaterials("Tayyor mahsulot"),
      API.getWarehouses(),
      API.getStockBalances()
    ]);

    this.clientsList = clients || [];
    this.finishedProductsList = materials || [];
    this.stockBalances = stockBalances || [];

    const isUz = CURRENT_LANG === 'uz';

    showModal(
      isUz ? "Yangi sotuv hujjatini rasmiylashtirish" : "Оформление нового документа продажи",
      `
        <form id="new-sale-form">
          <!-- Datalists for Autocomplete & Search -->
          <datalist id="sale-clients-datalist">
            ${this.clientsList.map(c => `<option value="${c.code} - ${c.name} (${c.region || ''})" data-id="${c.id}">${c.code} - ${c.name}</option>`).join("")}
          </datalist>

          <datalist id="sale-materials-datalist">
            <!-- Dynamically populated with stock balances -->
          </datalist>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Xaridor (Mijoz) *' : 'Покупатель (Клиент) *'}
              </label>
              <input 
                type="text" 
                id="sale-client-input" 
                list="sale-clients-datalist" 
                class="form-control" 
                placeholder="${isUz ? 'Mijozni tanlang yoki yozing...' : 'Выберите или введите клиента...'}" 
                value=""
                style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
                required 
              />
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Sana *' : 'Дата *'}
              </label>
              <input type="date" id="sale-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 16px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Chiqariladigan ombor *' : 'Склад отгрузки *'}
              </label>
              <select id="sale-warehouse" class="form-control" onchange="SalesModule.onWarehouseChange(this)" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                ${warehouses.map(w => `<option value="${w.id}" ${w.id === 1 ? 'selected' : ''}>${tr(w.name)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Valyuta *' : 'Валюта *'}
              </label>
              <select id="sale-currency" class="form-control" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                <option value="USD">USD</option>
                <option value="UZS">UZS</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              ${isUz ? '🧱 Sotilayotgan mahsulotlar ro\'yxati:' : '🧱 Список реализуемой продукции:'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SalesModule.addSaleItemRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              ${isUz ? '+ Mahsulot qo\'shish' : '+ Добавить позицию'}
            </button>
          </div>

          <table class="basket-table" id="sale-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 42%;">${isUz ? 'Mahsulot / Kafel' : 'Продукция / Плитка'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">${isUz ? 'Miqdor' : 'Количество'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">${isUz ? 'Sotuv narxi' : 'Цена продажи'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 16%;">${isUz ? 'Summa' : 'Сумма'}</th>
                <th style="padding: 8px 10px; text-align: center; width: 6%;">${isUz ? 'Amal' : 'Действие'}</th>
              </tr>
            </thead>
            <tbody id="sale-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
            <textarea id="sale-desc" class="form-control" rows="2" placeholder="${isUz ? 'Shartnoma raqami, chegirma (skidka) yoki qo\'shimcha izoh...' : 'Номер договора, скидка или примечание...'}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const clientInput = document.getElementById("sale-client-input").value.trim();
        const d = document.getElementById("sale-date").value;
        const whId = parseInt(document.getElementById("sale-warehouse").value);
        const curr = document.getElementById("sale-currency").value;
        const desc = document.getElementById("sale-desc").value.trim();

        // Resolve client
        const matchedClient = SalesModule.findClientByInput(clientInput);
        if (!matchedClient) {
          showToast(isUz ? "Iltimos, ro'yxatdan to'g'ri Xaridorni (Mijozni) tanlang yoki yozing!" : "Пожалуйста, выберите или введите покупателя из списка!", "error");
          return false;
        }

        const items = [];
        const rows = document.querySelectorAll("#sale-rows-body tr");
        for (const tr of rows) {
          const matInput = tr.querySelector(".row-mat-input").value.trim();
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);

          const matchedMat = SalesModule.findMaterialByInput(matInput);
          if (matchedMat && qty > 0 && price >= 0) {
            items.push({ material_id: matchedMat.id, quantity: qty, unit_price: price });
          }
        }

        if (items.length === 0) {
          showToast(isUz ? "Kamida bitta mahsulot va uning miqdori/narxini to'g'ri kiriting!" : "Введите хотя бы одну позицию и ее количество/цену!", "warning");
          return false;
        }

        try {
          await API.createSale({
            client_id: matchedClient.id,
            warehouse_id: whId,
            date: d,
            currency: curr,
            items,
            description: desc
          });
          showToast(isUz ? "Sotuv hujjati muvaffaqiyatli saqlandi va ombor qoldig'i yangilandi!" : "Документ продажи успешно сохранен и остатки обновлены!", "success");
          await SalesModule.loadSales();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    this.updateMaterialDatalist(1);
    this.addSaleItemRow();
  },

  updateMaterialDatalist(whId = 1) {
    const datalist = document.getElementById("sale-materials-datalist");
    if (!datalist) return;
    
    const selectedWh = whId ? parseInt(whId, 10) : 1;
    const stockMap = {};

    (this.stockBalances || []).forEach(s => {
      if (!selectedWh || s.warehouse_id === selectedWh) {
        stockMap[s.material_id] = (stockMap[s.material_id] || 0) + s.quantity;
      }
    });

    datalist.innerHTML = (this.finishedProductsList || []).map(m => {
      const qty = stockMap[m.id] || 0;
      return `<option value="${m.code} - ${m.name} (${tr(m.unit)})" data-id="${m.id}">${CURRENT_LANG === 'uz' ? 'Omborda mavjud' : 'В наличии'}: ${formatNumber(qty, 0, 2)} ${tr(m.unit)}</option>`;
    }).join("");
  },

  onWarehouseChange(whSelect) {
    const whId = whSelect ? whSelect.value : 1;
    this.updateMaterialDatalist(whId);
  },

  findClientByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.clientsList.find(c => {
      const full = `${c.code} - ${c.name} (${c.region || ''})`.toLowerCase();
      return full === lower || c.code.toLowerCase() === lower || c.name.toLowerCase() === lower || full.includes(lower);
    }) || null;
  },

  findMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.finishedProductsList.find(m => {
      const full = `${m.code} - ${m.name} (${m.unit})`.toLowerCase();
      return full === lower || m.code.toLowerCase() === lower || m.name.toLowerCase() === lower || full.includes(lower);
    }) || null;
  },

  addSaleItemRow() {
    const tbody = document.getElementById("sale-rows-body");
    if (!tbody) return;

    const isUz = CURRENT_LANG === 'uz';

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 6px 8px;">
        <input 
          type="text" 
          list="sale-materials-datalist" 
          class="form-control row-mat-input" 
          placeholder="${isUz ? 'Mahsulotni tanlang yoki yozing...' : 'Выберите или введите плитку...'}" 
          value="" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" value="" placeholder="0" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="SalesModule.calcRowTotal(this)" required />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-price" value="" placeholder="0.00" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="SalesModule.calcRowTotal(this)" required />
      </td>
      <td style="padding: 6px 8px;">
        <input type="text" class="form-control row-total" value="0.00" style="width: 100%; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #f8fafc; font-weight: 700;" readonly />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  calcRowTotal(input) {
    const tr = input.closest("tr");
    const qty = parseFloat(tr.querySelector(".row-qty").value) || 0;
    const price = parseFloat(tr.querySelector(".row-price").value) || 0;
    tr.querySelector(".row-total").value = (qty * price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  },

  async stornoSale(id, sNum) {
    const isUz = CURRENT_LANG === 'uz';
    const confirmMsg = isUz
      ? `${sNum} sotuvini STORNO qilishni tasdiqlaysizmi?\nOmbordagi tayyor kafel qaytariladi va xaridor balansi tiklanadi.`
      : `Подтверждаете СТОРНО продажи ${sNum}?\nГотовая плитка вернется на склад, а баланс покупателя будет восстановлен.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      await API.stornoSale(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadSales();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteSale(id, sNum) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `${sNum} sotuv hujjatini butunlay o'chirishni tasdiqlaysizmi?` : `Удалить документ продажи ${sNum} навсегда?`)) return;
    try {
      await API.deleteSale(id);
      showToast(isUz ? "Sotuv o'chirildi" : "Продажа удалена", "success");
      await this.loadSales();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
