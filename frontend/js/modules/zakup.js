const PurchasesModule = {
  suppliersList: [],
  supplierMaterials: [],
  owners: [],               // the Ombors this user buys for (one = no choice to make)

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
<span>${t('mod_zakup_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              ${t('mod_zakup_sub')}
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm btn-icon" onclick="exportTableToPdf('purchases-main-table', 'xaridlar_zakup')" title="${t('btn_export_pdf')}" aria-label="${t('btn_export_pdf')}">${uiIcon("pdf")}</button>
            <button class="btn btn-primary btn-sm btn-icon" onclick="PurchasesModule.openNewPurchaseModal()" title="${CURRENT_LANG === 'uz' ? 'Yangi xarid' : 'Новая закупка'}" aria-label="${CURRENT_LANG === 'uz' ? 'Yangi xarid' : 'Новая закупка'}">${uiIcon("plus")}</button>
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
    const isUz = CURRENT_LANG === 'uz';

    try {
      const [purchases, whs] = await Promise.all([API.getPurchases(), API.getMaterialWarehouses()]);
      this.owners = whs.owners || [];
      const showOmbor = this.owners.length > 1;
      if (!purchases || purchases.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">
            <h3>${isUz ? 'Hozircha xarid yo\'q' : 'Пока нет закупок'}</h3>
            <p>${isUz ? 'Yangi xarid uchun yuqoridagi + tugmasini bosing' : 'Для новой закупки нажмите + вверху'}</p>
          </div>
        `;
        return;
      }

      // Only who, what, how many and when: the money is in Kontragentlar and the Kassa.
      const filter = (idx, ph) => `<th><input type="text" class="table-col-filter" data-col-idx="${idx}" placeholder="${ph}" oninput="TableFilterSort.filterTable(this)" /></th>`;
      tableDiv.innerHTML = `
        <table class="data-table" id="purchases-main-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${isUz ? 'Kimdan' : 'Поставщик'} <span class="sort-icon">↕</span></th>
              ${showOmbor ? `<th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${isUz ? 'Ombor' : 'Склад'} <span class="sort-icon">↕</span></th>` : ''}
              <th class="sortable" onclick="TableFilterSort.sortTable(this, ${2 + showOmbor}, false)" style="padding: 12px 14px;">${isUz ? 'Material' : 'Материал'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, ${3 + showOmbor}, true)" style="padding: 12px 14px; text-align: right;">${isUz ? 'Qancha' : 'Количество'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, ${4 + showOmbor}, false)" style="padding: 12px 14px;">${t('th_status')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              ${filter(0, isUz ? 'Sana...' : 'Дата...')}
              ${filter(1, isUz ? 'Kimdan...' : 'Поставщик...')}
              ${showOmbor ? filter(2, isUz ? 'Ombor...' : 'Склад...') : ''}
              ${filter(2 + showOmbor, isUz ? 'Material...' : 'Материал...')}
              <th></th>
              ${filter(4 + showOmbor, isUz ? 'Holat...' : 'Статус...')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${purchases.map(p => {
              const itemsList = p.items || [];
              const label = `${p.supplier_name}, ${formatDate(p.date)}`;
              const matCell = itemsList.map(it => `<div>${escapeHtml(it.material_name)}</div>`).join('') || '-';
              const qtyCell = itemsList.map(it => `<div>${formatNumber(it.quantity, 0, 2)} ${escapeHtml(tr(it.unit || ''))}</div>`).join('');
              const totalQty = itemsList.reduce((acc, it) => acc + (it.quantity || 0), 0);
              return `
              <tr class="${p.status === 'Storno' ? 'storno-row' : ''}" style="border-bottom: 1px solid #f1f5f9; ${p.status === 'Storno' ? 'opacity: 0.6; background: #fff1f2;' : ''}">
                <td data-sort-value="${p.date}" style="padding: 12px 14px; white-space: nowrap;">${formatDate(p.date)}</td>
                <td data-sort-value="${escapeHtml(p.supplier_name)}" style="padding: 12px 14px; font-weight: 600;">${escapeHtml(p.supplier_name)}</td>
                ${showOmbor ? `<td data-sort-value="${escapeHtml(p.ombor || '')}" style="padding: 12px 14px;">${escapeHtml(p.ombor || (isUz ? 'Umumiy' : 'Общий'))}</td>` : ''}
                <td data-sort-value="${escapeHtml(itemsList.map(it => it.material_name).join(', '))}" style="padding: 12px 14px;"><div style="display: flex; flex-direction: column; gap: 3px;">${matCell}</div></td>
                <td data-sort-value="${totalQty}" style="padding: 12px 14px; text-align: right; font-weight: 700;"><div style="display: flex; flex-direction: column; gap: 3px;">${qtyCell}</div></td>
                <td data-sort-value="${p.status}" style="padding: 12px 14px;">
                  <span class="badge" style="background: ${p.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${p.status === 'Tasdiqlandi' ? '#166534' : '#991b1b'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                    ${tr(p.status)}
                  </span>
                </td>
                <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                  ${p.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-sm" onclick="PurchasesModule.stornoPurchase(${p.id}, ${jsArg(label)})" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                      ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
                  ${canDo('delete') ? `
                    <button class="btn btn-danger btn-sm" onclick="PurchasesModule.deletePurchase(${p.id}, ${jsArg(label)})" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">
                      ${isUz ? "O'chirish" : "Удалить"}
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

  // A purchase is who, what, how many and when. The price is the supplier's
  // price for that material in MDM, so none is asked or shown here.
  async openNewPurchaseModal() {
    const isUz = CURRENT_LANG === 'uz';
    const now = new Date();
    const z = n => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
    try {
      const [suppliers, whs] = await Promise.all([API.getCounterparties("supplier"), API.getMaterialWarehouses()]);
      this.suppliersList = suppliers;
      this.owners = whs.owners || [];
    } catch (e) {
      showToast(e.message, "error");
      return;
    }
    if (!this.suppliersList.length) {
      showToast(isUz ? "Avval MDM da yetkazib beruvchi qo'shing" : "Сначала добавьте поставщика в MDM", "warning");
      return;
    }
    this.supplierMaterials = [];
    const field = "width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px;";
    const label = "display: block; font-size: 14px; font-weight: 700; margin-bottom: 6px; color: #0f172a;";

    showModal(
      isUz ? "Yangi xarid" : "Новая закупка",
      `
        <form id="new-purchase-form" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="${label}">${isUz ? 'Kimdan *' : 'У кого *'}</label>
            <select id="pur-supplier" class="form-control" style="${field}" onchange="PurchasesModule.onSupplierChange()">
              <option value="">${isUz ? 'Yetkazib beruvchini tanlang' : 'Выберите поставщика'}</option>
              ${this.suppliersList.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
            </select>
          </div>
          ${this.owners.length > 1 ? `
          <div>
            <label style="${label}">${isUz ? 'Qaysi ombor uchun *' : 'Для какого склада *'}</label>
            <select id="pur-ombor" class="form-control" style="${field}">
              <option value="">${isUz ? 'Omborni tanlang' : 'Выберите склад'}</option>
              ${this.owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
            </select>
          </div>` : ''}
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="${label} margin-bottom: 0;">${isUz ? 'Nima va qancha *' : 'Что и сколько *'}</label>
              <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="PurchasesModule.addPurchaseItemRow()"
                title="${isUz ? 'Yana material' : 'Ещё материал'}" aria-label="${isUz ? 'Yana material' : 'Ещё материал'}">${uiIcon("plus")}</button>
            </div>
            <div id="pur-rows" style="display: flex; flex-direction: column; gap: 8px;"></div>
            <div id="pur-hint" style="font-size: 13px; color: #64748b; margin-top: 6px;">${isUz ? "Avval kimdan olinayotganini tanlang." : "Сначала выберите поставщика."}</div>
          </div>
          <div>
            <label style="${label}">${isUz ? 'Sana *' : 'Дата *'}</label>
            <input type="date" id="pur-date" class="form-control" value="${todayStr}" style="${field}" required />
          </div>
        </form>
      `,
      async () => {
        const supplierId = parseInt(document.getElementById("pur-supplier").value);
        const d = document.getElementById("pur-date").value;
        // One Ombor: it goes there without asking; several: the one chosen.
        const ombor = document.getElementById("pur-ombor") ? document.getElementById("pur-ombor").value : (PurchasesModule.owners[0] || "");
        if (!supplierId) {
          showToast(isUz ? "Kimdan olinayotganini tanlang" : "Выберите поставщика", "warning");
          return false;
        }
        if (!ombor) {
          showToast(isUz ? "Qaysi ombor uchun olinayotganini tanlang" : "Выберите склад", "warning");
          return false;
        }
        const items = [];
        for (const row of document.querySelectorAll("#pur-rows .pur-row")) {
          const materialId = parseInt(row.querySelector(".pur-mat").value);
          const qty = parseFloat(row.querySelector(".pur-qty").value);
          if (!materialId && qty > 0) {
            showToast(isUz ? "Materialni tanlang" : "Выберите материал", "warning");
            return false;
          }
          if (materialId && qty > 0) items.push({ material_id: materialId, quantity: qty });
        }
        if (!items.length) {
          showToast(isUz ? "Material va qanchaligini kiriting" : "Укажите материал и количество", "warning");
          return false;
        }
        try {
          await API.createPurchase({ supplier_id: supplierId, date: d, items, ombor });
          showToast(isUz ? "Xarid saqlandi, ombor qoldig'i yangilandi" : "Закупка сохранена, остатки обновлены", "success");
          await PurchasesModule.loadPurchases();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );
  },

  // The supplier's materials (from MDM) are what can be bought from them.
  async onSupplierChange() {
    const isUz = CURRENT_LANG === 'uz';
    const supplierId = parseInt(document.getElementById("pur-supplier").value);
    const rows = document.getElementById("pur-rows");
    const hint = document.getElementById("pur-hint");
    rows.innerHTML = "";
    this.supplierMaterials = [];
    if (!supplierId) {
      hint.textContent = isUz ? "Avval kimdan olinayotganini tanlang." : "Сначала выберите поставщика.";
      return;
    }
    try {
      this.supplierMaterials = await API.getSupplierPrices(supplierId);
    } catch (e) {
      showToast(e.message, "error");
      return;
    }
    if (!this.supplierMaterials.length) {
      hint.innerHTML = `<span style="color: #b91c1c; font-weight: 600;">${isUz
        ? "Bu yetkazib beruvchiga material biriktirilmagan. MDM > Yetkazib beruvchilar da material va narxini qo'shing."
        : "У поставщика нет материалов. Добавьте материалы и цены в MDM > Поставщики."}</span>`;
      return;
    }
    hint.textContent = "";
    this.addPurchaseItemRow();
  },

  addPurchaseItemRow() {
    const rows = document.getElementById("pur-rows");
    if (!rows) return;
    const isUz = CURRENT_LANG === 'uz';
    if (!(this.supplierMaterials || []).length) {
      showToast(isUz ? "Avval kimdan olinayotganini tanlang" : "Сначала выберите поставщика", "warning");
      return;
    }
    const field = "padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px;";
    const row = document.createElement("div");
    row.className = "pur-row";
    row.style.cssText = "display: grid; grid-template-columns: minmax(0, 1fr) 120px 34px; gap: 6px; align-items: center;";
    row.innerHTML = `
      <select class="form-control pur-mat" style="${field}" onchange="PurchasesModule.onMaterialChange(this)">
        ${this.supplierMaterials.length > 1 ? `<option value="">${isUz ? 'Materialni tanlang' : 'Выберите материал'}</option>` : ""}
        ${this.supplierMaterials.map(m => `<option value="${m.material_id}" data-unit="${escapeHtml(tr(m.unit))}">${escapeHtml(m.material_name)}</option>`).join("")}
      </select>
      <div style="position: relative;">
        <input type="number" class="form-control pur-qty" step="any" min="0.01" placeholder="${isUz ? 'Qancha' : 'Сколько'}" style="${field} width: 100%; padding-right: 38px;">
        <span class="pur-unit" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 13px; pointer-events: none;"></span>
      </div>
      <button type="button" class="btn btn-sm" onclick="this.closest('.pur-row').remove()" title="${isUz ? "O'chirish" : "Удалить"}"
        style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 8px 0; border-radius: 8px;">✕</button>`;
    rows.appendChild(row);
    this.onMaterialChange(row.querySelector(".pur-mat"));
  },

  onMaterialChange(select) {
    const opt = select.options[select.selectedIndex];
    const unit = select.closest(".pur-row").querySelector(".pur-unit");
    if (unit) unit.textContent = (opt && opt.dataset.unit) || "";
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
