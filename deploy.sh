#!/usr/bin/env bash
# PAKKA · Cloud Run Deployment (asia-south1 / Mumbai)
#
# One-time GCP setup (run these once, in order):
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   PROJECT_ID=$(gcloud config get-value project)
#
# 1. Enable required APIs:
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
#     secretmanager.googleapis.com storage.googleapis.com billingbudgets.googleapis.com
#
# 2. Secrets: the Gemini key, and a demo access key that testers type once in the web app.
#   printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=- || \
#   printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
#   printf '%s' "$(openssl rand -hex 8)" | gcloud secrets create pakka-access-key --data-file=-
#   gcloud secrets versions access latest --secret pakka-access-key     # share this with judges
#
# 3. A dedicated service account with ONLY what PAKKA needs (the default compute SA has project Editor):
#   gcloud iam service-accounts create pakka-run --display-name "PAKKA Cloud Run"
#   SA="pakka-run@${PROJECT_ID}.iam.gserviceaccount.com"
#   for s in gemini-api-key pakka-access-key; do
#     gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
#   done
#
# 4. A private media bucket in Mumbai. Uploads go here, not to /tmp (which is RAM on Cloud Run).
#    Photos and voice notes are personal data: no public access, deleted after 180 days.
#   gcloud storage buckets create "gs://pakka-media-${PROJECT_ID}" --location asia-south1 \
#     --uniform-bucket-level-access --public-access-prevention
#   echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":180}}]}' > /tmp/lifecycle.json
#   gcloud storage buckets update "gs://pakka-media-${PROJECT_ID}" --lifecycle-file=/tmp/lifecycle.json
#   gcloud storage buckets add-iam-policy-binding "gs://pakka-media-${PROJECT_ID}" \
#     --member="serviceAccount:$SA" --role=roles/storage.objectUser
#
# 5. Cost protection: create a billing budget, and restrict the Gemini API key to the
#    "Generative Language API" in the console (APIs & Services > Credentials).
#    After the demo: gcloud run services delete pakka --region asia-south1 --quiet

set -euo pipefail

PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
SA="pakka-run@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="${PAKKA_BUCKET:-pakka-media-${PROJECT_ID}}"

# Pin secret versions into the revision: rotating a secret then needs a deliberate redeploy,
# and a revision can always be traced to the exact key it ran with.
latest_version() {
  gcloud secrets versions list "$1" --filter="state:ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
}
GEMINI_KEY_VERSION="${GEMINI_KEY_VERSION:-$(latest_version gemini-api-key)}"
ACCESS_KEY_VERSION="${ACCESS_KEY_VERSION:-$(latest_version pakka-access-key)}"

gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || { echo "Missing service account $SA (setup step 3)"; exit 1; }
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || { echo "Missing bucket gs://$BUCKET (setup step 4)"; exit 1; }
[ -n "$GEMINI_KEY_VERSION" ] && [ -n "$ACCESS_KEY_VERSION" ] || { echo "Missing secrets (setup step 2)"; exit 1; }

# --allow-unauthenticated keeps the URL openable on a phone; PAKKA_ACCESS_KEY gates every data
# endpoint, the per-IP rate limit caps Gemini spend, and --max-instances 1 keeps SQLite consistent
# (one instance = one DB, so duplicate and repeat-claim checks can't be bypassed across instances).
# --concurrency 8 stops a burst from fanning out into dozens of parallel Gemini calls.

echo "Deploying PAKKA to Cloud Run (asia-south1) as $SA, media in gs://$BUCKET,"
echo "gemini-api-key v$GEMINI_KEY_VERSION, pakka-access-key v$ACCESS_KEY_VERSION ..."

gcloud run deploy pakka \
  --source . \
  --region asia-south1 \
  --service-account "$SA" \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 1 \
  --max-instances 1 \
  --concurrency 8 \
  --add-volume name=media,type=cloud-storage,bucket="$BUCKET",mount-options="uid=10001;gid=10001" \
  --add-volume-mount volume=media,mount-path=/mnt/media \
  --set-env-vars GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash-lite}",GEMINI_FALLBACK_MODELS="${GEMINI_FALLBACK_MODELS:-gemini-3.1-flash-lite;gemini-3-flash-preview}",PAKKA_RETENTION_DAYS=180,PAKKA_MOCK=0,PAKKA_DEMO_RESET=1,PAKKA_MEDIA_DIR=/mnt/media \
  --set-secrets GEMINI_API_KEY=gemini-api-key:"$GEMINI_KEY_VERSION",PAKKA_ACCESS_KEY=pakka-access-key:"$ACCESS_KEY_VERSION"

echo "Deployment complete! Live link ready for mobile inspection demo."
