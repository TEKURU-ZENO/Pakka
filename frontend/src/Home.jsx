// PAKKA home page. Editorial luxury at dusk: dark hero with an annotated section drawing,
// paper-toned editorial sections, a dark bento for the directive. Content from the PAKKA idea deck;
// anything not built in this MVP is labelled "Roadmap".
import { useEffect, useState } from 'react'
import { BRAND, PakkaMark, VeritasMark } from './brand.jsx'
import HouseDrawing, { DRAWING_CALLOUTS } from './HouseDrawing.jsx'
import { Bezel, EASE, Eyebrow, Icon, IslandButton, IslandNav, LineButton, Reveal, rupees } from './ui.jsx'

// MoSPI NSO Construction Pilot Study (Jul-Dec 2025). The figures in the deck could not be extracted from the
// PDF, so they are left empty rather than guessed. Fill them in from the deck; the figures appear when set.
const STATS = {
  householdsLakh: null, // e.g. '12.3'  ->  "12.3 lakh households managed their own house construction..."
  selfFundedPct: null, // e.g. '78'    ->  "78% of them relied on their own income to pay for it"
}

// Mirrors backend/app/milestones.py; replaced by /api/plan when the API is reachable.
const PLAN_FALLBACK = [
  { id: 'm1', name: 'Foundation and footings', stage: 'footing', amount_inr: 300000, engineer_gate: true },
  { id: 'm2', name: 'Plinth beam', stage: 'plinth', amount_inr: 200000 },
  { id: 'm3', name: 'Ground floor columns', stage: 'columns', amount_inr: 250000 },
  { id: 'm4', name: 'Slab reinforcement ready', stage: 'slab_reinforcement', amount_inr: 150000, engineer_gate: true },
  { id: 'm5', name: 'Roof slab cast', stage: 'slab_cast', amount_inr: 250000 },
  { id: 'm6', name: 'Brickwork', stage: 'brickwork', amount_inr: 200000 },
  { id: 'm7', name: 'Plastering', stage: 'plastering', amount_inr: 150000 },
  { id: 'm8', name: 'Flooring', stage: 'flooring', amount_inr: 150000 },
]

const DUSK = {
  background:
    'radial-gradient(60% 55% at 72% 58%, rgba(211,132,58,0.28) 0%, rgba(211,132,58,0) 70%),' +
    'radial-gradient(40% 30% at 20% 0%, rgba(110,123,110,0.25) 0%, rgba(110,123,110,0) 70%),' +
    'linear-gradient(180deg, #0E0D0B 0%, #17140F 45%, #241B13 100%)',
}

const go = (route) => () => {
  window.location.hash = route
  window.scrollTo({ top: 0 })
}

const lakh = (n) => `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L`

// ---------------------------------------------------------------- small pieces

function StageGlyph({ stage }) {
  // Tiny section drawings for the stage strip
  const s = { stroke: '#F3F0E8', strokeWidth: 1, fill: 'none', opacity: 0.75 }
  const glow = <rect x="34" y="30" width="22" height="14" fill="#E8A25A" opacity="0.55" />
  const shapes = {
    footing: (
      <g {...s}><line x1="4" y1="34" x2="86" y2="34" /><rect x="18" y="40" width="20" height="7" /><rect x="52" y="40" width="20" height="7" /><path d="M28 34v6M62 34v6" strokeDasharray="2 2" /></g>
    ),
    columns: (
      <g {...s}><line x1="4" y1="50" x2="86" y2="50" /><rect x="10" y="44" width="70" height="6" /><rect x="16" y="14" width="6" height="30" /><rect x="42" y="14" width="6" height="30" /><rect x="68" y="14" width="6" height="30" /></g>
    ),
    slab_cast: (
      <g>{glow}<g {...s}><line x1="4" y1="50" x2="86" y2="50" /><rect x="8" y="14" width="74" height="6" /><rect x="14" y="20" width="5" height="30" /><rect x="70" y="20" width="5" height="30" /><rect x="34" y="30" width="22" height="14" /></g></g>
    ),
    brickwork: (
      <g {...s}><line x1="4" y1="50" x2="86" y2="50" /><rect x="8" y="12" width="74" height="5" />{[22, 28, 34, 40, 46].map((y) => <line key={y} x1="14" x2="76" y1={y} y2={y} opacity="0.5" />)}<rect x="40" y="26" width="14" height="12" fill="#E8A25A" fillOpacity="0.5" /></g>
    ),
  }
  return (
    <svg viewBox="0 0 90 56" className="h-14 w-24" aria-hidden="true">
      {shapes[stage]}
    </svg>
  )
}

function ChatCard() {
  return (
    <Bezel radius="2rem" className="shadow-float" core="overflow-hidden bg-paper-light">
      <div className="flex items-center justify-between bg-[#1A1714] px-6 py-4 text-paper-light">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
            <Icon name="hardhat" className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm">Mestri · Site</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/50">voice note 021</div>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember-300">WhatsApp</span>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-4 ring-1 ring-ink/[0.05]">
          <div className="mb-2 flex items-center gap-2 text-ink-faint">
            <Icon name="mic" className="h-4 w-4" />
            <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
              {[5, 9, 14, 8, 12, 16, 7, 11, 6, 13, 9, 5, 10, 7].map((h, i) => (
                <span key={i} className="w-[2px] rounded-full bg-sage-400" style={{ height: h }} />
              ))}
            </span>
            <span className="font-mono text-[10px]">0:07</span>
          </div>
          <p className="font-display text-xl italic leading-snug text-ink">“Sir, slab work mudinjiduchu. ₹2.5 lakh anuppunga.”</p>
          <p className="mt-1 text-xs text-ink-mute">Slab work is done. Please send ₹2.5 lakh.</p>
        </div>
        <div className="flex max-w-[88%] items-center gap-2 rounded-2xl rounded-tl-md bg-white p-4 text-ink-soft ring-1 ring-ink/[0.05]">
          <Icon name="camera" className="h-4 w-4 text-ink-faint" /> 3 photos, taken from a distance
        </div>
        <div className="ml-auto max-w-[60%] rounded-2xl rounded-tr-md bg-sage-100 p-4 text-ink">Ok, sending today 👍</div>
      </div>
    </Bezel>
  )
}

function SectionHead({ eyebrow, children, dark = false, className = '' }) {
  return (
    <Reveal className={className}>
      <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
      <h2 className={`mt-6 font-display text-[clamp(2.5rem,5.4vw,4.75rem)] leading-[0.98] tracking-[-0.015em] text-balance ${dark ? 'text-paper-light' : 'text-ink'}`}>
        {children}
      </h2>
    </Reveal>
  )
}

// ---------------------------------------------------------------- page

export default function Home() {
  const [plan, setPlan] = useState(PLAN_FALLBACK)
  useEffect(() => {
    fetch('/api/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => Array.isArray(p) && p.length && setPlan(p))
      .catch(() => {})
  }, [])
  const total = plan.reduce((s, m) => s + m.amount_inr, 0)
  const gates = plan.filter((m) => m.engineer_gate).length

  const steps = [
    { icon: 'upload', t: 'Collect', d: 'The contractor sends photos, videos and voice notes on WhatsApp, just like today.' },
    { icon: 'eye', t: 'See and hear', d: 'Gemini finds the stage, counts what is visible, spots defects and understands the Tamil voice note.' },
    { icon: 'scale', t: 'Check', d: 'Plain code compares the claim with the evidence and the agreed milestone and payment plan.' },
    { icon: 'stamp', t: 'Decide', d: 'Proven, not proven yet, or needs an engineer. The owner decides, with the proof in hand.' },
  ]

  const pipeline = [
    { k: 'Ingest', t: 'Upload', sub: 'Web upload today; WhatsApp number, Pub/Sub queue next', live: true },
    { k: 'See · Gemini', t: 'Photo and video', sub: 'Stage, elements, counts, defects, with a box or timestamp', live: true },
    { k: 'Hear · Gemini', t: 'Voice notes', sub: 'Tamil, Hindi, Telugu into claims, with confidence', live: true },
    { k: 'Decide · Code', t: 'Milestone rules', sub: 'Claim vs evidence vs payment plan', live: true },
    { k: 'Owner', t: 'Verdict with proof', sub: 'Gemini Live Q&A, engineer booking, site history', live: false },
  ]

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <IslandNav
        tone="dark"
        links={[
          { label: 'Problem', href: '#problem' },
          { label: 'Method', href: '#how' },
          { label: 'Directive', href: '#directive' },
          { label: 'Vision', href: '#vision' },
          { label: 'Team', href: '#team' },
        ]}
        right={
          <IslandButton variant="ember" onClick={go('/demo')} className="!py-1 !pl-5 text-[13px]">
            Open demo
          </IslandButton>
        }
        mobileExtra={
          <IslandButton variant="ink" onClick={go('/demo')}>
            Open the demo
          </IslandButton>
        }
      />

      {/* ------------------------------------------------ HERO (dusk) */}
      <section className="relative overflow-hidden text-paper-light" style={DUSK}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(243,240,232,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(243,240,232,0.5) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 60% 50%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 60% 50%, black, transparent)',
          }}
        />
        <div className="relative mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-10 px-4 pb-10 pt-32 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-6 lg:pt-28">
          <div>
            <Reveal>
              <Eyebrow dark>Independent site verification</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="mt-8 font-display text-[clamp(3.25rem,7.6vw,7.25rem)] leading-[0.9] tracking-[-0.02em]">
                Pay only for work <em className="text-ember-200">you can see.</em>
              </h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-8 max-w-md text-[17px] font-light leading-relaxed text-paper/65">
                PAKKA checks your contractor’s WhatsApp photos, videos and voice notes against the agreed milestone,
                before a single rupee leaves your account.
              </p>
            </Reveal>
            <Reveal delay={360} className="mt-10 flex flex-wrap items-center gap-4">
              <IslandButton variant="ember" onClick={go('/demo')}>
                Check a payment request
              </IslandButton>
              <LineButton dark href="#directive">
                Read the directive
              </LineButton>
            </Reveal>
          </div>

          <Reveal delay={200} className="relative">
            <HouseDrawing className="animate-floaty" />
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 md:hidden">
              {DRAWING_CALLOUTS.map((c) => (
                <li key={c.title} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  <span>
                    <span className="block font-mono text-[9.5px] tracking-[0.14em]" style={{ color: c.color }}>{c.title}</span>
                    <span className="text-xs text-paper/70">{c.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* feature strip */}
        <div className="relative border-t border-white/10 bg-black/20">
          <div className="mx-auto grid max-w-7xl grid-cols-1 px-4 sm:px-8 md:grid-cols-[1fr_1fr_1fr_auto]">
            {[
              { icon: 'eye', t: 'Gemini observes', d: 'Stage, counts and defects, boxed on the photo' },
              { icon: 'scale', t: 'Code decides', d: 'Plain, tested rules. No AI in the verdict' },
              { icon: 'stamp', t: 'You pay', d: 'PAKKA never moves money or certifies safety' },
            ].map((f, i) => (
              <Reveal key={f.t} delay={i * 120} className={`flex items-start gap-4 py-7 md:px-8 ${i > 0 ? 'border-t border-white/10 md:border-l md:border-t-0' : 'md:pl-0'}`}>
                <Icon name={f.icon} className="mt-0.5 h-6 w-6 shrink-0 text-ember-300" />
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-paper-light">{f.t}</div>
                  <p className="mt-1.5 text-sm font-light text-paper/55">{f.d}</p>
                </div>
              </Reveal>
            ))}
            <a href="#problem" className="hidden flex-col items-center justify-center gap-2 border-l border-white/10 pl-10 text-[10px] uppercase tracking-[0.24em] text-paper/50 transition-colors duration-500 ease-lux hover:text-paper-light md:flex">
              Scroll to discover
              <span className="relative h-8 w-px bg-paper/25" aria-hidden="true">
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-paper/50" />
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ PROBLEM */}
      <section id="problem" className="scroll-mt-24 px-4 py-28 sm:px-8 md:py-40">
        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1fr_1fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHead eyebrow="The problem">
              A family in Dubai is building a home in their hometown, <em className="text-sage-600">with years of savings.</em>
            </SectionHead>
            <Reveal delay={150}>
              <p className="mt-8 max-w-md text-lg font-light leading-relaxed text-ink-mute">
                This is how a payment gets decided today: a voice note, three distant photos, and trust.
              </p>
            </Reveal>
          </div>

          <div className="space-y-16">
            <Reveal>
              <ChatCard />
              <p className="mt-6 font-display text-2xl italic leading-snug text-ink-soft">
                The owner can’t tell what the photos actually show, so they pay on trust.
              </p>
            </Reveal>

            <div>
              <Reveal className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">What goes wrong</Reveal>
              <ol className="mt-4">
                {[
                  'Stages get billed before they are finished',
                  'Steel, cover and curing get skipped to save time',
                  'Defects are found only after plaster hides them',
                ].map((t, i) => (
                  <Reveal as="li" key={t} delay={i * 110} className="flex items-baseline gap-6 border-t hairline py-6">
                    <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
                    <span className="font-display text-[1.75rem] leading-tight text-ink">{t}</span>
                  </Reveal>
                ))}
              </ol>
            </div>

            {(STATS.householdsLakh || STATS.selfFundedPct) && (
              <Reveal className="grid grid-cols-2 border-y hairline">
                {STATS.householdsLakh && (
                  <div className="py-8 pr-6">
                    <div className="font-display text-6xl">{STATS.householdsLakh}<span className="text-3xl"> lakh</span></div>
                    <p className="mt-2 text-sm text-ink-mute">households managed their own house construction in just six months of 2025</p>
                  </div>
                )}
                {STATS.selfFundedPct && (
                  <div className="border-l hairline py-8 pl-6">
                    <div className="font-display text-6xl">{STATS.selfFundedPct}%</div>
                    <p className="mt-2 text-sm text-ink-mute">of them relied on their own income to pay for it</p>
                  </div>
                )}
                <p className="col-span-2 pb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  Source · MoSPI NSO Construction Pilot Study, Jul–Dec 2025
                </p>
              </Reveal>
            )}

            <Reveal>
              <Bezel dark radius="2rem" className="bg-ink" core="bg-[#1A1714] p-8 md:p-10">
                <p className="font-display text-3xl leading-tight text-paper-light">
                  Builders track their own work. <em className="text-ember-200">Nobody checks on the owner’s behalf.</em>
                </p>
                <p className="mt-4 text-sm font-light text-paper/55">
                  Most homes are built by a local contractor the family hired itself. PAKKA is independent, and works
                  only for the family.
                </p>
              </Bezel>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ THE PLAN (featured-property layout) */}
      <section className="bg-paper-deep px-4 py-28 sm:px-8 md:py-36">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div>
            <Reveal className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">The agreed plan</Reveal>
            <Reveal delay={100}>
              <h2 className="mt-5 font-display text-[clamp(2.6rem,5vw,4.5rem)] leading-[0.98] tracking-[-0.015em]">
                Every stage, <em className="text-sage-600">priced and proven.</em>
              </h2>
            </Reveal>
            <Reveal delay={160} className="mt-5 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-ink-mute">
              <Icon name="house" className="h-4 w-4" /> RCC framed house · Tamil Nadu
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-6 max-w-md font-light leading-relaxed text-ink-mute">
                The family and contractor agree a payment plan up front. Each request is checked against its stage:
                what must be visible, how much it costs, and whether an engineer has to sign off.
              </p>
            </Reveal>
            <Reveal delay={280} className="mt-10 grid grid-cols-2 border-y hairline sm:grid-cols-4">
              {[
                [plan.length, 'Milestones'],
                [gates, 'Engineer gates'],
                [lakh(total), 'Total plan'],
                [3, 'Verdicts'],
              ].map(([n, l], i) => (
                <div key={l} className={`py-6 ${i % 2 ? 'border-l hairline pl-5' : 'pr-5'} ${i === 2 ? 'sm:border-l sm:pl-5' : ''}`}>
                  <div className="font-display text-4xl leading-none">{n}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink-mute">{l}</div>
                </div>
              ))}
            </Reveal>
            <Reveal delay={340} className="mt-10">
              <LineButton onClick={go('/demo')}>Open the checker</LineButton>
            </Reveal>
          </div>

          <Reveal delay={150}>
            <Bezel radius="2.25rem" className="shadow-float" core="overflow-hidden bg-[#1A1714] text-paper-light" pad="0.5rem">
              <div className="relative p-7 md:p-10" style={{ background: 'radial-gradient(70% 60% at 80% 0%, rgba(211,132,58,0.22), transparent 70%)' }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/50">Schedule of payments</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember-300">{rupees(total)}</span>
                </div>
                <ol className="mt-6">
                  {plan.map((m, i) => (
                    <li key={m.id} className="flex items-center justify-between gap-4 border-t border-white/[0.07] py-3.5">
                      <span className="flex items-baseline gap-4">
                        <span className="font-mono text-[11px] text-paper/40">{String(i + 1).padStart(2, '0')}</span>
                        <span className="font-display text-xl">{m.name}</span>
                        {m.engineer_gate && (
                          <span className="hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ember-200 ring-1 ring-ember-300/40 xl:inline">
                            Engineer gate
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-paper/80">{rupees(m.amount_inr)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
                {[
                  ['footing', 'Footings'],
                  ['columns', 'Columns'],
                  ['slab_cast', 'Roof slab'],
                  ['brickwork', 'Brickwork'],
                ].map(([s, l]) => (
                  <div key={s} className="flex flex-col items-center gap-2 bg-[#1A1714] px-2 py-5">
                    <StageGlyph stage={s} />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-paper/50">{l}</span>
                  </div>
                ))}
              </div>
            </Bezel>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ METHOD */}
      <section id="how" className="scroll-mt-24 px-4 py-28 sm:px-8 md:py-40">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="The method" className="max-w-4xl">
            Every payment request, <em className="text-sage-600">checked against what the site really shows.</em>
          </SectionHead>

          <ol className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.t} delay={i * 110}>
                <Bezel radius="1.75rem" core="flex h-full flex-col bg-paper-light p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white ring-1 ring-ink/[0.06]">
                    <Icon name={s.icon} className="h-5 w-5 text-sage-600" />
                  </span>
                  <h3 className="mt-8 font-display text-3xl">{s.t}</h3>
                  <p className="mt-3 text-sm font-light leading-relaxed text-ink-mute">{s.d}</p>
                  <div className="mt-auto pt-8">
                    <div className="h-px w-full bg-ink/10">
                      <div className="h-px bg-ember-500" style={{ width: `${(i + 1) * 25}%` }} />
                    </div>
                    <div className="mt-3 font-mono text-[11px] text-ink-faint">0{i + 1}</div>
                  </div>
                </Bezel>
              </Reveal>
            ))}
          </ol>

          {/* Drawing sheet: sample verdict */}
          <Reveal className="mt-20">
            <Bezel radius="2.25rem" pad="0.5rem" className="shadow-float" core="overflow-hidden bg-paper-light bg-drafting">
              <div className="grid lg:grid-cols-[1.35fr_1fr]">
                <div className="p-8 md:p-12">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Sample verdict · request ₹2,50,000</span>
                    <span className="rounded-full bg-ochre-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-ochre-700 ring-1 ring-ochre-500/30">
                      Not proven yet
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.02]">
                    Claim “slab done” <em className="text-ochre-500">is not supported.</em>
                  </h3>
                  <ul className="mt-8">
                    {[
                      ['bg-moss-500', 'Columns', '12 visible', true],
                      ['bg-sage-400', 'Slab shuttering', 'formwork in place', true],
                      ['bg-ochre-500', 'Concrete pour', 'not visible in any upload', false],
                    ].map(([dot, what, text, ok]) => (
                      <li key={what} className="flex items-center gap-4 border-t hairline py-4">
                        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
                        <span className="w-40 text-[11px] uppercase tracking-[0.16em] text-ink-mute">{what}</span>
                        <span className="text-ink">{text}</span>
                        {ok && <Icon name="check" className="ml-auto h-4 w-4 text-moss-500" />}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-8 border-l-2 border-ember-400 pl-5 font-light leading-relaxed text-ink-soft">
                    <span className="font-medium text-ink">Ask next:</span> a photo of the slab top, and the rebar mesh
                    before the pour. Engineer visit suggested before pouring.
                  </p>
                </div>
                <div className="flex flex-col border-t hairline lg:border-l lg:border-t-0">
                  {[
                    ['shield', 'Confidence gate', 'Blurry or partial evidence is never guessed. PAKKA asks for a specific new photo.'],
                    ['hardhat', 'Safety gate', 'Foundation, slab and other critical stages always route to a civil engineer.'],
                    ['copy', 'Fraud checks', 'A re-sent photo isn’t new evidence, and a milestone already verified is flagged if claimed again.'],
                  ].map(([icon, t, d], i) => (
                    <div key={t} className={`flex gap-4 p-8 ${i ? 'border-t hairline' : ''}`}>
                      <Icon name={icon} className="mt-1 h-5 w-5 shrink-0 text-sage-600" />
                      <div>
                        <h4 className="text-[11px] font-medium uppercase tracking-[0.2em]">{t}</h4>
                        <p className="mt-2 text-sm font-light leading-relaxed text-ink-mute">{d}</p>
                      </div>
                    </div>
                  ))}
                  <div className="mt-auto grid grid-cols-3 border-t hairline font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-mute">
                    {[['Sheet', 'V-03'], ['Scale', 'As visible'], ['Rules', 'v1.2.0']].map(([k, v], i) => (
                      <div key={k} className={`px-4 py-3 ${i ? 'border-l hairline' : ''}`}>
                        <div className="text-ink-faint">{k}</div>
                        <div className="mt-0.5 text-ink">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Bezel>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ DIRECTIVE (dark bento) */}
      <section id="directive" className="scroll-mt-24 px-4 py-28 text-paper-light sm:px-8 md:py-40" style={DUSK}>
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="The directive" dark className="max-w-4xl">
            Three roles, <em className="text-ember-200">never blurred.</em>
          </SectionHead>

          <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-12">
            <Reveal className="md:col-span-7 md:row-span-2">
              <Bezel dark radius="2.25rem" className="h-full" core="relative flex h-full flex-col justify-between overflow-hidden bg-[#1A1714] p-8 md:p-12">
                <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ember-500/20 blur-3xl" />
                <p className="relative font-display text-[clamp(2.4rem,4.6vw,4.25rem)] leading-[1.02]">
                  Gemini <em className="text-ember-200">observes.</em>
                  <br />
                  Code <em className="text-ember-200">decides.</em>
                  <br />
                  The owner <em className="text-ember-200">pays.</em>
                </p>
                <div className="relative mt-12 grid gap-6 border-t border-white/10 pt-8 text-sm font-light text-paper/60 sm:grid-cols-2">
                  <p>
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-paper-light">Blind observation</span>
                    Gemini is never told what the contractor claims. It describes the site; code compares afterwards.
                  </p>
                  <p>
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-paper-light">No AI in the verdict</span>
                    Every verdict, threshold and rupee comes from plain, tested rules.
                  </p>
                </div>
              </Bezel>
            </Reveal>
            {[
              { span: 'md:col-span-5', icon: 'shield', t: 'Never certifies a structure as safe', d: 'Critical stages always get a licensed engineer, whatever the AI says.' },
              { span: 'md:col-span-5', icon: 'coins', t: 'Never moves money', d: 'The owner makes every payment call. PAKKA only shows the evidence.' },
              { span: 'md:col-span-4', icon: 'eye', t: 'Checks visible progress', d: 'Every request is compared with what the photos and videos show.' },
              { span: 'md:col-span-4', icon: 'camera', t: 'Never guesses', d: 'An unclear photo means it asks the contractor for a specific new one.' },
              { span: 'md:col-span-4', icon: 'stamp', t: 'Every verdict is auditable', d: 'Each result records the model, prompt version, rules version and thresholds.' },
            ].map((c, i) => (
              <Reveal key={c.t} delay={100 + i * 90} className={c.span}>
                <Bezel dark radius="1.75rem" className="h-full" core="h-full bg-white/[0.03] p-7">
                  <Icon name={c.icon} className="h-6 w-6 text-ember-300" />
                  <h3 className="mt-6 font-display text-2xl leading-tight">{c.t}</h3>
                  <p className="mt-2 text-sm font-light leading-relaxed text-paper/55">{c.d}</p>
                </Bezel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ ARCHITECTURE */}
      <section className="px-4 py-28 sm:px-8 md:py-40">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Under the hood" className="max-w-4xl">
            Built on Gemini and Google Cloud, <em className="text-sage-600">in the Mumbai region.</em>
          </SectionHead>
          <ol className="relative mt-20 grid grid-cols-1 gap-10 md:grid-cols-5 md:gap-6">
            <span aria-hidden="true" className="absolute left-0 right-0 top-[7px] hidden h-px bg-ink/15 md:block" />
            {pipeline.map((p, i) => (
              <Reveal as="li" key={p.k} delay={i * 110} className="relative">
                <span
                  aria-hidden="true"
                  className={`relative block h-[15px] w-[15px] rounded-full ring-1 ${p.live ? 'bg-ember-400 ring-ember-500/40' : 'bg-paper ring-ink/25'}`}
                />
                <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">{p.k}</div>
                <h3 className="mt-2 font-display text-2xl">{p.t}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-ink-mute">{p.sub}</p>
                <span className={`mt-4 inline-block text-[9.5px] uppercase tracking-[0.2em] ${p.live ? 'text-moss-500' : 'text-ink-faint'}`}>
                  {p.live ? '● In this demo' : '○ Roadmap'}
                </span>
              </Reveal>
            ))}
          </ol>
          <Reveal className="mt-20 flex flex-wrap gap-2">
            {[
              ['Gemini API · Flash', true],
              ['Cloud Run', true],
              ['Cloud Storage', true],
              ['Secret Manager', true],
              ['Gemini Pro for disputes', false],
              ['Gemini Live', false],
              ['Pub/Sub', false],
              ['Cloud SQL', false],
              ['IAM roles', false],
            ].map(([t, live]) => (
              <span
                key={t}
                className={`rounded-full px-4 py-2 text-xs ${live ? 'bg-paper-light text-ink ring-1 ring-ink/10' : 'text-ink-faint'}`}
                style={live ? undefined : { outline: '1px dashed rgba(28,29,26,0.18)', outlineOffset: '-1px' }}
              >
                {t}
                {!live && <span className="ml-1.5 text-[10px] uppercase tracking-[0.14em]">· roadmap</span>}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ VISION */}
      <section id="vision" className="scroll-mt-24 bg-paper-deep px-4 py-28 sm:px-8 md:py-40">
        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1fr_1fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHead eyebrow="The vision">
              An independent check on every stage <em className="text-sage-600">of every self-built home.</em>
            </SectionHead>
          </div>
          <div>
            {[
              ['Who pays', 'Families building their own home', 'Starting in Chennai and Tamil Nadu, with NRI owners in the Gulf as a key segment. Then banks and housing finance companies that release construction loans in stages.'],
              ['How it earns', 'A fee per home, plus engineer visits', 'Around ₹15,000 to ₹25,000 for the full build, far less than a full-time site supervisor. Paid engineer visits at critical stages, and a per-inspection price for lenders.'],
              ['Where it goes', 'India first, then beyond', 'Tamil Nadu, then Indian families abroad, then self-built housing across South Asia. Owners will ask their site by voice, in Tamil or English: “What happened this week?”'],
            ].map(([k, t, d], i) => (
              <Reveal key={k} delay={i * 110} className="grid gap-2 border-t hairline py-10 sm:grid-cols-[9rem_1fr] sm:gap-8">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-mute">{k}</span>
                <div>
                  <h3 className="font-display text-3xl leading-tight">{t}</h3>
                  <p className="mt-3 font-light leading-relaxed text-ink-mute">{d}</p>
                </div>
              </Reveal>
            ))}
            <Reveal className="border-t hairline pt-10">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-mute">Roadmap</span>
              <ol className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[
                  ['Now', 'Web demo: photos and a voice note in, verdict with proof out'],
                  ['Next', 'WhatsApp intake, owner accounts, partner engineers'],
                  ['Then', 'Gemini Live voice Q&A, lender inspection reports'],
                  ['Later', 'Labelled site photos train a detection model'],
                ].map(([w, d], i) => (
                  <li key={w}>
                    <div className={`h-px ${i === 0 ? 'bg-ember-500' : 'bg-ink/15'}`} />
                    <div className={`mt-4 font-display text-2xl ${i === 0 ? 'text-ember-600' : ''}`}>{w}</div>
                    <p className="mt-1 text-xs font-light leading-relaxed text-ink-mute">{d}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ OUR TEAM */}
      <section id="team" className="scroll-mt-24 px-4 py-28 sm:px-8 md:py-40">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Our team" className="max-w-4xl">
            PAKKA is built by <em className="text-sage-600">Veritas Labs.</em>
          </SectionHead>

          <div className="mt-16 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <Bezel radius="2.25rem" pad="0.5rem" className="h-full shadow-float" core="flex h-full flex-col items-center justify-center gap-10 bg-[#F0EDE8] px-8 py-14">
                <VeritasMark className="h-48 w-auto md:h-56" />
                <p className="max-w-sm text-center font-light leading-relaxed text-ink-mute">
                  <em className="font-display text-xl not-italic text-ink">Veritas</em>, Latin for truth. We build the
                  layer that checks what AI and people claim, before anyone acts on it.
                </p>
              </Bezel>
            </Reveal>

            <div className="flex flex-col gap-6">
              <Reveal delay={100}>
                <Bezel radius="2.25rem" core="bg-paper-light p-8 md:p-10">
                  <blockquote className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] italic leading-[1.1] tracking-[-0.01em]">
                    “Most AI products generate answers. I build the part that checks them.”
                  </blockquote>
                  <div className="mt-8 flex items-center gap-4">
                    <span className="h-px w-10 bg-ember-500" aria-hidden="true" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.22em]">Dev Mehta · Founder, Veritas Labs</span>
                  </div>
                  <p className="mt-5 text-sm font-light leading-relaxed text-ink-mute">
                    B.Tech CSE at SRM, Rank 1 with a 9.86 CGPA. Four peer-reviewed AI papers. Built computer vision
                    models for detection and segmentation at Airawat Research Foundation, IIT Kanpur CoE, and a
                    real-time voice agent. Native Tamil and Hindi speaker. Front-end hackathon winner.
                  </p>
                </Bezel>
              </Reveal>
              <Reveal delay={180} className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {[
                  ['eye', 'Computer vision', 'Detection and segmentation models, now reading construction sites.'],
                  ['wave', 'Voice and language', 'Tamil, Hindi and Telugu voice notes turned into checkable claims.'],
                ].map(([icon, t, d]) => (
                  <Bezel key={t} radius="1.75rem" core="h-full bg-paper-light p-7">
                    <Icon name={icon} className="h-6 w-6 text-sage-600" />
                    <h3 className="mt-6 font-display text-2xl">{t}</h3>
                    <p className="mt-2 text-sm font-light leading-relaxed text-ink-mute">{d}</p>
                  </Bezel>
                ))}
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ CTA + FOOTER */}
      <section className="relative overflow-hidden px-4 pt-28 text-paper-light sm:px-8 md:pt-40" style={DUSK}>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 translate-y-1/2 rounded-full bg-ember-500/25 blur-3xl" />
        <Reveal className="relative mx-auto max-w-4xl text-center">
          <h2 className="font-display text-[clamp(2.75rem,6.4vw,5.75rem)] leading-[0.95] tracking-[-0.02em]">
            See it catch a false <em className="text-ember-200">“slab done”.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-md font-light text-paper/60">
            Load the three demo scenarios, or upload your own site photos and a voice note.
          </p>
          <div className="mt-10 flex justify-center">
            <IslandButton variant="ember" onClick={go('/demo')}>
              Open the demo
            </IslandButton>
          </div>
        </Reveal>

        <footer className="relative mx-auto mt-28 max-w-7xl pb-10">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-6">
            <span className="flex items-center gap-3">
              <PakkaMark className="h-11 w-11" id="ft" />
              <span className="font-display text-3xl tracking-[0.08em]" style={{ color: BRAND.peach }}>PAKKA</span>
            </span>
            <a href="#team" className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-paper/55 transition-colors duration-500 ease-lux hover:text-paper-light">
              A product of
              <span className="flex items-center gap-2.5 rounded-full bg-[#F0EDE8] py-1.5 pl-2.5 pr-4 normal-case tracking-normal">
                <VeritasMark className="h-7 w-auto" showName={false} />
                <span className="font-display text-lg leading-none" style={{ color: BRAND.navy }}>Veritas Labs</span>
              </span>
            </a>
          </div>
          <div className="grid grid-cols-2 border border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45 md:grid-cols-6">
            {[
              ['Project', 'Pakka'],
              ['Sheet', 'Overview'],
              ['Revision', '1.2'],
              ['Scale', 'As visible'],
              ['Region', 'asia-south1'],
              ['Event', 'Startup Buildathon 2026'],
            ].map(([k, v], i) => (
              <div key={k} className={`px-4 py-4 ${i % 2 ? 'border-l border-white/10' : ''} ${i >= 2 ? 'border-t border-white/10 md:border-t-0' : ''} ${i % 2 === 0 && i > 0 ? 'md:border-l md:border-white/10' : ''}`}>
                <div>{k}</div>
                <div className="mt-1 text-paper-light">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs font-light text-paper/40">
            PAKKA verifies visible progress only. It never certifies structural safety and never moves money.
          </p>
        </footer>
      </section>
    </div>
  )
}
