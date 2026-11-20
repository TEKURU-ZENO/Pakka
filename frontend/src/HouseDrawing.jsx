// Hero visual: an architectural section of a house mid-build, drawn at dusk.
// Ground floor is cast and lit; the roof is still on shuttering. Leader-line callouts show what PAKKA
// actually reports for a false "slab done" claim (the same story as Demo A).
import { useInView } from './ui.jsx'

const C = {
  line: '#F3F0E8',
  ok: '#A9C29F',
  seen: '#C6CEC3',
  warn: '#E7B566',
  ember: '#F2C58A',
}

const COLS = [270, 410, 550, 690]
const GROUND = 470
const PLINTH_TOP = 452
const SLAB1_TOP = 286
const SLAB1_BOT = 300
const DECK = 170

function Callout({ show, delay, y, title, sub, color, target, dashed }) {
  const [tx, ty] = target
  return (
    <g
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-[1100ms] ease-lux ${show ? 'opacity-100' : 'opacity-0 -translate-x-3'}`}
    >
      <circle cx={tx} cy={ty} r="3.2" fill={color} />
      <circle cx={tx} cy={ty} r="8" fill="none" stroke={color} strokeWidth="0.7" opacity="0.6" />
      {/* Labels and leaders only where they're legible; phones get a legend under the drawing instead. */}
      <g className="hidden md:inline">
        <polyline
          points={`196,${y} 214,${y} ${tx},${ty}`}
          fill="none"
          stroke={color}
          strokeWidth="0.9"
          strokeDasharray={dashed ? '3 3' : undefined}
          opacity="0.9"
        />
        <text x="196" y={y - 9} textAnchor="end" fontFamily="Geist Mono, monospace" fontSize="10.5" letterSpacing="1.6" fill={color}>
          {title}
        </text>
        <text x="196" y={y + 15} textAnchor="end" fontFamily="Geist, sans-serif" fontSize="12.5" fill={C.line} opacity="0.75">
          {sub}
        </text>
      </g>
    </g>
  )
}

export const DRAWING_CALLOUTS = [
  { title: '03 · CONCRETE POUR', sub: 'not visible in any upload', color: C.warn, target: [360, 152], y: 132, dashed: true },
  { title: '02 · SLAB SHUTTERING', sub: 'props and deck in place', color: C.seen, target: [480, 232], y: 222 },
  { title: '01 · COLUMNS', sub: '12 visible  ✓', color: C.ok, target: [270, 372], y: 352 },
  { title: '00 · PLINTH BEAM', sub: 'verified  ✓', color: C.ok, target: [340, 460], y: 448 },
]

export default function HouseDrawing({ className = '' }) {
  const [ref, show] = useInView({ threshold: 0.2 })
  const props = []
  for (let x = 252; x <= 708; x += 38) if (!COLS.some((c) => Math.abs(c - x) < 18)) props.push(x)

  return (
    <div ref={ref} className={className}>
      <svg viewBox="0 0 820 600" className="w-full h-auto" role="img"
        aria-label="Section drawing of a house under construction: ground floor cast, roof slab still on shuttering. PAKKA marks the concrete pour as not visible.">
        <defs>
          <pattern id="earth" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke={C.line} strokeWidth="0.6" opacity="0.18" />
          </pattern>
          <pattern id="brick" width="14" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 0h14M0 4h14M7 0v4M0 4v4" stroke={C.line} strokeWidth="0.45" opacity="0.28" fill="none" />
          </pattern>
          <linearGradient id="room" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6D7AE" stopOpacity="0.95" />
            <stop offset="1" stopColor="#D3843A" stopOpacity="0.75" />
          </linearGradient>
          <radialGradient id="halo">
            <stop offset="0" stopColor="#F2C58A" stopOpacity="0.55" />
            <stop offset="1" stopColor="#F2C58A" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* interior light spilling out (behind the linework) */}
        <g className="animate-breathe">
          <ellipse cx="410" cy="380" rx="230" ry="120" fill="url(#halo)" />
          <rect x="420" y="324" width="110" height="80" fill="#E8A25A" opacity="0.35" filter="url(#soft)" />
          <rect x="284" y="314" width="112" height="134" fill="#E8A25A" opacity="0.35" filter="url(#soft)" />
        </g>

        {/* ground, earth, footings */}
        <rect x="150" y={GROUND} width="660" height="70" fill="url(#earth)" />
        <line x1="150" y1={GROUND} x2="810" y2={GROUND} stroke={C.line} strokeWidth="1.1" opacity="0.7" />
        {COLS.map((c) => (
          <g key={`f${c}`} stroke={C.line} fill="none" opacity="0.6">
            <line x1={c - 6} y1={GROUND} x2={c - 6} y2="500" strokeWidth="0.8" strokeDasharray="2 3" />
            <line x1={c + 6} y1={GROUND} x2={c + 6} y2="500" strokeWidth="0.8" strokeDasharray="2 3" />
            <rect x={c - 34} y="500" width="68" height="18" strokeWidth="0.9" />
            <line x1={c - 40} y1="524" x2={c + 40} y2="524" strokeWidth="0.6" opacity="0.6" />
          </g>
        ))}

        {/* plinth beam and entry steps */}
        <rect x="254" y={PLINTH_TOP} width="452" height="18" fill={C.line} fillOpacity="0.06" stroke={C.line} strokeWidth="1" opacity="0.8" />
        <path d={`M214 ${GROUND}v-6h14v-6h13v-6h13`} stroke={C.line} strokeWidth="0.9" fill="none" opacity="0.6" />

        {/* ground floor: columns, cast slab, infill, rooms */}
        {COLS.map((c) => (
          <rect key={`c${c}`} x={c - 8} y={SLAB1_BOT} width="16" height={PLINTH_TOP - SLAB1_BOT} fill={C.line} fillOpacity="0.08" stroke={C.line} strokeWidth="1" opacity="0.85" />
        ))}
        <rect x="240" y={SLAB1_TOP} width="480" height="14" fill={C.line} fillOpacity="0.14" stroke={C.line} strokeWidth="1.1" />
        {/* bay A: brick + window */}
        <rect x="278" y={SLAB1_BOT} width="124" height={PLINTH_TOP - SLAB1_BOT} fill="url(#brick)" />
        <rect x="300" y="332" width="80" height="66" fill="url(#room)" stroke={C.line} strokeWidth="0.8" />
        <line x1="340" y1="332" x2="340" y2="398" stroke="#1A1714" strokeWidth="1" opacity="0.5" />
        {/* bay B: open glass living room */}
        <rect x="420" y="312" width="122" height="140" fill="url(#room)" opacity="0.92" />
        <g stroke="#3A2A1A" strokeWidth="1" fill="none" opacity="0.6">
          <line x1="481" y1={SLAB1_BOT} x2="481" y2="338" />
          <path d="M471 338h20l-4 7h-12z" fill="#FDF6EC" />
          <path d="M448 420h52M454 420v32M494 420v32" />
          <path d="M432 452v-26h10v26" />
        </g>
        <rect x="420" y="312" width="122" height="140" fill="none" stroke={C.line} strokeWidth="0.9" />
        <line x1="481" y1="312" x2="481" y2="452" stroke={C.line} strokeWidth="0.5" opacity="0.5" />
        {/* bay C: brick + window */}
        <rect x="558" y={SLAB1_BOT} width="124" height={PLINTH_TOP - SLAB1_BOT} fill="url(#brick)" />
        <rect x="580" y="332" width="80" height="66" fill="url(#room)" stroke={C.line} strokeWidth="0.8" />

        {/* first floor: two cast columns, two rebar cages */}
        {COLS.map((c, i) =>
          i === 0 || i === 3 ? (
            <rect key={`u${c}`} x={c - 8} y={DECK + 10} width="16" height={SLAB1_TOP - DECK - 10} fill={C.line} fillOpacity="0.06" stroke={C.line} strokeWidth="0.9" opacity="0.75" />
          ) : (
            <g key={`u${c}`} stroke={C.line} strokeWidth="0.8" opacity="0.7">
              <line x1={c - 6} y1={DECK - 22} x2={c - 6} y2={SLAB1_TOP} />
              <line x1={c + 6} y1={DECK - 22} x2={c + 6} y2={SLAB1_TOP} />
              {Array.from({ length: 9 }, (_, k) => (
                <line key={k} x1={c - 6} x2={c + 6} y1={DECK + 2 + k * 12} y2={DECK + 2 + k * 12} />
              ))}
            </g>
          ),
        )}

        {/* shuttering: props with bracing, plank deck, rebar mesh */}
        <g stroke={C.line} opacity="0.55" strokeWidth="0.75">
          {props.map((x) => (
            <g key={`p${x}`}>
              <line x1={x} y1={DECK + 10} x2={x} y2={SLAB1_TOP} />
              <line x1={x - 5} y1={SLAB1_TOP} x2={x + 5} y2={SLAB1_TOP} />
            </g>
          ))}
          {props.slice(0, -1).map((x, i) => (
            <line key={`b${x}`} x1={x} y1={DECK + 30} x2={props[i + 1]} y2={SLAB1_TOP - 20} opacity="0.5" />
          ))}
        </g>
        <rect x="240" y={DECK} width="480" height="10" fill="none" stroke={C.line} strokeWidth="0.9" opacity="0.8" />
        <g stroke={C.line} strokeWidth="0.5" opacity="0.5">
          {Array.from({ length: 24 }, (_, k) => (
            <line key={k} x1={250 + k * 20} x2={250 + k * 20} y1={DECK} y2={DECK + 10} />
          ))}
        </g>
        <line x1="246" y1={DECK - 4} x2="714" y2={DECK - 4} stroke={C.line} strokeWidth="0.7" strokeDasharray="1 4" opacity="0.8" />
        {/* the slab that was claimed, but isn't there */}
        <rect x="240" y={DECK - 26} width="480" height="18" fill="none" stroke={C.warn} strokeWidth="0.9" strokeDasharray="5 4" opacity="0.85" />

        {/* level marks */}
        <g fontFamily="Geist Mono, monospace" fontSize="9.5" fill={C.line} opacity="0.55" letterSpacing="1">
          {[
            [PLINTH_TOP, '+0.00 FFL'],
            [SLAB1_TOP, '+3.15'],
            [DECK - 26, '+6.30 (pending)'],
          ].map(([y, t]) => (
            <g key={t}>
              <path d={`M732 ${y}l6 -7h-12z`} fill="none" stroke={C.line} strokeWidth="0.8" />
              <line x1="726" y1={y} x2="760" y2={y} stroke={C.line} strokeWidth="0.6" />
              <text x="742" y={y - 10}>{t}</text>
            </g>
          ))}
        </g>

        {/* tree and a person for scale */}
        <g stroke={C.line} fill="none" opacity="0.4" strokeWidth="0.8">
          <path d="M790 470c-2-40 2-80-4-120M786 400c-10-12-22-16-32-14M788 380c8-14 16-18 26-18" />
          <circle cx="770" cy="335" r="30" />
          <circle cx="798" cy="352" r="22" />
          <circle cx="752" cy="364" r="20" />
        </g>
        <g stroke={C.line} fill="none" strokeWidth="0.9" opacity="0.55">
          <circle cx="225" cy="425" r="4.5" />
          <path d="M225 430v20M225 450l-5 20M225 450l5 20M225 436l-7 9M225 436l7 9" />
        </g>

        {/* the claim vs the evidence */}
        <g style={{ transitionDelay: '900ms' }} className={`transition-opacity duration-[1100ms] ease-lux ${show ? 'opacity-100' : 'opacity-0'}`}>
          <line x1="560" y1="96" x2="560" y2={DECK - 28} stroke={C.ember} strokeWidth="0.7" strokeDasharray="2 3" opacity="0.8" />
          <rect x="400" y="52" width="250" height="44" rx="22" fill="#1A1714" fillOpacity="0.85" stroke={C.ember} strokeOpacity="0.45" />
          <text x="424" y="72" fontFamily="Geist Mono, monospace" fontSize="9" letterSpacing="1.6" fill={C.ember}>CLAIM · VOICE NOTE 021</text>
          <text x="424" y="87" fontFamily="Instrument Serif, serif" fontStyle="italic" fontSize="14" fill={C.line}>“Slab mudinjiduchu.” ₹2,50,000</text>
        </g>

        {DRAWING_CALLOUTS.map((c, i) => (
          <Callout key={c.title} show={show} delay={300 + i * 160} {...c} />
        ))}
      </svg>
    </div>
  )
}
