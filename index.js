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
  const { username, password } = req.body;
  if (await checkCredentials(username, password)) {
    req.session.user = username;
    console.log(`User ${username} logged in. Session ID: ${req.session.id} `);
    return res.redirect('/admin');
  }
  return res.status(401).send('Invalid credentials');
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/admin.html'));
});

// Numbers management page
app.get('/numbers', requireAdmin, async (req, res) => {
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

let lastUsedIndex = 0;

app.get('/api/whatsapp-redirect', async (req, res) => {
  const numbers = await getNumbers();
  if (!numbers.length) return res.status(404).send('No numbers available');
  // Find next active number
  let tries = 0;
  let index = lastUsedIndex;
  while (tries < numbers.length) {
    if (numbers[index].status === 'active') break;
    index = (index + 1) % numbers.length;
    tries++;
  }
  if (numbers[index].status !== 'active') return res.status(404).send('No active numbers');
  lastUsedIndex = (index + 1) % numbers.length;
  const phone = numbers[index].countryCode.replace('+', '') + numbers[index].number;
  const message = encodeURIComponent("Hola, quiero un usuario");
  const url = `https://wa.me/${phone}?text=${message}`;
  res.redirect(url);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
