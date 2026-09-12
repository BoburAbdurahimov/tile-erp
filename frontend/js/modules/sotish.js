/**
 * Sales pipeline: Order -> Delivery -> Payment.
 *
 * Stage 1 reserves stock and shows, live, whether the warehouse can cover the
 * order and how much must still be produced before the deadline.
 * Stage 2 records the vehicle and driver and ships the goods (stock leaves here).
 * Stage 3 takes full or partial payments until the order is settled.
 */
const SalesModule = {
  activeTab: "orders",          // orders | delivery | payments
  orders: [],
  availability: [],
  plan: [],
  clients: [],
  draftLines: [],
  pollTimer: null,
  POLL_MS: 15000,

  // ---------- status helpers ----------
  STATUS: {
    NEW: "Yangi",
    DELIVERED: "Yetkazildi",
    PAID: "To'landi",
    CANCELLED: "Bekor"
  },

  statusBadge(status) {
    const isUz = CURRENT_LANG === "uz";
    const map = {
      "Yangi":      { bg: "#fef3c7", fg: "#b45309", bd: "#fde68a", uz: "Yangi buyurtma", ru: "Новый заказ" },
      "Yetkazildi": { bg: "#dbeafe", fg: "#1d4ed8", bd: "#bfdbfe", uz: "Yetkazildi",     ru: "Доставлен" },
      "To'landi":   { bg: "#dcfce7", fg: "#15803d", bd: "#bbf7d0", uz: "To'landi",       ru: "Оплачен" },
      "Bekor":      { bg: "#f1f5f9", fg: "#64748b", bd: "#e2e8f0", uz: "Bekor qilindi",  ru: "Отменен" }
    };
    const s = map[status] || map["Bekor"];
    return `<span style="background:${s.bg};color:${s.fg};border:1px solid ${s.bd};padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:700;white-space:nowrap;">${isUz ? s.uz : s.ru}</span>`;
  },

  money(v, ccy) {
    return `${ccy === "USD" ? "$" : ""}${formatNumber(v, 0, 2)}${ccy === "UZS" ? " UZS" : ""}`;
  },

  // ---------- shell ----------
  async render(container) {
    const isUz = CURRENT_LANG === "uz";
    container.innerHTML = `
      <div class="subnav-driven" id="sales-module">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <div>
              <h2 id="sales-heading" style="margin:0;font-size:21px;font-weight:700;color:#0f172a;"></h2>
              <p id="sales-subheading" style="margin:4px 0 0 0;color:#64748b;font-size:13px;"></p>
            </div>
            <div id="sales-actions" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
          </div>

          <!-- Shown on phones, where the sidebar sub-nav is hidden -->
          <div class="module-tab-strip" style="display:flex;gap:6px;border-bottom:1px solid #e2e8f0;margin-bottom:16px;flex-wrap:wrap;">
            ${["orders", "delivery", "payments"].map(k => {
              const label = { orders: [isUz ? "Buyurtmalar" : "Заказы"], delivery: [isUz ? "Yetkazib berish" : "Доставка"], payments: [isUz ? "To'lovlar" : "Оплаты"] }[k][0];
              return `<button class="tab-btn" onclick="SalesModule.switchTab('${k}')" style="padding:10px 14px;font-weight:600;font-size:13px;border:none;background:transparent;cursor:pointer;border-bottom:3px solid transparent;color:#64748b;">${label}</button>`;
            }).join("")}
          </div>

          <div id="sales-content">
            <div style="text-align:center;padding:40px;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
          </div>
        </div>
      </div>
    `;
    await this.switchTab(this.activeTab);
  },

  async switchTab(tab) {
    this.activeTab = tab || "orders";
    this.stopPolling();
    await this.loadData();
    this.renderHeader();
    await this.renderContent();
    if (this.activeTab === "orders") this.startPolling();
  },

  renderHeader() {
    const isUz = CURRENT_LANG === "uz";
    const meta = {
      orders: {
        title: isUz ? "Buyurtmalar" : "Заказы",
        sub: isUz
          ? "Buyurtma qabul qilinganda tovar omborda zahiralanadi va yetishmasa ishlab chiqarish rejasi ko'rsatiladi"
          : "При приеме заказа товар резервируется, при нехватке показывается план производства",
        action: `<button class="btn btn-primary btn-sm" onclick="SalesModule.openNewOrderModal()">+ ${isUz ? "Yangi buyurtma" : "Новый заказ"}</button>`
      },
      delivery: {
        title: isUz ? "Yetkazib berish" : "Доставка",
        sub: isUz
          ? "Mashina raqami va haydovchi ma'lumotlari bilan jo'natishni tasdiqlang. Tovar shu bosqichda ombordan chiqadi"
          : "Подтвердите отгрузку с номером машины и данными водителя. Товар списывается здесь",
        action: ""
      },
      payments: {
        title: isUz ? "To'lovlar" : "Оплаты",
        sub: isUz
          ? "Yetkazilgan buyurtmalar bo'yicha to'lovlar. To'liq to'langanda buyurtma yopiladi"
          : "Оплаты по доставленным заказам. Заказ закрывается после полной оплаты",
        action: ""
      }
    }[this.activeTab];

    const h = document.getElementById("sales-heading");
    const s = document.getElementById("sales-subheading");
    const a = document.getElementById("sales-actions");
    if (h) h.textContent = meta.title;
    if (s) s.textContent = meta.sub;
    if (a) a.innerHTML = meta.action;

    document.querySelectorAll("#sales-module .module-tab-strip .tab-btn").forEach(btn => {
      const on = btn.getAttribute("onclick").includes(`'${this.activeTab}'`);
      btn.style.borderBottomColor = on ? "#2563eb" : "transparent";
      btn.style.color = on ? "#2563eb" : "#64748b";
    });
  },

  async loadData() {
    try {
      const [orders, avail, plan] = await Promise.all([
        API.getOrders(),
        API.getStockAvailability(1),
        API.getProductionPlan(1)
      ]);
      this.orders = orders || [];
      this.availability = (avail && avail.items) || [];
      this.plan = (plan && plan.rows) || [];
    } catch (e) {
      showToast(e.message, "error");
      this.orders = this.orders || [];
    }
  },

  async renderContent() {
    const el = document.getElementById("sales-content");
    if (!el) return;
    if (this.activeTab === "orders") el.innerHTML = this.ordersPage();
    else if (this.activeTab === "delivery") el.innerHTML = this.deliveryPage();
    else el.innerHTML = this.paymentsPage();
    if (typeof makeTablesScrollable === "function") makeTablesScrollable(el);
  },

  empty(icon, text) {
    return `<div style="text-align:center;padding:44px 20px;color:#64748b;">
      <div style="font-size:38px;margin-bottom:10px;">${icon}</div>
      <p style="margin:0;">${text}</p>
    </div>`;
  },

  // ================= STAGE 1: ORDERS =================
  ordersPage() {
    const isUz = CURRENT_LANG === "uz";
    const open = this.orders.filter(o => o.status === this.STATUS.NEW);

    // Production shortfall panel: what the warehouse cannot cover yet.
    let planHtml = "";
    if (this.plan.length) {
      planHtml = `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-weight:700;color:#b45309;margin-bottom:8px;font-size:14px;">
            ${isUz ? "Ishlab chiqarish kerak" : "Требуется произвести"}
          </div>
          <div class="table-container">
            <table class="data-table" style="width:100%;">
              <thead><tr>
                <th>${isUz ? "Artikul" : "Артикул"}</th>
                <th>${isUz ? "Mahsulot" : "Продукция"}</th>
                <th style="text-align:right;">${isUz ? "Buyurtma" : "Заказано"}</th>
                <th style="text-align:right;">${isUz ? "Omborda" : "На складе"}</th>
                <th style="text-align:right;">${isUz ? "Ishlab chiqarish" : "Произвести"}</th>
                <th>${isUz ? "Muddat" : "Срок"}</th>
              </tr></thead>
              <tbody>
                ${this.plan.map(r => {
                  const late = r.days_left !== null && r.days_left < 0;
                  const soon = r.days_left !== null && r.days_left <= 3 && r.days_left >= 0;
                  const col = late ? "#dc2626" : (soon ? "#b45309" : "#475569");
                  const dl = r.deadline
                    ? `${r.deadline} <span style="color:${col};font-weight:700;">(${late ? (isUz ? "kechikdi" : "просрочен") : r.days_left + (isUz ? " kun" : " дн.")})</span>`
                    : `<span style="color:#94a3b8;">${isUz ? "belgilanmagan" : "не задан"}</span>`;
                  return `<tr>
                    <td><code>${r.article_no ?? "-"}</code></td>
                    <td>${r.name}</td>
                    <td style="text-align:right;">${formatNumber(r.ordered)} ${r.unit}</td>
                    <td style="text-align:right;">${formatNumber(r.on_hand)} ${r.unit}</td>
                    <td style="text-align:right;font-weight:800;color:#b45309;">${formatNumber(r.must_produce)} ${r.unit}</td>
                    <td>${dl}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    const rows = this.orders.map(o => {
      const buyer = o.is_walkin
        ? `${o.buyer_name} <span style="color:#94a3b8;font-size:11px;">(${isUz ? "bir martalik" : "разовый"})</span>`
        : o.buyer_name;
      const dl = o.deadline
        ? `${o.deadline}${o.days_left !== null && o.status === this.STATUS.NEW
            ? ` <span style="color:${o.days_left < 0 ? "#dc2626" : (o.days_left <= 3 ? "#b45309" : "#64748b")};font-weight:700;">(${o.days_left < 0 ? (isUz ? "kechikdi" : "просрочен") : o.days_left + (isUz ? " kun" : " дн.")})</span>`
            : ""}`
        : "-";
      const canCancel = o.status === this.STATUS.NEW;
      return `<tr>
        <td><strong>${o.order_number}</strong><div style="font-size:11px;color:#94a3b8;">${o.order_date}</div></td>
        <td>${buyer}${o.walkin_phone ? `<div style="font-size:11px;color:#64748b;">${o.walkin_phone}</div>` : ""}</td>
        <td>${o.items.map(i => `<div style="font-size:12px;">${i.material_name} <strong>${formatNumber(i.quantity)}</strong> ${i.unit}</div>`).join("")}</td>
        <td style="text-align:right;font-weight:700;">${this.money(o.total_amount, o.currency)}</td>
        <td>${dl}</td>
        <td>${this.statusBadge(o.status)}</td>
        <td style="text-align:right;">
          ${canCancel ? `<button class="btn btn-sm" onclick="SalesModule.cancelOrder(${o.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">${isUz ? "Bekor" : "Отменить"}</button>` : ""}
        </td>
      </tr>`;
    }).join("");

    return `
      ${planHtml}
      ${this.availabilityPanel()}
      ${this.orders.length === 0
        ? this.empty("📋", isUz ? "Hozircha buyurtmalar yo'q" : "Заказов пока нет")
        : `<div class="table-container">
            <table class="data-table" id="orders-table" style="width:100%;">
              <thead><tr>
                <th>${isUz ? "Buyurtma" : "Заказ"}</th>
                <th>${isUz ? "Xaridor" : "Покупатель"}</th>
                <th>${isUz ? "Tovarlar" : "Товары"}</th>
                <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
                <th>${isUz ? "Muddat" : "Срок"}</th>
                <th>${isUz ? "Holat" : "Статус"}</th>
                <th style="text-align:right;">${isUz ? "Amal" : "Действие"}</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`}
      <div style="margin-top:10px;font-size:11.5px;color:#94a3b8;">
        ${isUz ? "Ombor holati har 15 soniyada yangilanadi" : "Остатки обновляются каждые 15 секунд"}
        · <span id="sales-poll-stamp"></span>
      </div>`;
  },

  availabilityPanel() {
    const isUz = CURRENT_LANG === "uz";
    const short = this.availability.filter(a => a.free < 0);
    const low = this.availability.filter(a => a.free >= 0 && a.reserved > 0);
    if (!short.length && !low.length) return "";
    return `
      <div id="availability-panel" style="background:${short.length ? "#fef2f2" : "#f0f9ff"};border:1px solid ${short.length ? "#fecaca" : "#bae6fd"};border-radius:10px;padding:12px 16px;margin-bottom:16px;">
        <div style="font-weight:700;color:${short.length ? "#b91c1c" : "#0369a1"};font-size:13px;margin-bottom:6px;">
          ${short.length
            ? (isUz ? "Omborda yetishmayapti" : "Не хватает на складе")
            : (isUz ? "Zahiralangan tovarlar" : "Зарезервированные товары")}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${[...short, ...low].slice(0, 12).map(a => `
            <span style="background:#fff;border:1px solid ${a.free < 0 ? "#fecaca" : "#e2e8f0"};border-radius:8px;padding:5px 9px;font-size:11.5px;">
              <strong>${a.code}</strong>
              <span style="color:#64748b;">${isUz ? "erkin" : "свободно"}:</span>
              <strong style="color:${a.free < 0 ? "#dc2626" : "#059669"};">${formatNumber(a.free)}</strong>
              <span style="color:#94a3b8;">/ ${formatNumber(a.on_hand)} ${a.unit}</span>
            </span>`).join("")}
        </div>
      </div>`;
  },

  // ================= STAGE 2: DELIVERY =================
  deliveryPage() {
    const isUz = CURRENT_LANG === "uz";
    const pending = this.orders.filter(o => o.status === this.STATUS.NEW);
    const done = this.orders.filter(o => o.delivery);

    const availById = {};
    this.availability.forEach(a => { availById[a.material_id] = a; });

    const pendingRows = pending.map(o => {
      // Can every line be covered from stock on hand right now?
      const blocked = o.items.filter(i => {
        const a = availById[i.material_id];
        return !a || a.on_hand < i.quantity;
      });
      const ready = blocked.length === 0;
      return `<tr>
        <td><strong>${o.order_number}</strong><div style="font-size:11px;color:#94a3b8;">${o.order_date}</div></td>
        <td>${o.buyer_name}</td>
        <td>${o.items.map(i => {
          const a = availById[i.material_id];
          const enough = a && a.on_hand >= i.quantity;
          return `<div style="font-size:12px;">${i.material_name} <strong>${formatNumber(i.quantity)}</strong> ${i.unit}
            <span style="color:${enough ? "#059669" : "#dc2626"};font-size:11px;">(${isUz ? "omborda" : "на складе"} ${formatNumber(a ? a.on_hand : 0)})</span></div>`;
        }).join("")}</td>
        <td style="text-align:right;font-weight:700;">${this.money(o.total_amount, o.currency)}</td>
        <td>
          ${ready
            ? `<span style="color:#059669;font-weight:700;font-size:12px;">${isUz ? "Tayyor" : "Готов"}</span>`
            : `<span style="color:#dc2626;font-weight:700;font-size:12px;">${isUz ? "Tovar yetarli emas" : "Не хватает товара"}</span>`}
        </td>
        <td style="text-align:right;">
          <button class="btn btn-sm" ${ready ? "" : "disabled"}
            onclick="SalesModule.openDeliverModal(${o.id})"
            style="background:${ready ? "#2563eb" : "#e2e8f0"};color:${ready ? "#fff" : "#94a3b8"};border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:${ready ? "pointer" : "not-allowed"};">
            ${isUz ? "Jo'natish" : "Отгрузить"}
          </button>
        </td>
      </tr>`;
    }).join("");

    const doneRows = done.map(o => `<tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.buyer_name}</td>
      <td>${o.delivery.delivered_date}</td>
      <td><code>${o.delivery.car_number}</code></td>
      <td>${o.delivery.driver_name}${o.delivery.driver_phone ? `<div style="font-size:11px;color:#64748b;">${o.delivery.driver_phone}</div>` : ""}</td>
      <td>${o.delivery.destination || "-"}</td>
      <td>${this.statusBadge(o.status)}</td>
    </tr>`).join("");

    return `
      <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">${isUz ? "Jo'natishni kutayotgan buyurtmalar" : "Заказы к отгрузке"}</h3>
      ${pending.length === 0
        ? this.empty("🚚", isUz ? "Jo'natish uchun buyurtma yo'q" : "Нет заказов к отгрузке")
        : `<div class="table-container"><table class="data-table" style="width:100%;">
            <thead><tr>
              <th>${isUz ? "Buyurtma" : "Заказ"}</th><th>${isUz ? "Xaridor" : "Покупатель"}</th>
              <th>${isUz ? "Tovarlar" : "Товары"}</th><th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th>${isUz ? "Holat" : "Готовность"}</th><th style="text-align:right;">${isUz ? "Amal" : "Действие"}</th>
            </tr></thead><tbody>${pendingRows}</tbody></table></div>`}

      <h3 style="margin:26px 0 10px 0;font-size:15px;color:#0f172a;">${isUz ? "Jo'natilganlar" : "Отгруженные"}</h3>
      ${done.length === 0
        ? this.empty("📭", isUz ? "Hali jo'natilgan buyurtma yo'q" : "Отгруженных заказов пока нет")
        : `<div class="table-container"><table class="data-table" id="deliveries-table" style="width:100%;">
            <thead><tr>
              <th>${isUz ? "Buyurtma" : "Заказ"}</th><th>${isUz ? "Xaridor" : "Покупатель"}</th>
              <th>${isUz ? "Sana" : "Дата"}</th><th>${isUz ? "Mashina" : "Машина"}</th>
              <th>${isUz ? "Haydovchi" : "Водитель"}</th><th>${isUz ? "Manzil" : "Адрес"}</th>
              <th>${isUz ? "Holat" : "Статус"}</th>
            </tr></thead><tbody>${doneRows}</tbody></table></div>`}`;
  },

  // ================= STAGE 3: PAYMENTS =================
  paymentsPage() {
    const isUz = CURRENT_LANG === "uz";
    const awaiting = this.orders.filter(o => o.status === this.STATUS.DELIVERED);
    const settled = this.orders.filter(o => o.status === this.STATUS.PAID);

    const totalDue = awaiting.reduce((s, o) => s + o.remaining_amount, 0);

    const rows = awaiting.map(o => {
      const pct = o.total_amount > 0 ? Math.round((o.paid_amount / o.total_amount) * 100) : 0;
      return `<tr>
        <td><strong>${o.order_number}</strong><div style="font-size:11px;color:#94a3b8;">${o.delivery ? o.delivery.delivered_date : o.order_date}</div></td>
        <td>${o.buyer_name}</td>
        <td style="text-align:right;">${this.money(o.total_amount, o.currency)}</td>
        <td style="text-align:right;color:#059669;font-weight:700;">${this.money(o.paid_amount, o.currency)}</td>
        <td style="text-align:right;color:#dc2626;font-weight:800;">${this.money(o.remaining_amount, o.currency)}</td>
        <td style="min-width:110px;">
          <div style="background:#f1f5f9;border-radius:20px;height:7px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#22c55e;"></div>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">${pct}%</div>
        </td>
        <td style="text-align:right;">
          <button class="btn btn-sm" onclick="SalesModule.openPaymentModal(${o.id})"
            style="background:#059669;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
            ${isUz ? "To'lov qabul qilish" : "Принять оплату"}
          </button>
        </td>
      </tr>`;
    }).join("");

    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:180px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;">
          <div style="font-size:11.5px;color:#b91c1c;font-weight:700;text-transform:uppercase;">${isUz ? "To'lanmagan qoldiq" : "Не оплачено"}</div>
          <div style="font-size:24px;font-weight:800;color:#dc2626;margin-top:4px;">${formatNumber(totalDue, 0, 2)}</div>
        </div>
        <div style="flex:1;min-width:180px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;">
          <div style="font-size:11.5px;color:#15803d;font-weight:700;text-transform:uppercase;">${isUz ? "Yopilgan buyurtmalar" : "Закрытые заказы"}</div>
          <div style="font-size:24px;font-weight:800;color:#16a34a;margin-top:4px;">${settled.length}</div>
        </div>
      </div>

      <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">${isUz ? "To'lov kutilmoqda" : "Ожидают оплаты"}</h3>
      ${awaiting.length === 0
        ? this.empty("💰", isUz ? "To'lov kutayotgan buyurtma yo'q" : "Нет заказов, ожидающих оплаты")
        : `<div class="table-container"><table class="data-table" id="payments-table" style="width:100%;">
            <thead><tr>
              <th>${isUz ? "Buyurtma" : "Заказ"}</th><th>${isUz ? "Xaridor" : "Покупатель"}</th>
              <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th style="text-align:right;">${isUz ? "To'langan" : "Оплачено"}</th>
              <th style="text-align:right;">${isUz ? "Qoldiq" : "Остаток"}</th>
              <th>${isUz ? "Jarayon" : "Прогресс"}</th>
              <th style="text-align:right;">${isUz ? "Amal" : "Действие"}</th>
            </tr></thead><tbody>${rows}</tbody></table></div>`}

      <h3 style="margin:26px 0 10px 0;font-size:15px;color:#0f172a;">${isUz ? "To'liq to'langan" : "Полностью оплачены"}</h3>
      ${settled.length === 0
        ? this.empty("✅", isUz ? "Hali yopilgan buyurtma yo'q" : "Закрытых заказов пока нет")
        : `<div class="table-container"><table class="data-table" style="width:100%;">
            <thead><tr>
              <th>${isUz ? "Buyurtma" : "Заказ"}</th><th>${isUz ? "Xaridor" : "Покупатель"}</th>
              <th style="text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th>${isUz ? "To'lovlar" : "Платежи"}</th><th>${isUz ? "Holat" : "Статус"}</th>
            </tr></thead><tbody>
              ${settled.map(o => `<tr>
                <td><strong>${o.order_number}</strong></td>
                <td>${o.buyer_name}</td>
                <td style="text-align:right;font-weight:700;">${this.money(o.total_amount, o.currency)}</td>
                <td>${o.payments.map(p => `<div style="font-size:11.5px;">${p.paid_date}: <strong>${this.money(p.amount, p.currency)}</strong></div>`).join("")}</td>
                <td>${this.statusBadge(o.status)}</td>
              </tr>`).join("")}
            </tbody></table></div>`}`;
  },

  // ================= POLLING (real-time availability) =================
  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      // Stop once the operator has navigated away.
      if (currentModule !== "sales" || this.activeTab !== "orders") return this.stopPolling();
      try {
        const avail = await API.getStockAvailability(1);
        this.availability = (avail && avail.items) || [];
        const panel = document.getElementById("availability-panel");
        const fresh = this.availabilityPanel();
        if (panel) {
          panel.outerHTML = fresh || "";
        }
        const stamp = document.getElementById("sales-poll-stamp");
        if (stamp) stamp.textContent = new Date().toLocaleTimeString();
        this.refreshDraftWarnings();
      } catch (e) { /* transient network error: keep the last known figures */ }
    }, this.POLL_MS);
  },

  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  // ================= ORDER FORM =================
  async openNewOrderModal() {
    const isUz = CURRENT_LANG === "uz";
    try {
      this.clients = await API.getCounterparties("client");
    } catch (e) { this.clients = []; }
    const avail = this.availability.length ? this.availability : ((await API.getStockAvailability(1)).items || []);
    this.availability = avail;
    this.draftLines = [{ material_id: avail[0] ? avail[0].material_id : null, quantity: 1, unit_price: 0 }];

    const today = new Date().toISOString().split("T")[0];

    showModal(
      isUz ? "Yangi buyurtma" : "Новый заказ",
      `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Xaridor turi" : "Тип покупателя"}</label>
          <select id="ord-buyer-type" class="form-control" onchange="SalesModule.toggleBuyerType()">
            <option value="client">${isUz ? "Ro'yxatdagi mijoz" : "Клиент из справочника"}</option>
            <option value="walkin">${isUz ? "Bir martalik xaridor" : "Разовый покупатель"}</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Valyuta" : "Валюта"}</label>
          <select id="ord-currency" class="form-control">
            <option value="USD">USD</option><option value="UZS">UZS</option>
          </select>
        </div>
      </div>

      <div id="ord-client-wrap" style="margin-bottom:14px;">
        <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Mijoz" : "Клиент"}</label>
        <select id="ord-client" class="form-control">
          ${this.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
        </select>
      </div>

      <div id="ord-walkin-wrap" style="display:none;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Ism" : "Имя"}</label>
          <input id="ord-walkin-name" class="form-control" placeholder="${isUz ? "Xaridor ismi" : "Имя покупателя"}" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Telefon" : "Телефон"}</label>
          <input id="ord-walkin-phone" class="form-control" placeholder="+998..." />
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Yetkazib berish muddati" : "Срок поставки"}</label>
        <input type="date" id="ord-deadline" class="form-control" min="${today}" />
        <div style="font-size:11px;color:#94a3b8;margin-top:3px;">
          ${isUz ? "Yetishmagan tovar shu muddatgacha ishlab chiqarilishi kerak" : "Недостающий товар должен быть произведен к этому сроку"}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="font-size:13px;">${isUz ? "Tovarlar" : "Товары"}</strong>
        <button type="button" class="btn btn-sm btn-secondary" onclick="SalesModule.addDraftLine()">+ ${isUz ? "Qator" : "Строка"}</button>
      </div>
      <div id="ord-lines"></div>
      <div id="ord-summary" style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:right;font-size:15px;font-weight:800;"></div>
      `,
      async () => await this.submitOrder(),
      "modal-lg"
    );

    this.renderDraftLines();
  },

  toggleBuyerType() {
    const isWalkin = document.getElementById("ord-buyer-type").value === "walkin";
    document.getElementById("ord-client-wrap").style.display = isWalkin ? "none" : "block";
    document.getElementById("ord-walkin-wrap").style.display = isWalkin ? "grid" : "none";
  },

  addDraftLine() {
    const first = this.availability[0];
    this.draftLines.push({ material_id: first ? first.material_id : null, quantity: 1, unit_price: 0 });
    this.renderDraftLines();
  },

  removeDraftLine(i) {
    this.draftLines.splice(i, 1);
    if (!this.draftLines.length) this.addDraftLine();
    else this.renderDraftLines();
  },

  updateDraftLine(i, field, value) {
    this.draftLines[i][field] = field === "material_id" ? parseInt(value, 10) : parseFloat(value || 0);
    this.renderDraftLines();
  },

  renderDraftLines() {
    const wrap = document.getElementById("ord-lines");
    if (!wrap) return;
    const isUz = CURRENT_LANG === "uz";

    wrap.innerHTML = this.draftLines.map((ln, i) => {
      const a = this.availability.find(x => x.material_id === ln.material_id);
      const free = a ? a.free : 0;
      const short = ln.quantity > free;
      return `
        <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr auto;gap:8px;align-items:start;margin-bottom:8px;">
          <div>
            <select class="form-control" onchange="SalesModule.updateDraftLine(${i},'material_id',this.value)">
              ${this.availability.map(m => `<option value="${m.material_id}" ${m.material_id === ln.material_id ? "selected" : ""}>${m.name}</option>`).join("")}
            </select>
            <div style="font-size:11px;margin-top:3px;color:${short ? "#dc2626" : "#059669"};font-weight:600;">
              ${a ? `${isUz ? "erkin" : "свободно"}: ${formatNumber(free)} ${a.unit}${short ? ` — ${isUz ? "yetishmaydi" : "не хватает"} ${formatNumber(ln.quantity - free)}` : ""}` : ""}
            </div>
          </div>
          <input type="number" min="0" step="any" class="form-control" value="${ln.quantity}"
                 onchange="SalesModule.updateDraftLine(${i},'quantity',this.value)" placeholder="${isUz ? "Miqdor" : "Кол-во"}" />
          <input type="number" min="0" step="any" class="form-control" value="${ln.unit_price}"
                 onchange="SalesModule.updateDraftLine(${i},'unit_price',this.value)" placeholder="${isUz ? "Narx" : "Цена"}" />
          <button type="button" class="btn btn-sm" onclick="SalesModule.removeDraftLine(${i})"
                  style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;cursor:pointer;">✕</button>
        </div>`;
    }).join("");

    const total = this.draftLines.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0);
    const anyShort = this.draftLines.some(l => {
      const a = this.availability.find(x => x.material_id === l.material_id);
      return a && l.quantity > a.free;
    });
    const sum = document.getElementById("ord-summary");
    if (sum) {
      sum.innerHTML = `
        ${anyShort ? `<div style="text-align:left;color:#b45309;font-size:12px;font-weight:600;margin-bottom:6px;">
          ${isUz ? "Ba'zi tovarlar omborda yetarli emas — buyurtma qabul qilinadi va ishlab chiqarish rejasiga tushadi."
                 : "Часть товара отсутствует на складе — заказ будет принят и попадет в план производства."}
        </div>` : ""}
        ${isUz ? "Jami" : "Итого"}: ${formatNumber(total, 0, 2)}`;
    }
  },

  refreshDraftWarnings() {
    if (document.getElementById("ord-lines")) this.renderDraftLines();
  },

  async submitOrder() {
    const isUz = CURRENT_LANG === "uz";
    const type = document.getElementById("ord-buyer-type").value;
    const payload = {
      warehouse_id: 1,
      currency: document.getElementById("ord-currency").value,
      deadline: document.getElementById("ord-deadline").value || null,
      items: this.draftLines
        .filter(l => l.material_id && l.quantity > 0)
        .map(l => ({ material_id: l.material_id, quantity: l.quantity, unit_price: l.unit_price || 0 }))
    };
    if (type === "walkin") {
      payload.walkin_name = (document.getElementById("ord-walkin-name").value || "").trim();
      payload.walkin_phone = (document.getElementById("ord-walkin-phone").value || "").trim();
      if (!payload.walkin_name) {
        showToast(isUz ? "Xaridor ismini kiriting" : "Введите имя покупателя", "error");
        return false;
      }
    } else {
      payload.client_id = parseInt(document.getElementById("ord-client").value, 10);
    }
    if (!payload.items.length) {
      showToast(isUz ? "Kamida bitta tovar qo'shing" : "Добавьте хотя бы один товар", "error");
      return false;
    }

    try {
      const o = await API.createOrder(payload);
      showToast(`${o.order_number} ${isUz ? "yaratildi" : "создан"}`, "success");
      await this.switchTab("orders");
      return true;
    } catch (e) {
      showToast(e.message, "error");
      return false;
    }
  },

  async cancelOrder(id) {
    const isUz = CURRENT_LANG === "uz";
    if (!confirm(isUz ? "Buyurtma bekor qilinsinmi? Zahira bo'shatiladi." : "Отменить заказ? Резерв будет снят.")) return;
    try {
      await API.cancelOrder(id);
      showToast(isUz ? "Buyurtma bekor qilindi" : "Заказ отменен", "info");
      await this.switchTab(this.activeTab);
    } catch (e) { showToast(e.message, "error"); }
  },

  // ================= DELIVERY FORM =================
  openDeliverModal(orderId) {
    const isUz = CURRENT_LANG === "uz";
    const o = this.orders.find(x => x.id === orderId);
    if (!o) return;
    const today = new Date().toISOString().split("T")[0];

    showModal(
      `${isUz ? "Jo'natish" : "Отгрузка"} — ${o.order_number}`,
      `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;">
        <div><strong>${isUz ? "Xaridor" : "Покупатель"}:</strong> ${o.buyer_name}</div>
        <div style="margin-top:6px;">${o.items.map(i => `${i.material_name} — <strong>${formatNumber(i.quantity)}</strong> ${i.unit}`).join("<br>")}</div>
        <div style="margin-top:6px;"><strong>${isUz ? "Summa" : "Сумма"}:</strong> ${this.money(o.total_amount, o.currency)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Sana" : "Дата"}</label>
          <input type="date" id="dlv-date" class="form-control" value="${today}" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Mashina raqami" : "Номер машины"} *</label>
          <input id="dlv-car" class="form-control" placeholder="01A123BC" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Haydovchi F.I.Sh." : "ФИО водителя"} *</label>
          <input id="dlv-driver" class="form-control" placeholder="${isUz ? "Ism familiya" : "Имя Фамилия"}" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Haydovchi telefoni" : "Телефон водителя"}</label>
          <input id="dlv-phone" class="form-control" placeholder="+998..." />
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Manzil" : "Адрес доставки"}</label>
          <input id="dlv-dest" class="form-control" placeholder="${isUz ? "Shahar, manzil" : "Город, адрес"}" />
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Izoh" : "Примечание"}</label>
          <textarea id="dlv-notes" class="form-control" rows="2"></textarea>
        </div>
      </div>
      <div style="margin-top:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;font-size:12px;color:#1e40af;">
        ${isUz ? "Tasdiqlangandan so'ng tovar ombordan chiqariladi va hisob-faktura yaratiladi."
               : "После подтверждения товар списывается со склада и создается документ реализации."}
      </div>`,
      async () => {
        const car = (document.getElementById("dlv-car").value || "").trim();
        const driver = (document.getElementById("dlv-driver").value || "").trim();
        if (!car || !driver) {
          showToast(isUz ? "Mashina raqami va haydovchi majburiy" : "Номер машины и водитель обязательны", "error");
          return false;
        }
        try {
          await API.deliverOrder(orderId, {
            delivered_date: document.getElementById("dlv-date").value,
            car_number: car,
            driver_name: driver,
            driver_phone: (document.getElementById("dlv-phone").value || "").trim(),
            destination: (document.getElementById("dlv-dest").value || "").trim(),
            notes: (document.getElementById("dlv-notes").value || "").trim()
          });
          showToast(isUz ? "Jo'natildi" : "Отгружено", "success");
          await this.switchTab("delivery");
          return true;
        } catch (e) { showToast(e.message, "error"); return false; }
      }
    );
  },

  // ================= PAYMENT FORM =================
  openPaymentModal(orderId) {
    const isUz = CURRENT_LANG === "uz";
    const o = this.orders.find(x => x.id === orderId);
    if (!o) return;
    const today = new Date().toISOString().split("T")[0];

    showModal(
      `${isUz ? "To'lov" : "Оплата"} — ${o.order_number}`,
      `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span>${isUz ? "Buyurtma summasi" : "Сумма заказа"}</span><strong>${this.money(o.total_amount, o.currency)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:5px;color:#059669;">
          <span>${isUz ? "To'langan" : "Оплачено"}</span><strong>${this.money(o.paid_amount, o.currency)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:15px;margin-top:7px;padding-top:7px;border-top:1px solid #e2e8f0;color:#dc2626;">
          <span><strong>${isUz ? "Qoldiq" : "Остаток"}</strong></span><strong>${this.money(o.remaining_amount, o.currency)}</strong>
        </div>
      </div>
      ${o.payments.length ? `<div style="margin-bottom:12px;font-size:12px;color:#64748b;">
        ${isUz ? "Oldingi to'lovlar" : "Предыдущие платежи"}:
        ${o.payments.map(p => `<div>${p.paid_date} — <strong>${this.money(p.amount, p.currency)}</strong></div>`).join("")}
      </div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "To'lov summasi" : "Сумма оплаты"} *</label>
          <input type="number" id="pay-amount" class="form-control" step="any" min="0"
                 max="${o.remaining_amount}" value="${o.remaining_amount}" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Sana" : "Дата"}</label>
          <input type="date" id="pay-date" class="form-control" value="${today}" />
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:12px;font-weight:600;color:#334155;">${isUz ? "Izoh" : "Примечание"}</label>
          <input id="pay-note" class="form-control" />
        </div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#64748b;">
        ${isUz ? "Qisman to'lov ham qabul qilinadi. To'liq to'langanda buyurtma yopiladi."
               : "Частичная оплата принимается. Заказ закроется после полной оплаты."}
      </div>`,
      async () => {
        const amount = parseFloat(document.getElementById("pay-amount").value || 0);
        if (!amount || amount <= 0) {
          showToast(isUz ? "To'lov summasini kiriting" : "Введите сумму оплаты", "error");
          return false;
        }
        try {
          const upd = await API.addOrderPayment(orderId, {
            amount,
            paid_date: document.getElementById("pay-date").value,
            note: (document.getElementById("pay-note").value || "").trim()
          });
          showToast(
            upd.status === this.STATUS.PAID
              ? (isUz ? "Buyurtma to'liq to'landi" : "Заказ полностью оплачен")
              : (isUz ? "To'lov qabul qilindi" : "Оплата принята"),
            "success"
          );
          await this.switchTab("payments");
          return true;
        } catch (e) { showToast(e.message, "error"); return false; }
      }
    );
  }
};

window.SalesModule = SalesModule;
