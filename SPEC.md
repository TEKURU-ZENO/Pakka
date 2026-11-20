# PAKKA · Build Specification

> Pay your contractor only for work you can see.
> City Buildathon build spec, reviewed by the AI, Software, Cloud, Multimodal and CV leads.

---

## 1. What we are building (MVP)

**One loop, working end to end, on real site photos.**

```
Contractor update (photos, video, Tamil voice note)
        │
        ▼
  Gemini OBSERVES ──► stage, visible elements, counts, defects, boxes / timestamps
  Gemini LISTENS  ──► transcript, claimed stage, amount requested
        │
        ▼
  Rules engine DECIDES (plain Python, no AI)
        │
        ▼
  Verdict  ●  Proven   ●  Not proven yet   ●  Needs an engineer
  + evidence on the photo + what to ask the contractor next
```

### User stories (in scope)

| # | As a… | I want to… | Done when |
|---|---|---|---|
| U1 | Owner | upload the photos, video and voice note the mestri sent | files accepted, voice note understood |
| U2 | Owner | see if the claimed stage is actually visible | verdict + findings in < 20 s |
| U3 | Owner | see *where* in the photo the evidence is | boxes drawn on the photo, click a finding to highlight it |
| U4 | Owner | know what to ask for when it's not proven | "Ask the contractor next" list |
| U5 | Owner | be told when a human expert must look | needs_engineer on visible high-severity defects and on engineer-gate stages |
| U6 | Owner | be warned if the amount is more than agreed | amount finding against the payment plan |

### Out of scope today (say "roadmap" if asked)
Real WhatsApp number, payments or escrow, multi-project accounts, contractor app, engineer marketplace, structural safety of any kind.

### Non-negotiable rules (the pitch depends on these)
1. **Gemini observes, code decides.** No verdict, rupee or threshold comes from the model.
2. **Never certify safety.** Copy, UI and answers to judges all say this.
3. **Never guess.** Unusable media leads to a retake request, not a verdict.
4. **The claim can't bias the eyes.** The prompt tells Gemini to describe what it sees regardless of what the contractor says.

---

## 2. Team review

### AI Engineer
- **Structured output only.** `response_schema` = Pydantic models in `schemas.py`, `temperature=0.1`. If parsing fails, the request fails loudly; never regex free text.
- **Model is an env var** (`GEMINI_MODEL`). Start on the current Flash model in AI Studio; try Pro only for the eval comparison slide.
- **Thresholds live in `rules.py`** (`ELEMENT_MIN_CONF=0.6`, `STAGE_MIN_CONF=0.55`, `DEFECT_MIN_CONF=0.6`). Tune them with the eval, not by feel.
- **Risk:** Gemini over-reports defects on dusty concrete. **Mitigation:** high severity only escalates to an engineer; it never fails a payment on its own.

### Multimodal Specialist
- **Photos:** sent inline. **Videos/large files:** Files API with a processing wait (already in `perception.py`). Keep demo videos under 30 s.
- **Voice notes:** WhatsApp sends `.opus` (ogg). Mapped to `audio/ogg`. Gemini returns the verbatim Tamil transcript plus an English translation, the claimed stage and the amount ("2.5 lakh" → 250000).
- **Video evidence** uses `timestamp_s` instead of boxes; the UI shows "at 14s".
- **Day 2 stretch, Gemini Live:** owner asks "What happened at my site this week?" by voice. Use `client.aio.live.connect(...)` with a Live-capable model from AI Studio, and pass the stored verdict history as the system instruction so it only speaks from verified records.

### CV Engineer
- **Why Gemini and not YOLO today:** we have no labelled construction dataset, and stage recognition is a reasoning task more than a detection task. Gemini works zero-shot.
- **Boxes are "where to look", not measurements.** Gemini's `box_2d` is `[ymin, xmin, ymax, xmax]` on a 0–1000 scale. Never claim rebar spacing in mm from a phone photo.
- **What makes or breaks accuracy is photo capture.** The "ask next" lists are really capture instructions: top view of the slab, close-up of cover blocks, one wide shot per stage.
- **v2 roadmap (your Airawat strength):** once 1–2k labelled site photos exist, fine-tune a YOLO model for counting columns and rebar and detecting cover blocks, with Gemini reasoning on top. That's the defensible data moat to tell judges about.

### Software Engineer
- **Layering:** `perception.py` is the only file that talks to Gemini, `rules.py` is the only file that decides, and `main.py` only wires them together. Keep it that way.
- **Mock mode** (`PAKKA_MOCK=1`) returns canned observations by filename keyword (`shuttering`, `slab`, `honeycomb`, `blurry`). This is your **offline demo fallback** if venue wifi dies.
- **Tests:** `pytest` covers the six verdict paths. Add one test per new rule.
- **Storage:** SQLite now, Cloud SQL later. Don't spend venue time on a database.

### Cloud Engineer
- **Cloud Run, asia-south1 (Mumbai)**, one container serving the API and the built React app. `--min-instances 1` keeps it warm for the demo.
- **Secret Manager** holds `GEMINI_API_KEY`. Never commit `.env`.
- **Known limit:** Cloud Run disk is ephemeral, so uploads and SQLite reset when the instance restarts. That's fine for a demo. Production moves media to **Cloud Storage** and records to **Cloud SQL**, with **Pub/Sub** for async video processing (it's on the architecture slide already).
- **Cost:** Flash calls per update are small. Not a concern for the buildathon.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Perception | Gemini API via `google-genai` SDK (image, video, audio in, JSON out) |
| Owner voice (stretch) | Gemini Live API |
| Contracts | Pydantic v2 |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Decision | Plain Python rules engine + pytest |
| Frontend | React 18, Vite, Tailwind (bundled, works offline) |
| Storage | SQLite + local disk (demo) → Cloud SQL + Cloud Storage (prod) |
| Deploy | Docker → Cloud Run (asia-south1), Secret Manager |
| Dev tools | Google AI Studio (prompt/schema tuning), Antigravity, Claude Code |

---

## 4. Repo layout

```
pakka/
├── SPEC.md                ← this file
├── README.md              ← run it in 2 minutes
├── Dockerfile             ← builds web + API into one image
├── deploy.sh              ← gcloud run deploy
├── .env.example
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── schemas.py     ← data contracts (Stage, ElementSeen, MediaObservation, VoiceClaim, VerdictReport)
│   │   ├── prompts.py     ← the two Gemini prompts
│   │   ├── perception.py  ← ONLY place that calls Gemini (+ mock mode)
│   │   ├── milestones.py  ← payment plan: stages, required evidence, amounts, engineer gates
│   │   ├── rules.py       ← ONLY place that decides
│   │   ├── store.py       ← SQLite
│   │   ├── main.py        ← FastAPI routes
│   │   └── mock/*.json    ← canned observations for offline demo
│   └── tests/test_rules.py
├── frontend/
│   └── src/App.jsx        ← WhatsApp-style intake + verdict with photo boxes
└── eval/
    ├── labels.csv         ← file,true_stage,claimed_milestone,expected_verdict
    ├── photos/            ← your real site photos (gitignored)
    └── run_eval.py        ← prints the numbers for the pitch
```

---

## 5. Phases

| Phase | Goal | Time | Exit check |
|---|---|---|---|
| **0 · Run it** | Repo running locally in mock mode, API key in `.env` | 30 min | Mock verdict shows in the browser |
| **1 · Eyes and ears** | Real photos + a real Tamil voice note through Gemini | 2.5 h | 10 real photos give sensible stage + boxes |
| **2 · Judgement** | Payment plan and thresholds right | 1 h | `pytest` green, plan amounts match your story |
| **3 · Demo path** | The "slab done" story works on real media, UI polished | 2 h | Full demo in under 90 s, twice in a row |
| **4 · Live link** | Deployed on Cloud Run | 1 h | Works from your phone on mobile data |
| **5 · Proof** | 30 labelled photos through `run_eval.py` | 1.5 h | Three numbers on a slide |
| **6 · Day 2 stretch** | Gemini Live owner Q&A, then pitch rehearsal | rest | Only if 0–5 are solid |

**Rule:** don't start a phase until the previous exit check passes. Phase 6 is optional; phases 3 and 5 aren't.

---

## 6. How to code each phase

### Phase 0 · Run it
```bash
cd backend && pip install -r requirements.txt
PAKKA_MOCK=1 uvicorn app.main:app --reload --port 8000
cd ../frontend && npm install && npm run dev        # http://localhost:5173
```
Upload any file with `shuttering` in its name plus any audio file → "Not proven yet".

### Phase 1 · Eyes and ears
1. Open **AI Studio**, paste `SITE_PROMPT`, attach 5 real photos, set structured output to the `MediaObservation` shape. Fix the prompt there first. It's faster than code.
2. Copy the improved prompt into `prompts.py`. Run with `PAKKA_MOCK=0` and `GEMINI_API_KEY` set.
3. Record a real Tamil voice note on WhatsApp ("Sir, slab work mudinjiduchu, 2.5 lakh anuppunga"), export the `.opus` file and upload it with the photos.
4. Check the boxes land on the right things. If stage is often wrong, add one line per stage to the prompt describing what it looks like.

### Phase 2 · Judgement
1. Edit `milestones.py` amounts and `ask_for` lines to match your demo family's plan (ideally checked with the civil engineer).
2. Run `pytest -q`. Add a test for any rule you change.
3. Run your demo photos and adjust the confidence thresholds only if real photos demand it.

### Phase 3 · Demo path
Prepare exactly three demo sets:
- **A · The catch.** Shuttering photos + "slab done" voice note → *Not proven yet*, with columns and shuttering boxed and the ask-next list.
- **B · The happy path.** Cast slab photos → *Proven*.
- **C · The safety net.** A honeycombed column → *Needs an engineer*.

Also keep copies named `*_shuttering`, `*_slab` and `*_honeycomb` so mock mode reproduces A, B and C offline.

### Phase 4 · Live link
```bash
./deploy.sh      # see one-time setup at the top of the file
```
Open the URL on your phone over mobile data, and run demo A once.

### Phase 5 · Proof
1. Put 30 real photos in `eval/photos`. Mix the stages and include 5 false "done" claims and 3 bad photos.
2. Fill in `eval/labels.csv`.
3. `cd backend && python ../eval/run_eval.py ../eval/labels.csv ../eval/photos`
4. Put the three numbers on one slide: stage accuracy, false claims caught, retake requests.

---

## 7. Demo script (90 seconds)

1. "This is a real WhatsApp voice note from a mestri." Play it.
2. Drop the photos and the voice note into PAKKA and click **Check before paying**.
3. "He says the slab is done and wants ₹2.5 lakh. PAKKA sees 12 columns and shuttering, but no slab." Click a finding to show the box.
4. "So it says not proven yet, and tells the owner exactly what to ask for next."
5. Switch to set C. "And when it sees something serious, it doesn't decide. It sends an engineer."
6. "Gemini looks. Our code decides. The owner pays."

**Fallback order:** live Cloud Run → localhost with Gemini → localhost with `PAKKA_MOCK=1` → screen recording made the night before.

---

## 8. Judge questions

| Question | Answer |
|---|---|
| What if it says fine and the building cracks? | PAKKA never certifies safety. Critical stages always go to a licensed engineer. We check visible progress and payment claims. |
| Why would contractors agree? | They already send photos. Faster payments for honest contractors, and a verified history that wins them the next job. |
| Brick&Bolt already tracks progress. | That's the builder reporting on its own work. We're independent and work for families who hire their own local contractor, which is how most homes are built. |
| Can AI judge quality from photos? | Only what's visible, and we say so. That's why defects escalate to an engineer instead of failing the contractor. |
| How accurate is it? | Give your eval numbers from Phase 5, measured on real photos. |
| Who pays first? | Families, especially NRIs, per project. Lenders who release construction loans in stages come next. |
| Why Gemini? | One model handles photos, video and Tamil voice with structured output and boxes. Gemini Live gives owners voice answers in their language. |
