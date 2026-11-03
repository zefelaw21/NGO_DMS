require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve static frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/beneficiaries', require('./routes/beneficiaries'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/activities',    require('./routes/activities'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/users',         require('./routes/users'));

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'DevLink API is running', time: new Date() });
});

// ── Catch-all: serve frontend for any non-API route ────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n  ✅  DevLink API running at http://localhost:${PORT}`);
  console.log(`  📊  Dashboard    → http://localhost:${PORT}`);
  console.log(`  🔑  Health check → http://localhost:${PORT}/api/health\n`);
});
