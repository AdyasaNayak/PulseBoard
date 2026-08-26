import session from 'express-session';
import bcrypt from 'bcrypt';

import {pool} from './db.js';
import express from 'express';

const app = express();
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

const PORT = 3000;

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

app.get('/', (req, res) => {
  res.send('PulseBoard API is starting to exist');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/services', requireAuth, async(req, res) => {
  try{
    const workspaceId = req.session.workspaceId;
    const result = await pool.query(`SELECT id, workspace_id, name, url, interval_seconds, timeout_ms, expected_status, is_paused, current_status, created_at FROM services WHERE workspace_id = $1 ORDER BY created_at DESC`, [workspaceId]);
    res.json(result.rows);
  }
  catch(err){
    console.error(err);
    res.status(500).json({error: 'Failed to fetch services'});
  }
});

app.get('/services/:id/health-checks', requireAuth, async(req, res) => {
  try{
    //next: verify service belongs to workspace, then SELECT health_checks
    // res.status(501).json({message: 'health-checks not implemented yet'}); replace with
    const serviceId = req.params.id;
    const workspaceId = req.session.workspaceId;

    const owned = await pool.query(
      `SELECT id FROM services WHERE id = $1 AND workspace_id = $2`, [serviceId, workspaceId]
    );

    if(owned.rows.length === 0){
      return res.status(404).json({error: 'Service not found'});
    }

    const checks = await pool.query(
      `SELECT id, success, status_code, latency_ms, error_message, checked_at FROM health_checks WHERE service_id = $1 ORDER BY checked_at DESC LIMIT 20`, [serviceId]
    ); //recent history for the detail view

    res.json(checks.rows);
  }
  catch(err){
    console.error(err);
    res.status(500).json({error: 'Failed to fetch health checks'});
  }
});


app.get('/services/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM services
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.session.workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

app.post('/services', requireAuth, async(req, res) => {
  try{
    const{name, url, intervalSeconds, timeoutMs, expectedStatus} = req.body;

    if(!name || !url){
      return res.status(400).json({error:'name and url are required'});
    }
    const workspaceId = req.session.workspaceId;

    const result = await pool.query(
      `INSERT INTO services(
      workspace_id, name, url, interval_seconds, timeout_ms, expected_status) VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        workspaceId, name, url, intervalSeconds ?? 30, timeoutMs ?? 5000, expectedStatus ?? 200,
      ]
    );  
    res.status(201).json(result.rows[0]);
  }
  catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to create service'});
  }
});

app.patch('/services/:id', requireAuth, async (req, res) => {
  try {
    const { name, url, intervalSeconds, timeoutMs, expectedStatus, isPaused } =
      req.body;

    const result = await pool.query(
      `UPDATE services SET
         name = COALESCE($1, name),
         url = COALESCE($2, url),
         interval_seconds = COALESCE($3, interval_seconds),
         timeout_ms = COALESCE($4, timeout_ms),
         expected_status = COALESCE($5, expected_status),
         is_paused = COALESCE($6, is_paused)
       WHERE id = $7 AND workspace_id = $8
       RETURNING *`,
      [
        name ?? null,
        url ?? null,
        intervalSeconds ?? null,
        timeoutMs ?? null,
        expectedStatus ?? null,
        isPaused ?? null,
        req.params.id,
        req.session.workspaceId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.delete('/services/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM services
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, req.session.workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.post('/auth/register', async(req, res) => {
  try{
    const {email, password} = req.body;

    if(!email || !password){
      return res.status(400).json({error: 'email and password are required'});
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
   VALUES ($1, $2)
   RETURNING id, email, created_at`,
  [email, passwordHash]
    );

    const user = result.rows[0];
const workspaceResult = await pool.query(
  `INSERT INTO workspaces (owner_id, name)
   VALUES ($1, $2)
   RETURNING id, name`,
  [user.id, 'My Workspace']
);
res.status(201).json({
  user,
  workspace: workspaceResult.rows[0],
});
  }
  catch(err){
    console.error(err);
    if(err.code === '23505'){
      return res.status(409).json({error: 'Email already registered'});
    }
    res.status(500).json({error: 'Registration failed'});
  }
});

app.post('/auth/login', async(req, res) => {
  try{
    const {email, password} = req.body;

    if(!email || !password){
      return res.status(400).json({error: 'email and password are required'});
    }

    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );
    if(result.rows.length === 0){
      return res.status(401).json({error: 'Invalid email or password'});
    }

    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);

if (!ok) {
  return res.status(401).json({ error: 'Invalid email or password' });
}

req.session.userId = user.id;
req.session.email = user.email;

const ws = await pool.query(
  `SELECT id FROM workspaces WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`,
  [user.id]
);

if (ws.rows.length === 0) {
  return res.status(500).json({ error: 'No workspace found for user' });
}

req.session.workspaceId = ws.rows[0].id;

req.session.save((err) => {
  if (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create session' });
  }

  res.json({
    message: 'Logged in',
    user: { id: user.id, email: user.email },
  });
});
  }
  catch(err){
    console.error(err);
    res.status(500).json({error:'Login failed'});
  }
});

app.get('/auth/me', (req, res) => {
  if(!req.session.userId){
    return res.status(401).json({error:'Not logged in'});
  }

  res.json({
    id: req.session.userId,
    email: req.session.email,
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => { //wipe server-side session data
    if(err){
      console.error(err);
      return res.status(500).json({error: 'Logout failed'});
    }
    res.clearCookie('connect.sid'); //default express-session cookie name 
    res.json({message: 'Logged out'});
  });
});

app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('Postgres connected');
  } catch (err) {
    console.error('Postgres connection failed:', err.message);
  }
});

