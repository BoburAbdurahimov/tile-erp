const SalesModule = {
  finishedProductsList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏷️ ${t('mod_sotish_title')}</div>
          <button class="btn btn-primary btn-sm" onclick="SalesModule.openNewSaleModal()">➕ Yangi Sotuv (Realizatsiya)</button>
        </div>

        <div class="table-container" id="sales-table-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    await this.loadSales();
  },

  async loadSales() {
    const tableDiv = document.getElementById("sales-table-container");
    if (!tableDiv) return;

    try {
      const sales = await API.getSales();
      tableDiv.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_date')}</th>
              <th>Hujjat №</th>
              <th>Xaridor (Mijoz)</th>
              <th>Chiqarilgan Sklad</th>
              <th>Sotilgan Kafel Plitalari</th>
              <th>Jami Tushum</th>
              <th>${t('th_status')}</th>
              <th>${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => `
              <tr class="${s.status === 'Storno' ? 'storno-row' : ''}">
                <td>${s.date}</td>
                <td><strong>${s.sale_number}</strong></td>
                <td><strong>${s.client_name}</strong> (<code>${s.client_code}</code>)</td>
                <td><span class="badge badge-info">${s.warehouse_name}</span></td>
                <td>
                  <ul style="padding-left: 14px; font-size: 12px; margin: 0;">
                    ${s.items.map(it => `
                      <li>${it.material_name}: <strong>${it.quantity} ${it.unit}</strong> @ $${it.unit_price} = $${it.total_price.toLocaleString()}</li>
                    `).join("")}
                  </ul>
                </td>
                <td>
                  <strong style="color: #10b981; font-size: 14px;">
                    ${s.currency === 'USD' ? '$' : ''}${s.total_amount.toLocaleString()} ${s.currency !== 'USD' ? s.currency : ''}
                  </strong>
                </td>
                <td>
                  <span class="badge ${s.status === 'Tasdiqlandi' ? 'badge-success' : 'badge-danger'}">
                    ${s.status}
                  </span>
                </td>
                <td>
                  ${s.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-storno btn-sm" onclick="SalesModule.stornoSale(${s.id}, '${s.sale_number}')">
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

  async openNewSaleModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    const [clients, materials, warehouses] = await Promise.all([
      API.getCounterparties("client"),
      API.getMaterials("Tayyor mahsulot"),
      API.getWarehouses()
    ]);

    this.finishedProductsList = materials;

    showModal(
      "Yangi Sotuv (Realizatsiya) hujjati rasmiylashtirish",
      `
        <form id="new-sale-form">
          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label class="form-label">Xaridor (Mijoz) *</label>
              <select id="sale-client" class="form-control" required>
                ${clients.map(c => `<option value="${c.id}">${c.code} - ${c.name} (${c.region})</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Sana *</label>
              <input type="date" id="sale-date" class="form-control" value="${todayStr}" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label class="form-label">Chiqariladigan Sklad *</label>
              <select id="sale-warehouse" class="form-control" required>
                ${warehouses.map(w => `<option value="${w.id}" ${w.id === 1 ? 'selected' : ''}>${w.name}</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Valyuta *</label>
              <select id="sale-currency" class="form-control" required>
                <option value="USD">USD ($)</option>
                <option value="UZS">UZS (So'm)</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 14px; margin-bottom: 0;">🧱 Sotilayotgan kafel mahsulotlari:</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SalesModule.addSaleItemRow()">+ Mahsulot qo'shish</button>
          </div>

          <table class="basket-table" id="sale-basket-table">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <th>Kafel Plitasi</th>
                <th>Miqdor (m²)</th>
                <th>Sotuv narxi ($/m²)</th>
                <th>Summa</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody id="sale-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">${t('th_description')}</label>
            <textarea id="sale-desc" class="form-control" rows="2" placeholder="Shartnoma raqami, chegirma (skidka) yoki izoh..."></textarea>
          </div>
        </form>
      `,
      async () => {
        const cliId = parseInt(document.getElementById("sale-client").value);
        const d = document.getElementById("sale-date").value;
        const whId = parseInt(document.getElementById("sale-warehouse").value);
        const curr = document.getElementById("sale-currency").value;
        const desc = document.getElementById("sale-desc").value.trim();

        const items = [];
        const rows = document.querySelectorAll("#sale-rows-body tr");
        rows.forEach(tr => {
          const matId = parseInt(tr.querySelector(".row-mat").value);
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);
          if (matId && qty > 0 && price > 0) {
            items.push({ material_id: matId, quantity: qty, unit_price: price });
          }
        });

        if (items.length === 0) {
          showToast("Kamida bitta mahsulot va uning sotuv narxini kiriting!", "warning");
          return false;
        }

        try {
          await API.createSale({
            client_id: cliId,
            warehouse_id: whId,
            date: d,
            currency: curr,
            items,
            description: desc
          });
          showToast("Sotuv hujjati muvaffaqiyatli saqlandi va ombor qoldig'i kamaytirildi!", "success");
          await SalesModule.loadSales();
          return true;
        } catch (err) {
          showToast(err.message, "error");
          return false;
        }
      },
      "modal-lg"
    );

    this.addSaleItemRow();
  },

  addSaleItemRow() {
    const tbody = document.getElementById("sale-rows-body");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <select class="form-control row-mat" style="font-size: 13px;">
          ${this.finishedProductsList.map(m => `<option value="${m.id}">${m.code} - ${m.name} (${m.unit})</option>`).join("")}
        </select>
      </td>
      <td>
        <input type="number" step="any" class="form-control row-qty" value="500" style="font-size: 13px;" oninput="SalesModule.calcRowTotal(this)" required />
      </td>
      <td>
        <input type="number" step="any" class="form-control row-price" value="8.50" style="font-size: 13px;" oninput="SalesModule.calcRowTotal(this)" required />
      </td>
      <td>
        <input type="text" class="form-control row-total" value="$4,250.00" style="font-size: 13px; background: #f8fafc; font-weight: 700;" readonly />
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

  async stornoSale(id, sNum) {
    if (!confirm(`${sNum} sotuvini STORNO qilishni tasdiqlaysizmi?\nOmbordagi tovarlar qaytariladi va mijoz balansi tiklanadi.`)) {
      return;
    }

    try {
      await API.stornoSale(id);
      showToast(t('msg_storno_ok'), "success");
      await this.loadSales();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
};
