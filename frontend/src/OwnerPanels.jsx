// Owner panels: money ledger, editable payment plan, engineer sign-off, family share links.
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Bezel, EASE, Icon, IslandButton, Reveal, rupees } from './ui.jsx'

const label = 'block text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute'
const input = `w-full rounded-[0.8rem] bg-paper-light px-4 py-3 text-sm text-ink shadow-inner-hi outline-none ring-1 ring-ink/[0.06] transition-shadow duration-500 ${EASE} placeholder:text-ink-faint focus:ring-sage-400`

const STATUS = {
  verified: { text: 'Verified', dot: 'bg-moss-500', tone: 'text-moss-700' },
  awaiting_engineer: { text: 'Awaiting engineer', dot: 'bg-clay-500', tone: 'text-clay-700' },
  not_verified: { text: 'Not yet verified', dot: 'bg-ink/20', tone: 'text-ink-mute' },
}

// ---------------------------------------------------------------- ledger
export function Ledger({ refreshKey, onOpen, history, compact = false, data }) {
  const [led, setLed] = useState(data || null)
  useEffect(() => {
    if (data) return setLed(data)
    api('/api/ledger').then(setLed).catch(() => {})
  }, [refreshKey, data])
  if (!led) return null
  const { totals, plan_total: total } = led
  const pct = (n) => (total ? (n / total) * 100 : 0)
  return (
    <Reveal>
      <Bezel radius="2rem" className="shadow-float" core="overflow-hidden bg-[#1A1714] p-7 text-paper-light md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-paper/50">Money against evidence</span>
            <h2 className="mt-3 font-display text-4xl leading-none">
              {rupees(totals.verified)} <em className="text-ember-200">verified</em>
            </h2>
          </div>
          <span className="font-mono text-xs text-paper/50">of {rupees(total)} planned</span>
        </div>
        <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <span className="bg-moss-100" style={{ width: `${pct(totals.verified)}%` }} />
          <span className="bg-clay-500" style={{ width: `${pct(totals.awaiting_engineer)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {[['Verified', totals.verified, 'bg-moss-100'], ['Awaiting engineer', totals.awaiting_engineer, 'bg-clay-500'], ['Not yet verified', totals.not_verified, 'bg-white/20']].map(([t, v, dot]) => (
            <div key={t}>
              <div className="flex items-center gap-1.5 text-paper/55"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{t}</div>
              <div className="mt-1 font-mono text-sm text-paper-light">{rupees(v)}</div>
            </div>
          ))}
        </div>
        {!compact && (
          <ol className="mt-6 border-t border-white/10">
            {led.milestones.map((m) => {
              const st = STATUS[m.status]
              const h = m.last_check && history?.find((x) => x.id === m.last_check.id)
              return (
                <li key={m.milestone_id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot === 'bg-ink/20' ? 'bg-white/20' : st.dot}`} />
                    <span className="truncate font-display text-lg">{m.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-[10px] uppercase tracking-[0.14em] text-paper/45 sm:inline">{st.text}</span>
                    <span className="font-mono text-xs text-paper/80">{rupees(m.amount_inr)}</span>
                    {h && onOpen && (
                      <button onClick={() => onOpen(h)} className="rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ember-200 ring-1 ring-ember-300/30">Open</button>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-5 text-[11px] font-light text-paper/40">
          “Verified” means the work is visible in checked evidence, or a licensed engineer approved it. You decide what to pay.
        </p>
      </Bezel>
    </Reveal>
  )
}

// ---------------------------------------------------------------- plan editor
export function PlanEditor({ plan, onSaved }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({})
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(Object.fromEntries(plan.map((m) => [m.id, { amount_inr: m.amount_inr, engineer_gate: m.engineer_gate }]))), [plan])

  async function save() {
    setSaving(true)
    setErr('')
    try {
      for (const m of plan) {
        const d = draft[m.id]
        if (d.amount_inr !== m.amount_inr || d.engineer_gate !== m.engineer_gate) {
          await api(`/api/plan/${m.id}`, { method: 'PUT', json: { amount_inr: Number(d.amount_inr), engineer_gate: d.engineer_gate } })
        }
      }
      setOpen(false)
      onSaved?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-ink-soft ring-1 ring-ink/10 hover:bg-white">
        <Icon name="coins" className="h-4 w-4" /> Edit amounts and gates
      </button>
    )
  }
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-ink/[0.06]">
      <ul className="space-y-2">
        {plan.map((m) => (
          <li key={m.id} className="grid grid-cols-[1fr_8rem_auto] items-center gap-3 text-sm">
            <span className="truncate">{m.name}</span>
            <input inputMode="numeric" value={draft[m.id]?.amount_inr ?? ''} aria-label={`Amount for ${m.name}`}
              onChange={(e) => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], amount_inr: e.target.value.replace(/\D/g, '') } }))}
              className={`${input} !py-2 font-mono`} />
            <label className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] ${m.gate_locked ? 'text-ink-faint' : 'text-ink-mute'}`}
              title={m.gate_locked ? 'Critical stage: the engineer gate is always on' : 'Require an engineer sign-off'}>
              <input type="checkbox" checked={!!draft[m.id]?.engineer_gate} disabled={m.gate_locked}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], engineer_gate: e.target.checked } }))} />
              Engineer{m.gate_locked ? ' 🔒' : ''}
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="mt-3 text-xs text-clay-700">{err}</p>}
      <div className="mt-4 flex gap-2">
        <IslandButton variant="ink" onClick={save} disabled={saving} icon="check">{saving ? 'Saving…' : 'Save plan'}</IslandButton>
        <button onClick={() => setOpen(false)} className="rounded-full px-4 text-xs text-ink-mute">Cancel</button>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">Foundation and slab-reinforcement gates are locked on: critical stages always go to an engineer.</p>
    </div>
  )
}

// ---------------------------------------------------------------- engineer sign-off
export function EngineerSignoff({ result, onSigned }) {
  const r = result.report
  const [form, setForm] = useState({ engineer_name: '', registration_no: '', decision: 'approved', note: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)
  const signoffs = result.signoffs || []

  async function makeLink() {
    setErr('')
    try {
      const l = await api(`/api/updates/${result.id}/engineer-link`, { method: 'POST' })
      setLink({ ...l, url: `${location.origin}${l.path}` })
    } catch (x) {
      setErr(x.message)
    }
  }
  if (r.verdict !== 'needs_engineer' && !signoffs.length) return null

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      onSigned(await api(`/api/updates/${result.id}/signoff`, { method: 'POST', json: form }))
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Bezel radius="2rem" core="bg-clay-50 p-6">
      <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-clay-700">
        <Icon name="hardhat" className="h-4 w-4" /> Engineer sign-off
      </span>
      {signoffs.map((s) => (
        <div key={s.id} className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-clay-500/15">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-xl">{s.engineer_name}</span>
            <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${s.decision === 'approved' ? 'bg-moss-500 text-paper-light' : 'bg-ochre-500 text-paper-light'}`}>
              {s.decision === 'approved' ? 'Approved' : 'Rework needed'}
            </span>
          </div>
          <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
            s.channel === 'engineer_link' ? 'bg-moss-50 text-moss-700' : 'bg-ochre-50 text-ochre-700'
          }`}>
            {s.channel === 'engineer_link' ? '✓ Signed by the engineer via their own link' : 'Entered by the owner on the engineer’s behalf'}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {s.registration_no && `Reg. ${s.registration_no} · `}
            {new Date(s.created * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          {s.note && <p className="mt-2 font-light text-ink-soft">{s.note}</p>}
        </div>
      ))}
      {r.verdict === 'needs_engineer' && !signoffs.some((s) => s.decision === 'approved') && (
        <div className="mt-4">
          <p className="text-sm font-light text-ink-soft">
            Send the engineer their own link. They see the evidence and record the decision with their registration
            number, so the sign-off is theirs, not yours.
          </p>
          {!link ? (
            <div className="mt-3"><IslandButton variant="ink" onClick={makeLink} icon="arrow">Send to engineer</IslandButton></div>
          ) : (
            <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-clay-500/15">
              <code className="block break-all font-mono text-xs">{link.url}</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => navigator.clipboard?.writeText(link.url).then(() => setCopied(true))} className="rounded-full bg-paper-light px-4 py-2 text-xs ring-1 ring-ink/10">
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Please review and sign off "${result.milestone?.name || r.milestone_name}" on PAKKA: ${link.url}`)}`}
                  target="_blank" rel="noreferrer" className="rounded-full bg-[#1A1714] px-4 py-2 text-xs text-paper-light">Send on WhatsApp</a>
                <a href={link.path} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-xs ring-1 ring-ink/10">Open as engineer</a>
              </div>
            </div>
          )}
          {!manual && (
            <button onClick={() => setManual(true)} className="mt-3 text-xs text-ink-mute underline underline-offset-2">
              The engineer told me their decision: enter it on their behalf
            </button>
          )}
        </div>
      )}
      {r.verdict === 'needs_engineer' && manual && !signoffs.some((s) => s.decision === 'approved') && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="rounded-xl bg-ochre-50 p-3 text-xs text-ochre-700">
            This will be recorded as “entered by the owner on the engineer’s behalf”. A sign-off through the engineer’s own link carries more weight.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required minLength={2} placeholder="Engineer’s name" value={form.engineer_name}
              onChange={(e) => setForm({ ...form, engineer_name: e.target.value })} className={input} />
            <input placeholder="Registration no. (optional)" value={form.registration_no}
              onChange={(e) => setForm({ ...form, registration_no: e.target.value })} className={input} />
          </div>
          <textarea rows={2} placeholder="Notes from the visit" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
          <div className="flex flex-wrap gap-2">
            {[['approved', 'Approve: work is acceptable'], ['rework', 'Needs rework']].map(([v, t]) => (
              <label key={v} className={`cursor-pointer rounded-full px-4 py-2 text-xs ring-1 ${form.decision === v ? 'bg-ink text-paper-light ring-ink' : 'bg-white text-ink-soft ring-ink/10'}`}>
                <input type="radio" name="decision" value={v} checked={form.decision === v} onChange={() => setForm({ ...form, decision: v })} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
          {err && <p className="text-xs text-clay-700">{err}</p>}
          <IslandButton variant="ink" type="submit" disabled={busy} icon="stamp">{busy ? 'Saving…' : 'Record sign-off'}</IslandButton>
        </form>
      )}
    </Bezel>
  )
}

// ---------------------------------------------------------------- family share links
export function ShareLinks() {
  const [links, setLinks] = useState([])
  const [labelText, setLabelText] = useState('')
  const [copied, setCopied] = useState('')
  const load = () => api('/api/share-links').then((l) => setLinks(l || [])).catch(() => {})
  useEffect(() => { load() }, [])
  async function create() {
    await api('/api/share-links', { method: 'POST', json: { label: labelText.trim() || 'Family' } })
    setLabelText('')
    load()
  }
  async function revoke(t) {
    await api(`/api/share-links/${t}`, { method: 'DELETE' })
    load()
  }
  return (
    <Reveal>
      <Bezel radius="2rem" core="bg-paper-light p-7 md:p-10">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">For family abroad</span>
        <h2 className="mt-3 font-display text-4xl leading-none">Share read-only</h2>
        <p className="mt-3 max-w-lg text-sm font-light leading-relaxed text-ink-mute">
          A link for a parent or the owner abroad to follow the build: what’s verified, every verdict and photo. They can’t change anything. Links last 30 days and can be revoked.
        </p>
        <div className="mt-5 flex gap-2">
          <input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Who is it for? e.g. Appa" className={input} />
          <IslandButton variant="ink" onClick={create} icon="arrow">Create</IslandButton>
        </div>
        {links.length > 0 && (
          <ul className="mt-6">
            {links.map((l) => {
              const url = `${location.origin}${l.path}`
              return (
                <li key={l.token} className="flex flex-wrap items-center justify-between gap-2 border-t hairline py-3 text-sm">
                  <span className="font-display text-lg">{l.label}</span>
                  <span className="flex gap-2">
                    <button onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(l.token))} className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-ink/10">
                      {copied === l.token ? 'Copied ✓' : 'Copy link'}
                    </button>
                    <a href={l.path} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-xs ring-1 ring-ink/10">Preview</a>
                    <button onClick={() => revoke(l.token)} className="rounded-full px-3 py-1.5 text-xs text-clay-700 ring-1 ring-clay-500/20">Revoke</button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Bezel>
    </Reveal>
  )
}
