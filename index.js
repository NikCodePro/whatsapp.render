import express from 'express';
import { sessionMiddleware, requireAdmin, checkCredentials } from './src/auth/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNumbers, saveNumbers } from './src/utils/numbers.js';
import fs from 'fs/promises';
import { logRedirect } from './src/utils/redirects.js';
import { connectDB } from './src/utils/mongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, './src/admin/index.html')));
app.post('/login', async (req, res) => {
  const { username, password, remember } = req.body;
  if (await checkCredentials(username, password)) {
    req.session.user = username;
    // Set session cookie maxAge if "remember" is checked (e.g., 7 days)
    if (remember) {
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    } else {
      req.session.cookie.expires = false; // Session cookie
    }
    return res.redirect('/admin');
  }
  return res.status(401).send('Invalid credentials');
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/admin.html'));
});

// Numbers management page
app.get('/contact', requireAdmin, async (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/numbers.html'));
});

// Messages management page
app.get('/messages', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/messages.html'));
});

// API: Get all numbers
app.get('/api/numbers', requireAdmin, async (req, res) => {
  const numbers = await getNumbers();
  res.json(numbers);
});

// API: Add a number
app.post('/api/numbers', requireAdmin, async (req, res) => {
  const { countryCode, number, status } = req.body;
  if (!countryCode || !number)
    return res.status(400).send('Missing fields');
  const numbers = await getNumbers();
  numbers.push({ countryCode, number, status: status || 'inactive' });
  await saveNumbers(numbers);
  res.json({ success: true });
});

// API: Update status
app.post('/api/numbers/status', requireAdmin, async (req, res) => {
  const { index, status } = req.body;
  let numbers = await getNumbers();
  if (numbers[index]) {
    numbers[index].status = status;
    await saveNumbers(numbers);
    return res.json({ success: true });
  }
  res.status(400).json({ success: false });
});

// API: Delete a number
app.post('/api/numbers/delete', requireAdmin, async (req, res) => {
  const { index } = req.body;
  let numbers = await getNumbers();
  numbers.splice(index, 1);
  await saveNumbers(numbers);
  res.json({ success: true });
});

// API: Edit a number
app.post('/api/numbers/edit', requireAdmin, async (req, res) => {
  const { index, countryCode, number, status } = req.body;
  let numbers = await getNumbers();
  if (numbers[index]) {
    numbers[index] = {
      countryCode: countryCode || numbers[index].countryCode,
      number: number || numbers[index].number,
      status: status || numbers[index].status
    };
    await saveNumbers(numbers);
    return res.json({ success: true });
  }
  res.status(400).json({ success: false });
});

let lastRandomIndex = null;
const recentRedirects = new Map();

function normalizeCountryCode(code) {
  return code.replace(/^\+/, '');
}

function normalizeNumber(number) {
  return number.replace(/^(\+)?(\d+)$/, '$2');
}

// In /api/whatsapp-redirect:
app.get('/api/whatsapp-redirect', async (req, res) => {
  const numbers = await getNumbers();
  const activeNumbers = numbers.filter(n => n.status === 'active');
  if (!activeNumbers.length) return res.status(404).send('No active numbers');

  let randomIndex;
  if (activeNumbers.length === 1) {
    randomIndex = 0;
  } else {
    do {
      randomIndex = Math.floor(Math.random() * activeNumbers.length);
    } while (randomIndex === lastRandomIndex);
  }
  lastRandomIndex = randomIndex;

  const n = activeNumbers[randomIndex];
  n.countryCode = normalizeCountryCode(n.countryCode);
  n.number = normalizeNumber(n.number);
  const phone = n.countryCode.replace('+', '') + n.number;
  // Use custom message if exists, else default
  const messageText = n.message && n.message.trim() ? n.message : 'Hola, quiero un usuario';
  const message = encodeURIComponent(messageText);
  const url = `https://wa.me/${phone}?text=${message}`;

  // Prevent double logging from same IP/number within 5 seconds
  const key = `${req.ip}:${n.countryCode}:${n.number}`;
  const now = Date.now();
  if (!recentRedirects.has(key) || now - recentRedirects.get(key) > 5000) {
    console.log(`Redirecting to ${url} for ${n.countryCode}${n.number}`);
    await logRedirect(n);
    recentRedirects.set(key, now);
    setTimeout(() => recentRedirects.delete(key), 6000);
  }

  res.redirect(url);
});

app.get('/api/redirect-stats', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const numbers = await getNumbers();
  // Aggregate total redirects for each number
  const redirects = await db.collection('redirects').aggregate([
    {
      $group: {
        _id: { countryCode: "$countryCode", number: "$number" },
        count: { $sum: 1 }
      }
    }
  ]).toArray();
  const total = redirects.reduce((sum, r) => sum + r.count, 0) || 1;
  const stats = numbers.map(n => {
    const normCountryCode = normalizeCountryCode(n.countryCode);
    const normNumber = normalizeNumber(n.number);
    const log = redirects.find(
      l => l._id.countryCode === normCountryCode && l._id.number === normNumber
    );
    return {
      countryCode: n.countryCode,
      number: n.number,
      status: n.status,
      count: log ? log.count : 0,
      percent: log ? ((log.count / total) * 100).toFixed(1) : '0.0'
    };
  });
  res.json(stats);
});

app.post('/api/redirects/clear', requireAdmin, async (req, res) => {
  const db = await connectDB();
  await db.collection('redirects').deleteMany({});
  res.json({ success: true });
});

// Get all messages
app.get('/api/messages', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const numbers = await db.collection('numbers').find().toArray();
  // Only return numbers with a message
  res.json(numbers.filter(n => n.message));
});

// Save/update messages (bulk)
app.post('/api/messages', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const messages = req.body;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      await db.collection('numbers').updateOne(
        { countryCode: msg.countryCode, number: msg.number },
        { $set: { message: msg.message } }
      );
    }
  }
  res.json({ success: true });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
