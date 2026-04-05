// ============================================
// 📦 SHIPPING DASHBOARD - JAVASCRIPT
// ============================================

const API_BASE = window.location.origin;
let authToken = localStorage.getItem("authToken");
let currentUsername = localStorage.getItem("username");
let allOrders = [];
let filteredOrders = [];

// ============== UTILITIES ==============

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format date to locale string
 */
function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Show error message
 */
function showError(msg) {
  const el = document.getElementById("message");
  if (!el) return;
  el.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
  setTimeout(() => {
    if (el) el.innerHTML = "";
  }, 5000);
}

/**
 * Show success message
 */
function showSuccess(msg) {
  const el = document.getElementById("message");
  if (!el) return;
  el.innerHTML = `<div class="success">${escapeHtml(msg)}</div>`;
  setTimeout(() => {
    if (el) el.innerHTML = "";
  }, 3000);
}

// ============== AUTHENTICATION ==============

/**
 * Handle logout
 */
function handleLogout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("username");
  window.location.href = "/login.html";
}

// ============== DATA LOADING ==============

/**
 * Load orders from API
 */
async function loadOrders() {
  if (!authToken) {
    showError("لا توجد جلسة نشطة");
    return;
  }

  try {
    const [ordersRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
      fetch(`${API_BASE}/orders/summary`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    ]);

    if (ordersRes.status === 401 || statsRes.status === 401) {
      handleLogout();
      return;
    }

    if (!ordersRes.ok || !statsRes.ok) {
      throw new Error(`API Error: ${ordersRes.status} / ${statsRes.status}`);
    }

    const orders = await ordersRes.json();
    const stats = await statsRes.json();

    if (!orders || !stats) {
      throw new Error("Invalid response from server");
    }

    allOrders = Array.isArray(orders.orders) ? orders.orders : [];
    filteredOrders = [...allOrders];

    renderStats(stats);
    renderOrders(filteredOrders);
  } catch (err) {
    console.error("Load error:", err);
    showError("خطأ في تحميل الطلبات: " + err.message);
  }
}

// ============== RENDERING ==============

/**
 * Render statistics cards
 */
function renderStats(stats) {
  const statsContainer = document.getElementById("stats");
  if (!statsContainer) return;

  const html = `
    <div class="stat-card">
      <div class="stat-number">${stats.pending || 0}</div>
      <div class="stat-label">🔔 طلبات معلقة</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.processed || 0}</div>
      <div class="stat-label">✅ تم الإرسال</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${(stats.totalPendingValue || 0).toFixed(2)} ₪</div>
      <div class="stat-label">💰 قيمة المعلقة</div>
    </div>
  `;
  statsContainer.innerHTML = html;
}

/**
 * Render orders list with accordions
 */
function renderOrders(orders) {
  const ordersContainer = document.getElementById("orders");
  if (!ordersContainer) return;

  if (!orders || orders.length === 0) {
    ordersContainer.innerHTML =
      '<div class="empty">📭 لا توجد طلبات معلقة</div>';
    return;
  }

  const html = orders
    .map((order, index) => createOrderCard(order, index))
    .join("");

  ordersContainer.innerHTML = html;
}

/**
 * Create single order card HTML with accordion
 */
function createOrderCard(order, index) {
  if (!order) return "";

  const customer = order.customer || {};
  const shipping = order.shipping_address || {};
  const customerName = escapeHtml(
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
      "Unknown",
  );

  const products = (order.line_items || [])
    .map((item) => `• ${escapeHtml(item.name)} × ${item.quantity}`)
    .join("<br>");

  const discounts =
    (order.discount_codes || [])
      .map((d) => `${escapeHtml(d.code)} (-${d.amount})`)
      .join(", ") || "لا يوجد";

  const productsTotal = order.subtotal_price || 0;
  const shippingCost = order.total_shipping_price_set?.shop_money?.amount || 0;
  const totalPrice = order.total_price || 0;

  return `
    <div class="order-card">
      <div class="order-header">
        <div>
          <div class="order-id">#${escapeHtml(String(order.order_number || order.id))}</div>
          <div class="order-time">${formatDate(order.created_at || order.addedAt)}</div>
        </div>
      </div>

      <div class="order-details">
        <div>
          <div class="detail-label">👤 العميل</div>
          <div class="detail-value">${customerName}</div>
        </div>
        <div>
          <div class="detail-label">📞 الهاتف</div>
          <div class="detail-value">${escapeHtml(shipping.phone || "N/A")}</div>
        </div>
        <div>
          <div class="detail-label">💵 الإجمالي</div>
          <div class="detail-value">${parseFloat(totalPrice).toFixed(2)} ₪</div>
        </div>
        <div>
          <div class="detail-label">📍 العنوان</div>
          <div class="detail-value">${escapeHtml((shipping.address1 || "N/A").substring(0, 30))}...</div>
        </div>
      </div>

      <div class="order-actions">
        <button class="toggle-btn" onclick="toggleAccordion(${index}, this)">📂 عرض التفاصيل</button>
        <button class="btn-whatsapp" onclick="sendWhatsApp('${order.id}', '972')">📱 WhatsApp (972)</button>
        <button class="btn-whatsapp-alt" onclick="sendWhatsApp('${order.id}', '970')">📱 WhatsApp (970)</button>
        <button class="btn-ship" onclick="shipOrder('${order.id}')">✅ شحن الآن</button>
        <button class="btn-skip" onclick="skipOrder('${order.id}')">❌ تخطي</button>
      </div>

      <div id="accordion-${index}" class="accordion">
        <div class="accordion-section">
          <div class="accordion-title">📦 المنتجات</div>
          <div class="accordion-content">${products || "لا يوجد منتجات"}</div>
        </div>

        <div class="accordion-section">
          <div class="accordion-title">💳 ملخص الدفع</div>
          <div class="accordion-content">
• المنتجات: ${parseFloat(productsTotal).toFixed(2)} ₪
• التوصيل: ${parseFloat(shippingCost).toFixed(2)} ₪
• <strong>الإجمالي: ${parseFloat(totalPrice).toFixed(2)} ₪</strong>
• حالة الدفع: <strong>${escapeHtml(order.financial_status || "N/A")}</strong>
          </div>
        </div>

        <div class="accordion-section">
          <div class="accordion-title">🎟️ كود الخصم</div>
          <div class="accordion-content">${discounts}</div>
        </div>

        <div class="accordion-section">
          <div class="accordion-title">👤 بيانات العميل</div>
          <div class="accordion-content">
• الاسم: ${customerName}
• البريد: ${escapeHtml(order.email || "N/A")}
• الهاتف: ${escapeHtml(shipping.phone || "N/A")}
• العنوان: ${escapeHtml(shipping.address1 || "N/A")} ${shipping.address2 ? ", " + escapeHtml(shipping.address2) : ""}
• المدينة: ${escapeHtml(shipping.city || "N/A")}
• الدولة: ${escapeHtml(shipping.country || "N/A")}
• الرمز البريدي: ${escapeHtml(shipping.zip || "N/A")}
          </div>
        </div>

        <div class="accordion-section">
          <div class="accordion-title">📝 ملاحظات وإضافات</div>
          <div class="accordion-content">
• الملاحظات: ${escapeHtml(order.note || "لا يوجد")}
• عدد المنتجات: ${(order.line_items || []).length}
• حالة الطلب: ${escapeHtml(order.fulfillment_status || "N/A")}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============== ACCORDION ==============

/**
 * Toggle accordion open/close
 */
function toggleAccordion(index, btn) {
  const el = document.getElementById(`accordion-${index}`);
  if (!el) return;

  el.classList.toggle("open");
  btn.textContent = el.classList.contains("open")
    ? "📂 إخفاء التفاصيل"
    : "📂 عرض التفاصيل";
}

// ============== SEARCH & FILTER ==============

/**
 * Handle search input
 */
function handleSearch() {
  const searchTerm =
    document.getElementById("searchInput")?.value.toLowerCase() || "";
  const filterStatus = document.getElementById("filterStatus")?.value || "all";

  filteredOrders = allOrders.filter((order) => {
    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const orderNumber = (order.order_number || order.id)
      .toString()
      .toLowerCase();
    const phone = (order.shipping_address?.phone || "").toLowerCase();
    const email = (order.email || "").toLowerCase();

    const matchesSearch =
      searchTerm === "" ||
      customerName.includes(searchTerm) ||
      orderNumber.includes(searchTerm) ||
      phone.includes(searchTerm) ||
      email.includes(searchTerm);

    return matchesSearch && shouldShowByFilter(order, filterStatus);
  });

  renderOrders(filteredOrders);
}

/**
 * Handle filter change
 */
function handleFilter() {
  const filterStatus = document.getElementById("filterStatus")?.value || "all";
  const searchTerm =
    document.getElementById("searchInput")?.value.toLowerCase() || "";

  filteredOrders = allOrders.filter((order) => {
    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const orderNumber = (order.order_number || order.id)
      .toString()
      .toLowerCase();
    const phone = (order.shipping_address?.phone || "").toLowerCase();
    const email = (order.email || "").toLowerCase();

    const matchesSearch =
      searchTerm === "" ||
      customerName.includes(searchTerm) ||
      orderNumber.includes(searchTerm) ||
      phone.includes(searchTerm) ||
      email.includes(searchTerm);

    return matchesSearch && shouldShowByFilter(order, filterStatus);
  });

  renderOrders(filteredOrders);
}

/**
 * Determine if order should be shown based on filter
 */
function shouldShowByFilter(order, filterStatus) {
  switch (filterStatus) {
    case "with-discount":
      return order.discount_codes && order.discount_codes.length > 0;
    case "high-value":
      return parseFloat(order.total_price || 0) > 500;
    case "pending":
      return order.financial_status !== "paid";
    default:
      return true;
  }
}

/**
 * Reset search and filter
 */
function resetSearchFilter() {
  const searchInput = document.getElementById("searchInput");
  const filterStatus = document.getElementById("filterStatus");

  if (searchInput) searchInput.value = "";
  if (filterStatus) filterStatus.value = "all";

  filteredOrders = allOrders;
  renderOrders(filteredOrders);
}

// ============== ACTIONS ==============

/**
 * Send WhatsApp message
 */
async function sendWhatsApp(orderId, prefix) {
  if (!authToken) {
    showError("لا توجد جلسة نشطة");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ prefix }),
    });

    if (res.status === 401) {
      handleLogout();
      return;
    }

    const data = await res.json();

    if (data.success) {
      showSuccess(`📱 جاري فتح واتساب برقم: ${data.phone}`);
      setTimeout(() => window.open(data.url, "_blank"), 500);
    } else {
      showError("❌ " + (data.error || "خطأ في الاتصال"));
    }
  } catch (err) {
    console.error("WhatsApp error:", err);
    showError("خطأ: " + err.message);
  }
}

/**
 * Ship order
 */
async function shipOrder(orderId) {
  if (!authToken) {
    showError("لا توجد جلسة نشطة");
    return;
  }

  if (!confirm("تأكيد شحن الطلب " + orderId + "؟")) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/ship`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) {
      handleLogout();
      return;
    }

    const data = await res.json();

    if (!data.error) {
      showSuccess(`✅ تم شحن الطلب ${orderId} بنجاح!`);
      setTimeout(loadOrders, 800);
    } else {
      showError("❌ " + (data.error || "خطأ في الشحن"));
    }
  } catch (err) {
    console.error("Ship error:", err);
    showError("خطأ: " + err.message);
  }
}

/**
 * Skip order
 */
async function skipOrder(orderId) {
  if (!authToken) {
    showError("لا توجد جلسة نشطة");
    return;
  }

  const reason = prompt("السبب (اختياري):");
  if (reason === null) return;

  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/skip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ reason: reason || "لم يحدد" }),
    });

    if (res.status === 401) {
      handleLogout();
      return;
    }

    const data = await res.json();

    if (data.message) {
      showSuccess(`⏭️ تم تخطي الطلب ${orderId}`);
      setTimeout(loadOrders, 800);
    } else {
      showError("❌ " + (data.error || "خطأ في التخطي"));
    }
  } catch (err) {
    console.error("Skip error:", err);
    showError("خطأ: " + err.message);
  }
}

// ============== INITIALIZATION ==============

/**
 * Initialize dashboard on page load
 */
window.addEventListener("load", () => {
  // Check authentication
  if (!authToken || !currentUsername) {
    window.location.href = "/login.html";
    return;
  }

  // Display username in header
  const adminName = document.getElementById("adminName");
  if (adminName) {
    adminName.textContent = `👋 مرحباً، ${escapeHtml(currentUsername)}`;
  }

  // Load orders on page load
  loadOrders();

  // Auto-refresh orders every 5 seconds
  setInterval(() => {
    if (authToken) {
      loadOrders();
    }
  }, 5000);
});
