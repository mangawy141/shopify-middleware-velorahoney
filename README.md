# 🛍️ Shopify-Logestechs Middleware

**Production-ready Node.js middleware** connecting Shopify store orders to Logestechs shipping service with manual review dashboard.

## 🎯 What It Does

1. **Receives Shopify webhooks** when new orders are created
2. **Verifies webhook security** with HMAC-SHA256
3. **Saves orders to pending queue** for manual review
4. **Provides dashboard** to view and manage pending orders
5. **Ships to Logestechs** when you click "Ship Now"
6. **Tracks order mappings** (Shopify ID ↔ Logestechs ID)

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- Shopify API keys (webhook secret)
- Logestechs shipping account (email, password, company ID)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
PORT=3000
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_here
LOGESTECHS_EMAIL=your_shipping_email@example.com
LOGESTECHS_PASSWORD=your_shipping_password
LOGESTECHS_COMPANY_ID_165=165
SENDER_NAME=Your Store Name
SENDER_PHONE=+1234567890
SENDER_ADDRESS=123 Main St
SENDER_CITY_ID=1
SENDER_REGION_ID=1
SENDER_VILLAGE_ID=1
PRODUCT_DESCRIPTION=Order fulfillment
```

### 3. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### 4. Access Dashboard

Open in browser: `http://localhost:3000/dashboard`

## 📊 Dashboard Features

- **Real-time order list** - Auto-refreshes every 5 seconds
- **Statistics** - Pending count, processed count, total value
- **Ship Now button** - Send order to Logestechs
- **Skip button** - Remove order from queue without shipping
- **Arabic RTL** - Full right-to-left interface support
- **Mobile responsive** - Works on phones and tablets

## 🔌 API Endpoints

### Get Pending Orders

```bash
curl http://localhost:3000/orders
```

### Get Statistics

```bash
curl http://localhost:3000/orders/summary
```

### Ship Order

```bash
curl -X POST http://localhost:3000/orders/6701522452693/ship
```

### Skip Order

```bash
curl -X POST http://localhost:3000/orders/6701522452693/skip
```

## 📦 Data Files

- `pending-orders.json` - Orders waiting for manual review
- `processed-orders.json` - Orders already shipped
- `order-mapping.json` - Shopify ↔ Logestechs ID mappings

## 🔐 Security

✅ HMAC-SHA256 webhook verification
✅ Credentials in `.env` (never in code)
✅ Secure header transmission to Logestechs
✅ Test webhook support

## 🌐 Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Vercel

- Go to https://vercel.com
- Import your repository
- Add environment variables from `.env`

### 3. Deploy

```bash
vercel
```

### 4. Register Webhook with Shopify

In Shopify Admin:

1. Settings → Apps and integrations → Webhooks
2. Add webhook:
   - Topic: `orders/create`
   - URL: `https://your-app.vercel.app/webhooks/orders/create`

## 🐛 Troubleshooting

### "Order not found" error

- Wait 5 seconds for dashboard to refresh
- Check server logs for webhook receipt

### Webhook not triggering

- Verify webhook URL in Shopify is correct
- Check `SHOPIFY_WEBHOOK_SECRET` matches app settings
- Test with sample order creation

### Logestechs API error

- Verify credentials in `.env`
- Check company ID is correct
- Ensure account has shipping credit

## 📝 Development

### Project Structure

```
├── api/index.js          # Main application
├── public/dashboard.html # Dashboard UI
├── .env                  # Configuration
└── *.json               # Data files
```

### Key Technologies

- **Express.js** - Web framework
- **Axios** - HTTP client
- **Crypto** - HMAC verification
- **Dotenv** - Environment management

## 📈 Status: 90% Production Ready

**Completed:**

- ✅ Webhook integration with HMAC verification
- ✅ Logestechs API integration
- ✅ Manual order queue system
- ✅ Dashboard interface
- ✅ Data persistence

**Future:**

- ⏳ Shopifu tracking sync
- ⏳ Multi-shop database backend
- ⏳ Rate limiting & authentication

## 📞 Support

Check server logs:

```bash
npm run dev
```

For more info, see [PRODUCTION_STATUS.md](./PRODUCTION_STATUS.md)

---

**Happy Shipping!** 📦✨
