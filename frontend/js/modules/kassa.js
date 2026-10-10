const KassaModule = {
  async render(container) {
    container.innerHTML = `
      <div class="grid-2">
        <!-- Cash Registers Card -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="card-title" style="font-size: 18px; font-weight: 700;">${t('mod_kassa_title')}</div>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-success" onclick="KassaModule.openTransactionModal('kirim')" style="font-weight: 700; font-size: 15px; padding: 9px 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(16, 185, 129, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
                ${t('kassa_income_btn')}
              </button>
              <button class="btn btn-danger" onclick="KassaModule.openTransactionModal('chiqim')" style="font-weight: 700; font-size: 15px; padding: 9px 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(239, 68, 68, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
                ${t('kassa_expense_btn')}
              </button>
              <button class="btn btn-primary" onclick="KassaModule.openExchangeModal()" style="font-weight: 700; font-size: 15px; padding: 9px 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.25); display: flex; align-items: center; gap: 6px; cursor: pointer;">
                ${CURRENT_LANG === 'uz' ? 'Konvertatsiya' : 'Конвертация'}
              </button>
            </div>
          </div>
          <div id="kassa-registers-container" style="display: flex; flex-direction: column; gap: 14px;">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Exchange Rate & CBU Integration Card -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="card-title" style="font-size: 18px; font-weight: 700;">${t('kassa_rate_title')}</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="KassaModule.syncCbuLive()" style="font-weight: 600;">
                ${t('kassa_cbu_sync_btn')}
              </button>
              <button class="btn btn-warning btn-sm" onclick="KassaModule.openRateModal()" style="font-weight: 600;">
                ${t('rate_edit')}
              </button>
            </div>
          </div>
          <div id="kassa-rates-container">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>

      <!-- Cash Transactions Table -->
      <div class="card" style="margin-top: 20px;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div class="card-title" style="font-size: 18px; font-weight: 700;">${t('kassa_history_title')}</div>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="exportTableToPdf('kassa-transactions-table', 'kassa_operatsiyalari')" title="${t('btn_export_pdf')}" aria-label="${t('btn_export_pdf')}">${uiIcon("pdf")}</button>
        </div>
        <div class="table-container" id="kassa-tx-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await Promise.all([this.loadRegisters(), this.loadRates(), this.loadTransactions()]);
  },

  async loadRegisters() {
    const div = document.getElementById("kassa-registers-container");
    if (!div) return;
    try {
      const registers = await API.getCashRegisters();
      this.registers = registers || [];
      div.innerHTML = registers.map(r => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${tr(r.name)}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${tr(r.description) || ''}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 22px; font-weight: 800; color: ${r.currency === 'USD' ? '#10b981' : '#2563eb'};">
              ${r.currency === 'USD' ? '$' + formatNumber(r.balance, 2, 2) : formatNumber(r.balance, 0, 2) + ' UZS'}
            </div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 500; margin-top: 2px;">
              ≈ ${r.currency === 'USD' ? formatNumber(Math.round(r.balance_in_other_currency), 0, 2) + ' UZS' : '$' + formatNumber(r.balance_in_other_currency, 2, 2)}
            </div>
          </div>
        </div>
      `).join("");
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async loadRates() {
    const div = document.getElementById("kassa-rates-container");
    if (!div) return;
    try {
      const rates = await API.getExchangeRates();
      this.rates = rates || [];
      const latest = rates[0];
      if (!latest) {
        div.innerHTML = `<div style="padding: 14px 18px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font-weight: 600; margin-bottom: 16px;">${CURRENT_LANG === 'uz' ? "Valyuta kursi hali kiritilmagan." : "Курс валюты ещё не задан."}</div>`;
        return;
      }

      div.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px 20px; border-radius: 12px; margin-bottom: 16px;">
          <div>
            <span style="font-size: 12px; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${t('kassa_rate_official')}</span>
            <div style="font-size: 28px; font-weight: 800; color: #1d4ed8; margin-top: 2px;">${formatNumber(latest.rate_usd_uzs, 0, 2)} UZS</div>
          </div>
          <div>
            <span class="badge ${latest.is_manual_override ? 'badge-warning' : 'badge-success'}" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">
              ${tr(latest.is_manual_override ? "Qo'lda kiritilgan (Manual)" : "CBU API (Avtomatik)")}
            </span>
          </div>
        </div>
        <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 8px;">${t('kassa_recent_rates')}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${rates.slice(0, 4).map(r => `
            <span class="badge badge-primary" style="font-size: 12px; padding: 6px 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">
              ${formatDate(r.date)}: <strong>${formatNumber(r.rate_usd_uzs, 0, 2)} UZS</strong>
            </span>
          `).join("")}
        </div>
      `;
    } catch (e) {
      console.error(e);
    }
  },

  async loadTransactions() {
    const tableDiv = document.getElementById("kassa-tx-table-container");
    if (!tableDiv) return;

    try {
      const txs = await API.getCashTransactions();
      tableDiv.innerHTML = `
        <table class="data-table" id="kassa-transactions-table">
          <thead>
            <tr>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 0, false)">${t('th_date')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 1, false)">${CURRENT_LANG === 'uz' ? 'Kassa' : 'Касса'} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 2, false)">${t('th_type')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 3, false)">${t('th_category')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 4, false)">${t('th_counterparty')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 5, true)" style="text-align: right;">${t('th_total')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 6, false)" style="text-align: center;">${t('th_currency')} <span class="sort-icon">↕</span></th>
              <th class="sortable" onclick="TableFilterSort.sortTable(this, 7, false)">${t('th_description')} <span class="sort-icon">↕</span></th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="table-col-filter" data-col-idx="0" placeholder="${CURRENT_LANG === 'uz' ? 'Sana...' : 'Дата...'}" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="1" placeholder="${CURRENT_LANG === 'uz' ? 'Kassa...' : 'Касса...'}" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="2" placeholder="${CURRENT_LANG === 'uz' ? 'Tur...' : 'Тип...'}" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="3" placeholder="${CURRENT_LANG === 'uz' ? 'Kategoriya...' : 'Категория...'}" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="4" placeholder="${CURRENT_LANG === 'uz' ? 'Kontragent...' : 'Контрагент...'}" /></th>
              <th></th>
              <th><input type="text" class="table-col-filter" data-col-idx="6" placeholder="${CURRENT_LANG === 'uz' ? 'Valyuta...' : 'Валюта...'}" /></th>
              <th><input type="text" class="table-col-filter" data-col-idx="7" placeholder="${CURRENT_LANG === 'uz' ? 'Tavsif...' : 'Описание...'}" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${txs.map(tx => {
              const isKirim = tx.type === "kirim" || tx.type === "Kirim";
              const isUsd = tx.currency === 'USD';
              return `
                <tr>
                  <td data-sort-value="${tx.date}">${formatDate(tx.date)}</td>
                  <td data-sort-value="${tx.register_name}"><strong>${tr(tx.register_name)}</strong></td>
                  <td data-sort-value="${tx.type}">
                    <span class="badge" style="background: ${isKirim ? '#dcfce7' : '#fee2e2'}; color: ${isKirim ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 6px; font-weight: 600;">
                      ${isKirim ? (CURRENT_LANG === 'uz' ? 'Kirim' : 'Приход') : (CURRENT_LANG === 'uz' ? 'Chiqim' : 'Расход')}
                    </span>
                  </td>
                  <td data-sort-value="${tr(tx.category)}"><span class="badge" style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${tr(tx.category)}</span></td>
                  <td data-sort-value="${tx.counterparty_name || ''}">${tx.counterparty_name || '-'}</td>
                  <td data-sort-value="${tx.amount}" style="text-align: right;">
                    <strong style="color: ${isKirim ? '#10b981' : '#ef4444'}; font-size: 14px;">
                      ${isKirim ? '+' : '-'}${formatNumber(tx.amount, 2, 2)}
                    </strong>
                  </td>
                  <td data-sort-value="${tx.currency}" style="text-align: center;">
                    <span class="badge" style="font-weight: 700; padding: 4px 8px; border-radius: 6px; background: ${isUsd ? '#ecfdf5' : '#eff6ff'}; color: ${isUsd ? '#059669' : '#2563eb'}; border: 1px solid ${isUsd ? '#a7f3d0' : '#bfdbfe'};">
                      ${tx.currency}
                    </span>
                  </td>
                  <td data-sort-value="${tx.description || ''}">${tr(tx.description) || '-'}</td>
                  <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                    ${CURRENT_ROLE === 'Admin' ? `<button class="btn btn-danger btn-sm" onclick="KassaModule.deleteTransaction(${tx.id}, ${jsArg(tx.category)})" title="O'chirish" style="padding: 4px 8px; font-size: 12px;">${CURRENT_LANG === 'uz' ? "O'chirish" : "Удалить"}</button>` : ''}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async syncCbuLive() {
    try {
      const res = await API.syncCbuRate();
      const msg = CURRENT_LANG === 'uz' 
        ? `CBU kursi yangilandi: 1 USD = ${res.rate_usd_uzs.toLocaleString()} UZS` 
        : `Курс ЦБ обновлен: 1 USD = ${res.rate_usd_uzs.toLocaleString()} UZS`;
      showToast(msg, "success");
      await this.loadRates();
      await this.loadRegisters();
      updateHeaderFxRate();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  openRateModal() {
    if (CURRENT_ROLE !== "Admin") {
      showToast(t('msg_admin_only'), "error");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    showModal(
      t('kassa_modal_rate_title'),
      `
        <form id="rate-override-form">
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_date')} *</label>
            <input type="date" id="rate-date" class="form-control" value="${todayStr}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
          </div>
          <div class="form-group">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('kassa_modal_rate_new')}</label>
            <input type="number" step="any" id="rate-val" class="form-control" placeholder="" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" />
          </div>
        </form>
      `,
      async () => {
        const d = document.getElementById("rate-date").value;
        const r = parseFloat(document.getElementById("rate-val").value);
        if (!d || isNaN(r) || r <= 0) {
          showToast(CURRENT_LANG === 'uz' ? "Iltimos, to'g'ri kurs qiymatini kiriting!" : "Пожалуйста, введите корректный курс!", "warning");
          return false;
        }

        try {
          await API.setExchangeRate({ date: d, rate_usd_uzs: r, is_manual_override: true });
          showToast(CURRENT_LANG === 'uz' ? "Kurs muvaffaqiyatli saqlandi!" : "Курс успешно сохранен!", "success");
          await KassaModule.loadRates();
          await KassaModule.loadRegisters();
          updateHeaderFxRate();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );
  },

  // Konvertatsiya: dollars into so'm or back at a rate (the day's rate, which
  // can be changed), or money between two registers of one currency.
  rateFor(dateStr) {
    const r = (this.rates || []).find(x => String(x.date).slice(0, 10) <= dateStr);
    return r ? r.rate_usd_uzs : ((this.rates || [])[0] || {}).rate_usd_uzs || "";
  },

  async openExchangeModal() {
    const isUz = CURRENT_LANG === 'uz';
    try {
      this.registers = await API.getCashRegisters();
      if (!this.rates) this.rates = await API.getExchangeRates();
    } catch (e) {
      showToast(e.message, "error");
      return;
    }
    const regs = this.registers || [];
    if (regs.length < 2) {
      showToast(isUz ? "Kamida ikkita kassa kerak" : "Нужно минимум две кассы", "warning");
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    const from = regs.find(r => r.currency === "USD") || regs[0];
    const to = regs.find(r => r.id !== from.id && r.currency !== from.currency) || regs.find(r => r.id !== from.id);
    const options = (selected) => regs.map(r => `<option value="${r.id}" ${r.id === selected.id ? "selected" : ""}>${tr(r.name)} (${r.currency === 'USD' ? '$' + formatNumber(r.balance, 2, 2) : formatNumber(r.balance, 0, 2) + ' UZS'})</option>`).join("");
    const field = "width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;";
    const label = "display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;";

    showModal(
      isUz ? "Konvertatsiya (kassadan kassaga)" : "Конвертация (из кассы в кассу)",
      `
        <form id="exchange-form" onsubmit="return false;">
          <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}">${isUz ? "Qaysi kassadan" : "Из кассы"} *</label>
              <select id="ex-from" class="form-control" style="${field}" onchange="KassaModule.updateExchange()">${options(from)}</select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}">${isUz ? "Qaysi kassaga" : "В кассу"} *</label>
              <select id="ex-to" class="form-control" style="${field}" onchange="KassaModule.updateExchange()">${options(to)}</select>
            </div>
          </div>
          <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}" id="ex-amount-label">${isUz ? "Summa" : "Сумма"} *</label>
              <input type="number" id="ex-amount" class="form-control" step="any" min="0.01" placeholder="0" style="${field} font-weight: 700;" oninput="KassaModule.updateExchange()">
            </div>
            <div class="form-group" id="ex-rate-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}">${isUz ? "Kurs: 1 USD = ? UZS" : "Курс: 1 USD = ? UZS"} *</label>
              <input type="number" id="ex-rate" class="form-control" step="any" min="0.01" value="${this.rateFor(todayStr)}" style="${field}"
                oninput="this.dataset.touched = '1'; KassaModule.updateExchange()">
              <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">${isUz ? "Belgilangan kurs qo'yildi - kerak bo'lsa o'zgartiring." : "Подставлен установленный курс - при необходимости измените."}</div>
            </div>
          </div>
          <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}">${t('th_date')} *</label>
              <input type="date" id="ex-date" class="form-control" value="${todayStr}" style="${field}" onchange="KassaModule.onExchangeDate()">
            </div>
            <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 14px;">
              <label style="${label}">${isUz ? "Izoh" : "Примечание"}</label>
              <input type="text" id="ex-note" class="form-control" style="${field}" placeholder="${isUz ? "Masalan: bozorda sotildi" : "Например: продано на рынке"}">
            </div>
          </div>
          <div id="ex-result" style="padding: 12px 14px; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-weight: 700;"></div>
        </form>
      `,
      async () => {
        const fromId = parseInt(document.getElementById("ex-from").value);
        const toId = parseInt(document.getElementById("ex-to").value);
        const amount = parseFloat(document.getElementById("ex-amount").value);
        const rate = parseFloat(document.getElementById("ex-rate").value);
        if (fromId === toId) {
          showToast(isUz ? "Ikki xil kassani tanlang" : "Выберите две разные кассы", "warning");
          return false;
        }
        if (!(amount > 0)) {
          showToast(isUz ? "Summani kiriting" : "Введите сумму", "warning");
          return false;
        }
        try {
          const res = await API.exchangeCash({
            from_register_id: fromId, to_register_id: toId, amount,
            rate: this.exchangeNeedsRate() ? rate : null,
            date: document.getElementById("ex-date").value,
            note: document.getElementById("ex-note").value,
          });
          const dst = (this.registers || []).find(r => r.id === toId);
          showToast(`${isUz ? "Konvertatsiya bajarildi" : "Конвертация выполнена"}: ${tr(dst ? dst.name : "")} +${formatNumber(res.to_amount, 0, 2)} ${dst ? dst.currency : ""}`, "success");
          await this.loadRegisters();
          await this.loadTransactions();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );
    this.updateExchange();
  },

  exchangeNeedsRate() {
    const regs = this.registers || [];
    const from = regs.find(r => r.id === parseInt(document.getElementById("ex-from").value));
    const to = regs.find(r => r.id === parseInt(document.getElementById("ex-to").value));
    return !!(from && to && from.currency !== to.currency);
  },

  onExchangeDate() {
    const rate = document.getElementById("ex-rate");
    if (rate && !rate.dataset.touched) rate.value = this.rateFor(document.getElementById("ex-date").value);
    this.updateExchange();
  },

  updateExchange() {
    const isUz = CURRENT_LANG === 'uz';
    const regs = this.registers || [];
    const from = regs.find(r => r.id === parseInt(document.getElementById("ex-from").value));
    const to = regs.find(r => r.id === parseInt(document.getElementById("ex-to").value));
    const out = document.getElementById("ex-result");
    if (!from || !to || !out) return;
    const needsRate = from.currency !== to.currency;
    document.getElementById("ex-rate-group").style.display = needsRate ? "" : "none";
    document.getElementById("ex-amount-label").textContent = `${isUz ? "Summa" : "Сумма"} (${from.currency}) *`;
    const money = (v, cur) => cur === "USD" ? `$${formatNumber(v, 2, 2)}` : `${formatNumber(v, 0, 0)} UZS`;
    if (from.id === to.id) {
      out.textContent = isUz ? "Ikki xil kassani tanlang" : "Выберите две разные кассы";
      return;
    }
    const amount = parseFloat(document.getElementById("ex-amount").value) || 0;
    const rate = parseFloat(document.getElementById("ex-rate").value) || 0;
    let received = amount;
    if (needsRate) received = rate > 0 ? (from.currency === "USD" ? amount * rate : amount / rate) : 0;
    const short = amount > (from.balance || 0);
    out.style.background = short ? "#fef2f2" : "#eff6ff";
    out.style.borderColor = short ? "#fecaca" : "#bfdbfe";
    out.style.color = short ? "#b91c1c" : "#1e3a8a";
    out.innerHTML = short
      ? `${tr(from.name)}: ${isUz ? "yetarli mablag' yo'q" : "недостаточно средств"} (${money(from.balance || 0, from.currency)})`
      : `${tr(from.name)} −${money(amount, from.currency)} → ${tr(to.name)} <span style="color:#059669;">+${money(received, to.currency)}</span>`;
  },

  openTransactionModal(type) {
    const isKirim = type === "kirim";
    const title = isKirim 
      ? (CURRENT_LANG === 'uz' ? "Kassaga Kirim qilish (+)" : "Приход в кассу (+)") 
      : (CURRENT_LANG === 'uz' ? "Kassadan Chiqim qilish (-)" : "Расход из кассы (-)");
    const todayStr = new Date().toISOString().split("T")[0];
    const isUz = CURRENT_LANG === 'uz';

    const defaultCatKey = isKirim ? "Mijoz to'lovi" : "Elektr energiya (Svet)";
    const defaultCatLabel = isKirim 
      ? (isUz ? "Mijoz to'lovi (Debitorlik)" : "Оплата от клиента (Погашение дебиторки)")
      : (isUz ? "Elektr energiya (Svet)" : "Электроэнергия (Свет)");

    showModal(
      title,
      `
        <form id="kassa-tx-form">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('kassa_reg_select')}</label>
              <select id="tx-register" class="form-control" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;">
                ${(this.registers && this.registers.length ? this.registers : [
                    { id: 1, name: 'Kassa USD', currency: 'USD' }, { id: 2, name: 'Kassa UZS', currency: 'UZS' }
                  ]).map(r => `<option value="${r.id}" data-currency="${r.currency}">${escapeHtml(tr(r.name))}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_date')} *</label>
              <input type="date" id="tx-date" class="form-control" value="${todayStr}" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" />
            </div>
          </div>
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('kassa_amount')}</label>
              <input type="text" id="tx-amount" class="form-control" placeholder="0" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-weight: 600;" />
              <div id="tx-amount-hint" style="margin-top: 4px; font-size: 13px; font-weight: 700; color: #2563eb; display: none;"></div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('kassa_category')}</label>
              <input type="hidden" id="tx-category" value="${defaultCatKey}" />
              <div 
                id="tx-category-btn" 
                onclick="KassaModule.openCategoryPicker('${type}')"
                style="width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; cursor: pointer; background: #ffffff; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;"
                onmouseover="this.style.borderColor='#2563eb'"
                onmouseout="this.style.borderColor='#cbd5e1'"
              >
                <span id="tx-category-selected-label" style="color: #1e293b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${defaultCatLabel}</span>
                <span style="color: #2563eb; font-size: 11px; font-weight: 600; margin-left: 6px; flex-shrink: 0;">${isUz ? 'Tanlash' : 'Выбрать'}</span>
              </div>
            </div>
          </div>
          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
              ${t('kassa_cp_linked')} <span style="font-weight: 400; color: #2563eb; font-size: 11px;">${t('kassa_cp_hint')}</span>
            </label>
            <input 
              type="text" 
              id="tx-counterparty-input" 
              list="tx-cp-datalist" 
              class="form-control" 
              placeholder="${isUz ? 'Kod yoki nom yozing (masalan: 10001 yoki Ali)...' : 'Введите код или наименование...'}" 
              style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
            />
            <datalist id="tx-cp-datalist"></datalist>
          </div>
          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
            <textarea id="tx-desc" class="form-control" rows="2" placeholder="${t('kassa_desc_placeholder')}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const regId = parseInt(document.getElementById("tx-register").value);
        const d = document.getElementById("tx-date").value;
        const amt = parseFormattedNumber(document.getElementById("tx-amount").value);
        const cat = document.getElementById("tx-category").value;
        const cpInput = document.getElementById("tx-counterparty-input").value.trim();
        const desc = document.getElementById("tx-desc").value.trim();

        if (!regId || isNaN(amt) || amt <= 0) {
          showToast(CURRENT_LANG === 'uz' ? "Iltimos, summani to'g'ri kiriting!" : "Пожалуйста, введите корректную сумму!", "warning");
          return false;
        }

        let cpId = null;
        if (cpInput) {
          const matched = KassaModule.findCounterparty(cpInput);
          if (!matched) {
            showToast(isUz ? "Kontragent topilmadi. Ro'yxatdan tanlang yoki maydonni bo'sh qoldiring." : "Контрагент не найден. Выберите из списка или оставьте поле пустым.", "error");
            return false;
          }
          cpId = matched.id;
        }

        const currency = KassaModule.selectedRegisterCurrency();

        try {
          await API.createCashTransaction({
            register_id: regId,
            date: d,
            type: isKirim ? "kirim" : "chiqim",
            category: cat,
            amount: amt,
            currency: currency,
            counterparty_id: cpId,
            description: desc
          });
          showToast(t('msg_saved'), "success");
          await KassaModule.loadRegisters();
          await KassaModule.loadTransactions();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      }
    );

    this.populateCounterpartiesForTx();
    setTimeout(() => {
      const amtInput = document.getElementById("tx-amount");
      const amtHint = document.getElementById("tx-amount-hint");
      const regSelect = document.getElementById("tx-register");
      setupLiveMoneyInput(amtInput, amtHint, () => KassaModule.selectedRegisterCurrency());
      regSelect.addEventListener("change", () => {
        if (amtInput.value) {
          const num = parseFormattedNumber(amtInput.value);
          if (num > 0 && amtHint) {
            const curr = KassaModule.selectedRegisterCurrency();
            amtHint.innerHTML = `<strong style="font-size: 14px; color: #2563eb;">${formatNumber(num, 0, 2)} ${curr}</strong>`;
          }
        }
      });
    }, 50);
  },

  openCategoryPicker(type) {
    const isKirim = type === "kirim";
    const isUz = CURRENT_LANG === 'uz';

    const categoriesData = isKirim ? [
      {
        group: isUz ? "Asosiy Kirim Turlari" : "Основные поступления",
        items: [
          { key: "Mijoz to'lovi", label: isUz ? "Mijoz to'lovi (Debitorlik)" : "Оплата от клиента (Погашение дебиторки)" },
          { key: "Postavshikdan qaytgan pul", label: isUz ? "Postavshikdan qaytgan pul" : "Возврат средств от поставщика" },
          { key: "Asoschidan investitsiya", label: isUz ? "Asoschidan investitsiya" : "Инвестиции учредителя" },
          { key: "Boshqa kirim", label: isUz ? "Boshqa daromadlar va kirimlar" : "Прочие доходы и поступления" }
        ]
      }
    ] : [
      {
        group: isUz ? "Bilvosita ishlab chiqarish xarajatlari (Sex)" : "Косвенные производственные расходы (Цех)",
        items: [
          { key: "Elektr energiya (Svet)", label: isUz ? "Elektr energiya (Svet)" : "Электроэнергия (Свет)" },
          { key: "Tabiiy gaz", label: isUz ? "Tabiiy gaz" : "Природный газ" },
          { key: "Suv va kanalizatsiya", label: isUz ? "Suv va kanalizatsiya" : "Водоснабжение и канализация" },
          { key: "Uskunalar ta'miri va ehtiyot qismlar", label: isUz ? "Uskunalar ta'miri va ehtiyot qismlar" : "Ремонт оборудования и запчасти" },
          { key: "Sex ijarasi va xizmatlar", label: isUz ? "Sex ijarasi va xizmatlar" : "Аренда цеха и услуги" },
          { key: "Transport va yoqilg'i", label: isUz ? "Transport va yoqilg'i (GSM)" : "Транспорт и ГСМ" },
          { key: "Ishchilar oyligi / Avans", label: isUz ? "Ishchilar oyligi / Avans" : "Зарплата рабочих / Аванс" },
          { key: "Boshqa sex xarajatlari", label: isUz ? "Boshqa sex xarajatlari" : "Прочие цеховые расходы" }
        ]
      },
      {
        group: isUz ? "Ma'muriy va boshqaruv xarajatlari" : "Административные и управленческие расходы",
        items: [
          { key: "Ofis ijarasi", label: isUz ? "Ofis ijarasi" : "Аренда офиса" },
          { key: "Aloqa, Internet va IT", label: isUz ? "Aloqa, Internet va IT" : "Связь, интернет и IT" },
          { key: "Buxgalteriya va audit", label: isUz ? "Buxgalteriya va konsalting" : "Бухгалтерия и консалтинг" },
          { key: "Reklama va marketing", label: isUz ? "Reklama va marketing" : "Реклама и маркетинг" },
          { key: "Soliqlar va davlat bojlari", label: isUz ? "Soliqlar va davlat bojlari" : "Налоги и госпошлины" },
          { key: "Ofis va xo'jalik xarajatlari", label: isUz ? "Ofis va xo'jalik xarajatlari" : "Хозяйственные расходы" },
          { key: "Boshqa ma'muriy xarajatlar", label: isUz ? "Boshqa ma'muriy xarajatlar" : "Прочие админ расходы" }
        ]
      },
      {
        group: isUz ? "Kontragentlar va boshqa to'lovlar" : "Расчеты с поставщиками и прочее",
        items: [
          { key: "Postavshikka to'lov", label: isUz ? "Postavshikka to'lov (Qarz yopish)" : "Оплата поставщику (Погашение долга)" },
          { key: "Boshqa chiqim", label: isUz ? "Boshqa chiqimlar" : "Прочий расход" }
        ]
      }
    ];

    const overlay = document.createElement("div");
    overlay.id = "kassa-cat-picker-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.backgroundColor = "rgba(15, 23, 42, 0.65)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "100000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";
    overlay.style.animation = "fadeIn 0.2s ease";

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    overlay.innerHTML = `
      <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 580px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
<span>${isUz ? 'Kategoriya tanlash' : 'Выбор категории'}</span>
          </h3>
          <button type="button" onclick="document.getElementById('kassa-cat-picker-overlay').remove()" style="background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px; line-height: 1;">✕</button>
        </div>

        <div style="padding: 14px 20px 10px 20px; border-bottom: 1px solid #f1f5f9; background: #ffffff;">
          <div style="position: relative;">
            <input 
              type="text" 
              id="kassa-cat-search" 
              placeholder="${isUz ? 'Qidirish (masalan: svet, gaz, ijara, oylik)...' : 'Поиск (например: свет, газ, аренда, зарплата)...'}" 
              oninput="KassaModule.filterCategoryCards(this.value)"
              style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='#2563eb'"
              onblur="this.style.borderColor='#cbd5e1'"
              autofocus
            />

          </div>
        </div>

        <div id="kassa-cat-list-container" style="padding: 16px 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 18px;">
          ${categoriesData.map(group => `
            <div class="cat-group-block">
              <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                ${group.group}
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
                ${group.items.map(item => `
                  <div 
                    class="cat-picker-item" 
                    data-key="${escapeHtml(item.key)}"
                    data-label="${escapeHtml(item.label)}"
                    data-search="${item.key.toLowerCase()} ${item.label.toLowerCase()}"
                    onclick="KassaModule.selectCategoryFromElement(this)"
                    style="padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #1e293b; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.15s;"
                    onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#3b82f6'; this.style.transform='translateY(-1px)';"
                    onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0'; this.style.transform='none';"
                  >
                    <span style="font-weight: 500;">${item.label}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => {
      const search = document.getElementById("kassa-cat-search");
      if (search) search.focus();
    }, 50);
  },

  filterCategoryCards(query) {
    const q = (query || "").toLowerCase().trim();
    const items = document.querySelectorAll(".cat-picker-item");
    items.forEach(it => {
      const s = it.getAttribute("data-search") || "";
      if (!q || s.includes(q)) {
        it.style.display = "flex";
      } else {
        it.style.display = "none";
      }
    });

    const groups = document.querySelectorAll(".cat-group-block");
    groups.forEach(g => {
      const visibleItems = g.querySelectorAll(".cat-picker-item[style*='display: flex']");
      if (visibleItems.length === 0 && q) {
        g.style.display = "none";
      } else {
        g.style.display = "block";
      }
    });
  },

  selectCategoryFromElement(el) {
    if (!el) return;
    const catKey = el.getAttribute("data-key");
    const catLabel = el.getAttribute("data-label");
    this.selectCategory(catKey, catLabel);
  },

  selectCategory(catKey, catLabel) {
    const hidden = document.getElementById("tx-category");
    const labelSpan = document.getElementById("tx-category-selected-label");
    if (hidden) hidden.value = catKey;
    if (labelSpan) labelSpan.textContent = catLabel;

    const overlay = document.getElementById("kassa-cat-picker-overlay");
    if (overlay) overlay.remove();
  },

  cachedCounterparties: [],

  selectedRegisterCurrency() {
    const sel = document.getElementById("tx-register");
    const opt = sel && sel.options[sel.selectedIndex];
    return (opt && opt.dataset.currency) || "UZS";
  },

  // The list shows the type in the current language ("Mijoz" / "Клиент"), so
  // accept the label in either language, the code or the name.
  findCounterparty(input) {
    const lower = (input || "").toLowerCase().trim();
    if (!lower) return null;
    const list = this.cachedCounterparties || [];
    const labels = c => {
      const base = `${c.code} - ${c.name}`;
      const kinds = c.type === "client" ? ["Mijoz", "Клиент"] : ["Postavshik", "Поставщик"];
      return [base, ...kinds.map(k => `${base} (${k})`)].map(s => s.toLowerCase());
    };
    return list.find(c => labels(c).includes(lower))
      || list.find(c => String(c.code).toLowerCase() === lower || c.name.toLowerCase() === lower)
      || list.find(c => labels(c)[0].includes(lower))
      || null;
  },

  async populateCounterpartiesForTx() {
    const datalist = document.getElementById("tx-cp-datalist");
    if (!datalist) return;
    try {
      const cps = await API.getCounterparties();
      this.cachedCounterparties = cps || [];
      datalist.innerHTML = this.cachedCounterparties.map(c => `
        <option value="${c.code} - ${c.name} (${c.type === 'client' ? (CURRENT_LANG === 'uz' ? 'Mijoz' : 'Клиент') : (CURRENT_LANG === 'uz' ? 'Postavshik' : 'Поставщик')})" data-id="${c.id}">
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async deleteTransaction(id, category) {
    const isUz = CURRENT_LANG === 'uz';
    const question = category === "Konvertatsiya"
      ? (isUz ? "Konvertatsiyani bekor qilasizmi? Ikkala kassadagi yozuv ham o'chadi va pul joyiga qaytadi."
              : "Отменить конвертацию? Удалятся обе записи, деньги вернутся на место.")
      : (isUz ? "Ushbu kassa tranzaksiyasini o'chirishni tasdiqlaysizmi?" : "Удалить эту кассовую транзакцию?");
    if (!confirm(question)) return;
    try {
      await API.deleteCashTransaction(id);
      showToast(isUz ? "Tranzaksiya o'chirildi" : "Транзакция удалена", "success");
      await this.loadRegisters();
      await this.loadTransactions();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
