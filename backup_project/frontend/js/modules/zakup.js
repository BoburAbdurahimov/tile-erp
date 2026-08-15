const PurchasesModule = {
  rawMaterialsList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🛒 ${t('mod_zakup_title')}</div>
          <button class="btn btn-primary btn-sm" onclick="PurchasesModule.openNewPurchaseModal()">➕ Yangi Xarid (Zakup)</button>
        </div>

        <div class="table-container" id="purchases-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadPurchases();
  },

  async loadPurchases() {
    const tableDiv = document.getElementById("purchases-table-container");
    if (!tableDiv) return;

    try {
      const purchases = await API.getPurchases();
      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_date')}</th>
              <th>Hujjat №</th>
              <th>Yetkazib beruvchi (Postavshik)</th>
              <th>Qabul qiluvchi Sklad</th>
              <th>Tovarlar ro'yxati</th>
              <th>Jami Summa</th>
              <th>${t('th_status')}</th>
              <th>${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.map(p => `
              <tr class="${p.status === 'Storno' ? 'storno-row' : ''}">
                <td>${p.date}</td>
                <td><strong>${p.purchase_number}</strong></td>
                <td><strong>${p.supplier_name}</strong> (<code>${p.supplier_code}</code>)</td>
                <td><span class="badge badge-info">${p.warehouse_name}</span></td>
                <td>
                  <ul style="padding-left: 14px; font-size: 12px; margin: 0;">
                    ${p.items.map(it => `
                      <li>${it.material_name}: <strong>${it.quantity} ${it.unit}</strong> @ $${it.unit_price} = $${it.total_price.toLocaleString()}</li>
                    `).join("")}
                  </ul>
                </td>
                <td>
                  <strong style="color: #ef4444; font-size: 14px;">
                    ${p.currency === 'USD' ? '$' : ''}${p.total_amount.toLocaleString()} ${p.currency !== 'USD' ? p.currency : ''}
                  </strong>
                </td>
                <td>
                  <span class="badge ${p.status === 'Tasdiqlandi' ? 'badge-success' : 'badge-danger'}">
                    ${p.status}
                  </span>
                </td>
                <td>
                  ${p.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="PurchasesModule.stornoPurchase(${p.id}, '${p.purchase_number}')">
                      ↩️ ${t('btn_storno')}
                    </button>
                  ` : '<span style="color: #94a3b8; font-size: 12px;">Stornolangan</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      showToast(e.message, "error");
    }
  },

  async openNewPurchaseModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [suppliers, materials, warehouses] = await Promise.all([
      API.getCounterparties("supplier"),
      API.getMaterials(),
      API.getWarehouses()
    ]);

    this.rawMaterialsList = materials;

    showModal(
      "Yangi Xarid (Zakup) hujjati rasmiylashtirish",
      `
        <form id="new-purchase-form">
          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label class="form-label">Yetkazib beruvchi (Postavshik) *</label>
              <select id="pur-supplier" class="form-control" required>
                ${suppliers.map(s => `<option value="${s.id}">${s.code} - ${s.name} (${s.region})</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Sana *</label>
              <input type="date" id="pur-date" class="form-control" value="${todayStr}" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label class="form-label">Qabul qiluvchi Sklad *</label>
              <select id="pur-warehouse" class="form-control" required>
                ${warehouses.map(w => `<option value="${w.id}" ${w.id === 2 ? 'selected' : ''}>${w.name}</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Valyuta *</label>
              <select id="pur-currency" class="form-control" required>
                <option value="USD">USD ($)</option>
                <option value="UZS">UZS (So'm)</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 14px; margin-bottom: 0;">📦 Xarid qilinayotgan tovarlar ro'yxati:</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="PurchasesModule.addPurchaseItemRow()">+ Tovar qo'shish</button>
          </div>

          <table class="basket-table" id="pur-basket-table">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <th>Material / Tovar</th>
                <th>Miqdor</th>
                <th>Narx (Dona/Kg)</th>
                <th>Summa</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody id="pur-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">${t('th_description')}</label>
            <textarea id="pur-desc" class="form-control" rows="2" placeholder="Faktura raqami va qo'shimcha shartlar..."></textarea>
          </div>
        </form>
      `,
      async () => {
        const supId = parseInt(document.getElementById("pur-supplier").value);
        const d = document.getElementById("pur-date").value;
        const whId = parseInt(document.getElementById("pur-warehouse").value);
        const curr = document.getElementById("pur-currency").value;
        const desc = document.getElementById("pur-desc").value.trim();

        const items = [];
        const rows = document.querySelectorAll("#pur-rows-body tr");
        rows.forEach(tr => {
          const matId = parseInt(tr.querySelector(".row-mat").value);
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);
          if (matId && qty > 0 && price > 0) {
            items.push({ material_id: matId, quantity: qty, unit_price: price });
          }
        });

        if (items.length === 0) {
          showToast("Kamida bitta tovar va uning narxini kiriting!", "warning");
          return false;
        }

        try {
          await API.createPurchase({
            supplier_id: supId,
            warehouse_id: whId,
            date: d,
            currency: curr,
            items,
            description: desc
          });
          showToast("Xarid hujjati muvaffaqiyatli saqlandi va ombor qoldig'i (AVG narxi) yangilandi!", "success");
          await PurchasesModule.loadPurchases();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    this.addPurchaseItemRow();
  },

  addPurchaseItemRow() {
    const tbody = document.getElementById("pur-rows-body");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <select class="form-control row-mat" style="font-size: 13px;">
          ${this.rawMaterialsList.map(m => `<option value="${m.id}">${m.code} - ${m.name} (${m.unit})</option>`).join("")}
        </select>
      </td>
      <td>
        <input type="number" step="any" class="form-control row-qty" value="1000" style="font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
      </td>
      <td>
        <input type="number" step="any" class="form-control row-price" value="0.10" style="font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
      </td>
      <td>
        <input type="text" class="form-control row-total" value="$100.00" style="font-size: 13px; background: #f8fafc; font-weight: 700;" readonly />
      </td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('tr').remove()">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  calcRowTotal(input) {
    const tr = input.closest("tr");
    const qty = parseFloat(tr.querySelector(".row-qty").value) || 0;
    const price = parseFloat(tr.querySelector(".row-price").value) || 0;
    tr.querySelector(".row-total").value = `$${(qty * price).toLocaleString()}`;
  },

  async stornoPurchase(id, pNum) {
    if (!confirm(`${pNum} xaridini STORNO qilishni tasdiqlaysizmi?\nOmbordagi tovarlar qaytarib olinadi va ta'minotchi balansi tiklanadi.`)) {
      return;
    }

    try {
      await API.stornoPurchase(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadPurchases();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
