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
    <main style={{ maxWidth: 420, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>PulseBoard</h1>
      <p>{me ? 'Workspace dashboard' : 'Sign in to your workspace'}</p>
      {me && (
  <button type="button" onClick={handleLogout}>
    Log out
  </button>
)}
    {!me && (
      <form onSubmit={handleLogin}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
          />
        </label>
        <button type="submit">Log in</button>
      </form>
    )}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {me && (
  <pre style={{ background: '#f4f4f4', padding: 12 }}>
    {JSON.stringify(me, null, 2)}
  </pre>
)}

{me && (
  <form onSubmit={handleAddService}>
    <h2>Add service</h2>
    <input
      placeholder="Name"
      value={newName}
      onChange={(e) => setNewName(e.target.value)}
      style={{ display: 'block', width: '100%', marginBottom: 8 }}
    />
    <input
      placeholder="https://..."
      value={newUrl}
      onChange={(e) => setNewUrl(e.target.value)}
      style={{ display: 'block', width: '100%', marginBottom: 8 }}
    />
    <button type="submit">Add</button>
  </form>
)}

{me && <h2>Services</h2>}
{services.length > 0 && (
  <ul>
    {services.map((s) => (
      <li key={s.id}>
        <button type="button" onClick={() => handleSelectService(s.id)}>
          {s.name}
        </button>
        {' '}— {s.current_status}
        {s.is_paused ? ' (paused)' : ''} — {s.url}{' '}
        <button type="button" onClick={() => handlePause(s)}>
          {s.is_paused ? 'Resume' : 'Pause'}
        </button>{' '}
        <button type="button" onClick={() => handleDelete(s.id)}>
          Delete
        </button>
      </li>
    ))}
  </ul>
)}

{selectedId && (
  <>
    <h2>Recent checks</h2>
    {checks.length === 0 ? (
      <p>No checks yet (is the worker running?)</p>
    ) : (
      <ul>
        {checks.map((c) => (
          <li key={c.id}>
            {c.success ? 'OK' : 'FAIL'} — {c.status_code ?? '—'} —{' '}
            {c.latency_ms ?? '—'}ms — {c.checked_at}
            {c.error_message ? ` — ${c.error_message}` : ''}
          </li>
        ))}
      </ul>
    )}
  </>
)}
  {incidents.length > 0 && (
  <>
    <h2>Incidents</h2>
    <ul>
      {incidents.map((i) => (
        <li key={i.id}>
          {i.service_name} — {i.status} — {i.summary}
        </li>
      ))}
    </ul>
  </>
)}
    </main>
  )
}

export default App