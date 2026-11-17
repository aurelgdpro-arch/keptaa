// Kaptaa — API du compteur de préinscriptions
const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false });
const TOTAL = 100;

pool.on('error', e => console.error('pg', e.message));
let readyP = null;
const ensure = () => readyP || (readyP = pool.query(`CREATE TABLE IF NOT EXISTS signups (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT, os TEXT, use_case TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)`).catch(e => { readyP = null; throw e; }));

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

async function count() {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM signups');
  return r.rows[0].n;
}

http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return send(res, 200, { ok: true });
    await ensure();
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.url === '/api/count' && req.method === 'GET') return send(res, 200, { count: await count(), total: TOTAL });
    if (req.url === '/api/signup' && req.method === 'POST') {
      let body = '';
      for await (const c of req) { body += c; if (body.length > 10000) return send(res, 413, { error: 'too_large' }); }
      const d = JSON.parse(body || '{}');
      const email = String(d.email || '').trim().toLowerCase().slice(0, 200);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'email' });
      await pool.query(
        'INSERT INTO signups (email, name, os, use_case) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING',
        [email, String(d.name || '').slice(0, 80), String(d.os || '').slice(0, 20), String(d.use || '').slice(0, 80)]
      );
      const r = await pool.query('SELECT COUNT(*)::int AS rank FROM signups WHERE id <= (SELECT id FROM signups WHERE email=$1)', [email]);
      return send(res, 200, { rank: r.rows[0].rank, count: await count(), total: TOTAL });
    }
    if (req.url === '/' || req.url === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}).listen(process.env.PORT || 3000, () => console.log('Kaptaa API prête'));
