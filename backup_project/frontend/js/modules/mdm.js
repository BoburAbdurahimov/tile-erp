const MdmModule = {
  currentTab: "materials",

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🗂️ ${t('mod_mdm_title')}</div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="MdmModule.exportExcel()">📥 ${t('btn_export_excel')}</button>
            <button class="btn btn-primary btn-sm" onclick="MdmModule.openCreateModal()">➕ ${t('btn_create')}</button>
          </div>
        </div>

        <div class="tabs-nav">
          <button class="tab-btn ${this.currentTab === 'materials' ? 'active' : ''}" onclick="MdmModule.switchTab('materials')">🧱 ${CURRENT_LANG === 'uz' ? 'Materiallar & Mahsulotlar' : 'Материалы и Сырье'}</button>
          <button class="tab-btn ${this.currentTab === 'clients' ? 'active' : ''}" onclick="MdmModule.switchTab('clients')">👤 ${CURRENT_LANG === 'uz' ? 'Mijozlar (20000+)' : 'Клиенты (20000+)'}</button>
          <button class="tab-btn ${this.currentTab === 'suppliers' ? 'active' : ''}" onclick="MdmModule.switchTab('suppliers')">🚚 ${CURRENT_LANG === 'uz' ? "Postavshiklar (10000+)" : 'Поставщики (10000+)'}</button>
          <button class="tab-btn ${this.currentTab === 'warehouses' ? 'active' : ''}" onclick="MdmModule.switchTab('warehouses')">🏢 ${CURRENT_LANG === 'uz' ? 'Skladlar' : 'Склады'}</button>
          <button class="tab-btn ${this.currentTab === 'users' ? 'active' : ''}" onclick="MdmModule.switchTab('users')">📱 ${CURRENT_LANG === 'uz' ? 'Telegram Foydalanuvchilar & Rollar' : 'Пользователи Telegram и Роли'}</button>
        </div>

        <div id="mdm-table-container">
          <div style="text-align: center; padding: 30px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  async switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(b => b.getAttribute("onclick").includes(tab));
    if (activeBtn) activeBtn.classList.add("active");
    await this.loadTabContent();
  },

  async loadTabContent() {
    const tableDiv = document.getElementById("mdm-table-container");
    if (!tableDiv) return;

    try {
      if (this.currentTab === "materials") {
        const materials = await API.getMaterials(null, true);
        tableDiv.innerHTML = `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('th_code')}</th>
                  <th>${t('th_name')}</th>
                  <th>${t('th_category')}</th>
                  <th>${t('th_unit')}</th>
                  <th>Min Qoldiq</th>
                  <th>AVG Tannarx ($)</th>
                  <th>${t('th_status')}</th>
                  <th>${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${materials.map(m => `
                  <tr>
                    <td><code>${m.code}</code></td>
                    <td><strong>${m.name}</strong></td>
                    <td><span class="badge badge-primary">${m.category}</span></td>
                    <td>${m.unit}</td>
                    <td>${m.min_stock}</td>
                    <td>$${m.current_avg_price_usd.toFixed(4)}</td>
                    <td><span class="badge ${m.is_archived ? 'badge-danger' : 'badge-success'}">${m.is_archived ? t('btn_archive') : 'Faol'}</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editMaterial(${m.id})">✏️</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveMaterial(${m.id})">${m.is_archived ? '♻️' : '📦'}</button>
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
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('th_code')}</th>
                  <th>${t('th_name')}</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Viloyat' : 'Регион'}</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Rezident' : 'Резидент'}</th>
                  <th>Telefon</th>
                  <th>${CURRENT_LANG === 'uz' ? "Boshlang'ich qoldiq ($)" : 'Нач. баланс ($)'}</th>
                  <th>${CURRENT_LANG === 'uz' ? "Joriy balans ($)" : 'Тек. баланс ($)'}</th>
                  <th>${t('th_status')}</th>
                  <th>${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${cps.map(cp => `
                  <tr>
                    <td><code>${cp.code}</code></td>
                    <td><strong>${cp.name}</strong></td>
                    <td>${cp.region}</td>
                    <td><span class="badge ${cp.is_resident ? 'badge-success' : 'badge-warning'}">${cp.is_resident ? 'Rezident' : 'Norezident'}</span></td>
                    <td>${cp.phone || '-'}</td>
                    <td>$${cp.initial_balance_usd.toLocaleString()}</td>
                    <td><strong style="color: ${cp.current_balance_usd >= 0 ? '#10b981' : '#ef4444'};">$${cp.current_balance_usd.toLocaleString()}</strong></td>
                    <td><span class="badge ${cp.is_archived ? 'badge-danger' : 'badge-success'}">${cp.is_archived ? 'Arxiv' : 'Faol'}</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.editCounterparty(${cp.id})">✏️</button>
                      <button class="btn btn-secondary btn-sm" onclick="MdmModule.toggleArchiveCp(${cp.id})">${cp.is_archived ? '♻️' : '📦'}</button>
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
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>${t('th_code')}</th>
                  <th>${t('th_name')}</th>
                  <th>Turi</th>
                  <th>${t('th_description')}</th>
                </tr>
              </thead>
              <tbody>
                ${warehouses.map(w => `
                  <tr>
                    <td>${w.id}</td>
                    <td><code>${w.code}</code></td>
                    <td><strong>${w.name}</strong></td>
                    <td><span class="badge badge-info">${w.is_system_default ? 'Standart Tizim Skladi' : "Qo'shimcha"}</span></td>
                    <td>${w.description || '-'}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
      } else if (this.currentTab === "users") {
        const users = await API.getTelegramUsers();
        tableDiv.innerHTML = `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>${CURRENT_LANG === 'uz' ? 'Foydalanuvchi' : 'Пользователь'}</th>
                  <th>Username</th>
                  <th>📱 ${CURRENT_LANG === 'uz' ? 'Telefon Raqam' : 'Номер Телефона'}</th>
                  <th>🎭 ${CURRENT_LANG === 'uz' ? 'Biriktirilgan Rol' : 'Назначенная Роль'}</th>
                  <th>${CURRENT_LANG === 'uz' ? "Ro'yxatdan o'tgan" : 'Дата регистрации'}</th>
                  <th>${t('th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td><strong>#${u.id}</strong></td>
                    <td><strong>${u.first_name} ${u.last_name || ''}</strong></td>
                    <td><code>@${u.username}</code></td>
                    <td><strong style="color: #0284c7; font-size: 13px;">${u.phone_number}</strong></td>
                    <td>
                      <select id="user-role-sel-${u.id}" class="select-styled" style="font-weight: 600;">
                        <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>👑 Admin (Barcha huquqlar)</option>
                        <option value="Ish boshqaruvchi" ${u.role === 'Ish boshqaruvchi' ? 'selected' : ''}>🏭 Ish boshqaruvchi (Moliyasiz)</option>
                        <option value="Direktor" ${u.role === 'Direktor' ? 'selected' : ''}>💼 Direktor (Moliya, Ombor, Balans)</option>
                        <option value="Kutilmoqda" ${u.role === 'Kutilmoqda' ? 'selected' : ''}>⏳ Kutilmoqda (Bloklangan)</option>
                      </select>
                    </td>
                    <td>${u.created_at}</td>
                    <td>
                      <button class="btn btn-primary btn-xs" onclick="MdmModule.saveUserRole(${u.id})">💾 ${CURRENT_LANG === 'uz' ? 'Rolni saqlash' : 'Сохранить роль'}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async saveUserRole(userId) {
    const sel = document.getElementById(`user-role-sel-${userId}`);
    if (!sel) return;
    const newRole = sel.value;
    try {
      await API.updateTelegramUserRole(userId, { role: newRole, is_approved: newRole !== 'Kutilmoqda' });
      showToast(CURRENT_LANG === 'uz' ? `Foydalanuvchi roli saqlandi: ${newRole}` : `Роль сохранена: ${newRole}`, "success");
      await this.loadTabContent();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  openCreateModal() {
    if (this.currentTab === "materials") {
      showModal(
        CURRENT_LANG === 'uz' ? "Yangi material / mahsulot yaratish" : "Создать новый материал / товар",
        `
          <form id="create-material-form">
            <div class="form-group">
              <label class="form-label">${t('th_code')} (Takrorlanmas / Unikal) *</label>
              <input type="text" id="mat-code" class="form-control" placeholder="Masalan: Smt60, Tile60, Kao01" required />
            </div>
            <div class="form-group">
              <label class="form-label">${t('th_name')} *</label>
              <input type="text" id="mat-name" class="form-control" placeholder="Masalan: Siment 60%, Kafel 60x60 Marmar" required />
            </div>
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">${t('th_category')}</label>
                <select id="mat-category" class="form-control">
                  <option value="Siryo">Siryo / Xomashyo</option>
                  <option value="Tayyor mahsulot">Tayyor mahsulot</option>
                  <option value="Ehtiyot qism">Ehtiyot qism</option>
                  <option value="Yordamchi">Yordamchi material</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">${t('th_unit')}</label>
                <select id="mat-unit" class="form-control">
                  <option value="kg">kg</option>
                  <option value="m2">m²</option>
                  <option value="dona">dona</option>
                  <option value="litr">litr</option>
                  <option value="tonna">tonna</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Minimal qoldiq (Min Stock)</label>
              <input type="number" step="any" id="mat-min-stock" class="form-control" value="0" />
            </div>
            <div class="form-group">
              <label class="form-label">${t('th_description')}</label>
              <textarea id="mat-desc" class="form-control" rows="2"></textarea>
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
            <div class="form-group">
              <label class="form-label">${t('th_name')} / Kompaniya nomi *</label>
              <input type="text" id="cp-name" class="form-control" placeholder="Masalan: Bekobod Sement MCHJ" required />
            </div>
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Viloyat / Hudud</label>
                <select id="cp-region" class="form-control">
                  ${regions.map(r => `<option value="${r}">${r}</option>`).join("")}
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Rezidentlik holati</label>
                <select id="cp-resident" class="form-control">
                  <option value="true">Rezident (O'zbekiston)</option>
                  <option value="false">Norezident (Xorijiy)</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Telefon</label>
                <input type="text" id="cp-phone" class="form-control" placeholder="+998901234567" />
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Boshlang'ich balans ($)</label>
                <input type="number" step="any" id="cp-init-bal" class="form-control" value="0" />
                <small style="color: #64748b; font-size: 11px;">(Faqat yaratishda kiritiladi, keyin bloklanadi)</small>
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
