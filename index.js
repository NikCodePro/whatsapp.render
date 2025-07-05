import express from 'express';
import { sessionMiddleware, requireAdmin, checkCredentials } from './src/auth/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: false }));

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

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
