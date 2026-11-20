// #/release/<payment id>: printable milestone release record for the owner (and their lender or family).
// PAKKA did not process the payment; this records it, with the evidence that justified it.
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { PakkaLogo } from './brand.jsx'
import { Icon, RoleChip, rupees } from './ui.jsx'

const VERDICT = { proven: 'Work visible', not_proven: 'Not proven yet', needs_engineer: 'Needs an engineer' }
const RECEIPT = { confirmed: 'Confirmed by the mestri', disputed: 'Disputed by the mestri' }
const fmt = (t) => (t ? new Date(t * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')

function Row({ k, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 border-t border-ink/10 py-3 text-sm print:grid-cols-[8rem_1fr]">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">{k}</span>
      <span className="text-ink">{children}</span>
    </div>
  )
}

export default function Release({ id }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    document.title = 'PAKKA · Milestone release record'
    api(`/api/payments/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message))
  }, [id])

  const p = d?.payment
  const ev = d?.evidence
  const r = ev?.report
  const photo = ev?.media?.find((m) => !m.mime?.startsWith('video'))
  const signoffs = ev?.signoffs || []

  return (
    <div className="min-h-[100dvh] bg-paper text-ink print:bg-white">
      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 pt-6">
        <a href="#/demo" className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs ring-1 ring-ink/10">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Back to dashboard
        </a>
        <span className="flex items-center gap-2">
          <RoleChip role="owner" size="sm" prefix={false} />
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-paper-light">
            <Icon name="copy" className="h-3.5 w-3.5" /> Print or save as PDF
          </button>
        </span>
      </div>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8 print:max-w-none print:p-0">
        {error && <p className="rounded-2xl bg-clay-50 p-6 text-center text-clay-700">{error}</p>}
        {p && (
          <article className="rounded-[2rem] bg-white p-8 shadow-float ring-1 ring-ink/[0.06] print:rounded-none print:p-0 print:shadow-none print:ring-0 md:p-12">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-6">
              <div>
                <PakkaLogo />
                <h1 className="mt-6 font-display text-4xl leading-none">Milestone release record</h1>
                <p className="mt-2 text-sm text-ink-mute">{p.milestone_name}{p.milestone_name_ta && ` · ${p.milestone_name_ta}`}</p>
              </div>
              <div className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                <div>Record {p.id}</div>
                <div className="mt-1">Generated {fmt(d.generated_at)}</div>
              </div>
            </header>

            <p className="mt-6 rounded-xl bg-paper-light p-4 text-xs leading-relaxed text-ink-soft ring-1 ring-ink/[0.06]">
              <b>PAKKA did not process this payment.</b> The owner paid the contractor directly and recorded it in PAKKA. This
              record shows what was paid, the evidence for the stage, and who confirmed what. It is not a certificate of
              structural safety.
            </p>

            <section className="mt-8">
              <h2 className="font-display text-2xl">Payment</h2>
              <Row k="Amount">{rupees(p.amount_inr)} <span className="text-ink-mute">(plan for this stage: {rupees(p.planned_inr)})</span></Row>
              <Row k="Paid on">{p.paid_on}</Row>
              <Row k="Method">{p.method_label}{p.reference && <span className="font-mono text-ink-mute"> · ref {p.reference}</span>}</Row>
              <Row k="Recorded">{fmt(p.created)} by the owner</Row>
              <Row k="Mestri">
                {p.receipt_status ? (
                  <span className={p.receipt_status === 'confirmed' ? 'text-moss-700' : 'text-clay-700'}>
                    {RECEIPT[p.receipt_status]} on {fmt(p.receipt_at)}{p.receipt_note && `: “${p.receipt_note}”`}
                  </span>
                ) : (
                  <span className="text-ochre-700">Not yet confirmed by the mestri</span>
                )}
              </Row>
              {p.note && <Row k="Owner’s note">{p.note}</Row>}
              {p.flags.length > 0 && (
                <Row k="Warnings">
                  {p.flags.includes('before_verification') && <span className="mr-2 rounded-full bg-ochre-50 px-2 py-0.5 text-xs text-ochre-700">Paid before the work was verified</span>}
                  {p.flags.includes('over_plan') && <span className="rounded-full bg-clay-50 px-2 py-0.5 text-xs text-clay-700">Total paid exceeds the plan</span>}
                </Row>
              )}
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">Evidence for the stage</h2>
              {!ev && <p className="mt-3 text-sm text-ochre-700">No verified check is linked to this payment (it was recorded before verification, or the check was deleted).</p>}
              {ev && (
                <>
                  <div className="mt-4 grid gap-5 sm:grid-cols-[220px_1fr] print:grid-cols-[200px_1fr]">
                    {photo ? <img src={photo.url} alt="Site evidence" className="w-full rounded-xl object-cover" /> : <div />}
                    <div>
                      <span className="rounded-full bg-moss-50 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-moss-700">{VERDICT[r.verdict]}</span>
                      <p className="mt-3 font-display text-xl leading-snug">{r.headline}</p>
                      <ul className="mt-2 space-y-1 text-sm text-ink-soft">{r.findings.slice(0, 5).map((f, i) => <li key={i}>· {f.text}</li>)}</ul>
                      <p className="mt-2 text-xs text-ink-mute">Checked {fmt(ev.created)} · {ev.source === 'capture_link' ? 'photos sent by the mestri through a capture link' : 'photos uploaded by the owner'}</p>
                    </div>
                  </div>
                  {signoffs.map((s) => (
                    <Row key={s.id} k="Engineer">
                      {s.engineer_name}{s.registration_no && ` (Reg. ${s.registration_no})`}: <b>{s.decision === 'approved' ? 'approved' : 'rework needed'}</b>
                      {' '}on {fmt(s.created)}. {s.channel === 'engineer_link' ? 'Signed by the engineer through their own link.' : 'Entered by the owner on the engineer’s behalf.'}
                      {s.note && <span className="block text-ink-mute">“{s.note}”</span>}
                    </Row>
                  ))}
                </>
              )}
            </section>

            <footer className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink/10 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute sm:grid-cols-4">
              {[['Check', ev?.id || '—'], ['Model', r?.audit_stamp?.model || '—'], ['Rules', `v${d.rules_version}`], ['Plan', d.plan_version]].map(([k, v]) => (
                <div key={k} className="bg-white p-3">
                  <div>{k}</div>
                  <div className="mt-0.5 truncate normal-case tracking-normal text-ink">{v}</div>
                </div>
              ))}
            </footer>
          </article>
        )}
      </main>
    </div>
  )
}
