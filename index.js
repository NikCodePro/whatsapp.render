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
  const { countryCode, number } = req.body;
  if (!countryCode || !number) return res.status(400).send('Missing fields');
  const numbers = await getNumbers();
  numbers.push({ countryCode, number });
  await saveNumbers(numbers);
  res.json({ success: true });
});


// API: Delete a number
app.post('/api/numbers/delete', requireAdmin, async (req, res) => {
  const { index } = req.body;
  let numbers = await getNumbers();
  numbers.splice(index, 1);
  await saveNumbers(numbers);
  res.json({ success: true });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
