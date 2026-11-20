// PAKKA design tokens: "editorial luxury" (warm paper, muted sage, espresso ink, ember interior light)
// crossed with architectural drawing language (hairlines, drafting grid, title blocks).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F3F0E8', deep: '#EAE5D9', light: '#F9F7F2' },
        sage: {
          50: '#EEF1EC', 100: '#DFE4DC', 200: '#C6CEC3', 300: '#A9B4A8', 400: '#8A978A',
          500: '#6E7B6E', 600: '#566156', 700: '#414A42', 800: '#2D332E',
        },
        ink: { DEFAULT: '#1C1D1A', soft: '#3A3B36', mute: '#6B6A62', faint: '#9A988E' },
        ember: { 50: '#FDF6EC', 100: '#FBEBD3', 200: '#F6D7AE', 300: '#F2C58A', 400: '#E8A25A', 500: '#D3843A', 600: '#A9662A' },
        // Verdict tones, desaturated to sit on paper
        moss: { 50: '#EAEFE6', 100: '#D6E0D0', 500: '#4F6B4A', 700: '#34482F' },
        ochre: { 50: '#FAF0DE', 100: '#F3E0BC', 500: '#A87522', 700: '#6E4A12' },
        clay: { 50: '#F7E8E2', 100: '#EED0C5', 500: '#A4503B', 700: '#6F3022' },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionTimingFunction: {
        lux: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      boxShadow: {
        // Highly diffused ambient shadows only; never a hard drop shadow
        float: '0 30px 80px -30px rgba(45, 51, 46, 0.25), 0 12px 30px -18px rgba(45, 51, 46, 0.18)',
        lift: '0 18px 50px -24px rgba(45, 51, 46, 0.28)',
        'inner-hi': 'inset 0 1px 1px rgba(255, 255, 255, 0.7)',
        'inner-hi-dark': 'inset 0 1px 1px rgba(255, 255, 255, 0.08)',
        glow: '0 0 80px 10px rgba(232, 162, 90, 0.35)',
      },
      keyframes: {
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(400%)' } },
        breathe: { '0%, 100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        floaty: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: {
        scan: 'scan 2.4s cubic-bezier(0.32, 0.72, 0, 1) infinite',
        breathe: 'breathe 4s cubic-bezier(0.37, 0, 0.63, 1) infinite',
        floaty: 'floaty 9s cubic-bezier(0.37, 0, 0.63, 1) infinite',
      },
    },
  },
  plugins: [],
}
