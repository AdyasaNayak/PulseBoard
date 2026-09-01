import {io} from 'socket.io-client'
import { useState, useEffect } from 'react'
import './App.css'

const API = 'http://localhost:3000'

function App() { //function that returns HTML like JSX, Vite mounts it on the page, when state changes, React calls App again and updates the DOM

  //pattern: [currentValue, setterFunction] = useState(startingValue)
  const [email, setEmail] = useState('jack3@test.com')
  const [password, setPassword] = useState('secret123')
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [services, setServices] = useState([])
  const [incidents, setIncidents] = useState([])
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [checks, setChecks] = useState([])
  const [socket, setSocket] = useState(null)

  async function handleSelectService(serviceId) {
  setError('')
  setSelectedId(serviceId)

  const res = await fetch(`${API}/services/${serviceId}/health-checks`, {
    credentials: 'include',
  })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || 'Could not load health checks')
    setChecks([])
    return
  }
  setChecks(data)
}

  async function loadServices(){
    const res = await fetch(`${API}/services`, {credentials: 'include'})
    const data = await res.json()
    if(!res.ok){
      setError(data.error || 'Could not load services')
      return
    }
    setServices(data)
  }

  async function loadIncidents() {
  const res = await fetch(`${API}/incidents`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || 'Could not load incidents')
    return
  }
  setIncidents(data)
}

  async function loadDashboard() {
    await loadServices()
    await loadIncidents()
  }

  async function handleAddService(e) {
  e.preventDefault()
  setError('')

  const res = await fetch(`${API}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: newName, url: newUrl }),
  })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || 'Could not add service')
    return
  }

  setNewName('')
  setNewUrl('')
  await loadServices()
}

  async function handlePause(service) {
    setError('')
    const res = await fetch(`${API}/services/${service.id}`, {
      method: 'PATCH',
      headers:{'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify({isPaused: !service.is_paused}),
    })
     const data = await res.json()
  if (!res.ok) {
    setError(data.error || 'Could not update service')
    return
  }
  await loadServices()
}
async function handleDelete(serviceId) {
  setError('')
  const res = await fetch(`${API}/services/${serviceId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || 'Could not delete service')
    return
  }
  await loadServices()
}

  async function handleLogin(e){
    e.preventDefault()
    setError('')
    setMe(null)

    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify({email, password}),
    })

    const data = await res.json()
    if(!res.ok){
      setError(data.error || 'Login failed')
      return
    }

    const meRes = await fetch(`${API}/auth/me`, {
      credentials: 'include',
    })
    const meData = await meRes.json()
    if(!meRes.ok) {
      setError(meData.error || 'Could not load /auth/me')
      return
    }
    setMe(meData)

    const svcRes = await fetch(`${API}/services`, {
  credentials: 'include',
})
const svcData = await svcRes.json()
if (!svcRes.ok) {
  setError(svcData.error || 'Could not load services')
  return
}
setServices(svcData)

const incRes = await fetch(`${API}/incidents`, {
  credentials: 'include',
})
const incData = await incRes.json()
if(!incRes.ok){
  setError(incData.error || 'Could not load incidents')
  return
}
setIncidents(incData)
  }

  async function handleLogout() {
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  setMe(null)
  setServices([])
  setIncidents([])
  setSelectedId(null)
  setChecks([])
}

useEffect(() => {
  async function restoreSession() {
    const res = await fetch(`${API}/auth/me`, {
      credentials: 'include',
    })
    if (!res.ok) return
    const meData = await res.json()
    setMe(meData)
    await loadDashboard()
  }
  restoreSession()
}, [])

useEffect(() => {
  if (!me?.workspaceId) return

  const s = io(API, { withCredentials: true })
  s.emit('join-workspace', me.workspaceId)
  s.on('workspace:updated', () => {
  loadServices()
  loadIncidents()
  if (selectedId) {
    handleSelectService(selectedId)
  }
})
  setSocket(s)

  return () => {
    s.disconnect()
    setSocket(null)
  }
}, [me?.workspaceId])

useEffect(() => {
  if (!me) return

  const id = setInterval(() => {
    loadServices()
    loadIncidents()
    if (selectedId) {
      handleSelectService(selectedId)
    }
  }, 30_000)

  return () => clearInterval(id)
}, [me, selectedId])

return (
  <main className={me ? 'app' : 'app app--login'}>
    {!me ? (
      <>
        <header className="brand">
          <div className="brand__pulse" aria-hidden="true" />
          <h1>PULSEBOARD</h1>
        </header>
        <div className="rule" />
        <p className="tagline">Real-time. Precise. Instrumented.</p>

        <form className="panel" onSubmit={handleLogin}>
          <div className="panel__head">LOGIN</div>
          <div className="panel__body">
            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>
            <button className="btn-primary" type="submit">
              Sign in
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}
      </>
    ) : (
      <>
        <header className="topbar">
          <div>
            <h1>PULSEBOARD</h1>
            <div className="topbar__meta">{me.email}</div>
          </div>
          <button type="button" className="btn" onClick={handleLogout}>
            Log out
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <section className="section">
          <div className="section__head">Add service</div>
          <div className="section__body">
            <form className="add-grid" onSubmit={handleAddService}>
              <label className="field">
                <span>Name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Payment API"
                />
              </label>
              <label className="field">
                <span>URL</span>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <button className="btn-primary" type="submit">
                Add
              </button>
            </form>
          </div>
        </section>

        <section className="section">
          <div className="section__head">Services</div>
          <div className="section__body">
            {services.length === 0 ? (
              <p className="muted">No services yet.</p>
            ) : (
              <ul className="stack">
                {services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => handleSelectService(s.id)}
                    >
                      {s.name}
                    </button>
                    <span
                      className={`status status--${
                        s.is_paused ? 'paused' : s.current_status || 'unknown'
                      }`}
                    >
                      {s.is_paused ? 'paused' : s.current_status}
                    </span>
                    <span className="muted">{s.url}</span>
                    <button type="button" className="btn" onClick={() => handlePause(s)}>
                      {s.is_paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleDelete(s.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {selectedId && (
          <section className="section">
            <div className="section__head">Recent checks</div>
            <div className="section__body">
              {checks.length === 0 ? (
                <p className="muted">No checks yet.</p>
              ) : (
                <ul className="stack">
                  {checks.map((c) => (
                    <li key={c.id}>
                      <span className={`status status--${c.success ? 'ok' : 'fail'}`}>
                        {c.success ? 'OK' : 'FAIL'}
                      </span>
                      <span className="muted">
                        {c.status_code ?? '—'} · {c.latency_ms ?? '—'}ms · {c.checked_at}
                      </span>
                      {c.error_message && (
                        <span className="muted">{c.error_message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section__head">Incidents</div>
          <div className="section__body">
            {incidents.length === 0 ? (
              <p className="muted">No incidents.</p>
            ) : (
              <ul className="stack">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <strong>{i.service_name}</strong>
                    <span className="status status--fail">{i.status}</span>
                    <span className="muted">{i.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </>
    )}
  </main>
)
}

export default App