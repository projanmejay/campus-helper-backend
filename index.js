// index.js

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const Order = require('./models/Order');

const app = express();
app.use(cors());
app.use(express.json());

/* ------------------ MONGODB CONNECTION ------------------ */
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing in environment variables');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ------------------ UTIL ------------------ */
function generateCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/* ------------------ CREATE ORDER ------------------ */
app.post('/order', async (req, res) => {
  try {
    const { canteen, items, totalAmount } = req.body;

    if (!canteen || totalAmount == null) {
      return res.status(400).json({ error: 'canteen and totalAmount required' });
    }

    const orderId = uuidv4();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const order = new Order({
      orderId,
      code,
      canteen,
      items: items || {},
      totalAmount,
      status: 'PENDING_PAYMENT',
      expiresAt,
    });

    await order.save();

    res.status(201).json({
      orderId,
      code,
      expiresAt,
    });
  } catch (err) {
    console.error('❌ Create order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ CHECK ORDER STATUS ------------------ */
app.get('/order/:id/status', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'PENDING_PAYMENT' && Date.now() > order.expiresAt) {
      order.status = 'EXPIRED';
      await order.save();
    }

    res.json({
      orderId: order.orderId,
      status: order.status,
      code: order.code,
      totalAmount: order.totalAmount,
      canteen: order.canteen,
    });
  } catch (err) {
    console.error('❌ Status check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ LIST ORDERS (ADMIN) ------------------ */
app.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('❌ List orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ ADMIN CONFIRM ------------------ */
app.post('/admin/confirm-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (Date.now() > order.expiresAt) {
      order.status = 'EXPIRED';
      await order.save();
      return res.status(400).json({ error: 'Order expired' });
    }

    order.status = 'PAID';
    order.paidAt = new Date();
    order.paymentInfo = { method: 'MANUAL_CONFIRM' };

    await order.save();

    res.json({ ok: true, orderId, status: order.status });
  } catch (err) {
    console.error('❌ Admin confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ SIMPLE ADMIN PAGE ------------------ */
app.get('/admin', (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
  <title>Admin Orders</title>
</head>
<body>
<h2>Orders</h2>
<div id="list">Loading…</div>

<script>
async function load() {
  const r = await fetch('/orders');
  const data = await r.json();
  const d = document.getElementById('list');

  if (!data.length) {
    d.innerHTML = '<p>No orders</p>';
    return;
  }

  d.innerHTML = data.map(o => \`
    <div style="border:1px solid #ccc;margin:10px;padding:10px">
      <b>Order:</b> \${o.orderId}<br/>
      <b>Code:</b> \${o.code}<br/>
      <b>Canteen:</b> \${o.canteen}<br/>
      <b>Total:</b> ₹\${o.totalAmount}<br/>
      <b>Status:</b> \${o.status}<br/>
      <button onclick="confirmOrder('\${o.orderId}')">Confirm</button>
    </div>
  \`).join('');
}

async function confirmOrder(id) {
  const r = await fetch('/admin/confirm-order', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ orderId: id })
  });
  const j = await r.json();
  alert(JSON.stringify(j));
  load();
}

load();
setInterval(load, 5000);
</script>
</body>
</html>
`);
});

/* ------------------ START SERVER ------------------ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
