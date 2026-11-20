# PAKKA

Pay your contractor only for work you can see.

PAKKA checks a building contractor's WhatsApp photos, videos and voice notes against the agreed construction milestones and tells the owner whether a payment request is **proven**, **not proven yet**, or **needs an engineer**, with evidence on the photo.

Gemini observes. Plain code decides. The owner pays.

## Run in 2 minutes

```bash
# API (mock mode needs no key)
cd backend
pip install -r requirements.txt
PAKKA_MOCK=1 uvicorn app.main:app --reload --port 8000

# Web
cd ../frontend
npm install
npm run dev            # http://localhost:5173
```

Real Gemini: copy `.env.example`, set `GEMINI_API_KEY` (from aistudio.google.com) and run without `PAKKA_MOCK=1`.

## Test, evaluate and deploy

```bash
cd backend && pytest -q                                            # verdict rules
python ../eval/run_eval.py ../eval/labels.csv ../eval/photos       # accuracy on real photos
cd .. && ./deploy.sh                                               # Cloud Run, asia-south1
```

See `SPEC.md` for the full build spec, phases and demo script.

PAKKA verifies visible progress only. It never certifies structural safety and never moves money.
