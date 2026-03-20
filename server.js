/**
 * Local development server.
 * Mimics Vercel's routing so you can test everything locally.
 *
 * Usage:
 *   1. Copy .env.example to .env and add your Polygon API key
 *   2. npm install
 *   3. npm run dev
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const stockHandler = require('./api/stock');

const app = express();
const PORT = process.env.PORT || 3000;

/* Serverless function route */
app.get('/api/stock', (req, res) => stockHandler(req, res));

/* Static files */
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n  Stock Chart App running at http://localhost:${PORT}\n`);
});
