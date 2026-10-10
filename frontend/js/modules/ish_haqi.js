const IshHaqiModule = (function () {
  let activeTab = "payroll"; // 'payroll' | 'daily' | 'adjustments' | 'employees' | 'job_types'
  let activeDept = "all"; // 'all' | "Ma'muriyat" | an Ombor ("Toxir") | NO_DEPT
  let currentYearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
  let currentDailyDate = new Date().toISOString().slice(0, 10); // e.g. "2026-08-15"

  let payrollData = null;
  let dailyData = null;
  let employeesList = [];
  let jobTypesList = [];

  // Where people work: "Ma'muriyat" and the 4 Omborlar (Toxir, Kodir ...), from
  // /salary/departments. An employee still on a department that no longer
  // exists (an old production line) is shown as "Ombor tanlanmagan".
  const NO_DEPT = "__none";
  let departmentIds = ["Ma'muriyat"];

  async function loadDepartments() {
    try {
      const r = await API.getSalaryDepartments();
      departmentIds = (r.departments || []).map(d => d.id);
    } catch (e) {
      // keep what we have; the lists still show every employee under "Barchasi"
    }
  }

  function deptKey(dept) {
    const d = dept || "Ma'muriyat";
    return departmentIds.includes(d) ? d : NO_DEPT;
  }

  function deptLabel(id) {
    const isUz = isUzbek();
    if (id === "all") return isUz ? "Barchasi" : "Все отделы";
    if (id === "Ma'muriyat") return isUz ? "Ma'muriyat & Ofis" : "Администрация & Офис";
    if (id === NO_DEPT) return isUz ? "Ombor tanlanmagan" : "Склад не выбран";
    return id;
  }

  function matchesDept(dept) {
    return activeDept === "all" || deptKey(dept) === activeDept;
  }

  function hasUnassigned() {
    const lists = [employeesList || [], (payrollData && payrollData.calculations) || []];
    return lists.some(list => list.some(x => deptKey(x.department) === NO_DEPT));
  }

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
      subtitle: isUz ? "Ma'muriyat va omborlar bo'yicha fiks va ishbay oyliklar hisobi" : "Окладный и сдельный расчет ЗП по администрации и складам",
      tab_payroll: isUz ? "Oylik hisob-kitob" : "Ведомость ЗП",
      tab_daily: isUz ? "Kunlik davomat & Ishlar" : "Ежедневный учет",
      tab_adjustments: isUz ? "Avans / Shtraf / Premiya" : "Аванс / Штраф / Премия",
      tab_employees: isUz ? "Xodimlar ro'yxati" : "Сотрудники",
      tab_job_types: isUz ? "Ish turlari & Narxlar" : "Виды работ и Расценки",
      
      kpi_total: isUz ? "Jami hisoblangan ish haqi" : "Общий фонд начисленной ЗП",
      kpi_fixed: isUz ? "Fiksalangan maoshlar" : "Окладная часть",
      kpi_piecework: isUz ? "Ishbay to'lovlar" : "Сдельная часть",
      kpi_paid: isUz ? "To'langan / Qoldiq" : "Выплачено / Остаток",
      
      btn_recalc: isUz ? "Qayta hisoblash" : "Пересчитать",
      btn_finalize: isUz ? "Oyni tasdiqlash" : "Зафиксировать",
      btn_reopen: isUz ? "Qayta ochish" : "Открыть для правок",
      btn_pdf: isUz ? "PDF yuklab olish" : "Скачать PDF",
      btn_add_emp: isUz ? "Yangi xodim qo'shish" : "Добавить сотрудника",
      btn_add_job: isUz ? "Yangi ish turi" : "Новый вид работы",
      btn_add_work: isUz ? "Ishbay naryad qo'shish" : "Добавить наряд",
      btn_save_att: isUz ? "Davomatni saqlash" : "Сохранить табель",
      
      type_fixed: isUz ? "Fiksalangan" : "Оклад",
      type_piecework: isUz ? "Ishbay" : "Сдельный",
      
      status_draft: isUz ? "Qoralama" : "Черновик",
      status_finalized: isUz ? "Tasdiqlangan" : "Зафиксирован",
      status_paid: isUz ? "To'langan" : "Выплачено",
      
      locked_warning: isUz ? "Ushbu oy qulflangan. Tahrirlash uchun avval 'Qayta ochish' tugmasini bosing." : "Этот месяц зафиксирован. Для внесения изменений сначала откройте период."
    };
  }

  // One colour per Ombor.
  const OWNER_COLORS = {
    Toxir: ["#d97706", "#fffbeb"], Kodir: ["#0284c7", "#f0f9ff"],
    Istam: ["#7c3aed", "#f5f3ff"], Aziz: ["#059669", "#ecfdf5"],
  };

  function getDeptBadge(dept) {
    const key = deptKey(dept);
    let [color, bg] = ["#3b82f6", "#eff6ff"];
    if (key === "Ma'muriyat") [color, bg] = ["#dc2626", "#fef2f2"];
    else if (key === NO_DEPT) [color, bg] = ["#c2410c", "#fff7ed"];
    else if (OWNER_COLORS[key]) [color, bg] = OWNER_COLORS[key];
    const label = key === NO_DEPT ? deptLabel(NO_DEPT) : key;
    return `<span class="badge" style="background:${bg}; color:${color}; border:1px solid ${color}30; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">${escapeHtml(label)}</span>`;
  }

  function renderDeptFilterBar() {
    const isUz = isUzbek();
    return `
      <div class="tabs-nav" style="display: flex; gap: 6px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; flex-wrap: wrap; padding-bottom: 6px;">
        ${["all", ...departmentIds, ...(hasUnassigned() || activeDept === NO_DEPT ? [NO_DEPT] : [])].map(id => {
          const d = { id };
          const isActive = activeDept === d.id;
          const label = deptLabel(d.id);
          return `
            <button class="tab-btn ${isActive ? 'active' : ''}" onclick="IshHaqiModule.filterDepartment(${jsArg(d.id)})" 
              style="padding: 6px 12px; font-size: 12.5px; font-weight: ${isActive ? '700' : '600'}; border-radius: 8px; border: ${isActive ? '1px solid #2563eb' : '1px solid #cbd5e1'}; background: ${isActive ? '#eff6ff' : '#f8fafc'}; color: ${isActive ? '#1d4ed8' : '#475569'}; cursor: pointer; transition: all 0.2s;">
              <span>${label}</span>
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

    await loadDepartments();
    container.innerHTML = `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
<span>${t.title}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">${t.subtitle}</p>
          </div>
          <div class="tabs-nav" style="margin-bottom: 0; border-bottom: none; gap: 6px; flex-wrap: wrap;">
            ${[["payroll", t.tab_payroll], ["daily", t.tab_daily], ["adjustments", t.tab_adjustments],
               ["employees", t.tab_employees], ["job_types", t.tab_job_types]].map(([id, label]) =>
              `<button class="tab-btn ${activeTab === id ? 'active' : ''}" data-tab="${id}" onclick="IshHaqiModule.switchTab('${id}')">${label}</button>`).join("")}
            <button class="btn btn-secondary btn-sm" onclick="exportTableToPdf(null, 'ish_haqi_va_xodimlar')" style="margin-left: 6px; padding: 6px 12px; font-weight: 600;">${isUzbek() ? 'PDF yuklash' : 'Скачать PDF'}</button>
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
    document.querySelectorAll("#salary-module .card-header .tab-btn[data-tab]").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.tab === tabName));
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
    } else if (activeTab === "adjustments") {
      await renderAdjustmentsTab(host);
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
    calculations = calculations.filter(c => matchesDept(c.department));

    let rowsHtml = "";
    if (calculations.length === 0) {
      rowsHtml = `<tr><td colspan="11" style="text-align:center; padding: 30px; color: #94a3b8;">${isUz ? "Ushbu bo'lim uchun hisob-kitoblar topilmadi." : "Нет начислений по выбранному отделу."}</td></tr>`;
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
            <td style="text-align: right; font-family: monospace; font-size: 12px; white-space: nowrap;">${adjustmentLines(c)}</td>
            <td style="text-align: right; font-weight: 800; color: #1e3a8a; font-family: monospace; font-size: 14px;">
              ${formatNumber(c.final_amount)} <small>UZS</small>
            </td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openDetailsModal(${c.id})" title="${isUz ? "Batafsil hisob-kitob" : "Детали начисления"}">${CURRENT_LANG === 'uz' ? "Batafsil" : "Подробнее"}</button>
              ${c.status !== "paid" 
                ? `<button class="btn btn-primary btn-sm" onclick="IshHaqiModule.openPayModal(${c.id}, ${jsArg(c.full_name)}, ${c.final_amount})" style="margin-left: 4px;">${isUz ? "To'lash" : "Выплатить"}</button>`
                : `<button class="btn btn-storno btn-sm" onclick="IshHaqiModule.stornoSalary(${c.id}, ${jsArg(c.full_name)})" style="margin-left: 4px;" title="${isUz ? "To'lovni bekor qilish, pul kassaga qaytadi" : "Отменить выплату, деньги вернутся в кассу"}">${isUz ? "Storno" : "Сторно"}</button>`
              }
            </td>
          </tr>
        `;
      });
    }

    // Calculate department-specific KPI metrics
    const deptPayroll = calculations.reduce((acc, c) => acc + c.final_amount, 0);
    const deptFixed = calculations.filter(c => c.employee_type === "fixed").reduce((acc, c) => acc + c.final_amount, 0);
    const deptPiecework = calculations.filter(c => c.employee_type === "piecework").reduce((acc, c) => acc + c.final_amount, 0);
    const deptPaid = calculations.filter(c => c.status === "paid").reduce((acc, c) => acc + c.final_amount, 0);
    const deptUnpaid = deptPayroll - deptPaid;
    const deptCount = calculations.length;

    container.innerHTML = `
      <!-- Month & Action Controls -->
      <div class="card" style="margin-bottom: 16px; padding: 14px 18px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="font-size: 13px; font-weight: 700; color: #0f172a;">${isUz ? "Hisob davri (Oy):" : "Период (Месяц):"}</label>
            <input type="month" id="payroll-month-select" class="form-control" value="${currentYearMonth}" onchange="IshHaqiModule.changePayrollMonth(this.value)" style="width: 170px; padding: 6px 12px; font-weight: 600;">
            ${isLocked 
              ? `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:6px 12px; font-size:12px;">${isUz ? "Oy qulflangan" : "Период зафиксирован"}</span>` 
              : `<span class="badge badge-warning" style="padding:6px 12px; font-size:12px;">${isUz ? "Ochiq (Qoralama)" : "Открыт (Черновик)"}</span>`}
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.recalculatePayroll()" ${isLocked ? "disabled" : ""}>${t.btn_recalc}</button>
            ${!isLocked 
              ? `<button class="btn btn-warning btn-sm" onclick="IshHaqiModule.finalizePayroll()">${t.btn_finalize}</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.reopenPayroll()">${t.btn_reopen}</button>`
            }
            <button class="btn btn-success btn-sm" onclick="IshHaqiModule.exportPdf()">${t.btn_pdf}</button>
          </div>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <div class="grid-4" style="margin-bottom: 16px;">
        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_total}</div>
          <div class="kpi-value" style="color: #2563eb;">${formatNumber(deptPayroll)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${deptCount} ${isUz ? "nafar xodim" : "сотрудников"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_fixed}</div>
          <div class="kpi-value" style="color: #0f172a;">${formatNumber(deptFixed)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${isUz ? "Oylik fiks shtat" : "Окладный штат"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_piecework}</div>
          <div class="kpi-value" style="color: #d97706;">${formatNumber(deptPiecework)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub">${isUz ? "Bajarilgan ishlar hajmi" : "Сдельные объемы"}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${t.kpi_paid}</div>
          <div class="kpi-value" style="color: #10b981;">${formatNumber(deptPaid)} <small style="font-size: 13px;">UZS</small></div>
          <div class="kpi-sub" style="color: #ef4444 !important;">${isUz ? "Qoldiq:" : "Остаток:"} ${formatNumber(deptUnpaid)} UZS</div>
        </div>
      </div>

      <!-- Payroll Table Card -->
      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div class="card-title" style="font-size: 16px; font-weight: 700;">${isUz ? "Xodimlar bo'yicha hisob-kitob vedomosti" : "Расчетная ведомость по сотрудникам"}</div>
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
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Bo'lim / Ombor" : "Отдел / Склад"}</div>
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Turi" : "Тип"}</div>
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th style="text-align: right;">${isUz ? "Asosiy / Ishbay" : "Оклад / Сдельно"}</th>
                <th style="text-align: center;">${isUz ? "Reja kun" : "Раб. дней"}</th>
                <th style="text-align: center;">${isUz ? "Kelmadi / Ushlanma" : "Невыходы / Удержание"}</th>
                <th style="text-align: right;">${isUz ? "Premiya / Shtraf / Avans" : "Премия / Штраф / Аванс"}</th>
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

  function exportPdf() {
    exportTableToPdf("payroll-data-table", `ish_haqi_vedomost_${currentYearMonth}`);
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
    fixedEmps = fixedEmps.filter(e => matchesDept(e.department));

    // Filter piecework entries by active department
    let pieceEntries = dailyData.piecework_entries || [];
    pieceEntries = pieceEntries.filter(p => matchesDept(p.department));

    // Soatbay xodimlar: their position is a soatbay Ish turi; the day's hours
    // at it are entered here (not as a naryad) and leave the naryad list.
    const soatbayEmps = employeesList.filter(e => {
      const job = jobTypesList.find(j => j.id === e.job_type_id);
      return e.employee_type === "piecework" && job && payTypeOf(job) === "soatbay"
        && matchesDept(e.department) && (!e.hire_date || e.hire_date <= currentDailyDate);
    });
    const ownHours = (e) => (dailyData.piecework_entries || [])
      .filter(p => p.employee_id === e.id && p.job_type_id === e.job_type_id)
      .reduce((sum, p) => sum + (p.quantity || 0), 0);
    pieceEntries = pieceEntries.filter(p => !soatbayEmps.some(e => e.id === p.employee_id && e.job_type_id === p.job_type_id));

    let soatbayRows = "";
    if (soatbayEmps.length === 0) {
      soatbayRows = `<div style="padding: 20px; text-align: center; color: #94a3b8;">${isUz
        ? "Ushbu bo'limda soatbay xodimlar yo'q. Xodimga lavozim qilib soatbay ish turini tanlang."
        : "Нет почасовых сотрудников. Назначьте сотруднику почасовой вид работ как должность."}</div>`;
    } else {
      soatbayEmps.forEach(e => {
        const job = jobTypesList.find(j => j.id === e.job_type_id);
        const hours = ownHours(e);
        soatbayRows += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; gap: 10px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 150px;">
              <div style="font-weight: 700; font-size: 13.5px; color: #0f172a;">${escapeHtml(e.full_name)}</div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap;">
                ${getDeptBadge(e.department)}
                <span style="font-size: 11px; color: #64748b;">${escapeHtml(job.name)} · ${formatNumber(job.price_per_unit)} UZS/${isUz ? "soat" : "час"}</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" class="form-control hours-input" data-empid="${e.id}" data-jobid="${e.job_type_id}"
                data-rate="${job.price_per_unit}" data-was="${hours}" value="${hours || ""}" min="0" max="24" step="any" placeholder="0"
                ${isLocked ? "disabled" : ""} oninput="IshHaqiModule.updateHoursTotals()" style="width: 72px; text-align: right; font-weight: 700;">
              <span style="font-size: 12px; color: #64748b;">${isUz ? "soat" : "ч"}</span>
              <span class="hours-sum" style="min-width: 110px; text-align: right; font-family: monospace; font-weight: 700; color: #0369a1;">${formatNumber(hours * job.price_per_unit)} UZS</span>
            </div>
          </div>
        `;
      });
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
                <input type="checkbox" class="att-checkbox" data-empid="${emp.employee_id}" ${emp.is_absent ? 'checked' : ''} ${isLocked ? 'disabled' : ''} onchange="IshHaqiModule.toggleAttRow(this, ${emp.employee_id})">
                <span>${emp.is_absent ? (isUz ? 'Kelmadi' : 'Не вышел') : (isUz ? 'Ishda' : 'На работе')}</span>
              </label>
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
              ${!isLocked ? `<button class="btn btn-danger btn-sm" onclick="IshHaqiModule.deleteWorkEntry(${p.id})">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>` : `<span style="color:#94a3b8;">-</span>`}
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
            <div class="card-title" style="font-size: 15px; font-weight: 700;">${isUz ? "Fiksalangan xodimlar davomati" : "Табель окладных сотрудников"}</div>
            ${!isLocked ? `<button class="btn btn-primary btn-sm" onclick="IshHaqiModule.saveAttendance()">${t.btn_save_att}</button>` : ''}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            ${isUz ? "Ishga kelmagan bo'lsa, 'Kelmadi' deb belgilang. Kunlik maosh avtomatik chegiriladi." : "Отметьте сотрудников, которые не вышли. Дневная ставка будет удержана."}
          </p>
          <div class="scroll-box" style="max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            ${fixedRows}
          </div>
        </div>

        <!-- Section 2: Soatbay (hourly) employees -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title" style="font-size: 15px; font-weight: 700;">${isUz ? "Soatbay xodimlar (ishlagan soati)" : "Почасовые сотрудники (часы)"}</div>
            ${!isLocked && soatbayEmps.length ? `<button class="btn btn-primary btn-sm" onclick="IshHaqiModule.saveHours()">${isUz ? "Soatlarni saqlash" : "Сохранить часы"}</button>` : ''}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            ${isUz ? "Har bir xodim bugun necha soat ishlaganini kiriting: soat x soatlik narx oylikka qo'shiladi." : "Укажите, сколько часов отработал каждый: часы x ставка идут в зарплату."}
          </p>
          <div class="scroll-box" style="max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            ${soatbayRows}
          </div>
          ${soatbayEmps.length ? `<div id="hours-total" style="text-align: right; margin-top: 10px; font-size: 13px; font-weight: 700; color: #0f172a;"></div>` : ''}
        </div>
      </div>

      <div style="margin-top: 16px;">
        <!-- Section 3: Piecework Jobs Entry -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title" style="font-size: 15px; font-weight: 700;">${isUz ? "Ishbay xodimlar naryadlari" : "Сдельные наряды"}</div>
            ${!isLocked ? `<button class="btn btn-warning btn-sm" onclick="IshHaqiModule.openAddWorkModal()">${t.btn_add_work}</button>` : ''}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            ${isUz ? "Bajarilgan ishlar hajmini kiriting. Oylik hisob-kitob avtomatik yangilanadi." : "Внесите объем работ за день. Сумма сразу отобразится в ведомости."}
          </p>
          <div class="table-container scroll-box" style="max-height: 480px;">
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
    updateHoursTotals();
  }

  // The soatbay section's sums as hours are typed.
  function updateHoursTotals() {
    let hours = 0, amount = 0;
    document.querySelectorAll(".hours-input").forEach(input => {
      const h = parseFloat(input.value) || 0;
      const sum = h * (parseFloat(input.dataset.rate) || 0);
      hours += h;
      amount += sum;
      const cell = input.parentElement.querySelector(".hours-sum");
      if (cell) cell.textContent = `${formatNumber(sum)} UZS`;
    });
    const total = document.getElementById("hours-total");
    if (total) total.textContent = `${isUzbek() ? "Jami" : "Итого"}: ${formatNumber(hours)} ${isUzbek() ? "soat" : "ч"} · ${formatNumber(amount)} UZS`;
  }

  async function saveHours() {
    const isUz = isUzbek();
    const items = [...document.querySelectorAll(".hours-input")]
      .filter(input => (parseFloat(input.value) || 0) !== (parseFloat(input.dataset.was) || 0))
      .map(input => ({
        employee_id: parseInt(input.dataset.empid),
        job_type_id: parseInt(input.dataset.jobid),
        hours: parseFloat(input.value) || 0,
      }));
    if (items.length === 0) {
      showToast(isUz ? "O'zgartirilgan soat yo'q" : "Часы не изменены", "info");
      return;
    }
    try {
      await API.saveDailyHours({ date: currentDailyDate, items });
      showToast(isUz ? "Ishlagan soatlar saqlandi!" : "Часы сохранены!", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function changeDailyDate(val) {
    if (!val) return;
    currentDailyDate = val;
    loadActiveTabContent();
  }

  function toggleAttRow(chk, empId) {
    const isUz = isUzbek();
    const span = chk.nextElementSibling;
    if (chk.checked) {
      span.innerText = isUz ? "Kelmadi" : "Не вышел";
      span.parentElement.style.color = "#ef4444";
    } else {
      span.innerText = isUz ? "Ishda" : "На работе";
      span.parentElement.style.color = "#10b981";
    }
  }

  async function saveAttendance() {
    // The daily list gives each person as employee_id (it used to be read as
    // emp.id, so every "Kelmadi" went out without an id and saving failed).
    const checkboxes = document.querySelectorAll(".att-checkbox");
    const absentRecords = [];
    checkboxes.forEach(chk => {
      if (chk.checked) {
        absentRecords.push({ employee_id: parseInt(chk.getAttribute("data-empid")) });
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
  // AVANS / SHTRAF / PREMIYA
  // ===========================================================================
  // Avans is paid out now from a so'm Kassa; shtraf and premiya only change the
  // month's pay. To pay = earned + premiya - shtraf - avans.
  const ADJ_KINDS = ["avans", "shtraf", "premiya"];
  const ADJ_STYLE = {
    avans: { color: "#c2410c", bg: "#fff7ed", btn: "btn-warning" },
    shtraf: { color: "#dc2626", bg: "#fef2f2", btn: "btn-danger" },
    premiya: { color: "#059669", bg: "#ecfdf5", btn: "btn-success" },
  };
  const ADJ_FIELD = { avans: "advance_paid", shtraf: "penalty_amount", premiya: "bonus_amount" };

  function adjKindText(kind) {
    const isUz = isUzbek();
    return {
      avans: isUz ? "Avans" : "Аванс",
      shtraf: isUz ? "Shtraf" : "Штраф",
      premiya: isUz ? "Premiya" : "Премия",
    }[kind] || kind;
  }

  function adjAmount(calc, kind) {
    return (calc && calc[ADJ_FIELD[kind]]) || 0;
  }

  function adjBadge(kind) {
    const st = ADJ_STYLE[kind] || ADJ_STYLE.avans;
    return `<span class="badge" style="background:${st.bg}; color:${st.color}; border:1px solid ${st.color}40;">${adjKindText(kind)}</span>`;
  }

  // The payroll row's "Premiya / Shtraf / Avans" cell.
  function adjustmentLines(calc) {
    const lines = ADJ_KINDS.filter(k => adjAmount(calc, k) > 0).map(k =>
      `<div style="color:${ADJ_STYLE[k].color};">${k === "premiya" ? "+" : "-"}${formatNumber(adjAmount(calc, k))} <small>${adjKindText(k).toLowerCase()}</small></div>`);
    return lines.length ? lines.join("") : `<span style="color:#94a3b8;">-</span>`;
  }

  function monthTitle(ym) {
    const [y, m] = ym.split("-").map(Number);
    const uz = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
    const ru = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    return `${(isUzbek() ? uz : ru)[m - 1] || ym} ${y}`;
  }

  let adjustmentsData = null;

  async function renderAdjustmentsTab(container) {
    const isUz = isUzbek();
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>`;

    try {
      adjustmentsData = await API.getSalaryAdjustments(currentYearMonth);
      employeesList = await API.getEmployees(null, true);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    const isLocked = adjustmentsData.is_locked;
    const items = (adjustmentsData.items || []).filter(a => matchesDept(a.department));
    const totals = {};
    ADJ_KINDS.forEach(k => { totals[k] = items.filter(a => a.kind === k).reduce((sum, a) => sum + a.amount, 0); });

    const rowsHtml = items.length === 0
      ? `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8;">${isUz ? "Bu oyda avans, shtraf yoki premiya yo'q" : "За этот месяц записей нет"}</td></tr>`
      : items.map((a, idx) => `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="white-space: nowrap;">${escapeHtml(a.date || "")}</td>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(a.full_name)}</td>
            <td>${getDeptBadge(a.department)}</td>
            <td>${adjBadge(a.kind)}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 800; color: ${ADJ_STYLE[a.kind] ? ADJ_STYLE[a.kind].color : "#0f172a"};">${a.kind === "premiya" ? "+" : "-"}${formatNumber(a.amount)} <small>UZS</small></td>
            <td style="color: #475569; font-size: 12.5px;">${escapeHtml(a.reason) || "-"}</td>
            <td style="font-size: 12.5px; color: #475569;">${a.register_name ? escapeHtml(a.register_name) : "-"}</td>
            <td style="text-align: center;">
              ${!isLocked ? `<button class="btn btn-danger btn-sm" onclick="IshHaqiModule.deleteAdjustment(${a.id}, ${jsArg(a.kind)})">${isUz ? "O'chirish" : "Удалить"}</button>` : `<span style="color:#94a3b8;">-</span>`}
            </td>
          </tr>
        `).join("");

    const filterInput = (placeholder) => `<input type="text" class="table-col-filter" placeholder="${placeholder}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">`;

    container.innerHTML = `
      <div class="card" style="margin-bottom: 16px; padding: 14px 18px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label style="font-size: 13px; font-weight: 700; color: #0f172a;">${isUz ? "Qaysi oy ish haqi:" : "Зарплата за месяц:"}</label>
            <input type="month" id="adj-month-select" class="form-control" value="${currentYearMonth}" onchange="IshHaqiModule.changeAdjustmentsMonth(this.value)" style="width: 170px; padding: 6px 12px; font-weight: 600;">
            ${isLocked ? `<span class="badge badge-danger" style="padding: 6px 12px; font-size: 12px;">${getI18n().locked_warning}</span>` : ""}
          </div>
          ${!isLocked ? `
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${ADJ_KINDS.map(k => `<button class="btn ${ADJ_STYLE[k].btn} btn-sm" onclick="IshHaqiModule.openAdjustmentModal('${k}')">${{
                avans: isUz ? "Avans berish" : "Выдать аванс",
                shtraf: isUz ? "Shtraf yozish" : "Записать штраф",
                premiya: isUz ? "Premiya yozish" : "Записать премию",
              }[k]}</button>`).join("")}
            </div>` : ""}
        </div>
      </div>

      <div class="grid-3" style="margin-bottom: 16px;">
        ${ADJ_KINDS.map(k => `
          <div class="kpi-card">
            <div class="kpi-title">${isUz ? "Jami" : "Итого"} ${adjKindText(k).toLowerCase()}</div>
            <div class="kpi-value" style="color: ${ADJ_STYLE[k].color};">${formatNumber(totals[k])} <small style="font-size: 13px;">UZS</small></div>
            <div class="kpi-sub">${{
              avans: isUz ? "Kassadan oldindan berilgan, oylikdan ushlanadi" : "Выдано из кассы, удерживается из ЗП",
              shtraf: isUz ? "Oylikdan ushlanadi" : "Удерживается из ЗП",
              premiya: isUz ? "Oylikka qo'shiladi" : "Добавляется к ЗП",
            }[k]}</div>
          </div>`).join("")}
      </div>

      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div class="card-title" style="font-size: 16px; font-weight: 700;">${isUz ? "Avans, shtraf va premiyalar" : "Авансы, штрафы и премии"} — ${monthTitle(currentYearMonth)}</div>
            <div style="font-size: 12px; color: #64748b;">${items.length} ${isUz ? "ta yozuv" : "записей"}</div>
          </div>
          ${renderDeptFilterBar()}
        </div>
        <div class="table-container">
          <table class="data-table" id="adjustments-data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">№</th>
                <th>${isUz ? "Sana" : "Дата"}</th>
                <th><div>${isUz ? "Xodim" : "Сотрудник"}</div>${filterInput(isUz ? "Qidirish..." : "Поиск...")}</th>
                <th><div>${isUz ? "Bo'lim / Ombor" : "Отдел / Склад"}</div>${filterInput(isUz ? "Filtr..." : "Фильтр...")}</th>
                <th><div>${isUz ? "Turi" : "Тип"}</div>${filterInput(isUz ? "Filtr..." : "Фильтр...")}</th>
                <th style="text-align: right;">${isUz ? "Summa" : "Сумма"}</th>
                <th>${isUz ? "Izoh" : "Примечание"}</th>
                <th>${isUz ? "Kassa" : "Касса"}</th>
                <th style="text-align: center;">${isUz ? "Amal" : "Действие"}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function changeAdjustmentsMonth(val) {
    if (!val) return;
    currentYearMonth = val;
    loadActiveTabContent();
  }

  async function openAdjustmentModal(kind) {
    const isUz = isUzbek();
    const emps = employeesList.filter(e => e.is_active !== false && matchesDept(e.department));
    if (emps.length === 0) {
      showToast(isUz ? "Bu bo'limda xodim yo'q" : "В этом отделе нет сотрудников", "warning");
      return;
    }
    let registers = [];
    if (kind === "avans") {
      try {
        registers = (await API.getCashRegisters()).filter(r => r.currency === "UZS");
      } catch (err) {
        showToast(err.message, "error");
        return;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const title = {
      avans: isUz ? "Avans berish" : "Выдать аванс",
      shtraf: isUz ? "Shtraf yozish" : "Записать штраф",
      premiya: isUz ? "Premiya yozish" : "Записать премию",
    }[kind];
    const hint = {
      avans: isUz ? "Pul tanlangan kassadan hozir chiqadi va oylikdan ushlanadi." : "Деньги выдаются из кассы сейчас и удерживаются из ЗП.",
      shtraf: isUz ? "Summa oylikdan ushlanadi." : "Сумма удерживается из зарплаты.",
      premiya: isUz ? "Summa oylikka qo'shiladi." : "Сумма добавляется к зарплате.",
    }[kind];

    document.getElementById("salary-modals-host").innerHTML = `
      <div class="modal-overlay active" id="adj-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">${title}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('adj-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateAdjustment(event, '${kind}')">
            <div class="modal-body">
              <div style="background:${ADJ_STYLE[kind].bg}; color:${ADJ_STYLE[kind].color}; border:1px solid ${ADJ_STYLE[kind].color}40; border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:13px; font-weight:600;">
                ${monthTitle(currentYearMonth)} ${isUz ? "ish haqi" : "— зарплата"}. ${hint}
              </div>
              <div class="form-group">
                <label class="form-label">${isUz ? "Xodim" : "Сотрудник"} *</label>
                <select id="adj-empid" class="form-control" required>
                  ${emps.map(e => `<option value="${e.id}">[${escapeHtml(deptLabel(deptKey(e.department)))}] ${escapeHtml(e.full_name)} (${escapeHtml(e.position)})</option>`).join("")}
                </select>
              </div>
              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Summa (UZS)" : "Сумма (UZS)"} *</label>
                  <input type="number" id="adj-amount" class="form-control" required min="1" placeholder="500 000" style="font-weight: 700;">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Sana" : "Дата"} *</label>
                  <input type="date" id="adj-date" class="form-control" required value="${today}">
                </div>
              </div>
              ${kind === "avans" ? `
                <div class="form-group">
                  <label class="form-label">${isUz ? "Qaysi kassadan beriladi?" : "Из какой кассы?"} *</label>
                  <select id="adj-register" class="form-control" required>
                    ${registers.map(r => `<option value="${r.id}">${escapeHtml(r.name)} (${formatNumber(r.balance)} ${r.currency})</option>`).join("")}
                  </select>
                </div>` : ""}
              <div class="form-group">
                <label class="form-label">${isUz ? "Izoh" : "Примечание"}</label>
                <input type="text" id="adj-reason" class="form-control" placeholder="${{
                  avans: isUz ? "Masalan: oy o'rtasida" : "Например: в середине месяца",
                  shtraf: isUz ? "Masalan: kechikib keldi" : "Например: опоздание",
                  premiya: isUz ? "Masalan: rejadan ortiq ish" : "Например: перевыполнение плана",
                }[kind]}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('adj-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn ${ADJ_STYLE[kind].btn}">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function handleCreateAdjustment(e, kind) {
    e.preventDefault();
    const isUz = isUzbek();
    const register = document.getElementById("adj-register");
    try {
      await API.addSalaryAdjustment({
        employee_id: parseInt(document.getElementById("adj-empid").value),
        kind,
        amount: parseFloat(document.getElementById("adj-amount").value),
        year_month: currentYearMonth,
        date: document.getElementById("adj-date").value,
        reason: document.getElementById("adj-reason").value,
        register_id: register ? parseInt(register.value) : null,
      });
      showToast(kind === "avans"
        ? (isUz ? "Avans berildi va Kassaga chiqim yozildi!" : "Аванс выдан и записан в Кассу!")
        : (isUz ? `${adjKindText(kind)} yozildi!` : `${adjKindText(kind)} записан(а)!`), "success");
      closeModal("adj-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deleteAdjustment(id, kind) {
    const isUz = isUzbek();
    const msg = kind === "avans"
      ? (isUz ? "Avansni o'chirasizmi? Kassadagi chiqim ham o'chadi va pul kassaga qaytadi." : "Удалить аванс? Расход в кассе тоже удалится, деньги вернутся в кассу.")
      : (isUz ? "Ushbu yozuvni o'chirasizmi?" : "Удалить эту запись?");
    if (!confirm(msg)) return;
    try {
      await API.deleteSalaryAdjustment(id);
      showToast(isUz ? "O'chirildi" : "Удалено", "success");
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
      employeesList = await API.getEmployees();
      await ensureJobTypes();             // for the position's pay type
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    // Filter employees by active department
    let filteredList = employeesList;
    filteredList = filteredList.filter(e => matchesDept(e.department));

    let rowsHtml = "";
    if (filteredList.length === 0) {
      rowsHtml = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8;">${isUz ? "Ushbu bo'limda xodimlar topilmadi" : "Сотрудники не найдены в этом отделе"}</td></tr>`;
    } else {
      filteredList.forEach((e, idx) => {
        const isFixed = e.employee_type === "fixed";
        // The position's own type (Fiks / Ishbay / Soatbay) when it is an Ish turi
        const job = jobTypesList.find(x => x.id === e.job_type_id);
        const typeBadge = job ? payTypeBadge(job) : isFixed
          ? `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${t.type_fixed}</span>` 
          : `<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">${t.type_piecework}</span>`;

        const statusBadge = e.is_active 
          ? `<span class="badge badge-success">${isUz ? "Faol" : "Активен"}</span>` 
          : `<span class="badge badge-danger">${isUz ? "Nofaol" : "В архиве"}</span>`;

        const salaryStr = isFixed 
          ? `${formatNumber(e.monthly_salary)} <small>UZS</small>` 
          : job
            ? `${formatNumber(job.price_per_unit)} <small>UZS / ${escapeHtml(unitText(job))}</small>`
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
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openEditEmployeeModal(${e.id})">${isUz ? "Tahrirlash" : "Изм."}</button>
              <button class="btn ${e.is_active ? 'btn-secondary' : 'btn-success'} btn-sm" onclick="IshHaqiModule.toggleEmployeeStatus(${e.id})" style="margin-left: 4px;">
                ${e.is_active ? (isUz ? "Arxiv" : "В архив") : (isUz ? "Tiklash" : "Восстановить")}
              </button>
              <button class="btn btn-danger btn-sm" onclick="IshHaqiModule.deleteEmployee(${e.id}, ${jsArg(e.full_name)})" title="O'chirish" style="margin-left: 4px; padding: 4px 8px; font-size: 12px;">
                ${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}
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
              <div class="card-title" style="font-size: 16px; font-weight: 700;">${isUz ? "Fabrika xodimlari ro'yxati (Ma'muriyat va omborlar bo'yicha)" : "Штатное расписание (администрация и склады)"}</div>
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
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Bo'lim / Ombor" : "Отдел / Склад"}</div>
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "Lavozimi" : "Должность"}</div>
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th>
                  <div>${isUz ? "To'lov turi" : "Тип оплаты"}</div>
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Filtr...' : 'Фильтр...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
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

  async function deleteEmployee(id, empName) {
    const isUz = isUzbek();
    if (!confirm(isUz ? `${empName} xodimini butunlay o'chirishni tasdiqlaysizmi?\nUning barcha davomat va naryad yozuvlari ham o'chiriladi.` : `Удалить сотрудника ${empName} навсегда?`)) return;
    try {
      await API.deleteEmployee(id);
      showToast(isUz ? "Xodim o'chirildi" : "Сотрудник удален", "success");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ===========================================================================
  // TAB 4: JOB TYPES (PIECEWORK CATALOG)
  // ===========================================================================

  // How a job (position) is paid: ishbay = units done x rate, soatbay =
  // hours x rate (both through naryad entries), fiks = a monthly salary.
  const PAY_TYPES = ["ishbay", "soatbay", "fiks"];
  // An Ish turi already saved with another unit keeps it (jobTypeFields adds it).
  const UNITS = [
    ["m2", "m² (Kvadrat metr)"], ["dona", "dona (Штука)"], ["metr", "metr (Метр)"], ["tonna", "tonna (Тонна)"],
  ];

  function payTypeOf(j) {
    return PAY_TYPES.includes(j && j.pay_type) ? j.pay_type : "ishbay";
  }

  function payTypeText(pt) {
    const isUz = isUzbek();
    return {
      ishbay: { name: isUz ? "Ishbay" : "Сдельная", hint: isUz ? "Bajarilgan hajm × narx" : "Объем × расценка",
                price: isUz ? "Birlik narxi (UZS)" : "Расценка за единицу (UZS)",
                qty: isUz ? "Bajarilgan hajm / Miqdor" : "Объем / Количество", color: "#d97706", bg: "#fffbeb" },
      soatbay: { name: isUz ? "Soatbay" : "Почасовая", hint: isUz ? "Ishlagan soat × 1 soat narxi" : "Часы × ставка за час",
                 price: isUz ? "1 soat narxi (UZS)" : "Ставка за час (UZS)",
                 qty: isUz ? "Ishlagan soat" : "Отработано часов", color: "#0284c7", bg: "#f0f9ff" },
      fiks: { name: isUz ? "Fiks (oylik)" : "Оклад", hint: isUz ? "Har oy belgilangan oylik maosh (oklad)" : "Фиксированная зарплата в месяц",
              price: isUz ? "Oylik summa (UZS)" : "Оклад в месяц (UZS)",
              qty: "", color: "#7c3aed", bg: "#f5f3ff" },
    }[pt];
  }

  function payTypeBadge(j) {
    const t = payTypeText(payTypeOf(j));
    return `<span class="badge" style="background:${t.bg}; color:${t.color}; border:1px solid ${t.color}30; font-weight:700;">${t.name}</span>`;
  }

  // "m²", "soat" or "ish" - what one unit of the quantity is
  function unitText(j) {
    const isUz = isUzbek();
    const pt = payTypeOf(j);
    if (pt === "soatbay") return isUz ? "soat" : "час";
    if (pt === "fiks") return isUz ? "oy" : "мес";
    return j.unit_of_measure || "dona";
  }

  // Type, unit and price fields shared by the add and edit forms
  function jobTypeFields(prefix, jt) {
    const isUz = isUzbek();
    const pt = payTypeOf(jt);
    const unit = jt && jt.unit_of_measure;
    const units = UNITS.some(([v]) => v === unit) || !unit || pt !== "ishbay" ? UNITS : [[unit, unit], ...UNITS];
    return `
      <div class="form-group">
        <label class="form-label">${isUz ? "To'lov turi" : "Тип оплаты"} *</label>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          ${PAY_TYPES.map(k => {
            const t = payTypeText(k);
            return `<label style="display:flex; flex-direction:column; gap:2px; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:10px; cursor:pointer;" class="pt-option">
              <span style="display:flex; align-items:center; gap:6px; font-weight:700; color:${t.color};">
                <input type="radio" name="${prefix}-paytype" value="${k}" ${k === pt ? "checked" : ""} onchange="IshHaqiModule.onPayTypeChange('${prefix}')">
                ${t.name}
              </span>
              <span style="font-size:11.5px; color:#64748b;">${t.hint}</span>
            </label>`;
          }).join("")}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex: 1;" id="${prefix}-unit-group">
          <label class="form-label">${isUz ? "O'lchov birligi" : "Единица измерения"} *</label>
          <select id="${prefix}-unit" class="form-control">
            ${units.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === unit ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label" id="${prefix}-price-label">${payTypeText(pt).price} *</label>
          <input type="number" id="${prefix}-price" class="form-control" required min="1" step="any" placeholder="500" value="${jt ? jt.price_per_unit : ""}">
        </div>
      </div>`;
  }

  function onPayTypeChange(prefix) {
    const checked = document.querySelector(`input[name="${prefix}-paytype"]:checked`);
    const pt = checked ? checked.value : "ishbay";
    const unitGroup = document.getElementById(`${prefix}-unit-group`);
    if (unitGroup) unitGroup.style.display = pt === "ishbay" ? "" : "none";
    const label = document.getElementById(`${prefix}-price-label`);
    if (label) label.textContent = `${payTypeText(pt).price} *`;
    document.querySelectorAll(`input[name="${prefix}-paytype"]`).forEach(r => {
      const box = r.closest(".pt-option");
      if (box) box.style.borderColor = r.checked ? payTypeText(r.value).color : "#e2e8f0";
    });
  }

  function readJobTypeFields(prefix) {
    const checked = document.querySelector(`input[name="${prefix}-paytype"]:checked`);
    return {
      pay_type: checked ? checked.value : "ishbay",
      unit_of_measure: document.getElementById(`${prefix}-unit`).value,
      price_per_unit: parseFloat(document.getElementById(`${prefix}-price`).value),
    };
  }
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
      rowsHtml = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">${isUz ? "Ish turlari mavjud emas" : "Виды работ не добавлены"}</td></tr>`;
    } else {
      jobTypesList.forEach((j, idx) => {
        const statusBadge = j.is_active 
          ? `<span class="badge badge-success">${isUz ? "Faol" : "Активен"}</span>` 
          : `<span class="badge badge-danger">${isUz ? "Nofaol" : "Отключен"}</span>`;

        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(j.name)}</td>
            <td style="text-align: center;">${payTypeBadge(j)}</td>
            <td style="text-align: center;"><span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHtml(unitText(j))}</span></td>
            <td style="text-align: right; font-weight: 800; font-family: monospace; color: #2563eb; font-size: 14px;">${formatNumber(j.price_per_unit)} <small>UZS / ${escapeHtml(unitText(j))}</small></td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="IshHaqiModule.openEditJobTypeModal(${j.id})">${isUz ? "Tahrirlash" : "Изм."}</button>
              <button class="btn btn-danger btn-sm" onclick="IshHaqiModule.deleteJobType(${j.id}, ${jsArg(j.name)})" title="O'chirish" style="margin-left: 4px; padding: 4px 8px; font-size: 12px;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="card-title" style="font-size: 16px; font-weight: 700;">${isUz ? "Ish turlari va narxlar (ishbay, soatbay, fiks)" : "Виды работ и расценки (сдельно, почасово, фикс)"}</div>
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
                  <input type="text" class="table-col-filter" placeholder="${isUz ? 'Qidirish...' : 'Поиск...'}" style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                </th>
                <th style="text-align: center;">${isUz ? "To'lov turi" : "Тип оплаты"}</th>
                <th style="text-align: center;">${isUz ? "Birligi" : "Ед. изм."}</th>
                <th style="text-align: right;">${isUz ? "Narx (Tarif)" : "Расценка"}</th>
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
    const known = departmentIds.includes(selectedDept);
    return (known ? "" : `<option value="" selected disabled>${isUz ? "Ombor tanlang" : "Выберите склад"}</option>`)
      + departmentIds.map(id => `
      <option value="${escapeHtml(id)}" ${id === selectedDept ? 'selected' : ''}>${escapeHtml(deptLabel(id))}</option>
    `).join("");
  }

  async function openAddEmployeeModal() {
    const isUz = isUzbek();
    await ensureJobTypes();
    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="emp-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">${isUz ? "Yangi xodim qo'shish" : "Добавление нового сотрудника"}</div>
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
                  <label class="form-label">${isUz ? "Bo'lim / Ombor" : "Отдел / Склад"} *</label>
                  <select id="emp-dept" class="form-control" required>
                    ${getDeptOptions(departmentIds.includes(activeDept) ? activeDept : "Ma'muriyat")}
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Lavozimi (Ish turi)" : "Должность (Вид работы)"} *</label>
                  <select id="emp-position" class="form-control" required onchange="IshHaqiModule.onPositionChange('emp')">
                    ${positionOptions(null, "")}
                  </select>
                </div>
              </div>
              <div id="emp-pay-info" style="margin:-6px 0 14px; font-size:12.5px; color:#475569;"></div>

              <div id="emp-fixed-fields" style="display:none;">
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

  // Lavozim comes from Ish turlari; its type decides how pay is worked out.
  // All of them, inactive too: an employee may still hold an inactive position.
  async function ensureJobTypes() {
    try { jobTypesList = await API.getJobTypes(false); } catch (_) { /* the select says there are none */ }
  }

  function positionOptions(selectedId, legacyText) {
    const isUz = isUzbek();
    const usable = jobTypesList.filter(j => j.is_active !== false || j.id === selectedId);
    const head = selectedId ? "" : `<option value="" selected ${legacyText ? "" : "disabled"}>${legacyText
      ? `${isUz ? "Hozirgi" : "Сейчас"}: ${escapeHtml(legacyText)} (${isUz ? "ish turidan emas" : "не из видов работ"})`
      : (isUz ? "Lavozimni tanlang" : "Выберите должность")}</option>`;
    return head + PAY_TYPES.map(pt => {
      const list = usable.filter(j => payTypeOf(j) === pt);
      if (!list.length) return "";
      return `<optgroup label="${escapeHtml(payTypeText(pt).name)}">${list.map(j =>
        `<option value="${j.id}" ${j.id === selectedId ? "selected" : ""}>${escapeHtml(j.name)} — ${formatNumber(j.price_per_unit)} UZS / ${escapeHtml(unitText(j))}</option>`).join("")}</optgroup>`;
    }).join("");
  }

  // Show what the chosen position means for pay; a fiks one brings its
  // monthly salary into the salary field.
  function onPositionChange(prefix, fillSalary = true) {
    const isUz = isUzbek();
    const sel = document.getElementById(`${prefix}-position`);
    const jt = sel ? jobTypesList.find(j => String(j.id) === sel.value) : null;
    const info = document.getElementById(`${prefix}-pay-info`);
    const fixed = document.getElementById(`${prefix}-fixed-fields`);
    if (!jt) {
      if (info) info.innerHTML = "";
      return;
    }
    const pt = payTypeOf(jt);
    const t = payTypeText(pt);
    if (info) {
      info.innerHTML = `<span style="color:${t.color}; font-weight:700;">${t.name}</span> · ${pt === "fiks"
        ? (isUz ? "har oy belgilangan oylik maosh" : "фиксированный оклад в месяц")
        : `${formatNumber(jt.price_per_unit)} UZS / ${escapeHtml(unitText(jt))} — ${isUz ? "Kunlik davomat & Ishlar'dagi naryad bo'yicha hisoblanadi" : "считается по нарядам"}`}`;
    }
    if (fixed) fixed.style.display = pt === "fiks" ? "" : "none";
    const salary = document.getElementById(`${prefix}-salary`);
    if (salary && pt === "fiks" && fillSalary) salary.value = jt.price_per_unit;
  }

  async function handleCreateEmployee(e) {
    e.preventDefault();
    const isUz = isUzbek();
    const fullName = document.getElementById("emp-fullname").value;
    const department = document.getElementById("emp-dept").value;
    const jobTypeId = parseInt(document.getElementById("emp-position").value);
    const phone = document.getElementById("emp-phone").value;
    const isFixed = document.getElementById("emp-fixed-fields").style.display !== "none";
    const salary = parseFloat(document.getElementById("emp-salary")?.value || 0);
    const workDays = parseInt(document.getElementById("emp-workdays")?.value || 26);
    const hireDate = document.getElementById("emp-hiredate").value;

    try {
      // Position, pay type and (for fiks) the salary come from the Ish turi.
      await API.createEmployee({
        full_name: fullName,
        department: department,
        job_type_id: jobTypeId,
        phone_number: phone,
        monthly_salary: isFixed ? salary : 0,
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

  async function openEditEmployeeModal(id) {
    const isUz = isUzbek();
    const emp = employeesList.find(e => e.id === id);
    if (!emp) return;
    await ensureJobTypes();

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="emp-edit-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">${isUz ? "Xodim ma'lumotlarini tahrirlash" : "Редактирование сотрудника"}</div>
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
                  <label class="form-label">${isUz ? "Bo'lim / Ombor" : "Отдел / Склад"} *</label>
                  <select id="edit-emp-dept" class="form-control" required>
                    ${getDeptOptions(emp.department || "Ma'muriyat")}
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label">${isUz ? "Lavozimi (Ish turi)" : "Должность (Вид работы)"}</label>
                  <select id="edit-emp-position" class="form-control" onchange="IshHaqiModule.onPositionChange('edit-emp')">
                    ${positionOptions(emp.job_type_id, emp.job_type_id ? "" : emp.position)}
                  </select>
                </div>
              </div>
              <div id="edit-emp-pay-info" style="margin:-6px 0 14px; font-size:12.5px; color:#475569;"></div>

              <div id="edit-emp-fixed-fields" style="${emp.employee_type === 'fixed' ? '' : 'display:none;'}">
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
              </div>

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
    onPositionChange("edit-emp", false);
  }

  async function handleUpdateEmployee(e, id) {
    e.preventDefault();
    const isUz = isUzbek();
    const fullName = document.getElementById("edit-emp-fullname").value;
    const department = document.getElementById("edit-emp-dept").value;
    const jobTypeId = document.getElementById("edit-emp-position").value;
    const phone = document.getElementById("edit-emp-phone").value;
    const isFixed = document.getElementById("edit-emp-fixed-fields").style.display !== "none";
    const salaryInput = document.getElementById("edit-emp-salary");
    const workDaysInput = document.getElementById("edit-emp-workdays");
    const hireDate = document.getElementById("edit-emp-hiredate").value;

    const payload = {
      full_name: fullName,
      department: department,
      phone_number: phone,
      hire_date: hireDate || null
    };
    // An employee whose position is not yet an Ish turi keeps it until one is chosen.
    if (jobTypeId) payload.job_type_id = parseInt(jobTypeId);
    if (isFixed && salaryInput) payload.monthly_salary = parseFloat(salaryInput.value || 0);
    if (isFixed && workDaysInput) payload.standard_work_days = parseInt(workDaysInput.value || 26);

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
            <div class="modal-title">${isUz ? "Yangi ish turi qo'shish" : "Новый вид сдельной работы"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('jt-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateJobType(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ish nomi / Operatsiya" : "Наименование работы"} *</label>
                <input type="text" id="jt-name" class="form-control" required placeholder="Masalan: Kafel saralash va navlash">
              </div>
              ${jobTypeFields("jt", null)}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('jt-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-primary">${isUz ? "Saqlash" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    onPayTypeChange("jt");
  }

  async function handleCreateJobType(e) {
    e.preventDefault();
    const isUz = isUzbek();
    const name = document.getElementById("jt-name").value;

    try {
      await API.createJobType({ name: name, ...readJobTypeFields("jt") });
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
            <div class="modal-title">${isUz ? "Ish turini tahrirlash" : "Редактирование расценки"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('jt-edit-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleUpdateJobType(event, ${jt.id})">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ish nomi" : "Наименование"}</label>
                <input type="text" id="edit-jt-name" class="form-control" required value="${escapeHtml(jt.name)}">
              </div>
              ${jobTypeFields("edit-jt", jt)}
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
    onPayTypeChange("edit-jt");
  }

  async function handleUpdateJobType(e, id) {
    e.preventDefault();
    const isUz = isUzbek();
    const name = document.getElementById("edit-jt-name").value;
    const isActive = document.getElementById("edit-jt-active").checked;

    try {
      await API.updateJobType(id, { name: name, ...readJobTypeFields("edit-jt"), is_active: isActive });
      showToast(isUz ? "Ish turi yangilandi!" : "Вид работы обновлен!", "success");
      closeModal("jt-edit-modal");
      await loadActiveTabContent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deleteJobType(id, jobName) {
    const isUz = isUzbek();
    if (!confirm(isUz ? `${jobName} ish turini butunlay o'chirishni tasdiqlaysizmi?\nUshbu ish turiga tegishli naryad yozuvlari ham o'chiriladi.` : `Удалить вид работ ${jobName} навсегда?`)) return;
    try {
      await API.deleteJobType(id);
      showToast(isUz ? "Ish turi o'chirildi" : "Вид работы удален", "success");
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
    if (!jobTypesList.some(j => j.is_active !== false && payTypeOf(j) !== "fiks")) {
      showToast(isUz ? "Avval ishbay yoki soatbay ish turi qo'shing!" : "Сначала добавьте сдельный или почасовой вид работ!", "warning");
      return;
    }

    let empOptions = pieceworkEmps.map(e => `<option value="${e.id}" data-job="${assignedJobId(e) || ""}">[${escapeHtml(deptLabel(deptKey(e.department)))}] ${escapeHtml(e.full_name)} (${escapeHtml(e.position)})</option>`).join("");
    let jobOptions = jobTypesList.filter(j => j.is_active !== false && payTypeOf(j) !== "fiks").map(j => `<option value="${j.id}" data-price="${j.price_per_unit}" data-unit="${escapeHtml(unitText(j))}" data-paytype="${payTypeOf(j)}">${escapeHtml(j.name)} — ${formatNumber(j.price_per_unit)} UZS / ${escapeHtml(unitText(j))} (${payTypeText(payTypeOf(j)).name})</option>`).join("");

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="work-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">${isUz ? "Bajarilgan ishbay ishni kiritish" : "Внесение сдельного наряда"}</div>
            <button class="modal-close" onclick="IshHaqiModule.closeModal('work-modal')">&times;</button>
          </div>
          <form onsubmit="IshHaqiModule.handleCreateWorkEntry(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${isUz ? "Ishbay xodim" : "Сдельный сотрудник"} *</label>
                <select id="work-empid" class="form-control" required onchange="IshHaqiModule.onWorkEmployeeChange()">
                  ${empOptions}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Bajarilgan ish turi" : "Вид выполненной работы"} *</label>
                <select id="work-jobid" class="form-control" required onchange="IshHaqiModule.onWorkJobChange()">
                  ${jobOptions}
                </select>
                <div id="work-job-hint" style="margin-top: 6px; font-size: 12px; color: #64748b;"></div>
              </div>

              <div class="form-row">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label" id="work-qty-label">${isUz ? "Bajarilgan hajm / Miqdor" : "Объем / Количество"} *</label>
                  <input type="number" id="work-qty" class="form-control" required step="any" min="0.1" value="100" oninput="IshHaqiModule.updateWorkTotalCalc()">
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
    onWorkEmployeeChange();
  }

  // The Ish turi an employee is paid for: their position, or - for people
  // added before positions came from Ish turlari - the job of that name.
  function assignedJobId(e) {
    if (e.job_type_id) return e.job_type_id;
    const name = (e.position || "").trim().toLowerCase();
    const job = name && jobTypesList.find(j => (j.name || "").trim().toLowerCase() === name && payTypeOf(j) !== "fiks");
    return job ? job.id : null;
  }

  // Choosing the employee fills in the job they are assigned and fixes it;
  // "Boshqa ish turi" (freeChoice) frees it for other work done that day.
  function onWorkEmployeeChange(freeChoice = false) {
    const isUz = isUzbek();
    const empSelect = document.getElementById("work-empid");
    const jobSelect = document.getElementById("work-jobid");
    if (!empSelect || !jobSelect) return;
    const opt = empSelect.options[empSelect.selectedIndex];
    const jobId = opt && opt.getAttribute("data-job");
    const assigned = !!jobId && [...jobSelect.options].some(o => o.value === jobId);
    if (assigned && !freeChoice) jobSelect.value = jobId;
    jobSelect.disabled = assigned && !freeChoice;
    jobSelect.style.background = jobSelect.disabled ? "#f1f5f9" : "";
    jobSelect.style.cursor = jobSelect.disabled ? "not-allowed" : "";
    const hint = document.getElementById("work-job-hint");
    if (hint) {
      hint.innerHTML = !assigned
        ? (isUz ? "Xodimga ish turi biriktirilmagan - ro'yxatdan tanlang. Xodimlar ro'yxatida lavozimini belgilasangiz, keyingi safar o'zi chiqadi."
                : "У сотрудника нет вида работ - выберите из списка. Укажите должность в списке сотрудников, и он будет подставляться сам.")
        : freeChoice
          ? (isUz ? "Boshqa ish turi tanlanmoqda." : "Выбирается другой вид работ.")
          : `${isUz ? "Xodimga biriktirilgan ish turi." : "Вид работ сотрудника."}
             <a href="#" onclick="IshHaqiModule.onWorkEmployeeChange(true); return false;" style="font-weight: 600;">${isUz ? "Boshqa ish turi" : "Другой вид работ"}</a>`;
    }
    if (!freeChoice) onWorkJobChange();       // the job only changes with the employee
  }

  // The quantity is hours for soatbay work and a count for fiks work.
  const DEFAULT_QTY = { ishbay: 100, soatbay: 8 };
  function onWorkJobChange() {
    const jobSelect = document.getElementById("work-jobid");
    const qtyInput = document.getElementById("work-qty");
    if (!jobSelect || !qtyInput) return;
    const opt = jobSelect.options[jobSelect.selectedIndex];
    const pt = (opt && opt.getAttribute("data-paytype")) || "ishbay";
    const label = document.getElementById("work-qty-label");
    const unit = opt && opt.getAttribute("data-unit");
    if (label) label.textContent = `${payTypeText(pt).qty}${pt === "ishbay" && unit ? ` (${unit})` : ""} *`;
    qtyInput.value = DEFAULT_QTY[pt];
    updateWorkTotalCalc();
  }

  function updateWorkTotalCalc() {
    const jobSelect = document.getElementById("work-jobid");
    const qtyInput = document.getElementById("work-qty");
    const totalPreview = document.getElementById("work-total-preview");
    if (!jobSelect || !qtyInput || !totalPreview) return;
    if (!jobSelect.options.length) { totalPreview.value = ""; return; }

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

    // Salaries are in so'm: only so'm registers (Kassa UZS, Karta UZS).
    const regOptions = cashRegisters.filter(r => r.currency === "UZS").map(r => `
      <option value="${r.id}">${escapeHtml(r.name)} (${formatNumber(r.balance)} ${r.currency})</option>
    `).join("");

    const modalHost = document.getElementById("salary-modals-host");
    modalHost.innerHTML = `
      <div class="modal-overlay active" id="pay-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">${isUz ? "Ish haqi to'lash" : "Выплата заработной платы"}</div>
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
                <input type="number" id="pay-amount" class="form-control" value="${amount}" required min="1" max="${amount}" step="any" style="font-weight: 700; font-family: monospace;">
              </div>

              <div class="form-group">
                <label class="form-label">${isUz ? "Izoh / To'lov maqsadi" : "Примечание"}</label>
                <input type="text" id="pay-notes" class="form-control" placeholder="${isUz ? 'Naqd / Karta orqali berildi...' : 'Выдано наличными...'}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="IshHaqiModule.closeModal('pay-modal')">${isUz ? "Bekor qilish" : "Отмена"}</button>
              <button type="submit" class="btn btn-success">${isUz ? "To'lovni tasdiqlash" : "Подтвердить выплату"}</button>
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

  async function stornoSalary(calcId, empName) {
    const isUz = isUzbek();
    if (!confirm(isUz
      ? `${empName}: ish haqi to'lovini storno qilasizmi?\nKassadagi chiqim o'chiriladi, pul kassaga qaytadi va oylik qayta "to'lanmagan" bo'ladi.`
      : `${empName}: отменить выплату (сторно)?\nРасход в кассе удалится, деньги вернутся в кассу.`)) return;
    try {
      await API.stornoSalary(calcId);
      showToast(isUz ? "To'lov storno qilindi, pul kassaga qaytdi" : "Выплата отменена, деньги вернулись в кассу", "success");
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
            <div class="modal-title">${isUz ? "Ish haqi hisob-kitob tafsilotlari" : "Детализация расчета ЗП"}</div>
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
                  ${isFixed ? (isUz ? "Fiksalangan oklad" : "Оклад") : (isUz ? "Ishbay to'lov" : "Сдельно")}
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

            <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #e2e8f0;">
              ${ADJ_KINDS.map(k => `
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: ${ADJ_STYLE[k].color};">
                  <span>${adjKindText(k)}:</span>
                  <span style="font-weight: 700; font-family: monospace;">${k === "premiya" ? "+" : "-"}${formatNumber(adjAmount(calc, k))} UZS</span>
                </div>`).join("")}
            </div>

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
    exportPdf,
    changeDailyDate,
    updateHoursTotals,
    saveHours,
    changeAdjustmentsMonth,
    openAdjustmentModal,
    handleCreateAdjustment,
    deleteAdjustment,
    toggleAttRow,
    saveAttendance,
    deleteWorkEntry,
    toggleEmployeeStatus,
    deleteEmployee,
    deleteJobType,
    openAddEmployeeModal,
    openEditEmployeeModal,
    handleCreateEmployee,
    handleUpdateEmployee,
    openAddJobTypeModal,
    openEditJobTypeModal,
    handleCreateJobType,
    handleUpdateJobType,
    onPayTypeChange,
    onPositionChange,
    openAddWorkModal,
    onWorkEmployeeChange,
    onWorkJobChange,
    updateWorkTotalCalc,
    handleCreateWorkEntry,
    openPayModal,
    handlePaySalary,
    stornoSalary,
    openDetailsModal,
    closeModal
  };
})();
