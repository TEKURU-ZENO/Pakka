// #/roles: "Demo: who's who". One card per role, with an "Open as" button that creates a fresh link through the
// existing APIs (owner key required) and opens that role's real screen. Ends with the full access table.
import { useEffect, useState } from 'react'
import { ACCESS } from './accessTable.js'
import { api } from './api.js'
import { PakkaLogo } from './brand.jsx'
import { Bezel, Icon, IslandButton, Reveal, RoleChip, ROLES } from './ui.jsx'

const SHORT_GET_IN = {
  owner: 'Owner key',
  mestri: 'One-milestone link',
  engineer: 'Single sign-off link',
  family: 'Read-only expiring link',
}
// which two "can't" lines to show on each card (all of them are in the table below)
const PICK = { owner: [0, 1], mestri: [0, 4], engineer: [0, 3], family: [0, 1] }

async function texturedSample(name) {
  // Real sample if present; otherwise a textured canvas that passes the quality gate (fine for mock mode).
  try {
    const r = await fetch(`/samples/${name}`)
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) return new File([await r.blob()], name, { type: 'image/jpeg' })
  } catch { /* fall through */ }
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 300
  const x = c.getContext('2d')
  x.fillStyle = '#5a4a3a'
  x.fillRect(0, 0, 400, 300)
  for (let i = 0; i < 9000; i++) {
    const v = 20 + Math.floor(Math.random() * 216)
    x.fillStyle = `rgba(${v},${v},${v},0.45)`
    x.fillRect(Math.random() * 400, Math.random() * 300, 3, 3)
  }
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg'))
  return new File([blob], name, { type: 'image/jpeg' })
}

async function linkFor(role) {
  if (role === 'owner') return '/#/demo'
  if (role === 'mestri') return (await api('/api/capture-links', { method: 'POST', json: { milestone_id: 'm5' } })).path
  if (role === 'family') return (await api('/api/share-links', { method: 'POST', json: { label: 'Demo' } })).path
  // engineer: needs a check that is waiting for an engineer; create one from the Demo C sample if there is none
  const updates = (await api('/api/updates')) || []
  let target = updates.find((u) => u.report.verdict === 'needs_engineer' && !(u.signoffs || []).some((s) => s.decision === 'approved'))
  if (!target) {
    const fd = new FormData()
    fd.append('files', await texturedSample('demo_c_site_rebar.jpg'))
    fd.append('milestone_id', 'm4')
    fd.append('consent', 'true')
    target = await api('/api/updates', { method: 'POST', body: fd })
    if (target.report.verdict !== 'needs_engineer') throw new Error('The demo check did not need an engineer this time. Try Demo C on the owner desk.')
  }
  return (await api(`/api/updates/${target.id}/engineer-link`, { method: 'POST' })).path
}

function OpenAs({ role }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setErr('')
    setBusy(true)
    const w = window.open('', '_blank') // open now, inside the click, so pop-up blockers allow it
    try {
      const path = await linkFor(role)
      if (w) w.location.href = path
      else window.location.href = path
    } catch (e) {
      w?.close()
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <IslandButton variant={role === 'owner' ? 'ink' : 'paper'} onClick={go} disabled={busy} icon="arrow">
        {busy ? 'Creating link…' : `Open as ${ROLES[role].en}`}
      </IslandButton>
      {role === 'engineer' && <p className="mt-2 text-[11px] text-ink-faint">Creates a demo check first if none is waiting for an engineer (one AI call in live mode).</p>}
      {err && <p className="mt-2 text-xs text-clay-700">{err}</p>}
    </div>
  )
}

export default function Roles() {
  useEffect(() => { document.title = 'PAKKA · Demo: who’s who' }, [])
  return (
    <div className="min-h-[100dvh] bg-paper bg-drafting text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-6 sm:px-8">
        <a href="#/demo" aria-label="Back to the owner desk"><PakkaLogo /></a>
        <a href="#/demo" className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs ring-1 ring-ink/10">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Owner desk
        </a>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-8">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-ochre-500 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-paper-light">
            Demo
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.6rem,6vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Who’s who <em className="text-sage-600">on a PAKKA site.</em>
          </h1>
          <p className="mt-4 max-w-2xl font-light leading-relaxed text-ink-mute">
            No accounts. Each person gets exactly one kind of link or key, and the server enforces what it can do.
            “Open as” creates a fresh link with the owner’s key and opens that person’s real screen in a new tab.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {ACCESS.map((a, i) => (
            <Reveal key={a.role} delay={i * 80}>
              <Bezel radius="2rem" className="h-full" core="flex h-full flex-col bg-paper-light p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RoleChip role={a.role} prefix={false} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">{SHORT_GET_IN[a.role]}</span>
                </div>
                <p className="mt-4 text-sm font-light leading-relaxed text-ink-soft">{a.getIn}</p>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-moss-700">Can</div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {a.can.slice(0, 3).map((c) => (
                        <li key={c} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-moss-500" />{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-clay-700">Cannot</div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {PICK[a.role].map((k) => (
                        <li key={k} className="flex gap-2"><Icon name="x" className="mt-0.5 h-4 w-4 shrink-0 text-clay-500" />{a.cant[k][0]}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-auto pt-7"><OpenAs role={a.role} /></div>
              </Bezel>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-20">
          <h2 className="font-display text-4xl">Access, as the server enforces it</h2>
          <p className="mt-2 text-sm font-light text-ink-mute">
            Each “can’t” names the code in <code className="font-mono text-xs">backend/app/main.py</code> that enforces it. Same table as <code className="font-mono text-xs">docs/ACCESS.md</code>.
            The owner key is enforced only when <code className="font-mono text-xs">PAKKA_ACCESS_KEY</code> is set (always on the deployed link).
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ink/10">
            <table className="w-full min-w-[920px] border-collapse bg-paper-light text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                  {['', 'How they get in', 'Sees', 'Can do', 'Can’t do (and what enforces it)', 'Expiry'].map((h) => (
                    <th key={h} className="border-b hairline p-4 align-bottom font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCESS.map((a) => (
                  <tr key={a.role} className="align-top">
                    <td className="border-b hairline p-4"><RoleChip role={a.role} size="sm" prefix={false} /></td>
                    <td className="border-b hairline p-4 font-light">{a.getIn}</td>
                    <td className="border-b hairline p-4 font-light">{a.sees}</td>
                    <td className="border-b hairline p-4 font-light"><ul className="space-y-1">{a.can.map((c) => <li key={c}>· {c}</li>)}</ul></td>
                    <td className="border-b hairline p-4 font-light">
                      <ul className="space-y-2">
                        {a.cant.map(([what, how]) => (
                          <li key={what}>{what}<span className="block font-mono text-[10.5px] text-ink-faint">{how}</span></li>
                        ))}
                      </ul>
                    </td>
                    <td className="border-b hairline p-4 font-light">{a.expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </main>
    </div>
  )
}
