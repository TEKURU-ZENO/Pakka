#!/usr/bin/env bash
# PAKKA · Cloud Run Deployment (asia-south1 / Mumbai)
#
# Prerequisites & One-Time GCP Setup:
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   PROJECT_ID=$(gcloud config get-value project)
#   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
#
# 1. Enable required APIs:
#   gcloud services enable \
#     run.googleapis.com \
#     cloudbuild.googleapis.com \
#     artifactregistry.googleapis.com \
#     secretmanager.googleapis.com \
#     billingbudgets.googleapis.com
#
# 2. Store Gemini API key in Secret Manager:
#   printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=- || \
#   printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
#
# 3. Grant default Cloud Run compute service account access to secret:
#   gcloud secrets add-iam-policy-binding gemini-api-key \
#     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
#     --role="roles/secretmanager.secretAccessor"
#
# 4. Security & Cost Protection:
#   Set a budget alert on your GCP billing account to prevent unexpected charges.
#   After the demo, tear down or restrict access:
#     gcloud run services delete pakka --region asia-south1 --quiet

set -euo pipefail

echo "Deploying PAKKA to Cloud Run (asia-south1)..."

gcloud run deploy pakka \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 1 \
  --set-env-vars GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}",PAKKA_MOCK=0 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest

echo "Deployment complete! Live link ready for mobile inspection demo."
