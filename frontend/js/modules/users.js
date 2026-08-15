const UsersModule = (() => {
  let activeTab = "web"; // "web" or "telegram"
  let webUsers = [];
  let telegramUsers = [];
  let availableRoles = [];

  const ALL_ROLES = [
    { id: "Admin", name: { uz: "👑 Admin", ru: "👑 Администратор" }, desc: { uz: "Barcha huquqlar, sozlamalar va foydalanuvchilar boshqaruvi", ru: "Полный доступ, настройки и управление пользователями" } },
    { id: "Mini App", name: { uz: "🚀 Mini App", ru: "🚀 Mini App" }, desc: { uz: "Telegram botda '🚀 ERP Mini Appni ochish' tugmasi", ru: "Кнопка '🚀 Открыть ERP Mini App' в Telegram боте" } },
    { id: "Ombor", name: { uz: "📦 Ombor", ru: "📦 Склад" }, desc: { uz: "Ombor hisobi, materiallar qoldig'i (AVG tannarxda)", ru: "Складской учет, остатки материалов (по средней себестоимости)" } },
    { id: "Kassa", name: { uz: "💵 Kassa", ru: "💵 Касса" }, desc: { uz: "Kassa kirim-chiqim operatsiyalari va pul oqimi", ru: "Приходно-расходные операции кассы и движение средств" } },
    { id: "Ishlab chiqarish", name: { uz: "🏭 Ishlab chiqarish", ru: "🏭 Производство" }, desc: { uz: "5 ta ishlab chiqarish liniyasi va mahsulot tayyorlash", ru: "5 производственных линий и выпуск готовой плитки" } },
    { id: "Kontragentlar & Balanslar", name: { uz: "👥 Kontragentlar & Balanslar", ru: "👥 Контрагенты и Балансы" }, desc: { uz: "Mijoz va ta'minotchilar qarzdorligi (debitor/kreditor)", ru: "Взаиморасчеты с клиентами и поставщиками (дебиторка/кредиторка)" } },
    { id: "Sotib olish (Zakup)", name: { uz: "🛒 Sotib olish (Zakup)", ru: "🛒 Закупки и Поступления" }, desc: { uz: "Xomashyo va materiallarni xarid qilish", ru: "Закупка и оприходование сырья и материалов" } },
    { id: "Sotish (Realizatsiya)", name: { uz: "🏷️ Sotish (Realizatsiya)", ru: "🏷️ Продажи и Реализация" }, desc: { uz: "Tayyor kafellarni mijozlarga sotish", ru: "Реализация готовой плитки покупателям" } },
    { id: "Moliya & PnL", name: { uz: "📈 Moliya & PnL", ru: "📈 Финансы и PnL" }, desc: { uz: "Foyda va zarar hisoboti (PnL), oyni yopish", ru: "Отчет о прибылях и убытках (PnL), закрытие месяца" } },
    { id: "MDM (Spravochniklar)", name: { uz: "🗂️ MDM (Spravochniklar)", ru: "🗂️ MDM (Справочники)" }, desc: { uz: "Materiallar, kafel turlari va kontragentlar katalogi", ru: "Справочники материалов, видов плитки и контрагентов" } }
  ];

  function renderRoleBadges(roleStr) {
    const isUz = CURRENT_LANG === 'uz';
    if (!roleStr || roleStr === "Kutilmoqda") {
      return `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid #fde68a;">${isUz ? "🟡 Kutilmoqda (Rolsiz)" : "🟡 Ожидает (Без ролей)"}</span>`;
    }
    const roles = roleStr.split(",").map(r => r.trim()).filter(Boolean);
    return roles.map(r => {
      let color = "#3b82f6";
      let bg = "#eff6ff";
      let icon = "🔘";
      let label = r;

      if (r === "Admin") { color = "#dc2626"; bg = "#fef2f2"; icon = "👑"; label = isUz ? "Admin" : "Админ"; }
      else if (r === "Mini App") { color = "#0284c7"; bg = "#f0f9ff"; icon = "🚀"; label = "Mini App"; }
      else if (r === "Ombor" || r === "Omborchi") { color = "#d97706"; bg = "#fffbeb"; icon = "📦"; label = isUz ? "Ombor" : "Склад"; }
      else if (r === "Kassa" || r === "Kassir") { color = "#0891b2"; bg = "#ecfeff"; icon = "💵"; label = isUz ? "Kassa" : "Касса"; }
      else if (r === "Ishlab chiqarish" || r === "Sex boshlig'i") { color = "#4f46e5"; bg = "#eef2ff"; icon = "🏭"; label = isUz ? "Ishlab chiqarish" : "Производство"; }
      else if (r.includes("Kontragent") || r === "Balanslar") { color = "#059669"; bg = "#ecfdf5"; icon = "👥"; label = isUz ? "Kontragentlar" : "Контрагенты"; }
      else if (r.includes("Zakup") || r.includes("Sotib")) { color = "#b45309"; bg = "#fef3c7"; icon = "🛒"; label = isUz ? "Sotib olish" : "Закупки"; }
      else if (r.includes("Sotish") || r.includes("Realizatsiya")) { color = "#c026d3"; bg = "#fdf4ff"; icon = "🏷️"; label = isUz ? "Sotish" : "Продажи"; }
      else if (r.includes("Moliya") || r === "Direktor" || r === "Buxgalter") { color = "#7c3aed"; bg = "#f5f3ff"; icon = "📈"; label = isUz ? "Moliya" : "Финансы"; }
      else if (r.includes("MDM")) { color = "#475569"; bg = "#f1f5f9"; icon = "🗂️"; label = "MDM"; }

      return `<span style="background: ${bg}; color: ${color}; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid ${color}30; margin-right: 4px; display: inline-block; margin-bottom: 2px;">${icon} ${label}</span>`;
    }).join(" ");
  }

  function renderRoleCheckboxes(inputName, selectedRolesStr = "") {
    const isUz = CURRENT_LANG === 'uz';
    const selected = (selectedRolesStr || "").split(",").map(r => r.trim());
    return `
      <div style="margin-bottom: 8px; display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" onclick="UsersModule.selectAllRoles('${inputName}')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-weight: 600;">${isUz ? '⚡ Barchasini tanlash' : '⚡ Выбрать все'}</button>
        <button type="button" onclick="UsersModule.clearAllRoles('${inputName}')" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-weight: 600;">${isUz ? '🗑️ Tozalash' : '🗑️ Очистить'}</button>
      </div>
      <div style="border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; background: #f8fafc; max-height: 250px; overflow-y: auto;">
        ${ALL_ROLES.map(r => {
          const isChecked = selected.includes(r.id) || (r.id === "Ombor" && selected.includes("Omborchi")) || (r.id === "Kassa" && selected.includes("Kassir")) || (r.id === "Ishlab chiqarish" && selected.includes("Sex boshlig'i")) || (r.id === "Moliya & PnL" && (selected.includes("Direktor") || selected.includes("Buxgalter")));
          const rName = isUz ? r.name.uz : r.name.ru;
          const rDesc = isUz ? r.desc.uz : r.desc.ru;
          return `
            <label style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; margin-bottom: 4px; background: ${isChecked ? '#eff6ff' : '#ffffff'}; border: 1px solid ${isChecked ? '#bfdbfe' : '#e2e8f0'};" onmouseover="if(!this.querySelector('input').checked) this.style.background='#f1f5f9'" onmouseout="if(!this.querySelector('input').checked) this.style.background='#ffffff'">
              <input type="checkbox" name="${inputName}" value="${r.id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; margin-top: 2px; cursor: pointer;" onchange="this.closest('label').style.background=this.checked?'#eff6ff':'#ffffff'; this.closest('label').style.borderColor=this.checked?'#bfdbfe':'#e2e8f0';" />
              <div>
                <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${rName}</div>
                <div style="font-size: 11px; color: #64748b;">${rDesc}</div>
              </div>
            </label>
          `;
        }).join("")}
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">${isUz ? '💡 Istalgan modullarni mustaqil belgilashingiz mumkin (masalan: faqat Moliya va Ombor, yoki Kassadan tashqari hammasi).' : '💡 Вы можете отметить любые модули индивидуально (например: только Финансы и Склад, или все кроме Кассы).'}</div>
    `;
  }

  function selectAllRoles(inputName) {
    document.querySelectorAll(`input[name='${inputName}']`).forEach(cb => {
      cb.checked = true;
      const lbl = cb.closest("label");
      if (lbl) {
        lbl.style.background = "#eff6ff";
        lbl.style.borderColor = "#bfdbfe";
      }
    });
  }

  function clearAllRoles(inputName) {
    document.querySelectorAll(`input[name='${inputName}']`).forEach(cb => {
      cb.checked = false;
      const lbl = cb.closest("label");
      if (lbl) {
        lbl.style.background = "#ffffff";
        lbl.style.borderColor = "#e2e8f0";
      }
    });
  }

  async function render(container) {
    const isUz = CURRENT_LANG === 'uz';

    container.innerHTML = `
      <div class="module-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
        <div>
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px;">
            <span>👥</span> <span>${isUz ? "Foydalanuvchilar va Rollar" : "Пользователи и Роли"}</span>
          </h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">
            ${isUz 
              ? "ERP web tizimi hamda Telegram bot foydalanuvchilarini boshqarish va har bir modul bo'yicha alohida ruxsatlar biriktirish" 
              : "Управление пользователями веб-системы ERP и Telegram бота, настройка прав доступа к модулям"}
          </p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-create-user" onclick="UsersModule.openCreateUserModal()" style="display: flex; align-items: center; gap: 8px;">
            <span>➕</span> <span>${isUz ? "Yangi foydalanuvchi yaratish" : "Создать пользователя"}</span>
          </button>
          <button class="btn btn-secondary" onclick="UsersModule.loadData()" style="display: flex; align-items: center; gap: 6px;">
            <span>🔄</span> <span>${isUz ? "Yangilash" : "Обновить"}</span>
          </button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div style="display: flex; gap: 10px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px;">
        <button class="tab-btn ${activeTab === 'web' ? 'active-tab' : ''}" onclick="UsersModule.switchTab('web')" style="padding: 12px 20px; font-weight: 600; font-size: 15px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${activeTab === 'web' ? '#2563eb' : 'transparent'}; color: ${activeTab === 'web' ? '#2563eb' : '#64748b'}; display: flex; align-items: center; gap: 8px;">
          <span>💻</span> ${isUz ? "Web Tizim Foydalanuvchilari" : "Пользователи Веб-Системы"} <span class="badge" id="web-users-count" style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
        </button>
        <button class="tab-btn ${activeTab === 'telegram' ? 'active-tab' : ''}" onclick="UsersModule.switchTab('telegram')" style="padding: 12px 20px; font-weight: 600; font-size: 15px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${activeTab === 'telegram' ? '#2563eb' : 'transparent'}; color: ${activeTab === 'telegram' ? '#2563eb' : '#64748b'}; display: flex; align-items: center; gap: 8px;">
          <span>📱</span> ${isUz ? "Telegram Bot Foydalanuvchilari" : "Пользователи Telegram Бота"} <span class="badge" id="tg-users-count" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="users-tab-content">
        <div style="text-align: center; padding: 50px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
      </div>

      <!-- Modals Container -->
      <div id="users-modals"></div>
    `;

    await loadData();
  }

  async function loadData() {
    const isUz = CURRENT_LANG === 'uz';
    try {
      const [uRes, tgRes, rolesRes] = await Promise.all([
        API.getUsers(),
        API.getTelegramUsers(),
        API.getRoles()
      ]);

      webUsers = uRes || [];
      telegramUsers = tgRes || [];
      availableRoles = rolesRes || [];

      const webBadge = document.getElementById("web-users-count");
      if (webBadge) webBadge.textContent = webUsers.length;

      const tgPendingCount = telegramUsers.filter(u => !u.is_approved || u.role === "Kutilmoqda").length;
      const tgBadge = document.getElementById("tg-users-count");
      if (tgBadge) {
        tgBadge.textContent = `${telegramUsers.length}${tgPendingCount > 0 ? ` (${tgPendingCount} ${isUz ? 'ta kutilmoqda' : 'ожидает'})` : ""}`;
        if (tgPendingCount > 0) {
          tgBadge.style.background = "#fee2e2";
          tgBadge.style.color = "#b91c1c";
        }
      }

      renderTabContent();
    } catch (e) {
      console.error("Failed to load users:", e);
      showToast(isUz ? "Foydalanuvchilar ma'lumotlarini yuklashda xatolik yuz berdi" : "Ошибка при загрузке данных пользователей", "error");
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    const btnCreate = document.getElementById("btn-create-user");
    if (btnCreate) {
      btnCreate.style.display = tab === "web" ? "flex" : "none";
    }

    const container = document.getElementById("module-container");
    if (container) render(container);
  }

  function renderTabContent() {
    const content = document.getElementById("users-tab-content");
    if (!content) return;

    if (activeTab === "web") {
      renderWebUsersTable(content);
    } else {
      renderTelegramUsersTable(content);
    }
  }

  function renderWebUsersTable(container) {
    const isUz = CURRENT_LANG === 'uz';

    if (webUsers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 48px; margin-bottom: 12px;">👤</div>
          <h3 style="color: #334155; margin: 0 0 8px 0;">${isUz ? "Hozircha foydalanuvchilar yo'q" : "Пользователи еще не созданы"}</h3>
          <p style="color: #64748b; margin: 0 0 16px 0;">${isUz ? "Yangi xodimlarni ERP tizimiga qo'shish uchun tugmani bosing" : "Нажмите кнопку, чтобы добавить новых сотрудников в ERP"}</p>
          <button class="btn btn-primary" onclick="UsersModule.openCreateUserModal()">➕ ${isUz ? "Foydalanuvchi qo'shish" : "Добавить пользователя"}</button>
        </div>
      `;
      return;
    }

    let rowsHtml = webUsers.map(u => {
      const statusBadge = u.is_archived
        ? `<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500;">📁 ${isUz ? 'Arxivlangan' : 'В архиве'}</span>`
        : `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500;">🟢 ${isUz ? 'Faol' : 'Активен'}</span>`;

      const initial = (u.username || "U").substring(0, 2).toUpperCase();

      return `
        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td data-sort-value="${u.full_name}" style="padding: 14px 16px; color: #1e293b;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px;">
                ${initial}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 500; color: #0f172a;">${u.full_name}</div>
                <div style="font-size: 12px; color: #64748b;">ID: #${u.id}</div>
              </div>
            </div>
          </td>
          <td data-sort-value="${u.username}" style="padding: 14px 16px;">
            <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; color: #0f172a; font-size: 13px;">${u.username}</code>
          </td>
          <td data-sort-value="${u.phone_number || ''}" style="padding: 14px 16px; color: #475569; font-size: 13px;">${u.phone_number || "-"}</td>
          <td data-sort-value="${u.role}" style="padding: 14px 16px; max-width: 300px;">
            ${renderRoleBadges(u.role)}
          </td>
          <td data-sort-value="${u.is_archived ? 'Arxiv' : 'Faol'}" style="padding: 14px 16px;">${statusBadge}</td>
          <td data-sort-value="${u.created_at}" style="padding: 14px 16px; color: #64748b; font-size: 13px;">${formatDate(u.created_at)}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-sm" onclick="UsersModule.openEditUserModal(${u.id})" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;" title="${isUz ? 'Tahrirlash' : 'Редактировать'}">
                ✏️ ${isUz ? 'Tahrirlash' : 'Редактировать'}
              </button>
              ${u.username !== "Adminshox" ? `
                <button class="btn btn-sm" onclick="UsersModule.toggleArchiveUser(${u.id}, ${u.is_archived})" style="background: ${u.is_archived ? '#ecfdf5' : '#fffbeb'}; color: ${u.is_archived ? '#059669' : '#b45309'}; border: 1px solid ${u.is_archived ? '#a7f3d0' : '#fde68a'}; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                  ${u.is_archived ? (isUz ? '♻️ Faollashtirish' : '♻️ Активировать') : (isUz ? '📁 Arxivlash' : '📁 В архив')}
                </button>
                <button class="btn btn-sm" onclick="UsersModule.deleteWebUser(${u.id}, '${u.username}')" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;" title="${isUz ? "O'chirish" : "Удалить"}">
                  🗑️ ${isUz ? "O'chirish" : "Удалить"}
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="overflow-x: auto;">
          <table class="data-table" id="web-users-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 16px;">${isUz ? 'F.I.Sh.' : 'Ф.И.О.'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 16px;">${isUz ? 'Login' : 'Логин'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 16px;">${isUz ? 'Telefon' : 'Телефон'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 16px;">${isUz ? 'Biriktirilgan Ruxsatlar' : 'Назначенные Права'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 16px;">${isUz ? 'Holati' : 'Статус'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)" style="padding: 12px 16px;">${isUz ? 'Yaratilgan sana' : 'Дата создания'} <span class="sort-icon">↕</span></th>
                <th style="padding: 12px 16px; text-align: right;">${isUz ? 'Amallar' : 'Действия'}</th>
              </tr>
              <tr class="filter-row">
                <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${isUz ? 'F.I.Sh...' : 'Ф.И.О...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 ${isUz ? 'Login...' : 'Логин...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${isUz ? 'Tel...' : 'Тел...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${isUz ? 'Rol...' : 'Роль...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="🔍 ${isUz ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTelegramUsersTable(container) {
    const isUz = CURRENT_LANG === 'uz';

    if (telegramUsers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 48px; margin-bottom: 12px;">📱</div>
          <h3 style="color: #334155; margin: 0 0 8px 0;">${isUz ? "Telegram botdan hali hech kim ro'yxatdan o'tmagan" : "Никто еще не зарегистрировался через Telegram бот"}</h3>
          <p style="color: #64748b; margin: 0;">${isUz ? "Xodimlar botga (/start) bosib telefon raqamini yuborganlarida, ular shu yerda ko'rinadi va siz ularga bir yoki bir nechta rol berishingiz mumkin bo'ladi." : "Когда сотрудники отправят номер телефона боту (/start), они появятся здесь для назначения ролей и подтверждения доступа."}</p>
        </div>
      `;
      return;
    }

    let rowsHtml = telegramUsers.map(u => {
      const isPending = !u.is_approved || u.role === "Kutilmoqda" || !u.role;
      const statusBadge = isPending
        ? `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #fde68a;">🟡 ${isUz ? 'Kutilmoqda' : 'Ожидает'}</span>`
        : `<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #bbf7d0;">🟢 ${isUz ? 'Tasdiqlangan' : 'Одобрен'}</span>`;

      const btnLabel = isPending 
        ? (isUz ? "👑 Rol berish & Tasdiqlash" : "👑 Назначить роли & Одобрить") 
        : (isUz ? "✏️ Rollarni o'zgartirish" : "✏️ Изменить роли");

      return `
        <tr style="border-bottom: 1px solid #f1f5f9; background: ${isPending ? '#fffbeb30' : 'transparent'}; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isPending ? '#fffbeb30' : 'transparent'}'">
          <td data-sort-value="${u.first_name} ${u.last_name || ''}" style="padding: 14px 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px;">
                ✈️
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 500; color: #0f172a;">${u.first_name} ${u.last_name || ''}</div>
                <div style="font-size: 12px; color: #64748b;">TG ID: <code>${u.telegram_id}</code></div>
              </div>
            </div>
          </td>
          <td data-sort-value="${u.username || ''}" style="padding: 14px 16px;">
            <span style="color: #0284c7; font-weight: 500; font-size: 13px;">${u.username && u.username !== '-' ? '@' + u.username : '-'}</span>
          </td>
          <td data-sort-value="${u.phone_number || ''}" style="padding: 14px 16px;">
            <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; color: #0f172a; font-size: 13px;">${u.phone_number}</code>
          </td>
          <td data-sort-value="${u.role}" style="padding: 14px 16px; max-width: 300px;">
            ${renderRoleBadges(u.role)}
          </td>
          <td data-sort-value="${isPending ? 'Kutilmoqda' : 'Tasdiqlangan'}" style="padding: 14px 16px;">${statusBadge}</td>
          <td data-sort-value="${u.created_at}" style="padding: 14px 16px; color: #64748b; font-size: 13px;">${formatDate(u.created_at)}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-sm" onclick="UsersModule.openApproveTgUserModal(${u.id})" style="background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                ${btnLabel}
              </button>
              <button class="btn btn-sm" onclick="UsersModule.deleteTgUser(${u.id})" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;" title="${isUz ? "O'chirish" : "Удалить"}">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">💡</span>
        <div style="font-size: 13px; color: #1e40af; line-height: 1.4;">
          ${isUz 
            ? "<strong>Alohida modulli Telegram ruxsatlari:</strong> Xodimga faqat o'zi shug'ullanadigan modullarni (masalan, <em>Moliya</em> va <em>Ombor</em>, yoki <em>Mini App</em> va <em>Kassa</em>) alohida belgilab bering. Belgilanmagan har qanday modul bot klaviaturasidan yo'qoladi va bloklanadi."
            : "<strong>Индивидуальные права в Telegram:</strong> Назначьте сотруднику только те модули, с которыми он работает (например, <em>Финансы</em> и <em>Склад</em>, или <em>Mini App</em> и <em>Касса</em>). Неотмеченные модули будут скрыты и заблокированы в боте."}
        </div>
      </div>

      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="overflow-x: auto;">
          <table class="data-table" id="tg-users-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)" style="padding: 12px 16px;">${isUz ? 'Xodim (Telegram)' : 'Сотрудник (Telegram)'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)" style="padding: 12px 16px;">Username <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)" style="padding: 12px 16px;">${isUz ? 'Telefon raqami' : 'Номер телефона'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)" style="padding: 12px 16px;">${isUz ? 'Biriktirilgan Rollar' : 'Назначенные Роли'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)" style="padding: 12px 16px;">${isUz ? 'Holat' : 'Статус'} <span class="sort-icon">↕</span></th>
                <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, false)" style="padding: 12px 16px;">${isUz ? 'Sana' : 'Дата'} <span class="sort-icon">↕</span></th>
                <th style="padding: 12px 16px; text-align: right;">${isUz ? 'Amallar' : 'Действия'}</th>
              </tr>
              <tr class="filter-row">
                <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="🔍 ${isUz ? 'Xodim...' : 'Сотрудник...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="🔍 Username..." oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="🔍 ${isUz ? 'Tel...' : 'Тел...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="🔍 ${isUz ? 'Rol...' : 'Роль...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="🔍 ${isUz ? 'Holat...' : 'Статус...'}" oninput="TableFilterSort.filterTable(this)" /></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== MODALS ====================

  function openCreateUserModal() {
    const isUz = CURRENT_LANG === 'uz';
    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="create-user-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">➕ ${isUz ? "Yangi foydalanuvchi yaratish" : "Создать пользователя"}</h3>
            <button onclick="UsersModule.closeModal('create-user-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="create-user-form" onsubmit="UsersModule.handleCreateUser(event)" style="padding: 24px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "F.I.Sh. (To'liq ism) *" : "Ф.И.О. (Полное имя) *"}</label>
              <input type="text" id="new-full-name" class="input-styled" required placeholder="${isUz ? 'Masalan: Sardor Rahimov' : 'Например: Сардор Рахимов'}" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "Login (Username) *" : "Логин (Имя пользователя) *"}</label>
                <input type="text" id="new-username" class="input-styled" required placeholder="sardor_ombor" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "Telefon raqam" : "Номер телефона"}</label>
                <input type="text" id="new-phone" class="input-styled" placeholder="+998901234567" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "Parol *" : "Пароль *"}</label>
              <input type="password" id="new-password" class="input-styled" required placeholder="••••••••" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">${isUz ? "Tizimdagi Ruxsatlar & Modullar (Alohida-alohida belgilang) *" : "Права и модули доступа (Отметьте нужные) *"}</label>
              ${renderRoleCheckboxes("new_user_roles", "Ombor,Sotib olish (Zakup)")}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('create-user-modal')" class="btn btn-secondary" style="padding: 10px 18px;">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    const isUz = CURRENT_LANG === 'uz';
    const fullName = document.getElementById("new-full-name").value.trim();
    const username = document.getElementById("new-username").value.trim();
    const phone = document.getElementById("new-phone").value.trim();
    const password = document.getElementById("new-password").value;

    const checkedRoles = Array.from(document.querySelectorAll("input[name='new_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast(isUz ? "Iltimos, kamida bitta ruxsat/rol tanlang!" : "Пожалуйста, выберите хотя бы одну роль/модуль!", "error");
      return;
    }
    const role = checkedRoles.join(",");

    try {
      await API.createUser({
        full_name: fullName,
        username: username,
        phone_number: phone,
        password: password,
        role: role
      });
      showToast(isUz ? "Foydalanuvchi muvaffaqiyatli yaratildi!" : "Пользователь успешно создан!", "success");
      closeModal("create-user-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  function openEditUserModal(userId) {
    const isUz = CURRENT_LANG === 'uz';
    const user = webUsers.find(u => u.id === userId);
    if (!user) return;

    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="edit-user-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">✏️ ${isUz ? "Foydalanuvchini tahrirlash:" : "Редактирование пользователя:"} ${user.username}</h3>
            <button onclick="UsersModule.closeModal('edit-user-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="edit-user-form" onsubmit="UsersModule.handleEditUser(event, ${user.id})" style="padding: 24px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "F.I.Sh. *" : "Ф.И.О. *"}</label>
              <input type="text" id="edit-full-name" class="input-styled" required value="${user.full_name}" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "Telefon raqam" : "Номер телефона"}</label>
              <input type="text" id="edit-phone" class="input-styled" value="${user.phone_number !== '-' ? user.phone_number : ''}" placeholder="+998901234567" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">${isUz ? "Tizimdagi Ruxsatlar & Modullar (Alohida-alohida belgilang) *" : "Права и модули доступа (Отметьте нужные) *"}</label>
              ${renderRoleCheckboxes("edit_user_roles", user.role)}
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${isUz ? "Yangi Parol (agar o'zgartirilsa)" : "Новый Пароль (если нужно изменить)"}</label>
              <input type="password" id="edit-password" class="input-styled" placeholder="${isUz ? "Parolni o'zgartirmaslik uchun bo'sh qoldiring" : "Оставьте пустым, чтобы не менять пароль"}" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('edit-user-modal')" class="btn btn-secondary" style="padding: 10px 18px;">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">${isUz ? "Yangilash" : "Обновить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleEditUser(e, userId) {
    e.preventDefault();
    const isUz = CURRENT_LANG === 'uz';
    const fullName = document.getElementById("edit-full-name").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const password = document.getElementById("edit-password").value;

    const checkedRoles = Array.from(document.querySelectorAll("input[name='edit_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast(isUz ? "Iltimos, kamida bitta ruxsat/rol tanlang!" : "Пожалуйста, выберите хотя бы одну роль/модуль!", "error");
      return;
    }
    const role = checkedRoles.join(",");

    const payload = {
      full_name: fullName,
      phone_number: phone,
      role: role
    };
    if (password) {
      payload.password = password;
    }

    try {
      await API.updateUser(userId, payload);
      showToast(isUz ? "Foydalanuvchi ma'lumotlari yangilandi!" : "Данные пользователя обновлены!", "success");
      closeModal("edit-user-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  async function toggleArchiveUser(userId, isCurrentlyArchived) {
    const isUz = CURRENT_LANG === 'uz';
    const actionName = isCurrentlyArchived 
      ? (isUz ? "faollashtirishni" : "активировать") 
      : (isUz ? "arxivlashni" : "архивировать");

    const confirmMsg = isUz
      ? `Haqiqatan ham ushbu foydalanuvchini ${actionName} xohlaysizmi?`
      : `Вы уверены, что хотите ${actionName} этого пользователя?`;

    if (!confirm(confirmMsg)) return;

    try {
      await API.archiveUser(userId);
      showToast(isUz ? "Foydalanuvchi holati yangilandi!" : "Статус пользователя обновлен!", "success");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  async function deleteWebUser(userId, username) {
    const isUz = CURRENT_LANG === 'uz';
    const confirmMsg = isUz
      ? `Haqiqatan ham "${username}" foydalanuvchisini BUTUNLAY O'CHIRIB tashlamoqchimisiz?\n\nDIQQAT: Bu amal qaytarilmaydi!`
      : `Вы действительно хотите НАВСЕГДА УДАЛИТЬ пользователя "${username}"?\n\nВНИМАНИЕ: Это действие нельзя отменить!`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await API.deleteUser(userId);
      showToast(res.message || (isUz ? "Foydalanuvchi butunlay o'chirildi!" : "Пользователь удален!"), "success");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  // ==================== TELEGRAM USER APPROVAL MODAL ====================

  function openApproveTgUserModal(tgDbId) {
    const isUz = CURRENT_LANG === 'uz';
    const u = telegramUsers.find(item => item.id === tgDbId);
    if (!u) return;

    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="approve-tg-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">👑 ${isUz ? "Telegram foydalanuvchisiga ruxsatlar biriktirish" : "Назначение прав пользователю Telegram"}</h3>
            <button onclick="UsersModule.closeModal('approve-tg-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="approve-tg-form" onsubmit="UsersModule.handleApproveTgUser(event, ${u.id})" style="padding: 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 18px;">
              <div style="font-weight: 600; font-size: 15px; color: #0f172a;">${u.first_name} ${u.last_name || ''}</div>
              <div style="font-size: 13px; color: #475569; margin-top: 4px;">📱 ${isUz ? "Telefon:" : "Телефон:"} <strong>${u.phone_number}</strong></div>
              <div style="font-size: 13px; color: #64748b; margin-top: 2px;">✈️ Telegram: @${u.username || '-'} (ID: ${u.telegram_id})</div>
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">${isUz ? "Ushbu xodimga qaysi rollar/modullarni biriktirasiz? (Alohida-alohida belgilang) *" : "Какие роли/модули назначить данному сотруднику? (Отметьте нужные) *"}</label>
              ${renderRoleCheckboxes("tg_user_roles", u.role === 'Kutilmoqda' ? 'Ombor' : u.role)}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('approve-tg-modal')" class="btn btn-secondary" style="padding: 10px 18px;">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">✅ ${isUz ? "Tasdiqlash & Saqlash" : "Одобрить и Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleApproveTgUser(e, tgDbId) {
    e.preventDefault();
    const isUz = CURRENT_LANG === 'uz';
    const checkedRoles = Array.from(document.querySelectorAll("input[name='tg_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast(isUz ? "Iltimos, kamida bitta ruxsat/rol tanlang!" : "Пожалуйста, выберите хотя бы одну роль/модуль!", "error");
      return;
    }
    const role = checkedRoles.join(",");

    try {
      await API.approveTelegramUser(tgDbId, role);
      showToast(isUz ? `Foydalanuvchi tasdiqlandi: [${role}] ruxsatlari berildi!` : `Пользователь одобрен: назначены права [${role}]!`, "success");
      closeModal("approve-tg-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  async function deleteTgUser(tgDbId) {
    const isUz = CURRENT_LANG === 'uz';
    const confirmMsg = isUz
      ? "Ushbu telegram foydalanuvchisini o'chirishni tasdiqlaysizmi?"
      : "Подтверждаете удаление этого пользователя Telegram?";

    if (!confirm(confirmMsg)) return;

    try {
      await API.deleteTelegramUser(tgDbId);
      showToast(isUz ? "Telegram foydalanuvchisi o'chirildi!" : "Пользователь Telegram удален!", "info");
      await loadData();
    } catch (err) {
      showToast(err.message || (isUz ? "Xatolik yuz berdi!" : "Произошла ошибка!"), "error");
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
  }

  return {
    render,
    loadData,
    switchTab,
    openCreateUserModal,
    handleCreateUser,
    openEditUserModal,
    handleEditUser,
    toggleArchiveUser,
    deleteWebUser,
    openApproveTgUserModal,
    handleApproveTgUser,
    deleteTgUser,
    closeModal,
    selectAllRoles,
    clearAllRoles
  };
})();
