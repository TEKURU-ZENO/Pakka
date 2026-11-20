// Brand marks. Each one prefers the original artwork from /brand/*.png (drop the files into
// frontend/public/brand/) and falls back to a vector redraw, so the site always has a crisp logo.
import { useState } from 'react'

export const BRAND = {
  plum: '#6B2341',
  peach: '#F8BC8C',
  cocoa: '#6E3B2A',
  navy: '#22476B',
}

function WithOriginal({ src, alt, className, children }) {
  const [failed, setFailed] = useState(false)
  if (failed) return children
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} draggable="false" />
}

// Lemniscate (∞) path, used for the flourish in the PAKKA mark
function lemniscate(cx, cy, a, tilt = 0, tail = 0) {
  const pts = []
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2
    const d = 1 + Math.sin(t) ** 2
    let x = (a * Math.cos(t)) / d
    let y = (a * Math.sin(t) * Math.cos(t)) / d
    const r = (tilt * Math.PI) / 180
    ;[x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]
    pts.push(`${(cx + x).toFixed(2)} ${(cy + y).toFixed(2)}`)
  }
  let d = `M${pts.join(' L')}`
  if (tail) d += ` M${cx + a} ${cy} q ${tail} ${-tail * 0.6} ${tail * 0.4} ${-tail * 1.4}`
  return d
}

/** The round PAKKA mark: peach disc with a rough edge, cocoa flourish. */
export function PakkaMark({ className = 'h-9 w-9', id = 'pm' }) {
  return (
    <WithOriginal src="/brand/pakka-mark.png" alt="" className={`${className} rounded-full object-cover`}>
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <defs>
          <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="3.2" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r="46" fill={BRAND.peach} filter={`url(#${id}-rough)`} />
        <g fill="none" stroke={BRAND.cocoa} strokeLinecap="round">
          <path d={lemniscate(50, 38, 30, -6, 6)} strokeWidth="2.6" />
          <path d={lemniscate(50, 50, 18, 4)} strokeWidth="1.6" opacity="0.9" />
          <path d={lemniscate(50, 62, 30, 6, -6)} strokeWidth="2.6" />
        </g>
      </svg>
    </WithOriginal>
  )
}

/** Mark + serif wordmark, for the nav. */
export function PakkaLogo({ className = '', tone = 'light' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <PakkaMark className="h-8 w-8" />
      <span
        className="font-display text-[1.45rem] leading-none tracking-[0.08em]"
        style={{ color: tone === 'dark' ? BRAND.peach : undefined }}
      >
        PAKKA
      </span>
    </span>
  )
}

/** Full PAKKA lockup on plum, as in the brand artwork. */
export function PakkaLockup({ className = '' }) {
  return (
    <WithOriginal src="/brand/pakka-logo.png" alt="PAKKA" className={`${className} object-cover`}>
      <div className={`flex flex-col items-center justify-center gap-5 ${className}`} style={{ background: BRAND.plum }}>
        <PakkaMark className="h-[46%] w-auto aspect-square" id="pl" />
        <span className="font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-none tracking-[0.06em]" style={{ color: BRAND.peach }}>
          PAKKA
        </span>
      </div>
    </WithOriginal>
  )
}

/** Veritas Labs: two overlapping triangles, serif name with flanking rules. */
export function VeritasMark({ className = 'h-24 w-auto', color = BRAND.navy, showName = true }) {
  return (
    <WithOriginal src="/brand/veritas-labs.png" alt="Veritas Labs" className={`${className} object-contain`}>
      <svg viewBox={showName ? "0 0 280 288" : "0 0 280 232"} className={className} role="img" aria-label="Veritas Labs">
        <g fill="none" stroke={color} strokeWidth="5" strokeLinejoin="miter">
          <path d="M152 12 L262 206 L120 206" />
          <path d="M14 222 L126 30 L238 222 Z" />
        </g>
        <path d="M40 206 L126 64 L208 206 Z" fill={color} />
        {showName && (
          <>
            <text x="140" y="266" textAnchor="middle" fontFamily="Instrument Serif, Georgia, serif" fontSize="40" fill={color}>
              Veritas Labs
            </text>
            <path d="M4 280h62M214 280h62" stroke={color} strokeWidth="2" />
          </>
        )}
      </svg>
    </WithOriginal>
  )
}
