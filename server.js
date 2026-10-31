const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'BD74EG';

app.use(cors());
app.use(express.json());

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

// Serve static frontend files
app.use(express.static(PUBLIC_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PUBLIC_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Orders API
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

app.get('/api/orders', (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized PIN' });
  }
  res.json(readJson(ORDERS_FILE));
});

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

// Enquiries API
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

// Photo Upload API
app.post('/api/upload-photos', upload.array('photos', 20), (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized PIN' });
  }
  res.json({ success: true, uploaded: req.files.map(f => f.originalname) });
});

// Serve Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Nargis Bakes server live on port ${PORT}`);
});
