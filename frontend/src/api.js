// Shared API helper. The access key (deployed demo) is asked once and remembered per browser.
const KEY_STORE = 'pakka_access_key'

export function readKey() {
  try { return localStorage.getItem(KEY_STORE) || '' } catch { return '' }
}

function writeKey(k) {
  try { localStorage.setItem(KEY_STORE, k) } catch { /* private mode: ask again next time */ }
}

export async function api(url, options = {}, retried = false) {
  const headers = { ...(options.headers || {}) }
  const key = readKey()
  if (key) headers['X-Pakka-Key'] = key
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    options = { ...options, body: JSON.stringify(options.json) }
  }
  const r = await fetch(url, { ...options, headers })
  if (r.status === 401 && !retried) {
    const entered = window.prompt('Enter the PAKKA access key')
    if (entered) {
      writeKey(entered.trim())
      return api(url, options, true)
    }
  }
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { /* not JSON, e.g. a proxy error page */ }
  if (!r.ok) {
    const d = body && body.detail
    throw new Error((typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : '') || `Request failed (${r.status}).`)
  }
  return body
}

export const VERDICT_TA = { proven: 'வேலை தெரிகிறது', not_proven: 'இன்னும் நிரூபிக்கப்படவில்லை', needs_engineer: 'பொறியாளர் தேவை' }
