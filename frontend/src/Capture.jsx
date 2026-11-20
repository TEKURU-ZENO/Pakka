// Mestri capture page (#/capture/<token>). The owner sends this link; the mestri takes the listed shots with the
// phone camera at the site and sends them straight to PAKKA (no WhatsApp compression, no gallery photos).
// The mestri gets a receipt; the verdict goes to the owner.
import { useEffect, useState } from 'react'
import { PakkaLogo } from './brand.jsx'
import { Bezel, EASE, Icon, IslandButton, rupees } from './ui.jsx'

const T = (en, ta) => (
  <>
    {en}
    <span className="mt-0.5 block text-[0.8em] font-light opacity-70" lang="ta">{ta}</span>
  </>
)

function Shot({ index, label, labelTa, file, onPick }) {
  const isVideo = /video/i.test(label) // some milestones ask for a short walk-through video
  const preview = file && !isVideo ? URL.createObjectURL(file) : null
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])
  return (
    <li>
      <Bezel radius="1.5rem" core="flex items-center gap-4 bg-paper-light p-3">
        <label className={`relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl ring-1 transition-colors duration-500 ${EASE} ${
          file ? 'ring-moss-500/40' : 'border border-dashed border-ink/20 bg-white ring-transparent hover:border-sage-500'
        }`}>
          {preview ? (
            <img src={preview} alt={`Shot ${index + 1}`} className="h-full w-full object-cover" />
          ) : (
            <Icon name={isVideo ? 'video' : 'camera'} className={`h-7 w-7 ${file ? 'text-moss-500' : 'text-sage-600'}`} />
          )}
          {/* capture="environment": phones open the back camera directly instead of the gallery */}
          <input type="file" accept={isVideo ? 'video/*' : 'image/*'} capture="environment" className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] || null)} />
        </label>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Shot {index + 1}</div>
          <p className="mt-1 text-[15px] leading-snug text-ink">{label}</p>
          {labelTa && <p className="mt-0.5 text-[13px] leading-snug text-ink-mute" lang="ta">{labelTa}</p>}
          <p className={`mt-1 text-xs ${file ? 'text-moss-500' : 'text-ink-mute'}`}>
            {file ? `✓ ${isVideo ? 'Recorded' : 'Taken'}. Tap to redo` : isVideo ? 'Tap to record (under 30 s)' : 'Tap to open the camera'}
          </p>
        </div>
      </Bezel>
    </li>
  )
}

export default function Capture({ token }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [shots, setShots] = useState([])
  const [extra, setExtra] = useState([])
  const [voice, setVoice] = useState(null)
  const [loc, setLoc] = useState(null) // {lat, lng, accuracy}
  const [locState, setLocState] = useState('') // '' | asking | denied
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [agree, setAgree] = useState(false)

  useEffect(() => {
    document.title = 'PAKKA · Send proof'
    fetch(`/api/capture/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.detail || 'This link is not valid.')
        setInfo(b)
        setShots(new Array(b.shots.length).fill(null))
      })
      .catch((e) => setError(e.message))
  }, [token])

  function shareLocation() {
    if (!navigator.geolocation) return setLocState('denied')
    setLocState('asking')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
        setLocState('')
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const photos = [...shots.filter(Boolean), ...extra] // photos and videos

  async function send() {
    if (!photos.length) return
    setBusy(true)
    setError('')
    const fd = new FormData()
    photos.forEach((f) => fd.append('files', f))
    if (voice) fd.append('files', voice)
    fd.append('consent', agree ? 'true' : 'false')
    if (loc) {
      fd.append('lat', String(loc.lat))
      fd.append('lng', String(loc.lng))
      fd.append('accuracy_m', String(Math.round(loc.accuracy)))
    }
    try {
      const r = await fetch(`/api/capture/${encodeURIComponent(token)}`, { method: 'POST', body: fd })
      const text = await r.text()
      let b = {}
      try { b = JSON.parse(text) } catch { /* not JSON */ }
      if (!r.ok) throw new Error(b.detail || `Could not send (${r.status}). Try again.`)
      setReceipt(b)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-paper bg-drafting text-ink">
      <header className="mx-auto flex max-w-lg items-center justify-between px-5 pt-6">
        <PakkaLogo />
        <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute ring-1 ring-ink/10">
          Site proof
        </span>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-16 pt-8">
        {error && !info && (
          <Bezel radius="2rem" core="bg-clay-50 p-8 text-center">
            <Icon name="x" className="mx-auto h-8 w-8 text-clay-500" />
            <p className="mt-4 font-display text-2xl text-clay-700">{error}</p>
          </Bezel>
        )}

        {!info && !error && <p className="text-center text-sm text-ink-mute">Loading…</p>}

        {receipt && (
          <Bezel radius="2rem" className="shadow-float" core="bg-moss-50 p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss-500 text-paper-light">
              <Icon name="check" className="h-8 w-8" strokeWidth={1.75} />
            </span>
            <h1 className="mt-6 font-display text-4xl leading-tight text-moss-700">
              {T('Proof sent.', 'அனுப்பப்பட்டது.')}
            </h1>
            <p className="mt-4 text-sm text-ink-soft">
              {T('The owner will see the result.', 'உரிமையாளர் முடிவைப் பார்ப்பார்.')}
            </p>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              {receipt.photos} photo{receipt.photos === 1 ? '' : 's'} ·{' '}
              {new Date(receipt.received_at * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </Bezel>
        )}

        {info && !receipt && (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Proof requested for</p>
            <h1 className="mt-2 font-display text-[2.6rem] leading-[1.02]">{info.milestone_name}</h1>
            {info.milestone_name_ta && <p className="mt-1 text-lg text-ink-soft" lang="ta">{info.milestone_name_ta}</p>}
            <p className="mt-2 font-mono text-sm text-ink-soft">{rupees(info.amount_inr)}</p>
            <p className="mt-5 text-sm font-light leading-relaxed text-ink-mute">
              Take each photo now, at the site, with this phone’s camera. Clear photos get checked faster, so you get
              paid faster.
            </p>

            <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-mute">
              {T('Shots needed', 'தேவையான புகைப்படங்கள்')}
            </h2>
            <ol className="mt-4 space-y-3">
              {info.shots.map((s, i) => (
                <Shot key={i} index={i} label={s} labelTa={info.shots_ta?.[i]} file={shots[i]} onPick={(f) => setShots((a) => a.map((x, j) => (j === i ? f : x)))} />
              ))}
            </ol>

            <div className="mt-4 flex flex-wrap gap-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm text-ink-soft ring-1 ring-ink/10 transition-colors duration-500 ${EASE} hover:bg-paper-light`}>
                <Icon name="plus" className="h-4 w-4" /> Another photo
                <input type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={(e) => e.target.files?.[0] && setExtra((x) => [...x, e.target.files[0]])} />
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm ring-1 transition-colors duration-500 ${EASE} ${
                voice ? 'bg-moss-50 text-moss-700 ring-moss-500/30' : 'bg-white text-ink-soft ring-ink/10 hover:bg-paper-light'
              }`}>
                <Icon name="mic" className="h-4 w-4" /> {voice ? 'Voice note added' : 'Voice note (optional)'}
                <input type="file" accept="audio/*" capture className="sr-only" onChange={(e) => setVoice(e.target.files?.[0] || null)} />
              </label>
              {extra.length > 0 && <span className="self-center text-xs text-ink-mute">+{extra.length} extra</span>}
            </div>

            {info.wants_location && (
              <div className="mt-8">
                <Bezel radius="1.5rem" core={`flex items-center gap-4 p-4 ${loc ? 'bg-moss-50' : 'bg-paper-light'}`}>
                  <Icon name="globe" className={`h-6 w-6 shrink-0 ${loc ? 'text-moss-500' : 'text-sage-600'}`} />
                  <div className="min-w-0 flex-1 text-sm">
                    {loc ? (
                      <p className="text-moss-700">Location shared (±{Math.round(loc.accuracy)} m)</p>
                    ) : (
                      <p className="text-ink-soft">
                        {T('Share your location so the owner knows these photos are from the site.', 'இருப்பிடத்தைப் பகிரவும்')}
                      </p>
                    )}
                    {locState === 'denied' && <p className="mt-1 text-xs text-clay-700">Location is off. You can still send, but the owner can’t confirm the site.</p>}
                  </div>
                  {!loc && (
                    <button onClick={shareLocation} disabled={locState === 'asking'} className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs text-paper-light disabled:opacity-50">
                      {locState === 'asking' ? 'Finding…' : 'Share'}
                    </button>
                  )}
                </Bezel>
              </div>
            )}

            <label className="mt-8 flex items-start gap-3 rounded-2xl bg-white/80 p-4 text-xs leading-relaxed text-ink-soft ring-1 ring-ink/10">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              <span>
                I agree to send these photos{info.wants_location ? ', and my location if I share it,' : ''} to the house owner
                through PAKKA. They are checked with Google Gemini and kept for 180 days.
                <span className="mt-1 block" lang="ta">இந்தப் புகைப்படங்களை உரிமையாளருக்கு அனுப்ப ஒப்புக்கொள்கிறேன்.</span>
              </span>
            </label>

            <div className="mt-6">
              <IslandButton variant="ink" onClick={send} disabled={!photos.length || busy || !agree} className="w-full justify-between" icon="upload">
                {busy ? 'Sending…' : `Send ${photos.length || ''} photo${photos.length === 1 ? '' : 's'} to the owner`}
              </IslandButton>
              <p className="mt-2 text-center text-xs text-ink-mute" lang="ta">உரிமையாளருக்கு அனுப்பவும்</p>
              {error && <p role="alert" className="mt-4 rounded-2xl bg-clay-50 p-4 text-sm text-clay-700 ring-1 ring-clay-500/20">{error}</p>}
            </div>

            <p className="mt-10 text-center text-[11px] font-light leading-relaxed text-ink-faint">
              Photos go straight to PAKKA, not through WhatsApp. The camera time and, if you share it, the location
              are checked so that real site photos are trusted.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
