import { useEffect, useState } from 'react'

const VERDICT = {
  proven: { label: 'Proven', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  not_proven: { label: 'Not proven yet', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  needs_engineer: { label: 'Needs an engineer', tone: 'bg-rose-100 text-rose-800 border-rose-300' },
}
const KIND_DOT = { ok: 'bg-emerald-500', seen: 'bg-sky-500', missing: 'bg-amber-500', behind: 'bg-amber-500', unclear: 'bg-stone-400', defect: 'bg-rose-500', amount: 'bg-rose-500' }
const rupees = (n) => (n == null ? '—' : '₹' + n.toLocaleString('en-IN'))

export default function App() {
  const [plan, setPlan] = useState([])
  const [milestoneId, setMilestoneId] = useState('')
  const [amount, setAmount] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [focus, setFocus] = useState(null) // finding index highlighted on the photo

  useEffect(() => { fetch('/api/plan').then((r) => r.json()).then(setPlan).catch(() => setError('Backend not reachable')) }, [])

  async function submit() {
    setBusy(true); setError(''); setResult(null); setFocus(null)
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    if (milestoneId) fd.append('milestone_id', milestoneId)
    if (amount) fd.append('amount_inr', amount)
    try {
      const r = await fetch('/api/updates', { method: 'POST', body: fd })
      const body = await r.json()
      if (!r.ok) throw new Error(body.detail || 'Check failed')
      setResult(body)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-stone-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-baseline gap-3">
          <span className="text-xl font-bold tracking-wide">PAKKA</span>
          <span className="text-stone-400 text-sm">Pay your contractor only for work you can see</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-[380px_1fr]">
        {/* Intake, styled like the WhatsApp chat owners already use */}
        <section className="rounded-2xl overflow-hidden shadow-sm border border-stone-200 bg-[#ECE5DD]">
          <div className="bg-[#075E54] text-white px-4 py-3 text-sm font-medium">Mestri · Site update</div>
          <div className="p-4 space-y-3">
            <label className="block text-xs font-medium text-stone-600">Photos, videos and voice note
              <input type="file" multiple accept="image/*,video/*,audio/*" className="mt-1 block w-full text-sm bg-white rounded-lg p-2"
                onChange={(e) => setFiles([...e.target.files])} />
            </label>
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.name} className="bg-white rounded-lg px-3 py-1.5 text-xs w-fit max-w-full truncate">
                    {f.type.startsWith('audio') ? '🎤' : f.type.startsWith('video') ? '🎬' : '📷'} {f.name}
                  </div>
                ))}
              </div>
            )}
            <label className="block text-xs font-medium text-stone-600">Milestone being claimed
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="mt-1 block w-full rounded-lg p-2 text-sm">
                <option value="">Work it out from the voice note</option>
                {plan.map((m) => <option key={m.id} value={m.id}>{m.name} · {rupees(m.amount_inr)}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-stone-600">Amount requested (₹)
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="From the voice note if empty"
                className="mt-1 block w-full rounded-lg p-2 text-sm" />
            </label>
            <button disabled={!files.length || busy} onClick={submit}
              className="w-full rounded-full bg-[#25D366] disabled:opacity-50 text-white font-semibold py-2.5">
              {busy ? 'Checking the site…' : 'Check before paying'}
            </button>
            {error && <p className="text-sm text-rose-700">{error}</p>}
          </div>
        </section>

        {/* Verdict */}
        <section>
          {!result && !busy && <Empty plan={plan} />}
          {busy && <div className="rounded-2xl bg-white border border-stone-200 p-8 text-stone-500 animate-pulse">Gemini is looking at the site…</div>}
          {result && <Verdict result={result} focus={focus} setFocus={setFocus} />}
        </section>
      </main>
    </div>
  )
}

function Empty({ plan }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="font-semibold mb-3">Agreed payment plan</h2>
      <ol className="space-y-2 text-sm">
        {plan.map((m, i) => (
          <li key={m.id} className="flex justify-between border-b border-stone-100 pb-2">
            <span>{i + 1}. {m.name} {m.engineer_gate && <span className="ml-1 text-[10px] uppercase bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">engineer</span>}</span>
            <span className="tabular-nums text-stone-600">{rupees(m.amount_inr)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Verdict({ result, focus, setFocus }) {
  const r = result.report
  const v = VERDICT[r.verdict]
  const focused = focus != null ? r.findings[focus] : null
  const shownIndex = focused?.media_index ?? 0
  const media = result.media[shownIndex]
  const boxes = r.findings.map((f, i) => ({ ...f, i })).filter((f) => f.box_2d && (f.media_index ?? 0) === shownIndex)

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${v.tone}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider">{r.milestone_name} · {rupees(r.amount_requested_inr ?? r.amount_planned_inr)}</span>
          <span className="text-xs font-bold uppercase border rounded-full px-3 py-1 bg-white/60">{v.label}</span>
        </div>
        <h2 className="text-xl font-semibold mt-2">{r.headline}</h2>
        {result.voice && (
          <p className="text-sm mt-2 opacity-80">Voice note ({result.voice.language}) “{result.voice.transcript}” <i>({result.voice.translation_en})</i></p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="relative">
            {media?.mime.startsWith('video')
              ? <video src={media.url} controls className="w-full rounded-lg" />
              : <img src={media?.url} alt="Site upload" className="w-full rounded-lg" />}
            {!media?.mime.startsWith('video') && boxes.map((b) => {
              const [y0, x0, y1, x1] = b.box_2d
              const color = b.kind === 'defect' ? 'border-rose-500' : b.kind === 'seen' ? 'border-sky-400' : 'border-emerald-400'
              return <div key={b.i} onClick={() => setFocus(b.i)}
                className={`absolute border-2 rounded cursor-pointer ${color} ${focus === b.i ? 'ring-4 ring-white/70' : ''}`}
                style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }} />
            })}
          </div>
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {result.media.map((m, i) => (
              <button key={m.url} onClick={() => setFocus(r.findings.findIndex((f) => f.media_index === i))}
                className={`text-xs px-2 py-1 rounded border ${i === shownIndex ? 'bg-stone-900 text-white' : 'bg-white'}`}>Upload {i + 1}</button>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-2">{result.observations[shownIndex]?.summary}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-stone-200 p-4">
            <h3 className="font-semibold text-sm mb-2">What the evidence shows</h3>
            <ul className="space-y-2">
              {r.findings.map((f, i) => (
                <li key={i} onClick={() => setFocus(i)}
                  className={`text-sm flex gap-2 cursor-pointer rounded p-1 ${focus === i ? 'bg-stone-100' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${KIND_DOT[f.kind] || 'bg-stone-400'}`} />
                  <span>{f.text}{f.timestamp_s != null && <span className="text-stone-500"> · at {f.timestamp_s}s</span>}</span>
                </li>
              ))}
            </ul>
          </div>
          {r.ask_next.length > 0 && (
            <div className="rounded-2xl bg-white border border-stone-200 p-4">
              <h3 className="font-semibold text-sm mb-2">Ask the contractor next</h3>
              <ul className="list-disc ml-5 text-sm space-y-1">{r.ask_next.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          <p className="text-[11px] text-stone-500 px-1">PAKKA checks visible progress only. It never certifies structural safety and never moves money.</p>
        </div>
      </div>
    </div>
  )
}
