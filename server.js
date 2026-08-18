import {pool} from './db.js';
import express from 'express';

const app = express();
app.use(express.json());

const PORT = 3000;

app.get('/', (req, res) => {
  res.send('PulseBoard API is starting to exist');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/services', async(req, res) => {
  try{
    const workspaceId = process.env.DEV_WORKSPACE_ID;
    const result = await pool.query(`SELECT id, workspace_id, name, url, interval_seconds, timeout_ms, expected_status, is_paused, current_status, created_at FROM services WHERE workspace_id = $1 ORDER BY created_at DESC`, [workspaceId]);
    res.json(result.rows);
  }
  catch(err){
    console.error(err);
    res.status(500).json({error: 'Failed to fetch services'});
  }
});

app.get('/services/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM services
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, process.env.DEV_WORKSPACE_ID]
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

app.post('/services', async(req, res) => {
  try{
    const{name, url, intervalSeconds, timeoutMs, expectedStatus} = req.body;

    if(!name || !url){
      return res.status(400).json({error:'name and url are required'});
    }
    const workspaceId = process.env.DEV_WORKSPACE_ID;

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

app.patch('/services/:id', async (req, res) => {
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
        process.env.DEV_WORKSPACE_ID,
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

app.delete('/services/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM services
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, process.env.DEV_WORKSPACE_ID]
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

app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('Postgres connected');
  } catch (err) {
    console.error('Postgres connection failed:', err.message);
  }
});

