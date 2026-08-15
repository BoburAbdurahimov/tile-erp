const KassaModule = {
  async render(container) {
    container.innerHTML = `
      <div class="grid-2">
        <!-- Cash Registers Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">💵 ${t('mod_kassa_title')}</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-success btn-sm" onclick="KassaModule.openTransactionModal('kirim')">📥 Kirim (Приход)</button>
              <button class="btn btn-danger btn-sm" onclick="KassaModule.openTransactionModal('chiqim')">📤 Chiqim (Расход)</button>
            </div>
          </div>
          <div id="kassa-registers-container" style="display: flex; flex-direction: column; gap: 14px;">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Exchange Rate & CBU Integration Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📈 Valyuta kursi & Markaziy Bank (CBU)</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="KassaModule.syncCbuLive()">🔄 CBU dan olish</button>
              <button class="btn btn-warning btn-sm" onclick="KassaModule.openRateModal()">✏️ ${t('rate_edit')}</button>
            </div>
          </div>
          <div id="kassa-rates-container">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>

      <!-- Cash Transactions Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📑 Kassa operatsiyalari tarixi (Kirim & Chiqim)</div>
          <div style="display: flex; gap: 10px;">
            <select id="kassa-type-filter" class="form-control" style="width: 140px;" onchange="KassaModule.loadTransactions()">
              <option value="">Barcha turlar</option>
              <option value="kirim">Kirim (Kassaga)</option>
              <option value="chiqim">Chiqim (Kassadan)</option>
            </select>
            <select id="kassa-category-filter" class="form-control" style="width: 220px;" onchange="KassaModule.loadTransactions()">
              <option value="">Barcha kategoriyalar</option>
              <option value="bilvosita_xarajatlar">⚡ Bilvosita (Zavod/Tsex)</option>
              <option value="admin_prochee">🏢 Admin & Boshqa</option>
              <option value="mijoz_tolovi">👤 Mijoz to'lovi</option>
              <option value="postavshik_tolovi">🚚 Postavshik to'lovi</option>
            </select>
          </div>
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
      div.innerHTML = registers.map(r => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 16px; font-weight: 700;">${r.name}</div>
            <div style="font-size: 12px; color: #64748b;">${r.description || ''}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 22px; font-weight: 800; color: ${r.currency === 'USD' ? '#10b981' : '#2563eb'};">
              ${r.currency === 'USD' ? '$' + r.balance.toLocaleString() : r.balance.toLocaleString() + ' UZS'}
            </div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 500;">
              ≈ ${r.currency === 'USD' ? r.balance_in_other_currency.toLocaleString() + ' UZS' : '$' + r.balance_in_other_currency.toLocaleString()}
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
      const latest = rates[0] || { rate_usd_uzs: 12850, date: "Bugun", is_manual_override: false };

      div.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px 20px; border-radius: 12px; margin-bottom: 16px;">
          <div>
            <span style="font-size: 12px; color: #1e40af; font-weight: 600; text-transform: uppercase;">Joriy rasmiy kurs (1 USD)</span>
            <div style="font-size: 26px; font-weight: 800; color: #1d4ed8;">${latest.rate_usd_uzs.toLocaleString()} UZS</div>
          </div>
          <div>
            <span class="badge ${latest.is_manual_override ? 'badge-warning' : 'badge-success'}">
              ${latest.is_manual_override ? "Qo'lda kiritilgan (Manual)" : "CBU API (Avtomatik)"}
            </span>
          </div>
        </div>
        <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 8px;">So'nggi sanalar kursi:</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${rates.slice(0, 4).map(r => `
            <span class="badge badge-primary" style="font-size: 12px; padding: 6px 10px;">
              ${r.date}: <strong>${r.rate_usd_uzs.toLocaleString()} UZS</strong>
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

    const type = document.getElementById("kassa-type-filter")?.value || "";
    const category = document.getElementById("kassa-category-filter")?.value || "";

    try {
      const txs = await API.getCashTransactions(null, type, category);
      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_date')}</th>
              <th>Kassa</th>
              <th>Turi</th>
              <th>Kategoriya</th>
              <th>Kontragent</th>
              <th>Summa</th>
              <th>${t('th_description')}</th>
            </tr>
          </thead>
          <tbody>
            ${txs.map(tx => `
              <tr>
                <td>${tx.date}</td>
                <td><strong>${tx.register_name}</strong></td>
                <td>
                  <span class="badge ${tx.type === 'kirim' ? 'badge-success' : 'badge-danger'}">
                    ${tx.type === 'kirim' ? '📥 Kirim' : '📤 Chiqim'}
                  </span>
                </td>
                <td><span class="badge badge-info">${tx.category}</span></td>
                <td>${tx.counterparty_name || '-'}</td>
                <td>
                  <strong style="color: ${tx.type === 'kirim' ? '#10b981' : '#ef4444'};">
                    ${tx.type === 'kirim' ? '+' : '-'}${tx.currency === 'USD' ? '$' : ''}${tx.amount.toLocaleString()} ${tx.currency !== 'USD' ? tx.currency : ''}
                  </strong>
                </td>
                <td>${tx.description || '-'}</td>
              </tr>
            `).join("")}
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
      showToast(`CBU kursi yangilandi: 1 USD = ${res.rate_usd_uzs.toLocaleString()} UZS`, "success");
      await this.loadRates();
      await this.loadRegisters();
      updateHeaderFxRate();
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  openRateModal() {
    if (CURRENT_ROLE !== "Admin") {
      showToast("Valyuta kursini o'zgartirish faqat Admin uchun ruxsat etilgan!", "error");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    showModal(
      "Valyuta kursini qo'lda kiritish (Manual Override)",
      `
        <form id="rate-override-form">
          <div class="form-group">
            <label class="form-label">Sana *</label>
            <input type="date" id="rate-date" class="form-control" value="${todayStr}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Yangi kurs (1 USD = ? UZS) *</label>
            <input type="number" step="any" id="rate-val" class="form-control" placeholder="12850" required />
          </div>
        </form>
      `,
      async () => {
        const d = document.getElementById("rate-date").value;
        const r = parseFloat(document.getElementById("rate-val").value);
        if (!d || isNaN(r) || r <= 0) {
          showToast("Iltimos, to'g'ri kurs qiymatini kiriting!", "warning");
          return false;
        }

        try {
          await API.setExchangeRate({ date: d, rate_usd_uzs: r, is_manual_override: true });
          showToast("Kurs muvaffaqiyatli saqlandi!", "success");
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

  openTransactionModal(type) {
    const isKirim = type === "kirim";
    const title = isKirim ? "Kassaga Kirim qilish (+)" : "Kassadan Chiqim qilish (-)";
    const todayStr = new Date().toISOString().split("T")[0];

    showModal(
      title,
      `
        <form id="kassa-tx-form">
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Qaysi Kassa? *</label>
              <select id="tx-register" class="form-control" required onchange="KassaModule.updateCurrencyFromRegister()">
                <option value="1">Kassa USD ($)</option>
                <option value="2">Kassa UZS (So'm)</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Sana *</label>
              <input type="date" id="tx-date" class="form-control" value="${todayStr}" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Summa *</label>
              <input type="number" step="any" id="tx-amount" class="form-control" placeholder="0.00" required />
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Kategoriya *</label>
              <select id="tx-category" class="form-control" required>
                ${isKirim ? `
                  <optgroup label="📥 Kirim turlari">
                    <option value="Mijoz to'lovi">👤 Mijoz to'lovi (Debitorlik yopilishi)</option>
                    <option value="Postavshikdan qaytgan pul">🚚 Postavshikdan qaytgan pul</option>
                    <option value="Asoschidan investitsiya">💼 Asoschidan investitsiya / Pul kiritish</option>
                    <option value="Boshqa kirim">💰 Boshqa daromadlar va kirimlar</option>
                  </optgroup>
                ` : `
                  <optgroup label="⚡ Bilvosita ishlab chiqarish xarajatlari (Zavod/Tsex)">
                    <option value="Elektr energiya (Svet)">⚡ Elektr energiya (Svet)</option>
                    <option value="Tabiiy gaz">🔥 Tabiiy gaz</option>
                    <option value="Suv va kanalizatsiya">💧 Suv va kanalizatsiya</option>
                    <option value="Uskunalar ta'miri va ehtiyot qismlar">🛠️ Uskunalar ta'miri va ehtiyot qismlar</option>
                    <option value="Sex ijarasi va xizmatlar">🏭 Sex ijarasi va xizmatlar</option>
                    <option value="Transport va yoqilg'i">🚚 Transport va yoqilg'i</option>
                    <option value="Ishchilar oyligi / Avans">👥 Ishchilar oyligi / Avans</option>
                    <option value="Boshqa sex xarajatlari">📦 Boshqa sex xarajatlari</option>
                  </optgroup>
                  <optgroup label="🏢 Ma'muriyat va boshqaruv xarajatlari">
                    <option value="Ofis ijarasi">🏢 Ofis ijarasi</option>
                    <option value="Aloqa, Internet va IT">💻 Aloqa, Internet va IT xizmatlar</option>
                    <option value="Buxgalteriya va audit">📑 Buxgalteriya va konsalting</option>
                    <option value="Reklama va marketing">📢 Reklama va marketing</option>
                    <option value="Soliqlar va davlat bojlari">🏛️ Soliqlar va davlat bojlari</option>
                    <option value="Ofis va xo'jalik xarajatlari">☕ Ofis va xo'jalik xarajatlari</option>
                    <option value="Boshqa ma'muriy xarajatlar">📁 Boshqa ma'muriy xarajatlar</option>
                  </optgroup>
                  <optgroup label="🚚 Kontragentlar va boshqa to'lovlar">
                    <option value="Postavshikka to'lov">🚚 Postavshikka to'lov (Qarzni to'lash)</option>
                    <option value="Boshqa chiqim">💼 Boshqa chiqimlar</option>
                  </optgroup>
                `}
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
              Bog'langan Kontragent <span style="font-weight: 400; color: #2563eb; font-size: 11px;">(qidirib yozing yoki tanlang, ixtiyoriy)</span>
            </label>
            <input 
              type="text" 
              id="tx-counterparty-input" 
              list="tx-cp-datalist" 
              class="form-control" 
              placeholder="🔍 Kod yoki nom yozing (masalan: 10001 yoki Ali)..." 
              style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
            />
            <datalist id="tx-cp-datalist"></datalist>
          </div>
          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')} (Ixtiyoriy)</label>
            <textarea id="tx-desc" class="form-control" rows="2" placeholder="To'lov maqsadi yoki izoh yozing..." style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const regId = parseInt(document.getElementById("tx-register").value);
        const d = document.getElementById("tx-date").value;
        const amt = parseFloat(document.getElementById("tx-amount").value);
        const cat = document.getElementById("tx-category").value;
        const cpInput = document.getElementById("tx-counterparty-input").value.trim();
        const desc = document.getElementById("tx-desc").value.trim();

        if (!regId || isNaN(amt) || amt <= 0) {
          showToast("Iltimos, summani to'g'ri kiriting!", "warning");
          return false;
        }

        let cpId = null;
        if (cpInput && KassaModule.cachedCounterparties) {
          const lower = cpInput.toLowerCase();
          const matched = KassaModule.cachedCounterparties.find(c => {
            const full = `${c.code} - ${c.name} (${c.type === 'client' ? 'Mijoz' : 'Postavshik'})`.toLowerCase();
            return full === lower || c.code.toLowerCase() === lower || c.name.toLowerCase() === lower || full.includes(lower);
          });
          if (matched) cpId = matched.id;
        }

        const currency = regId === 1 ? "USD" : "UZS";

        try {
          await API.createCashTransaction({
            register_id: regId,
            date: d,
            transaction_type: isKirim ? "Kirim" : "Chiqim",
            category: cat,
            amount: amt,
            currency: currency,
            counterparty_id: cpId,
            description: desc
          });
          showToast("Kassa operatsiyasi muvaffaqiyatli saqlandi!", "success");
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
  },

  cachedCounterparties: [],

  async populateCounterpartiesForTx() {
    const datalist = document.getElementById("tx-cp-datalist");
    if (!datalist) return;
    try {
      const cps = await API.getCounterparties();
      this.cachedCounterparties = cps || [];
      datalist.innerHTML = this.cachedCounterparties.map(c => `
        <option value="${c.code} - ${c.name} (${c.type === 'client' ? 'Mijoz' : 'Postavshik'})" data-id="${c.id}">
      `).join("");
    } catch (e) {
      console.error(e);
    }
  }
};
