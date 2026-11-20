# PAKKA · Data protection and safety mapping

> One-slide summary of which law or principle each PAKKA safeguard addresses.
> **Not legal advice.** Section references are to India's Digital Personal Data Protection Act, 2023 (DPDP Act).
> The DPDP Rules, 2025 phase in many obligations over time; confirm current timelines with counsel before launch.

## Slide: "Built for the DPDP Act from day one"

| Safeguard in PAKKA | Where it lives | Law / principle it addresses |
|---|---|---|
| Consent tick before photos, voice notes or location are sent (owner and mestri), with the consent version stored on every check | upload form, mestri capture page, `consent` on each record | DPDP s.6 (consent: free, specific, informed, unambiguous); s.5 (notice) |
| Plain-language notice on the capture page: what is collected, who sees it, how long it's kept | `Capture.jsx`, `/api/privacy` | DPDP s.5 (notice before or at the time of collection) |
| Collect only what the check needs: one milestone's shots; location is optional, and the mestri never sees the site pin | capture links, `/api/capture/{token}` | DPDP s.6(1) (consent limited to the specified purpose); purpose limitation |
| GPS and all other EXIF metadata stripped from every stored photo; camera time is read once, then discarded from the file | `media.normalise_image`, `media.exif_taken_at` | DPDP s.8(5) (reasonable security safeguards); data minimisation |
| 180-day retention, enforced in code (records, photos, voice notes, expired links), plus a matching Cloud Storage lifecycle rule | `store.purge_older_than`, `PAKKA_RETENTION_DAYS`, `deploy.sh` | DPDP s.8(7) (erase once the purpose is served) |
| "Delete this check" erases the record, its media, sign-offs and any "verified" mark it created | `DELETE /api/updates/{id}` | DPDP s.12 (right to correction and erasure) |
| Read-only share link for family, revocable, 30-day expiry, without the mestri's location | `/api/share/{token}` | DPDP s.8(5) safeguards; s.6 purpose limitation |
| Access key on all owner data, HMAC-signed media URLs, private bucket, per-IP rate limits, secrets in Secret Manager | `main.py`, `deploy.sh` | DPDP s.8(5) (security safeguards to prevent a breach) |
| Data stays in India by default: Cloud Run, Cloud Storage and Vertex AI in `asia-south1` (Mumbai) | `deploy.sh` | DPDP s.16 (cross-border transfer; India-hosted by default) |
| Gemini processes media as a processor under the Google Cloud terms; paid tier only for real users (the free tier may use data to improve Google products) | `.env`, `perception.py` | DPDP s.8(2) (processor only under a valid contract) |
| AI never decides: verdicts come from deterministic, tested rules; each verdict stores the model, prompt hash, rules version, plan hash and thresholds | `rules.py`, `AuditStamp` | DPDP s.8(3) (accuracy and completeness when data is used to make a decision about a person); accountability |
| Never certifies structural safety; critical stages always route to a licensed engineer, whose name, registration number and decision are recorded | rules, engineer sign-off | Professional regulation of engineering practice; consumer protection against misleading claims |
| The voice assistant answers only from verified records and never advises whether to pay | `live.py` system rules | Consumer protection; avoiding unregulated financial advice |

## Still to do before real users (not code)
- A published privacy notice and a named grievance contact (DPDP s.8(9), s.13).
- A breach-response runbook: notify the Data Protection Board and affected people (DPDP s.8(6)).
- A data processing agreement review with Google Cloud.
- No children's data is expected; if that changes, verifiable parental consent applies (DPDP s.9).
- Photo licences: the evaluation photos are not cleared for public use (see `eval/CREDITS.md`).
