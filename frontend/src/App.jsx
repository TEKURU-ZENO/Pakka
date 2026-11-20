// The verification desk (#/demo). Logic: upload -> /api/updates -> verdict with boxes on the photo.
// Presentation follows the PAKKA design language (see ui.jsx): paper, ink, sage, ember; drawing sheets.
import { useEffect, useRef, useState } from 'react'
import { api, VERDICT_TA } from './api.js'
import AskSite from './AskSite.jsx'
import LinkShare from './LinkShare.jsx'
import { Activity, EngineerSignoff, Ledger, PaymentPanel, PlanEditor, ShareLinks } from './OwnerPanels.jsx'
import { Bezel, EASE, Eyebrow, Icon, IslandButton, IslandNav, Reveal, RoleChip, rupees } from './ui.jsx'

const VERDICT = {
  proven: {
    label: 'Work visible', icon: 'check',
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
  location: { label: 'Location', dot: 'bg-clay-500' },
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
    // Strong enough texture to pass the server's capture-quality gate (sharpness/brightness), like a real photo.
    for (let i = 0; i < 9000; i++) {
      const v = 20 + Math.floor(Math.random() * 216)
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`
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
  engineer: { photo: 'demo_c_site_rebar.jpg' },
  formwork: { photo: 'demo_d_column_formwork.jpg' },
}

const SCENARIOS = [
  { id: 'catch', code: 'A', name: 'The catch', d: '“Slab done” on shuttering photos' },
  { id: 'happy', code: 'B', name: 'Happy path', d: 'Cast slab, claim holds' },
  { id: 'engineer', code: 'C', name: 'Engineer gate', d: 'Slab rebar mesh: needs an engineer before the pour' },
  { id: 'formwork', code: 'D', name: 'Formwork check', d: 'Columns still in shutters are not proof of concrete' },
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
  const [askOpen, setAskOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const verdictRef = useRef(null)

  useEffect(() => {
    if (result && verdictRef.current) {
      verdictRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [result])

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
    if (consent) fd.append('consent', 'true')
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
      // A real recording if one is in samples/; the silent placeholder only in mock mode (the live AI would
      // transcribe silence). Without a voice note the amount still comes from the field below.
      const voice = (await fetchSample(s.voice)) || (mock ? createSampleAudio('demo_a_mestri_voice.wav') : null)
      setFiles(voice ? [img, voice] : [img])
      setMilestoneId('m5')
    } else if (type === 'happy') {
      setFiles([await photo('#2d3748', 'SLAB SURFACE POURED')])
      setMilestoneId('m5')
    } else if (type === 'engineer') {
      setFiles([await photo('#742a2a', 'SLAB REBAR MESH')])
      setMilestoneId('m4')
    } else if (type === 'formwork') {
      setFiles([await photo('#3b4a5a', 'COLUMN FORMWORK')])
      setMilestoneId('m3')
    }
    setAmount(type === 'engineer' ? '150000' : '250000')
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
      <AskSite open={askOpen} onClose={() => setAskOpen(false)} />
      {/* Floating voice button (phones, and anywhere the nav pill hides its controls) */}
      <button
        onClick={() => setAskOpen(true)}
        aria-label="Ask your site"
        className="no-print fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ember-200 shadow-lift ring-1 ring-white/10 transition-transform duration-500 ease-lux active:scale-95 lg:hidden"
      >
        <Icon name="mic" className="h-6 w-6" />
      </button>
      <IslandNav
        tone="light"
        links={[{ label: 'Overview', href: '#/' }, { label: 'Who’s who', href: '#/roles' }]}
        right={
          <>
            <button
              onClick={() => setAskOpen(true)}
              className={`flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-paper-light transition-colors duration-500 ${EASE} hover:bg-ink-soft`}
            >
              <Icon name="mic" className="h-3.5 w-3.5" /> Ask your site
            </button>
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
          <Reveal className="flex flex-wrap items-center gap-3">
            <RoleChip role="owner" />
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
        <Reveal className="no-print lg:sticky lg:top-28">
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
              <div className="mt-2 grid grid-cols-2 gap-2">
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

              <label className="flex items-start gap-3 rounded-2xl bg-sage-50 p-3 text-xs leading-relaxed text-ink-soft ring-1 ring-sage-200">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>
                  I have the right to share these photos and voice notes. They are checked by PAKKA using Google Gemini,
                  kept for 180 days, and I can delete them any time.
                </span>
              </label>

              <IslandButton variant="ink" onClick={submit} disabled={!files.length || busy || !consent} icon="scale" className="w-full justify-between">
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
        <section id="verdict" ref={verdictRef} aria-live="polite" className="scroll-mt-28 md:scroll-mt-32">
          {!result && !busy && (
            <Empty
              plan={plan}
              history={history}
              refresh={refresh}
              onPlanSaved={() => {
                api('/api/plan').then(setPlan)
                setRefresh((n) => n + 1)
              }}
              open={(h) => {
                setResult(h)
                setFocus(null)
              }}
            />
          )}
          {busy && <Scanning />}
          {result && (
            <Verdict
              key={result.id}
              result={result}
              focus={focus}
              setFocus={setFocus}
              onChanged={(updated) => {
                if (updated) setResult(updated)
                else setResult(null)
                loadHistory()
                setRefresh((n) => n + 1)
              }}
            />
          )}
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

function RequestProof({ plan, history, open }) {
  const [milestoneId, setMilestoneId] = useState('m5')
  const [pin, setPin] = useState('') // "lat, lng"
  const [pinState, setPinState] = useState('')
  const [links, setLinks] = useState([])
  const [made, setMade] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const load = () => api('/api/capture-links').then((l) => setLinks(l || [])).catch(() => {})
  useEffect(() => { load() }, [history.length])

  function useHere() {
    if (!navigator.geolocation) return setPinState('Location not available on this device')
    setPinState('Finding…')
    navigator.geolocation.getCurrentPosition(
      (q) => {
        setPin(`${q.coords.latitude.toFixed(6)}, ${q.coords.longitude.toFixed(6)}`)
        setPinState(`Pinned here (±${Math.round(q.coords.accuracy)} m)`)
      },
      () => setPinState('Location permission denied'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function create() {
    setErr('')
    setCopied(false)
    const body = { milestone_id: milestoneId }
    if (pin.trim()) {
      const [lat, lng] = pin.split(',').map((x) => parseFloat(x))
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setErr('Site pin should look like 13.0827, 80.2707')
      Object.assign(body, { site_lat: lat, site_lng: lng })
    }
    try {
      const l = await api('/api/capture-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setMade({ ...l, url: `${location.origin}${l.path}` })
      load()
    } catch (e) {
      setErr(e.message)
    }
  }

  const waText = made
    ? encodeURIComponent(`Please send proof for "${made.milestone_name}" using this link. Take the photos at the site with your phone camera: ${made.url}`)
    : ''

  return (
    <Reveal>
      <Bezel radius="2rem" core="bg-paper-light p-7 md:p-10">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">Mestri capture link</span>
        <h2 className="mt-3 font-display text-4xl leading-none">Request proof</h2>
        <p className="mt-3 max-w-lg text-sm font-light leading-relaxed text-ink-mute">
          Send the mestri a link for one milestone. It lists the exact shots needed, opens the phone camera (no old
          gallery photos), checks the camera time and, if you pin the site, where the photos were taken.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Milestone</span>
            <div className={fieldShell}>
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className={`${fieldCore} appearance-none`}>
                {plan.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </label>
          <label className="block">
            <span className={fieldLabel}>Site pin (optional)</span>
            <div className={`${fieldShell} flex items-center gap-1`}>
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="13.0827, 80.2707" className={`${fieldCore} font-mono`} />
              <button type="button" onClick={useHere} title="Use this device's location" className="shrink-0 rounded-[0.8rem] bg-white px-3 py-3 text-ink-soft ring-1 ring-ink/[0.06]">
                <Icon name="globe" className="h-4 w-4" />
              </button>
            </div>
            {pinState && <span className="mt-1 block text-xs text-ink-mute">{pinState}</span>}
          </label>
        </div>
        <div className="mt-6">
          <IslandButton variant="ink" onClick={create} icon="arrow">Create link</IslandButton>
        </div>
        {err && <p className="mt-4 rounded-2xl bg-clay-50 p-3 text-xs text-clay-700">{err}</p>}

        {made && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">Link for {made.milestone_name} · valid 7 days</div>
            <LinkShare path={made.path} role="mestri" title={`Send proof: ${made.milestone_name}`}
              whatsappText={`Please send proof for "${made.milestone_name}" using this link. Take the photos at the site with your phone camera:`} />
          </div>
        )}

        {links.length > 0 && (
          <ul className="mt-8">
            {links.slice(0, 6).map((l) => {
              const result = history.find((h) => h.id === l.last_update_id)
              return (
                <li key={l.token} className="flex items-center justify-between gap-3 border-t hairline py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg">{l.milestone_name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      {l.wants_location ? 'site pinned · ' : ''}{l.submissions ? `${l.submissions} sent` : 'waiting for mestri'}
                    </span>
                  </span>
                  {result ? (
                    <button onClick={() => open(result)} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs text-paper-light">See result</button>
                  ) : (
                    <span className="shrink-0 text-xs text-ink-faint">{new Date(l.expires * 1000) > new Date() ? 'open' : 'expired'}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Bezel>
    </Reveal>
  )
}

function Empty({ plan, history, open, refresh, onPlanSaved }) {
  const total = plan.reduce((s, m) => s + m.amount_inr, 0)
  return (
    <div className="space-y-6">
      <Ledger refreshKey={`${refresh}-${history.length}`} history={history} onOpen={open} />
      <Activity refreshKey={`${refresh}-${history.length}`} history={history} onOpen={open} />
      <RequestProof plan={plan} history={history} open={open} />
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
          <div className="mt-5"><PlanEditor plan={plan} onSaved={onPlanSaved} /></div>
          <ol className="mt-6">
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
                        {h.source === 'capture_link' && (
                          <span className="mt-1 inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-sage-600">
                            <Icon name="camera" className="h-3 w-3" /> via mestri link
                          </span>
                        )}
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
      <ShareLinks />
    </div>
  )
}

function Verdict({ result, focus, setFocus, onChanged }) {
  const [ta, setTa] = useState(false)
  const approved = (result.signoffs || []).some((x) => x.decision === 'approved')
  // once a licensed engineer has approved, "book the engineer" items are done
  const askNext = (result.report.ask_next || []).filter((a) => !(approved && /engineer/i.test(a)))
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
    <div className="space-y-6 scroll-mt-28 md:scroll-mt-32">
      <button onClick={() => onChanged(null)} className="no-print inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-ink-soft ring-1 ring-ink/10 hover:bg-white">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Site overview
      </button>
      {/* Verdict sheet */}
      <Reveal className="scroll-mt-28 md:scroll-mt-32">
        <Bezel radius="2rem" className="shadow-float" core={`relative overflow-hidden ${v.sheet} p-7 md:p-10`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">
              {r.milestone_name} · {rupees(r.amount_requested_inr ?? r.amount_planned_inr)}
            </span>
            <span className="flex items-center gap-2">
              <button onClick={() => setTa((t) => !t)} className="no-print rounded-full bg-white/70 px-3 py-1.5 text-[11px] ring-1 ring-ink/10" aria-pressed={ta}>
                {ta ? 'English' : 'தமிழ்'}
              </button>
              <span className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] ${v.chip}`}>
                <Icon name={v.icon} className="h-3.5 w-3.5" strokeWidth={1.75} /> {ta ? VERDICT_TA[r.verdict] : v.label}
              </span>
            </span>
          </div>
          <h2 className={`mt-6 font-display text-[clamp(2rem,3.8vw,3.25rem)] leading-[1.02] ${v.ink}`} lang={ta ? 'ta' : 'en'}>
            {(ta && r.headline_ta) || r.headline}
          </h2>
          {ta && result.milestone?.ask_for_ta?.length > 0 && r.verdict === 'not_proven' && (
            <ul className="mt-4 space-y-1 text-sm text-ink-soft" lang="ta">
              {result.milestone.ask_for_ta.map((a) => <li key={a}>· {a}</li>)}
            </ul>
          )}
          {result.source === 'capture_link' && (
            <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-sage-600">
              <Icon name="camera" className="h-3 w-3" /> Sent by the mestri through a capture link
            </p>
          )}
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

          <EngineerSignoff result={result} onSigned={(u) => onChanged(u)} />

          {result.id && <div className="no-print"><PaymentPanel result={result} /></div>}

          {askNext.length > 0 && (
            <Reveal delay={140}>
              <Bezel dark radius="2rem" className="bg-ink" core="bg-[#1A1714] p-6 text-paper-light">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-paper/50">Ask the contractor next</span>
                <ol className="mt-4 space-y-3">
                  {askNext.map((a, idx) => (
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

          <div className="no-print flex flex-wrap gap-2 px-1">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-ink-soft ring-1 ring-ink/10 hover:bg-white">
              <Icon name="copy" className="h-3.5 w-3.5" /> Print or save as PDF
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('Delete this check with its photos and voice notes? This cannot be undone.')) return
                await api(`/api/updates/${result.id}`, { method: 'DELETE' })
                onChanged(null)
              }}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-clay-700 ring-1 ring-clay-500/20 hover:bg-clay-50"
            >
              <Icon name="x" className="h-3.5 w-3.5" /> Delete this check
            </button>
          </div>
          <p className="px-2 text-xs font-light leading-relaxed text-ink-faint">
            PAKKA checks visible progress only. It never certifies structural safety and never moves money.
          </p>
        </div>
      </div>
    </div>
  )
}
