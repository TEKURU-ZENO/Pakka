import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Capture from './Capture.jsx'
import Home from './Home.jsx'
import Engineer from './Engineer.jsx'
import Share from './Share.jsx'
import './index.css'

// Hash routing (no server rewrites needed):
//   #/demo              the owner's verification desk
//   #/capture/<token>   the mestri's capture page (the token is the only credential)
//   #/share/<token>     read-only family view
//   #/engineer/<token>  engineer reviews the evidence and signs off
//   anything else       the home page; in-page anchors like "#how" stay on it
function route() {
  const h = window.location.hash
  const m = h.match(/^#\/capture\/([A-Za-z0-9_-]{16,64})/)
  if (m) return { name: 'capture', token: m[1] }
  const sh = h.match(/^#\/share\/([A-Za-z0-9_-]{16,64})/)
  if (sh) return { name: 'share', token: sh[1] }
  const en = h.match(/^#\/engineer\/([A-Za-z0-9_-]{16,64})/)
  if (en) return { name: 'engineer', token: en[1] }
  if (h.startsWith('#/demo')) return { name: 'demo' }
  return { name: 'home' }
}

function Root() {
  const [r, setR] = useState(route())
  useEffect(() => {
    const onHash = () => setR(route())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (r.name === 'demo') document.title = 'PAKKA · Check a payment'
    else if (r.name === 'home') document.title = 'PAKKA · Pay only for work you can see'
  }, [r.name])
  if (r.name === 'capture') return <Capture token={r.token} />
  if (r.name === 'share') return <Share token={r.token} />
  if (r.name === 'engineer') return <Engineer token={r.token} />
  return r.name === 'demo' ? <App /> : <Home />
}

createRoot(document.getElementById('root')).render(<Root />)
