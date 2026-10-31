const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'BD74EG'; // Change in hosting environment variables

app.use(cors());
app.use(express.json());

// Ensure directories exist (pointing to your data/public structure)
const PUBLIC_DIR = path.join(__dirname, 'data', 'public');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ENQUIRIES_FILE = path.join(DATA_DIR, 'enquiries.json');

function readJson(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Serve static website and downloaded photos from data/public
app.use(express.static(PUBLIC_DIR));

// Configure Multer so staff can upload photos directly to data/public
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PUBLIC_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// 1. Create a Click & Collect or Pink Box Order
app.post('/api/orders', (req, res) => {
  const { customerName, customerPhone, pickupTime, items, notes, total } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item.' });
  }

  const orders = readJson(ORDERS_FILE);
  const newOrder = {
    id: 'NB-' + Math.floor(100000 + Math.random() * 900000),
    customerName: customerName || 'Walk-in / Online Guest',
    customerPhone: customerPhone || 'Not provided',
    pickupTime: pickupTime || 'ASAP',
    items,
    notes: notes || '',
    total: Number(total || 0).toFixed(2),
    status: 'New',
    createdAt: new Date().toISOString()
  };

  orders.unshift(newOrder);
  writeJson(ORDERS_FILE, orders);
  res.status(201).json({ success: true, order: newOrder });
});

// 2. Get All Orders (for Kitchen Admin)
app.get('/api/orders', (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized PIN' });
  }
  res.json(readJson(ORDERS_FILE));
});

// 3. Update Order Status (New -> Preparing -> Ready -> Collected)
app.patch('/api/orders/:id', (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized PIN' });
  }
  const orders = readJson(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });

  orders[idx].status = req.body.status || orders[idx].status;
  writeJson(ORDERS_FILE, orders);
  res.json({ success: true, order: orders[idx] });
});

// 4. Submit Bespoke Celebration Slab / Event Enquiry
app.post('/api/enquiries', (req, res) => {
  const { name, phone, eventDate, guestCount, message } = req.body;
  const enquiries = readJson(ENQUIRIES_FILE);
  const entry = {
    id: 'ENQ-' + Date.now().toString().slice(-5),
    name,
    phone,
    eventDate,
    guestCount,
    message,
    createdAt: new Date().toISOString()
  };
  enquiries.unshift(entry);
  writeJson(ENQUIRIES_FILE, enquiries);
  res.status(201).json({ success: true, enquiry: entry });
});

// 5. Upload Counter Photos from Admin
app.post('/api/upload-photos', upload.array('photos', 20), (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized PIN' });
  }
  res.json({
    success: true,
    uploaded: req.files.map(f => f.originalname)
  });
});

// 6. Built-In Live Kitchen & Photo Admin Portal (/admin)
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nargis Bakes | Kitchen & Photo Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#FFFDF9] text-[#2C1810] min-h-screen p-6 font-sans">
  <div class="max-w-5xl mx-auto">
    <div class="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-pink-200">
      <div>
        <h1 class="text-2xl font-bold">Nargis Bakes — Live Kitchen Admin</h1>
        <p class="text-sm text-gray-600">503 Great Horton Rd, Bradford BD7 4EG</p>
      </div>
      <div class="flex items-center gap-2">
        <input id="pinInput" type="password" placeholder="Admin PIN (default: BD74EG)" class="border rounded-lg px-3 py-2 text-sm" value="BD74EG" />
        <button onclick="loadOrders()" class="bg-[#2C1810] text-white px-4 py-2 rounded-lg text-sm font-semibold">Refresh Orders</button>
      </div>
    </div>

    <div class="my-6 p-4 bg-[#F9E4E8] rounded-xl flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="font-bold text-sm">Upload Counter Photos Permanently to Server</h2>
        <p class="text-xs text-gray-700">Select nargis_bakes_001.jpg through 009.jpg so every visitor sees them automatically.</p>
      </div>
      <input type="file" id="photoFiles" multiple accept="image/*" class="text-xs" onchange="uploadPhotos(this.files)" />
    </div>

    <div id="ordersList" class="space-y-4"></div>
  </div>

  <script>
    async function loadOrders() {
      const pin = document.getElementById('pinInput').value;
      const res = await fetch('/api/orders', { headers: { 'x-admin-pin': pin } });
      if (!res.ok) return alert('Invalid Admin PIN');
      const orders = await res.json();
      const container = document.getElementById('ordersList');
      if (!orders.length) {
        container.innerHTML = '<p class="text-gray-500 py-8 text-center">No orders yet.</p>';
        return;
      }
      container.innerHTML = orders.map(o => `
        <div class="bg-white border border-pink-200 rounded-xl p-4 shadow-sm flex flex-wrap justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-lg">\${o.id}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-pink-100 font-semibold">\${o.status}</span>
              <span class="text-xs text-gray-500">\${new Date(o.createdAt).toLocaleString('en-GB')}</span>
            </div>
            <p class="text-sm font-semibold mt-1">\${o.customerName} • \${o.customerPhone} • Pickup: \${o.pickupTime}</p>
            <ul class="text-xs text-gray-700 mt-2 list-disc pl-4">
              \${o.items.map(i => `<li>\${i.qty || 1}x \${i.name} (£\${i.price}) \${i.addon ? '['+i.addon+']' : ''}</li>`).join('')}
            </ul>
            \${o.notes ? `<p class="text-xs italic mt-1 text-pink-800">Note: \${o.notes}</p>` : ''}
          </div>
          <div class="flex flex-col items-end justify-between">
            <span class="text-lg font-bold">£\${o.total}</span>
            <select onchange="updateStatus('\${o.id}', this.value)" class="border rounded-lg px-2 py-1 text-xs">
              \${['New','Preparing','Ready for Collection','Completed'].map(s => `<option value="\${s}" \${o.status===s?'selected':''}>\${s}</option>`).join('')}
            </select>
          </div>
        </div>
      `).join('');
    }

    async function updateStatus(id, status) {
      const pin = document.getElementById('pinInput').value;
      await fetch('/api/orders/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ status })
      });
      loadOrders();
    }

    async function uploadPhotos(files) {
      const pin = document.getElementById('pinInput').value;
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('photos', f));
      const res = await fetch('/api/upload-photos', {
        method: 'POST',
        headers: { 'x-admin-pin': pin },
        body: fd
      });
      const data = await res.json();
      if (data.success) alert('Uploaded: ' + data.uploaded.join(', '));
    }

    loadOrders();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Nargis Bakes server live on port ${PORT}`);
});
