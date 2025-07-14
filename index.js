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

// api to manage the numbers
// // API: Get all numbers
// app.get('/api/numbers', requireAdmin, async (req, res) => {
//   const numbers = await getNumbers();
//   res.json(numbers);
// });

// POST: Assign number to group with message
app.post('/api/assign-number', requireAdmin, async (req, res) => {
  const { countryCode, number, group, message } = req.body;

  if (!countryCode || !number || !group) {
    return res.status(400).send('Missing required fields');
  }

  const numbers = await getNumbers();

  // Optional: prevent duplicates
  // const exists = numbers.find(
  //   n => n.countryCode === countryCode && n.number === number
  // );
  // if (exists) {
  //   return res.status(409).json({ success: false, message: 'Number already exists' });
  // }

  numbers.push({
    countryCode,
    number,
    group,
    message: message || '',
    status: 'active' // default status
  });

  await saveNumbers(numbers);
  res.json({ success: true });
});

// API: Edit a number (countryCode, number, status, message)
app.post('/api/edit-numbers', requireAdmin, async (req, res) => {
  const { group, index, countryCode, number, status, message } = req.body;
  let numbers = await getNumbers();

  // Find all numbers in the specified group
  const groupNumbers = numbers.filter(n => n.group === group);
  const target = groupNumbers[index];

  if (!target) {
    return res.status(404).json({ success: false, error: 'Number not found in group' });
  }

  // Locate the actual index in the full numbers array
  const realIndex = numbers.findIndex(n => n.number === target.number && n.group === group);

  // Update fields
  numbers[realIndex] = {
    ...numbers[realIndex],
    countryCode: countryCode || target.countryCode,
    number: number || target.number,
    status: status || target.status,
    message: message !== undefined ? message : target.message
  };

  await saveNumbers(numbers);
  res.json({ success: true });
});


// app.post('/api/update-message', requireAdmin, async (req, res) => {
//   const { group, index, message } = req.body;
//   const numbers = await getNumbers();
//   const groupNumbers = numbers.filter(n => n.group === group);
//   if (groupNumbers[index]) groupNumbers[index].message = message;
//   await saveNumbers(numbers); // Save updated full list
//   res.json({ success: true });
// });

// app.post('/api/update-status', requireAdmin, async (req, res) => {
//   const { group, index, status } = req.body;
//   const numbers = await getNumbers();
//   const groupNumbers = numbers.filter(n => n.group === group);
//   if (groupNumbers[index]) groupNumbers[index].status = status;
//   await saveNumbers(numbers);
//   res.json({ success: true });
// });

app.post('/api/delete-number', requireAdmin, async (req, res) => {
  const { group, index } = req.body;
  let numbers = await getNumbers();
  const groupNumbers = numbers.filter(n => n.group === group);
  const target = groupNumbers[index];
  if (target) {
    numbers = numbers.filter(n => !(n.number === target.number && n.group === target.group));
    await saveNumbers(numbers);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false });
  }
});

//API for redirecting WhatsApp messages
let lastRandomIndex = null;
const recentRedirects = new Map();

function normalizeCountryCode(code) {
  return code.replace(/^\+/, '');
}

function normalizeNumber(number) {
  return number.replace(/^(\+)?(\d+)$/, '$2');
}

// API: Group-specific WhatsApp redirect
app.get('/api/whatsapp-redirect/:group', async (req, res) => {
  const group = decodeURIComponent(req.params.group);
  const numbers = await getNumbers();

  const groupNumbers = numbers.filter(
    n => n.group === group && n.status === 'active'
  );
  if (!groupNumbers.length) {
    return res.status(404).send(`No active numbers found in group: ${group}`);
  }

  let randomIndex;
  if (groupNumbers.length === 1) {
    randomIndex = 0;
  } else {
    do {
      randomIndex = Math.floor(Math.random() * groupNumbers.length);
    } while (randomIndex === lastRandomIndex);
  }
  lastRandomIndex = randomIndex;

  const n = groupNumbers[randomIndex];
  n.countryCode = normalizeCountryCode(n.countryCode);
  n.number = normalizeNumber(n.number);
  const phone = n.countryCode.replace('+', '') + n.number;
  const messageText = n.message && n.message.trim() ? n.message : 'Hola, quiero un usuario';
  const message = encodeURIComponent(messageText);
  const url = `https://wa.me/${phone}?text=${message}`;

  // Avoid duplicate rapid redirects
  const key = `${req.ip}:${n.countryCode}:${n.number}`;
  const now = Date.now();
  if (!recentRedirects.has(key) || now - recentRedirects.get(key) > 5000) {
    console.log(`Redirecting (Group: ${group}) to ${url}`);
    await logRedirect(n);
    recentRedirects.set(key, now);
    setTimeout(() => recentRedirects.delete(key), 6000);
  }

  res.redirect(url);
});

// import { connectDB } from './src/utils/mongo.js';

// Reuse same normalization logic as redirects.js
// function normalizeCountryCode(code) {
//   if (!code) return '';
//   return code.startsWith('+') ? code : '+' + code.replace(/[^0-9]/g, '');
// }

// function normalizeNumber(number) {
//   if (!number) return '';
//   return number.replace(/\D/g, '');
// }

app.get('/api/redirect-stats', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const numbers = await getNumbers();
  const logs = await db.collection('redirects').find({}).toArray();

  // Step 1: Calculate total redirects per group
  const groupTotals = logs.reduce((acc, log) => {
    const group = log.group || 'Ungrouped';
    acc[group] = (acc[group] || 0) + (log.count || 0);
    return acc;
  }, {});

  // Step 2: Map each number from DB to stats
  const stats = numbers.map(n => {
    const normCode = normalizeCountryCode(n.countryCode);
    const normNum = normalizeNumber(n.number);
    const group = n.group || 'Ungrouped';

    const match = logs.find(log =>
      normalizeCountryCode(log.countryCode) === normCode &&
      normalizeNumber(log.number) === normNum &&
      (log.group || 'Ungrouped') === group
    );

    const count = match?.count || 0;
    const percent = ((count / (groupTotals[group] || 1)) * 100).toFixed(1);

    return {
      group,
      countryCode: n.countryCode,
      number: n.number,
      status: n.status,
      count,
      percent
    };
  });

  res.json(stats);
});




app.get('/api/group-redirects-summary', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const redirects = await db.collection('redirects').aggregate([
    {
      $group: {
        _id: "$group",
        total: { $sum: "$count" }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]).toArray();

  const totalAll = redirects.reduce((sum, g) => sum + g.total, 0) || 1;

  const summary = redirects.map(g => ({
    group: g._id || 'Ungrouped',
    total: g.total,
    percent: ((g.total / totalAll) * 100).toFixed(1)
  }));

  res.json(summary);
});


app.post('/api/redirects/clear', requireAdmin, async (req, res) => {
  const db = await connectDB();
  await db.collection('redirects').deleteMany({});
  res.json({ success: true });
});

// // Get all messages
// app.get('/api/messages', requireAdmin, async (req, res) => {
//   const db = await connectDB();
//   const numbers = await db.collection('numbers').find().toArray();
//   // Only return numbers with a message
//   res.json(numbers.filter(n => n.message));
// });

// // Save/update messages (bulk)
// app.post('/api/messages', requireAdmin, async (req, res) => {
//   const db = await connectDB();
//   const messages = req.body;
//   if (Array.isArray(messages)) {
//     for (const msg of messages) {
//       await db.collection('numbers').updateOne(
//         { countryCode: msg.countryCode, number: msg.number },
//         { $set: { message: msg.message } }
//       );
//     }
//   }
//   res.json({ success: true });
// });

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

//API for managing groups

app.get('/group', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/groups.html'));
});

// Get all groups
app.get('/api/groups', requireAdmin, async (req, res) => {
  const db = await connectDB();
  const groups = await db.collection('groups').find().toArray();
  res.json(groups.map(g => g.name));
});

// Add a group
app.post('/api/groups', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Missing group name');
  const db = await connectDB();
  await db.collection('groups').updateOne(
    { name },
    { $setOnInsert: { name } },
    { upsert: true }
  );
  res.json({ success: true });
});

// Delete a group
app.post('/api/groups/delete', requireAdmin, async (req, res) => {
  const { name } = req.body;
  const db = await connectDB();
  await db.collection('groups').deleteOne({ name });
  // Optional: remove group from numbers too?
  // await db.collection('numbers').updateMany({ group: name }, { $unset: { group: "" } });
  res.json({ success: true });
});

app.get('/groups/:groupName', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, './src/admin/group.html'));
});

app.get('/api/group-numbers/:groupName', requireAdmin, async (req, res) => {
  const groupName = req.params.groupName;
  const numbers = await getNumbers();
  const filtered = numbers.filter(n => n.group === groupName);
  res.json(filtered);
});


app.listen(3000, () => console.log('Running on http://localhost:3000'));
