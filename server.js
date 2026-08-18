import express from 'express';

const app = express();
app.use(express.json());

const PORT = 3000;

let nextId = 1;
const services = [];

app.get('/', (req, res) => {
  res.send('PulseBoard API is starting to exist');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/services', (req, res) => {
  res.json(services);
});

app.get('/services/:id', (req, res) => {
  const id = Number(req.params.id);
  const service = services.find((s) => s.id === id);

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  res.json(service);
});

app.post('/services', (req, res) => {
  const { name, url, intervalSeconds, timeoutMs, expectedStatus } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: 'name and url are required' });
  }

  const service = {
    id: nextId++,
    name,
    url,
    intervalSeconds: intervalSeconds ?? 30,
    timeoutMs: timeoutMs ?? 5000,
    expectedStatus: expectedStatus ?? 200,
    isPaused: false,
    createdAt: new Date().toISOString(),
  };

  services.push(service);
  res.status(201).json(service);
});

app.patch('/services/:id', (req, res) => {
  const id = Number(req.params.id);
  const service = services.find((s) => s.id === id);

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const { name, url, intervalSeconds, timeoutMs, expectedStatus, isPaused } =
    req.body;

  if (name !== undefined) service.name = name;
  if (url !== undefined) service.url = url;
  if (intervalSeconds !== undefined) service.intervalSeconds = intervalSeconds;
  if (timeoutMs !== undefined) service.timeoutMs = timeoutMs;
  if (expectedStatus !== undefined) service.expectedStatus = expectedStatus;
  if (isPaused !== undefined) service.isPaused = isPaused;

  res.json(service);
});

app.delete('/services/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = services.findIndex((s) => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const [deleted] = services.splice(index, 1);
  res.json(deleted);
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

