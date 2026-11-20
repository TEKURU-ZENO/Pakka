// #/receipt/<token>: the mestri confirms (or disputes) a payment the owner recorded. One answer per link.
import { useEffect, useState } from 'react'
import { PakkaLogo } from './brand.jsx'
import { Bezel, EASE, Icon, IslandButton, RoleChip, rupees } from './ui.jsx'

export default function Receipt({ token }) {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('') // '' | 'dispute'
  const [note, setNote] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'PAKKA · Confirm payment'
    fetch(`/api/receipt/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.detail || 'This link is not valid.')
        setP(b)
      })
      .catch((e) => setError(e.message))
  }, [token])

  async function answer(response) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/receipt/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response, note }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof b.detail === 'string' ? b.detail : 'Could not save your answer.')
      setDone(response)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const answered = done || p?.receipt_status
  return (
    <div className="min-h-[100dvh] bg-paper bg-drafting text-ink">
      <header className="mx-auto flex max-w-lg items-center justify-between px-5 pt-6">
        <PakkaLogo />
        <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute ring-1 ring-ink/10">Payment</span>
      </header>
      <main className="mx-auto max-w-lg px-5 pb-16 pt-6">
        <RoleChip role="mestri" className="mb-6" />
        {error && !p && <p className="rounded-2xl bg-clay-50 p-6 text-center text-clay-700">{error}</p>}
        {p && (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">The owner says they paid you</p>
            <h1 className="mt-2 font-display text-[3rem] leading-none">{rupees(p.amount_inr)}</h1>
            <p className="mt-2 text-lg">{p.milestone_name}</p>
            {p.milestone_name_ta && <p className="text-ink-soft" lang="ta">{p.milestone_name_ta}</p>}
            <p className="mt-3 font-mono text-sm text-ink-mute">{p.method_label} · {p.paid_on}{p.reference && ` · ref ${p.reference}`}</p>

            {answered ? (
              <Bezel radius="2rem" className="mt-8" core={`p-8 text-center ${answered === 'confirmed' ? 'bg-moss-50' : 'bg-clay-50'}`}>
                <Icon name={answered === 'confirmed' ? 'check' : 'x'} className={`mx-auto h-10 w-10 ${answered === 'confirmed' ? 'text-moss-500' : 'text-clay-500'}`} />
                <p className="mt-4 font-display text-3xl">{answered === 'confirmed' ? 'Thank you.' : 'Your concern is recorded.'}</p>
                <p className="mt-2 text-sm text-ink-soft">The owner will see your answer.</p>
                <p className="mt-1 text-sm text-ink-soft" lang="ta">உங்கள் பதிலை உரிமையாளர் பார்ப்பார்.</p>
              </Bezel>
            ) : (
              <div className="mt-8 space-y-3">
                <IslandButton variant="ink" onClick={() => answer('confirmed')} disabled={busy} icon="check" className="w-full justify-between">
                  Yes, I received {rupees(p.amount_inr)}
                </IslandButton>
                <p className="text-center text-xs text-ink-mute" lang="ta">ஆம், பணம் கிடைத்தது</p>
                {mode !== 'dispute' ? (
                  <button onClick={() => setMode('dispute')} className={`w-full rounded-full px-5 py-3 text-sm text-clay-700 ring-1 ring-clay-500/30 transition-colors duration-500 ${EASE} hover:bg-clay-50`}>
                    No, there is a problem · <span lang="ta">இல்லை, பிரச்சனை உள்ளது</span>
                  </button>
                ) : (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-clay-500/20">
                    <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is wrong? For example: I received only ₹1,50,000"
                      className="w-full rounded-xl bg-paper-light p-3 text-sm outline-none ring-1 ring-ink/10" />
                    <button onClick={() => answer('disputed')} disabled={busy || !note.trim()} className="mt-3 w-full rounded-full bg-clay-500 px-5 py-3 text-sm text-paper-light disabled:opacity-40">
                      Send to the owner
                    </button>
                  </div>
                )}
                {error && <p className="text-xs text-clay-700">{error}</p>}
              </div>
            )}
            <p className="mt-10 text-center text-[11px] font-light leading-relaxed text-ink-faint">
              PAKKA does not send or hold money. It only records what the owner paid and your answer, so both of you have
              the same record.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
