import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent storage for processed orders
const ordersFile = path.resolve(__dirname, "./processed-orders.json");
const orderMappingFile = path.resolve(__dirname, "./order-mapping.json");

// In-memory cache for performance
let processedOrdersCache = [];
let orderMappingCache = {};

const loadProcessedOrders = () => {
  try {
    if (!fs.existsSync(ordersFile)) {
      fs.writeFileSync(ordersFile, JSON.stringify([]));
      return [];
    }
    return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch (err) {
    console.error("❌ Error loading orders:", err.message);
    return [];
  }
};

const loadOrderMapping = () => {
  try {
    if (!fs.existsSync(orderMappingFile)) {
      fs.writeFileSync(orderMappingFile, JSON.stringify({}));
      return {};
    }
    return JSON.parse(fs.readFileSync(orderMappingFile, "utf8"));
  } catch (err) {
    console.error("❌ Error loading order mapping:", err.message);
    return {};
  }
};

// Initialize caches
processedOrdersCache = loadProcessedOrders();
orderMappingCache = loadOrderMapping();

const saveProcessedOrder = (orderId, logestechsId) => {
  try {
    if (!processedOrdersCache.includes(orderId)) {
      processedOrdersCache.push(orderId);
    }

    if (processedOrdersCache.length > 5000) {
      processedOrdersCache = processedOrdersCache.slice(-5000);
    }

    fs.writeFileSync(ordersFile, JSON.stringify(processedOrdersCache, null, 2));

    orderMappingCache[orderId] = {
      logestechsId,
      createdAt: new Date().toISOString(),
      synced: false,
    };
    fs.writeFileSync(
      orderMappingFile,
      JSON.stringify(orderMappingCache, null, 2),
    );
  } catch (err) {
    console.error("❌ Error saving order:", err.message);
  }
};

const isDuplicateOrder = (orderId) => {
  return processedOrdersCache.includes(orderId);
};

const getOrderMapping = (orderId) => {
  return orderMappingCache[orderId] || null;
};

const app = express();
const PORT = process.env.PORT || 3000;

// Load .env only in local development
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// ============================================
// 🔐 Admin Authentication
// ============================================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware to verify JWT token
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
if (!SHOPIFY_WEBHOOK_SECRET) {
  throw new Error(
    "SHOPIFY_WEBHOOK_SECRET is not defined in environment variables",
  );
}
const MAX_STORED_ORDERS = 5000;

// Save raw body for HMAC verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Secure verification of Shopify webhook
const verifyShopifyWebhook = (req) => {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return false;

  const generatedHash = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedHash),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
};

const sendWithRetry = async (
  payload,
  logestechsAccount,
  retries = 3,
  delay = 1000,
) => {
  try {
    const fullPayload = {
      email: logestechsAccount.email || process.env.LOGESTECHS_EMAIL,
      password: logestechsAccount.password || process.env.LOGESTECHS_PASSWORD,
      ...payload,
    };

    return await axios.post(
      "https://apisv2.logestechs.com/api/ship/request/by-email",
      fullPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "company-id": logestechsAccount.id,
        },
        timeout: 10000,
      },
    );
  } catch (err) {
    if (retries > 0) {
      console.log(`Retry in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
      return sendWithRetry(payload, logestechsAccount, retries - 1, delay * 2);
    }
    console.error("❌ Logestechs Error:", err.response?.data || err.message);
    throw err;
  }
};

const processOrder = async (order, logestechsAccount) => {
  const orderId = order.id?.toString();
  if (!orderId) return;

  // Check for duplicates using persistent storage
  if (isDuplicateOrder(orderId)) {
    console.log(`⚠️ Duplicate order ignored: ${orderId}`);
    return;
  }

  const shipping = order.shipping_address || {};

  const receiverPhone =
    shipping.phone ||
    order.phone ||
    order.customer?.default_address?.phone ||
    "0000000000";

  const receiverName =
    shipping.name ||
    `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
    "Customer";

  const senderAddress = logestechsAccount.address;

  const payload = {
    pkgUnitType: "METRIC",

    pkg: {
      cod: parseFloat(order.total_price || 0),

      invoiceNumber: orderId,

      // Sender info from Logestechs account
      senderName: logestechsAccount.name,
      businessSenderName: logestechsAccount.name,
      senderPhone: logestechsAccount.phone,

      // Receiver info
      receiverName,
      receiverPhone,

      // Hide product details
      description: process.env.PRODUCT_NAME || "General Product",

      quantity: (order.line_items || []).reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),

      serviceType: "STANDARD",
      shipmentType: order.financial_status === "paid" ? "PREPAID" : "COD",

      notes: `Order #${order.order_number}`,
    },

    destinationAddress: {
      addressLine1:
        `${shipping.address1 || ""} ${shipping.address2 || ""}`.trim() ||
        "No Address",

      cityId: shipping.province_code || "6",
      regionId: "1",
      villageId: "591",
    },

    originAddress: {
      addressLine1: senderAddress.addressLine1,

      cityId: senderAddress.cityId,
      regionId: senderAddress.regionId,
      villageId: senderAddress.villageId,
    },
  };

  console.log("🚀 Sending:", JSON.stringify(payload, null, 2));

  try {
    const response = await sendWithRetry(payload, logestechsAccount);

    console.log("✅ Logestechs Response:", response.data);

    // Save order as processed with mapping
    const logestechsId = response.data?.id;
    saveProcessedOrder(orderId, logestechsId);

    console.log(
      `✅ Order ${orderId} sent successfully (Logestechs ID: ${logestechsId})`,
    );
  } catch (err) {
    console.error("❌ Failed to send order:");
    console.error(err.response?.data || err.message);
  }
};

// Helper: Fetch shop's Logestechs account
// TODO: Replace with your database/API call
const getShopLogestechsAccount = async (shopName) => {
  // *** REPLACE THIS WITH YOUR ACTUAL DATA SOURCE ***
  // This could be: database query, API call, Redis cache, etc.

  // For now, return from environment (fallback)
  return {
    id: process.env.LOGESTECHS_COMPANY_ID || 165,
    name: process.env.SENDER_NAME || "ACTUS",
    email: process.env.LOGESTECHS_EMAIL,
    password: process.env.LOGESTECHS_PASSWORD,
    token: process.env.LOGESTECHS_TOKEN,
    phone: process.env.SENDER_PHONE,
    address: {
      addressLine1: process.env.SENDER_ADDRESS,
      cityId: process.env.SENDER_CITY_ID,
      regionId: process.env.SENDER_REGION_ID,
      villageId: process.env.SENDER_VILLAGE_ID,
    },
  };
};

// ============================================
// 🔧 MANUAL SHIPPING MODE
// ============================================

const pendingOrdersFile = path.resolve(__dirname, "./pending-orders.json");
let pendingOrdersCache = {};

const loadPendingOrders = () => {
  try {
    if (!fs.existsSync(pendingOrdersFile)) {
      fs.writeFileSync(pendingOrdersFile, JSON.stringify({}));
      return {};
    }
    return JSON.parse(fs.readFileSync(pendingOrdersFile, "utf8"));
  } catch (err) {
    console.error("❌ Error loading pending orders:", err.message);
    return {};
  }
};

pendingOrdersCache = loadPendingOrders();

const savePendingOrder = (orderId, orderData) => {
  try {
    pendingOrdersCache[orderId] = {
      ...orderData,
      status: "PENDING",
      addedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      pendingOrdersFile,
      JSON.stringify(pendingOrdersCache, null, 2),
    );
    console.log(`📋 Order ${orderId} saved to pending list`);
  } catch (err) {
    console.error("❌ Error saving pending order:", err.message);
  }
};

const removePendingOrder = (orderId) => {
  try {
    delete pendingOrdersCache[orderId];
    fs.writeFileSync(
      pendingOrdersFile,
      JSON.stringify(pendingOrdersCache, null, 2),
    );
  } catch (err) {
    console.error("❌ Error removing pending order:", err.message);
  }
};

// ============================================
// 📱 WhatsApp Confirmation System
// ============================================

const formatPhoneForWhatsApp = (order, prefix = "972") => {
  let phone =
    order.shipping_address?.phone ||
    order.phone ||
    order.customer?.default_address?.phone ||
    "";

  // Remove all non-digits
  phone = phone.replace(/\D/g, "");

  // Remove leading zero if exists
  if (phone.startsWith("0")) {
    phone = phone.substring(1);
  }

  // If already has a prefix, return as-is
  if (phone.startsWith("970") || phone.startsWith("972")) {
    return phone;
  }

  // Return with specified prefix
  return prefix + phone;
};

const buildWhatsAppMessage = (order) => {
  const customerName =
    order.shipping_address?.name ||
    `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
    "عميلنا";

  const rawCountry = order.shipping_address?.country || "";

  // تبسيط الدولة
  const country = rawCountry.includes("Palest")
    ? "فلسطين"
    : rawCountry.includes("Israel")
      ? "إسرائيل"
      : rawCountry;

  const products = (order.line_items || [])
    .map((item) => `- ${item.name} × ${item.quantity}`)
    .join("\n");

  const productPrice = order.subtotal_price || order.total_price;

  const shippingPrice =
    order.total_shipping_price_set?.shop_money?.amount ||
    order.shipping_lines?.[0]?.price ||
    0;

  const totalPrice = order.total_price;

  return `مرحبًا ${customerName}

معك فريق Velora Honey بخصوص طلبك رقم #${order.order_number}

🛍 المنتجات:
${products}

💰 السعر: ${productPrice}₪
🚚 التوصيل: ${shippingPrice}₪
📦 الإجمالي: ${totalPrice}₪

📍 الاسم: ${customerName} - ${country}

يرجى تأكيد الطلب بالرد بكلمة "تأكيد"
(يتم تجهيز الطلبات المؤكدة فقط)

مدة التوصيل: 1-3 أيام عمل

في حال عدم التأكيد، سيتم إلغاء الطلب تلقائيًا`;
};

// ============================================
// 📱 Send WhatsApp Confirmation
// ============================================

app.post(
  "/orders/:orderId/send-whatsapp",
  verifyAdminToken,
  async (req, res) => {
    const orderId = req.params.orderId;
    const order = pendingOrdersCache[orderId];
    const prefix = req.body?.prefix || "972"; // Default to Israeli prefix

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    try {
      const phone = formatPhoneForWhatsApp(order, prefix);
      const message = buildWhatsAppMessage(order);

      // Generate WhatsApp link
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      console.log(`📱 WhatsApp link generated for order ${orderId}`);
      console.log(`   Phone: +${phone}`);

      res.json({
        success: true,
        message: "WhatsApp link generated",
        url,
        phone: `+${phone}`,
      });
    } catch (err) {
      console.error("❌ Error generating WhatsApp link:", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

// ============================================
// 🔐 Admin Login
// ============================================

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  // Validate credentials
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: "admin" }, JWT_SECRET, {
      expiresIn: "24h",
    });

    console.log("✅ Admin login successful");
    res.json({
      success: true,
      message: "Login successful",
      token,
    });
  } else {
    console.warn(`⚠️ Failed login attempt: ${username}`);
    res.status(401).json({
      success: false,
      error: "Invalid credentials",
    });
  }
});

// Webhook endpoint - Save for manual review
app.post("/webhooks/orders/create", async (req, res) => {
  // Ignore test webhooks
  if (req.headers["x-shopify-test"] === "true") {
    return res.status(200).send("Test OK");
  }

  // Security check
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).send("Unauthorized");
  }

  const order = req.body;

  // Save for manual review
  savePendingOrder(order.id.toString(), order);

  // Quick response to Shopify
  res.status(202).json({
    message: "Order saved for manual review",
    orderId: order.id,
  });
});

// ========================
// 📊 REST API - Manual Mode
// ========================

// List all pending orders
app.get("/orders", verifyAdminToken, (req, res) => {
  const orders = Object.values(pendingOrdersCache);
  res.json({
    total: orders.length,
    orders: orders,
  });
});

// Get statistics
app.get("/orders/summary", verifyAdminToken, (req, res) => {
  const pendingOrders = Object.values(pendingOrdersCache);
  const processedCount = processedOrdersCache.length;
  const totalPendingValue = pendingOrders.reduce(
    (sum, order) => sum + (order.total_price || 0),
    0,
  );

  res.json({
    pending: pendingOrders.length,
    processed: processedCount,
    totalValue: totalPendingValue,
    orders: pendingOrders,
  });
});

// Get single order
app.get("/orders/:orderId", verifyAdminToken, (req, res) => {
  const order = pendingOrdersCache[req.params.orderId];
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  res.json(order);
});

// Ship order (move to Logestechs)
app.post("/orders/:orderId/ship", verifyAdminToken, async (req, res) => {
  const orderId = req.params.orderId;
  const order = pendingOrdersCache[orderId];

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  try {
    const shopName = order.name?.split("-")?.[0] || "default";
    const logestechsAccount = await getShopLogestechsAccount(shopName);
    const result = await processOrder(order, logestechsAccount);

    // Move to processed and remove from pending
    saveProcessedOrder(orderId);
    removePendingOrder(orderId);

    res.json({
      message: "Order shipped successfully",
      result: result,
    });
  } catch (err) {
    console.error("Error shipping order:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Skip order (remove without shipping)
app.post("/orders/:orderId/skip", verifyAdminToken, (req, res) => {
  const orderId = req.params.orderId;

  if (!pendingOrdersCache[orderId]) {
    return res.status(404).json({ error: "Order not found" });
  }

  removePendingOrder(orderId);
  res.json({ message: "Order skipped" });
});

// Serve dashboard
app.get("/dashboard", (req, res) => {
  const dashboardPath = path.resolve(__dirname, "../public/dashboard.html");
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.status(404).send("Dashboard not found");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Middleware running on port ${PORT}`);
  console.log(`📦 Loaded ${processedOrdersCache.length} processed orders`);
  console.log(
    `🗂️ Loaded ${Object.keys(orderMappingCache).length} order mappings`,
  );
  console.log(
    `📋 Loaded ${Object.keys(pendingOrdersCache).length} pending orders`,
  );
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Debug endpoint: Show current shop config (remove in production)
app.get("/debug/config", async (req, res) => {
  const shopName = req.query.shop || "default";
  const account = await getShopLogestechsAccount(shopName);
  res.json({
    shop: shopName,
    companyId: account.id,
    senderName: account.name,
    senderPhone: account.phone,
    hasToken: !!account.token,
    hasEmail: !!account.email,
  });
});

// Endpoint to get tracking info (for future Shopify sync)
app.get("/tracking/:orderId", (req, res) => {
  const { orderId } = req.params;
  const mapping = getOrderMapping(orderId);

  if (!mapping) {
    return res.status(404).json({ error: "Order not found" });
  }

  res.json({
    shopifyOrderId: orderId,
    logestechsId: mapping.logestechsId,
    createdAt: mapping.createdAt,
    synced: mapping.synced,
  });
});
export default app;
