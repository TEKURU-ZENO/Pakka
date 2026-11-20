// Shared design primitives for PAKKA: scroll reveal, double-bezel shells, island buttons, light-line icons,
// and the floating island nav. Motion is transform/opacity only, on a custom cubic-bezier.
import { useEffect, useRef, useState } from 'react'
import { PakkaLogo } from './brand.jsx'

export const EASE = 'ease-lux'

// ---------------------------------------------------------------- motion

export function useInView(options = { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') return setSeen(true)
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true)
        io.disconnect()
      }
    }, options)
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

/** Heavy fade-up from blur. `delay` in ms lets siblings stagger. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, seen] = useInView()
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform,filter] duration-[1100ms] ${EASE} motion-reduce:transition-none ${
        seen ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-10 blur-[6px]'
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// ---------------------------------------------------------------- surfaces

/** Double-bezel: an outer tray with a hairline and a concentric inner core. */
export function Bezel({ children, className = '', core = '', dark = false, radius = '2rem', pad = '0.375rem' }) {
  return (
    <div
      className={`${dark ? 'bg-white/[0.04] ring-1 ring-white/10' : 'bg-ink/[0.035] ring-1 ring-ink/[0.06]'} ${className}`}
      style={{ borderRadius: radius, padding: pad }}
    >
      <div
        className={`h-full ${dark ? 'shadow-inner-hi-dark' : 'shadow-inner-hi'} ${core}`}
        style={{ borderRadius: `calc(${radius} - ${pad})` }}
      >
        {children}
      </div>
    </div>
  )
}

export function Eyebrow({ children, dark = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] ${
        dark ? 'bg-white/[0.06] text-sage-200 ring-1 ring-white/10' : 'bg-white/60 text-sage-600 ring-1 ring-ink/[0.06]'
      } ${className}`}
    >
      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${dark ? 'bg-ember-300' : 'bg-ember-500'}`} />
      {children}
    </span>
  )
}

/** Pill CTA with the trailing icon nested in its own circle. Renders <a> when given href. */
export function IslandButton({ children, onClick, href, variant = 'ink', icon = 'arrow', className = '', type = 'button', disabled, ...rest }) {
  const tones = {
    ink: 'bg-ink text-paper-light hover:bg-ink-soft',
    paper: 'bg-paper-light text-ink ring-1 ring-ink/10 hover:bg-white',
    ember: 'bg-ember-300 text-ink hover:bg-ember-200',
    ghost: 'bg-transparent text-ink ring-1 ring-ink/15 hover:bg-white/50',
  }
  const nub = {
    ink: 'bg-white/10 text-paper-light',
    paper: 'bg-ink/[0.06] text-ink',
    ember: 'bg-ink/10 text-ink',
    ghost: 'bg-ink/[0.06] text-ink',
  }
  const Tag = href ? 'a' : 'button'
  return (
    <Tag
      href={href}
      onClick={onClick}
      type={href ? undefined : type}
      disabled={disabled}
      className={`group inline-flex items-center gap-3 rounded-full pl-6 pr-1.5 py-1.5 text-sm font-medium tracking-[-0.005em] transition-[transform,background-color,opacity] duration-500 ${EASE} active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${tones[variant]} ${className}`}
      {...rest}
    >
      <span className="py-1.5">{children}</span>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-500 ${EASE} group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105 ${nub[variant]}`}
      >
        <Icon name={icon} className="h-4 w-4" />
      </span>
    </Tag>
  )
}

// ---------------------------------------------------------------- icons (ultra-light line, 1.25 stroke)

const PATHS = {
  arrow: 'M7 17 17 7M9 7h8v8',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  check: 'm5 12.5 4.2 4.2L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  house: 'M3.5 11.2 12 4l8.5 7.2M6 9.6V20h12V9.6M10 20v-5.5h4V20',
  camera: 'M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8',
  mic: 'M12 3.5a2.6 2.6 0 0 0-2.6 2.6v5.4a2.6 2.6 0 0 0 5.2 0V6.1A2.6 2.6 0 0 0 12 3.5M6.5 11.3a5.5 5.5 0 0 0 11 0M12 16.8v3.7',
  video: 'M3.5 7h11v10h-11zM14.5 10.5l6-3.2v9.4l-6-3.2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6',
  wave: 'M3 12h2M7 8.5v7M11 5.5v13M15 8v8M19 10.5v3M21 12h0',
  scale: 'M12 4v16M7 20h10M4.5 8h15M7 8l-3 6.5a3.2 3.2 0 0 0 6 0zM17 8l-3 6.5a3.2 3.2 0 0 0 6 0z',
  stamp: 'M9 4h6l-1 6h-4zM6.5 10h11v3.5h-11zM5 16.5h14M8 20h8',
  shield: 'M12 3.5 19 6v5.3c0 4.5-3 7.8-7 9.2-4-1.4-7-4.7-7-9.2V6z',
  hardhat: 'M4 16.5h16M5.5 16.5a6.5 6.5 0 0 1 13 0M10 9.8V6.2h4v3.6M3.5 19.5h17',
  coins: 'M12 7.2c4 0 7-1.1 7-2.4S16 2.5 12 2.5 5 3.6 5 4.8s3 2.4 7 2.4M5 4.8v4.8c0 1.3 3 2.4 7 2.4s7-1.1 7-2.4V4.8M5 9.6v4.8c0 1.3 3 2.4 7 2.4s7-1.1 7-2.4V9.6M5 14.4v4.8c0 1.3 3 2.4 7 2.4s7-1.1 7-2.4v-4.8',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  upload: 'M12 15.5V4.5m0 0-4 4m4-4 4 4M4.5 15v4.5h15V15',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7',
  globe: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5',
  play: 'M8 5.5v13l10.5-6.5z',
  layers: 'M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
}

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.25 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] || PATHS.arrow} />
    </svg>
  )
}

export function Logo({ className = '', tone = 'light' }) {
  return <PakkaLogo className={className} tone={tone} />
}

// ---------------------------------------------------------------- floating island nav

/**
 * links: [{ label, href }]. `right` renders extra controls inside the pill (desktop).
 * On small screens the pill collapses to logo + a hamburger that morphs into an X and opens
 * a full-screen glass overlay with a staggered reveal.
 */
export function IslandNav({ links = [], right = null, mobileExtra = null, tone = 'dark' }) {
  const dark = tone === 'dark'
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    // A sentinel at the top of the page tells us when we've scrolled (no scroll listener).
    const s = document.getElementById('top-sentinel')
    if (!s || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting))
    io.observe(s)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <div id="top-sentinel" className="absolute top-0 h-px w-px" aria-hidden="true" />
      <header className="no-print fixed inset-x-0 top-4 z-40 flex justify-center px-4 pointer-events-none">
        <nav
          aria-label="Main"
          className={`pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-full py-2 pl-5 pr-2 ring-1 transition-[background-color,box-shadow] duration-700 ${EASE} backdrop-blur-xl ${
            dark
              ? `text-paper-light ring-white/10 ${scrolled ? 'bg-[#1A1714]/95 shadow-lift' : 'bg-[#1A1714]/40'}`
              : `text-ink ${scrolled ? 'bg-paper-light/95 ring-ink/[0.07] shadow-lift' : 'bg-paper-light/40 ring-ink/[0.05]'}`
          }`}
        >
          <a href="#/" aria-label="PAKKA home">
            <Logo tone={tone} />
          </a>
          <ul className={`hidden items-center gap-1 text-[11px] uppercase tracking-[0.18em] lg:flex ${dark ? 'text-paper/70' : 'text-ink-mute'}`}>
            {links.map((l, i) => (
              <li key={l.href} className="flex items-center">
                {i > 0 && <span aria-hidden="true" className={`mx-2 h-[3px] w-[3px] rounded-full ${dark ? 'bg-paper/30' : 'bg-ink/30'}`} />}
                <a href={l.href} className={`rounded-full px-2 py-1 transition-colors duration-500 ${EASE} ${dark ? 'hover:text-paper-light' : 'hover:text-ink'}`}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-2 lg:flex">{right}</div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`relative z-50 flex h-11 w-11 items-center justify-center rounded-full lg:hidden ${
              dark ? 'bg-paper-light text-ink' : 'bg-ink text-paper-light'
            }`}
          >
            <span className={`absolute h-px w-4 bg-current transition-transform duration-500 ${EASE} ${open ? 'rotate-45' : '-translate-y-[3px]'}`} />
            <span className={`absolute h-px w-4 bg-current transition-transform duration-500 ${EASE} ${open ? '-rotate-45' : 'translate-y-[3px]'}`} />
          </button>
        </nav>
      </header>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-paper-light/85 backdrop-blur-3xl transition-opacity duration-700 ${EASE} lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="flex min-h-[100dvh] flex-col justify-center gap-2 px-8">
          {links.map((l, i) => (
            <div key={l.href} className="overflow-hidden">
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                style={{ transitionDelay: open ? `${120 + i * 60}ms` : '0ms' }}
                className={`block font-display text-5xl leading-tight text-ink transition-[transform,opacity] duration-700 ${EASE} ${
                  open ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
                }`}
              >
                {l.label}
              </a>
            </div>
          ))}
          <div
            style={{ transitionDelay: open ? `${140 + links.length * 60}ms` : '0ms' }}
            className={`mt-8 flex flex-wrap gap-3 transition-[transform,opacity] duration-700 ${EASE} ${open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
            onClick={() => setOpen(false)}
          >
            {mobileExtra}
          </div>
        </div>
      </div>
    </>
  )
}

/** Avanté-style secondary action: thin outlined rectangle, tracked caps, a long hairline arrow. */
export function LineButton({ children, href, onClick, dark = false, className = '' }) {
  const Tag = href ? 'a' : 'button'
  return (
    <Tag
      href={href}
      onClick={onClick}
      type={href ? undefined : 'button'}
      className={`group inline-flex items-center gap-4 border px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors duration-500 ${EASE} ${
        dark ? 'border-paper/30 text-paper-light hover:bg-paper-light/[0.06] hover:border-paper/50' : 'border-ink/25 text-ink hover:bg-ink/[0.03] hover:border-ink/45'
      } ${className}`}
    >
      {children}
      <svg viewBox="0 0 32 10" className={`h-2.5 w-8 transition-transform duration-500 ${EASE} group-hover:translate-x-1`} fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
        <path d="M0 5h31M26 1l5 4-5 4" />
      </svg>
    </Tag>
  )
}

export const rupees = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'))

// ---------------------------------------------------------------- role chip (who is looking at this screen)
export const ROLES = {
  owner: { en: 'Owner', ta: 'உரிமையாளர்', icon: 'house', tone: 'bg-[#1A1714] text-ember-200 ring-white/10' },
  mestri: { en: 'Mestri', ta: 'மேஸ்திரி', icon: 'camera', tone: 'bg-sage-600 text-paper-light ring-sage-700/20' },
  engineer: { en: 'Engineer', ta: 'பொறியாளர்', icon: 'hardhat', tone: 'bg-clay-500 text-paper-light ring-clay-700/20' },
  family: { en: 'Family', ta: 'குடும்பம்', icon: 'globe', tone: 'bg-ochre-500 text-paper-light ring-ochre-700/20' },
}

/** "You are: Owner · உரிமையாளர்". size="sm" for inline use in lists. */
export function RoleChip({ role, size = 'md', prefix = true, className = '' }) {
  const r = ROLES[role]
  if (!r) return null
  const sm = size === 'sm'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ring-1 ${r.tone} ${sm ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs'} ${className}`}
      aria-label={`${prefix ? 'You are viewing as ' : ''}${r.en}`}
    >
      <Icon name={r.icon} className={sm ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.6} />
      {prefix && !sm && <span className="opacity-70">You are</span>}
      <span className="font-medium">{r.en}</span>
      <span className="opacity-80" lang="ta">· {r.ta}</span>
    </span>
  )
}
