const PurchasesModule = {
  rawMaterialsList: [],
  suppliersList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>🛒</span> <span>${t('mod_zakup_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              ${t('mod_zakup_sub')}
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="exportTableToExcel('purchases-table', 'xaridlar_zakup')" style="display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span>${t('btn_export_excel')}</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="PurchasesModule.openNewPurchaseModal()" style="display: flex; align-items: center; gap: 6px;">
              <span>➕</span> <span>${CURRENT_LANG === 'uz' ? 'Yangi xarid' : 'Новая закупка'}</span>
            </button>
          </div>
        </div>

        <div class="table-container" id="purchases-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
        </div>
      </div>
    `;

    await this.loadPurchases();
  },

  async loadPurchases() {
    const tableDiv = document.getElementById("purchases-table-container");
    if (!tableDiv) return;

    try {
      const purchases = await API.getPurchases();
      if (!purchases || purchases.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">
            <div style="font-size: 40px; margin-bottom: 10px;">📦</div>
            <h3>${CURRENT_LANG === 'uz' ? 'Hozircha xarid hujjatlari mavjud emas' : 'Пока нет документов закупок'}</h3>
            <p>${CURRENT_LANG === 'uz' ? 'Yangi xarid qo\'shish uchun yuqoridagi tugmani bosing' : 'Нажмите кнопку выше, чтобы добавить закупку'}</p>
          </div>
        `;
        return;
      }

      tableDiv.innerHTML = `
        <table class="data-table" id="purchases-main-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${t('th_doc_num')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Yetkazib beruvchi' : 'Поставщик'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 14px;">${t('th_warehouse')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Sotib olingan mahsulot' : 'Товар / Материал'} <span class="sort-icon">↕</span></th>
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
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${CURRENT_LANG === 'uz' ? 'Postavshik...' : 'Поставщик...'}" oninput="TableFilterSort.filterTable(this)" /></th>
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
            ${purchases.map(p => {
              const isUsd = p.currency === 'USD';
              const itemsList = p.items || [];
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
              <tr class="${p.status === 'Storno' ? 'storno-row' : ''}" style="border-bottom: 1px solid #f1f5f9; ${p.status === 'Storno' ? 'opacity: 0.6; background: #fff1f2;' : ''}">
                <td data-sort-value="${p.date}" style="padding: 12px 14px;">${formatDate(p.date)}</td>
                <td data-sort-value="${p.purchase_number}" style="padding: 12px 14px;"><code>${p.purchase_number}</code></td>
                <td data-sort-value="${p.supplier_name}" style="padding: 12px 14px;">${p.supplier_name} <span style="color: #64748b; font-size: 11px;">(${p.supplier_code})</span></td>
                <td data-sort-value="${p.warehouse_name}" style="padding: 12px 14px;"><span class="badge" style="background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;">${tr(p.warehouse_name)}</span></td>
                <td data-sort-value="${matNames}" style="padding: 12px 14px;">${matCellHtml}</td>
                <td data-sort-value="${totalQty}" style="padding: 12px 14px; text-align: right;">${qtyCellHtml}</td>
                <td data-sort-value="${itemsList[0]?.unit_price || 0}" style="padding: 12px 14px; text-align: right;">${priceCellHtml}</td>
                <td data-sort-value="${p.total_amount}" style="padding: 12px 14px; text-align: right;">
                  <span style="color: #ef4444; font-size: 13px; font-weight: 600;">
                    ${formatNumber(p.total_amount, 2, 2)}
                  </span>
                </td>
                <td data-sort-value="${p.currency}" style="padding: 12px 14px; text-align: center;">
                  <span class="badge" style="font-weight: 600; padding: 4px 8px; border-radius: 6px; background: ${isUsd ? '#ecfdf5' : '#eff6ff'}; color: ${isUsd ? '#059669' : '#2563eb'}; border: 1px solid ${isUsd ? '#a7f3d0' : '#bfdbfe'};">
                    ${p.currency}
                  </span>
                </td>
                <td data-sort-value="${p.status}" style="padding: 12px 14px;">
                  <span class="badge" style="background: ${p.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${p.status === 'Tasdiqlandi' ? '#166534' : '#991b1b'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                    ${tr(p.status)}
                  </span>
                </td>
                <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                  ${p.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-sm" onclick="PurchasesModule.stornoPurchase(${p.id}, '${p.purchase_number}')" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${CURRENT_ROLE === 'Admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="PurchasesModule.deletePurchase(${p.id}, '${p.purchase_number}')" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
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

  async openNewPurchaseModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [suppliers, materials, warehouses] = await Promise.all([
      API.getCounterparties("supplier"),
      API.getMaterials(),
      API.getWarehouses()
    ]);

    this.suppliersList = suppliers || [];
    this.rawMaterialsList = materials || [];

    const isUz = CURRENT_LANG === 'uz';

    showModal(
      isUz ? "Yangi xarid hujjatini rasmiylashtirish" : "Оформление нового документа закупки",
      `
        <form id="new-purchase-form">
          <!-- Datalists for Autocomplete & Search -->
          <datalist id="pur-suppliers-datalist">
            ${this.suppliersList.map(s => `<option value="${s.code} - ${s.name} (${s.region || ''})" data-id="${s.id}">${s.code} - ${s.name}</option>`).join("")}
          </datalist>

          <datalist id="pur-materials-datalist">
            ${this.rawMaterialsList.map(m => `<option value="${m.code} - ${m.name} (${m.unit})" data-id="${m.id}" data-price="${m.current_avg_price_usd || 0}">${m.code} - ${m.name}</option>`).join("")}
          </datalist>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Yetkazib beruvchi *' : 'Поставщик *'}
              </label>
              <input 
                type="text" 
                id="pur-supplier-input" 
                list="pur-suppliers-datalist" 
                class="form-control" 
                placeholder="${isUz ? 'Yetkazib beruvchini tanlang yoki yozing...' : 'Выберите или введите поставщика...'}" 
                value=""
                style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
                required 
              />
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Sana *' : 'Дата *'}
              </label>
              <input type="date" id="pur-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 16px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Qabul qiluvchi ombor *' : 'Склад поступления *'}
              </label>
              <select id="pur-warehouse" class="form-control" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                ${warehouses.map(w => `<option value="${w.id}" ${w.id === 2 ? 'selected' : ''}>${tr(w.name)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                ${isUz ? 'Valyuta *' : 'Валюта *'}
              </label>
              <select id="pur-currency" class="form-control" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                <option value="USD">USD</option>
                <option value="UZS">UZS</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              ${isUz ? '📦 Xarid qilinayotgan tovarlar ro\'yxati:' : '📦 Список закупаемых товаров:'}
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="PurchasesModule.addPurchaseItemRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              ${isUz ? '+ Tovar qo\'shish' : '+ Добавить товар'}
            </button>
          </div>

          <table class="basket-table" id="pur-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 42%;">${isUz ? 'Material / Tovar' : 'Товар / Материал'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">${isUz ? 'Miqdor' : 'Количество'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">${isUz ? 'Narx' : 'Цена'}</th>
                <th style="padding: 8px 10px; text-align: left; width: 16%;">${isUz ? 'Summa' : 'Сумма'}</th>
                <th style="padding: 8px 10px; text-align: center; width: 6%;">${isUz ? 'Amal' : 'Действие'}</th>
              </tr>
            </thead>
            <tbody id="pur-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
            <textarea id="pur-desc" class="form-control" rows="2" placeholder="${isUz ? 'Faktura raqami, to\'lov shartlari yoki qo\'shimcha izoh...' : 'Номер фактуры, условия оплаты или примечание...'}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const supInput = document.getElementById("pur-supplier-input").value.trim();
        const d = document.getElementById("pur-date").value;
        const whId = parseInt(document.getElementById("pur-warehouse").value);
        const curr = document.getElementById("pur-currency").value;
        const desc = document.getElementById("pur-desc").value.trim();

        // Resolve supplier
        const matchedSupplier = PurchasesModule.findSupplierByInput(supInput);
        if (!matchedSupplier) {
          showToast(isUz ? "Iltimos, ro'yxatdan to'g'ri Yetkazib beruvchini tanlang yoki yozing!" : "Пожалуйста, выберите или введите поставщика из списка!", "error");
          return false;
        }

        const items = [];
        const rows = document.querySelectorAll("#pur-rows-body tr");
        for (const tr of rows) {
          const matInput = tr.querySelector(".row-mat-input").value.trim();
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);

          const matchedMat = PurchasesModule.findMaterialByInput(matInput);
          if (matchedMat && qty > 0 && price >= 0) {
            items.push({ material_id: matchedMat.id, quantity: qty, unit_price: price });
          }
        }

        if (items.length === 0) {
          showToast(isUz ? "Kamida bitta tovar va uning miqdori/narxini to'g'ri kiriting!" : "Введите хотя бы один товар и его количество/цену!", "warning");
          return false;
        }

        try {
          await API.createPurchase({
            supplier_id: matchedSupplier.id,
            warehouse_id: whId,
            date: d,
            currency: curr,
            items,
            description: desc
          });
          showToast(isUz ? "Xarid hujjati muvaffaqiyatli saqlandi va ombor qoldig'i yangilandi!" : "Документ закупки успешно сохранен и остатки обновлены!", "success");
          await PurchasesModule.loadPurchases();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    this.addPurchaseItemRow();
  },

  findSupplierByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.suppliersList.find(s => {
      const full = `${s.code} - ${s.name} (${s.region || ''})`.toLowerCase();
      return full === lower || s.code.toLowerCase() === lower || s.name.toLowerCase() === lower || full.includes(lower);
    }) || null;
  },

  findMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.rawMaterialsList.find(m => {
      const full = `${m.code} - ${m.name} (${m.unit})`.toLowerCase();
      return full === lower || m.code.toLowerCase() === lower || m.name.toLowerCase() === lower || full.includes(lower);
    }) || null;
  },

  addPurchaseItemRow() {
    const tbody = document.getElementById("pur-rows-body");
    if (!tbody) return;

    const isUz = CURRENT_LANG === 'uz';

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 6px 8px;">
        <input 
          type="text" 
          list="pur-materials-datalist" 
          class="form-control row-mat-input" 
          placeholder="${isUz ? 'Materialni tanlang yoki yozing...' : 'Выберите или введите материал...'}" 
          value="" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          onchange="PurchasesModule.onMatInputChange(this)"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" value="" placeholder="0" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-price" value="" placeholder="0.00" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
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

  onMatInputChange(input) {
    const matched = this.findMaterialByInput(input.value);
    if (matched) {
      const tr = input.closest("tr");
      if (matched.current_avg_price_usd && matched.current_avg_price_usd > 0) {
        tr.querySelector(".row-price").value = matched.current_avg_price_usd.toFixed(2);
      }
      this.calcRowTotal(input);
    }
  },

  calcRowTotal(input) {
    const tr = input.closest("tr");
    const qty = parseFloat(tr.querySelector(".row-qty").value) || 0;
    const price = parseFloat(tr.querySelector(".row-price").value) || 0;
    tr.querySelector(".row-total").value = (qty * price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  },

  async stornoPurchase(id, pNum) {
    const isUz = CURRENT_LANG === 'uz';
    const confirmMsg = isUz
      ? `${pNum} xaridini STORNO qilishni tasdiqlaysizmi?\nOmbordagi tovarlar qaytarib olinadi va ta'minotchi balansi tiklanadi.`
      : `Подтверждаете СТОРНО закупки ${pNum}?\nТовары будут списаны со склада, а баланс поставщика восстановлен.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      await API.stornoPurchase(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadPurchases();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deletePurchase(id, pNum) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? `${pNum} xarid hujjatini butunlay o'chirishni tasdiqlaysizmi?` : `Удалить документ закупки ${pNum} навсегда?`)) return;
    try {
      await API.deletePurchase(id);
      showToast(isUz ? "Xarid o'chirildi" : "Закупка удалена", "success");
      await this.loadPurchases();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
