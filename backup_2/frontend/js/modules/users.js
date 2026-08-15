const UsersModule = (() => {
  let activeTab = "web"; // "web" or "telegram"
  let webUsers = [];
  let telegramUsers = [];
  let availableRoles = [];

  const ALL_ROLES = [
    { id: "Admin", name: "👑 Admin", desc: "Barcha huquqlar, sozlamalar va foydalanuvchilar boshqaruvi" },
    { id: "Mini App", name: "🚀 Mini App", desc: "Telegram botda '🚀 ERP Mini Appni ochish' tugmasi" },
    { id: "Ombor", name: "📦 Ombor", desc: "Ombor hisobi, materiallar qoldig'i (AVG tannarxda)" },
    { id: "Kassa", name: "💵 Kassa", desc: "Kassa kirim-chiqim operatsiyalari va pul oqimi" },
    { id: "Ishlab chiqarish", name: "🏭 Ishlab chiqarish", desc: "5 ta ishlab chiqarish liniyasi va mahsulot tayyorlash" },
    { id: "Kontragentlar & Balanslar", name: "👥 Kontragentlar & Balanslar", desc: "Mijoz va ta'minotchilar qarzdorligi (debitor/kreditor)" },
    { id: "Sotib olish (Zakup)", name: "🛒 Sotib olish (Zakup)", desc: "Xomashyo va materiallarni xarid qilish" },
    { id: "Sotish (Realizatsiya)", name: "🏷️ Sotish (Realizatsiya)", desc: "Tayyor kafellarni mijozlarga sotish" },
    { id: "Moliya & PnL", name: "📈 Moliya & PnL", desc: "Foyda va zarar hisoboti (PnL), oyni yopish" },
    { id: "MDM (Spravochniklar)", name: "🗂️ MDM (Spravochniklar)", desc: "Materiallar, kafel turlari va kontragentlar katalogi" }
  ];

  function renderRoleBadges(roleStr) {
    if (!roleStr || roleStr === "Kutilmoqda") {
      return `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid #fde68a;">🟡 Kutilmoqda (Rolsiz)</span>`;
    }
    const roles = roleStr.split(",").map(r => r.trim()).filter(Boolean);
    return roles.map(r => {
      let color = "#3b82f6";
      let bg = "#eff6ff";
      let icon = "🔘";
      if (r === "Admin") { color = "#dc2626"; bg = "#fef2f2"; icon = "👑"; }
      else if (r === "Mini App") { color = "#0284c7"; bg = "#f0f9ff"; icon = "🚀"; }
      else if (r === "Ombor" || r === "Omborchi") { color = "#d97706"; bg = "#fffbeb"; icon = "📦"; }
      else if (r === "Kassa" || r === "Kassir") { color = "#0891b2"; bg = "#ecfeff"; icon = "💵"; }
      else if (r === "Ishlab chiqarish" || r === "Sex boshlig'i") { color = "#4f46e5"; bg = "#eef2ff"; icon = "🏭"; }
      else if (r.includes("Kontragent") || r === "Balanslar") { color = "#059669"; bg = "#ecfdf5"; icon = "👥"; }
      else if (r.includes("Zakup") || r.includes("Sotib")) { color = "#b45309"; bg = "#fef3c7"; icon = "🛒"; }
      else if (r.includes("Sotish") || r.includes("Realizatsiya")) { color = "#c026d3"; bg = "#fdf4ff"; icon = "🏷️"; }
      else if (r.includes("Moliya") || r === "Direktor" || r === "Buxgalter") { color = "#7c3aed"; bg = "#f5f3ff"; icon = "📈"; }
      else if (r.includes("MDM")) { color = "#475569"; bg = "#f1f5f9"; icon = "🗂️"; }
      return `<span style="background: ${bg}; color: ${color}; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid ${color}30; margin-right: 4px; display: inline-block; margin-bottom: 2px;">${icon} ${r}</span>`;
    }).join(" ");
  }

  function renderRoleCheckboxes(inputName, selectedRolesStr = "") {
    const selected = (selectedRolesStr || "").split(",").map(r => r.trim());
    return `
      <div style="margin-bottom: 8px; display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" onclick="UsersModule.selectAllRoles('${inputName}')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-weight: 600;">⚡ Barchasini tanlash</button>
        <button type="button" onclick="UsersModule.clearAllRoles('${inputName}')" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-weight: 600;">🗑️ Tozalash</button>
      </div>
      <div style="border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; background: #f8fafc; max-height: 250px; overflow-y: auto;">
        ${ALL_ROLES.map(r => {
          const isChecked = selected.includes(r.id) || (r.id === "Ombor" && selected.includes("Omborchi")) || (r.id === "Kassa" && selected.includes("Kassir")) || (r.id === "Ishlab chiqarish" && selected.includes("Sex boshlig'i")) || (r.id === "Moliya & PnL" && (selected.includes("Direktor") || selected.includes("Buxgalter")));
          return `
            <label style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; margin-bottom: 4px; background: ${isChecked ? '#eff6ff' : '#ffffff'}; border: 1px solid ${isChecked ? '#bfdbfe' : '#e2e8f0'};" onmouseover="if(!this.querySelector('input').checked) this.style.background='#f1f5f9'" onmouseout="if(!this.querySelector('input').checked) this.style.background='#ffffff'">
              <input type="checkbox" name="${inputName}" value="${r.id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; margin-top: 2px; cursor: pointer;" onchange="this.closest('label').style.background=this.checked?'#eff6ff':'#ffffff'; this.closest('label').style.borderColor=this.checked?'#bfdbfe':'#e2e8f0';" />
              <div>
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${r.name}</div>
                <div style="font-size: 11px; color: #64748b;">${r.desc}</div>
              </div>
            </label>
          `;
        }).join("")}
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">💡 Istalgan modullarni mustaqil belgilashingiz mumkin (masalan: faqat Moliya va Ombor, yoki Kassadan tashqari hammasi).</div>
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
    container.innerHTML = `
      <div class="module-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
        <div>
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px;">
            <span>👥</span> <span data-i18n="users_title">Foydalanuvchilar va Rollar</span>
          </h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">
            ERP web tizimi hamda Telegram bot foydalanuvchilarini boshqarish va har bir modul bo'yicha alohida ruxsatlar biriktirish
          </p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-create-user" onclick="UsersModule.openCreateUserModal()" style="display: flex; align-items: center; gap: 8px;">
            <span>➕</span> <span>Yangi foydalanuvchi yaratish</span>
          </button>
          <button class="btn btn-secondary" onclick="UsersModule.loadData()" style="display: flex; align-items: center; gap: 6px;">
            <span>🔄</span> <span>Yangilash</span>
          </button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div style="display: flex; gap: 10px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px;">
        <button class="tab-btn ${activeTab === 'web' ? 'active-tab' : ''}" onclick="UsersModule.switchTab('web')" style="padding: 12px 20px; font-weight: 600; font-size: 15px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${activeTab === 'web' ? '#2563eb' : 'transparent'}; color: ${activeTab === 'web' ? '#2563eb' : '#64748b'}; display: flex; align-items: center; gap: 8px;">
          <span>💻</span> Web Tizim Foydalanuvchilari <span class="badge" id="web-users-count" style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
        </button>
        <button class="tab-btn ${activeTab === 'telegram' ? 'active-tab' : ''}" onclick="UsersModule.switchTab('telegram')" style="padding: 12px 20px; font-weight: 600; font-size: 15px; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid ${activeTab === 'telegram' ? '#2563eb' : 'transparent'}; color: ${activeTab === 'telegram' ? '#2563eb' : '#64748b'}; display: flex; align-items: center; gap: 8px;">
          <span>📱</span> Telegram Bot Foydalanuvchilari <span class="badge" id="tg-users-count" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="users-tab-content">
        <div style="text-align: center; padding: 50px; color: #94a3b8;">Yuklanmoqda...</div>
      </div>

      <!-- Modals Container -->
      <div id="users-modals"></div>
    `;

    await loadData();
  }

  async function loadData() {
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
        tgBadge.textContent = `${telegramUsers.length}${tgPendingCount > 0 ? ` (${tgPendingCount} ta kutilmoqda)` : ""}`;
        if (tgPendingCount > 0) {
          tgBadge.style.background = "#fee2e2";
          tgBadge.style.color = "#b91c1c";
        }
      }

      renderTabContent();
    } catch (e) {
      console.error("Failed to load users:", e);
      showToast("Foydalanuvchilar ma'lumotlarini yuklashda xatolik yuz berdi", "error");
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
    if (webUsers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 48px; margin-bottom: 12px;">👤</div>
          <h3 style="color: #334155; margin: 0 0 8px 0;">Hozircha foydalanuvchilar yo'q</h3>
          <p style="color: #64748b; margin: 0 0 16px 0;">Yangi xodimlarni ERP tizimiga qo'shish uchun tugmani bosing</p>
          <button class="btn btn-primary" onclick="UsersModule.openCreateUserModal()">➕ Foydalanuvchi qo'shish</button>
        </div>
      `;
      return;
    }

    let rowsHtml = webUsers.map(u => {
      const statusBadge = u.is_archived
        ? `<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">📁 Arxivlangan</span>`
        : `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">🟢 Faol</span>`;

      const initial = (u.username || "U").substring(0, 2).toUpperCase();

      return `
        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="padding: 14px 16px; font-weight: 600; color: #1e293b;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                ${initial}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${u.full_name}</div>
                <div style="font-size: 12px; color: #64748b;">ID: #${u.id}</div>
              </div>
            </div>
          </td>
          <td style="padding: 14px 16px;">
            <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-weight: 600; color: #0f172a; font-size: 13px;">${u.username}</code>
          </td>
          <td style="padding: 14px 16px; color: #475569; font-size: 14px;">${u.phone_number || "-"}</td>
          <td style="padding: 14px 16px; max-width: 300px;">
            ${renderRoleBadges(u.role)}
          </td>
          <td style="padding: 14px 16px;">${statusBadge}</td>
          <td style="padding: 14px 16px; color: #64748b; font-size: 13px;">${u.created_at}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-sm" onclick="UsersModule.openEditUserModal(${u.id})" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;" title="Tahrirlash">
                ✏️ Tahrirlash
              </button>
              ${u.username !== "Adminshox" ? `
                <button class="btn btn-sm" onclick="UsersModule.toggleArchiveUser(${u.id}, ${u.is_archived})" style="background: ${u.is_archived ? '#ecfdf5' : '#fef2f2'}; color: ${u.is_archived ? '#059669' : '#dc2626'}; border: 1px solid ${u.is_archived ? '#a7f3d0' : '#fecaca'}; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                  ${u.is_archived ? '♻️ Faollashtirish' : '📁 Arxivlash'}
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
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 12px 16px;">F.I.Sh.</th>
                <th style="padding: 12px 16px;">Login</th>
                <th style="padding: 12px 16px;">Telefon</th>
                <th style="padding: 12px 16px;">Biriktirilgan Ruxsatlar</th>
                <th style="padding: 12px 16px;">Holati</th>
                <th style="padding: 12px 16px;">Yaratilgan sana</th>
                <th style="padding: 12px 16px; text-align: right;">Amallar</th>
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
    if (telegramUsers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 48px; margin-bottom: 12px;">📱</div>
          <h3 style="color: #334155; margin: 0 0 8px 0;">Telegram botdan hali hech kim ro'yxatdan o'tmagan</h3>
          <p style="color: #64748b; margin: 0;">Xodimlar botga (/start) bosib telefon raqamini yuborganlarida, ular shu yerda ko'rinadi va siz ularga bir yoki bir nechta rol berishingiz mumkin bo'ladi.</p>
        </div>
      `;
      return;
    }

    let rowsHtml = telegramUsers.map(u => {
      const isPending = !u.is_approved || u.role === "Kutilmoqda" || !u.role;
      const statusBadge = isPending
        ? `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid #fde68a;">🟡 Kutilmoqda</span>`
        : `<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid #bbf7d0;">🟢 Tasdiqlangan</span>`;

      const btnLabel = isPending ? "👑 Rol berish & Tasdiqlash" : "✏️ Rollarni o'zgartirish";

      return `
        <tr style="border-bottom: 1px solid #f1f5f9; background: ${isPending ? '#fffbeb30' : 'transparent'}; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isPending ? '#fffbeb30' : 'transparent'}'">
          <td style="padding: 14px 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                ✈️
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${u.first_name} ${u.last_name || ''}</div>
                <div style="font-size: 12px; color: #64748b;">TG ID: <code>${u.telegram_id}</code></div>
              </div>
            </div>
          </td>
          <td style="padding: 14px 16px;">
            <span style="color: #0284c7; font-weight: 600; font-size: 13px;">${u.username && u.username !== '-' ? '@' + u.username : '-'}</span>
          </td>
          <td style="padding: 14px 16px;">
            <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-weight: 700; color: #0f172a; font-size: 13px;">${u.phone_number}</code>
          </td>
          <td style="padding: 14px 16px; max-width: 300px;">
            ${renderRoleBadges(u.role)}
          </td>
          <td style="padding: 14px 16px;">${statusBadge}</td>
          <td style="padding: 14px 16px; color: #64748b; font-size: 13px;">${u.created_at}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-sm" onclick="UsersModule.openApproveTgUserModal(${u.id})" style="background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                ${btnLabel}
              </button>
              <button class="btn btn-sm" onclick="UsersModule.deleteTgUser(${u.id})" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;" title="O'chirish">
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
          <strong>Alohida modulli Telegram ruxsatlari:</strong> Xodimga faqat o'zi shug'ullanadigan modullarni (masalan, <em>Moliya</em> va <em>Ombor</em>, yoki <em>Mini App</em> va <em>Kassa</em>) alohida belgilab bering. Belgilanmagan har qanday modul bot klaviaturasidan yo'qoladi va bloklanadi.
        </div>
      </div>

      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 12px 16px;">Xodim (Telegram)</th>
                <th style="padding: 12px 16px;">Username</th>
                <th style="padding: 12px 16px;">Telefon raqami</th>
                <th style="padding: 12px 16px;">Biriktirilgan Rollar / Ruxsatlar</th>
                <th style="padding: 12px 16px;">Holat</th>
                <th style="padding: 12px 16px;">Sana</th>
                <th style="padding: 12px 16px; text-align: right;">Amallar</th>
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
    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="create-user-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">➕ Yangi foydalanuvchi yaratish</h3>
            <button onclick="UsersModule.closeModal('create-user-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="create-user-form" onsubmit="UsersModule.handleCreateUser(event)" style="padding: 24px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">F.I.Sh. (To'liq ism) *</label>
              <input type="text" id="new-full-name" class="input-styled" required placeholder="Masalan: Sardor Rahimov" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Login (Username) *</label>
                <input type="text" id="new-username" class="input-styled" required placeholder="sardor_ombor" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Telefon raqam</label>
                <input type="text" id="new-phone" class="input-styled" placeholder="+998901234567" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
              </div>
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Parol *</label>
              <input type="password" id="new-password" class="input-styled" required placeholder="••••••••" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">Tizimdagi Ruxsatlar & Modullar (Alohida-alohida belgilang) *</label>
              ${renderRoleCheckboxes("new_user_roles", "Ombor,Sotib olish (Zakup)")}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('create-user-modal')" class="btn btn-secondary" style="padding: 10px 18px;">Bekor qilish</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">Saqlash</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    const fullName = document.getElementById("new-full-name").value.trim();
    const username = document.getElementById("new-username").value.trim();
    const phone = document.getElementById("new-phone").value.trim();
    const password = document.getElementById("new-password").value;

    const checkedRoles = Array.from(document.querySelectorAll("input[name='new_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast("Iltimos, kamida bitta ruxsat/rol tanlang!", "error");
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
      showToast("Foydalanuvchi muvaffaqiyatli yaratildi!", "success");
      closeModal("create-user-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || "Xatolik yuz berdi!", "error");
    }
  }

  function openEditUserModal(userId) {
    const user = webUsers.find(u => u.id === userId);
    if (!user) return;

    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="edit-user-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">✏️ Foydalanuvchini tahrirlash: ${user.username}</h3>
            <button onclick="UsersModule.closeModal('edit-user-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="edit-user-form" onsubmit="UsersModule.handleEditUser(event, ${user.id})" style="padding: 24px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">F.I.Sh. *</label>
              <input type="text" id="edit-full-name" class="input-styled" required value="${user.full_name}" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Telefon raqam</label>
              <input type="text" id="edit-phone" class="input-styled" value="${user.phone_number !== '-' ? user.phone_number : ''}" placeholder="+998901234567" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">Tizimdagi Ruxsatlar & Modullar (Alohida-alohida belgilang) *</label>
              ${renderRoleCheckboxes("edit_user_roles", user.role)}
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Yangi Parol (agar o'zgartirilsa)</label>
              <input type="password" id="edit-password" class="input-styled" placeholder="Parolni o'zgartirmaslik uchun bo'sh qoldiring" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;" />
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('edit-user-modal')" class="btn btn-secondary" style="padding: 10px 18px;">Bekor qilish</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">Yangilash</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleEditUser(e, userId) {
    e.preventDefault();
    const fullName = document.getElementById("edit-full-name").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const password = document.getElementById("edit-password").value;

    const checkedRoles = Array.from(document.querySelectorAll("input[name='edit_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast("Iltimos, kamida bitta ruxsat/rol tanlang!", "error");
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
      showToast("Foydalanuvchi ma'lumotlari yangilandi!", "success");
      closeModal("edit-user-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || "Xatolik yuz berdi!", "error");
    }
  }

  async function toggleArchiveUser(userId, isCurrentlyArchived) {
    const actionName = isCurrentlyArchived ? "faollashtirishni" : "arxivlashni";
    if (!confirm(`Haqiqatan ham ushbu foydalanuvchini ${actionName} xohlaysizmi?`)) return;

    try {
      await API.archiveUser(userId);
      showToast("Foydalanuvchi holati yangilandi!", "success");
      await loadData();
    } catch (err) {
      showToast(err.message || "Xatolik yuz berdi!", "error");
    }
  }

  // ==================== TELEGRAM USER APPROVAL MODAL ====================

  function openApproveTgUserModal(tgDbId) {
    const u = telegramUsers.find(item => item.id === tgDbId);
    if (!u) return;

    const modalsContainer = document.getElementById("users-modals");
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="modal-overlay" id="approve-tg-modal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: #fff; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">👑 Telegram foydalanuvchisiga ruxsatlar biriktirish</h3>
            <button onclick="UsersModule.closeModal('approve-tg-modal')" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
          </div>

          <form id="approve-tg-form" onsubmit="UsersModule.handleApproveTgUser(event, ${u.id})" style="padding: 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 18px;">
              <div style="font-weight: 700; font-size: 15px; color: #0f172a;">${u.first_name} ${u.last_name || ''}</div>
              <div style="font-size: 13px; color: #475569; margin-top: 4px;">📱 Telefon: <strong>${u.phone_number}</strong></div>
              <div style="font-size: 13px; color: #64748b; margin-top: 2px;">✈️ Telegram: @${u.username || '-'} (ID: ${u.telegram_id})</div>
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">Ushbu xodimga qaysi rollar/modullarni biriktirasiz? (Alohida-alohida belgilang) *</label>
              ${renderRoleCheckboxes("tg_user_roles", u.role === 'Kutilmoqda' ? 'Ombor' : u.role)}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="UsersModule.closeModal('approve-tg-modal')" class="btn btn-secondary" style="padding: 10px 18px;">Bekor qilish</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 22px;">✅ Tasdiqlash & Saqlash</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleApproveTgUser(e, tgDbId) {
    e.preventDefault();
    const checkedRoles = Array.from(document.querySelectorAll("input[name='tg_user_roles']:checked")).map(el => el.value);
    if (checkedRoles.length === 0) {
      showToast("Iltimos, kamida bitta ruxsat/rol tanlang!", "error");
      return;
    }
    const role = checkedRoles.join(",");

    try {
      await API.approveTelegramUser(tgDbId, role);
      showToast(`Foydalanuvchi tasdiqlandi: [${role}] ruxsatlari berildi!`, "success");
      closeModal("approve-tg-modal");
      await loadData();
    } catch (err) {
      showToast(err.message || "Xatolik yuz berdi!", "error");
    }
  }

  async function deleteTgUser(tgDbId) {
    if (!confirm("Ushbu telegram foydalanuvchisini o'chirishni tasdiqlaysizmi?")) return;
    try {
      await API.deleteTelegramUser(tgDbId);
      showToast("Telegram foydalanuvchisi o'chirildi!", "info");
      await loadData();
    } catch (err) {
      showToast(err.message || "Xatolik yuz berdi!", "error");
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
    openApproveTgUserModal,
    handleApproveTgUser,
    deleteTgUser,
    closeModal,
    selectAllRoles,
    clearAllRoles
  };
})();
