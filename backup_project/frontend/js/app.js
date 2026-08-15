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

  // Restore saved language and role
  const langSelect = document.getElementById("lang-select");
  if (langSelect) langSelect.value = CURRENT_LANG;

  const roleSelect = document.getElementById("role-select");
  if (roleSelect) roleSelect.value = CURRENT_ROLE;

  applyTranslations();
  updateRoleDisplay();
  await updateHeaderFxRate();
  await navigateTo("dashboard");
});

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
}

function onLanguageChange(lang) {
  setLanguage(lang);
  navigateTo(currentModule);
}

function onRoleChange(role) {
  setAppRole(role);
  updateRoleDisplay();
  showToast(`Rol o'zgartirildi: ${role}`, "info");
  navigateTo(currentModule);
}

function updateRoleDisplay() {
  const badge = document.getElementById("user-role-badge");
  if (badge) badge.textContent = CURRENT_ROLE;

  // Filter sidebar visibility for Director / Manager
  const moliyaNavItem = document.querySelector(".nav-item[data-nav='moliya']");
  if (moliyaNavItem) {
    if (CURRENT_ROLE === "Ish boshqaruvchi") {
      moliyaNavItem.style.display = "none";
    } else {
      moliyaNavItem.style.display = "flex";
    }
  }
}

async function navigateTo(moduleName) {
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
