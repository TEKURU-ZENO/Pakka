// #/business: how PAKKA earns. Illustrative scenarios from stated assumptions; not measured results.
import { useEffect, useState } from 'react'
import { PakkaLogo } from './brand.jsx'
import { inrShort, LATER, LENDER_EXAMPLE, MARKET, perHome, PLANS, UNIT, YEARS } from './businessModel.js'
import { Bezel, Eyebrow, Icon, IslandButton, Reveal } from './ui.jsx'

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

function Banner() {
  return (
    <p className="mt-6 inline-flex items-start gap-2 rounded-2xl bg-ochre-50 px-4 py-3 text-sm text-ochre-700 ring-1 ring-ochre-500/20">
      <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
      Illustrative scenarios built from stated assumptions, not measured results. Prices are to be validated with customers.
    </p>
  )
}

function Section({ eyebrow, title, children }) {
  return (
    <Reveal as="section" className="mt-20">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.02] tracking-[-0.01em]">{title}</h2>
      <div className="mt-8">{children}</div>
    </Reveal>
  )
}

function Calculator() {
  const [homes, setHomes] = useState(300)
  const [price, setPrice] = useState(UNIT.planFee)
  const [visits, setVisits] = useState(UNIT.engineerVisits)
  const [loans, setLoans] = useState(500)
  const [checkPrice, setCheckPrice] = useState(400)
  const ph = perHome({ ...UNIT, planFee: price, engineerVisits: visits })
  const family = homes * ph.revenue
  const lender = loans * LENDER_EXAMPLE.instalments * checkPrice
  const gross = homes * ph.gross + lender * 0.85 // lender checks: assume the same ~85% software margin
  const slider = (label, value, set, min, max, step, fmt) => (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-ink">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-2 w-full accent-[#D3843A]" />
    </label>
  )
  return (
    <Bezel radius="2rem" className="shadow-float" core="grid gap-0 overflow-hidden bg-paper-light lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5 p-7 md:p-10">
        {slider('Homes on the plan this year', homes, setHomes, 50, 12000, 50, (v) => v.toLocaleString('en-IN'))}
        {slider('Plan price per home', price, setPrice, 9999, 34999, 1000, inr)}
        {slider('Engineer visits per home (add-on)', visits, setVisits, 0, 6, 1, (v) => v)}
        {slider('Construction loans with a lender partner', loans, setLoans, 0, 20000, 250, (v) => v.toLocaleString('en-IN'))}
        {slider('Price per instalment check', checkPrice, setCheckPrice, 200, 600, 50, inr)}
        <p className="text-[11px] text-ink-faint">Defaults reproduce the Year 1 scenario (300 homes, a small lender pilot). Each loan has {LENDER_EXAMPLE.instalments} instalments.</p>
      </div>
      <div className="bg-[#1A1714] p-7 text-paper-light md:p-10">
        <span className="text-[10px] uppercase tracking-[0.2em] text-paper/50">Scenario result</span>
        <div className="mt-4 font-display text-6xl leading-none">{inrShort(family + lender)}</div>
        <div className="mt-2 text-sm text-paper/60">revenue a year</div>
        <dl className="mt-8 space-y-3 text-sm">
          {[
            ['Families', inrShort(family)],
            ['Lender checks', inrShort(lender)],
            ['Revenue per home', inr(ph.revenue)],
            ['Gross profit per home', `${inr(ph.gross)} (${Math.round(ph.margin * 100)}%)`],
            ['Estimated gross profit', inrShort(gross)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-t border-white/10 pt-3">
              <dt className="text-paper/60">{k}</dt>
              <dd className="font-mono">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-[11px] text-paper/40">Same formulas as the tables on this page. Illustrative only.</p>
      </div>
    </Bezel>
  )
}

export default function Business() {
  useEffect(() => { document.title = 'PAKKA · Business model' }, [])
  const ph = perHome()
  const lenderOne = LENDER_EXAMPLE.loans * LENDER_EXAMPLE.instalments * LENDER_EXAMPLE.price
  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6 sm:px-8">
        <a href="#/" aria-label="PAKKA home"><PakkaLogo /></a>
        <a href="#/" className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs ring-1 ring-ink/10">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Home
        </a>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-8">
        <Reveal>
          <Eyebrow>Business model</Eyebrow>
          <h1 className="mt-5 font-display text-[clamp(2.6rem,6vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Three ways PAKKA earns. <em className="text-sage-600">Lenders make it recurring.</em>
          </h1>
          <Banner />
        </Reveal>

        <Section eyebrow="How PAKKA earns" title="Families pay first. Engineer visits add margin. Lenders scale it.">
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <Bezel key={p.key} radius="1.75rem" className="h-full" core="flex h-full flex-col bg-paper-light p-7">
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">{p.who}</span>
                <h3 className="mt-3 font-display text-3xl">{p.name}</h3>
                <div className={`mt-4 whitespace-nowrap font-display ${p.price.includes('–') ? 'text-3xl' : 'text-4xl'}`}>{p.price}</div>
                <div className="text-xs text-ink-mute">{p.unit} · {p.alt}</div>
                <p className="mt-4 text-sm font-light leading-relaxed text-ink-soft">{p.why}</p>
                <span className="mt-auto pt-5 text-[10px] uppercase tracking-[0.18em] text-ochre-700">Price to validate</span>
              </Bezel>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-mute">Later: <b className="text-ink">{LATER.name}</b> for {LATER.who.toLowerCase()} ({LATER.price.toLowerCase()}). {LATER.why}</p>
        </Section>

        <Section eyebrow="Unit economics" title={`What one home earns: about ${inr(ph.gross)} gross profit.`}>
          <Bezel radius="2rem" core="bg-paper-light p-7 md:p-10">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b hairline"><td className="py-3">Plan fee</td><td className="py-3 text-right font-mono">{inr(UNIT.planFee)}</td></tr>
                <tr className="border-b hairline"><td className="py-3">Engineer visits: {UNIT.engineerVisits} × {inr(UNIT.engineerVisitPrice)}, PAKKA keeps {UNIT.engineerTake * 100}%</td><td className="py-3 text-right font-mono">+{inr(ph.engineer)}</td></tr>
                <tr className="border-b border-ink/30 font-medium"><td className="py-3">Revenue per home</td><td className="py-3 text-right font-mono">≈ {inr(Math.round(ph.revenue / 100) * 100)}</td></tr>
                {UNIT.costs.map(([k, v]) => (
                  <tr key={k} className="border-b hairline text-ink-soft"><td className="py-3">{k}</td><td className="py-3 text-right font-mono">−{inr(v)}</td></tr>
                ))}
                <tr className="font-display text-xl"><td className="pt-4">Gross profit</td><td className="pt-4 text-right">≈ {inr(Math.round(ph.gross / 100) * 100)} <span className="text-base text-moss-700">({Math.round(ph.margin * 100)}%)</span></td></tr>
              </tbody>
            </table>
            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
              <p className="rounded-xl bg-white p-4 ring-1 ring-ink/[0.06]">Customer acquisition (assumed) ≈ {inr(UNIT.cac)} through community groups, CA and mestri referrals, NRI associations: <b>≈ {ph.cacReturn.toFixed(1)}× return</b>.</p>
              <p className="rounded-xl bg-white p-4 ring-1 ring-ink/[0.06]">Keep engineer visits a paid add-on. Bundled into the fee, margin drops to about <b>53%</b>.</p>
              <p className="rounded-xl bg-white p-4 ring-1 ring-ink/[0.06]">Research estimate of software-only margin: <b>80–93%</b>, including expected Gemini price changes.</p>
            </div>
          </Bezel>
        </Section>

        <Section eyebrow="Revenue calculator" title="Move the assumptions. Watch the business.">
          <Calculator />
        </Section>

        <Section eyebrow="Market" title="Narrowed step by step, with every assumption named.">
          <ol className="space-y-2">
            {MARKET.map((m, i) => (
              <li key={m.level} className="grid items-center gap-3 rounded-2xl bg-paper-light p-4 ring-1 ring-ink/[0.06] sm:grid-cols-[2rem_1.2fr_1.3fr_1.2fr_auto]"
                style={{ marginLeft: `${i * 0.75}rem` }}>
                <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
                <span className="font-display text-lg">{m.level}</span>
                <span className="text-sm text-ink-soft">{m.how}</span>
                <span className="font-mono text-sm">{m.size}</span>
                <span className={`justify-self-start rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${m.source === 'Assumption' ? 'bg-ochre-50 text-ochre-700' : 'bg-sage-50 text-sage-700'}`}>{m.source}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section eyebrow="Three-year scenario" title="300 homes in Chennai to 10,000 across South India.">
          <div className="overflow-x-auto rounded-2xl ring-1 ring-ink/10">
            <table className="w-full min-w-[640px] bg-paper-light text-left text-sm">
              <thead className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                <tr>{['', 'Where', 'Homes', 'Family revenue', 'Lender revenue', 'Total'].map((h) => <th key={h} className="border-b hairline p-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {YEARS.map((y) => (
                  <tr key={y.year} className="border-b hairline">
                    <td className="p-4 font-display text-lg">{y.year}</td>
                    <td className="p-4">{y.where}{y.note && <span className="block text-xs text-ink-mute">{y.note}</span>}</td>
                    <td className="p-4 font-mono">{y.homes.toLocaleString('en-IN')}</td>
                    <td className="p-4 font-mono">{y.family}</td>
                    <td className="p-4 font-mono">{y.lender}</td>
                    <td className="p-4 font-mono font-medium">{y.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bezel radius="1.75rem" className="mt-6" core="bg-[#1A1714] p-7 text-paper-light">
            <span className="text-[10px] uppercase tracking-[0.2em] text-paper/50">How the lender line scales</span>
            <p className="mt-3 font-display text-2xl leading-snug">
              One mid-size housing finance company: {LENDER_EXAMPLE.loans.toLocaleString('en-IN')} construction loans a year ×{' '}
              {LENDER_EXAMPLE.instalments} instalments × {inr(LENDER_EXAMPLE.price)} ≈ <em className="text-ember-200">{inrShort(lenderOne)} a year</em> from a single partner.
            </p>
          </Bezel>
        </Section>

        <Section eyebrow="Value to the customer" title="The fee costs less than one mistake.">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['coins', 'About 12× the fee', 'The plan is about ₹20,000. One false “slab done” payment is ₹2.5 lakh.'],
              ['shield', 'Holding costs nothing', 'Paying early for unfinished work costs the money, the leverage over the contractor, and sometimes the house’s safety.'],
              ['hardhat', 'Cheaper than a supervisor', 'A full-time site supervisor costs about ₹20,000–30,000 a month (assumption, to check). PAKKA costs about that for the whole build.'],
            ].map(([icon, t, d]) => (
              <Bezel key={t} radius="1.75rem" core="h-full bg-paper-light p-7">
                <Icon name={icon} className="h-6 w-6 text-sage-600" />
                <h3 className="mt-5 font-display text-2xl">{t}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-ink-mute">{d}</p>
              </Bezel>
            ))}
          </div>
          <p className="mt-6 rounded-2xl bg-white p-5 text-sm leading-relaxed text-ink-soft ring-1 ring-ink/[0.06]">
            <b className="text-ink">Honest weakness:</b> a family builds a house once, so a family plan is a one-time purchase, not a
            subscription. Recurring revenue comes from referrals, which every verified build helps generate, and from lenders,
            who check loan instalments every month.
          </p>
        </Section>

        <Reveal as="section" className="mt-20">
          <Bezel radius="2.25rem" className="shadow-float" core="bg-[#1A1714] p-8 text-paper-light md:p-12">
            <span className="text-[10px] uppercase tracking-[0.2em] text-paper/50">The one line</span>
            <blockquote className="mt-4 font-display text-[clamp(1.6rem,3.2vw,2.6rem)] italic leading-[1.15]">
              “Families pay about ₹20,000, around 0.4% of the build, to protect lakhs. Our software margin is about 85%.
              Lenders pay per instalment check, and that’s what makes the business recurring. Year 1 goal: 300 homes in
              Chennai and one lender pilot.”
            </blockquote>
            <div className="mt-8"><IslandButton variant="ember" href="#/demo">See the product</IslandButton></div>
          </Bezel>
        </Reveal>
      </main>
    </div>
  )
}
