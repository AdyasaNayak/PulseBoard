import 'dotenv/config';
import { z } from 'zod';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { createHmac, timingSafeEqual } from 'node:crypto';

import {pool} from './db.js';
import express from 'express';

import {createServer} from 'http';
import {Server} from 'socket.io';

for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'CLIENT_ORIGIN']) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';

//shared store so the socket.io layer can authenticate connections by session id
const sessionStore = new session.MemoryStore();

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, 
      sameSite: isProd ? 'none' : 'lax', 
      secure: isProd, 
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, //only the vite app may call the API from a browser
    credentials: true, //allows cookies on cross origin requests
  })
);

const PORT = Number(process.env.PORT) || 3000;

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

const authBodySchema = z.object({
  email: z.string().trim().email('Invalid email'),

  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const httpUrl = z.httpUrl('URL must be http or https');

const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200, 'name is too long'),
  url: httpUrl,
  intervalSeconds: z.coerce.number().int().min(5, 'intervalSeconds must be at least 5').max(86400).optional(),
  timeoutMs: z.coerce.number().int().min(100, 'timeoutMs must be at least 100').max(60000).optional(),
  expectedStatus: z.coerce.number().int().min(100).max(599).optional(),
});

const serviceUpdateSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').max(200, 'name is too long').optional(),
  url: httpUrl.optional(),
  intervalSeconds: z.coerce.number().int().min(5, 'intervalSeconds must be at least 5').max(86400).optional(),
  timeoutMs: z.coerce.number().int().min(100, 'timeoutMs must be at least 100').max(60000).optional(),
  expectedStatus: z.coerce.number().int().min(100).max(599).optional(),
  isPaused: z.boolean().optional(),
});

function parseServiceId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function firstIssue(parsed) {
  return parsed.error.issues[0]?.message || 'Invalid input';
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
    const serviceId = parseServiceId(req);
    if (serviceId === null) {
      return res.status(404).json({error: 'Service not found'});
    }
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

//incidents for one service if you own it
app.get('/services/:id/incidents', requireAuth, async (req, res) => {
  try {
    const serviceId = parseServiceId(req);
    if (serviceId === null) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const workspaceId = req.session.workspaceId;

    const owned = await pool.query(
      `SELECT id FROM services WHERE id = $1 AND workspace_id = $2`,
      [serviceId, workspaceId]
    );  

    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const incidents = await pool.query(
      `SELECT id, service_id, severity, status, summary, started_at, resolved_at
       FROM incidents
       WHERE service_id = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [serviceId]
    );

    res.json(incidents.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

//All incidents in your workspace (join with service name)

//this route answers-Show me recent incident for my workspace

app.get('/incidents', requireAuth, async (req, res) => {
  //If there's no logged-in session, requireAuth never runs.You only get incidents after login(cookie->session)
  try {
    const workspaceId = req.session.workspaceId; //req.session.workspaceId is set at login.Incidents don't store workspace_id themselves.They store service_id.So we use the session's workspace to scope the query:"only services in my workspace."

    const incidents = await pool.query(
      `SELECT i.id, i.service_id, s.name AS service_name,
              i.severity, i.status, i.summary, i.started_at, i.resolved_at
       FROM incidents i
       JOIN services s ON s.id = i.service_id
       WHERE s.workspace_id = $1
       ORDER BY i.started_at DESC
       LIMIT 50`,
      [workspaceId]
    );
    //i = short alias, JOIN services...=attach the service row for each incident, WHERE s.workspace_id...=security+multi-tenant:never return another user's incidents, ORDER BY ...DESC=newest first, LIMIT 50=cap payload
    res.json(incidents.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});


app.get('/services/:id', requireAuth, async (req, res) => {
  try {
    const serviceId = parseServiceId(req);
    if (serviceId === null) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const result = await pool.query(
      `SELECT * FROM services
       WHERE id = $1 AND workspace_id = $2`,
      [serviceId, req.session.workspaceId]
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
    const parsed = serviceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({error: firstIssue(parsed)});
    }
    const {name, url, intervalSeconds, timeoutMs, expectedStatus} = parsed.data;
    const workspaceId = req.session.workspaceId;

    const result = await pool.query(
      `INSERT INTO services(
      workspace_id, name, url, interval_seconds, timeout_ms, expected_status) VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        workspaceId, name, url, intervalSeconds ?? 30, timeoutMs ?? 5000, expectedStatus ?? 200,
      ]
    );  
    notifyWorkspace(workspaceId);
    res.status(201).json(result.rows[0]);
  }
  catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to create service'});
  }
});

app.patch('/services/:id', requireAuth, async (req, res) => {
  try {
    const serviceId = parseServiceId(req);
    if (serviceId === null) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const parsed = serviceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({error: firstIssue(parsed)});
    }
    const { name, url, intervalSeconds, timeoutMs, expectedStatus, isPaused } =
      parsed.data;

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
        serviceId,
        req.session.workspaceId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    notifyWorkspace(req.session.workspaceId);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.delete('/services/:id', requireAuth, async (req, res) => {
  try {
    const serviceId = parseServiceId(req);
    if (serviceId === null) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const result = await pool.query(
      `DELETE FROM services
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [serviceId, req.session.workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    notifyWorkspace(req.session.workspaceId);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.post('/auth/register', async(req, res) => {
  try{
    const parsed = authBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstIssue(parsed) });
    }
    const { email, password } = parsed.data;

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
    const parsed = authBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstIssue(parsed) });
    }
    const { email, password } = parsed.data;

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
  workspaceId: req.session.workspaceId,
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

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  },
});

//cookie-signature compatible unsigning (same algorithm express-session uses to sign connect.sid)
function unsignSessionId(signed, secret) {
  const dotIndex = signed.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const value = signed.slice(0, dotIndex);
  const mac = signed.slice(dotIndex + 1);
  const expected = createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');
  const received = mac.replace(/=+$/, '');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== 'connect.sid') continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    //express-session signs the sid and prefixes it with 's:' before storing the cookie
    return value.startsWith('s:') ? value.slice(2) : value;
  }
  return null;
}

io.use((socket, next) => {
  //only allow sockets backed by a valid, logged-in session
  const signed = parseSessionCookie(socket.request.headers.cookie);
  const sid = signed ? unsignSessionId(signed, process.env.SESSION_SECRET) : null;
  if (!sid) {
    return next(new Error('unauthorized'));
  }
  sessionStore.get(sid, (err, sess) => {
    if (err || !sess || !sess.userId) {
      return next(new Error('unauthorized'));
    }
    socket.data.userId = sess.userId;
    socket.data.workspaceId = sess.workspaceId;
    next();
  });
});

io.on('connection', (socket) => {
  socket.on('join-workspace', (workspaceId) => {
    //a socket may only listen to the workspace of its own session
    if (
      socket.data.workspaceId != null &&
      String(workspaceId) === String(socket.data.workspaceId)
    ) {
      socket.join(`workspace:${socket.data.workspaceId}`);
    }
  });
});

function notifyWorkspace(workspaceId){
  if(!workspaceId) return;
  io.to(`workspace:${workspaceId}`).emit('workspace:updated');
}

app.post('/internal/notify', (req, res) => {
  //loopback-only: this endpoint exists so the worker process on the same host can push updates
  const remote = req.socket.remoteAddress || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { workspaceId } = req.body;
  notifyWorkspace(workspaceId);
  res.json({ ok: true });
});

httpServer.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('Postgres connected');
  } catch (err) {
    console.error('Postgres connection failed:', err.message);
  }
});

