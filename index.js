import express from 'express';
import { sessionMiddleware, requireAdmin, checkCredentials } from './src/auth/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNumbers, saveNumbers } from './src/utils/numbers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: false }));
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
  const phone = n.countryCode.replace('+', '') + n.number;
  const message = encodeURIComponent('Hola, quiero un usuario');
  const url = `https://wa.me/${phone}?text=${message}`;
  res.redirect(url);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
