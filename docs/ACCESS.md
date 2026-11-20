# PAKKA · Who can do what

Access is capability-based: there are no accounts. Each person gets exactly one kind of credential.
Every "can't do" below names the code in `backend/app/main.py` (or `store.py`) that enforces it.
The same table appears at the bottom of `#/roles` (source: `frontend/src/accessTable.js`). Keep the two in sync.

> **Important:** the owner key is enforced only when `PAKKA_ACCESS_KEY` is set (`require_access` returns early
> otherwise). `deploy.sh` always sets it. On a local run without a key, every owner endpoint is open to anyone
> who can reach the server.

| | **Owner** | **Mestri** | **Engineer** | **Family** |
|---|---|---|---|---|
| **How they get in** | `X-Pakka-Key` header (`require_access`) | One-milestone capture link `#/capture/<token>`, and a payment receipt link `#/receipt/<token>` per recorded payment (random 16-byte tokens) | Single sign-off link `#/engineer/<token>` for one check | Read-only link `#/share/<token>` |
| **Sees** | Everything: all checks with photos, voice notes, consent and capture location; ledger, plan, activity, all links | Milestone name (EN + Tamil), shot list, amount, whether location is wanted | That one check: photos (signed URLs), findings, verdict, existing sign-offs | Ledger, plan, latest 30 checks with photos, verdicts and sign-offs |
| **Can do** | Run checks; edit amounts and add engineer gates; create capture, engineer and share links; revoke share links; record payments made outside PAKKA and print release notes; delete a check | Send photos, videos and a voice note; share location (optional); confirm or dispute a payment the owner recorded | Approve or ask for rework, with name, registration no. and note; approval marks the milestone verified | Follow progress; switch to Tamil |
| **Can't do** | Remove a locked engineer gate (`edit_plan`: 400) · sign off a check that doesn't need an engineer, or off-site proof (`_signoff_allowed`: 400) · more than 20 checks per 10 min per connection (`rate_limit`: 429) · more than 10 files / 50 MB each / 80 MB total, or non-media files (`run_check`, `_read_limited`, `media.ingest`: 400) · record a future-dated payment or one for an unknown stage (`record_payment`: 400). PAKKA never moves money: it only records | See the site pin (`_public_link` has no `site_lat`/`site_lng`) · see the verdict (`capture_submit` returns a receipt only) · send without consent (`capture_submit`: 400) · use an expired link (`_open_link`: 410) · see other checks, ledger or plan edits (owner key required) · change a recorded payment's amount or answer twice (`receipt_confirm` accepts only response and note; 409) · see the owner's payment note or full reference (`receipt_info`: no note, reference masked) | Record a second decision with the same link (`engineer_signoff`: 409) · sign without a registration no. (`min_length=3`: 422) · sign a check that doesn't need an engineer, or off-site proof (`_signoff_allowed`: 400) · see voice notes, consent or location (`engineer_view` returns only id, created, milestone, media, observations, report, signoffs, used) · use the link after expiry (`_open_engineer_link`: 404) | See the mestri's location or consent (`shared_view` removes `capture` and `consent`) · change anything (every write endpoint requires the owner key) · use a revoked or expired link (`store.get_share_link` ignores revoked links; `shared_view`: 404) |
| **Expiry** | None (until the key is rotated) | Capture link 7 days (`CAPTURE_TTL_S`); receipt link 14 days (`RECEIPT_TTL_S`), one answer | 14 days (`ENGINEER_TTL_S`), one decision per link | 30 days (`SHARE_TTL_S`) or until revoked |

Notes
- **Photo URLs** are HMAC-signed per file when an access key is set (`_media_url`, `get_media`: 403 without a valid
  token). Anyone holding a signed URL can open that one photo; nothing else.
- **The voice assistant** (`/api/live`) needs a 60-second, single-use ticket from `/api/live-ticket`, which itself
  needs the owner key (`live_socket`: close 4401).
- **Retention:** checks, media and expired links are deleted after `PAKKA_RETENTION_DAYS` (default 180).
