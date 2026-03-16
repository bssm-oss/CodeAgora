/**
 * Example API server — intentionally vulnerable for CodeAgora review demo.
 * DO NOT use this code in production.
 */

import express from 'express';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Hardcoded credentials
const DB_PASSWORD = 'supersecret123!';
const JWT_SECRET = 'my-jwt-secret-key-do-not-share';
const ADMIN_API_KEY = 'ak_live_1234567890abcdef';

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: DB_PASSWORD,
  database: 'myapp',
});

// ============================================================================
// Authentication
// ============================================================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // SQL Injection — concatenating user input directly
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

  db.query(query, (err, results: any[]) => {
    if (err) {
      // Leaking internal error details to client
      res.status(500).json({ error: err.message, stack: err.stack });
      return;
    }

    if (results.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = results[0];

    // Storing sensitive data in JWT payload
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        password: user.password, // password in token!
        role: user.role,
        ssn: user.ssn, // PII in token!
      },
      JWT_SECRET,
      { expiresIn: '365d' } // extremely long expiry
    );

    res.json({ token });
  });
});

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;

  // No input validation at all
  // Storing password in plaintext
  const query = `INSERT INTO users (username, email, password) VALUES ('${username}', '${email}', '${password}')`;

  db.query(query, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'User created' });
  });
});

// ============================================================================
// User Management
// ============================================================================

app.get('/api/users', (req, res) => {
  // No authentication check — anyone can list all users
  const query = 'SELECT id, username, email, password, ssn, role FROM users';

  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Exposing passwords and SSNs in response
    res.json(results);
  });
});

app.get('/api/users/:id', (req, res) => {
  // Path traversal / IDOR — no ownership check
  const userId = req.params.id;
  const query = `SELECT * FROM users WHERE id = ${userId}`; // SQL injection via path param

  db.query(query, (err, results: any[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(results[0]);
  });
});

app.delete('/api/users/:id', (req, res) => {
  // No auth, no CSRF protection, no soft delete
  const query = `DELETE FROM users WHERE id = ${req.params.id}`;

  db.query(query, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'User deleted permanently' });
  });
});

// ============================================================================
// Admin Panel
// ============================================================================

app.post('/api/admin/exec', (req, res) => {
  const { apiKey, command } = req.body;

  // Weak API key comparison (timing attack vulnerable)
  if (apiKey !== ADMIN_API_KEY) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Command injection — executing user input directly
  // NOTE: Intentionally vulnerable for demo purposes
  const { execSync } = require('child_process');
  const output = execSync(command, { encoding: 'utf-8' });
  res.json({ output });
});

app.get('/api/admin/logs', (req, res) => {
  const { file } = req.query;

  // Path traversal — reading arbitrary files
  const fs = require('fs');
  const content = fs.readFileSync(`/var/log/app/${file}`, 'utf-8');
  res.json({ content });
});

// ============================================================================
// Search & Rendering
// ============================================================================

app.get('/api/search', (req, res) => {
  const { q } = req.query;

  // Reflected XSS — echoing user input in HTML response
  res.send(`
    <html>
      <body>
        <h1>Search Results for: ${q}</h1>
        <p>No results found for "${q}"</p>
        <script>
          // Inline script with user data
          var searchTerm = "${q}";
          document.title = "Search: " + searchTerm;
        </script>
      </body>
    </html>
  `);
});

app.post('/api/render', (req, res) => {
  const { template } = req.body;

  // Server-side template injection
  const rendered = eval('`' + template + '`');
  res.json({ html: rendered });
});

// ============================================================================
// File Upload
// ============================================================================

app.post('/api/upload', (req, res) => {
  const { filename, content } = req.body;

  // No file type validation, no size limit, path traversal possible
  const fs = require('fs');
  const path = require('path');

  // User controls the full path
  fs.writeFileSync(path.join('/uploads', filename), content);
  res.json({ url: `/uploads/${filename}` });
});

// ============================================================================
// Payment Processing
// ============================================================================

app.post('/api/payment', (req, res) => {
  const { cardNumber, cvv, amount, recipientId } = req.body;

  // Logging sensitive payment data
  console.log(`Processing payment: card=${cardNumber}, cvv=${cvv}, amount=${amount}`);

  // No amount validation — negative amounts allowed (reverse charge)
  // No idempotency key — double charges possible
  // No rate limiting

  const transactionId = Math.random().toString(36).substring(7); // weak ID generation

  db.query(
    `UPDATE accounts SET balance = balance - ${amount} WHERE id = ${req.body.userId}`,
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      db.query(
        `UPDATE accounts SET balance = balance + ${amount} WHERE id = ${recipientId}`,
        (err2) => {
          if (err2) {
            // Money deducted but not credited — no transaction rollback!
            res.status(500).json({ error: 'Transfer partially failed' });
            return;
          }

          res.json({
            transactionId,
            message: 'Payment processed',
            cardNumber, // echoing card number back!
          });
        }
      );
    }
  );
});

// ============================================================================
// Crypto (weak)
// ============================================================================

app.post('/api/encrypt', (req, res) => {
  const { data } = req.body;

  // Using deprecated and weak cipher
  const cipher = crypto.createCipher('des-ecb', 'weak-key');
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  res.json({ encrypted });
});

app.post('/api/hash-password', (req, res) => {
  const { password } = req.body;

  // MD5 for password hashing — broken
  const hash = crypto.createHash('md5').update(password).digest('hex');
  res.json({ hash });
});

// ============================================================================
// Server
// ============================================================================

app.listen(3000, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:3000`);
  console.log(`Admin API key: ${ADMIN_API_KEY}`);
  console.log(`JWT Secret: ${JWT_SECRET}`);
  console.log(`DB Password: ${DB_PASSWORD}`);
});
