const express = require('express');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const { Client } = require('pg');

// Initialize database (for demo purposes)
const initDb = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const lastSlashIndex = dbUrl.lastIndexOf('/');
    const defaultDbUrl = dbUrl.substring(0, lastSlashIndex) + '/postgres';
    const dbName = dbUrl.substring(lastSlashIndex + 1);

    const client = new Client({ connectionString: defaultDbUrl });
    try {
      await client.connect();
      const res = await client.query('SELECT datname FROM pg_catalog.pg_database WHERE datname = $1', [dbName]);
      if (res.rowCount === 0) {
        console.log(`Database "${dbName}" not found. Creating...`);
        await client.query(`CREATE DATABASE "${dbName}"`);
        console.log(`Database "${dbName}" created successfully.`);
      }
    } catch (err) {
      console.error('Error checking/creating database:', err.message);
    } finally {
      await client.end();
    }
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database table "users" initialized successfully.');
  } catch (err) {
    console.error('Error initializing database table:', err.message);
  }
};

initDb();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 1. GET /users - Get all users
app.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /users/:id - Get a user by ID
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. POST /users - Create a new user
app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. PUT /users/:id - Update a user by ID
app.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const { rows } = await db.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
      [name, email, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. DELETE /users/:id - Delete a user by ID
app.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully', user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
