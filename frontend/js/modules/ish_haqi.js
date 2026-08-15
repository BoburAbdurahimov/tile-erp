const IshHaqiModule = (function () {
  let activeTab = "payroll"; // 'payroll' | 'daily' | 'employees' | 'job_types'
  let activeDept = "all"; // 'all' | "Ma'muriyat" | "1-Liniya" | "2-Liniya" | "3-Liniya" | "4-Liniya" | "5-Liniya"
  let currentYearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
  let currentDailyDate = new Date().toISOString().slice(0, 10); // e.g. "2026-08-15"

  let payrollData = null;
  let dailyData = null;
  let employeesList = [];
  let jobTypesList = [];

  const DEPARTMENTS = [
    { id: "all", name: { uz: "Barchasi", ru: "Все отделы" }, icon: "🌐" },
    { id: "Ma'muriyat", name: { uz: "Ma'muriyat & Ofis", ru: "Администрация & Офис" }, icon: "👑" },
    { id: "1-Liniya", name: { uz: "1-Liniya (Formovka & Press)", ru: "1-Линия (Формовка & Пресс)" }, icon: "🏭" },
    { id: "2-Liniya", name: { uz: "2-Liniya (Glazurlash)", ru: "2-Линия (Глазуровка)" }, icon: "🎨" },
    { id: "3-Liniya", name: { uz: "3-Liniya (Pech & Kuydirish)", ru: "3-Линия (Печь & Обжиг)" }, icon: "🔥" },
    { id: "4-Liniya", name: { uz: "4-Liniya (Saralash & Sifat)", ru: "4-Линия (Сортировка & Контроль)" }, icon: "🔍" },
    { id: "5-Liniya", name: { uz: "5-Liniya (Qadoqlash & Yuklash)", ru: "5-Линия (Упаковка & Погрузка)" }, icon: "📦" }
  ];

  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/,/g, " ");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isUzbek() {
    return (typeof CURRENT_LANG !== "undefined" && CURRENT_LANG === "uz");
  }

  function getI18n() {
    const isUz = isUzbek();
    return {
      title: isUz ? "Ish haqi va Xodimlar boshqaruvi" : "Управление зарплатой и персоналом",
      subtitle: isUz ? "6 ta bo'lim (5 ta liniya + Ma'muriyat), fiks va ishbay oyliklar hisobi" : "6 отделов (5 линий + Администрация), окладный и сдельный расчет ЗП",
      tab_payroll: isUz ? "📊 Oylik hisob-kitob" : "📊 Ведомость ЗП",
      tab_daily: isUz ? "📅 Kunlik davomat & Ishlar" : "📅 Ежедневный учет",
      tab_employees: isUz ? "👥 Xodimlar ro'yxati" : "👥 Сотрудники",
      tab_job_types: isUz ? "🛠️ Ish turlari & Narxlar" : "🛠️ Виды работ и Расценки",
      
      kpi_total: isUz ? "Jami hisoblangan ish haqi" : "Общий фонд начисленной ЗП",
      kpi_fixed: isUz ? "Fiksalangan maoshlar" : "Окладная часть",
      kpi_piecework: isUz ? "Ishbay to'lovlar" : "Сдельная часть",
      kpi_paid: isUz ? "To'langan / Qoldiq" : "Выплачено / Остаток",
      
      btn_recalc: isUz ? "🔄 Qayta hisoblash" : "🔄 Пересчитать",
      btn_finalize: isUz ? "🔒 Oyni tasdiqlash" : "🔒 Зафиксировать",
      btn_reopen: isUz ? "🔓 Qayta ochish" : "🔓 Открыть для правок",
      btn_excel: isUz ? "📥 Excel yuklab olish" : "📥 Экспорт в Excel",
      btn_add_emp: isUz ? "➕ Yangi xodim qo'shish" : "➕ Добавить сотрудника",
      btn_add_job: isUz ? "➕ Yangi ish turi" : "➕ Новый вид работы",
      btn_add_work: isUz ? "➕ Ishbay naryad qo'shish" : "➕ Добавить наряд",
      btn_save_att: isUz ? "💾 Davomatni saqlash" : "💾 Сохранить табель",
      
      type_fixed: isUz ? "🏢 Fiksalangan" : "🏢 Оклад",
      type_piecework: isUz ? "🔨 Ishbay" : "🔨 Сдельный",
      
      status_draft: isUz ? "🟡 Qoralama" : "🟡 Черновик",
      status_finalized: isUz ? "🟢 Tasdiqlangan" : "🟢 Зафиксирован",
      status_paid: isUz ? "✅ To'langan" : "✅ Выплачено",
      
      locked_warning: isUz ? "⚠️ Ushbu oy qulflangan. Tahrirlash uchun avval 'Qayta ochish' tugmasini bosing." : "⚠️ Этот месяц зафиксирован. Для внесения изменений сначала откройте период."
    };
  }

  function getDeptBadge(dept) {
    const d = dept || "Ma'muriyat";
    let color = "#3b82f6";
    let bg = "#eff6ff";
    let icon = "🏢";

    if (d === "Ma'muriyat") { color = "#dc2626"; bg = "#fef2f2"; icon = "👑"; }
    else if (d === "1-Liniya") { color = "#d97706"; bg = "#fffbeb"; icon = "🏭"; }
    else if (d === "2-Liniya") { color = "#0284c7"; bg = "#f0f9ff"; icon = "🎨"; }
    else if (d === "3-Liniya") { color = "#ea580c"; bg = "#fff7ed"; icon = "🔥"; }
    else if (d === "4-Liniya") { color = "#7c3aed"; bg = "#f5f3ff"; icon = "🔍"; }
    else if (d === "5-Liniya") { color = "#059669"; bg = "#ecfdf5"; icon = "📦"; }

    return `<span class="badge" style="background:${bg}; color:${color}; border:1px solid ${color}30; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">${icon} ${escapeHtml(d)}</span>`;
  }

  function renderDeptFilterBar() {
    const isUz = isUzbek();
    return `
      <div class="tabs-nav" style="display: flex; gap: 6px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; flex-wrap: wrap; padding-bottom: 6px;">
        ${DEPARTMENTS.map(d => {
          const isActive = activeDept === d.id;
          const label = isUz ? d.name.uz : d.name.ru;
          return `
            <button class="tab-btn ${isActive ? 'active' : ''}" onclick="IshHaqiModule.filterDepartment('${d.id}')" 
              style="padding: 6px 12px; font-size: 12.5px; font-weight: ${isActive ? '700' : '600'}; border-radius: 8px; border: ${isActive ? '1px solid #2563eb' : '1px solid #cbd5e1'}; background: ${isActive ? '#eff6ff' : '#f8fafc'}; color: ${isActive ? '#1d4ed8' : '#475569'}; cursor: pointer; transition: all 0.2s;">
              <span>${d.icon}</span> <span>${label}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  async function render() {
    const container = document.getElementById("salary-module");
    if (!container) return;

    const t = getI18n();

    container.innerHTML = `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>👷</span> <span>${t.title}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">${t.subtitle}</p>
          </div>
          <div class="tabs-nav" style="margin-bottom: 0; border-bottom: none; gap: 6px; flex-wrap: wrap;">
            <button class="tab-btn ${activeTab === 'payroll' ? 'active' : ''}" onclick="IshHaqiModule.switchTab('payroll')">${t.tab_payroll}</button>
            <button class="tab-btn ${activeTab === 'daily' ? 'active' : ''}" onclick="IshHaqiModule.switchTab('daily')">${t.tab_daily}</button>
            <button class="tab-btn ${activeTab === 'employees' ? 'active' : ''}" onclick="IshHaqiModule.switchTab('employees')">${t.tab_employees}</button>
            <button class="tab-btn ${activeTab === 'job_types' ? 'active' : ''}" onclick="IshHaqiModule.switchTab('job_types')">${t.tab_job_types}</button>
          </div>
        </div>
      </div>

      <div id="salary-tab-content"></div>

      <!-- Modals Container -->
      <div id="salary-modals-host"></div>
    `;

    await loadActiveTabContent();
  }

  async function switchTab(tabName) {
    activeTab = tabName;
    const btns = document.querySelectorAll("#salary-module .card-header .tab-btn");
    btns.forEach(btn => btn.classList.remove("active"));
    if (tabName === "payroll" && btns[0]) btns[0].classList.add("active");
    if (tabName === "daily" && btns[1]) btns[1].classList.add("active");
    if (tabName === "employees" && btns[2]) btns[2].classList.add("active");
    if (tabName === "job_types" && btns[3]) btns[3].classList.add("active");
    await loadActiveTabContent();
  }

  async function filterDepartment(deptId) {
    activeDept = deptId;
    await loadActiveTabContent();
  }

  async function loadActiveTabContent() {
    const host = document.getElementById("salary-tab-content");
    if (!host) return;

    if (activeTab === "payroll") {
      await renderPayrollTab(host);
    } else if (activeTab === "daily") {
      await renderDailyTab(host);
    } else if (activeTab === "employees") {
      await renderEmployeesTab(host);
    } else if (activeTab === "job_types") {
      await renderJobTypesTab(host);
    }
  }

  // ===========================================================================
  // TAB 1: PAYROLL SUMMARY
  // ===========================================================================
  async function renderPayrollTab(container) {
    const t = getI18n();
    const isUz = isUzbek();
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>`;

    try {
      payrollData = await API.getPayroll(currentYearMonth);
    } catch (err) {
      showToast(err.message, "error");
      container.innerHTML = `<div class="card" style="color: red; padding: 20px;">${err.message}</div>`;
      return;
    }

    const isLocked = payrollData.is_all_finalized;

    // Filter calculations by active department
    let calculations = payrollData.calculations || [];
    if (activeDept !== "all") {
      calculations = calculations.filter(c => c.department === activeDept);
    }

    let rowsHtml = "";
    if (calculations.length === 0) {
      rowsHtml = `<tr><td colspan="10" style="text-align:center; padding: 30px; color: #94a3b8;">${isUz ? "Ushbu bo'lim uchun hisob-kitoblar topilmadi." : "Нет начислений по выбранному отделу."}</td></tr>`;
    } else {
      calculations.forEach((c, idx) => {
        const isFixed = c.employee_type === "fixed";
        const typeBadge = isFixed 
          ? `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${t.type_fixed}</span>` 
          : `<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">${t.type_piecework}</span>`;

        let statusBadge = "";
        if (c.status === "paid") {
          statusBadge = `<span class="badge badge-success">${t.status_paid}</span>`;
        } else if (c.status === "finalized") {
          statusBadge = `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;">${t.status_finalized}</span>`;
        } else {
          statusBadge = `<span class="badge badge-warning">${t.status_draft}</span>`;
        }

        const baseOrPiece = isFixed 
          ? `${formatNumber(c.base_salary)} <small style="color:#64748b;">UZS</small>`
          : `${formatNumber(c.piecework_total)} <small style="color:#64748b;">UZS</small>`;

        const absenceInfo = isFixed 
          ? (c.absent_days > 0 
              ? `<span style="color:#ef4444; font-weight:700;">-${c.absent_days} ${isUz ? "kun" : "дн"} (${formatNumber(c.deduction_amount)})</span>` 
              : `<span style="color:#10b981;">0 ${isUz ? "kun" : "дн"}</span>`)
          : `<span style="color:#94a3b8;">-</span>`;

        const workDaysInfo = isFixed ? `${c.standard_days} ${isUz ? "kun" : "дн"}` : "-";

        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td>
              <div style="font-weight: 700; color: #0f172a;">${escapeHtml(c.full_name)}</div>
              <div style="font-size: 11px; color: #64748b;">${escapeHtml(c.position)}</div>
            </td>
            <td>${getDeptBadge(c.department)}</td>
            <td>${typeBadge}</td>
            <td style="text-align: right; font-weight: 600; font-family: monospace;">${baseOrPiece}</td>
            <td style="text-align: center;">${workDaysInfo}</td>
            <td style="text-align: center;">${absenceInfo}</td>
            <td style="text-align: right; font-weight: 800; color: #1e3a8a; font-family: monospace; font-size: 14px;">
              ${formatNumber(c.final_amount)} <small>UZS</small>
            </td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openDetailsModal(${c.id})" title="${isUz ? "Batafsil hisob-kitob" : "Детали начисления"}">👁️</button>
              ${c.status !== "paid" 
                ? `<button class="btn btn-primary btn-sm" onclick="IshHaqiModule.openPayModal(${c.id}, '${escapeHtml(c.full_name)}', ${c.final_amount})" style="margin-left: 4px;">💵 ${isUz ? "To'lash" : "Выплатить"}</button>`
                : `<span style="font-size: 11px; color: #059669; font-weight: 700; margin-left: 4px;">✓ ${isUz ? "To'langan" : "Оплачено"}</span>`
              }
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <!-- Month & Action Controls -->
      <div class="card" style="margin-bottom: 16px; padding: 14px 18px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="font-size: 13px; font-weight: 700; color: #0f172a;">${isUz ? "Hisob davri (Oy):" : "Период (Месяц):"}</label>
            <input type="month" id="payroll-month-select" class="form-control" value="${currentYearMonth}" onchange="IshHaqiModule.changePayrollMonth(this.value)" style="width: 170px; padding: 6px 12px; font-weight: 600;">
            ${isLocked 
              ? `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:6px 12px; font-size:12px;">🔒 ${isUz ? "Oy qulflangan" : "Период зафиксирован"}</span>` 
              : `<span class="badge badge-warning" style="padding:6px 12px; font-size:12px;">✏️ ${isUz ? "Ochiq (Qoralama)" : "Открыт (Черновик)"}</span>`}
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.recalculatePayroll()" ${isLocked ? "disabled" : ""}>${t.btn_recalc}</button>
            ${!isLocked 
              ? `<button class="btn btn-warning btn-sm" onclick="IshHaqiModule.finalizePayroll()">${t.btn_finalize}</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.reopenPayroll()">${t.btn_reopen}</button>`
            }
            <button class="btn btn-success btn-sm" onclick="IshHaqiModule.exportExcel()">${t.btn_excel}</button>
          </div>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <div class="grid-4" style="margin-bottom: 16px;">
        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_total}</div>
          <div class="kpi-value" style="color: #2563eb;">${formatNumber(payrollData.total_payroll)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${payrollData.total_employees} ${isUz ? "nafar xodim" : "сотрудников"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_fixed}</div>
          <div class="kpi-value" style="color: #0f172a;">${formatNumber(payrollData.total_fixed)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${isUz ? "Oylik fiks shtat" : "Окладный штат"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_piecework}</div>
          <div class="kpi-value" style="color: #d97706;">${formatNumber(payrollData.total_piecework)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${isUz ? "Bajarilgan ishlar hajmi" : "Сдельные объемы"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_paid}</div>
          <div class="kpi-value" style="color: #10b981;">${formatNumber(payrollData.total_paid)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub" style="color: #ef4444 !important;">${isUz ? "Qoldiq:" : "Остаток:"} ${formatNumber(payrollData.total_unpaid)} UZS</div>
        </div>
      </div>

      <!-- Payroll Table Card -->
      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div class="card-title" style="font-size: 16px; font-weight: 700;">📋 ${isUz ? "Xodimlar bo'yicha hisob-kitob vedomosti" : "Расчетная ведомость по сотрудникам"}</div>
            <div style="font-size: 12px; color: #64748b;">${calculations.length} ${isUz ? "ta yozuv ko'rsatilmoqda" : "записей"}</div>
          </div>
          ${renderDeptFilterBar()}
        </div>

        <div class="table-container">
          <table class="data-table" id="payroll-data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">№</th>
                <th>
                  <div>${isUz ? "Xodim (F.I.SH.)" : "Сотрудник (Ф.И.О.)"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Bo'lim / Liniya" : "Отдел / Линия"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Turi" : "Тип"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th style="text-align: right;">${isUz ? "Asosiy / Ishbay" : "Оклад / Сдельно"}</th>
                <th style="text-align: center;">${isUz ? "Reja kun" : "Раб. дней"}</th>
                <th style="text-align: center;">${isUz ? "Kelmadi / Ushlanma" : "Невыходы / Удержание"}</th>
                <th style="text-align: right;">${isUz ? "Jami to'lov" : "К выплате"}</th>
                <th style="text-align: center;">${isUz ? "Holati" : "Статус"}</th>
                <th style="text-align: right;">${isUz ? "Amallar" : "Действия"}</th>
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

  function changePayrollMonth(val) {
    if (!val) return;
    currentYearMonth = val;
    loadActiveTabContent();
  }

  async function recalculatePayroll() {
    try {
      showToast(isUzbek() ? "Qayta hisoblanmoqda..." : "Пересчитываем...", "info");
      await API.calculatePayroll(currentYearMonth);
      showToast(isUzbek() ? "Ish haqi muvaffaqiyatli hisoblandi!" : "Зарплата успешно пересчитана!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function finalizePayroll() {
    const isUz = isUzbek();
    const conf = confirm(isUz 
      ? `${currentYearMonth} oyi ish haqi vedomostini tasdiqlab, tahrirlashdan qulflaysizmi?` 
      : `Зафиксировать расчетную ведомость за ${currentYearMonth}?`);
    if (!conf) return;

    try {
      await API.finalizePayroll(currentYearMonth);
      showToast(isUz ? "Vedomost tasdiqlandi va qulflandi!" : "Ведомость зафиксирована!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function reopenPayroll() {
    const isUz = isUzbek();
    const conf = confirm(isUz 
      ? `${currentYearMonth} oyi vedomostini qayta tahrirlash uchun ochmoqchimisiz?` 
      : `Открыть ведомость за ${currentYearMonth} для редактирования?`);
    if (!conf) return;

    try {
      await API.reopenPayroll(currentYearMonth);
      showToast(isUz ? "Vedomost tahrirlash uchun ochildi!" : "Ведомость открыта для правок!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function exportExcel() {
    window.open(`${API_BASE}/salary/payroll/${currentYearMonth}/export-excel`, "_blank");
  }

  // ===========================================================================
  // TAB 2: DAILY ATTENDANCE & WORK ENTRY
  // ===========================================================================
  async function renderDailyTab(container) {
    const t = getI18n();
    const isUz = isUzbek();
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>`;

    try {
      dailyData = await API.getDailySalaryData(currentDailyDate);
      jobTypesList = await API.getJobTypes(true);
      employeesList = await API.getEmployees(null, true);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    const isLocked = dailyData.is_locked;

    // Filter fixed employees by active department
    let fixedEmps = dailyData.fixed_employees || [];
    if (activeDept !== "all") {
      fixedEmps = fixedEmps.filter(e => e.department === activeDept);
    }

    // Filter piecework entries by active department
    let pieceEntries = dailyData.piecework_entries || [];
    if (activeDept !== "all") {
      pieceEntries = pieceEntries.filter(p => p.department === activeDept);
    }

    // Fixed employees attendance rows
    let fixedRows = "";
    if (fixedEmps.length === 0) {
      fixedRows = `<div style="padding: 20px; text-align: center; color: #94a3b8;">${isUz ? "Ushbu bo'limda fiksalangan xodimlar mavjud emas" : "Нет окладных сотрудников в этом отделе"}</div>`;
    } else {
      fixedEmps.forEach(emp => {
        fixedRows += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; gap: 10px;">
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 13.5px; color: #0f172a;">${escapeHtml(emp.full_name)}</div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                ${getDeptBadge(emp.department)}
                <span style="font-size: 11px; color: #64748b;">${escapeHtml(emp.position)}</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: ${emp.is_absent ? '#ef4444' : '#10b981'};">
                <input type="checkbox" class="att-checkbox" data-empid="${emp.id}" ${emp.is_absent ? 'checked' : ''} ${isLocked ? 'disabled' : ''} onchange="IshHaqiModule.toggleAttRow(this, ${emp.id})">
                <span>${emp.is_absent ? (isUz ? '🔴 Kelmadi' : '🔴 Не вышел') : (isUz ? '🟢 Ishda' : '🟢 На работе')}</span>
              </label>
              <input type="text" id="att-reason-${emp.id}" class="form-control" placeholder="${isUz ? 'Sababi...' : 'Причина...'}" value="${escapeHtml(emp.reason || '')}" style="width: 140px; padding: 4px 8px; font-size: 12px; display: ${emp.is_absent ? 'block' : 'none'};" ${isLocked ? 'disabled' : ''}>
            </div>
          </div>
        `;
      });
    }

    // Piecework entries table rows
    let pieceRows = "";
    if (pieceEntries.length === 0) {
      pieceRows = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #94a3b8;">${isUz ? "Ushbu bo'limda yozuvlar yo'q" : "Нет записей"}</td></tr>`;
    } else {
      pieceEntries.forEach((p, idx) => {
        pieceRows += `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-weight: 700;">${escapeHtml(p.employee_name)}</td>
            <td>${getDeptBadge(p.department)}</td>
            <td>${escapeHtml(p.job_name)}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 600;">${formatNumber(p.quantity)} ${p.unit_of_measure}</td>
            <td style="text-align: right; font-family: monospace; color: #64748b;">${formatNumber(p.unit_price)}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 800; color: #d97706;">${formatNumber(p.total_amount)} <small>UZS</small></td>
            <td style="text-align: center;">
              ${!isLocked ? `<button class="btn btn-danger btn-sm" onclick="IshHaqiModule.deleteWorkEntry(${p.id})">🗑️</button>` : `<span style="color:#94a3b8;">-</span>`}
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <!-- Date Picker & Filter Header -->
      <div class="card" style="margin-bottom: 16px; padding: 14px 18px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="font-size: 13px; font-weight: 700; color: #0f172a;">${isUz ? "Hisob sanasi:" : "Дата учета:"}</label>
            <input type="date" id="daily-date-select" class="form-control" value="${currentDailyDate}" onchange="IshHaqiModule.changeDailyDate(this.value)" style="width: 170px; padding: 6px 12px; font-weight: 600;">
          </div>
          ${isLocked ? `<div class="badge badge-danger" style="padding: 6px 14px; font-size: 12px;">${t.locked_warning}</div>` : ''}
        </div>
        ${renderDeptFilterBar()}
      </div>

      <div class="grid-2">
        <!-- Section 1: Fixed Employees Absences -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title" style="font-size: 15px; font-weight: 700;">🏢 ${isUz ? "Fiksalangan xodimlar davomati" : "Табель окладных сотрудников"}</div>
            ${!isLocked ? `<button class="btn btn-primary btn-sm" onclick="IshHaqiModule.saveAttendance()">${t.btn_save_att}</button>` : ''}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            ${isUz ? "Ishga kelmagan bo'lsa, 'Kelmadi' deb belgilang. Kunlik maosh avtomatik chegiriladi." : "Отметьте сотрудников, которые не вышли. Дневная ставка будет удержана."}
          </p>
          <div style="max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            ${fixedRows}
          </div>
        </div>

        <!-- Section 2: Piecework Jobs Entry -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title" style="font-size: 15px; font-weight: 700;">🔨 ${isUz ? "Ishbay xodimlar naryadlari" : "Сдельные наряды"}</div>
            ${!isLocked ? `<button class="btn btn-warning btn-sm" onclick="IshHaqiModule.openAddWorkModal()">${t.btn_add_work}</button>` : ''}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            ${isUz ? "Bajarilgan ishlar hajmini kiriting. Oylik hisob-kitob avtomatik yangilanadi." : "Внесите объем работ за день. Сумма сразу отобразится в ведомости."}
          </p>
          <div class="table-container" style="max-height: 480px;">
            <table class="data-table" id="daily-piecework-table">
              <thead>
                <tr>
                  <th style="width: 30px;">№</th>
                  <th>${isUz ? "Xodim" : "Сотрудник"}</th>
                  <th>${isUz ? "Bo'lim" : "Отдел"}</th>
                  <th>${isUz ? "Ish turi" : "Вид работы"}</th>
                  <th style="text-align: right;">${isUz ? "Hajm" : "Объем"}</th>
                  <th style="text-align: right;">${isUz ? "Narxi" : "Тариф"}</th>
                  <th style="text-align: right;">${isUz ? "Summa" : "Сумма"}</th>
                  <th style="text-align: center;">${isUz ? "O'chirish" : "Удалить"}</th>
                </tr>
              </thead>
              <tbody>
                ${pieceRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function changeDailyDate(val) {
    if (!val) return;
    currentDailyDate = val;
    loadActiveTabContent();
  }

  function toggleAttRow(chk, empId) {
    const isUz = isUzbek();
    const span = chk.nextElementSibling;
    const reasonInput = document.getElementById(`att-reason-${empId}`);
    if (chk.checked) {
      span.innerText = isUz ? "🔴 Kelmadi" : "🔴 Не вышел";
      span.parentElement.style.color = "#ef4444";
      if (reasonInput) reasonInput.style.display = "block";
    } else {
      span.innerText = isUz ? "🟢 Ishda" : "🟢 На работе";
      span.parentElement.style.color = "#10b981";
      if (reasonInput) {
        reasonInput.style.display = "none";
        reasonInput.value = "";
      }
    }
  }

  async function saveAttendance() {
    const checkboxes = document.querySelectorAll(".att-checkbox");
    const absentRecords = [];
    checkboxes.forEach(chk => {
      if (chk.checked) {
        const empId = parseInt(chk.getAttribute("data-empid"));
        const reasonInput = document.getElementById(`att-reason-${empId}`);
        absentRecords.push({
          employee_id: empId,
          reason: reasonInput ? reasonInput.value : ""
        });
      }
    });

    try {
      await API.saveDailyAttendance({
        date: currentDailyDate,
        absent_records: absentRecords,
        current_user: CURRENT_USER ? CURRENT_USER.username : "Admin"
      });
      showToast(isUzbek() ? "Davomat muvaffaqiyatli saqlandi!" : "Табель успешно сохранен!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deleteWorkEntry(id) {
    const isUz = isUzbek();
    if (!confirm(isUz ? "Ushbu yozuvni o'chirasizmi?" : "Удалить эту запись?")) return;
    try {
      await API.deleteDailyWork(id);
      showToast(isUz ? "Yozuv o'chirildi!" : "Запись удалена!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ===========================================================================
  // TAB 3: EMPLOYEES DIRECTORY
  // ===========================================================================
  async function renderEmployeesTab(container) {
    const t = getI18n();
    const isUz = isUzbek();
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>`;

    try {
      employeesList = await API.getEmployees(null, false);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    // Filter employees by active department
    let filteredList = employeesList;
    if (activeDept !== "all") {
      filteredList = filteredList.filter(e => e.department === activeDept);
    }

    let rowsHtml = "";
    if (filteredList.length === 0) {
      rowsHtml = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8;">${isUz ? "Ushbu bo'limda xodimlar topilmadi" : "Сотрудники не найдены в этом отделе"}</td></tr>`;
    } else {
      filteredList.forEach((e, idx) => {
        const isFixed = e.employee_type === "fixed";
        const typeBadge = isFixed 
          ? `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${t.type_fixed}</span>` 
          : `<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">${t.type_piecework}</span>`;

        const statusBadge = e.is_active 
          ? `<span class="badge badge-success">${isUz ? "🟢 Faol" : "🟢 Активен"}</span>` 
          : `<span class="badge badge-danger">${isUz ? "📁 Nofaol" : "📁 В архиве"}</span>`;

        const salaryStr = isFixed 
          ? `${formatNumber(e.monthly_salary)} <small>UZS</small>` 
          : `<span style="color:#64748b;">${isUz ? "Tarif bo'yicha" : "По расценкам"}</span>`;

        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(e.full_name)}</td>
            <td>${getDeptBadge(e.department)}</td>
            <td>${escapeHtml(e.position)}</td>
            <td>${typeBadge}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700;">${salaryStr}</td>
            <td style="text-align: center; color: #64748b; font-size: 12px;">${e.phone_number || '-'}</td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openEditEmployeeModal(${e.id})">✏️ ${isUz ? "Tahrirlash" : "Изм."}</button>
              <button class="btn ${e.is_active ? 'btn-danger' : 'btn-success'} btn-sm" onclick="IshHaqiModule.toggleEmployeeStatus(${e.id})" style="margin-left: 4px;">
                ${e.is_active ? (isUz ? "📁 Arxivlash" : "📁 В архив") : (isUz ? "♻️ Tiklash" : "♻️ Восстановить")}
              </button>
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div>
              <div class="card-title" style="font-size: 16px; font-weight: 700;">👥 ${isUz ? "Fabrika xodimlari ro'yxati (6 ta bo'lim bo'yicha)" : "Штатное расписание (по 6 отделам)"}</div>
              <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${filteredList.length} ${isUz ? "nafar xodim" : "сотрудников"}</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="IshHaqiModule.openAddEmployeeModal()">${t.btn_add_emp}</button>
          </div>
          ${renderDeptFilterBar()}
        </div>

        <div class="table-container">
          <table class="data-table" id="employees-data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">№</th>
                <th>
                  <div>${isUz ? "F.I.SH." : "Ф.И.О."}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Bo'lim / Liniya" : "Отдел / Линия"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Lavozimi" : "Должность"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "To'lov turi" : "Тип оплаты"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th style="text-align: right;">${isUz ? "Oylik maosh" : "Оклад"}</th>
                <th style="text-align: center;">${isUz ? "Telefon" : "Телефон"}</th>
                <th style="text-align: center;">${isUz ? "Holati" : "Статус"}</th>
                <th style="text-align: right;">${isUz ? "Amallar" : "Действия"}</th>
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

  async function toggleEmployeeStatus(id) {
    try {
      await API.toggleEmployeeActive(id);
      showToast(isUzbek() ? "Xodim holati yangilandi!" : "Статус сотрудника изменен!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ===========================================================================
  // TAB 4: JOB TYPES (PIECEWORK CATALOG)
  // ===========================================================================
  async function renderJobTypesTab(container) {
    const t = getI18n();
    const isUz = isUzbek();
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>`;

    try {
      jobTypesList = await API.getJobTypes(false);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    let rowsHtml = "";
    if (jobTypesList.length === 0) {
      rowsHtml = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">${isUz ? "Ish turlari mavjud emas" : "Виды работ не добавлены"}</td></tr>`;
    } else {
      jobTypesList.forEach((j, idx) => {
        const statusBadge = j.is_active 
          ? `<span class="badge badge-success">${isUz ? "🟢 Faol" : "🟢 Активен"}</span>` 
          : `<span class="badge badge-danger">${isUz ? "📁 Nofaol" : "📁 Отключен"}</span>`;

        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(j.name)}</td>
            <td style="text-align: center;"><span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHtml(j.unit_of_measure)}</span></td>
            <td style="text-align: right; font-weight: 800; font-family: monospace; color: #2563eb; font-size: 14px;">${formatNumber(j.price_per_unit)} <small>UZS</small></td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openEditJobTypeModal(${j.id})">✏️ ${isUz ? "Tahrirlash" : "Изм."}</button>
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="card-title" style="font-size: 16px; font-weight: 700;">🛠️ ${isUz ? "Ishbay narxlar spravochnigi" : "Справочник расценок сдельных работ"}</div>
            <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${jobTypesList.length} ${isUz ? "ta ish turi" : "видов работ"}</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="IshHaqiModule.openAddJobTypeModal()">${t.btn_add_job}</button>
        </div>
        <div class="table-container">
          <table class="data-table" id="job-types-data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">№</th>
                <th>
                  <div>${isUz ? "Ish nomi / Operatsiya" : "Наименование работы"}</div>
                  <input type="text" class="table-col-filter" placeholder="🔎 ${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th style="text-align: center;">${isUz ? "Birligi" : "Ед. изм."}</th>
                <th style="text-align: right;">${isUz ? "Birlik narxi (Tarif)" : "Расценка за единицу"}</th>
                <th style="text-align: center;">${isUz ? "Holati" : "Статус"}</th>
                <th style="text-align: right;">${isUz ? "Amallar" : "Действия"}</th>
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

  // ===========================================================================
  // MODALS
  // ===========================================================================
  function getDeptOptions(selectedDept = "Ma'muriyat") {
    const isUz = isUzbek();
    return DEPARTMENTS.filter(d => d.id !== "all").map(d => `
      <option value="${d.id}" ${d.id === selectedDept ? 'selected' : ''}>${d.icon} ${isUz ? d.name.uz : d.name.ru}</option>
    `).join("");
  }

  function openAddEmployeeModal() {
    const isUz = isUzbek();
    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="emp-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">➕ ${isUz ? "Yangi xodim qo'shish" : "Добавление нового сотрудника"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('emp-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateEmployee(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "F.I.SH. (To'liq ism-familiya)" : "Ф.И.О. сотрудника"} *</label>
                <input type="text" id="emp-fullname" class="form-control" required placeholder="Masalan: Karimov Dilshod">
              </div>

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Bo'lim / Ishlab chiqarish liniyasi" : "Отдел / Производственная линия"} *</label>
                  <select id="emp-dept" class="form-control">
                    ${getDeptOptions(activeDept !== "all" ? activeDept : "1-Liniya")}
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Oylik hisoblash turi" : "Тип оплаты"} *</label>
                  <select id="emp-type" class="form-control" onchange="IshHaqiModule.handleEmpTypeChange(this.value)">
                    <option value="fixed">${isUz ? "🏢 Fiksalangan oylik (Oklad)" : "🏢 Оклад (Фиксированная ЗП)"}</option>
                    <option value="piecework">${isUz ? "🔨 Ishbay (Sdelnaya)" : "🔨 Сдельная (За объем работ)"}</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Lavozimi" : "Должность"}</label>
                <input type="text" id="emp-position" class="form-control" placeholder="Masalan: Katta usta, Saralovchi, Press operatori">
              </div>

              <div id="emp-fixed-fields">
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label class="form-label">${isUz ? "Oylik maoshi (UZS)" : "Оклад в месяц (UZS)"} *</label>
                    <input type="number" id="emp-salary" class="form-control" value="5000000" step="10000">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label class="form-label">${isUz ? "Reja ish kunlari (Oyiga)" : "Рабочих дней в месяц"}</label>
                    <input type="number" id="emp-workdays" class="form-control" value="26" min="1" max="31">
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Telefon raqami" : "Номер телефона"}</label>
                  <input type="text" id="emp-phone" class="form-control" placeholder="+998901234567">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Ishga qabul sanasi" : "Дата приема на работу"}</label>
                  <input type="date" id="emp-hiredate" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('emp-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function handleEmpTypeChange(val) {
    const fixedDiv = document.getElementById("emp-fixed-fields");
    if (fixedDiv) {
      fixedDiv.style.display = val === "fixed" ? "block" : "none";
    }
  }

  async function handleCreateEmployee(e) {
    e.preventDefault();
    const isUz = isUzbek();
    const fullName = document.getElementById("emp-fullname").value;
    const department = document.getElementById("emp-dept").value;
    const empType = document.getElementById("emp-type").value;
    const position = document.getElementById("emp-position").value;
    const phone = document.getElementById("emp-phone").value;
    const salary = parseFloat(document.getElementById("emp-salary")?.value || 0);
    const workDays = parseInt(document.getElementById("emp-workdays")?.value || 26);
    const hireDate = document.getElementById("emp-hiredate").value;

    try {
      await API.createEmployee({
        full_name: fullName,
        department: department,
        employee_type: empType,
        position: position,
        phone_number: phone,
        monthly_salary: salary,
        standard_work_days: workDays,
        hire_date: hireDate || null
      });
      showToast(isUz ? "Yangi xodim muvaffaqiyatli qo'shildi!" : "Сотрудник успешно добавлен!", "success");
      closeModal("emp-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openEditEmployeeModal(id) {
    const isUz = isUzbek();
    const emp = employeesList.find(e => e.id === id);
    if (!emp) return;

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="emp-edit-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">✏️ ${isUz ? "Xodim ma'lumotlarini tahrirlash" : "Редактирование сотрудника"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('emp-edit-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleUpdateEmployee(event, ${emp.id})">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "F.I.SH." : "Ф.И.О."} *</label>
                <input type="text" id="edit-emp-fullname" class="form-control" required value="${escapeHtml(emp.full_name)}">
              </div>

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Bo'lim / Liniya" : "Отдел / Линия"}</label>
                  <select id="edit-emp-dept" class="form-control">
                    ${getDeptOptions(emp.department || "Ma'muriyat")}
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Lavozimi" : "Должность"}</label>
                  <input type="text" id="edit-emp-position" class="form-control" value="${escapeHtml(emp.position)}">
                </div>
              </div>

              ${emp.employee_type === 'fixed' ? `
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label class="form-label">${isUz ? "Oylik maoshi (UZS)" : "Оклад (UZS)"} *</label>
                    <input type="number" id="edit-emp-salary" class="form-control" value="${emp.monthly_salary}" step="10000">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label class="form-label">${isUz ? "Ish kunlari (Oyiga)" : "Раб. дней"}</label>
                    <input type="number" id="edit-emp-workdays" class="form-control" value="${emp.standard_work_days}" min="1" max="31">
                  </div>
                </div>
              ` : ''}

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Telefon" : "Телефон"}</label>
                  <input type="text" id="edit-emp-phone" class="form-control" value="${escapeHtml(emp.phone_number)}">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Qabul sanasi" : "Дата приема"}</label>
                  <input type="date" id="edit-emp-hiredate" class="form-control" value="${emp.hire_date || ''}">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('emp-edit-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleUpdateEmployee(e, id) {
    e.preventDefault();
    const isUz = isUzbek();
    const fullName = document.getElementById("edit-emp-fullname").value;
    const department = document.getElementById("edit-emp-dept").value;
    const position = document.getElementById("edit-emp-position").value;
    const phone = document.getElementById("edit-emp-phone").value;
    const salaryInput = document.getElementById("edit-emp-salary");
    const workDaysInput = document.getElementById("edit-emp-workdays");
    const hireDate = document.getElementById("edit-emp-hiredate").value;

    const payload = {
      full_name: fullName,
      department: department,
      position: position,
      phone_number: phone,
      hire_date: hireDate || null
    };
    if (salaryInput) payload.monthly_salary = parseFloat(salaryInput.value || 0);
    if (workDaysInput) payload.standard_work_days = parseInt(workDaysInput.value || 26);

    try {
      await API.updateEmployee(id, payload);
      showToast(isUz ? "Xodim ma'lumotlari yangilandi!" : "Данные сотрудника обновлены!", "success");
      closeModal("emp-edit-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Job Types Modals
  function openAddJobTypeModal() {
    const isUz = isUzbek();
    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="jt-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">➕ ${isUz ? "Yangi ish turi qo'shish" : "Новый вид сдельной работы"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('jt-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateJobType(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ish nomi / Operatsiya" : "Наименование работы"} *</label>
                <input type="text" id="jt-name" class="form-control" required placeholder="Masalan: Kafel saralash va navlash">
              </div>
              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "O'lchov birligi" : "Единица измерения"} *</label>
                  <select id="jt-unit" class="form-control">
                    <option value="m2">m² (Kvadrat metr)</option>
                    <option value="dona">dona (Штука)</option>
                    <option value="taglik">taglik (Поддон)</option>
                    <option value="quti">quti (Коробка)</option>
                    <option value="tonna">tonna (Тонна)</option>
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Birlik narxi (UZS)" : "Расценка за единицу (UZS)"} *</label>
                  <input type="number" id="jt-price" class="form-control" required step="50" placeholder="500">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('jt-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleCreateJobType(e) {
    e.preventDefault();
    const isUz = isUzbek();
    const name = document.getElementById("jt-name").value;
    const unit = document.getElementById("jt-unit").value;
    const price = parseFloat(document.getElementById("jt-price").value);

    try {
      await API.createJobType({
        name: name,
        unit_of_measure: unit,
        price_per_unit: price
      });
      showToast(isUz ? "Ish turi muvaffaqiyatli qo'shildi!" : "Вид работы успешно добавлен!", "success");
      closeModal("jt-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openEditJobTypeModal(id) {
    const isUz = isUzbek();
    const jt = jobTypesList.find(j => j.id === id);
    if (!jt) return;

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="jt-edit-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">✏️ ${isUz ? "Ish turini tahrirlash" : "Редактирование расценки"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('jt-edit-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleUpdateJobType(event, ${jt.id})">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ish nomi" : "Наименование"}</label>
                <input type="text" id="edit-jt-name" class="form-control" required value="${escapeHtml(jt.name)}">
              </div>
              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "O'lchov birligi" : "Ед. изм."}</label>
                  <input type="text" id="edit-jt-unit" class="form-control" required value="${escapeHtml(jt.unit_of_measure)}">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Birlik narxi (UZS)" : "Расценка (UZS)"}</label>
                  <input type="number" id="edit-jt-price" class="form-control" required step="50" value="${jt.price_per_unit}">
                </div>
              </div>
              <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="edit-jt-active" ${jt.is_active ? 'checked' : ''}>
                  <span style="font-weight: 600;">${isUz ? "Faol (Yangi yozuvlar uchun ochiq)" : "Активен (Доступен для новых записей)"}</span>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('jt-edit-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleUpdateJobType(e, id) {
    e.preventDefault();
    const isUz = isUzbek();
    const name = document.getElementById("edit-jt-name").value;
    const unit = document.getElementById("edit-jt-unit").value;
    const price = parseFloat(document.getElementById("edit-jt-price").value);
    const isActive = document.getElementById("edit-jt-active").checked;

    try {
      await API.updateJobType(id, {
        name: name,
        unit_of_measure: unit,
        price_per_unit: price,
        is_active: isActive
      });
      showToast(isUz ? "Ish turi yangilandi!" : "Вид работы обновлен!", "success");
      closeModal("jt-edit-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Daily Work Entry Modal
  function openAddWorkModal() {
    const isUz = isUzbek();
    const pieceworkEmps = employeesList.filter(e => e.employee_type === "piecework");
    if (pieceworkEmps.length === 0) {
      showToast(isUz ? "Avval ishbay xodimlarni ro'yxatga qo'shing!" : "Сначала добавьте сдельных сотрудников!", "warning");
      return;
    }
    if (jobTypesList.length === 0) {
      showToast(isUz ? "Avval ish turlari va narxlarini qo'shing!" : "Сначала добавьте виды работ!", "warning");
      return;
    }

    let empOptions = pieceworkEmps.map(e => `<option value="${e.id}">[${escapeHtml(e.department || '1-Liniya')}] ${escapeHtml(e.full_name)} (${escapeHtml(e.position)})</option>`).join("");
    let jobOptions = jobTypesList.map(j => `<option value="${j.id}" data-price="${j.price_per_unit}" data-unit="${j.unit_of_measure}">${escapeHtml(j.name)} — ${formatNumber(j.price_per_unit)} UZS / ${j.unit_of_measure}</option>`).join("");

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="work-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">🔨 ${isUz ? "Bajarilgan ishbay ishni kiritish" : "Внесение сдельного наряда"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('work-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateWorkEntry(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ishbay xodim" : "Сдельный сотрудник"} *</label>
                <select id="work-empid" class="form-control" required>
                  ${empOptions}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Bajarilgan ish turi" : "Вид выполненной работы"} *</label>
                <select id="work-jobid" class="form-control" required onchange="IshHaqiModule.updateWorkTotalCalc()">
                  ${jobOptions}
                </select>
              </div>

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Bajarilgan hajm / Miqdor" : "Объем / Количество"} *</label>
                  <input type="number" id="work-qty" class="form-control" required step="0.1" min="0.1" value="100" oninput="IshHaqiModule.updateWorkTotalCalc()">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Jami summa (Hisoblangan)" : "Итоговая сумма"}</label>
                  <input type="text" id="work-total-preview" class="form-control" readonly style="font-weight: 800; font-family: monospace; color: #d97706; background: #fffbeb;">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Izoh / Eslatma" : "Примечание / Комментарий"}</label>
                <input type="text" id="work-notes" class="form-control" placeholder="${isUz ? 'Smena raqami, partiya...' : 'Номер смены, партия...'}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('work-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-warning">${isUz ? "Qo'shish" : "Добавить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    updateWorkTotalCalc();
  }

  function updateWorkTotalCalc() {
    const jobSelect = document.getElementById("work-jobid");
    const qtyInput = document.getElementById("work-qty");
    const totalPreview = document.getElementById("work-total-preview");
    if (!jobSelect || !qtyInput || !totalPreview) return;

    const opt = jobSelect.options[jobSelect.selectedIndex];
    const price = opt ? parseFloat(opt.getAttribute("data-price") || 0) : 0;
    const unit = opt ? opt.getAttribute("data-unit") : "";
    const qty = parseFloat(qtyInput.value || 0);
    const total = qty * price;
    totalPreview.value = `${formatNumber(total)} UZS (${qty} ${unit} x ${formatNumber(price)})`;
  }

  async function handleCreateWorkEntry(e) {
    e.preventDefault();
    const isUz = isUzbek();
    const empId = parseInt(document.getElementById("work-empid").value);
    const jobId = parseInt(document.getElementById("work-jobid").value);
    const qty = parseFloat(document.getElementById("work-qty").value);
    const notes = document.getElementById("work-notes").value;

    try {
      await API.addDailyWork({
        employee_id: empId,
        job_type_id: jobId,
        date: currentDailyDate,
        quantity: qty,
        notes: notes,
        current_user: CURRENT_USER ? CURRENT_USER.username : "Admin"
      });
      showToast(isUz ? "Bajarilgan ish muvaffaqiyatli saqlandi!" : "Наряд успешно сохранен!", "success");
      closeModal("work-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Pay Salary Modal (Linked to Cash Register)
  async function openPayModal(calcId, empName, amount) {
    const isUz = isUzbek();
    let cashRegisters = [];
    try {
      cashRegisters = await API.getCashRegisters();
    } catch (_) {}

    let regOptions = cashRegisters.map(r => `
      <option value="${r.id}">${escapeHtml(r.name)} (${formatNumber(r.balance)} ${r.currency})</option>
    `).join("");

    if (!regOptions) {
      regOptions = `<option value="2">Kassa UZS</option><option value="1">Kassa USD</option>`;
    }

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="pay-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">💵 ${isUz ? "Ish haqi to'lash" : "Выплата заработной платы"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('pay-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handlePaySalary(event, ${calcId})">
            <div class="modal-body">
              <div style="background: #f8fafc; padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
                <div style="font-size: 12px; color: #64748b;">${isUz ? "Xodim:" : "Сотрудник:"}</div>
                <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(empName)}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 6px;">${isUz ? "Hisoblangan to'lov summasi:" : "Сумма к выплате:"}</div>
                <div style="font-size: 22px; font-weight: 800; color: #10b981; font-family: monospace;">${formatNumber(amount)} UZS</div>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Qaysi kassadan to'lanadi?" : "С какой кассы выдать?"} *</label>
                <select id="pay-register-id" class="form-control" required>
                  ${regOptions}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "To'lov summasi" : "Сумма выплаты"} *</label>
                <input type="number" id="pay-amount" class="form-control" value="${amount}" required step="1000" style="font-weight: 700; font-family: monospace;">
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Izoh / To'lov maqsadi" : "Примечание"}</label>
                <input type="text" id="pay-notes" class="form-control" placeholder="${isUz ? 'Naqd / Karta orqali berildi...' : 'Выдано наличными...'}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('pay-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-success">✅ ${isUz ? "To'lovni tasdiqlash" : "Подтвердить выплату"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handlePaySalary(e, calcId) {
    e.preventDefault();
    const isUz = isUzbek();
    const regId = parseInt(document.getElementById("pay-register-id").value);
    const amount = parseFloat(document.getElementById("pay-amount").value);
    const notes = document.getElementById("pay-notes").value;

    try {
      await API.paySalary(calcId, {
        register_id: regId,
        payment_amount: amount,
        current_user: CURRENT_USER ? CURRENT_USER.username : "Admin",
        notes: notes
      });
      showToast(isUz ? "Oylik to'lovi amalga oshirildi va Kassaga yozildi!" : "Выплата проведена и отражена в Кассе!", "success");
      closeModal("pay-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Employee Calculation Breakdown Modal
  function openDetailsModal(calcId) {
    const isUz = isUzbek();
    const calc = payrollData?.calculations?.find(c => c.id === calcId);
    if (!calc) return;

    const isFixed = calc.employee_type === "fixed";
    const modalHost = document.getElementById("salary-modals-host");

    modalHost.innerHTML = `
      <div class="modal-overlay active" id="details-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">🔍 ${isUz ? "Ish haqi hisob-kitob tafsilotlari" : "Детализация расчета ЗП"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('details-modal')">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px;">
              <div>
                <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${escapeHtml(calc.full_name)}</div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                  ${getDeptBadge(calc.department)}
                  <span style="font-size: 12px; color: #64748b;">${escapeHtml(calc.position)}</span>
                </div>
              </div>
              <div style="text-align: right;">
                <span class="badge" style="${isFixed ? 'background:#eff6ff; color:#1d4ed8;' : 'background:#fef3c7; color:#92400e;'} font-size:12px;">
                  ${isFixed ? (isUz ? "🏢 Fiksalangan oklad" : "🏢 Оклад") : (isUz ? "🔨 Ishbay to'lov" : "🔨 Сдельно")}
                </span>
              </div>
            </div>

            ${isFixed ? `
              <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                  <span>${isUz ? "Asosiy oylik maosh (Oklad):" : "Базовый оклад:"}</span>
                  <span style="font-weight: 700; font-family: monospace;">${formatNumber(calc.base_salary)} UZS</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                  <span>${isUz ? "Standart ish kunlari:" : "Рабочих дней в месяце:"}</span>
                  <span style="font-weight: 700;">${calc.standard_days} ${isUz ? "kun" : "дн"}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                  <span>${isUz ? "1 kunlik stavka (Tarif):" : "Ставка за 1 день:"}</span>
                  <span style="font-weight: 700; font-family: monospace;">${formatNumber(calc.per_day_rate)} UZS</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #ef4444;">
                  <span>${isUz ? "Kelmagan kunlar soni:" : "Пропущенные дни:"}</span>
                  <span style="font-weight: 700;">${calc.absent_days} ${isUz ? "kun" : "дн"}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; color: #ef4444; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
                  <span>${isUz ? "Jami ushlanma (Kelmadi):" : "Итого удержание:"}</span>
                  <span style="font-weight: 800; font-family: monospace; font-size: 14px;">-${formatNumber(calc.deduction_amount)} UZS</span>
                </div>
              </div>
            ` : `
              <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                  <span>${isUz ? "Bajarilgan ishlar jami qiymati:" : "Сумма выполненных работ:"}</span>
                  <span style="font-weight: 800; font-family: monospace; color: #d97706; font-size: 15px;">${formatNumber(calc.piecework_total)} UZS</span>
                </div>
              </div>
            `}

            <div style="display: flex; align-items: center; justify-content: space-between; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px;">
              <span style="font-weight: 700; font-size: 15px; color: #1e3a8a;">${isUz ? "JAMI HISOB-KITOB TO'LOVI:" : "ИТОГО К ВЫПЛАТЕ:"}</span>
              <span style="font-weight: 900; font-size: 22px; color: #2563eb; font-family: monospace;">${formatNumber(calc.final_amount)} UZS</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('details-modal')">${isUz ? "Yopish" : "Закрыть"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.remove();
  }

  return {
    render,
    switchTab,
    filterDepartment,
    changePayrollMonth,
    recalculatePayroll,
    finalizePayroll,
    reopenPayroll,
    exportExcel,
    changeDailyDate,
    toggleAttRow,
    saveAttendance,
    deleteWorkEntry,
    toggleEmployeeStatus,
    openAddEmployeeModal,
    openEditEmployeeModal,
    handleEmpTypeChange,
    handleCreateEmployee,
    handleUpdateEmployee,
    openAddJobTypeModal,
    openEditJobTypeModal,
    handleCreateJobType,
    handleUpdateJobType,
    openAddWorkModal,
    updateWorkTotalCalc,
    handleCreateWorkEntry,
    openPayModal,
    handlePaySalary,
    openDetailsModal,
    closeModal
  };
})();
