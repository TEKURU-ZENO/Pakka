#!/usr/bin/env bash
# One-time setup:
#   gcloud auth login && gcloud config set project YOUR_PROJECT
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
#   printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
#   (grant the Cloud Run service account roles/secretmanager.secretAccessor on that secret)
set -euo pipefail
gcloud run deploy pakka \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --timeout 300 --min-instances 1 \
  --set-env-vars GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}",PAKKA_MOCK=0 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
