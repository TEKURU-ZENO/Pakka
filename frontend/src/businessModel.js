// PAKKA business model: ILLUSTRATIVE scenarios built from stated assumptions, not measured results.
// One source for the home "Plans" section and the #/business page. Prices are "to validate".

export const PLANS = [
  {
    key: 'family', who: 'Families and NRI owners', name: 'Build plan', price: '₹19,999', unit: 'per home',
    alt: 'or ₹2,499 per milestone check',
    why: 'Protect ₹40–60 lakh of savings for about 0.3–0.5% of the build cost.',
    includes: ['Every milestone checked against the plan', 'Mestri capture links and engineer sign-off links', 'Money ledger, release notes, family share link', 'Ask your site by voice, in Tamil or English'],
  },
  {
    key: 'engineer', who: 'Owner, optional add-on', name: 'Engineer visit', price: '₹2,500–3,000', unit: 'per visit',
    alt: 'PAKKA keeps about 20%; the engineer gets the rest',
    why: 'A licensed check at critical stages without hiring a site supervisor.',
    includes: ['Partner civil engineer at foundation and slab stages', 'Signed decision through their own link', 'Recorded against the stage and on the release note'],
  },
  {
    key: 'lender', who: 'Banks and housing finance companies', name: 'Lender pre-audit', price: '₹300–500', unit: 'per loan instalment checked',
    alt: 'Used by the lender’s own valuers (B2B)',
    why: 'Each construction-loan instalment needs a progress check. PAKKA makes the valuer faster and harder to fool.',
    includes: ['Evidence-backed progress report per instalment', 'Photo reuse and off-site detection', 'Audit stamp on every verdict'],
  },
]

export const LATER = { name: 'Verified contractor history', who: 'Mestris, premium profile', price: 'Small yearly fee', why: 'A verified track record wins them the next job.' }

// Unit economics for one home on the standard plan (rupees)
export const UNIT = {
  planFee: 19999,
  engineerVisits: 3,
  engineerVisitPrice: 2500,
  engineerTake: 0.2,
  costs: [
    ['Gemini + WhatsApp + cloud for a 10-month build', 2000],
    ['Payment fees (about 2%)', 400],
    ['Support time', 1000],
  ],
  cac: 4000,
}

export function perHome(u = UNIT) {
  const engineer = Math.round(u.engineerVisits * u.engineerVisitPrice * u.engineerTake)
  const revenue = u.planFee + engineer
  const cost = u.costs.reduce((s, [, v]) => s + v, 0)
  const gross = revenue - cost
  return { engineer, revenue, cost, gross, margin: gross / revenue, cacReturn: gross / u.cac }
}

// Market narrowing: each step says whether it is a source figure or an assumption
export const MARKET = [
  { level: 'All own-use construction', how: '98.5 lakh households a year', size: 'Headline only', source: 'MoSPI 2025' },
  { level: 'Urban', how: '× about 24% urban', size: '≈ 23.5 lakh households', source: 'Research doc; check it in the press note' },
  { level: 'Urban new homes', how: '× 20–30% new houses (not repairs or extensions)', size: '≈ 5–7 lakh homes a year', source: 'Assumption' },
  { level: 'India market for the plan', how: '× ₹20,000', size: '≈ ₹1,000–1,400 crore a year', source: 'Calculated' },
  { level: 'Tamil Nadu starting market', how: '≈ 8–10% of urban new homes', size: '≈ 40,000–70,000 homes · ₹80–140 crore a year', source: 'Assumption' },
]

export const YEARS = [
  { year: 'Year 1', where: 'Chennai', homes: 300, family: '₹65 lakh', lender: '₹5–10 lakh (1 pilot)', total: '≈ ₹75 lakh', note: '≈ 0.5% of the Tamil Nadu market' },
  { year: 'Year 2', where: 'Tamil Nadu + Kerala / Karnataka', homes: 2500, family: '₹5.4 crore', lender: '₹1 crore', total: '≈ ₹6.4 crore', note: '' },
  { year: 'Year 3', where: 'South India + NRI routes', homes: 10000, family: '₹21.5 crore', lender: '₹5 crore', total: '≈ ₹26 crore', note: '' },
]

export const LENDER_EXAMPLE = { loans: 10000, instalments: 4, price: 400 }

export function inrShort(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} crore`
  if (n >= 1e5) return `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
