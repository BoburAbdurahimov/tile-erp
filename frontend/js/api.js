const API_BASE = "/api";

let CURRENT_ROLE = localStorage.getItem("erp_role") || "Admin";
let CURRENT_USER = null;

try {
  CURRENT_USER = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (CURRENT_USER && CURRENT_USER.role) {
    CURRENT_ROLE = CURRENT_USER.role;
  }
} catch (_) {}

function setAppRole(role) {
  CURRENT_ROLE = role;
  localStorage.setItem("erp_role", role);
  if (CURRENT_USER) {
    CURRENT_USER.role = role;
    localStorage.setItem("erp_user", JSON.stringify(CURRENT_USER));
  }
}

function setAuthSession(user, token) {
  CURRENT_USER = user;
  CURRENT_ROLE = user.role;
  localStorage.setItem("erp_user", JSON.stringify(user));
  localStorage.setItem("erp_role", user.role);
  localStorage.setItem("erp_token", token);
}

function clearAuthSession() {
  CURRENT_USER = null;
  localStorage.removeItem("erp_user");
  localStorage.removeItem("erp_role");
  localStorage.removeItem("erp_token");
}

async function apiRequest(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("erp_token") || "";
  const headers = {
    "Content-Type": "application/json",
    "x-user-role": CURRENT_ROLE,
    "Authorization": token ? `Bearer ${token}` : ""
  };
  
  const options = {
    method,
    headers
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
      let errDetail = "Server error";
      const rawText = await res.text();
      try {
        const errJson = JSON.parse(rawText);
        if (typeof errJson.detail === 'string') {
          errDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errDetail = errJson.detail.map(e => (e.msg ? `${e.loc ? e.loc.slice(-1)[0] + ': ' : ''}${e.msg}` : JSON.stringify(e))).join(', ');
        } else if (errJson.detail && typeof errJson.detail === 'object') {
          errDetail = JSON.stringify(errJson.detail);
        } else {
          errDetail = JSON.stringify(errJson);
        }
      } catch (_) {
        errDetail = rawText || `HTTP ${res.status}`;
      }
      throw new Error(errDetail);
    }
    return await res.json();
  } catch (error) {
    console.error(`API Request Failed [${method} ${endpoint}]:`, error);
    throw error;
  }
}

const API = {
  // Auth & Roles & Users
  login: (username, password) => apiRequest("/auth/login", "POST", { username, password }),
  getRoles: () => apiRequest("/auth/roles"),
  getCurrentRole: () => apiRequest("/auth/current"),
  getUsers: (includeArchived = true) => apiRequest(`/auth/users?include_archived=${includeArchived}`),
  createUser: (data) => apiRequest("/auth/users", "POST", data),
  updateUser: (id, data) => apiRequest(`/auth/users/${id}`, "PUT", data),
  archiveUser: (id) => apiRequest(`/auth/users/${id}/toggle-archive`, "PUT"),
  deleteUser: (id) => apiRequest(`/auth/users/${id}`, "DELETE"),
  getTelegramUsers: () => apiRequest("/auth/telegram-users"),
  approveTelegramUser: (id, role) => apiRequest(`/auth/telegram-users/${id}/approve`, "PUT", { role, is_approved: true }),
  updateTelegramUserRole: (id, data) => apiRequest(`/auth/telegram-users/${id}/approve`, "PUT", data),
  deleteTelegramUser: (id) => apiRequest(`/auth/telegram-users/${id}`, "DELETE"),
  cleanDemoData: () => apiRequest("/auth/clean-demo-data", "POST"),
  
  // MDM
  getMaterials: (category, includeArchived = false) => {
    let url = `/mdm/materials?include_archived=${includeArchived}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    return apiRequest(url);
  },
  createMaterial: (data) => apiRequest("/mdm/materials", "POST", data),
  updateMaterial: (id, data) => apiRequest(`/mdm/materials/${id}`, "PUT", data),
  archiveMaterial: (id) => apiRequest(`/mdm/materials/${id}/archive`, "POST"),
  deleteMaterial: (id) => apiRequest(`/mdm/materials/${id}`, "DELETE"),
  
  getCounterparties: (type, search, includeArchived = false) => {
    let url = `/mdm/counterparties?include_archived=${includeArchived}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiRequest(url);
  },
  createCounterparty: (data) => apiRequest("/mdm/counterparties", "POST", data),
  updateCounterparty: (id, data) => apiRequest(`/mdm/counterparties/${id}`, "PUT", data),
  archiveCounterparty: (id) => apiRequest(`/mdm/counterparties/${id}/archive`, "POST"),
  deleteCounterparty: (id) => apiRequest(`/mdm/counterparties/${id}`, "DELETE"),
  getWarehouses: () => apiRequest("/mdm/warehouses"),
  createWarehouse: (data) => apiRequest("/mdm/warehouses", "POST", data),
  updateWarehouse: (id, data) => apiRequest(`/mdm/warehouses/${id}`, "PUT", data),
  deleteWarehouse: (id) => apiRequest(`/mdm/warehouses/${id}`, "DELETE"),
  
  // Ombor
  getStockBalances: (warehouseId, category, search) => {
    let url = `/ombor/stock?`;
    if (warehouseId) url += `warehouse_id=${warehouseId}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    return apiRequest(url);
  },
  adjustStockManual: (data) => apiRequest("/ombor/adjust-manual", "POST", data),
  createStockTransfer: (data) => apiRequest("/ombor/transfer", "POST", data),
  getStockTransfers: () => apiRequest("/ombor/transfers"),
  
  // Kassa
  getCashRegisters: (targetDate) => {
    let url = `/kassa/registers`;
    if (targetDate) url += `?target_date=${targetDate}`;
    return apiRequest(url);
  },
  getCashTransactions: (registerId, type, category, startDate, endDate) => {
    let url = `/kassa/transactions?`;
    if (registerId) url += `register_id=${registerId}&`;
    if (type) url += `type=${type}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    return apiRequest(url);
  },
  createCashTransaction: (data) => apiRequest("/kassa/transactions", "POST", data),
  deleteCashTransaction: (id) => apiRequest(`/kassa/transactions/${id}`, "DELETE"),
  getExchangeRates: () => apiRequest("/kassa/exchange-rates"),
  setExchangeRate: (data) => apiRequest("/kassa/exchange-rates", "POST", data),
  syncCbuRate: () => apiRequest("/kassa/exchange-rates/fetch-cbu", "POST"),
  
  // Production
  getProductionLines: () => apiRequest("/ishlab-chiqarish/lines"),
  get7DayStats: () => apiRequest("/ishlab-chiqarish/stats-7-days"),
  getProductionOrders: (lineId, status, startDate, endDate) => {
    let url = `/ishlab-chiqarish/orders?`;
    if (lineId) url += `line_id=${lineId}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    return apiRequest(url);
  },
  createProductionOrder: (data) => apiRequest("/ishlab-chiqarish/orders", "POST", data),
  stornoProductionOrder: (id) => apiRequest(`/ishlab-chiqarish/orders/${id}/storno`, "POST"),
  deleteProductionOrder: (id) => apiRequest(`/ishlab-chiqarish/orders/${id}`, "DELETE"),
  getLineExpenses: (startDate, endDate) => {
    let url = `/ishlab-chiqarish/line-expenses?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    return apiRequest(url);
  },
  createLineExpense: (data) => apiRequest("/ishlab-chiqarish/line-expenses", "POST", data),
  stornoLineExpense: (id) => apiRequest(`/ishlab-chiqarish/line-expenses/${id}/storno`, "POST"),
  
  // Counterparty Balances & Ledger
  getCounterpartiesSummary: (currency = "USD") => apiRequest(`/kontragentlar/summary?view_currency=${currency}`),
  getCounterpartyLedger: (id, currency = "USD") => apiRequest(`/kontragentlar/${id}/ledger?view_currency=${currency}`),
  
  // Trade (Purchases & Sales)
  getPurchases: (supplierId, status, startDate, endDate) => {
    let url = `/savdo/purchases?`;
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    return apiRequest(url);
  },
  createPurchase: (data) => apiRequest("/savdo/purchases", "POST", data),
  stornoPurchase: (id) => apiRequest(`/savdo/purchases/${id}/storno`, "POST"),
  deletePurchase: (id) => apiRequest(`/savdo/purchases/${id}`, "DELETE"),
  
  getSales: (clientId, status, startDate, endDate) => {
    let url = `/savdo/sales?`;
    if (clientId) url += `client_id=${clientId}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    return apiRequest(url);
  },
  createSale: (data) => apiRequest("/savdo/sales", "POST", data),
  stornoSale: (id) => apiRequest(`/savdo/sales/${id}/storno`, "POST"),
  deleteSale: (id) => apiRequest(`/savdo/sales/${id}`, "DELETE"),
  
  // Finance & Month Closing
  getPnL: (yearMonth) => {
    let url = `/moliya/pnl`;
    if (yearMonth) url += `?year_month=${yearMonth}`;
    return apiRequest(url);
  },
  getCashFlow: (yearMonth) => {
    let url = `/moliya/cash-flow`;
    if (yearMonth) url += `?year_month=${yearMonth}`;
    return apiRequest(url);
  },
  getMonthStatus: (yearMonth) => {
    let url = `/moliya/month-closing/status`;
    if (yearMonth) url += `?year_month=${yearMonth}`;
    return apiRequest(url);
  },
  closeMonth: (data) => apiRequest("/moliya/month-closing/close", "POST", data),
  reopenMonth: (data) => apiRequest("/moliya/month-closing/reopen", "POST", data),

  // Salary & HR Management Module
  getEmployees: (type = null, activeOnly = null, search = "", department = "") => {
    let url = `/salary/employees`;
    const params = [];
    if (activeOnly === true || activeOnly === "true") params.push("active_only=true");
    if (type && type !== "all") params.push(`type=${type}`);
    if (department && department !== "all") params.push(`department=${encodeURIComponent(department)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length > 0) url += `?${params.join("&")}`;
    return apiRequest(url);
  },
  createEmployee: (data) => apiRequest("/salary/employees", "POST", data),
  updateEmployee: (id, data) => apiRequest(`/salary/employees/${id}`, "PUT", data),
  toggleEmployeeActive: (id) => apiRequest(`/salary/employees/${id}/toggle-active`, "PUT"),
  deleteEmployee: (id) => apiRequest(`/salary/employees/${id}`, "DELETE"),

  getJobTypes: (activeOnly = false) => {
    let url = "/salary/job-types";
    if (activeOnly === true || activeOnly === "true") url += "?active_only=true";
    return apiRequest(url);
  },
  createJobType: (data) => apiRequest("/salary/job-types", "POST", data),
  updateJobType: (id, data) => apiRequest(`/salary/job-types/${id}`, "PUT", data),
  deleteJobType: (id) => apiRequest(`/salary/job-types/${id}`, "DELETE"),

  getDailySalaryData: (dateStr) => apiRequest(`/salary/daily-data?date_str=${dateStr}`),
  saveDailyAttendance: (data) => apiRequest("/salary/daily-attendance", "POST", data),
  addDailyWork: (data) => apiRequest("/salary/daily-work", "POST", data),
  deleteDailyWork: (id) => apiRequest(`/salary/daily-work/${id}`, "DELETE"),

  getPayroll: (yearMonth, recalculate = false) => apiRequest(`/salary/payroll/${yearMonth}?recalculate=${recalculate}`),
  calculatePayroll: (yearMonth) => apiRequest(`/salary/payroll/${yearMonth}/calculate`, "POST"),
  finalizePayroll: (yearMonth) => apiRequest(`/salary/payroll/${yearMonth}/finalize`, "POST"),
  reopenPayroll: (yearMonth) => apiRequest(`/salary/payroll/${yearMonth}/reopen`, "POST"),
  paySalary: (id, data) => apiRequest(`/salary/payroll/${id}/pay`, "POST", data)
};

