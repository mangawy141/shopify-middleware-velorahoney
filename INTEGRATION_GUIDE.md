# 🔗 Shopify Integration Guide

## Step-by-Step: Connect Your Shopify Store

### Prerequisites

- Shopify store admin access
- Middleware deployed and running on public URL
- `SHOPIFY_WEBHOOK_SECRET` generated in `.env`

### Step 1: Get Webhook Secret

The webhook secret is already configured in `.env`:

```env
SHOPIFY_WEBHOOK_SECRET=13a9af1c... (from your config)
```

This matches the secret in your Shopify app settings.

### Step 2: Prepare Your Middleware

#### Local Development

```bash
npm run dev
# Server runs on http://localhost:3000
```

#### Production (Vercel)

```bash
vercel
# Returns: https://your-app.vercel.app
```

### Step 3: Register Webhook with Shopify

#### Via Shopify Admin Dashboard

1. **Go to Settings**
   - Open your Shopify admin
   - Settings → Apps and integrations → Webhooks

2. **Create New Webhook**
   - Click "Create webhook"
   - Select event type: `Orders → Create order`
   - Enter webhook URL: `https://your-domain.com/webhooks/orders/create`
   - Click "Save"

#### Via Shopify CLI (Alternative)

```bash
shopify app webhook trigger --topic orders/create
```

### Step 4: Create Test Order

1. Go to Orders in Shopify admin
2. Click "Create order"
3. Add a customer
4. Add products
5. Set shipping address
6. Click "Create"

### Step 5: Verify in Dashboard

1. Open dashboard: `http://localhost:3000/dashboard`
2. Refresh page (or wait 5 seconds for auto-refresh)
3. Should see new order in pending list

### Step 6: Process Order

1. Click **"Ship Now"** to send to Logestechs
2. Or click **"Skip"** to remove without shipping

### What Happens Behind the Scenes

1. **Shopify Creates Order**
   - Your store receives a new order

2. **Webhook Sent to Middleware**
   - Shopify sends webhook to `/webhooks/orders/create`
   - Middleware verifies HMAC signature

3. **Order Saved to Queue**
   - Order stored in `pending-orders.json`
   - Dashboard updates automatically

4. **Manual Review**
   - You review order in dashboard
   - Click "Ship Now" to proceed

5. **Sent to Logestechs**
   - Middleware prepares shipment details
   - Sends to Logestechs API
   - Receives tracking barcode

6. **Order Marked as Processed**
   - Order moved to `processed-orders.json`
   - `order-mapping.json` updated with tracking ID
   - Dashboard refreshes

## 🔍 Testing Webhooks

### Method 1: Use Shopify Webhook Tester

From Shopify admin, you can test webhooks:

1. Go to webhook settings
2. Click on webhook name
3. Click "Recent deliveries"
4. Click on a delivery to see details

### Method 2: Terminal Test

```bash
# Simulate webhook (requires valid HMAC)
curl -X POST http://localhost:3000/webhooks/orders/create \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-SHA256: ..." \
  -d '{"id":123,"total_price":"10.00",...}'
```

### Method 3: Check Logs

```bash
npm run dev
# Watch for: "Webhook verified" or "Unauthorized"
```

## 🚨 Troubleshooting Webhooks

### Webhook Not Triggering

**Check 1: Verify URL in Shopify**

- Settings → Apps and integrations → Webhooks
- Webhook URL should be: `https://your-domain.com/webhooks/orders/create`
- Status should show "Active" (green checkmark)

**Check 2: Check Firewall/Network**

- Ensure your server is accessible from internet
- If using `localhost`, you need ngrok tunnel: `ngrok http 3000`
- Update webhook URL in Shopify to ngrok URL

**Check 3: Check HMAC Secret**

- Verify `SHOPIFY_WEBHOOK_SECRET` in `.env` matches Shopify
- Go to Settings → Apps and integrations → Development apps
- Find your app → Configuration
- Copy "Webhook signing secret" and update `.env`

**Check 4: Monitor Webhook Deliveries**

- Shopify admin → Settings → Webhooks
- Click webhook name
- "Recent deliveries" tab shows all sent webhooks
- Failed deliveries show red ❌
- Click delivery to see error details

### Server Not Responding

```bash
# Check if server is running
curl http://localhost:3000/health

# Should return: {"status":"ok"}

# If not, restart server:
npm run dev
```

### Orders Not Appearing in Dashboard

1. Check webhook was received:
   - Shopify admin → Webhooks → Recent deliveries
   - Should show successful delivery (200 status)

2. Check server logs:
   - Look for: "Webhook verified"
   - Or error message if verification failed

3. Check pending-orders.json file:

   ```bash
   cat pending-orders.json
   # Should contain order data
   ```

4. Refresh dashboard:
   - F5 or wait 5 seconds for auto-refresh

## 📊 Advanced: Multi-Store Setup

To support multiple Shopify stores:

1. Register multiple webhooks (one per store)
2. All webhooks point to same middleware URL
3. Middleware identifies store via `X-Shopify-Shop-Domain` header
4. Different credentials per store in database

Example modification in `api/index.js`:

```javascript
const shopName = req.get("X-Shopify-Shop-Domain");
const account = await getShopLogestechsAccount(shopName);
// Now using correct account for this shop
```

## 🎓 Common Questions

**Q: What if order is rejected by Logestechs?**

- A: Error message shown in dashboard
- You can retry by clicking "Ship Now" again
- Or skip if order is no longer valid

**Q: Can I undo shipping an order?**

- A: Not automatically via dashboard
- Requires manual intervention in `order-mapping.json`

**Q: How long do orders stay in pending?**

- A: Indefinitely until you ship or skip them
- Make sure to review regularly in dashboard

**Q: What if same order creates duplicate webhook?**

- A: Duplicate prevention system handles this
- Order only ships once (tracked in `processed-orders.json`)

## 🔐 Security Notes

✅ Webhook signature verified with HMAC-SHA256
✅ Non-matching signatures rejected (401)
✅ Test webhooks (from Shopify UI) are skipped
✅ Orders stored with full Shopify data (secure)

## 📈 Next Steps

1. ✅ Complete steps 1-6 above
2. ⏳ Implement order status tracking (see PRODUCTION_STATUS.md)
3. ⏳ Add database backend for multi-store
4. ⏳ Set up monitoring/alerts

---

**Need help?** Check the main [README.md](./README.md) or [PRODUCTION_STATUS.md](./PRODUCTION_STATUS.md)
