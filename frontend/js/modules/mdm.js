const MdmModule = {
  currentTab: "materials",

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
<span>${t('mod_mdm_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              ${t('mod_mdm_sub')}
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="MdmModule.exportPdf()" style="display: flex; align-items: center; gap: 6px;">
<span>${t('btn_export_pdf')}</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="MdmModule.openCreateModal()" style="display: flex; align-items: center; gap: 6px;">
<span>${t('btn_create')}</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="tabs-nav" style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn ${this.currentTab === 'materials' ? 'active' : ''}" onclick="MdmModule.switchTab('materials')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'materials' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'materials' ? '#2563eb' : '#64748b'};">
            ${t('tab_materials')}
          </button>
          <button class="tab-btn ${this.currentTab === 'tayyor' ? 'active' : ''}" onclick="MdmModule.switchTab('tayyor')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'tayyor' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'tayyor' ? '#2563eb' : '#64748b'};">
            ${CURRENT_LANG === 'uz' ? "Tayyor mahsulot (Ombor)" : "Готовая продукция (Склад)"}
          </button>
          <button class="tab-btn ${this.currentTab === 'suppliers' ? 'active' : ''}" onclick="MdmModule.switchTab('suppliers')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'suppliers' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'suppliers' ? '#2563eb' : '#64748b'};">
            ${t('tab_suppliers')}
          </button>
          <button class="tab-btn ${this.currentTab === 'warehouses' ? 'active' : ''}" onclick="MdmModule.switchTab('warehouses')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'warehouses' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'warehouses' ? '#2563eb' : '#64748b'};">
            ${t('tab_warehouses')}
          </button>
        </div>

        <div id="mdm-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${t('msg_loading')}</div>
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  // Finished goods (tayyor mahsulot) are not kept in MDM: they are read live
  // from the Ombor, so sizes, stock and reservations always match it.
  async loadFinishedGoods(tableDiv) {
    const isUz = CURRENT_LANG === 'uz';
    try {
      const products = (await API.getOmborProducts()).products || [];
      tableDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:13px;">
          <span>${isUz ? "Tayyor mahsulotlar Ombordan olinadi. Yangi mahsulot Omborda «+ Kirim» orqali qo'shiladi."
                       : "Готовая продукция берётся со Склада. Новый товар добавляется на Складе через «+ Приход»."}</span>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('ombor')" style="padding:6px 12px;border-radius:7px;font-weight:600;">${isUz ? "Omborga o'tish" : "Перейти на склад"}</button>
        </div>
        <div class="table-container" style="overflow-x: auto;">
          <table class="data-table" id="mdm-finished-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, true)" style="padding: 12px 14px;">${isUz ? "Kod" : "Код"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${isUz ? "O'lcham" : "Размер"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${isUz ? "Ombor (egasi)" : "Склад (владелец)"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, true)" style="padding: 12px 14px; text-align:right;">Eni <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, true)" style="padding: 12px 14px; text-align:right;">${isUz ? "Omborda" : "На складе"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="padding: 12px 14px; text-align:right;">${isUz ? "Band (buyurtma)" : "Резерв"} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, true)" style="padding: 12px 14px; text-align:right;">${isUz ? "Bo'sh" : "Свободно"} <span class="sort-icon">↕</span></th>
              </tr>
              <tr class="filter-row">
                <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${isUz ? 'Kod...' : 'Код...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${isUz ? 'Ombor...' : 'Склад...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th></th><th></th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              ${products.length ? products.map(p => `
                <tr>
                  <td data-sort-value="${p.code}" style="padding: 12px 14px; font-weight:700;">${p.code}</td>
                  <td style="padding: 12px 14px;">${p.length} × ${p.width}</td>
                  <td style="padding: 12px 14px;">${escapeHtml(p.owner || "")}</td>
                  <td data-sort-value="${p.eni}" style="padding: 12px 14px; text-align:right;">${p.eni}</td>
                  <td data-sort-value="${p.quantity}" style="padding: 12px 14px; text-align:right; font-weight:700;">${formatNumber(p.quantity, 0, 0)}</td>
                  <td data-sort-value="${p.reserved}" style="padding: 12px 14px; text-align:right; color:${p.reserved ? '#a16207' : '#94a3b8'};">${formatNumber(p.reserved, 0, 0)}</td>
                  <td data-sort-value="${p.free}" style="padding: 12px 14px; text-align:right; font-weight:700; color:${p.free ? '#15803d' : '#b91c1c'};">${formatNumber(p.free, 0, 0)}</td>
                </tr>`).join("")
              : `<tr><td colspan="7" style="padding: 24px; text-align:center; color:#94a3b8;">${isUz ? "Omborda tayyor mahsulot yo'q" : "На складе нет готовой продукции"}</td></tr>`}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      tableDiv.innerHTML = `<div style="padding: 20px; color: #b91c1c;">${escapeHtml(e.message)}</div>`;
    }
  },

  async switchTab(tab) {
    this.currentTab = tab;
    const container = document.getElementById("module-container");
    if (container) await this.render(container);
  },

  async loadTabContent() {
    const tableDiv = document.getElementById("mdm-table-container");
    if (!tableDiv) return;

    if (this.currentTab === "tayyor") return this.loadFinishedGoods(tableDiv);

    try {
      if (this.currentTab === "materials") {
        // Finished tiles are managed in the Ombor (see the "Tayyor mahsulot" tab).
        const materials = (await API.getMaterials(null, true)).filter(m => m.category !== "Tayyor mahsulot");
        tableDiv.innerHTML = `
          <div class="table-container" style="overflow-x: auto;">
            <table class="data-table" id="mdm-materials-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_code')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${t('th_name')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${t('th_category')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 14px;">${t('th_unit')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 14px;">${t('th_status')} <span class="sort-icon">↕</span></th>
                  <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
                </tr>
                <tr class="filter-row">
                  <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${CURRENT_LANG === 'uz' ? 'Kod...' : 'Код...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${CURRENT_LANG === 'uz' ? 'Nom...' : 'Имя...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${CURRENT_LANG === 'uz' ? 'Kategoriya...' : 'Категория...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="${CURRENT_LANG === 'uz' ? 'Birlik...' : 'Ед...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${materials.map(m => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td data-sort-value="${m.code}" style="padding: 12px 14px;"><code>${m.code}</code></td>
                    <td data-sort-value="${m.name}" style="padding: 12px 14px;"><strong>${m.name}</strong></td>
                    <td data-sort-value="${m.category}" style="padding: 12px 14px;"><span class="badge" style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${tr(m.category)}</span></td>
                    <td data-sort-value="${m.unit}" style="padding: 12px 14px;">${tr(m.unit)}</td>
                    <td data-sort-value="${m.is_archived ? 'Arxiv' : 'Faol'}" style="padding: 12px 14px;"><span class="badge" style="background: ${m.is_archived ? '#fef2f2' : '#dcfce7'}; color: ${m.is_archived ? '#dc2626' : '#166534'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${tr(m.is_archived ? 'Arxiv' : 'Faol')}</span></td>
                    <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editMaterial(${m.id})" title="${t('btn_edit')}">${CURRENT_LANG === 'uz' ? "Tahrirlash" : "Изменить"}</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveMaterial(${m.id})" title="${t('btn_archive')}">${m.is_archived ? (CURRENT_LANG === 'uz' ? 'Tiklash' : 'Восстановить') : (CURRENT_LANG === 'uz' ? 'Arxivlash' : 'В архив')}</button>
                      ${CURRENT_ROLE === 'Admin' ? `<button class="btn btn-danger btn-sm" onclick="MdmModule.deleteMaterial(${m.id})" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>` : ''}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      } else if (this.currentTab === "clients" || this.currentTab === "suppliers") {
        const type = this.currentTab === "clients" ? "client" : "supplier";
        const cps = await API.getCounterparties(type, null, true);
        tableDiv.innerHTML = `
          <div class="table-container" style="overflow-x: auto;">
            <table class="data-table" id="mdm-counterparties-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 14px;">${t('th_code')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 14px;">${t('th_name')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 14px;">${t('th_region')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 14px;">${t('th_resident')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 14px;">${t('th_phone')} <span class="sort-icon">↕</span></th>
                  <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)" style="padding: 12px 14px;">${t('th_status')} <span class="sort-icon">↕</span></th>
                  <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
                </tr>
                <tr class="filter-row">
                  <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${CURRENT_LANG === 'uz' ? 'Kod...' : 'Код...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${CURRENT_LANG === 'uz' ? 'Nom...' : 'Имя...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${CURRENT_LANG === 'uz' ? 'Viloyat...' : 'Регион...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="${CURRENT_LANG === 'uz' ? 'Rezident...' : 'Резидент...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="${CURRENT_LANG === 'uz' ? 'Tel...' : 'Тел...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th><input type="text" class="table-col-filter" data-col-idx="5" placeholder="${CURRENT_LANG === 'uz' ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${cps.map(cp => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td data-sort-value="${cp.code}" style="padding: 12px 14px;"><code>${cp.code}</code></td>
                    <td data-sort-value="${cp.name}" style="padding: 12px 14px;"><strong>${cp.name}</strong></td>
                    <td data-sort-value="${cp.region || ''}" style="padding: 12px 14px;">${cp.region || '-'}</td>
                    <td data-sort-value="${cp.is_resident ? 'Rezident' : 'Norezident'}" style="padding: 12px 14px;"><span class="badge" style="background: ${cp.is_resident ? '#dcfce7' : '#fef3c7'}; color: ${cp.is_resident ? '#166534' : '#b45309'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${tr(cp.is_resident ? 'Rezident' : 'Norezident')}</span></td>
                    <td data-sort-value="${cp.phone || ''}" style="padding: 12px 14px;">${cp.phone || '-'}</td>
                    <td data-sort-value="${cp.is_archived ? 'Arxiv' : 'Faol'}" style="padding: 12px 14px;"><span class="badge" style="background: ${cp.is_archived ? '#fef2f2' : '#dcfce7'}; color: ${cp.is_archived ? '#dc2626' : '#166534'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${tr(cp.is_archived ? 'Arxiv' : 'Faol')}</span></td>
                    <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editCounterparty(${cp.id})" title="${t('btn_edit')}">${CURRENT_LANG === 'uz' ? "Tahrirlash" : "Изменить"}</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveCp(${cp.id})" title="${t('btn_archive')}">${cp.is_archived ? (CURRENT_LANG === 'uz' ? 'Tiklash' : 'Восстановить') : (CURRENT_LANG === 'uz' ? 'Arxivlash' : 'В архив')}</button>
                      ${CURRENT_ROLE === 'Admin' ? `<button class="btn btn-danger btn-sm" onclick="MdmModule.deleteCounterparty(${cp.id})" title="O'chirish" style="padding: 4px 8px; font-size: 12px; margin-left: 4px;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>` : ''}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      } else if (this.currentTab === "warehouses") {
        // The 4 owner warehouses of the Ombor. Raw-material stores are in "Xomashyo ombori".
        const isUz = CURRENT_LANG === 'uz';
        const res = await API.getSkladWarehouses();
        const whs = res.warehouses || [];
        const pcs = isUz ? 'dona' : 'шт';
        tableDiv.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px;">
            ${renderSkladOwnerCards(whs)}
          </div>
          <div class="table-container" style="overflow-x: auto;">
            <table class="data-table" id="mdm-warehouses-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr>
                  <th>${isUz ? 'Ombor' : 'Склад'}</th>
                  <th>${isUz ? 'Eni' : 'Ширина'}</th>
                  <th style="text-align:right;">${isUz ? 'Miqdor' : 'Кол-во'}</th>
                  <th style="text-align:right;">${isUz ? 'Umumiy uzunlik' : 'Общая длина'}</th>
                  <th style="text-align:right;">${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${whs.map(w => `
                  <tr>
                    <td><strong>${escapeHtml(w.name)}</strong></td>
                    <td>${w.eni}</td>
                    <td style="text-align:right;">${formatNumber(w.total_qty, 0, 0)} ${pcs}</td>
                    <td style="text-align:right;">${formatNumber(w.total_metres, 0, 1)} ${isUz ? 'metr' : 'м'}</td>
                    <td style="text-align:right;"><button class="btn btn-secondary btn-sm" onclick="openSkladOwner(${w.sklad_id})">${isUz ? "Ochish" : "Открыть"}</button></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (e) {
      tableDiv.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">${t('msg_error')} ${e.message}</div>`;
      showToast(e.message, "error");
    }
  },

  openCreateModal() {
    // Ombor stock (finished tiles, by owner) is added by Kirim in the Ombor.
    if (this.currentTab === "tayyor" || this.currentTab === "warehouses") {
      // Finished goods are whatever the Ombor holds; they are added by Kirim there.
      navigateTo("ombor");
      return;
    }
    if (this.currentTab === "materials") {
      showModal(
        CURRENT_LANG === 'uz' ? "Yangi material / mahsulot yaratish" : "Создать новый материал / товар",
        `
          <form id="create-material-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_code')} (Takrorlanmas / Unikal) *</label>
              <input type="text" id="mat-code" class="form-control" placeholder="Masalan: Smt60, Tile60, Kao01" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} *</label>
              <input type="text" id="mat-name" class="form-control" placeholder="Masalan: Siment 60%, Kafel 60x60 Marmar" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_category')}</label>
                <select id="mat-category" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="Xomashyo">${CURRENT_LANG === 'uz' ? 'Xomashyo' : 'Сырье'}</option>
                  <option value="Ehtiyot qism">${CURRENT_LANG === 'uz' ? 'Ehtiyot qism' : 'Запчасти'}</option>
                  <option value="Yordamchi">${CURRENT_LANG === 'uz' ? 'Yordamchi material' : 'Вспомогательные материалы'}</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_unit')}</label>
                <select id="mat-unit" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="kg">${CURRENT_LANG === 'uz' ? 'kg' : 'кг'}</option>
                  <option value="m2">${CURRENT_LANG === 'uz' ? 'm²' : 'м²'}</option>
                  <option value="dona">${CURRENT_LANG === 'uz' ? 'dona' : 'шт'}</option>
                  <option value="l">${CURRENT_LANG === 'uz' ? 'l' : 'л'}</option>
                  <option value="t">${CURRENT_LANG === 'uz' ? 't' : 'т'}</option>
                  <option value="rul">${CURRENT_LANG === 'uz' ? 'rul' : 'рул'}</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${CURRENT_LANG === 'uz' ? 'Minimal qoldiq (Min Stock)' : 'Минимальный остаток (Мин. запас)'}</label>
              <input type="number" step="any" id="mat-min-stock" class="form-control" value="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
              <textarea id="mat-desc" class="form-control" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;"></textarea>
            </div>
          </form>
        `,
        async () => {
          const code = document.getElementById("mat-code").value.trim();
          const name = document.getElementById("mat-name").value.trim();
          const category = document.getElementById("mat-category").value;
          const unit = document.getElementById("mat-unit").value;
          const minStock = parseFloat(document.getElementById("mat-min-stock").value) || 0;
          const desc = document.getElementById("mat-desc").value;

          if (!code || !name) {
            showToast(CURRENT_LANG === 'uz' ? "Kod va nom kiritilishi shart!" : "Код и наименование обязательны!", "warning");
            return false;
          }

          try {
            await API.createMaterial({
              code, name, category, unit, min_stock: minStock, description: desc
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    } else if (this.currentTab === "warehouses") {
      showModal(
        CURRENT_LANG === 'uz' ? "Yangi ombor (sklad) yaratish" : "Создать новый склад",
        `
          <form id="create-wh-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_code')} *</label>
              <input type="text" id="wh-code" class="form-control" placeholder="Masalan: WH-04, WH-QOP" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} *</label>
              <input type="text" id="wh-name" class="form-control" placeholder="Masalan: Qadoqlash ombori" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
              <textarea id="wh-desc" class="form-control" rows="2" placeholder="Ombor tavsifi..." style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;"></textarea>
            </div>
          </form>
        `,
        async () => {
          const code = document.getElementById("wh-code").value.trim();
          const name = document.getElementById("wh-name").value.trim();
          const desc = document.getElementById("wh-desc").value;

          if (!code || !name) {
            showToast(CURRENT_LANG === 'uz' ? "Kod va nom kiritilishi shart!" : "Код и наименование обязательны!", "warning");
            return false;
          }

          try {
            await API.createWarehouse({
              code, name, description: desc, is_system_default: false
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    } else {
      const type = this.currentTab === "clients" ? "client" : "supplier";
      const typeName = type === "client" ? (CURRENT_LANG === 'uz' ? "Mijoz" : "Клиент") : (CURRENT_LANG === 'uz' ? "Yetkazib beruvchi" : "Поставщик");
      
      const regions = [
        "Toshkent shahri", "Toshkent viloyati", "Samarqand", "Andijon",
        "Farg'ona", "Namangan", "Buxoro", "Navoiy", "Qashqadaryo",
        "Surxondaryo", "Xorazm", "Jizzax", "Sirdaryo", "Qoraqalpog'iston Resp."
      ];

      showModal(
        `${typeName} ${CURRENT_LANG === 'uz' ? 'yaratish' : 'создать'}`,
        `
          <form id="create-cp-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} / Kompaniya nomi *</label>
              <input type="text" id="cp-name" class="form-control" placeholder="Masalan: Bekobod Sement MCHJ" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_region')}</label>
                <select id="cp-region" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  ${regions.map(r => `<option value="${r}">${r}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_resident')}</label>
                <select id="cp-resident" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="true">${CURRENT_LANG === 'uz' ? "Rezident (O'zbekiston)" : "Резидент (Узбекистан)"}</option>
                  <option value="false">${CURRENT_LANG === 'uz' ? "Norezident (Xorijiy)" : "Нерезидент (Иностранный)"}</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_phone')}</label>
                <input type="text" id="cp-phone" class="form-control" placeholder="+998901234567" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_init_bal')} ($)</label>
                <input type="number" step="any" data-signed id="cp-init-bal" class="form-control" value="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
            </div>
          </form>
        `,
        async () => {
          const name = document.getElementById("cp-name").value.trim();
          const region = document.getElementById("cp-region").value;
          const isResident = document.getElementById("cp-resident").value === "true";
          const phone = document.getElementById("cp-phone").value.trim();
          const initBal = parseFloat(document.getElementById("cp-init-bal").value) || 0;

          if (!name) {
            showToast(CURRENT_LANG === 'uz' ? "Nom kiritilishi shart!" : "Наименование обязательно!", "warning");
            return false;
          }

          try {
            await API.createCounterparty({
              name,
              type,
              region,
              is_resident: isResident,
              phone,
              initial_balance_usd: initBal,
              initial_balance_uzs: 0
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    }
  },

  async editMaterial(id) {
    try {
      const materials = await API.getMaterials(null, true);
      const mat = materials.find(m => m.id === id);
      if (!mat) return;

      showModal(
        `${t('btn_edit')}: ${mat.name}`,
        `
          <form id="edit-material-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_code')} *</label>
              <input type="text" id="edit-mat-code" class="form-control" value="${mat.code}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} *</label>
              <input type="text" id="edit-mat-name" class="form-control" value="${mat.name}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_category')}</label>
                <select id="edit-mat-category" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="Xomashyo" ${mat.category === 'Xomashyo' || mat.category === 'Siryo' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Xomashyo' : 'Сырье'}</option>
                  <option value="Tayyor mahsulot" ${mat.category === 'Tayyor mahsulot' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Tayyor mahsulot' : 'Готовая продукция'}</option>
                  <option value="Ehtiyot qism" ${mat.category === 'Ehtiyot qism' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Ehtiyot qism' : 'Запчасти'}</option>
                  <option value="Yordamchi" ${mat.category === 'Yordamchi' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Yordamchi material' : 'Вспомогательные материалы'}</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_unit')}</label>
                <select id="edit-mat-unit" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="kg" ${mat.unit === 'kg' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'kg' : 'кг'}</option>
                  <option value="m2" ${mat.unit === 'm2' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'm²' : 'м²'}</option>
                  <option value="dona" ${mat.unit === 'dona' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'dona' : 'шт'}</option>
                  <option value="l" ${mat.unit === 'l' || mat.unit === 'litr' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'l' : 'л'}</option>
                  <option value="t" ${mat.unit === 't' || mat.unit === 'tonna' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 't' : 'т'}</option>
                  <option value="rul" ${mat.unit === 'rul' || mat.unit === 'ru' || mat.unit === 'рулон' ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'rul' : 'рул'}</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${CURRENT_LANG === 'uz' ? 'Minimal qoldiq' : 'Минимальный остаток'}</label>
              <input type="number" step="any" id="edit-mat-min-stock" class="form-control" value="${mat.min_stock || 0}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
              <textarea id="edit-mat-desc" class="form-control" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">${mat.description || ''}</textarea>
            </div>
          </form>
        `,
        async () => {
          const code = document.getElementById("edit-mat-code").value.trim();
          const name = document.getElementById("edit-mat-name").value.trim();
          const category = document.getElementById("edit-mat-category").value;
          const unit = document.getElementById("edit-mat-unit").value;
          const minStock = parseFloat(document.getElementById("edit-mat-min-stock").value) || 0;
          const desc = document.getElementById("edit-mat-desc").value;

          if (!code || !name) {
            showToast(CURRENT_LANG === 'uz' ? "Kod va nom kiritilishi shart!" : "Код и наименование обязательны!", "warning");
            return false;
          }

          try {
            await API.updateMaterial(id, {
              code, name, category, unit, min_stock: minStock, description: desc
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async editCounterparty(id) {
    try {
      const type = this.currentTab === "clients" ? "client" : "supplier";
      const cps = await API.getCounterparties(type, null, true);
      const cp = cps.find(c => c.id === id);
      if (!cp) return;

      const regions = [
        "Toshkent shahri", "Toshkent viloyati", "Samarqand", "Andijon",
        "Farg'ona", "Namangan", "Buxoro", "Navoiy", "Qashqadaryo",
        "Surxondaryo", "Xorazm", "Jizzax", "Sirdaryo", "Qoraqalpog'iston Resp."
      ];

      showModal(
        `${t('btn_edit')}: ${cp.name}`,
        `
          <form id="edit-cp-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_code')} *</label>
              <input type="text" id="edit-cp-code" class="form-control" value="${cp.code}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} *</label>
              <input type="text" id="edit-cp-name" class="form-control" value="${cp.name}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_region')}</label>
                <select id="edit-cp-region" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  ${regions.map(r => `<option value="${r}" ${cp.region === r ? 'selected' : ''}>${r}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_resident')}</label>
                <select id="edit-cp-resident" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="true" ${cp.is_resident ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Rezident' : 'Резидент'}</option>
                  <option value="false" ${!cp.is_resident ? 'selected' : ''}>${CURRENT_LANG === 'uz' ? 'Norezident' : 'Нерезидент'}</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_phone')}</label>
              <input type="text" id="edit-cp-phone" class="form-control" value="${cp.phone || ''}" placeholder="+998901234567" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
          </form>
        `,
        async () => {
          const code = document.getElementById("edit-cp-code").value.trim();
          const name = document.getElementById("edit-cp-name").value.trim();
          const region = document.getElementById("edit-cp-region").value;
          const isResident = document.getElementById("edit-cp-resident").value === "true";
          const phone = document.getElementById("edit-cp-phone").value.trim();

          if (!code || !name) {
            showToast(CURRENT_LANG === 'uz' ? "Kod va nom kiritilishi shart!" : "Код и наименование обязательны!", "warning");
            return false;
          }

          try {
            await API.updateCounterparty(id, {
              code, name, region, is_resident: isResident, phone
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async editWarehouse(id) {
    try {
      const warehouses = await API.getWarehouses();
      const wh = warehouses.find(w => w.id === id);
      if (!wh) return;

      showModal(
        `${t('btn_edit')}: ${tr(wh.name)}`,
        `
          <form id="edit-wh-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_code')} *</label>
              <input type="text" id="edit-wh-code" class="form-control" value="${wh.code}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} *</label>
              <input type="text" id="edit-wh-name" class="form-control" value="${wh.name}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
              <textarea id="edit-wh-desc" class="form-control" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">${wh.description || ''}</textarea>
            </div>
          </form>
        `,
        async () => {
          const code = document.getElementById("edit-wh-code").value.trim();
          const name = document.getElementById("edit-wh-name").value.trim();
          const desc = document.getElementById("edit-wh-desc").value;

          if (!code || !name) {
            showToast(CURRENT_LANG === 'uz' ? "Kod va nom kiritilishi shart!" : "Код и наименование обязательны!", "warning");
            return false;
          }

          try {
            await API.updateWarehouse(id, {
              code, name, description: desc
            });
            showToast(t('msg_saved'), "success");
            await MdmModule.loadTabContent();
            return true;
          } catch (err) {
            showToast(err.message, "error");
            return false;
          }
        }
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteWarehouse(id) {
    if (!confirm(CURRENT_LANG === 'uz' ? "Ushbu omborni o'chirishga ishonchingiz komilmi?" : "Вы уверены, что хотите удалить этот склад?")) return;
    try {
      await API.deleteWarehouse(id);
      showToast(CURRENT_LANG === 'uz' ? "Ombor o'chirildi!" : "Склад удален!", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async toggleArchiveMaterial(id) {
    try {
      await API.archiveMaterial(id);
      showToast(CURRENT_LANG === 'uz' ? "Material holati o'zgartirildi" : "Статус материала изменен", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async toggleArchiveCp(id) {
    try {
      await API.archiveCounterparty(id);
      showToast(CURRENT_LANG === 'uz' ? "Kontragent holati o'zgartirildi" : "Статус контрагента изменен", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteMaterial(id) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? "Ushbu materialni butunlay o'chirishni tasdiqlaysizmi?" : "Удалить этот материал навсегда?")) return;
    try {
      await API.deleteMaterial(id);
      showToast(isUz ? "Material o'chirildi" : "Материал удален", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async deleteCounterparty(id) {
    const isUz = CURRENT_LANG === 'uz';
    if (!confirm(isUz ? "Ushbu kontragentni butunlay o'chirishni tasdiqlaysizmi?" : "Удалить этого контрагента навсегда?")) return;
    try {
      await API.deleteCounterparty(id);
      showToast(isUz ? "Kontragent o'chirildi" : "Контрагент удален", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  exportPdf() {
    const filename = `spravochnik_${this.currentTab}`;
    exportTableToPdf(null, filename);
  }
};
