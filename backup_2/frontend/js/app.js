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
