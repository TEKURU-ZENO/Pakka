import { useEffect, useState } from 'react'

const VERDICT = {
  proven: { label: 'Proven', tone: 'bg-emerald-50 text-emerald-950 border-emerald-300' },
  not_proven: { label: 'Not proven yet', tone: 'bg-amber-50 text-amber-950 border-amber-300' },
  needs_engineer: { label: 'Needs an engineer', tone: 'bg-rose-50 text-rose-950 border-rose-300' },
}

const KIND_DOT = {
  ok: 'bg-emerald-500',
  seen: 'bg-sky-500',
  missing: 'bg-amber-500',
  behind: 'bg-amber-500',
  unclear: 'bg-stone-400',
  defect: 'bg-rose-500',
  amount: 'bg-rose-500',
}

const rupees = (n) => (n == null ? '—' : '₹' + n.toLocaleString('en-IN'))

function createSampleFile(name, color, label) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 20px monospace'
    ctx.fillText(label, 30, 150)
    canvas.toBlob((blob) => {
      resolve(new File([blob || ''], name, { type: 'image/jpeg' }))
    }, 'image/jpeg')
  })
}

function createSampleAudio(name) {
  const blob = new Blob(['sample audio track'], { type: 'audio/ogg' })
  return new File([blob], name, { type: 'audio/ogg' })
}

export default function App() {
  const [plan, setPlan] = useState([])
  const [milestoneId, setMilestoneId] = useState('')
  const [amount, setAmount] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [focus, setFocus] = useState(null) // finding index highlighted on the photo

  useEffect(() => {
    fetch('/api/plan')
      .then((r) => r.json())
      .then(setPlan)
      .catch(() => setError('Backend not reachable'))
  }, [])

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
      const r = await fetch('/api/updates', { method: 'POST', body: fd })
      const body = await r.json()
      if (!r.ok) throw new Error(body.detail || 'Check failed')
      setResult(body)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function loadScenario(type) {
    if (type === 'catch') {
      const img = await createSampleFile('site_shuttering_progress.jpg', '#4a5568', 'SHUTTERING IN PLACE')
      const voice = createSampleAudio('contractor_voice_note.opus')
      setFiles([img, voice])
      setMilestoneId('m5')
      setAmount('250000')
    } else if (type === 'happy') {
      const img = await createSampleFile('site_slab_cast_completed.jpg', '#2d3748', 'SLAB SURFACE POURED')
      setFiles([img])
      setMilestoneId('m5')
      setAmount('250000')
    } else if (type === 'defect') {
      const img = await createSampleFile('column_honeycomb_defect.jpg', '#742a2a', 'HONEYCOMB DEFECT')
      setFiles([img])
      setMilestoneId('m3')
      setAmount('250000')
    }
    setResult(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans">
      <header className="bg-stone-900 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-black tracking-wider text-emerald-400">PAKKA</span>
            <span className="text-stone-300 text-sm hidden sm:inline">Pay your contractor only for work you can see</span>
          </div>
          <div className="text-[11px] font-mono text-stone-400">Gemini observes · Code decides</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-[380px_1fr]">
        {/* Left Panel: WhatsApp-Style Intake */}
        <section className="rounded-2xl overflow-hidden shadow-sm border border-stone-200 bg-[#ECE5DD]">
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold tracking-wide">Mestri · Site update</div>
              <div className="text-[11px] text-emerald-200">Online · Ready for check</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => loadScenario('catch')} title="Demo A: Claim slab done on shuttering"
                className="bg-white/15 hover:bg-white/30 text-[11px] font-medium px-2 py-0.5 rounded transition">
                Demo A
              </button>
              <button onClick={() => loadScenario('happy')} title="Demo B: Slab poured and cured"
                className="bg-white/15 hover:bg-white/30 text-[11px] font-medium px-2 py-0.5 rounded transition">
                Demo B
              </button>
              <button onClick={() => loadScenario('defect')} title="Demo C: Column honeycomb defect"
                className="bg-white/15 hover:bg-white/30 text-[11px] font-medium px-2 py-0.5 rounded transition">
                Demo C
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3.5">
            <label className="block text-xs font-semibold text-stone-700">
              Photos, videos and voice note
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="mt-1 block w-full text-xs bg-white rounded-lg p-2 border border-stone-300 cursor-pointer"
                onChange={(e) => setFiles([...(e.target.files || [])])}
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {files.map((f, idx) => (
                  <div key={idx} className="bg-white rounded-lg px-3 py-1.5 text-xs flex items-center justify-between border border-stone-200 shadow-2xs">
                    <span className="truncate max-w-[260px]">
                      {f.type.startsWith('audio') ? '🎤' : f.type.startsWith('video') ? '🎬' : '📷'} {f.name}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-2">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}

            <label className="block text-xs font-semibold text-stone-700">
              Milestone being claimed
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="mt-1 block w-full rounded-lg p-2 text-xs bg-white border border-stone-300 shadow-2xs"
              >
                <option value="">Work it out from the voice note</option>
                {plan.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {rupees(m.amount_inr)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-stone-700">
              Amount requested (₹)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="From the voice note if empty"
                className="mt-1 block w-full rounded-lg p-2 text-xs bg-white border border-stone-300 shadow-2xs"
              />
            </label>

            <button
              disabled={!files.length || busy}
              onClick={submit}
              className="w-full rounded-full bg-[#25D366] hover:bg-[#1ebd5a] active:scale-[0.99] disabled:opacity-50 text-white font-bold py-2.5 text-sm shadow transition cursor-pointer"
            >
              {busy ? 'Gemini is looking at the site…' : 'Check before paying'}
            </button>

            {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 font-medium">{error}</p>}
          </div>
        </section>

        {/* Right Panel: Verdict */}
        <section>
          {!result && !busy && <Empty plan={plan} />}
          {busy && (
            <div className="rounded-2xl bg-white border border-stone-200 p-10 text-stone-600 space-y-3 text-center animate-pulse">
              <div className="text-3xl">🔍</div>
              <div className="font-semibold text-base">Gemini is inspecting the site evidence…</div>
              <div className="text-xs text-stone-400">Verifying visible elements, checking defects, and calculating milestone rules</div>
            </div>
          )}
          {result && <Verdict result={result} focus={focus} setFocus={setFocus} />}
        </section>
      </main>
    </div>
  )
}

function Empty({ plan }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base text-stone-800">Agreed payment plan</h2>
        <span className="text-xs text-stone-500 font-medium">8 milestones · Indian RCC frame</span>
      </div>
      <ol className="divide-y divide-stone-100 text-sm">
        {plan.map((m, i) => (
          <li key={m.id} className="py-2.5 flex items-center justify-between">
            <span className="text-stone-700">
              <span className="font-mono text-stone-400 mr-2">{i + 1}.</span>
              {m.name}
              {m.engineer_gate && (
                <span className="ml-2 text-[10px] uppercase font-bold tracking-wider bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded-sm">
                  engineer gate
                </span>
              )}
            </span>
            <span className="tabular-nums font-semibold text-stone-800">{rupees(m.amount_inr)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 p-3 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500">
        💡 Upload contractor photos and voice note on the left, or click <b>Demo A</b>, <b>Demo B</b>, or <b>Demo C</b> to test a scenario.
      </div>
    </div>
  )
}

function Verdict({ result, focus, setFocus }) {
  const r = result.report
  const v = VERDICT[r.verdict] || VERDICT.not_proven
  const focused = focus != null ? r.findings[focus] : null
  const shownIndex = focused?.media_index ?? 0
  const media = result.media[shownIndex]
  const boxes = r.findings
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.box_2d && (f.media_index ?? 0) === shownIndex)

  return (
    <div className="space-y-4">
      {/* Coloured Banner */}
      <div className={`rounded-2xl border p-5 shadow-2xs ${v.tone}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider">
            {r.milestone_name} · {rupees(r.amount_requested_inr ?? r.amount_planned_inr)}
          </span>
          <span className="text-xs font-black uppercase border rounded-full px-3.5 py-1 bg-white/80 shadow-2xs">
            {v.label}
          </span>
        </div>
        <h2 className="text-xl font-bold mt-2">{r.headline}</h2>
        {result.voice && (
          <div className="text-xs mt-3 p-2 rounded-lg bg-black/5 space-y-0.5">
            <div className="font-semibold text-stone-800">
              🎤 Voice note ({result.voice.language}): <span className="font-normal italic">“{result.voice.transcript}”</span>
            </div>
            <div className="text-stone-600">
              Translation: <span className="italic">{result.voice.translation_en}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Photo / Video Panel with Bounding Box Overlays */}
        <div className="rounded-2xl bg-white border border-stone-200 p-3 shadow-2xs space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-stone-900 flex items-center justify-center min-h-[260px]">
            {media?.mime.startsWith('video') ? (
              <video src={media.url} controls className="w-full max-h-[420px] object-contain rounded-lg" />
            ) : (
              <img src={media?.url} alt="Site upload" className="w-full max-h-[420px] object-contain rounded-lg" />
            )}

            {/* Overlaid Bounding Boxes (coordinates in 0-1000 scale -> divided by 10 for percentage) */}
            {!media?.mime.startsWith('video') &&
              boxes.map((b) => {
                const [y0, x0, y1, x1] = b.box_2d
                const isDefect = b.kind === 'defect'
                const isSeen = b.kind === 'seen'
                const color = isDefect
                  ? 'border-rose-500 bg-rose-500/10'
                  : isSeen
                  ? 'border-sky-400 bg-sky-400/10'
                  : 'border-emerald-400 bg-emerald-400/10'
                const isFocused = focus === b.i

                return (
                  <div
                    key={b.i}
                    onClick={() => setFocus(b.i)}
                    className={`absolute border-2 rounded transition-all cursor-pointer ${color} ${
                      isFocused ? 'ring-4 ring-amber-400 z-20 scale-[1.01]' : 'hover:ring-2 hover:ring-white z-10'
                    }`}
                    style={{
                      top: `${y0 / 10}%`,
                      left: `${x0 / 10}%`,
                      height: `${(y1 - y0) / 10}%`,
                      width: `${(x1 - x0) / 10}%`,
                    }}
                  >
                    <span
                      className={`text-[9px] font-bold px-1 py-0.5 rounded text-white absolute -top-5 left-0 truncate max-w-[140px] ${
                        isDefect ? 'bg-rose-600' : isSeen ? 'bg-sky-600' : 'bg-emerald-600'
                      }`}
                    >
                      {b.text.split('.')[0]}
                    </span>
                  </div>
                )
              })}
          </div>

          {result.media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {result.media.map((m, i) => (
                <button
                  key={m.url}
                  onClick={() => setFocus(r.findings.findIndex((f) => f.media_index === i))}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium border transition ${
                    i === shownIndex ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 hover:bg-stone-100 border-stone-200'
                  }`}
                >
                  Upload {i + 1}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-stone-500 px-1">{result.observations[shownIndex]?.summary}</p>
        </div>

        {/* Findings, Next Steps & Governance */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-2xs">
            <h3 className="font-bold text-xs uppercase tracking-wider text-stone-600 mb-2.5">What the evidence shows</h3>
            <ul className="space-y-1.5">
              {r.findings.map((f, i) => (
                <li
                  key={i}
                  onClick={() => setFocus(i)}
                  className={`text-xs flex items-start gap-2 cursor-pointer rounded-lg p-2 transition ${
                    focus === i ? 'bg-amber-50 border border-amber-200 font-semibold' : 'hover:bg-stone-50 border border-transparent'
                  }`}
                >
                  <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${KIND_DOT[f.kind] || 'bg-stone-400'}`} />
                  <span className="text-stone-800 leading-relaxed">
                    {f.text}
                    {f.timestamp_s != null && <span className="text-stone-500 font-mono"> · at {f.timestamp_s}s</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {r.ask_next.length > 0 && (
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-2xs">
              <h3 className="font-bold text-xs uppercase tracking-wider text-stone-600 mb-2">Ask the contractor next</h3>
              <ul className="list-disc ml-4 text-xs text-stone-700 space-y-1">
                {r.ask_next.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {r.audit_stamp && (
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-2.5 text-[11px] text-stone-600 font-mono space-y-1 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span>Model: <b>{r.audit_stamp.model}</b></span>
                <span>Prompt: <code>{r.audit_stamp.prompt_version}</code></span>
                <span>Rules: v{r.audit_stamp.rules_version}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-stone-500">
                <span>Thresholds: E≥{r.audit_stamp.thresholds.element_min_conf}, S≥{r.audit_stamp.thresholds.stage_min_conf}</span>
                <span className="text-emerald-700 font-semibold font-sans">✓ Human decides payment</span>
              </div>
            </div>
          )}

          <p className="text-[11px] text-stone-500 px-1 leading-normal">
            PAKKA checks visible progress only. It never certifies structural safety and never moves money.
          </p>
        </div>
      </div>
    </div>
  )
}
