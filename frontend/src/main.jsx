import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Home from './Home.jsx'
import './index.css'

// Hash routing: "#/demo" is the checker, everything else is the home page. Hash routes need no server
// rewrites, so the FastAPI static mount and the Vite dev server both work unchanged. In-page anchors
// like "#how" stay on the home page.
const isDemo = () => window.location.hash.startsWith('#/demo')

function Root() {
  const [demo, setDemo] = useState(isDemo())
  useEffect(() => {
    const onHash = () => setDemo(isDemo())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    document.title = demo ? 'PAKKA · Check a payment' : 'PAKKA · Pay only for work you can see'
  }, [demo])
  return demo ? <App /> : <Home />
}

createRoot(document.getElementById('root')).render(<Root />)
