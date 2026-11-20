// Who can do what in PAKKA, as enforced by backend/app/main.py. Mirrored in docs/ACCESS.md.
// Every "cant" entry names the code that enforces it. Keep the two in sync when main.py changes.
export const ACCESS = [
  {
    role: 'owner',
    getIn: 'X-Pakka-Key header (require_access). Enforced only when PAKKA_ACCESS_KEY is set; deploy.sh always sets it. Locally without a key, owner endpoints are open.',
    sees: 'Everything: all checks with photos, voice notes, consent and capture location; ledger; plan; activity; all links.',
    can: ['Run checks (POST /api/updates)', 'Edit amounts and add engineer gates', 'Create capture, engineer and share links; revoke share links', 'Record payments made outside PAKKA and print release notes', 'Delete a check'],
    cant: [
      ['Remove a locked engineer gate (foundation, slab mesh)', 'edit_plan: 400 when engineer_gate is False and the milestone is in LOCKED_GATES'],
      ['Sign off a check that does not need an engineer, or proof sent from off site', '_signoff_allowed: 400'],
      ['Run more than 20 checks per 10 minutes from one connection', 'rate_limit: 429'],
      ['Upload more than 10 files, over 50 MB each / 80 MB total, or non-photo/video/audio files', 'run_check, _read_limited and media.ingest: 400'],
      ['Record a payment dated in the future or for an unknown stage (PAKKA never moves money; it only records)', 'record_payment: 400'],
    ],
    expiry: 'None: the key is valid until it is rotated in Secret Manager.',
  },
  {
    role: 'mestri',
    getIn: 'One-milestone capture link #/capture/<token>, and a payment receipt link #/receipt/<token> per recorded payment (random 16-byte tokens, created by the owner).',
    sees: 'Milestone name (English and Tamil), the shot list, the amount, whether location is wanted. Not the site pin.',
    can: ['Take and send photos, videos and a voice note for that milestone', 'Share location (optional)', 'Confirm or dispute a payment the owner recorded'],
    cant: [
      ['See the site pin', '_public_link returns no site_lat / site_lng'],
      ['See the verdict of what they sent', 'capture_submit returns only a receipt (ok, time, photo count)'],
      ['Send without ticking consent', 'capture_submit: 400 when consent is false'],
      ['Use the link after it expires', '_open_link: 410'],
      ['See other checks, the ledger or the plan edits', 'those endpoints require the owner key (require_access)'],
      ['Change the amount of a recorded payment, or answer twice', 'receipt_confirm accepts only response and note; 409 once answered'],
      ['See the owner’s payment note or the full reference', 'receipt_info returns no note; the reference is masked to its last 4 characters'],
    ],
    expiry: 'Capture link 7 days (CAPTURE_TTL_S); receipt link 14 days (RECEIPT_TTL_S), one answer.',
  },
  {
    role: 'engineer',
    getIn: 'Single sign-off link #/engineer/<token> for one check, created by the owner.',
    sees: 'That check only: photos (signed URLs), PAKKA’s findings and verdict, existing sign-offs. Not voice notes, consent or capture location.',
    can: ['Review the evidence and boxes', 'Approve or ask for rework, with name, registration no. and note', 'Approval marks the milestone verified'],
    cant: [
      ['Record a second decision with the same link', 'engineer_signoff: 409 when the link is used'],
      ['Sign without a registration number', 'engineer_signoff: registration_no min_length=3 (422)'],
      ['Sign a check that does not need an engineer, or off-site proof', '_signoff_allowed: 400'],
      ['See voice notes, consent or the mestri’s location', 'engineer_view returns only id, created, milestone, media, observations, report, signoffs, used'],
      ['Use the link after 14 days', '_open_engineer_link: 404'],
    ],
    expiry: '14 days (ENGINEER_TTL_S); one decision per link.',
  },
  {
    role: 'family',
    getIn: 'Read-only link #/share/<token>, created by the owner.',
    sees: 'Ledger, plan, the latest 30 checks with photos, verdicts and engineer sign-offs.',
    can: ['Follow progress', 'Switch to Tamil', 'See which sign-offs the engineer made themselves'],
    cant: [
      ['See the mestri’s location or consent records', 'shared_view removes capture and consent from every check'],
      ['Change anything', 'every write endpoint requires the owner key (require_access)'],
      ['Use the link after it is revoked or expires', 'store.get_share_link ignores revoked links; shared_view: 404'],
    ],
    expiry: '30 days (SHARE_TTL_S), or until the owner revokes it.',
  },
]
