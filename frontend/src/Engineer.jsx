// Engineer page (#/engineer/<token>): the engineer reviews the evidence and records their own decision.
// Sign-offs made here are stamped "signed via engineer link", so the owner can't sign in the engineer's name.
import { useEffect, useState } from 'react'
import { PakkaLogo } from './brand.jsx'
import { Bezel, EASE, Icon, IslandButton } from './ui.jsx'

const input = `w-full rounded-[0.8rem] bg-white px-4 py-3 text-sm text-ink outline-none ring-1 ring-ink/10 transition-shadow duration-500 ${EASE} placeholder:text-ink-faint focus:ring-sage-400`

export default function Engineer({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(0)
  const [form, setForm] = useState({ engineer_name: '', registration_no: '', decision: 'approved', note: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  useEffect(() => {
    document.title = 'PAKKA · Engineer review'
    fetch(`/api/engineer/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.detail || 'This link is not valid.')
        setData(b)
      })
      .catch((e) => setError(e.message))
  }, [token])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/engineer/${encodeURIComponent(token)}/signoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof b.detail === 'string' ? b.detail : 'Could not record the decision.')
      setDone(b.message)
      window.scrollTo({ top: 0 })
    } catch (x) {
      setError(x.message)
    } finally {
      setBusy(false)
    }
  }

  const r = data?.report
  const media = data?.media?.[shown]
  const boxes = r ? r.findings.filter((f) => f.box_2d && (f.media_index ?? 0) === shown) : []

  return (
    <div className="min-h-[100dvh] bg-paper bg-drafting text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <PakkaLogo />
        <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute ring-1 ring-ink/10">
          Engineer review
        </span>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-5 pb-16 pt-8">
        {error && !data && <p className="rounded-2xl bg-clay-50 p-6 text-center text-clay-700">{error}</p>}
        {done && (
          <Bezel radius="2rem" core="bg-moss-50 p-8 text-center">
            <Icon name="check" className="mx-auto h-10 w-10 text-moss-500" />
            <p className="mt-4 font-display text-3xl text-moss-700">Decision recorded.</p>
            <p className="mt-2 text-sm text-ink-soft">{done}</p>
          </Bezel>
        )}
        {data && !done && (
          <>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Your sign-off is requested for</p>
              <h1 className="mt-2 font-display text-[2.6rem] leading-[1.02]">{data.milestone.name}</h1>
              <p className="mt-3 text-sm font-light leading-relaxed text-ink-mute">
                PAKKA checked the contractor’s photos and flagged this stage for a licensed engineer. Please inspect the
                site and record your decision. PAKKA records it; it never certifies safety itself.
              </p>
            </div>

            <Bezel radius="2rem" core="bg-paper-light p-3">
              <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-[1.4rem] bg-[#1A1714]">
                {media && !media.mime?.startsWith('video') ? (
                  <div className="relative inline-block max-w-full">
                    <img src={media.url} alt="Site evidence" className="block h-auto max-h-[420px] w-auto max-w-full" />
                    {boxes.map((b, i) => {
                      const [y0, x0, y1, x1] = b.box_2d
                      return (
                        <span key={i} className="absolute rounded-md border border-ember-200 bg-ember-400/10"
                          style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }}>
                          <span className="absolute -top-6 left-0 max-w-[160px] truncate rounded-full bg-ember-600 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white">
                            {b.text.split('.')[0]}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                ) : media ? (
                  <video src={media.url} controls className="max-h-[420px] w-full" />
                ) : null}
              </div>
              {data.media.length > 1 && (
                <div className="flex gap-1.5 px-2 pt-3">
                  {data.media.map((m, i) => (
                    <button key={m.url} onClick={() => setShown(i)} className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase ${i === shown ? 'bg-ink text-paper-light' : 'ring-1 ring-ink/10'}`}>
                      Upload {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <ul className="space-y-1 px-3 pb-2 pt-4 text-sm text-ink-soft">
                <li className="font-medium text-ink">{r.headline}</li>
                {r.findings.map((f, i) => <li key={i}>· {f.text}</li>)}
              </ul>
            </Bezel>

            {data.used ? (
              <p className="rounded-2xl bg-sage-50 p-4 text-center text-sm text-ink-soft">A decision was already recorded with this link.</p>
            ) : (
              <Bezel radius="2rem" core="bg-clay-50 p-6">
                <form onSubmit={submit} className="space-y-3">
                  <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-clay-700">
                    <Icon name="hardhat" className="h-4 w-4" /> Your decision
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input required minLength={2} placeholder="Your full name" value={form.engineer_name} onChange={(e) => setForm({ ...form, engineer_name: e.target.value })} className={input} />
                    <input required minLength={3} placeholder="Registration number" value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} className={input} />
                  </div>
                  <textarea rows={3} placeholder="What you checked on site" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
                  <div className="flex flex-wrap gap-2">
                    {[['approved', 'Approve: work is acceptable'], ['rework', 'Needs rework']].map(([v, t]) => (
                      <label key={v} className={`cursor-pointer rounded-full px-4 py-2 text-xs ring-1 ${form.decision === v ? 'bg-ink text-paper-light ring-ink' : 'bg-white text-ink-soft ring-ink/10'}`}>
                        <input type="radio" name="decision" value={v} checked={form.decision === v} onChange={() => setForm({ ...form, decision: v })} className="sr-only" />
                        {t}
                      </label>
                    ))}
                  </div>
                  {error && <p className="text-xs text-clay-700">{error}</p>}
                  <IslandButton variant="ink" type="submit" disabled={busy} icon="stamp">{busy ? 'Saving…' : 'Record my decision'}</IslandButton>
                </form>
              </Bezel>
            )}
          </>
        )}
      </main>
    </div>
  )
}
