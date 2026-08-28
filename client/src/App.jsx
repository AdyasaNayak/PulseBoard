import { useState } from 'react'
import './App.css'

const API = 'http://localhost:3000'

function App() {
  const [email, setEmail] = useState('jack3@test.com')
  const [password, setPassword] = useState('secret123')
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [services, setServices] = useState([])
  const [incidents, setIncidents] = useState([])


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
}

  return (
    <main style={{ maxWidth: 420, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>PulseBoard</h1>
      <p>Login against the API (Day 8)</p>
      {me && (
  <button type="button" onClick={handleLogout}>
    Log out
  </button>
)}
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
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {me && (
        <pre style={{ background: '#f4f4f4', padding: 12 }}>
          {JSON.stringify(me, null, 2)}
        </pre>
      )}
      {services.length > 0 && (
    <ul>
      {services.map((s) => (
        <li key={s.id}>
          {s.name} — {s.current_status} — {s.url}
        </li>
      ))}
    </ul>
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