// The verification desk (#/demo). Logic: upload -> /api/updates -> verdict with boxes on the photo.
// Presentation follows the PAKKA design language (see ui.jsx): paper, ink, sage, ember; drawing sheets.
import { useEffect, useRef, useState } from 'react'
import { Bezel, EASE, Eyebrow, Icon, IslandButton, IslandNav, Reveal, rupees } from './ui.jsx'

const VERDICT = {
  proven: {
    label: 'Proven', icon: 'check',
    sheet: 'bg-moss-50', ink: 'text-moss-700', chip: 'bg-moss-500 text-paper-light', accent: 'text-moss-500',
  },
  not_proven: {
    label: 'Not proven yet', icon: 'x',
    sheet: 'bg-ochre-50', ink: 'text-ochre-700', chip: 'bg-ochre-500 text-paper-light', accent: 'text-ochre-500',
  },
  needs_engineer: {
    label: 'Needs an engineer', icon: 'hardhat',
    sheet: 'bg-clay-50', ink: 'text-clay-700', chip: 'bg-clay-500 text-paper-light', accent: 'text-clay-500',
  },
}

const KIND = {
  ok: { label: 'Seen', dot: 'bg-moss-500', box: 'border-moss-100 bg-moss-500/15', tag: 'bg-moss-500' },
  seen: { label: 'Also seen', dot: 'bg-sage-400', box: 'border-sage-200 bg-sage-400/15', tag: 'bg-sage-600' },
  missing: { label: 'Missing', dot: 'bg-ochre-500' },
  behind: { label: 'Behind', dot: 'bg-ochre-500' },
  defect: { label: 'Defect', dot: 'bg-clay-500', box: 'border-clay-100 bg-clay-500/20', tag: 'bg-clay-500' },
  possible: { label: 'Possible', dot: 'bg-ember-400', box: 'border-ember-200 bg-ember-400/15', tag: 'bg-ember-600' },
  unclear: { label: 'Unclear', dot: 'bg-ink-faint' },
  amount: { label: 'Amount', dot: 'bg-clay-500' },
  repeat: { label: 'Repeat', dot: 'bg-clay-500' },
  claim: { label: 'Claim', dot: 'bg-ember-500' },
  note: { label: 'Note', dot: 'bg-sage-300' },
}

// Access key for the deployed demo (server sets PAKKA_ACCESS_KEY). Asked once, remembered per browser.
const KEY_STORE = 'pakka_access_key'
function readKey() {
  try { return localStorage.getItem(KEY_STORE) || '' } catch { return '' }
}
function writeKey(k) {
  try { localStorage.setItem(KEY_STORE, k) } catch { /* private mode: ask again next time */ }
}

async function api(url, options = {}, retried = false) {
  const headers = { ...(options.headers || {}) }
  const key = readKey()
  if (key) headers['X-Pakka-Key'] = key
  const r = await fetch(url, { ...options, headers })
  if (r.status === 401 && !retried) {
    const entered = window.prompt('Enter the PAKKA access key')
    if (entered) {
      writeKey(entered.trim())
      return api(url, options, true)
    }
  }
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { /* not JSON, e.g. a proxy error page */ }
  if (!r.ok) throw new Error((body && body.detail) || `Check failed (${r.status}). Try again in a moment.`)
  return body
}

function createSampleFile(name, color, label) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 400, 300)
    // Texture + randomness: each demo run is a new photo, like a real site photo would be.
    for (let i = 0; i < 6000; i++) {
      const v = Math.floor(Math.random() * 90)
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`
      ctx.fillRect(Math.random() * 400, Math.random() * 300, 3, 3)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 20px monospace'
    ctx.fillText(label, 30, 150)
    canvas.toBlob((blob) => {
      resolve(new File([blob || ''], name, { type: 'image/jpeg' }))
    }, 'image/jpeg')
  })
}

// A real (silent, 1 s) WAV so the server's file-type check accepts it. Mock mode reads the filename.
function createSampleAudio(name) {
  const rate = 8000
  const samples = rate
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples * 2, true)
  return new File([buf], name, { type: 'audio/wav' })
}

// Real demo media: drop files with these names into frontend/public/samples/ (keep the keywords: mock mode
// picks its canned answer from them). Without them, the buttons fall back to synthetic images, which only
// make sense in mock mode: the real AI will rightly say a drawn rectangle is not a construction site.
const SAMPLES = {
  catch: { photo: 'demo_a_site_shuttering.jpg', voice: 'demo_a_mestri_voice.opus' },
  happy: { photo: 'demo_b_site_slab.jpg' },
  defect: { photo: 'demo_c_column_honeycomb.jpg' },
}

const SCENARIOS = [
  { id: 'catch', code: 'A', name: 'The catch', d: '“Slab done” on shuttering photos' },
  { id: 'happy', code: 'B', name: 'Happy path', d: 'Cast slab, claim holds' },
  { id: 'defect', code: 'C', name: 'Safety net', d: 'Honeycombed column' },
]

async function fetchSample(name) {
  try {
    const r = await fetch(`/samples/${name}`)
    const type = r.headers.get('content-type') || ''
    if (!r.ok || type.includes('text/html')) return null
    const blob = await r.blob()
    return new File([blob], name, { type: blob.type || type })
  } catch {
    return null
  }
}

const fieldLabel = 'block text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute'
const fieldShell = 'mt-2 rounded-2xl bg-ink/[0.035] p-1 ring-1 ring-ink/[0.06]'
const fieldCore = `w-full rounded-[0.8rem] bg-paper-light px-4 py-3 text-sm text-ink shadow-inner-hi outline-none transition-shadow duration-500 ${EASE} placeholder:text-ink-faint focus:ring-1 focus:ring-sage-400`

export default function App() {
  const [plan, setPlan] = useState([])
  const [milestoneId, setMilestoneId] = useState('')
  const [amount, setAmount] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [focus, setFocus] = useState(null) // finding index highlighted on the photo
  const [canReset, setCanReset] = useState(false)
  const [mock, setMock] = useState(true)
  const [model, setModel] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState([])
  const [scenario, setScenario] = useState('')

  const loadHistory = () =>
    api('/api/updates')
      .then((h) => setHistory(h || []))
      .catch(() => {})

  useEffect(() => {
    api('/api/plan')
      .then(setPlan)
      .catch(() => setError('Backend not reachable'))
    api('/api/health')
      .then((h) => {
        setCanReset(Boolean(h && h.demo_reset))
        setMock(Boolean(h && h.mock))
        setModel((h && h.model) || '')
      })
      .catch(() => {})
    loadHistory()
  }, [])

  async function resetDemo() {
    if (!window.confirm('Clear all checks, photo fingerprints and verified milestones on this server?')) return
    try {
      await api('/api/demo/reset', { method: 'POST' })
      setHistory([])
      setResult(null)
      setFocus(null)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function submit() {
    if (!files.length) return
    setBusy(true)
    setError('')
    setResult(null)
    setFocus(null)
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    if (milestoneId) fd.append('milestone_id', milestoneId)
    if (amount) fd.append('amount_inr', amount)
    try {
      setResult(await api('/api/updates', { method: 'POST', body: fd }))
      loadHistory()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function loadScenario(type) {
    setBusy(true)
    setScenario(type)
    const s = SAMPLES[type]
    let synthetic = false
    const photo = async (color, label) => {
      const real = await fetchSample(s.photo)
      if (real) return real
      synthetic = true
      return createSampleFile(s.photo, color, label)
    }
    if (type === 'catch') {
      const img = await photo('#4a5568', 'SHUTTERING IN PLACE')
      const voice = (await fetchSample(s.voice)) || createSampleAudio('demo_a_mestri_voice.wav')
      setFiles([img, voice])
      setMilestoneId('m5')
    } else if (type === 'happy') {
      setFiles([await photo('#2d3748', 'SLAB SURFACE POURED')])
      setMilestoneId('m5')
    } else if (type === 'defect') {
      setFiles([await photo('#742a2a', 'HONEYCOMB DEFECT')])
      setMilestoneId('m3')
    }
    setAmount('250000')
    setNotice(
      synthetic && !mock
        ? 'This demo uses a drawn sample image. The live AI will (correctly) say it is not a site photo. ' +
            'Add real photos to frontend/public/samples/ for live demos.'
        : '',
    )
    setResult(null)
    setError('')
    setBusy(false)
  }

  const fileIcon = (f) => (f.type.startsWith('audio') ? 'mic' : f.type.startsWith('video') ? 'video' : 'camera')

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <IslandNav
        tone="light"
        links={[{ label: 'Overview', href: '#/' }]}
        right={
          <>
            <span className="flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute ring-1 ring-ink/10">
              <span className={`h-1.5 w-1.5 rounded-full ${mock ? 'bg-ember-500' : 'bg-moss-500'}`} aria-hidden="true" />
              {mock ? 'Mock mode' : model || 'Live'}
            </span>
            {canReset && (
              <button
                onClick={resetDemo}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs text-ink-soft ring-1 ring-ink/10 transition-colors duration-500 ${EASE} hover:bg-white`}
              >
                <Icon name="reset" className="h-3.5 w-3.5" /> Reset demo
              </button>
            )}
          </>
        }
        mobileExtra={
          canReset && (
            <button onClick={resetDemo} className="rounded-full px-5 py-3 text-sm ring-1 ring-ink/15">
              Reset demo
            </button>
          )
        }
      />

      <div className="bg-drafting">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-32 sm:px-8 md:pt-36">
          <Reveal>
            <Eyebrow>Verification desk</Eyebrow>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,6vw,5.25rem)] leading-[0.95] tracking-[-0.02em]">
              Check a payment <em className="text-sage-600">before you pay.</em>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-5 max-w-xl font-light leading-relaxed text-ink-mute">
              Drop in what the mestri sent. Gemini describes the site, the rules decide, and you see the proof on the
              photo.
            </p>
          </Reveal>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl items-start gap-6 px-4 pb-28 sm:px-8 lg:grid-cols-[400px_1fr]">
        {/* ------------------------------------------------ intake */}
        <Reveal className="lg:sticky lg:top-28">
          <Bezel radius="2rem" className="shadow-float" core="overflow-hidden bg-paper-light">
            <div className="bg-[#1A1714] px-6 pb-6 pt-5 text-paper-light">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                    <Icon name="hardhat" className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm">Mestri · Site update</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45">Ready for check</div>
                  </div>
                </div>
              </div>
              <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45">Demo scenarios</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadScenario(s.id)}
                    title={s.d}
                    className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition-[background-color,transform] duration-500 ${EASE} active:scale-[0.98] ${
                      scenario === s.id ? 'bg-ember-300 text-ink ring-ember-300' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="block font-display text-2xl leading-none">{s.code}</span>
                    <span className={`mt-1 block text-[10px] uppercase tracking-[0.14em] ${scenario === s.id ? 'text-ink/70' : 'text-paper/55'}`}>
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <span className={fieldLabel}>Photos, videos and voice note</span>
                <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 bg-white/60 px-4 py-6 text-center transition-colors duration-500 ease-lux hover:border-sage-500 hover:bg-white">
                  <Icon name="upload" className="h-6 w-6 text-sage-600" />
                  <span className="text-sm text-ink-soft">Choose files</span>
                  <span className="text-[11px] text-ink-faint">JPG, PNG, HEIC, MP4, MOV, OPUS, M4A · up to 10</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    className="sr-only"
                    onChange={(e) => {
                      setFiles([...(e.target.files || [])])
                      setScenario('')
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
                    {files.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-ink/[0.05]">
                        <Icon name={fileIcon(f)} className="h-4 w-4 shrink-0 text-sage-600" />
                        <span className="truncate text-ink-soft">{f.name}</span>
                        <span className="ml-auto font-mono text-[10px] text-ink-faint">{(f.size / 1024).toFixed(0)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="block">
                <span className={fieldLabel}>Milestone being claimed</span>
                <div className={fieldShell}>
                  <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className={`${fieldCore} appearance-none`}>
                    <option value="">Work it out from the voice note</option>
                    {plan.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {rupees(m.amount_inr)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="block">
                <span className={fieldLabel}>Amount requested (₹)</span>
                <div className={fieldShell}>
                  <input
                    value={amount}
                    inputMode="numeric"
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="From the voice note if empty"
                    className={`${fieldCore} font-mono`}
                  />
                </div>
              </label>

              <IslandButton variant="ink" onClick={submit} disabled={!files.length || busy} icon="scale" className="w-full justify-between">
                {busy ? 'Reading the site…' : 'Check before paying'}
              </IslandButton>

              {notice && <p className="rounded-2xl bg-ochre-50 p-4 text-xs leading-relaxed text-ochre-700 ring-1 ring-ochre-500/20">{notice}</p>}
              {error && (
                <p role="alert" className="rounded-2xl bg-clay-50 p-4 text-xs leading-relaxed text-clay-700 ring-1 ring-clay-500/20">
                  {error}
                </p>
              )}
            </div>
          </Bezel>
        </Reveal>

        {/* ------------------------------------------------ result */}
        <section aria-live="polite">
          {!result && !busy && (
            <Empty
              plan={plan}
              history={history}
              open={(h) => {
                setResult(h)
                setFocus(null)
              }}
            />
          )}
          {busy && <Scanning />}
          {result && <Verdict key={result.id} result={result} focus={focus} setFocus={setFocus} />}
        </section>
      </main>
    </div>
  )
}

function Scanning() {
  return (
    <Bezel radius="2rem" core="relative overflow-hidden bg-paper-light bg-drafting px-8 py-20 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-ember-300/30 to-transparent" />
      <Icon name="eye" className="mx-auto h-8 w-8 text-sage-600" />
      <p className="mt-6 font-display text-3xl">Gemini is reading the site…</p>
      <p className="mt-2 text-sm font-light text-ink-mute">Finding the stage, the visible elements and any defects. The rules decide next.</p>
    </Bezel>
  )
}

function Empty({ plan, history, open }) {
  const total = plan.reduce((s, m) => s + m.amount_inr, 0)
  return (
    <div className="space-y-6">
      <Reveal>
        <Bezel radius="2rem" core="bg-paper-light p-7 md:p-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">Agreed payment plan</span>
              <h2 className="mt-3 font-display text-4xl leading-none">Schedule of payments</h2>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl leading-none">{rupees(total)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-mute">{plan.length} milestones · RCC frame</div>
            </div>
          </div>
          <ol className="mt-8">
            {plan.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between gap-4 border-t hairline py-4">
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-[11px] text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-display text-xl">{m.name}</span>
                  {m.engineer_gate && (
                    <span className="whitespace-nowrap rounded-full bg-clay-50 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-clay-700 ring-1 ring-clay-500/20">
                      Engineer gate
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm tabular-nums text-ink-soft">{rupees(m.amount_inr)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-3 rounded-2xl bg-sage-50 p-4 text-sm font-light text-ink-soft ring-1 ring-sage-200">
            <Icon name="layers" className="h-5 w-5 shrink-0 text-sage-600" />
            Pick a demo scenario on the left, or upload the contractor’s photos and voice note.
          </p>
        </Bezel>
      </Reveal>

      {history.length > 0 && (
        <Reveal>
          <Bezel radius="2rem" core="bg-paper-light p-7 md:p-10">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">Site history</span>
            <h2 className="mt-3 font-display text-3xl leading-none">Past checks</h2>
            <ul className="mt-6">
              {history.slice(0, 20).map((h) => {
                const v = VERDICT[h.report.verdict] || VERDICT.not_proven
                return (
                  <li key={h.id} className="border-t hairline">
                    <button
                      onClick={() => open(h)}
                      className={`group flex w-full items-center justify-between gap-4 rounded-xl px-2 py-4 text-left transition-colors duration-500 ${EASE} hover:bg-white`}
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                          {new Date(h.created * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className="mt-1 block truncate font-display text-xl">{h.report.milestone_name}</span>
                      </span>
                      <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${v.chip}`}>
                        <Icon name={v.icon} className="h-3 w-3" strokeWidth={1.75} /> {v.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Bezel>
        </Reveal>
      )}
    </div>
  )
}

function Verdict({ result, focus, setFocus }) {
  const r = result.report
  const v = VERDICT[r.verdict] || VERDICT.not_proven
  const [shownIndex, setShownIndex] = useState(0)
  const videoRef = useRef(null)
  const pendingSeek = useRef(null)
  useEffect(() => setShownIndex(0), [result])
  const media = result.media[shownIndex]
  const seek = () => {
    const el = videoRef.current
    if (el && pendingSeek.current != null) {
      el.currentTime = pendingSeek.current
      pendingSeek.current = null
    }
  }
  useEffect(seek, [shownIndex])
  const focusFinding = (i) => {
    setFocus(i)
    const f = r.findings[i]
    if (f?.media_index != null) setShownIndex(f.media_index)
    if (f?.timestamp_s != null) {
      pendingSeek.current = f.timestamp_s
      seek()
    }
  }
  const boxes = r.findings
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.box_2d && (f.media_index ?? 0) === shownIndex)

  return (
    <div className="space-y-6">
      {/* Verdict sheet */}
      <Reveal>
        <Bezel radius="2rem" className="shadow-float" core={`relative overflow-hidden ${v.sheet} p-7 md:p-10`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">
              {r.milestone_name} · {rupees(r.amount_requested_inr ?? r.amount_planned_inr)}
            </span>
            <span className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] ${v.chip}`}>
              <Icon name={v.icon} className="h-3.5 w-3.5" strokeWidth={1.75} /> {v.label}
            </span>
          </div>
          <h2 className={`mt-6 font-display text-[clamp(2rem,3.8vw,3.25rem)] leading-[1.02] ${v.ink}`}>{r.headline}</h2>
          {result.voice && (
            <div className="mt-8 grid gap-1 border-l-2 border-ember-400 pl-5">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                <Icon name="mic" className="h-3.5 w-3.5" /> Voice note · {result.voice.language}
              </span>
              <p className="font-display text-xl italic leading-snug text-ink">“{result.voice.transcript}”</p>
              <p className="text-sm font-light text-ink-mute">{result.voice.translation_en}</p>
            </div>
          )}
        </Bezel>
      </Reveal>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Evidence: photo / video with boxes */}
        <Reveal>
          <Bezel radius="2rem" core="bg-paper-light p-3">
            <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[1.4rem] bg-[#1A1714]">
              {media?.mime.startsWith('video') ? (
                <video ref={videoRef} onLoadedMetadata={seek} src={media.url} controls className="max-h-[460px] w-full object-contain" />
              ) : (
                // The wrapper shrink-wraps the rendered image, so 0-1000 box coords map onto the photo itself,
                // not onto the letterboxed frame (portrait phone photos used to shift every box sideways).
                <div className="relative inline-block max-w-full">
                  <img src={media?.url} alt="Site upload" className="block h-auto max-h-[460px] w-auto max-w-full" />
                  {boxes.map((b) => {
                    const [y0, x0, y1, x1] = b.box_2d
                    const k = KIND[b.kind] || KIND.ok
                    const isFocused = focus === b.i
                    return (
                      <button
                        type="button"
                        key={b.i}
                        aria-label={b.text}
                        onClick={() => focusFinding(b.i)}
                        className={`absolute rounded-md border transition-[transform,box-shadow] duration-500 ${EASE} ${k.box || KIND.ok.box} ${
                          isFocused ? 'z-20 scale-[1.01] shadow-[0_0_0_2px_#F2C58A,0_0_40px_rgba(242,197,138,0.45)]' : 'z-10 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.7)]'
                        }`}
                        style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }}
                      >
                        <span className={`absolute -top-6 left-0 max-w-[160px] truncate rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white ${k.tag || KIND.ok.tag}`}>
                          {b.text.split('.')[0]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2 pt-4">
              <p className="text-sm font-light text-ink-mute">{result.observations[shownIndex]?.summary}</p>
              {result.media.length > 1 && (
                <div className="flex gap-1.5">
                  {result.media.map((m, i) => (
                    <button
                      key={m.url}
                      onClick={() => {
                        setShownIndex(i)
                        setFocus(null)
                      }}
                      className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-500 ${EASE} ${
                        i === shownIndex ? 'bg-ink text-paper-light' : 'text-ink-mute ring-1 ring-ink/10 hover:bg-white'
                      }`}
                    >
                      Upload {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Bezel>
        </Reveal>

        {/* Findings, next steps, audit */}
        <div className="space-y-6">
          <Reveal delay={80}>
            <Bezel radius="2rem" core="bg-paper-light p-6">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">What the evidence shows</span>
              <ul className="mt-4">
                {r.findings.map((f, i) => {
                  const k = KIND[f.kind] || { label: f.kind, dot: 'bg-ink-faint' }
                  return (
                    <li key={i} className="border-t hairline first:border-t-0">
                      <button
                        type="button"
                        onClick={() => focusFinding(i)}
                        aria-pressed={focus === i}
                        className={`flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-500 ${EASE} ${
                          focus === i ? 'bg-ember-50 ring-1 ring-ember-300/60' : 'hover:bg-white'
                        }`}
                      >
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${k.dot}`} />
                        <span className="text-sm leading-relaxed text-ink-soft">
                          <span className="mr-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">{k.label}</span>
                          {f.text}
                          {f.timestamp_s != null && (
                            <span className="ml-1 inline-flex items-center gap-1 font-mono text-xs text-sage-600 underline underline-offset-2">
                              <Icon name="play" className="h-3 w-3" /> {f.timestamp_s}s
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Bezel>
          </Reveal>

          {r.ask_next.length > 0 && (
            <Reveal delay={140}>
              <Bezel dark radius="2rem" className="bg-ink" core="bg-[#1A1714] p-6 text-paper-light">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-paper/50">Ask the contractor next</span>
                <ol className="mt-4 space-y-3">
                  {r.ask_next.map((a, idx) => (
                    <li key={idx} className="flex gap-4 text-sm font-light leading-relaxed text-paper/80">
                      <span className="font-mono text-[11px] text-ember-300">{String(idx + 1).padStart(2, '0')}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              </Bezel>
            </Reveal>
          )}

          {r.audit_stamp && (
            <Reveal delay={200}>
              <div className="grid grid-cols-2 overflow-hidden rounded-2xl font-mono text-[9.5px] uppercase tracking-[0.14em] ring-1 ring-ink/10">
                {[
                  ['Model', r.audit_stamp.model],
                  ['Prompt', r.audit_stamp.prompt_version],
                  ['Rules', `v${r.audit_stamp.rules_version}`],
                  ['Thresholds', `E≥${r.audit_stamp.thresholds.element_min_conf} · S≥${r.audit_stamp.thresholds.stage_min_conf}`],
                ].map(([k, val], i) => (
                  <div key={k} className={`bg-paper-light px-4 py-3 ${i % 2 ? 'border-l hairline' : ''} ${i > 1 ? 'border-t hairline' : ''}`}>
                    <div className="text-ink-faint">{k}</div>
                    <div className="mt-0.5 truncate normal-case tracking-normal text-ink">{val}</div>
                  </div>
                ))}
                <div className="col-span-2 flex items-center gap-2 border-t hairline bg-moss-50 px-4 py-3 text-moss-700">
                  <Icon name="check" className="h-3.5 w-3.5" strokeWidth={1.75} /> Human decides payment
                </div>
              </div>
            </Reveal>
          )}

          <p className="px-2 text-xs font-light leading-relaxed text-ink-faint">
            PAKKA checks visible progress only. It never certifies structural safety and never moves money.
          </p>
        </div>
      </div>
    </div>
  )
}
