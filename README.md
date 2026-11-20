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

The site opens on a home page (problem, directive, how it works, vision, from the idea deck). The checker lives at `#/demo`.
The two MoSPI figures for the problem section are set in `STATS` at the top of `frontend/src/Home.jsx`.
Brand: drop the original PAKKA and Veritas Labs artwork into `frontend/public/brand/` (see the README there); until then the site uses vector redraws from `frontend/src/brand.jsx`.

Real Gemini: copy `.env.example`, set `GEMINI_API_KEY` (from aistudio.google.com) and run without `PAKKA_MOCK=1`.

## Test, evaluate and deploy

```bash
cd backend && pip install -r requirements-dev.txt && pytest -q                                            # verdict rules
python ../eval/run_eval.py ../eval/labels.csv ../eval/photos       # accuracy on real photos
cd .. && ./deploy.sh                                               # Cloud Run, asia-south1
```

See `SPEC.md` for the full build spec, phases and demo script.

PAKKA verifies visible progress only. It never certifies structural safety and never moves money.
