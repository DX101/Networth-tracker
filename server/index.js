require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const { authMiddleware } = require('./middleware/auth');

const assetsRoutes = require('./routes/assets');
const liabilitiesRoutes = require('./routes/liabilities');
const cashflowRoutes = require('./routes/cashflow');
const investmentsRoutes = require('./routes/investments');
const snapshotsRoutes = require('./routes/snapshots');
const settingsRoutes = require('./routes/settings');
const categoriesRoutes = require('./routes/categories');
const budgetsRoutes = require('./routes/budgets');
const authRoutes = require('./routes/auth');
const goalsRoutes = require('./routes/goals');
const subscriptionsRoutes = require('./routes/subscriptions');
const insuranceRoutes = require('./routes/insurance');
const backupRoutes = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_BUILD_PATH = process.env.CLIENT_BUILD_PATH || path.join(__dirname, '..', 'client', 'dist');

const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Public auth routes (no middleware)
app.use('/api/auth', authRoutes);

// Protected API routes
app.use('/api/assets', authMiddleware, assetsRoutes);
app.use('/api/liabilities', authMiddleware, liabilitiesRoutes);
app.use('/api/cashflow', authMiddleware, cashflowRoutes);
app.use('/api/investments', authMiddleware, investmentsRoutes);
app.use('/api/snapshots', authMiddleware, snapshotsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/categories', authMiddleware, categoriesRoutes);
app.use('/api/budgets', authMiddleware, budgetsRoutes);
app.use('/api/goals', authMiddleware, goalsRoutes);
app.use('/api/subscriptions', authMiddleware, subscriptionsRoutes);
app.use('/api/insurance', authMiddleware, insuranceRoutes);
app.use('/api/backup', backupRoutes);

// Serve static client build in production
const clientBuildPath = CLIENT_BUILD_PATH;
app.use(express.static(clientBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// Initialise DB then start listening
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (accessible locally and on LAN)`);
  });
}).catch(err => {
  console.error('Failed to initialise database:', err);
  process.exit(1);
});