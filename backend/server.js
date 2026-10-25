const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const client = require('prom-client');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

client.collectDefaultMetrics({ register: client.register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5]
});

app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => { end({ method: req.method, route: req.path, code: res.statusCode }); });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  user: process.env.POSTGRES_USER || 'expense_user',
  password: process.env.POSTGRES_PASSWORD || 'SecurePass123!@#ExP',
  database: process.env.POSTGRES_DB || 'expense_db',
  port: 5432,
});

const initDb = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      category VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('[DB Status] Ket noi database thanh cong tren IP 192.168.105.128');
  } catch (err) {
    console.error('[DB Error]', err);
  }
};
initDb();

app.get('/api/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expenses ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', async (req, res) => {
  const { title, amount, category } = req.body;
  if (!title || !amount || !category) return res.status(400).json({ error: 'Thieu thong tin' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO expenses (title, amount, category) VALUES ($1, $2, $3) RETURNING *',
      [title, amount, category]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Da xoa thanh cong' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(5000, () => console.log('Backend Express dang chay tren port 5000 (IP: 192.168.105.128)'));
