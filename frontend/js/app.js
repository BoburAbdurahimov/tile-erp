let currentModule = "dashboard";
let modalConfirmCallback = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Telegram WebApp SDK if running inside Telegram
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    } catch (e) {
      console.log("Telegram WebApp initialization error:", e);
    }
  }

  // Restore saved language
  const langSelect = document.getElementById("lang-select");
  if (langSelect) langSelect.value = CURRENT_LANG;

  // Check auth session
  checkAuthAndInitialize();
});

function checkAuthAndInitialize() {
  const token = localStorage.getItem("erp_token");
  const user = CURRENT_USER;

  const loginOverlay = document.getElementById("login-overlay");
  const appContainer = document.getElementById("app-main-container");

  if (!token || !user) {
    // Show login screen
    if (loginOverlay) loginOverlay.style.display = "flex";
    if (appContainer) appContainer.style.display = "none";
    return;
  }

  // User is authenticated
  if (loginOverlay) loginOverlay.style.display = "none";
  if (appContainer) appContainer.style.display = "flex";

  applyTranslations();
  updateUserDisplay();
  updateHeaderFxRate();
  navigateTo(currentModule || "dashboard");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const errorMsg = document.getElementById("login-error-msg");
  const loginBtn = document.getElementById("login-btn");

  const username = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!username || !password) return;

  if (errorMsg) errorMsg.style.display = "none";
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Tekshirilmoqda...";
  }

  try {
    const res = await API.login(username, password);
    if (res && res.success) {
      setAuthSession(res.user, res.token);
      showToast(`Xush kelibsiz, ${res.user.full_name || res.user.username}!`, "success");
      checkAuthAndInitialize();
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = err.message || "Login yoki parol noto'g'ri!";
      errorMsg.style.display = "block";
    }
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = "🚀 Tizimga kirish";
    }
  }
}

function logout() {
  if (!confirm("Tizimdan chiqishni tasdiqlaysizmi?")) return;
  clearAuthSession();
  showToast("Tizimdan chiqildi", "info");
  checkAuthAndInitialize();
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
}

function onLanguageChange(lang) {
  setLanguage(lang);
  applyTranslations();
  updateUserDisplay();
  updateMonthStatusBadge(false);
  navigateTo(currentModule);
}

function getUserRoles() {
  if (!CURRENT_USER || !CURRENT_USER.role) return ["Admin"];
  return String(CURRENT_USER.role).split(",").map(r => r.trim()).filter(Boolean);
}

function hasModuleAccess(moduleName) {
  const roles = getUserRoles();
  if (roles.includes("Admin")) return true;
  if (moduleName === "dashboard") return true;

  const isDirector = roles.includes("Direktor") || roles.includes("Ish boshqaruvchi");

  if (moduleName === "mdm") return roles.includes("MDM") || roles.includes("MDM (Spravochniklar)") || isDirector || roles.includes("Ombor") || roles.includes("Omborchi");
  if (moduleName === "ombor") return roles.includes("Ombor") || roles.includes("Omborchi") || isDirector;
  if (moduleName === "kassa") return roles.includes("Kassa") || roles.includes("Kassir") || roles.includes("Buxgalter") || isDirector;
  if (moduleName === "production") return roles.includes("Ishlab chiqarish") || roles.includes("Sex boshlig'i") || isDirector;
  if (moduleName === "balances") return roles.includes("Kontragentlar & Balanslar") || roles.includes("Balanslar") || roles.includes("Buxgalter") || roles.includes("Kassir") || isDirector;
  if (moduleName === "purchases") return roles.includes("Sotib olish (Zakup)") || roles.includes("Ombor") || roles.includes("Omborchi") || isDirector;
  if (moduleName === "sales") return roles.includes("Sotish (Realizatsiya)") || roles.includes("Buxgalter") || isDirector;
  if (moduleName === "finance") return roles.includes("Moliya & PnL") || roles.includes("Moliya") || roles.includes("Moliyachi") || roles.includes("Direktor") || roles.includes("Buxgalter");
  if (moduleName === "salary") return roles.includes("Ish haqi") || roles.includes("Ish haqi & Xodimlar") || roles.includes("Buxgalter") || isDirector;
  if (moduleName === "users") return roles.includes("Admin");
  return false;
}

function updateUserDisplay() {
  const roles = getUserRoles();
  const isAdmin = roles.includes("Admin");
  const displayRoleBadge = isAdmin ? "ADMIN" : (CURRENT_LANG === "uz" ? "FOYDALANUVCHI" : "ПОЛЬЗОВАТЕЛЬ");
  const displayRoleHeader = isAdmin ? "Admin" : (CURRENT_LANG === "uz" ? "Foydalanuvchi" : "Пользователь");

  const roleBadge = document.getElementById("user-role-badge");
  if (roleBadge) {
    roleBadge.textContent = displayRoleBadge;
    roleBadge.style.background = isAdmin ? "#fef2f2" : "#eff6ff";
    roleBadge.style.color = isAdmin ? "#dc2626" : "#2563eb";
    roleBadge.style.border = isAdmin ? "1px solid #fecaca" : "1px solid #bfdbfe";
  }

  const headerRole = document.getElementById("header-role-name");
  if (headerRole) {
    headerRole.textContent = displayRoleHeader;
    headerRole.style.background = isAdmin ? "#fef2f2" : "#f1f5f9";
    headerRole.style.color = isAdmin ? "#dc2626" : "#334155";
  }

  const userNameEl = document.getElementById("current-user-name");
  if (userNameEl && CURRENT_USER) {
    userNameEl.textContent = CURRENT_USER.full_name || CURRENT_USER.username;
  }

  const avatarEl = document.getElementById("current-user-avatar");
  if (avatarEl && CURRENT_USER) {
    avatarEl.textContent = (CURRENT_USER.username || "KZ").substring(0, 2).toUpperCase();
  }

  // Filter sidebar navigation items based on assigned roles
  document.querySelectorAll(".nav-item").forEach(item => {
    const nav = item.getAttribute("data-nav");
    if (nav) {
      item.style.display = hasModuleAccess(nav) ? "flex" : "none";
    }
  });

  // Filter mobile bottom navigation items
  document.querySelectorAll(".mob-nav-item").forEach(item => {
    const nav = item.getAttribute("data-mobnav");
    if (nav) {
      item.style.display = hasModuleAccess(nav) ? "flex" : "none";
    }
  });
}

async function navigateTo(moduleName) {
  if (!hasModuleAccess(moduleName)) {
    showToast("Ushbu modulga kirish uchun sizda ruxsat yo'q!", "error");
    moduleName = "dashboard";
  }
  currentModule = moduleName;
  
  // Highlight active nav item (Desktop & Mobile Mini App)
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-nav") === moduleName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  document.querySelectorAll(".mob-nav-item").forEach(item => {
    if (item.getAttribute("data-mobnav") === moduleName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  const pageTitle = document.getElementById("page-title");
  const container = document.getElementById("module-container");
  if (!container) return;

  container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>`;

  switch (moduleName) {
    case "dashboard":
      if (pageTitle) pageTitle.textContent = t("nav_dashboard");
      await DashboardModule.render(container);
      break;
    case "mdm":
      if (pageTitle) pageTitle.textContent = t("nav_mdm");
      await MdmModule.render(container);
      break;
    case "ombor":
      if (pageTitle) pageTitle.textContent = t("nav_ombor");
      await OmborModule.render(container);
      break;
    case "kassa":
      if (pageTitle) pageTitle.textContent = t("nav_kassa");
      await KassaModule.render(container);
      break;
    case "production":
      if (pageTitle) pageTitle.textContent = t("nav_production");
      await ProductionModule.render(container);
      break;
    case "balances":
      if (pageTitle) pageTitle.textContent = t("nav_balances");
      await BalancesModule.render(container);
      break;
    case "purchases":
      if (pageTitle) pageTitle.textContent = t("nav_purchases");
      await PurchasesModule.render(container);
      break;
    case "sales":
      if (pageTitle) pageTitle.textContent = t("nav_sales");
      await SalesModule.render(container);
      break;
    case "finance":
      if (pageTitle) pageTitle.textContent = t("nav_finance");
      await FinanceModule.render(container);
      break;
    case "salary":
      if (pageTitle) pageTitle.textContent = t("nav_salary");
      container.innerHTML = `<div id="salary-module"></div>`;
      await IshHaqiModule.render();
      break;
    case "users":
      if (pageTitle) pageTitle.textContent = t("nav_users");
      await UsersModule.render(container);
      break;
    default:
      await DashboardModule.render(container);
  }
}

async function updateHeaderFxRate() {
  const badge = document.getElementById("header-fx-rate");
  if (!badge) return;
  try {
    const rates = await API.getExchangeRates();
    if (rates && rates.length > 0) {
      badge.textContent = `1$ = ${rates[0].rate_usd_uzs.toLocaleString()} UZS`;
    }
  } catch (e) {
    badge.textContent = "1$ = 12,850 UZS";
  }
}

function updateMonthStatusBadge(isClosed) {
  const pill = document.getElementById("header-month-status");
  if (!pill) return;
  if (isClosed) {
    pill.className = "month-status-pill closed";
    pill.innerHTML = `🔒 ${t('month_closed')}`;
  } else {
    pill.className = "month-status-pill open";
    pill.innerHTML = `🟢 ${t('month_open')}`;
  }
}

// Modal System
function showModal(title, bodyHtml, onConfirm = null, sizeClass = "") {
  const overlay = document.getElementById("modal-overlay");
  const modalBox = document.getElementById("modal-box");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  const footerEl = document.getElementById("modal-footer");

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;

  modalBox.className = "modal-content " + sizeClass;
  modalConfirmCallback = onConfirm;

  if (onConfirm) {
    footerEl.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">${t('btn_cancel')}</button>
      <button type="button" class="btn btn-primary btn-sm" id="modal-confirm-btn">${t('btn_save')}</button>
    `;
    document.getElementById("modal-confirm-btn").onclick = async () => {
      const btn = document.getElementById("modal-confirm-btn");
      btn.disabled = true;
      btn.textContent = CURRENT_LANG === 'uz' ? "Saqlanmoqda..." : "Сохранение...";
      try {
        const success = await modalConfirmCallback();
        if (success !== false) {
          closeModal();
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_save');
      }
    };
  } else {
    footerEl.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">Yopish</button>
    `;
  }

  overlay.classList.add("active");
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.classList.remove("active");
  modalConfirmCallback = null;
}

// Toast System
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Universal Table Sorting & Column Filtering System with Smart 7-Option Dropdown
const TableFilterSort = {
  currentInput: null,

  parseSortValue(val) {
    if (val === null || val === undefined) return { type: "string", val: "" };
    val = String(val).trim();
    if (val === "" || val === "-") return { type: "number", val: 0 };

    // Check Date format (DD.MM.YYYY or YYYY-MM-DD)
    const dmyMatch = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmyMatch) {
      const d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
      return { type: "date", val: d.getTime() };
    }
    const ymdMatch = val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
      const d = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
      return { type: "date", val: d.getTime() };
    }

    // Clean numeric string: remove currency symbols ($ € £ UZS), spaces, units (m², kg, etc.)
    let cleaned = val.replace(/[$€£UZSso'm\s\u00a0]/gi, "").trim();
    cleaned = cleaned.replace(/(m²|kg|dona|metr|tonna|litr|л|кг|м²|шт|т)%?/gi, "").trim();
    
    // Normalize decimal comma vs dot
    if (cleaned.includes(",") && !cleaned.includes(".")) {
      cleaned = cleaned.replace(",", ".");
    } else if (cleaned.includes(",") && cleaned.includes(".")) {
      if (cleaned.indexOf(".") < cleaned.indexOf(",")) {
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        cleaned = cleaned.replace(/,/g, "");
      }
    }

    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num) && /^[-+]?\d+(\.\d+)?$/.test(cleaned)) {
      return { type: "number", val: num };
    }

    return { type: "string", val: val.toLowerCase() };
  },

  sortTable(tableRef, colIndex, isNumeric = false) {
    const table = typeof tableRef === "string" ? document.getElementById(tableRef) : (tableRef.closest("table") || tableRef);
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll("tr"));
    if (rows.length === 0) return;

    const ths = table.querySelectorAll("thead tr:first-child th");
    const targetTh = ths[colIndex];
    if (!targetTh) return;

    const currentDir = targetTh.getAttribute("data-sort-dir") === "asc" ? "desc" : "asc";

    ths.forEach(h => {
      h.removeAttribute("data-sort-dir");
      const icon = h.querySelector(".sort-icon");
      if (icon) icon.textContent = "↕";
    });

    targetTh.setAttribute("data-sort-dir", currentDir);
    const icon = targetTh.querySelector(".sort-icon");
    if (icon) icon.textContent = currentDir === "asc" ? "▲" : "▼";

    rows.sort((a, b) => {
      const aCell = a.children[colIndex];
      const bCell = b.children[colIndex];
      if (!aCell || !bCell) return 0;

      let aRaw = aCell.getAttribute("data-sort-value");
      if (aRaw === null || aRaw === undefined) aRaw = aCell.textContent.trim();
      let bRaw = bCell.getAttribute("data-sort-value");
      if (bRaw === null || bRaw === undefined) bRaw = bCell.textContent.trim();

      const aParsed = TableFilterSort.parseSortValue(aRaw);
      const bParsed = TableFilterSort.parseSortValue(bRaw);

      if (aParsed.type === "number" && bParsed.type === "number") {
        return currentDir === "asc" ? aParsed.val - bParsed.val : bParsed.val - aParsed.val;
      }
      if (aParsed.type === "date" && bParsed.type === "date") {
        return currentDir === "asc" ? aParsed.val - bParsed.val : bParsed.val - aParsed.val;
      }
      return currentDir === "asc" 
        ? String(aRaw).localeCompare(String(bRaw), undefined, { numeric: true, sensitivity: 'base' })
        : String(bRaw).localeCompare(String(aRaw), undefined, { numeric: true, sensitivity: 'base' });
    });

    rows.forEach(r => tbody.appendChild(r));
  },

  filterTable(inputEl) {
    const table = inputEl.closest("table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const filterInputs = table.querySelectorAll("thead tr.filter-row .table-col-filter");
    const filters = [];
    filterInputs.forEach(input => {
      const col = parseInt(input.getAttribute("data-col-idx"), 10);
      const val = input.value.trim().toLowerCase();
      if (val) {
        filters.push({ col, val });
      }
    });

    const rows = tbody.querySelectorAll("tr");
    rows.forEach(row => {
      let matches = true;
      for (const f of filters) {
        const cell = row.children[f.col];
        if (cell) {
          const text = (cell.textContent + " " + (cell.getAttribute("data-sort-value") || "")).trim().toLowerCase();
          if (!text.includes(f.val)) {
            matches = false;
            break;
          }
        }
      }
      row.style.display = matches ? "" : "none";
    });
  },

  showSuggestions(inputEl) {
    this.currentInput = inputEl;
    const table = inputEl.closest("table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const colIdx = parseInt(inputEl.getAttribute("data-col-idx"), 10);
    if (isNaN(colIdx)) return;

    // Collect distinct values
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const valueCountMap = {};

    rows.forEach(row => {
      const cell = row.children[colIdx];
      if (cell) {
        // Clean displayed text value
        let val = cell.textContent.trim();
        val = val.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
        if (val && val !== "-" && val !== "0" && val.length < 50) {
          valueCountMap[val] = (valueCountMap[val] || 0) + 1;
        }
      }
    });

    const query = inputEl.value.trim().toLowerCase();
    let distinctValues = Object.keys(valueCountMap);

    if (query) {
      distinctValues = distinctValues.filter(v => v.toLowerCase().includes(query));
    }

    // Sort by count descending then take top 7
    distinctValues.sort((a, b) => valueCountMap[b] - valueCountMap[a]);
    const top7 = distinctValues.slice(0, 7);

    // Get or create dropdown
    let dropdown = document.getElementById("table-filter-dropdown");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "table-filter-dropdown";
      document.body.appendChild(dropdown);
    }

    if (top7.length === 0 && !inputEl.value) {
      this.hideSuggestions();
      return;
    }

    let itemsHtml = `
      <div class="filter-dropdown-header">${CURRENT_LANG === 'uz' ? 'TOP 7 VARIANT' : 'ТОП 7 ВАРИАНТОВ'}</div>
    `;

    if (top7.length > 0) {
      itemsHtml += top7.map(val => `
        <div class="filter-dropdown-item" onmousedown="TableFilterSort.selectSuggestion('${val.replace(/'/g, "\\'")}')">
          <span style="overflow: hidden; text-overflow: ellipsis;">🔹 ${val}</span>
          <span style="font-size: 10px; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 10px;">${valueCountMap[val]}</span>
        </div>
      `).join("");
    } else {
      itemsHtml += `
        <div style="padding: 8px 12px; color: #94a3b8; font-size: 12px;">
          ${CURRENT_LANG === 'uz' ? "Variant topilmadi (erkin yozing)" : "Нет совпадений (введите текст)"}
        </div>
      `;
    }

    if (inputEl.value) {
      itemsHtml += `
        <div class="filter-dropdown-clear" onmousedown="TableFilterSort.clearSuggestion()">
          <span>✖</span> <span>${CURRENT_LANG === 'uz' ? "Filtrni tozalash" : "Сбросить фильтр"}</span>
        </div>
      `;
    }

    dropdown.innerHTML = itemsHtml;

    // Position dropdown
    const rect = inputEl.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + window.scrollY + 4) + "px";
    dropdown.style.left = (rect.left + window.scrollX) + "px";
    dropdown.style.width = Math.max(rect.width, 180) + "px";
    dropdown.style.display = "block";
  },

  selectSuggestion(val) {
    if (this.currentInput) {
      this.currentInput.value = val;
      this.filterTable(this.currentInput);
    }
    this.hideSuggestions();
  },

  clearSuggestion() {
    if (this.currentInput) {
      this.currentInput.value = "";
      this.filterTable(this.currentInput);
    }
    this.hideSuggestions();
  },

  hideSuggestions() {
    const dropdown = document.getElementById("table-filter-dropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
    this.currentInput = null;
  }
};

// Global Listeners for Table Filters
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("table-col-filter")) {
    TableFilterSort.showSuggestions(e.target);
  } else if (!e.target.closest("#table-filter-dropdown")) {
    TableFilterSort.hideSuggestions();
  }
});

document.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("table-col-filter")) {
    TableFilterSort.showSuggestions(e.target);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("table-col-filter")) {
    TableFilterSort.filterTable(e.target);
    TableFilterSort.showSuggestions(e.target);
  }
});

// Universal Excel Exporter Utility
function exportTableToExcel(tableRef, filename = "hisobot") {
  const table = typeof tableRef === "string" ? document.getElementById(tableRef) : tableRef;
  if (!table) return;

  const theadThs = Array.from(table.querySelectorAll("thead tr:first-child th"));
  const headers = [];
  const validColIndices = [];

  theadThs.forEach((th, idx) => {
    const text = th.textContent.replace(/[↕▲▼]/g, "").trim();
    const lower = text.toLowerCase();
    if (text && lower !== "amallar" && lower !== "действия" && lower !== "actions") {
      headers.push(text);
      validColIndices.push(idx);
    }
  });

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  let tableHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
  <body>
  <table border="1">
    <thead style="background-color: #f1f5f9; font-weight: bold;">
      <tr>
        ${headers.map(h => `<th style="background-color: #e2e8f0; padding: 6px 10px;">${h}</th>`).join("")}
      </tr>
    </thead>
    <tbody>`;

  let visibleCount = 0;
  rows.forEach(tr => {
    if (tr.style.display === "none") return;
    visibleCount++;
    const cells = Array.from(tr.children);
    tableHtml += "<tr>";
    validColIndices.forEach(idx => {
      const cell = cells[idx];
      let val = cell ? (cell.getAttribute("data-sort-value") || cell.textContent).trim().replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ") : "";
      tableHtml += `<td style="padding: 5px 8px;">${val}</td>`;
    });
    tableHtml += "</tr>";
  });

  tableHtml += `</tbody></table></body></html>`;

  if (visibleCount === 0) {
    showToast(CURRENT_LANG === 'uz' ? "Eksport qilish uchun ma'lumot topilmadi!" : "Нет данных для экспорта!", "warning");
    return;
  }

  const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(CURRENT_LANG === 'uz' ? "Excel fayli muvaffaqiyatli yuklab olindi!" : "Файл Excel успешно скачан!", "success");
}
