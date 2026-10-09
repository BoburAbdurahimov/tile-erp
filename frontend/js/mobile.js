// Phone layout (screens up to 768px wide; the CSS decides what shows where).
// - The bottom bar holds the main pages the user may open, plus "Menyu"
//   with every section. Setup and report pages that are easier on a
//   computer are only in Menyu, grouped under "Kompyuterda qulayroq".
// - The header shows the name of the open page.
// - Data tables get each cell labelled with its column name, so on a phone
//   every row can be shown as a card instead of a table wider than the screen.
const MobileUI = (() => {
  // Offered in the bottom bar in this order, the first BAR_SIZE allowed ones.
  const BAR_ORDER = ["dashboard", "ombor", "kassa", "production", "sales", "balances", "purchases", "expenses", "finance"];
  const BAR_SIZE = 4;
  // Only in Menyu on a phone.
  const DESKTOP_PAGES = ["mdm", "ombor_eski", "salary", "history", "users"];

  const LABELS = {
    dashboard: "mob_dashboard", ombor: "nav_ombor", kassa: "nav_kassa", production: "mob_production",
    sales: "nav_sales", balances: "mob_balances", purchases: "mob_purchases", expenses: "mob_expenses",
    finance: "nav_finance",
  };

  const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    dashboard: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    ombor: svg('<path d="M3 9l9-5 9 5v11H3z"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>'),
    kassa: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M15 15h3"/>'),
    production: svg('<path d="M3 20h18"/><path d="M4 20V11l5 3v-3l5 3V5h5v15"/>'),
    sales: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11l2-8H6.2"/>'),
    balances: svg('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.4c1.8.8 3 2.9 3 5.6"/>'),
    purchases: svg('<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    expenses: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    finance: svg('<path d="M3 20h18"/><path d="M6 20v-6M11 20V8M16 20v-9M21 20V4"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  };

  function buildBottomNav() {
    const nav = document.getElementById("mobile-bottom-nav");
    if (!nav) return;
    const pages = BAR_ORDER.filter(m => hasModuleAccess(m)).slice(0, BAR_SIZE);
    nav.innerHTML = pages.map(m => `
      <a class="mob-nav-item" data-mobnav="${m}" onclick="navigateTo('${m}')">
        ${ICONS[m]}<span class="mob-label">${t(LABELS[m])}</span>
      </a>`).join("") + `
      <a class="mob-nav-item mob-nav-menu" onclick="toggleOdooAppsOverlay()">
        ${ICONS.menu}<span class="mob-label">${t("mob_menu")}</span>
      </a>`;

    const label = document.getElementById("odoo-apps-desktop-label");
    if (label) label.hidden = !DESKTOP_PAGES.some(m => hasModuleAccess(m));
    setActive(currentModule);
  }

  // A page that is not in the bar lights up Menyu instead.
  function setActive(moduleName) {
    let inBar = false;
    document.querySelectorAll(".mob-nav-item[data-mobnav]").forEach(item => {
      const on = item.getAttribute("data-mobnav") === moduleName;
      item.classList.toggle("active", on);
      inBar = inBar || on;
    });
    const menu = document.querySelector(".mob-nav-menu");
    if (menu) menu.classList.toggle("active", !inBar);
  }

  // ---------- tables as cards ----------
  const EMPTY = new Set(["", "-", "—", "·"]);
  const ACTIONS = /^(amallar|amal|действия|действие|actions?)$/i;

  const clean = (text) => (text || "").replace(/[↕▲▼]/g, "").replace(/\s+/g, " ").trim();

  function onlyButtons(td) {
    const all = clean(td.textContent).replace(/\s/g, "");
    const buttons = Array.from(td.querySelectorAll("button, a, input, select"))
      .map(b => clean(b.textContent)).join("").replace(/\s/g, "");
    return all === buttons;
  }

  // Column names, also for two-row headers ("Kirim" over "so'm" and "$"
  // gives "Kirim · so'm" and "Kirim · $").
  function headerLabels(table) {
    const rows = Array.from(table.querySelectorAll(":scope > thead > tr"))
      .filter(tr => !tr.classList.contains("filter-row"));
    const grid = [];
    rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      Array.from(tr.cells).forEach(th => {
        while (grid[r][c] !== undefined) c++;
        const text = clean(th.textContent);
        for (let dr = 0; dr < (th.rowSpan || 1); dr++) {
          grid[r + dr] = grid[r + dr] || [];
          for (let dc = 0; dc < (th.colSpan || 1); dc++) grid[r + dr][c + dc] = text;
        }
        c += th.colSpan || 1;
      });
    });
    const width = Math.max(0, ...grid.map(row => row.length));
    const labels = [];
    for (let c = 0; c < width; c++) {
      const parts = [];
      grid.forEach(row => {
        if (row[c] && parts[parts.length - 1] !== row[c]) parts.push(row[c]);
      });
      labels.push(parts.join(" · "));
    }
    return labels;
  }

  function labelTable(table) {
    if (table.id === "sklad-matrix-table" || table.classList.contains("no-cards")) return;
    if (table.parentElement && table.parentElement.closest("table")) return;    // nested table
    if (table.querySelector(":scope > tbody > tr > [rowspan]:not([rowspan='1'])")) return;
    const labels = headerLabels(table);
    if (!labels.length) return;
    table.classList.add("cards-on-phone");

    table.querySelectorAll(":scope > tbody > tr, :scope > tfoot > tr").forEach(tr => {
      const cells = Array.from(tr.cells);
      if (cells.length === 1 && cells[0].colSpan > 1) {
        tr.classList.add("card-full");                 // "no data" rows, group headings
        return;
      }
      let col = 0;
      let lead = false;
      cells.forEach(td => {
        const span = td.colSpan || 1;
        const label = span === 1 ? (labels[col] || "") : "";
        col += span;
        td.classList.remove("card-lead", "card-empty", "card-skip", "card-actions");
        if (label) td.setAttribute("data-label", label);
        else td.removeAttribute("data-label");

        const text = clean(td.textContent);
        const control = td.querySelector("button, a.btn, input, select");
        if (/^(№|#)$/.test(label)) td.classList.add("card-skip");
        else if (control && (ACTIONS.test(label) || onlyButtons(td))) td.classList.add("card-actions");
        else if (!control && EMPTY.has(text)) td.classList.add("card-empty");
        else if (!lead) { td.classList.add("card-lead"); lead = true; }
      });
    });
  }

  function labelTables() {
    const root = document.getElementById("module-container");
    if (!root) return;
    root.querySelectorAll("table.data-table").forEach(labelTable);
  }

  let pending = false;
  function scheduleLabel() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; labelTables(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("module-container");
    if (root) new MutationObserver(scheduleLabel).observe(root, { childList: true, subtree: true });

    // The open page's name, shown in the header on a phone.
    const title = document.getElementById("page-title");
    const mobileTitle = document.getElementById("mobile-page-title");
    if (title && mobileTitle) {
      const sync = () => { mobileTitle.textContent = title.textContent; };
      new MutationObserver(sync).observe(title, { childList: true, characterData: true, subtree: true });
      sync();
    }
  });

  return { buildBottomNav, setActive, labelTables };
})();
