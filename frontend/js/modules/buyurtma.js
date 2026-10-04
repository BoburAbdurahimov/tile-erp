/**
 * Sales: order -> delivery -> payment, on the dimensional warehouse (Ombor).
 *
 * 1. Buyurtmalar  - an order has a client, a deadline, sizes from the Ombor,
 *                   prices and a discount. Nothing leaves the shelf yet; open
 *                   orders claim free stock earliest-deadline-first, and the
 *                   rest is what must be produced, with a live countdown.
 * 2. Yetkazish    - a carousel calendar of deadlines. Delivering records the
 *                   car and driver and takes the goods out of the Ombor.
 * 3. To'lov       - cash or card, posted to the Kassa as a client receipt.
 *
 * The legacy product-based sales documents stay reachable from the header.
 */
const OrdersModule = {
  stage: "orders",          // orders | delivery | payment
  orders: [],
  plan: [],
  products: [],
  config: null,
  calStart: null,           // first day shown in the carousel
  calSelected: null,        // YYYY-MM-DD
  payFilter: "open",        // open | paid | all
  draftLines: [],
  tickTimer: null,
  pollTimer: null,

  // ------------------------------------------------------------ helpers

  isUz() { return CURRENT_LANG === "uz"; },

  money(v) { return formatNumber(v || 0, 0, 0) + " so'm"; },

  dayKey(d) {
    const z = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  },

  // Deadlines are stored as local wall-clock time without an offset, so
  // parsing "YYYY-MM-DDTHH:MM:SS" as local time is exactly right.
  parseLocal(iso) { return iso ? new Date(iso) : null; },

  fmtDeadline(iso) {
    const d = this.parseLocal(iso);
    if (!d) return "-";
    const z = n => String(n).padStart(2, "0");
    return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
  },

  countdown(iso) {
    const isUz = this.isUz();
    const ms = this.parseLocal(iso) - new Date();
    const abs = Math.abs(ms);
    const days = Math.floor(abs / 86400000);
    const h = Math.floor((abs % 86400000) / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const s = Math.floor((abs % 60000) / 1000);
    const z = n => String(n).padStart(2, "0");
    const clock = `${days ? days + (isUz ? " kun " : " дн ") : ""}${z(h)}:${z(m)}:${z(s)}`;
    if (ms < 0) return { text: (isUz ? "Muddati o'tdi: " : "Просрочено: ") + clock, tone: "over" };
    if (ms < 86400000) return { text: clock + (isUz ? " qoldi" : " осталось"), tone: "urgent" };
    if (ms < 3 * 86400000) return { text: clock + (isUz ? " qoldi" : " осталось"), tone: "soon" };
    return { text: clock + (isUz ? " qoldi" : " осталось"), tone: "ok" };
  },

  toneStyle(tone) {
    return {
      over: ["#fef2f2", "#b91c1c", "#fecaca"],
      urgent: ["#fff7ed", "#c2410c", "#fed7aa"],
      soon: ["#fefce8", "#a16207", "#fde68a"],
      ok: ["#f0fdf4", "#15803d", "#bbf7d0"],
    }[tone];
  },

  payBadge(o) {
    const isUz = this.isUz();
    const map = {
      tolanmagan: ["#fef2f2", "#b91c1c", isUz ? "To'lanmagan" : "Не оплачен"],
      qisman: ["#fefce8", "#a16207", isUz ? "Qisman to'langan" : "Частично"],
      tolangan: ["#f0fdf4", "#15803d", isUz ? "To'langan" : "Оплачен"],
      bekor: ["#f1f5f9", "#64748b", isUz ? "Bekor" : "Отменён"],
    };
    const [bg, fg, label] = map[o.payment_state] || map.tolanmagan;
    return `<span style="background:${bg};color:${fg};padding:3px 8px;border-radius:6px;font-size:11.5px;font-weight:700;white-space:nowrap;">${label}</span>`;
  },

  open() { return this.orders.filter(o => o.status === "Yangi"); },
  delivered() { return this.orders.filter(o => o.status === "Yetkazildi"); },

  urgentCount() {
    const soon = Date.now() + 86400000;
    return this.open().filter(o => this.parseLocal(o.deadline).getTime() < soon).length;
  },

  // ------------------------------------------------------------ render

  async render(container) {
    const isUz = this.isUz();
    this.stopTimers();
    if (!this.calStart) {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      t0.setDate(t0.getDate() - 2);
      this.calStart = t0;
      this.calSelected = this.dayKey(new Date());
    }

    container.innerHTML = `
      <div id="orders-root" style="display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${isUz ? "Sotuv" : "Продажи"}</h2>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
                ${isUz ? "Buyurtma → Yetkazib berish → To'lov. Mahsulotlar Ombordan olinadi."
                       : "Заказ → Доставка → Оплата. Товары берутся со Склада."}
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${this.isAdmin() ? `
              <button class="btn btn-secondary btn-sm" onclick="OrdersModule.loadDemo()"
                style="padding:8px 12px;border-radius:8px;font-weight:600;font-size:12.5px;">🧪 ${isUz ? "Demo yuklash" : "Загрузить демо"}</button>` : ""}
              <button class="btn btn-secondary btn-sm" onclick="OrdersModule.openLegacy()"
                style="padding:8px 12px;border-radius:8px;font-weight:600;font-size:12.5px;">
                ${isUz ? "Eski sotuv hujjatlari" : "Старые документы продаж"}
              </button>
              <button class="btn btn-primary btn-sm" onclick="OrdersModule.openNewOrder()"
                style="padding:9px 16px;border-radius:8px;font-weight:700;">
                + ${isUz ? "Yangi buyurtma" : "Новый заказ"}
              </button>
            </div>
          </div>
          <div id="orders-alert" style="margin-top:14px;"></div>
          <div id="orders-stages" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:14px;"></div>
        </div>
        <div id="orders-content">
          <div style="text-align:center;padding:40px;color:#94a3b8;">${isUz ? "Yuklanmoqda..." : "Загрузка..."}</div>
        </div>
      </div>
    `;

    await this.reload();
    this.startTimers();
  },

  async reload() {
    try {
      const [ord, plan, prod] = await Promise.all([
        API.getOrders(), API.getProductionPlan(), API.getOmborProducts()
      ]);
      this.orders = ord.orders || [];
      this.plan = plan.plan || [];
      this.products = prod.products || [];
      if (!this.config) this.config = await API.getSkladConfig();
    } catch (e) {
      showToast(e.message, "error");
    }
    this.renderStages();
    this.renderAlert();
    this.renderStage();
    if (typeof refreshOrderBadge === "function") refreshOrderBadge(this.orders);
  },

  renderStages() {
    const isUz = this.isUz();
    const el = document.getElementById("orders-stages");
    if (!el) return;
    const today = this.dayKey(new Date());
    const dueToday = this.open().filter(o => o.deadline.slice(0, 10) <= today).length;
    const unpaid = this.orders.filter(o => o.status !== "Bekor" && o.balance > 0 && o.status === "Yetkazildi").length;
    const stages = [
      ["orders", "1", isUz ? "Buyurtmalar" : "Заказы", `${this.open().length} ${isUz ? "ta ochiq" : "открыто"}`],
      ["delivery", "2", isUz ? "Yetkazib berish" : "Доставка", `${dueToday} ${isUz ? "ta bugun / kechikkan" : "сегодня / просрочено"}`],
      ["payment", "3", isUz ? "To'lov" : "Оплата", `${unpaid} ${isUz ? "ta to'lov kutilmoqda" : "ожидают оплаты"}`],
    ];
    el.innerHTML = stages.map(([key, num, title, sub]) => {
      const active = this.stage === key;
      return `
        <button onclick="OrdersModule.setStage('${key}')"
          style="display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px;border-radius:10px;cursor:pointer;
                 border:2px solid ${active ? "#2563eb" : "#e2e8f0"};background:${active ? "#eff6ff" : "#fff"};">
          <span style="flex:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                       font-weight:800;background:${active ? "#2563eb" : "#e2e8f0"};color:${active ? "#fff" : "#475569"};">${num}</span>
          <span style="min-width:0;">
            <span style="display:block;font-weight:700;color:#0f172a;font-size:14.5px;">${title}</span>
            <span style="display:block;color:#64748b;font-size:12px;">${sub}</span>
          </span>
        </button>`;
    }).join("");
  },

  renderAlert() {
    const isUz = this.isUz();
    const el = document.getElementById("orders-alert");
    if (!el) return;
    const now = Date.now();
    const urgent = this.open().filter(o =>
      o.shortfall_pieces > 0 && this.parseLocal(o.deadline).getTime() - now < 3 * 86400000);
    if (!urgent.length) { el.innerHTML = ""; return; }
    const pieces = urgent.reduce((s, o) => s + o.shortfall_pieces, 0);
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13.5px;">
        <span style="font-size:18px;line-height:1;">⏰</span>
        <span>
          <b>${isUz ? "Eslatma:" : "Напоминание:"}</b>
          ${isUz
            ? `${urgent.length} ta buyurtmaning muddati 3 kun ichida, lekin omborda yetarli emas. Jami <b>${formatNumber(pieces, 0, 0)} ta</b> ishlab chiqarish kerak.`
            : `У ${urgent.length} заказов срок в течение 3 дней, но на складе не хватает. Нужно произвести <b>${formatNumber(pieces, 0, 0)} шт</b>.`}
          <a href="javascript:void(0)" onclick="OrdersModule.setStage('orders')" style="color:#c2410c;font-weight:700;margin-left:4px;">
            ${isUz ? "Rejani ko'rish" : "Смотреть план"}</a>
        </span>
      </div>`;
  },

  setStage(stage) {
    this.stage = stage;
    this.renderStages();
    this.renderStage();
  },

  renderStage() {
    const el = document.getElementById("orders-content");
    if (!el) return;
    if (this.stage === "delivery") el.innerHTML = this.deliveryHtml();
    else if (this.stage === "payment") el.innerHTML = this.paymentHtml();
    else el.innerHTML = this.ordersHtml();
    this.tick();
    this.centerSelectedDay();
  },

  // On a phone only a few days fit; keep the selected one in view.
  centerSelectedDay() {
    const strip = document.getElementById("ord-cal-strip");
    const chip = strip && strip.querySelector(`[data-day="${this.calSelected}"]`);
    if (!chip) return;
    strip.scrollLeft = chip.offsetLeft - strip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2;
  },

  // ------------------------------------------------------------ stage 1

  itemChips(o) {
    const isUz = this.isUz();
    return o.items.map(it => {
      const short = it.shortfall > 0;
      return `
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font-size:12.5px;
                     background:${short ? "#fef2f2" : "#f8fafc"};border:1px solid ${short ? "#fecaca" : "#e2e8f0"};">
          <b style="color:#0f172a;">${it.code}</b>
          <span style="color:#475569;">× ${it.quantity}</span>
          ${o.status === "Yangi"
            ? (short
                ? `<span style="color:#b91c1c;font-weight:700;">−${it.shortfall} ${isUz ? "ishlab chiqarish" : "произвести"}</span>`
                : `<span style="color:#15803d;font-weight:700;">✓ ${isUz ? "omborda" : "на складе"}</span>`)
            : ""}
        </span>`;
    }).join("");
  },

  orderCard(o) {
    const isUz = this.isUz();
    const discount = o.discount_amount > 0
      ? `<div style="font-size:12px;color:#64748b;"><s>${this.money(o.subtotal)}</s> −${o.discount_percent ? o.discount_percent + "%" : this.money(o.discount_amount)}</div>`
      : "";
    return `
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:800;color:#0f172a;font-size:15px;">${escapeHtml(o.client_name)}</div>
            <div style="color:#475569;font-size:13px;">
              <a href="tel:${escapeHtml(o.client_phone)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(o.client_phone)}</a>
              · ${o.order_number} · ${escapeHtml(o.sklad_label)} · ${o.sell_type === "mkv" ? "m²" : (isUz ? "metr" : "метр")}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800;color:#0f172a;font-size:15px;">${this.money(o.total_amount)}</div>
            ${discount}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${this.itemChips(o)}</div>
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span data-deadline="${o.deadline}" class="order-countdown"
              style="padding:5px 10px;border-radius:8px;font-weight:700;font-size:12.5px;font-variant-numeric:tabular-nums;"></span>
            <span style="color:#64748b;font-size:12px;">${isUz ? "Muddat" : "Срок"}: ${this.fmtDeadline(o.deadline)}</span>
            ${o.paid_amount > 0 ? this.payBadge(o) : ""}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="OrdersModule.openDeliver(${o.id})"
              style="background:#2563eb;color:#fff;border:none;padding:7px 12px;border-radius:8px;font-weight:600;cursor:pointer;">
              🚚 ${isUz ? "Yetkazish" : "Доставить"}</button>
            <button class="btn btn-sm btn-secondary" onclick="OrdersModule.openPay(${o.id})"
              style="padding:7px 12px;border-radius:8px;font-weight:600;">${isUz ? "Avans" : "Аванс"}</button>
            <button class="btn btn-sm btn-secondary" onclick="OrdersModule.cancel(${o.id})"
              style="padding:7px 12px;border-radius:8px;font-weight:600;color:#b91c1c;">${isUz ? "Bekor" : "Отмена"}</button>
          </div>
        </div>
      </div>`;
  },

  planHtml() {
    const isUz = this.isUz();
    if (!this.plan.length) {
      return `<div style="padding:14px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:13.5px;">
        ✓ ${isUz ? "Barcha ochiq buyurtmalar ombordagi mahsulot bilan yopiladi." : "Все открытые заказы покрываются складом."}</div>`;
    }
    return `
      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr>
            <th style="padding:10px;text-align:left;">${isUz ? "O'lcham" : "Размер"}</th>
            <th style="padding:10px;text-align:left;">${isUz ? "Ombor" : "Склад"}</th>
            <th style="padding:10px;text-align:right;">${isUz ? "Ishlab chiqarish kerak" : "Произвести"}</th>
            <th style="padding:10px;text-align:left;">${isUz ? "Eng yaqin muddat" : "Ближайший срок"}</th>
            <th style="padding:10px;text-align:left;">${isUz ? "Buyurtmalar" : "Заказы"}</th>
          </tr></thead>
          <tbody>
            ${this.plan.map(p => `
              <tr>
                <td style="padding:10px;"><b>${p.code}</b> <span style="color:#64748b;">(${p.length}×${p.width})</span></td>
                <td style="padding:10px;">${escapeHtml(p.sklad_label)}</td>
                <td style="padding:10px;text-align:right;font-weight:800;color:#b91c1c;">${formatNumber(p.quantity, 0, 0)} ${isUz ? "ta" : "шт"}</td>
                <td style="padding:10px;"><span data-deadline="${p.deadline}" class="order-countdown"
                  style="padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;"></span></td>
                <td style="padding:10px;color:#475569;font-size:12px;">${p.orders.join(", ")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  ordersHtml() {
    const isUz = this.isUz();
    const open = this.open();
    return `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;">
          <h3 style="margin:0 0 4px;font-size:16px;color:#0f172a;">🏭 ${isUz ? "Ishlab chiqarish rejasi" : "План производства"}</h3>
          <p style="margin:0 0 12px;color:#64748b;font-size:12.5px;">
            ${isUz ? "Ombordagi mahsulot buyurtmalarga muddat tartibida taqsimlanadi; yetmagani shu yerda."
                   : "Склад распределяется по заказам в порядке сроков; недостающее — здесь."}
          </p>
          ${this.planHtml()}
        </div>
        <div>
          <h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">${isUz ? "Ochiq buyurtmalar" : "Открытые заказы"} (${open.length})</h3>
          ${open.length
            ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:12px;">${open.map(o => this.orderCard(o)).join("")}</div>`
            : `<div style="padding:30px;text-align:center;color:#94a3b8;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;">
                 ${isUz ? "Ochiq buyurtma yo'q. «+ Yangi buyurtma» tugmasini bosing." : "Нет открытых заказов. Нажмите «+ Новый заказ»."}</div>`}
        </div>
      </div>`;
  },

  // ------------------------------------------------------------ stage 2

  calendarHtml() {
    const isUz = this.isUz();
    const todayKey = this.dayKey(new Date());
    const wd = isUz ? ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"] : ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.calStart); d.setDate(d.getDate() + i); days.push(d);
    }
    const overdue = this.open().filter(o => o.deadline.slice(0, 10) < todayKey).length;

    const chip = (d) => {
      const key = this.dayKey(d);
      const due = this.open().filter(o => o.deadline.slice(0, 10) === key).length;
      const done = this.delivered().filter(o => (o.delivered_at || "").slice(0, 10) === key).length;
      const sel = key === this.calSelected;
      const isToday = key === todayKey;
      const past = key < todayKey;
      return `
        <button onclick="OrdersModule.pickDay('${key}')" data-day="${key}"
          style="flex:1 0 76px;min-width:76px;scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:12px;cursor:pointer;
                 border:2px solid ${sel ? "#2563eb" : isToday ? "#93c5fd" : "#e2e8f0"};background:${sel ? "#2563eb" : "#fff"};color:${sel ? "#fff" : "#0f172a"};">
          <span style="font-size:11.5px;font-weight:600;opacity:.8;">${isToday ? (isUz ? "Bugun" : "Сегодня") : wd[d.getDay()]}</span>
          <span style="font-size:20px;font-weight:800;line-height:1.1;">${d.getDate()}</span>
          <span style="font-size:11px;opacity:.8;">${String(d.getMonth() + 1).padStart(2, "0")}</span>
          <span style="margin-top:4px;min-height:18px;display:flex;gap:3px;">
            ${due ? `<span style="background:${sel ? "#fff" : (past ? "#dc2626" : "#f59e0b")};color:${sel ? "#1d4ed8" : "#fff"};border-radius:9px;padding:0 6px;font-size:11px;font-weight:800;">${due}</span>` : ""}
            ${done ? `<span style="background:${sel ? "#dbeafe" : "#dcfce7"};color:#166534;border-radius:9px;padding:0 6px;font-size:11px;font-weight:800;">✓${done}</span>` : ""}
          </span>
        </button>`;
    };

    return `
      <div style="display:flex;align-items:stretch;gap:8px;">
        <button onclick="OrdersModule.shiftCal(-7)" aria-label="prev"
          style="flex:none;width:36px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:18px;color:#475569;">‹</button>
        <div id="ord-cal-strip" style="flex:1;display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:2px;">
          ${days.map(chip).join("")}
        </div>
        <button onclick="OrdersModule.shiftCal(7)" aria-label="next"
          style="flex:none;width:36px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:18px;color:#475569;">›</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn btn-secondary btn-sm" onclick="OrdersModule.goToday()" style="padding:6px 12px;border-radius:8px;font-weight:600;">
          ${isUz ? "Bugun" : "Сегодня"}</button>
        ${overdue ? `<button class="btn btn-sm" onclick="OrdersModule.pickDay('overdue')"
            style="padding:6px 12px;border-radius:8px;font-weight:700;border:1px solid #fecaca;background:${this.calSelected === "overdue" ? "#dc2626" : "#fef2f2"};color:${this.calSelected === "overdue" ? "#fff" : "#b91c1c"};cursor:pointer;">
            ⚠ ${isUz ? "Muddati o'tgan" : "Просроченные"}: ${overdue}</button>` : ""}
      </div>`;
  },

  deliveryHtml() {
    const isUz = this.isUz();
    const todayKey = this.dayKey(new Date());
    const sel = this.calSelected;
    const due = sel === "overdue"
      ? this.open().filter(o => o.deadline.slice(0, 10) < todayKey)
      : this.open().filter(o => o.deadline.slice(0, 10) === sel);
    const done = sel === "overdue" ? [] : this.delivered().filter(o => (o.delivered_at || "").slice(0, 10) === sel);
    const title = sel === "overdue" ? (isUz ? "Muddati o'tgan buyurtmalar" : "Просроченные заказы")
      : `${sel.split("-").reverse().join(".")}${sel === todayKey ? (isUz ? " (bugun)" : " (сегодня)") : ""}`;

    const dueRow = (o) => `
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;color:#0f172a;">${escapeHtml(o.client_name)}
              <span style="color:#64748b;font-weight:500;font-size:12.5px;">· ${o.order_number}</span></div>
            <div style="font-size:13px;color:#475569;">
              <a href="tel:${escapeHtml(o.client_phone)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(o.client_phone)}</a>
              ${o.client_address ? " · " + escapeHtml(o.client_address) : ""}</div>
          </div>
          <span data-deadline="${o.deadline}" class="order-countdown"
            style="align-self:flex-start;padding:5px 10px;border-radius:8px;font-weight:700;font-size:12.5px;font-variant-numeric:tabular-nums;"></span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${this.itemChips(o)}</div>
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
          <span style="font-weight:700;color:#0f172a;">${this.money(o.total_amount)} · ${escapeHtml(o.sklad_label)}</span>
          <button class="btn btn-sm" onclick="OrdersModule.openDeliver(${o.id})" ${o.shortfall_pieces > 0 ? "disabled title='" + (isUz ? "Omborda yetarli emas" : "Не хватает на складе") + "'" : ""}
            style="background:${o.shortfall_pieces > 0 ? "#94a3b8" : "#059669"};color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:${o.shortfall_pieces > 0 ? "not-allowed" : "pointer"};">
            ${o.shortfall_pieces > 0 ? (isUz ? `${o.shortfall_pieces} ta yetmaydi` : `Не хватает ${o.shortfall_pieces}`) : "🚚 " + (isUz ? "Yetkazildi deb belgilash" : "Отметить доставку")}
          </button>
        </div>
      </div>`;

    const doneRow = (o) => `
      <div style="border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;background:#f0fdf4;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;color:#0f172a;">✓ ${escapeHtml(o.client_name)} <span style="color:#64748b;font-weight:500;font-size:12.5px;">· ${o.order_number}</span></div>
          <div style="font-size:12.5px;color:#475569;">🚚 <b>${escapeHtml(o.car_number || "-")}</b>
            · ${escapeHtml(o.driver_name || "")} <a href="tel:${escapeHtml(o.driver_phone || "")}" style="color:#2563eb;text-decoration:none;">${escapeHtml(o.driver_phone || "")}</a></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">${this.payBadge(o)}</div>
      </div>`;

    return `
      <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;display:flex;flex-direction:column;gap:16px;">
        ${this.calendarHtml()}
        <div>
          <h3 style="margin:0 0 10px;font-size:15.5px;color:#0f172a;">${title} — ${isUz ? "yetkazilishi kerak" : "к доставке"} (${due.length})</h3>
          ${due.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr));gap:10px;">${due.map(dueRow).join("")}</div>`
                       : `<div style="padding:18px;text-align:center;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:10px;">${isUz ? "Bu kunga buyurtma yo'q" : "На этот день заказов нет"}</div>`}
        </div>
        ${done.length ? `
          <div>
            <h3 style="margin:0 0 10px;font-size:15.5px;color:#0f172a;">${isUz ? "Yetkazilgan" : "Доставлено"} (${done.length})</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr));gap:10px;">${done.map(doneRow).join("")}</div>
          </div>` : ""}
      </div>`;
  },

  pickDay(key) { this.calSelected = key; this.renderStage(); },

  shiftCal(days) {
    const d = new Date(this.calStart); d.setDate(d.getDate() + days);
    this.calStart = d;
    this.renderStage();
  },

  goToday() {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0); t0.setDate(t0.getDate() - 2);
    this.calStart = t0;
    this.calSelected = this.dayKey(new Date());
    this.renderStage();
  },

  // ------------------------------------------------------------ stage 3

  paymentHtml() {
    const isUz = this.isUz();
    const live = this.orders.filter(o => o.status !== "Bekor");
    const debt = live.filter(o => o.status === "Yetkazildi").reduce((s, o) => s + o.balance, 0);
    const todayKey = this.dayKey(new Date());
    const today = live.flatMap(o => o.payments.filter(p => p.paid_date === todayKey));
    const todayCash = today.filter(p => p.method === "naqd").reduce((s, p) => s + p.amount, 0);
    const todayCard = today.filter(p => p.method === "karta").reduce((s, p) => s + p.amount, 0);

    let rows = live.filter(o => o.status === "Yetkazildi" || o.paid_amount > 0);
    if (this.payFilter === "open") rows = rows.filter(o => o.balance > 0);
    if (this.payFilter === "paid") rows = rows.filter(o => o.balance <= 0);

    const tile = (label, value, color) => `
      <div style="flex:1 1 180px;padding:14px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;">
        <div style="font-size:12px;color:#64748b;font-weight:600;">${label}</div>
        <div style="font-size:19px;font-weight:800;color:${color};margin-top:2px;">${this.money(value)}</div>
      </div>`;

    const filterBtn = (key, label) => `
      <button onclick="OrdersModule.payFilter='${key}';OrdersModule.renderStage()"
        style="padding:6px 12px;border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer;
               border:1px solid ${this.payFilter === key ? "#2563eb" : "#e2e8f0"};background:${this.payFilter === key ? "#eff6ff" : "#fff"};color:${this.payFilter === key ? "#1d4ed8" : "#475569"};">${label}</button>`;

    return `
      <div class="card" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${tile(isUz ? "Yetkazilgan, to'lanmagan qarz" : "Долг по доставленным", debt, "#b91c1c")}
          ${tile(isUz ? "Bugun naqd (Kassa UZS)" : "Сегодня наличные", todayCash, "#15803d")}
          ${tile(isUz ? "Bugun karta (Karta UZS)" : "Сегодня карта", todayCard, "#1d4ed8")}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${filterBtn("open", isUz ? "To'lov kutilmoqda" : "Ожидают оплаты")}
          ${filterBtn("paid", isUz ? "To'langan" : "Оплаченные")}
          ${filterBtn("all", isUz ? "Hammasi" : "Все")}
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;min-width:720px;">
            <thead><tr>
              <th style="padding:10px;text-align:left;">${isUz ? "Buyurtma" : "Заказ"}</th>
              <th style="padding:10px;text-align:left;">${isUz ? "Mijoz" : "Клиент"}</th>
              <th style="padding:10px;text-align:left;">${isUz ? "Holat" : "Статус"}</th>
              <th style="padding:10px;text-align:right;">${isUz ? "Summa" : "Сумма"}</th>
              <th style="padding:10px;text-align:right;">${isUz ? "To'langan" : "Оплачено"}</th>
              <th style="padding:10px;text-align:right;">${isUz ? "Qoldiq" : "Остаток"}</th>
              <th style="padding:10px;"></th>
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map(o => `
                <tr>
                  <td style="padding:10px;"><b>${o.order_number}</b><div style="font-size:11.5px;color:#64748b;">${o.status === "Yetkazildi" ? "🚚 " + (o.delivered_at || "").slice(0, 10) : (isUz ? "Yetkazilmagan" : "Не доставлен")}</div></td>
                  <td style="padding:10px;">${escapeHtml(o.client_name)}<div style="font-size:11.5px;"><a href="tel:${escapeHtml(o.client_phone)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(o.client_phone)}</a></div></td>
                  <td style="padding:10px;">${this.payBadge(o)}
                    ${o.payments.length ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${o.payments.map(p => `${p.method === "karta" ? "💳" : "💵"} ${formatNumber(p.amount, 0, 0)}`).join(" · ")}</div>` : ""}</td>
                  <td style="padding:10px;text-align:right;">${formatNumber(o.total_amount, 0, 0)}</td>
                  <td style="padding:10px;text-align:right;color:#15803d;">${formatNumber(o.paid_amount, 0, 0)}</td>
                  <td style="padding:10px;text-align:right;font-weight:800;color:${o.balance > 0 ? "#b91c1c" : "#15803d"};">${formatNumber(o.balance, 0, 0)}</td>
                  <td style="padding:10px;text-align:right;">
                    ${o.balance > 0 ? `<button class="btn btn-sm btn-primary" onclick="OrdersModule.openPay(${o.id})" style="padding:6px 12px;border-radius:8px;font-weight:700;white-space:nowrap;">${isUz ? "To'lov qabul qilish" : "Принять оплату"}</button>` : "✓"}
                  </td>
                </tr>`).join("")
              : `<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">${isUz ? "Ma'lumot yo'q" : "Нет данных"}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ------------------------------------------------------------ new order

  async openNewOrder() {
    const isUz = this.isUz();
    if (!this.config) {
      try { this.config = await API.getSkladConfig(); } catch (e) { return showToast(e.message, "error"); }
    }
    try { this.products = (await API.getOmborProducts()).products || []; } catch (_) {}

    const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(18, 0, 0, 0);
    const z = n => String(n).padStart(2, "0");
    const defDeadline = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T18:00`;
    this.draftLines = [{ code: "", quantity: "", unit_price: "" }];

    const field = "width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;";
    const label = "display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;";

    const body = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <div><label style="${label}">${isUz ? "Mijoz ismi" : "Имя клиента"} *</label>
            <input id="ord-client" style="${field}" placeholder="${isUz ? "Masalan: Akmal aka" : "Напр.: Акмал"}"></div>
          <div><label style="${label}">${isUz ? "Telefon raqami" : "Телефон"} *</label>
            <input id="ord-phone" type="tel" style="${field}" placeholder="+998 90 123 45 67"></div>
          <div><label style="${label}">${isUz ? "Manzil" : "Адрес"}</label>
            <input id="ord-address" style="${field}" placeholder="${isUz ? "ixtiyoriy" : "необязательно"}"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <div><label style="${label}">${isUz ? "Ombor" : "Склад"} *</label>
            <select id="ord-sklad" style="${field}" onchange="OrdersModule.refreshDraft()">
              ${this.config.warehouses.map(w => `<option value="${w.id}" ${w.id === 3 ? "selected" : ""}>${w.name} — eni ${w.eni}</option>`).join("")}
            </select></div>
          <div><label style="${label}">${isUz ? "Narx turi" : "Тип цены"} *</label>
            <select id="ord-selltype" style="${field}" onchange="OrdersModule.refreshDraft()">
              <option value="metr">${isUz ? "Metr bo'yicha" : "За метр"}</option>
              <option value="mkv">${isUz ? "Metr kvadrat (m²)" : "За м²"}</option>
            </select></div>
          <div><label style="${label}">${isUz ? "Muddat (deadline)" : "Срок (дедлайн)"} *</label>
            <input id="ord-deadline" type="datetime-local" value="${defDeadline}" style="${field}"></div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="${label}margin:0;">${isUz ? "Mahsulotlar (Ombordan)" : "Товары (со склада)"} *</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="OrdersModule.addLine()" style="padding:5px 10px;border-radius:7px;font-weight:600;">+ ${isUz ? "Qator" : "Строка"}</button>
          </div>
          <datalist id="ord-products"></datalist>
          <div id="ord-lines" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-items:end;">
          <div><label style="${label}">${isUz ? "Chegirma" : "Скидка"}</label>
            <div style="display:flex;gap:6px;">
              <input id="ord-discount" type="number" min="0" step="any" value="0" style="${field}" oninput="OrdersModule.updateTotals()">
              <select id="ord-discount-type" style="${field}width:90px;flex:none;" onchange="OrdersModule.updateTotals()">
                <option value="pct">%</option><option value="sum">so'm</option>
              </select>
            </div></div>
          <div><label style="${label}">${isUz ? "Izoh" : "Примечание"}</label>
            <input id="ord-note" style="${field}"></div>
        </div>

        <div id="ord-totals" style="padding:12px 14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;"></div>
      </div>`;

    showModal(isUz ? "Yangi buyurtma" : "Новый заказ", body, () => this.saveOrder(), "modal-lg");
    this.refreshDraft();
  },

  draftSklad() { return parseInt(document.getElementById("ord-sklad")?.value || "3", 10); },
  draftSellType() { return document.getElementById("ord-selltype")?.value || "metr"; },
  draftEni() { return (this.config.warehouses.find(w => w.id === this.draftSklad()) || { eni: 120 }).eni; },

  decode(code) {
    const c = parseInt(code, 10);
    if (!c) return null;
    const length = Math.floor(c / 100) * 100, width = c % 100;
    if (!this.config.lengths.includes(length) || !this.config.widths.includes(width)) return null;
    return { length, width };
  },

  pieceUnits(size) {
    const linear = (size.length + size.width) / 100;
    return this.draftSellType() === "mkv" ? linear * this.draftEni() / 100 : linear;
  },

  refreshDraft() {
    const sid = this.draftSklad();
    const dl = document.getElementById("ord-products");
    if (dl) {
      dl.innerHTML = this.products.filter(p => p.sklad_id === sid)
        .map(p => `<option value="${p.code}">${p.length}×${p.width} — ${this.isUz() ? "bo'sh" : "свободно"}: ${p.free}</option>`).join("");
    }
    this.renderLines();
  },

  renderLines() {
    const isUz = this.isUz();
    const el = document.getElementById("ord-lines");
    if (!el) return;
    const f = "width:100%;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;";
    const unit = this.draftSellType() === "mkv" ? "m²" : (isUz ? "metr" : "метр");
    el.innerHTML = this.draftLines.map((ln, i) => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;align-items:end;">
        <div><span style="font-size:11px;color:#64748b;font-weight:600;">${isUz ? "O'lcham kodi" : "Код размера"}</span>
          <input list="ord-products" inputmode="numeric" value="${ln.code}" placeholder="680" style="${f}"
            oninput="OrdersModule.draftLines[${i}].code=this.value;OrdersModule.updateLineInfo(${i})"></div>
        <div><span style="font-size:11px;color:#64748b;font-weight:600;">${isUz ? "Miqdor (dona)" : "Кол-во (шт)"}</span>
          <input type="number" min="1" step="1" value="${ln.quantity}" style="${f}"
            oninput="OrdersModule.draftLines[${i}].quantity=this.value;OrdersModule.updateLineInfo(${i})"></div>
        <div><span style="font-size:11px;color:#64748b;font-weight:600;">${isUz ? "Narx" : "Цена"} / ${unit}</span>
          <input type="number" min="0" step="any" value="${ln.unit_price}" style="${f}"
            oninput="OrdersModule.draftLines[${i}].unit_price=this.value;OrdersModule.updateLineInfo(${i})"></div>
        <div style="display:flex;gap:6px;align-items:center;justify-content:space-between;">
          <div id="ord-line-info-${i}" style="font-size:12px;line-height:1.35;"></div>
          ${this.draftLines.length > 1 ? `<button type="button" onclick="OrdersModule.removeLine(${i})"
             style="flex:none;border:none;background:#fef2f2;color:#b91c1c;border-radius:7px;width:30px;height:30px;cursor:pointer;font-weight:700;">×</button>` : ""}
        </div>
      </div>`).join("");
    this.draftLines.forEach((_, i) => this.updateLineInfo(i, true));
    this.updateTotals();
  },

  updateLineInfo(i, skipTotals) {
    const isUz = this.isUz();
    const el = document.getElementById(`ord-line-info-${i}`);
    if (!el) return;
    const ln = this.draftLines[i];
    const size = this.decode(ln.code);
    if (!ln.code) { el.innerHTML = ""; }
    else if (!size) { el.innerHTML = `<span style="color:#b91c1c;font-weight:700;">${isUz ? "Noto'g'ri o'lcham" : "Неверный размер"}</span>`; }
    else {
      const qty = parseInt(ln.quantity, 10) || 0;
      const p = this.products.find(x => x.sklad_id === this.draftSklad() && x.code === parseInt(ln.code, 10));
      const free = p ? p.free : 0;
      const short = Math.max(qty - free, 0);
      const units = qty * this.pieceUnits(size);
      const total = units * (parseFloat(ln.unit_price) || 0);
      el.innerHTML = `
        <div style="color:#0f172a;font-weight:700;">${formatNumber(total, 0, 0)} so'm</div>
        <div style="color:#64748b;">${formatNumber(units, 0, 2)} ${this.draftSellType() === "mkv" ? "m²" : "m"}</div>
        <div style="color:${short ? "#b91c1c" : "#15803d"};font-weight:700;">
          ${short ? `${isUz ? "Bo'sh" : "Своб."}: ${free} · ${short} ${isUz ? "ta ishlab chiqarish" : "произвести"}`
                  : `✓ ${isUz ? "Bo'sh" : "Своб."}: ${free}`}</div>`;
    }
    if (!skipTotals) this.updateTotals();
  },

  addLine() { this.draftLines.push({ code: "", quantity: "", unit_price: "" }); this.renderLines(); },
  removeLine(i) { this.draftLines.splice(i, 1); this.renderLines(); },

  draftDiscount(subtotal) {
    const v = parseFloat(document.getElementById("ord-discount")?.value) || 0;
    const type = document.getElementById("ord-discount-type")?.value || "pct";
    return type === "pct" ? { pct: v, amount: subtotal * v / 100 } : { pct: 0, amount: v };
  },

  updateTotals() {
    const isUz = this.isUz();
    const el = document.getElementById("ord-totals");
    if (!el) return;
    let subtotal = 0, pieces = 0, short = 0;
    this.draftLines.forEach(ln => {
      const size = this.decode(ln.code);
      const qty = parseInt(ln.quantity, 10) || 0;
      if (!size || !qty) return;
      pieces += qty;
      subtotal += qty * this.pieceUnits(size) * (parseFloat(ln.unit_price) || 0);
      const p = this.products.find(x => x.sklad_id === this.draftSklad() && x.code === parseInt(ln.code, 10));
      short += Math.max(qty - (p ? p.free : 0), 0);
    });
    const disc = this.draftDiscount(subtotal);
    const total = Math.max(subtotal - disc.amount, 0);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:#475569;">
        <span>${isUz ? "Jami" : "Всего"}: ${pieces} ${isUz ? "dona" : "шт"}</span>
        <span>${isUz ? "Summa" : "Сумма"}: ${formatNumber(subtotal, 0, 0)} so'm</span>
        <span>${isUz ? "Chegirma" : "Скидка"}: −${formatNumber(disc.amount, 0, 0)} so'm</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;">
        <span style="font-size:12.5px;font-weight:700;color:${short ? "#b91c1c" : "#15803d"};">
          ${short ? `⏰ ${isUz ? `Muddatgacha ${short} ta ishlab chiqarish kerak` : `К сроку нужно произвести ${short} шт`}`
                  : `✓ ${isUz ? "Omborda yetarli" : "На складе достаточно"}`}</span>
        <span style="font-size:18px;font-weight:800;color:#0f172a;">${formatNumber(total, 0, 0)} so'm</span>
      </div>`;
  },

  async saveOrder() {
    const isUz = this.isUz();
    const val = id => (document.getElementById(id)?.value || "").trim();
    const items = this.draftLines
      .filter(ln => ln.code !== "" || ln.quantity !== "")
      .map(ln => ({ code: parseInt(ln.code, 10), quantity: parseInt(ln.quantity, 10) || 0, unit_price: parseFloat(ln.unit_price) || 0 }));
    if (!val("ord-client")) { showToast(isUz ? "Mijoz ismini kiriting" : "Введите имя клиента", "error"); return false; }
    if (!val("ord-phone")) { showToast(isUz ? "Telefon raqamini kiriting" : "Введите телефон", "error"); return false; }
    if (!val("ord-deadline")) { showToast(isUz ? "Muddatni kiriting" : "Укажите срок", "error"); return false; }
    if (!items.length) { showToast(isUz ? "Kamida bitta mahsulot kiriting" : "Добавьте товар", "error"); return false; }
    if (items.some(it => !this.decode(it.code) || it.quantity <= 0)) {
      showToast(isUz ? "O'lcham kodi va miqdorni tekshiring" : "Проверьте код размера и количество", "error"); return false;
    }
    const discVal = parseFloat(val("ord-discount")) || 0;
    const pctMode = val("ord-discount-type") === "pct";
    const order = await API.createOrder({
      client_name: val("ord-client"),
      client_phone: val("ord-phone"),
      client_address: val("ord-address") || null,
      sklad_id: this.draftSklad(),
      sell_type: this.draftSellType(),
      deadline: val("ord-deadline"),
      items,
      discount_percent: pctMode ? discVal : 0,
      discount_amount: pctMode ? 0 : discVal,
      note: val("ord-note") || null,
    });
    showToast(`${isUz ? "Buyurtma qabul qilindi" : "Заказ принят"}: ${order.order_number}`, "success");
    this.stage = "orders";
    await this.reload();
    return true;
  },

  // ------------------------------------------------------------ delivery / payment / cancel

  find(id) { return this.orders.find(o => o.id === id); },

  openDeliver(id) {
    const isUz = this.isUz();
    const o = this.find(id);
    if (!o) return;
    const f = "width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;";
    const l = "display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;";
    const warn = o.shortfall_pieces > 0
      ? `<div style="padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13px;font-weight:600;">
           ${isUz ? `Omborda ${o.shortfall_pieces} ta yetmaydi — avval ishlab chiqaring.` : `Не хватает ${o.shortfall_pieces} шт — сначала произведите.`}</div>` : "";
    showModal(`🚚 ${isUz ? "Yetkazib berish" : "Доставка"} — ${o.order_number}`, `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;">
          <b>${escapeHtml(o.client_name)}</b> · ${escapeHtml(o.client_phone)}${o.client_address ? " · " + escapeHtml(o.client_address) : ""}<br>
          ${o.items.map(it => `${it.code} × ${it.quantity}`).join(", ")} · <b>${this.money(o.total_amount)}</b>
        </div>
        ${warn}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
          <div><label style="${l}">${isUz ? "Mashina raqami" : "Номер машины"} *</label>
            <input id="dlv-car" style="${f}text-transform:uppercase;" placeholder="01 A 123 BC"></div>
          <div><label style="${l}">${isUz ? "Haydovchi ismi" : "Имя водителя"}</label>
            <input id="dlv-driver" style="${f}"></div>
          <div><label style="${l}">${isUz ? "Haydovchi telefoni" : "Телефон водителя"} *</label>
            <input id="dlv-phone" type="tel" style="${f}" placeholder="+998 90 123 45 67"></div>
        </div>
        <div><label style="${l}">${isUz ? "Izoh" : "Примечание"}</label><input id="dlv-note" style="${f}"></div>
        <p style="margin:0;font-size:12px;color:#64748b;">${isUz ? "Saqlanganda mahsulot Ombordan chiqim qilinadi." : "При сохранении товар списывается со склада."}</p>
      </div>`, async () => {
        const v = id => (document.getElementById(id)?.value || "").trim();
        if (!v("dlv-car") || !v("dlv-phone")) {
          showToast(isUz ? "Mashina raqami va haydovchi telefonini kiriting" : "Укажите номер машины и телефон водителя", "error");
          return false;
        }
        await API.deliverOrder(id, { car_number: v("dlv-car"), driver_name: v("dlv-driver") || null, driver_phone: v("dlv-phone"), note: v("dlv-note") || null });
        showToast(isUz ? "Yetkazildi. Endi to'lovni qabul qiling." : "Доставлено. Теперь примите оплату.", "success");
        await this.reload();
        return true;
      });
  },

  openPay(id) {
    const isUz = this.isUz();
    const o = this.find(id);
    if (!o) return;
    const f = "width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;";
    const l = "display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;";
    const today = this.dayKey(new Date());
    const opt = (val, icon, title, sub, checked) => `
      <label style="flex:1 1 160px;display:flex;gap:10px;align-items:center;padding:12px;border-radius:10px;border:2px solid #e2e8f0;cursor:pointer;">
        <input type="radio" name="pay-method" value="${val}" ${checked ? "checked" : ""} style="width:18px;height:18px;">
        <span><b style="display:block;">${icon} ${title}</b><span style="font-size:11.5px;color:#64748b;">${sub}</span></span>
      </label>`;
    showModal(`${isUz ? "To'lov" : "Оплата"} — ${o.order_number}`, `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;">
          <span><b>${escapeHtml(o.client_name)}</b> · ${escapeHtml(o.client_phone)}</span>
          <span>${isUz ? "Summa" : "Сумма"}: <b>${formatNumber(o.total_amount, 0, 0)}</b> · ${isUz ? "To'langan" : "Оплачено"}: <b>${formatNumber(o.paid_amount, 0, 0)}</b> ·
            ${isUz ? "Qoldiq" : "Остаток"}: <b style="color:#b91c1c;">${formatNumber(o.balance, 0, 0)}</b></span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${opt("naqd", "💵", isUz ? "Naqd pul" : "Наличные", isUz ? "Kassa UZS ga kirim" : "Приход в Кассу UZS", true)}
          ${opt("karta", "💳", isUz ? "Plastik karta" : "Карта", isUz ? "Karta UZS ga kirim" : "Приход на Карта UZS", false)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
          <div><label style="${l}">${isUz ? "Summa (so'm)" : "Сумма (сум)"} *</label>
            <input id="pay-amount" type="number" min="1" step="any" value="${o.balance}" style="${f}"></div>
          <div><label style="${l}">${isUz ? "Sana" : "Дата"}</label>
            <input id="pay-date" type="date" value="${today}" style="${f}"></div>
        </div>
        <div><label style="${l}">${isUz ? "Izoh" : "Примечание"}</label><input id="pay-note" style="${f}"></div>
      </div>`, async () => {
        const amount = parseFloat(document.getElementById("pay-amount").value) || 0;
        if (amount <= 0) { showToast(isUz ? "Summani kiriting" : "Введите сумму", "error"); return false; }
        const method = (document.querySelector("input[name=pay-method]:checked") || {}).value || "naqd";
        const updated = await API.payOrder(id, {
          amount, method,
          paid_date: document.getElementById("pay-date").value || null,
          note: (document.getElementById("pay-note").value || "").trim() || null,
        });
        showToast(updated.balance > 0
          ? `${isUz ? "To'lov qabul qilindi. Qoldiq" : "Оплата принята. Остаток"}: ${formatNumber(updated.balance, 0, 0)} so'm`
          : (isUz ? "To'liq to'landi ✓" : "Полностью оплачено ✓"), "success");
        await this.reload();
        return true;
      });
  },

  cancel(id) {
    const isUz = this.isUz();
    const o = this.find(id);
    if (!o) return;
    showModal(isUz ? "Buyurtmani bekor qilish" : "Отмена заказа",
      `<p style="margin:0;">${isUz ? `${o.order_number} (${escapeHtml(o.client_name)}) bekor qilinsinmi? Ombordan hech narsa chiqmagan.`
                                   : `Отменить ${o.order_number} (${escapeHtml(o.client_name)})? Со склада ничего не списано.`}</p>`,
      async () => {
        await API.cancelOrder(id);
        showToast(isUz ? "Bekor qilindi" : "Отменён", "success");
        await this.reload();
        return true;
      });
  },

  isAdmin() {
    return typeof getUserRoles === "function" && getUserRoles().includes("Admin");
  },

  // Demo rows are tagged on the server, so clearing never touches real data.
  loadDemo() {
    const isUz = this.isUz();
    showModal(isUz ? "Demo ma'lumot yuklash" : "Загрузить демо",
      `<p style="margin:0 0 8px;">${isUz
        ? "Omborga demo mahsulot va har bosqichdagi 9 ta demo buyurtma qo'shiladi (muddati o'tgan, bugungi, yetkazilgan, qisman va to'liq to'langan)."
        : "На склад добавятся демо-товары и 9 демо-заказов на всех этапах (просроченные, сегодняшние, доставленные, частично и полностью оплаченные)."}</p>
       <p style="margin:0;color:#64748b;font-size:13px;">${isUz
        ? "Avvalgi demo bo'lsa, u yangisi bilan almashtiriladi. Haqiqiy ma'lumotlarga tegilmaydi."
        : "Предыдущее демо будет заменено. Реальные данные не затрагиваются."}</p>`,
      async () => {
        const r = await API.loadOrderDemo();
        showToast(`${isUz ? "Demo yuklandi" : "Демо загружено"}: ${r.orders} ${isUz ? "ta buyurtma" : "заказов"}`, "success");
        await this.reload();
        return true;
      });
  },

  async openLegacy() {
    const container = document.getElementById("module-container");
    if (!container) return;
    this.stopTimers();
    await SalesModule.render(container);
    const isUz = this.isUz();
    const back = document.createElement("div");
    back.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="navigateTo('sales')"
      style="margin-bottom:12px;padding:7px 12px;border-radius:8px;font-weight:600;">← ${isUz ? "Buyurtmalarga qaytish" : "К заказам"}</button>`;
    container.prepend(back);
  },

  // ------------------------------------------------------------ timers

  tick() {
    document.querySelectorAll("#orders-root .order-countdown").forEach(el => {
      const c = this.countdown(el.dataset.deadline);
      el.textContent = c.text;
      const [bg, fg, bd] = this.toneStyle(c.tone);
      el.style.background = bg;
      el.style.color = fg;
      el.style.border = `1px solid ${bd}`;
    });
  },

  startTimers() {
    this.stopTimers();
    this.tickTimer = setInterval(() => {
      if (!document.getElementById("orders-root")) return this.stopTimers();
      this.tick();
    }, 1000);
    // Refresh from the server so stock arriving elsewhere shows up, but never
    // under an open form.
    this.pollTimer = setInterval(() => {
      if (!document.getElementById("orders-root")) return this.stopTimers();
      const modalOpen = document.getElementById("modal-overlay")?.classList.contains("active");
      if (!modalOpen) this.reload();
    }, 30000);
  },

  stopTimers() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.tickTimer = this.pollTimer = null;
  },
};

/**
 * Sidebar reminder: a badge on "Sotish" with the open orders due within 24h
 * or overdue. Refreshed every minute while the app is open.
 */
async function refreshOrderBadge(orders) {
  try {
    if (typeof hasModuleAccess === "function" && !hasModuleAccess("sales")) return;
    if (!orders) orders = (await API.getOrders("Yangi")).orders || [];
    const soon = Date.now() + 86400000;
    const n = orders.filter(o => o.status === "Yangi" && new Date(o.deadline).getTime() < soon).length;
    document.querySelectorAll('[data-nav="sales"], [data-mobnav="sales"]').forEach(el => {
      let b = el.querySelector(".order-due-badge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement("span");
        b.className = "order-due-badge";
        b.style.cssText = "margin-left:auto;background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:800;line-height:16px;";
        el.appendChild(b);
      }
      b.textContent = n;
      b.title = CURRENT_LANG === "uz" ? "Muddati 24 soat ichida yoki o'tgan buyurtmalar" : "Заказы со сроком в течение 24 ч или просроченные";
    });
  } catch (_) { /* a reminder must never break the page */ }
}

setInterval(() => { if (localStorage.getItem("erp_token")) refreshOrderBadge(); }, 60000);
