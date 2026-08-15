const PurchasesModule = {
  rawMaterialsList: [],
  suppliersList: [],

  async render(container) {
    container.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>🛒</span> <span>${t('mod_zakup_title')}</span>
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              Xomashyo va materiallar xaridi (tovar tanlash yoki qidirib yozish imkoniyati bilan)
            </p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="PurchasesModule.openNewPurchaseModal()" style="display: flex; align-items: center; gap: 6px;">
            <span>➕</span> <span>Yangi Xarid (Zakup)</span>
          </button>
        </div>

        <div class="table-container" id="purchases-table-container">
          <div style="text-align: center; padding: 40px; color: #94a3b8;">${CURRENT_LANG === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}</div>
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
      if (!purchases || purchases.length === 0) {
        tableDiv.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #64748b;">
            <div style="font-size: 40px; margin-bottom: 10px;">📦</div>
            <h3>Hozircha xarid hujjatlari mavjud emas</h3>
            <p>Yangi xarid qo'shish uchun yuqoridagi tugmani bosing</p>
          </div>
        `;
        return;
      }

      tableDiv.innerHTML = `
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 12px 14px;">${t('th_date')}</th>
              <th style="padding: 12px 14px;">Hujjat №</th>
              <th style="padding: 12px 14px;">Yetkazib beruvchi (Postavshik)</th>
              <th style="padding: 12px 14px;">Qabul qiluvchi Sklad</th>
              <th style="padding: 12px 14px;">Tovarlar ro'yxati</th>
              <th style="padding: 12px 14px;">Jami Summa</th>
              <th style="padding: 12px 14px;">${t('th_status')}</th>
              <th style="padding: 12px 14px; text-align: right;">${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.map(p => `
              <tr class="${p.status === 'Storno' ? 'storno-row' : ''}" style="border-bottom: 1px solid #f1f5f9; ${p.status === 'Storno' ? 'opacity: 0.6; background: #fff1f2;' : ''}">
                <td style="padding: 12px 14px;">${p.date}</td>
                <td style="padding: 12px 14px;"><code>${p.purchase_number}</code></td>
                <td style="padding: 12px 14px;"><strong>${p.supplier_name}</strong> (<code>${p.supplier_code}</code>)</td>
                <td style="padding: 12px 14px;"><span class="badge" style="background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${p.warehouse_name}</span></td>
                <td style="padding: 12px 14px;">
                  <ul style="padding-left: 14px; font-size: 12px; margin: 0; color: #334155;">
                    ${p.items.map(it => `
                      <li>${it.material_name}: <strong>${it.quantity} ${it.unit}</strong> @ $${it.unit_price} = $${it.total_price.toLocaleString()}</li>
                    `).join("")}
                  </ul>
                </td>
                <td style="padding: 12px 14px;">
                  <strong style="color: #ef4444; font-size: 14px;">
                    ${p.currency === 'USD' ? '$' : ''}${p.total_amount.toLocaleString()} ${p.currency !== 'USD' ? p.currency : ''}
                  </strong>
                </td>
                <td style="padding: 12px 14px;">
                  <span class="badge" style="background: ${p.status === 'Tasdiqlandi' ? '#dcfce7' : '#fee2e2'}; color: ${p.status === 'Tasdiqlandi' ? '#166534' : '#991b1b'}; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                    ${p.status}
                  </span>
                </td>
                <td style="padding: 12px 14px; text-align: right;">
                  ${p.status === 'Tasdiqlandi' ? `
                    <button class="btn btn-sm" onclick="PurchasesModule.stornoPurchase(${p.id}, '${p.purchase_number}')" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
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

    this.suppliersList = suppliers || [];
    this.rawMaterialsList = materials || [];

    const defaultSupplier = this.suppliersList[0];
    const defaultSupplierText = defaultSupplier ? `${defaultSupplier.code} - ${defaultSupplier.name} (${defaultSupplier.region || ''})` : "";

    showModal(
      "Yangi Xarid (Zakup) hujjati rasmiylashtirish",
      `
        <form id="new-purchase-form">
          <!-- Datalists for Autocomplete & Search -->
          <datalist id="pur-suppliers-datalist">
            ${this.suppliersList.map(s => `<option value="${s.code} - ${s.name} (${s.region || ''})" data-id="${s.id}">${s.code} - ${s.name}</option>`).join("")}
          </datalist>

          <datalist id="pur-materials-datalist">
            ${this.rawMaterialsList.map(m => `<option value="${m.code} - ${m.name} (${m.unit})" data-id="${m.id}" data-price="${m.current_avg_price_usd || 0}">${m.code} - ${m.name}</option>`).join("")}
          </datalist>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                Yetkazib beruvchi (Postavshik) * <span style="font-weight: 400; color: #2563eb; font-size: 11px;">(qidirib yozing yoki tanlang)</span>
              </label>
              <input 
                type="text" 
                id="pur-supplier-input" 
                list="pur-suppliers-datalist" 
                class="form-control" 
                placeholder="🔍 Kod yoki nom yozing (masalan: 10001 yoki Navoiy)..." 
                value="${defaultSupplierText}"
                style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"
                required 
              />
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Sana *</label>
              <input type="date" id="pur-date" class="form-control" value="${todayStr}" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 16px;">
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Qabul qiluvchi Sklad *</label>
              <select id="pur-warehouse" class="form-control" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                ${warehouses.map(w => `<option value="${w.id}" ${w.id === 2 ? 'selected' : ''}>${w.name}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Valyuta *</label>
              <select id="pur-currency" class="form-control" style="width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;" required>
                <option value="USD">USD ($)</option>
                <option value="UZS">UZS (So'm)</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 18px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 0;">
              📦 Xarid qilinayotgan tovarlar ro'yxati:
            </label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="PurchasesModule.addPurchaseItemRow()" style="font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              + Tovar qo'shish
            </button>
          </div>

          <table class="basket-table" id="pur-basket-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
                <th style="padding: 8px 10px; text-align: left; width: 42%;">Material / Tovar (Qidirib yozing)</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">Miqdor</th>
                <th style="padding: 8px 10px; text-align: left; width: 18%;">Narx (Dona/Kg)</th>
                <th style="padding: 8px 10px; text-align: left; width: 16%;">Summa</th>
                <th style="padding: 8px 10px; text-align: center; width: 6%;">Amal</th>
              </tr>
            </thead>
            <tbody id="pur-rows-body">
              <!-- Dynamic rows added here -->
            </tbody>
          </table>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">${t('th_description')}</label>
            <textarea id="pur-desc" class="form-control" rows="2" placeholder="Faktura raqami, to'lov shartlari yoki qo'shimcha izoh..." style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;"></textarea>
          </div>
        </form>
      `,
      async () => {
        const supInput = document.getElementById("pur-supplier-input").value.trim();
        const d = document.getElementById("pur-date").value;
        const whId = parseInt(document.getElementById("pur-warehouse").value);
        const curr = document.getElementById("pur-currency").value;
        const desc = document.getElementById("pur-desc").value.trim();

        // Resolve supplier
        const matchedSupplier = PurchasesModule.findSupplierByInput(supInput);
        if (!matchedSupplier) {
          showToast("Iltimos, ro'yxatdan to'g'ri Yetkazib beruvchini tanlang yoki yozing!", "error");
          return false;
        }

        const items = [];
        const rows = document.querySelectorAll("#pur-rows-body tr");
        for (const tr of rows) {
          const matInput = tr.querySelector(".row-mat-input").value.trim();
          const qty = parseFloat(tr.querySelector(".row-qty").value);
          const price = parseFloat(tr.querySelector(".row-price").value);

          const matchedMat = PurchasesModule.findMaterialByInput(matInput);
          if (matchedMat && qty > 0 && price >= 0) {
            items.push({ material_id: matchedMat.id, quantity: qty, unit_price: price });
          }
        }

        if (items.length === 0) {
          showToast("Kamida bitta tovar va uning miqdori/narxini to'g'ri kiriting!", "warning");
          return false;
        }

        try {
          await API.createPurchase({
            supplier_id: matchedSupplier.id,
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

  findSupplierByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.suppliersList.find(s => {
      const full = `${s.code} - ${s.name} (${s.region || ''})`.toLowerCase();
      return full === lower || s.code.toLowerCase() === lower || s.name.toLowerCase() === lower || full.includes(lower);
    }) || this.suppliersList[0];
  },

  findMaterialByInput(inputVal) {
    if (!inputVal) return null;
    const lower = inputVal.toLowerCase().trim();
    return this.rawMaterialsList.find(m => {
      const full = `${m.code} - ${m.name} (${m.unit})`.toLowerCase();
      return full === lower || m.code.toLowerCase() === lower || m.name.toLowerCase() === lower || full.includes(lower);
    }) || this.rawMaterialsList[0];
  },

  addPurchaseItemRow() {
    const tbody = document.getElementById("pur-rows-body");
    if (!tbody) return;

    const defaultMat = this.rawMaterialsList[0];
    const defaultMatText = defaultMat ? `${defaultMat.code} - ${defaultMat.name} (${defaultMat.unit})` : "";
    const defaultPrice = defaultMat ? (defaultMat.current_avg_price_usd || 0.10) : 0.10;

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 6px 8px;">
        <input 
          type="text" 
          list="pur-materials-datalist" 
          class="form-control row-mat-input" 
          placeholder="🔍 Tovar kodi yoki nomi..." 
          value="${defaultMatText}" 
          style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;"
          onchange="PurchasesModule.onMatInputChange(this)"
          required 
        />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-qty" value="1000" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
      </td>
      <td style="padding: 6px 8px;">
        <input type="number" step="any" class="form-control row-price" value="${defaultPrice.toFixed(2)}" style="width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" oninput="PurchasesModule.calcRowTotal(this)" required />
      </td>
      <td style="padding: 6px 8px;">
        <input type="text" class="form-control row-total" value="$${(1000 * defaultPrice).toLocaleString()}" style="width: 100%; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #f8fafc; font-weight: 700;" readonly />
      </td>
      <td style="padding: 6px 8px; text-align: center;">
        <button type="button" class="btn btn-sm" onclick="this.closest('tr').remove()" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer;">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
    this.calcRowTotal(tr.querySelector(".row-qty"));
  },

  onMatInputChange(input) {
    const matched = this.findMaterialByInput(input.value);
    if (matched) {
      const tr = input.closest("tr");
      if (matched.current_avg_price_usd && matched.current_avg_price_usd > 0) {
        tr.querySelector(".row-price").value = matched.current_avg_price_usd.toFixed(2);
      }
      this.calcRowTotal(input);
    }
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
