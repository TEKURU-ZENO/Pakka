// "Ask your site": owner voice Q&A over Gemini Live, answered only from verified PAKKA records.
// Browser <-> /api/live (our server) <-> Gemini Live. Mic: PCM16 16 kHz up. Reply: PCM16 24 kHz down.
import { useEffect, useRef, useState } from 'react'
import { EASE, Icon } from './ui.jsx'

const KEY_STORE = 'pakka_access_key'
const readKey = () => {
  try { return localStorage.getItem(KEY_STORE) || '' } catch { return '' }
}

const SUGGESTIONS = [
  'What happened at my site this week?',
  'இந்த வாரம் என் வீட்டில் என்ன வேலை நடந்தது?',
  'Is the roof slab done? Should I pay?',
  'Is the building safe?',
]

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
function bytesToB64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export default function AskSite({ open, onClose }) {
  const [status, setStatus] = useState('idle') // idle | connecting | ready | listening | error
  const [mode, setMode] = useState('voice') // voice | text
  const [model, setModel] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [lines, setLines] = useState([]) // {role, text, done}
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const ws = useRef(null)
  const mic = useRef(null) // {stream, ctx, node}
  const play = useRef({ ctx: null, at: 0, sources: [] })
  const scroller = useRef(null)

  // ------------------------------------------------ transcript helpers
  const append = (role, text) =>
    setLines((ls) => {
      const last = ls[ls.length - 1]
      if (last && last.role === role && !last.done) return [...ls.slice(0, -1), { ...last, text: last.text + text }]
      return [...ls, { role, text, done: false }]
    })
  const closeTurn = () => setLines((ls) => ls.map((l) => ({ ...l, done: true })))
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [lines])

  // ------------------------------------------------ playback (24 kHz PCM16)
  function playChunk(b64) {
    const p = play.current
    if (!p.ctx) p.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
    const bytes = b64ToBytes(b64)
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1)
    const buf = p.ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
    const src = p.ctx.createBufferSource()
    src.buffer = buf
    src.connect(p.ctx.destination)
    const start = Math.max(p.ctx.currentTime + 0.03, p.at)
    src.start(start)
    p.at = start + buf.duration
    p.sources.push(src)
    setSpeaking(true)
    src.onended = () => {
      p.sources = p.sources.filter((s) => s !== src)
      if (!p.sources.length) setSpeaking(false)
    }
  }
  function stopPlayback() {
    const p = play.current
    p.sources.forEach((s) => { try { s.stop() } catch { /* already stopped */ } })
    p.sources = []
    p.at = 0
    setSpeaking(false)
  }

  // ------------------------------------------------ socket
  function connect() {
    setStatus('connecting')
    setNote('')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${proto}://${location.host}/api/live?key=${encodeURIComponent(readKey())}`)
    ws.current = sock
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.type === 'ready') {
        setStatus('ready')
        setModel(m.model)
        setMode(m.mode === 'voice' ? 'voice' : 'text')
      } else if (m.type === 'audio') playChunk(m.data)
      else if (m.type === 'transcript') append(m.role, m.text)
      else if (m.type === 'turn_complete') closeTurn()
      else if (m.type === 'interrupted') stopPlayback()
      else if (m.type === 'error') {
        setNote(m.message)
        if (m.fallback === 'text') setMode('text')
      }
    }
    sock.onclose = (ev) => {
      stopMic(false)
      setStatus((s) => (s === 'idle' ? s : 'error'))
      if (ev.code === 4401) setNote('Access key needed. Run a check first so the app can ask for it.')
      else if (ev.code === 4429) setNote('Too many requests. Wait a few minutes.')
      setMode('text')
    }
    sock.onerror = () => setMode('text')
  }

  function disconnect() {
    stopMic(false)
    stopPlayback()
    try { ws.current?.close() } catch { /* ignore */ }
    ws.current = null
    setStatus('idle')
  }

  useEffect(() => {
    if (open) connect()
    else disconnect()
    return disconnect
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ mic (16 kHz PCM16)
  async function startMic() {
    if (!ws.current || ws.current.readyState !== 1) return
    stopPlayback() // barge-in: the owner talking over the answer stops it
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      const srcNode = ctx.createMediaStreamSource(stream)
      const node = ctx.createScriptProcessor(2048, 1, 1)
      node.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(f.length)
        for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff
        if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ type: 'audio', data: bytesToB64(new Uint8Array(pcm.buffer)) }))
      }
      srcNode.connect(node)
      node.connect(ctx.destination)
      mic.current = { stream, ctx, node }
      setStatus('listening')
    } catch {
      setNote('Microphone not available. Type your question instead.')
      setMode('text')
    }
  }
  function stopMic(sendEnd = true) {
    const m = mic.current
    if (!m) return
    m.node.disconnect()
    m.stream.getTracks().forEach((t) => t.stop())
    m.ctx.close()
    mic.current = null
    if (sendEnd && ws.current?.readyState === 1) ws.current.send(JSON.stringify({ type: 'end' }))
    setStatus((s) => (s === 'listening' ? 'ready' : s))
  }

  // ------------------------------------------------ typed questions
  async function ask(text) {
    const q = text.trim()
    if (!q) return
    setDraft('')
    setLines((ls) => [...ls.map((l) => ({ ...l, done: true })), { role: 'owner', text: q, done: true }])
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({ type: 'text', text: q }))
      return
    }
    try {
      const headers = { 'Content-Type': 'application/json' }
      const key = readKey()
      if (key) headers['X-Pakka-Key'] = key
      const r = await fetch('/api/ask', { method: 'POST', headers, body: JSON.stringify({ question: q }) })
      const body = await r.json()
      append('pakka', body.answer || body.detail || 'No answer.')
      closeTurn()
      if ('speechSynthesis' in window && body.answer) {
        const u = new SpeechSynthesisUtterance(body.answer)
        u.lang = /[஀-௿]/.test(body.answer) ? 'ta-IN' : 'en-IN'
        window.speechSynthesis.speak(u)
      }
    } catch {
      setNote('Could not reach PAKKA.')
    }
  }

  if (!open) return null
  const listening = status === 'listening'
  const live = status === 'ready' || listening

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Ask your site">
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[2rem] bg-[#1A1714] text-paper-light shadow-float ring-1 ring-white/10 sm:rounded-[2rem]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-ember-500/20 blur-3xl" />

        {/* header */}
        <div className="relative flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/50">
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-moss-100' : status === 'connecting' ? 'bg-ember-300' : 'bg-paper/30'}`} />
              {status === 'connecting' ? 'Connecting…' : live ? `Gemini Live · ${model}` : 'Offline · text answers'}
            </div>
            <h2 className="mt-2 font-display text-4xl leading-none">
              Ask your <em className="text-ember-200">site.</em>
            </h2>
            <p className="mt-2 text-sm font-light text-paper/55">In Tamil or English. Answers come only from checks PAKKA has verified.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10 transition-colors duration-500 ease-lux hover:bg-white/10">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* transcript */}
        <div ref={scroller} className="relative min-h-[160px] flex-1 space-y-3 overflow-y-auto px-6 py-2">
          {lines.length === 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className={`rounded-full bg-white/[0.05] px-4 py-2 text-left text-sm text-paper/80 ring-1 ring-white/10 transition-colors duration-500 ${EASE} hover:bg-white/10`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`flex ${l.role === 'owner' ? 'justify-end' : 'justify-start'}`}>
              <p className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                l.role === 'owner' ? 'rounded-tr-md bg-ember-300 text-ink' : 'rounded-tl-md bg-white/[0.06] text-paper-light ring-1 ring-white/10'
              }`}>
                {l.text}
              </p>
            </div>
          ))}
        </div>

        {/* controls */}
        <div className="relative border-t border-white/10 px-6 pb-6 pt-5">
          {mode === 'voice' && (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={listening ? () => stopMic(true) : startMic}
                disabled={!live}
                aria-pressed={listening}
                aria-label={listening ? 'Stop and send' : 'Start talking'}
                className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-ember-300 text-ink transition-transform duration-500 ease-lux active:scale-95 disabled:opacity-40"
              >
                {(listening || speaking) && (
                  <>
                    <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-ember-300/40" />
                    <span aria-hidden="true" className="absolute -inset-3 animate-breathe rounded-full ring-1 ring-ember-300/40" />
                  </>
                )}
                <Icon name={listening ? 'x' : 'mic'} className="relative h-7 w-7" strokeWidth={1.5} />
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/50">
                {listening ? 'Listening · tap to send' : speaking ? 'PAKKA is answering' : live ? 'Tap and ask' : 'Connecting…'}
              </span>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(draft)
            }}
            className={`flex items-center gap-2 ${mode === 'voice' ? 'mt-5' : ''}`}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={mode === 'voice' ? 'Or type a question…' : 'Type your question…'}
              className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-5 py-3 text-sm text-paper-light outline-none ring-1 ring-white/10 placeholder:text-paper/35 focus:ring-ember-300/60"
            />
            <button type="submit" aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-light text-ink">
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          </form>
          {note && <p className="mt-3 text-center text-xs text-ember-200">{note}</p>}
          <p className="mt-4 text-center text-[11px] font-light leading-relaxed text-paper/40">
            PAKKA never certifies safety and never tells you whether to pay. It only reports what the checks show.
          </p>
        </div>
      </div>
    </div>
  )
}
