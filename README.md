# PulseBoard

A self-hosted service health dashboard: register, add the URLs you care about, and the background worker pings them on a schedule, records health checks, and opens/resolves incidents when services go down. The React dashboard shows live updates over socket.io.

## Stack

- **API server** — Express + Postgres (`server.js`)
- **Worker** — background health checks every 30s (`worker.js`)
- **Client** — React + Vite (`client/`)
- **Live updates** — socket.io, scoped to your workspace session

## Setup

1. Install dependencies:

   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. Create `.env` (see `.env.example`):

   ```
   DATABASE_URL=postgres://user:pass@localhost:5432/pulseboard
   SESSION_SECRET=some-long-random-string
   CLIENT_ORIGIN=http://localhost:5173
   PORT=3000
   API_URL=http://localhost:3000
   ```

3. Create the database and apply the schema:

   ```bash
   createdb pulseboard
   npm run db:init
   ```

4. Run the API and the worker (two terminals):

   ```bash
   npm run dev     # API on http://localhost:3000
   npm run worker  # health-check loop
   ```

5. Run the client:

   ```bash
   cd client
   cp .env.example .env   # points VITE_API_URL at the API
   npm run dev            # dashboard on http://localhost:5173
   ```

## Notes

- The worker pushes updates to the API via `POST /internal/notify`, which only accepts requests from localhost.
- Socket connections are authenticated against the express-session store; a socket can only subscribe to the workspace of its own logged-in session.
