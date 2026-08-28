import { useState } from 'react'
import './App.css'

const API = 'http://localhost:3000'

function App() {
  const [email, setEmail] = useState('jack3@test.com')
  const [password, setPassword] = useState('secret123')
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [services, setServices] = useState([])


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
  }
  return (
    <main style={{ maxWidth: 420, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>PulseBoard</h1>
      <p>Login against the API (Day 8)</p>
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
    </main>
  )
}

export default App