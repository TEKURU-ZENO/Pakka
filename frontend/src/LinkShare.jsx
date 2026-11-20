// A link the owner hands to someone else: QR code for the full URL, copy, open here, and a projector-size QR.
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, RoleChip } from './ui.jsx'

export default function LinkShare({ path, role, title, whatsappText }) {
  const url = `${window.location.origin}${path}`
  const [copied, setCopied] = useState(false)
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!big) return
    const onKey = (e) => e.key === 'Escape' && setBig(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big])
  const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname)

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink/[0.06] sm:flex-row sm:items-center">
      <button onClick={() => setBig(true)} title="Show large QR" className="shrink-0 self-center rounded-xl bg-white p-2 ring-1 ring-ink/10">
        <QRCodeSVG value={url} size={112} level="M" marginSize={1} aria-label={`QR code for ${url}`} />
      </button>
      <div className="min-w-0 flex-1">
        {role && <RoleChip role={role} size="sm" prefix={false} />}
        <code className="mt-2 block break-all font-mono text-xs text-ink">{url}</code>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))} className="rounded-full bg-paper-light px-4 py-2 text-xs ring-1 ring-ink/10">
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <a href={path} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-xs ring-1 ring-ink/10">Open on this device</a>
          <button onClick={() => setBig(true)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs ring-1 ring-ink/10">
            <Icon name="layers" className="h-3.5 w-3.5" /> Show QR large
          </button>
          {whatsappText && (
            <a href={`https://wa.me/?text=${encodeURIComponent(`${whatsappText} ${url}`)}`} target="_blank" rel="noreferrer"
              className="rounded-full bg-[#1A1714] px-4 py-2 text-xs text-paper-light">Send on WhatsApp</a>
          )}
        </div>
        {local && (
          <p className="mt-2 text-[11px] leading-relaxed text-ochre-700">
            This is a localhost link: a phone can’t open it. To scan, open PAKKA on this computer’s network address
            (or the deployed link) and create the link there.
          </p>
        )}
      </div>

      {/* Portal to <body>: animated ancestors use transforms, which would trap a position:fixed overlay */}
      {big && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-white p-6 text-ink" role="dialog" aria-modal="true" aria-label="Large QR code">
          {role && <RoleChip role={role} prefix={false} />}
          {title && <p className="text-center font-display text-4xl">{title}</p>}
          <QRCodeSVG value={url} size={720} level="M" marginSize={2} style={{ width: 'min(72vmin, 720px)', height: 'auto' }} />
          <code className="max-w-full break-all text-center font-mono text-sm text-ink-mute">{url}</code>
          <button onClick={() => setBig(false)} className="rounded-full bg-ink px-6 py-3 text-sm text-paper-light">Close (Esc)</button>
        </div>,
        document.body,
      )}
    </div>
  )
}
