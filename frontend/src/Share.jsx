// Read-only family view (#/share/<token>): what's verified, every verdict and photo. No editing, no location.
import { useEffect, useState } from 'react'
import { VERDICT_TA } from './api.js'
import { PakkaLogo } from './brand.jsx'
import { Ledger } from './OwnerPanels.jsx'
import { Bezel, Icon, Reveal, RoleChip, rupees } from './ui.jsx'

const VERDICT = {
  proven: { label: 'Work visible', chip: 'bg-moss-500', sheet: 'bg-moss-50', ink: 'text-moss-700' },
  not_proven: { label: 'Not proven yet', chip: 'bg-ochre-500', sheet: 'bg-ochre-50', ink: 'text-ochre-700' },
  needs_engineer: { label: 'Needs an engineer', chip: 'bg-clay-500', sheet: 'bg-clay-50', ink: 'text-clay-700' },
}

export default function Share({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [ta, setTa] = useState(false)

  useEffect(() => {
    document.title = 'PAKKA · Site progress'
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.detail || 'This link is not valid.')
        setData(b)
      })
      .catch((e) => setError(e.message))
  }, [token])

  return (
    <div className="min-h-[100dvh] bg-paper bg-drafting text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <PakkaLogo />
        <button onClick={() => setTa((t) => !t)} className="rounded-full bg-white/70 px-3 py-1 text-xs ring-1 ring-ink/10">
          {ta ? 'English' : 'தமிழ்'}
        </button>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-5 pb-16 pt-6">
        <RoleChip role="family" />
        {error && <p className="rounded-2xl bg-clay-50 p-6 text-center text-clay-700">{error}</p>}
        {data && (
          <>
            <Reveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Shared with {data.label} · read only</p>
              <h1 className="mt-2 font-display text-[2.8rem] leading-[1.02]">
                {ta ? 'கட்டுமான முன்னேற்றம்' : <>How the house is <em className="text-sage-600">coming along.</em></>}
              </h1>
            </Reveal>
            <Ledger data={data.ledger} compact={false} />
            {data.checks.map((c) => {
              const r = c.report
              const v = VERDICT[r.verdict] || VERDICT.not_proven
              return (
                <Reveal key={c.id}>
                  <Bezel radius="2rem" core={`overflow-hidden ${v.sheet}`}>
                    <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                      {c.media?.[0] && !c.media[0].mime?.startsWith('video') ? (
                        <img src={c.media[0].url} alt={r.milestone_name} className="h-48 w-full object-cover sm:h-full" />
                      ) : (
                        <div className="flex h-24 items-center justify-center bg-ink/5 sm:h-full"><Icon name="camera" className="h-6 w-6 text-ink-faint" /></div>
                      )}
                      <div className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                            {new Date(c.created * 1000).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · {rupees(r.amount_requested_inr ?? r.amount_planned_inr)}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-paper-light ${v.chip}`}>
                            {ta ? VERDICT_TA[r.verdict] : v.label}
                          </span>
                        </div>
                        <h2 className={`mt-3 font-display text-2xl leading-tight ${v.ink}`}>{(ta && r.headline_ta) || r.headline}</h2>
                        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                          {r.findings.slice(0, 3).map((f, i) => <li key={i}>· {f.text}</li>)}
                        </ul>
                        {(c.signoffs || []).map((s) => (
                          <p key={s.id} className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-ink-soft">
                            <Icon name="hardhat" className="mr-1 inline h-3.5 w-3.5" />
                            Engineer {s.engineer_name}: <b>{s.decision === 'approved' ? 'approved' : 'rework needed'}</b>{s.note ? ` · ${s.note}` : ''}
                            <span className="ml-1 text-ink-faint">({s.channel === 'engineer_link' ? 'signed by the engineer' : 'entered by the owner'})</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </Bezel>
                </Reveal>
              )
            })}
            {!data.checks.length && <p className="text-center text-sm text-ink-mute">No checks yet.</p>}
            <p className="pt-6 text-center text-[11px] font-light text-ink-faint">
              PAKKA checks visible progress only. It never certifies structural safety and never moves money.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
