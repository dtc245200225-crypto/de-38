const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
const port = Number(process.env.PORT || 5000);
const allowedCategories = new Set(['Ăn uống', 'Giải trí', 'Hóa đơn', 'Khác']);

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

client.collectDefaultMetrics({ register: client.register });

const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 5],
});

app.use((req, res, next) => {
  const end = requestDuration.startTimer();
  const route = req.path.startsWith('/api/expenses/')
    ? '/api/expenses/:id'
    : ['/api/expenses', '/healthz', '/metrics'].includes(req.path) ? req.path : 'other';
  res.on('finish', () => end({ method: req.method, route, code: res.statusCode }));
  next();
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  user: process.env.POSTGRES_USER || 'expense_user',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'expense_db',
  port: Number(process.env.POSTGRES_PORT || 5432),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

async function initDb() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      category VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await pool.query(queryText);
      console.log('[DB Status] PostgreSQL is ready.');
      return;
    } catch (error) {
      console.error(`[DB Status] Connection attempt ${attempt}/20 failed: ${error.code || error.message}`);
      if (attempt === 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

app.get('/healthz', async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT to_regclass('public.expenses') IS NOT NULL AS ready");
    if (!rows[0].ready) return res.status(503).json({ status: 'not_ready' });
    return res.json({ status: 'ok' });
  } catch (_error) {
    return res.status(503).json({ status: 'not_ready' });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/expenses', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, amount, category, created_at FROM expenses ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('[DB Error] Failed to list expenses:', error.code || error.message);
    res.status(500).json({ error: 'Không thể tải danh sách chi tiêu.' });
  }
});

app.post('/api/expenses', async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const amount = Number(req.body.amount);
  const category = typeof req.body.category === 'string' ? req.body.category : '';

  if (!title || title.length > 100 || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || !allowedCategories.has(category)) {
    return res.status(400).json({ error: 'Tiêu đề, số tiền hoặc danh mục không hợp lệ.' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO expenses (title, amount, category) VALUES ($1, $2, $3) RETURNING id, title, amount, category, created_at',
      [title, amount, category],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[DB Error] Failed to create expense:', error.code || error.message);
    res.status(500).json({ error: 'Không thể lưu khoản chi.' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Mã khoản chi không hợp lệ.' });

  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy khoản chi.' });
    res.json({ message: 'Đã xóa khoản chi.' });
  } catch (error) {
    console.error('[DB Error] Failed to delete expense:', error.code || error.message);
    res.status(500).json({ error: 'Không thể xóa khoản chi.' });
  }
});

async function start() {
  await initDb();
  app.listen(port, '0.0.0.0', () => console.log(`Expense Tracker API listening on port ${port}.`));
}

start().catch((error) => {
  console.error('[Startup Error] Database initialization failed:', error.code || error.message);
  process.exit(1);
});
