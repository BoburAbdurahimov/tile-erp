const MdmModule = {
  currentTab: "materials",

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>🗂️</span> <span>${t('mod_mdm_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              Materiallar, xomashyolar, mijozlar va ta'minotchilar spravochnigi
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="MdmModule.exportExcel()" style="display: flex; align-items: center; gap: 6px;">
              <span>📥</span> <span>${t('btn_export_excel')}</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="MdmModule.openCreateModal()" style="display: flex; align-items: center; gap: 6px;">
              <span>➕</span> <span>${t('btn_create')}</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="tabs-nav" style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn ${this.currentTab === 'materials' ? 'active' : ''}" onclick="MdmModule.switchTab('materials')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'materials' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'materials' ? '#2563eb' : '#64748b'};">
            🧱 ${CURRENT_LANG === 'uz' ? 'Materiallar & Mahsulotlar' : 'Материалы и Сырье'}
          </button>
          <button class="tab-btn ${this.currentTab === 'clients' ? 'active' : ''}" onclick="MdmModule.switchTab('clients')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'clients' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'clients' ? '#2563eb' : '#64748b'};">
            👤 ${CURRENT_LANG === 'uz' ? 'Mijozlar (20000+)' : 'Клиенты (20000+)'}
          </button>
          <button class="tab-btn ${this.currentTab === 'suppliers' ? 'active' : ''}" onclick="MdmModule.switchTab('suppliers')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'suppliers' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'suppliers' ? '#2563eb' : '#64748b'};">
            🚚 ${CURRENT_LANG === 'uz' ? 'Postavshiklar (10000+)' : 'Поставщики (10000+)'}
          </button>
          <button class="tab-btn ${this.currentTab === 'warehouses' ? 'active' : ''}" onclick="MdmModule.switchTab('warehouses')" style="padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${this.currentTab === 'warehouses' ? '#2563eb' : 'transparent'}; color: ${this.currentTab === 'warehouses' ? '#2563eb' : '#64748b'};">
            🏢 ${CURRENT_LANG === 'uz' ? 'Skladlar' : 'Склады'}
          </button>
        </div>

        <div id="mdm-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  async switchTab(tab) {
    this.currentTab = tab;
    const container = document.getElementById("module-container");
    if (container) await this.render(container);
  },

  async loadTabContent() {
    const tableDiv = document.getElementById("mdm-table-container");
    if (!tableDiv) return;

    try {
      if (this.currentTab === "materials") {
        const materials = await API.getMaterials(null, true);
        tableDiv.innerHTML = `
          <div class="table-container" style="overflow-x: auto;">
            <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
                  <th style="padding: 12px 14px;">${t('th_code')}</th>
                  <th style="padding: 12px 14px;">${t('th_name')}</th>
                  <th style="padding: 12px 14px;">${t('th_category')}</th>
                  <th style="padding: 12px 14px;">${t('th_unit')}</th>
                  <th style="padding: 12px 14px;">Min Qoldiq</th>
                  <th style="padding: 12px 14px;">AVG Tannarx ($)</th>
                  <th style="padding: 12px 14px;">${t('th_status')}</th>
                  <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${materials.map(m => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px 14px;"><code>${m.code}</code></td>
                    <td style="padding: 12px 14px;"><strong>${m.name}</strong></td>
                    <td style="padding: 12px 14px;"><span class="badge" style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${m.category}</span></td>
                    <td style="padding: 12px 14px;">${m.unit}</td>
                    <td style="padding: 12px 14px;">${m.min_stock || 0}</td>
                    <td style="padding: 12px 14px;">$${(m.current_avg_price_usd || 0).toFixed(4)}</td>
                    <td style="padding: 12px 14px;"><span class="badge" style="background: ${m.is_archived ? '#fef2f2' : '#dcfce7'}; color: ${m.is_archived ? '#dc2626' : '#166534'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${m.is_archived ? t('btn_archive') : 'Faol'}</span></td>
                    <td style="padding: 12px 14px; text-align: right;">
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editMaterial(${m.id})" title="Tahrirlash">✏️</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveMaterial(${m.id})" title="Arxiv/Faol">${m.is_archived ? '♻️' : '📁'}</button>
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
            <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
                  <th style="padding: 12px 14px;">${t('th_code')}</th>
                  <th style="padding: 12px 14px;">${t('th_name')}</th>
                  <th style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Viloyat' : 'Регион'}</th>
                  <th style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? 'Rezident' : 'Резидент'}</th>
                  <th style="padding: 12px 14px;">Telefon</th>
                  <th style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? "Boshlang'ich ($)" : 'Нач. баланс ($)'}</th>
                  <th style="padding: 12px 14px;">${CURRENT_LANG === 'uz' ? "Joriy balans ($)" : 'Тек. баланс ($)'}</th>
                  <th style="padding: 12px 14px;">${t('th_status')}</th>
                  <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${cps.map(cp => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px 14px;"><code>${cp.code}</code></td>
                    <td style="padding: 12px 14px;"><strong>${cp.name}</strong></td>
                    <td style="padding: 12px 14px;">${cp.region || '-'}</td>
                    <td style="padding: 12px 14px;"><span class="badge" style="background: ${cp.is_resident ? '#dcfce7' : '#fef3c7'}; color: ${cp.is_resident ? '#166534' : '#b45309'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${cp.is_resident ? 'Rezident' : 'Norezident'}</span></td>
                    <td style="padding: 12px 14px;">${cp.phone || '-'}</td>
                    <td style="padding: 12px 14px;">$${(cp.initial_balance_usd || 0).toLocaleString()}</td>
                    <td style="padding: 12px 14px;"><strong style="color: ${(cp.current_balance_usd || 0) >= 0 ? '#10b981' : '#ef4444'};">$${(cp.current_balance_usd || 0).toLocaleString()}</strong></td>
                    <td style="padding: 12px 14px;"><span class="badge" style="background: ${cp.is_archived ? '#fef2f2' : '#dcfce7'}; color: ${cp.is_archived ? '#dc2626' : '#166534'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${cp.is_archived ? 'Arxiv' : 'Faol'}</span></td>
                    <td style="padding: 12px 14px; text-align: right;">
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editCounterparty(${cp.id})" title="Tahrirlash">✏️</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveCp(${cp.id})" title="Arxiv/Faol">${cp.is_archived ? '♻️' : '📁'}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      } else if (this.currentTab === "warehouses") {
        const warehouses = await API.getWarehouses();
        tableDiv.innerHTML = `
          <div class="table-container" style="overflow-x: auto;">
            <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
                  <th style="padding: 12px 14px;">ID</th>
                  <th style="padding: 12px 14px;">${t('th_code')}</th>
                  <th style="padding: 12px 14px;">${t('th_name')}</th>
                  <th style="padding: 12px 14px;">Turi</th>
                  <th style="padding: 12px 14px;">${t('th_description')}</th>
                </tr>
              </thead>
              <tbody>
                ${warehouses.map(w => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px 14px;">${w.id}</td>
                    <td style="padding: 12px 14px;"><code>${w.code}</code></td>
                    <td style="padding: 12px 14px;"><strong>${w.name}</strong></td>
                    <td style="padding: 12px 14px;"><span class="badge" style="background: #f0fdf4; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${w.is_system_default ? 'Standart Tizim Skladi' : "Qo'shimcha"}</span></td>
                    <td style="padding: 12px 14px;">${w.description || '-'}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (e) {
      tableDiv.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Xatolik: ${e.message}</div>`;
      showToast(e.message, "error");
    }
  },

  openCreateModal() {
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
                  <option value="Siryo">Siryo / Xomashyo</option>
                  <option value="Tayyor mahsulot">Tayyor mahsulot</option>
                  <option value="Ehtiyot qism">Ehtiyot qism</option>
                  <option value="Yordamchi">Yordamchi material</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_unit')}</label>
                <select id="mat-unit" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="kg">kg</option>
                  <option value="m2">m²</option>
                  <option value="dona">dona</option>
                  <option value="litr">litr</option>
                  <option value="tonna">tonna</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Minimal qoldiq (Min Stock)</label>
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
            showToast("Kod va nom kiritilishi shart!", "warning");
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
    } else {
      const type = this.currentTab === "clients" ? "client" : "supplier";
      const typeName = type === "client" ? (CURRENT_LANG === 'uz' ? "Mijoz (20000+)" : "Клиент (20000+)") : (CURRENT_LANG === 'uz' ? "Postavshik (10000+)" : "Поставщик (10000+)");
      
      const regions = [
        "Toshkent shahri", "Toshkent viloyati", "Samarqand", "Andijon",
        "Farg'ona", "Namangan", "Buxoro", "Navoiy", "Qashqadaryo",
        "Surxondaryo", "Xorazm", "Jizzax", "Sirdaryo", "Qoraqalpog'iston Resp."
      ];

      showModal(
        `${typeName} yaratish`,
        `
          <form id="create-cp-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_name')} / Kompaniya nomi *</label>
              <input type="text" id="cp-name" class="form-control" placeholder="Masalan: Bekobod Sement MCHJ" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Viloyat / Hudud</label>
                <select id="cp-region" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  ${regions.map(r => `<option value="${r}">${r}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Rezidentlik holati</label>
                <select id="cp-resident" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="true">Rezident (O'zbekiston)</option>
                  <option value="false">Norezident (Xorijiy)</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Telefon</label>
                <input type="text" id="cp-phone" class="form-control" placeholder="+998901234567" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Boshlang'ich balans ($)</label>
                <input type="number" step="any" id="cp-init-bal" class="form-control" value="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
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
            showToast("Nom kiritilishi shart!", "warning");
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
        `Tahrirlash: ${mat.name}`,
        `
          <form id="edit-material-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Nomi *</label>
              <input type="text" id="edit-mat-name" class="form-control" value="${mat.name}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Kategoriya</label>
                <select id="edit-mat-category" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="Siryo" ${mat.category === 'Siryo' ? 'selected' : ''}>Siryo / Xomashyo</option>
                  <option value="Tayyor mahsulot" ${mat.category === 'Tayyor mahsulot' ? 'selected' : ''}>Tayyor mahsulot</option>
                  <option value="Ehtiyot qism" ${mat.category === 'Ehtiyot qism' ? 'selected' : ''}>Ehtiyot qism</option>
                  <option value="Yordamchi" ${mat.category === 'Yordamchi' ? 'selected' : ''}>Yordamchi material</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">O'lchov birligi</label>
                <select id="edit-mat-unit" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="kg" ${mat.unit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="m2" ${mat.unit === 'm2' ? 'selected' : ''}>m²</option>
                  <option value="dona" ${mat.unit === 'dona' ? 'selected' : ''}>dona</option>
                  <option value="litr" ${mat.unit === 'litr' ? 'selected' : ''}>litr</option>
                  <option value="tonna" ${mat.unit === 'tonna' ? 'selected' : ''}>tonna</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Minimal qoldiq</label>
              <input type="number" step="any" id="edit-mat-min-stock" class="form-control" value="${mat.min_stock || 0}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Tavsif</label>
              <textarea id="edit-mat-desc" class="form-control" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">${mat.description || ''}</textarea>
            </div>
          </form>
        `,
        async () => {
          const name = document.getElementById("edit-mat-name").value.trim();
          const category = document.getElementById("edit-mat-category").value;
          const unit = document.getElementById("edit-mat-unit").value;
          const minStock = parseFloat(document.getElementById("edit-mat-min-stock").value) || 0;
          const desc = document.getElementById("edit-mat-desc").value;

          if (!name) {
            showToast("Nom kiritilishi shart!", "warning");
            return false;
          }

          try {
            await API.updateMaterial(id, {
              name, category, unit, min_stock: minStock, description: desc
            });
            showToast("Material ma'lumotlari yangilandi!", "success");
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
        `Tahrirlash: ${cp.name}`,
        `
          <form id="edit-cp-form">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Nomi *</label>
              <input type="text" id="edit-cp-name" class="form-control" value="${cp.name}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Viloyat</label>
                <select id="edit-cp-region" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  ${regions.map(r => `<option value="${r}" ${cp.region === r ? 'selected' : ''}>${r}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Rezidentlik</label>
                <select id="edit-cp-resident" class="form-control" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                  <option value="true" ${cp.is_resident ? 'selected' : ''}>Rezident</option>
                  <option value="false" ${!cp.is_resident ? 'selected' : ''}>Norezident</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Telefon</label>
              <input type="text" id="edit-cp-phone" class="form-control" value="${cp.phone || ''}" placeholder="+998901234567" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>
          </form>
        `,
        async () => {
          const name = document.getElementById("edit-cp-name").value.trim();
          const region = document.getElementById("edit-cp-region").value;
          const isResident = document.getElementById("edit-cp-resident").value === "true";
          const phone = document.getElementById("edit-cp-phone").value.trim();

          if (!name) {
            showToast("Nom kiritilishi shart!", "warning");
            return false;
          }

          try {
            await API.updateCounterparty(id, {
              name, region, is_resident: isResident, phone
            });
            showToast("Kontragent ma'lumotlari yangilandi!", "success");
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

  async toggleArchiveMaterial(id) {
    try {
      await API.archiveMaterial(id);
      showToast("Material holati o'zgartirildi", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async toggleArchiveCp(id) {
    try {
      await API.archiveCounterparty(id);
      showToast("Kontragent holati o'zgartirildi", "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  exportExcel() {
    let entity = "materials";
    if (this.currentTab === "clients") entity = "clients";
    if (this.currentTab === "suppliers") entity = "suppliers";
    window.open(`/api/mdm/export/excel?entity=${entity}`, "_blank");
  }
};
