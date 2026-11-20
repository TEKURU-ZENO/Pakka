# Deploy PAKKA to Google Cloud Run (Mumbai, asia-south1)

Project: `nth-pottery-467214-d7`. The easiest route is **Cloud Shell** (a terminal in your browser with `gcloud` and
Docker already installed), cloning from GitHub. About 15 minutes the first time.

## 0. Before you start
1. **Commit and push** the latest code, so Cloud Shell gets it: `git push origin main` (or your branch).
2. **Billing must be active** on the project. Cloud Run, Cloud Build and Artifact Registry won't run without it, and
   the $5 Codelab credit expired on 20 Nov. In the console: Billing → link an account with a payment method.
3. **Set a budget alert** (Billing → Budgets & alerts), e.g. ₹1,000 with alerts at 50 / 90 / 100%.

## 1. Open Cloud Shell
Go to https://console.cloud.google.com/?cloudshell=true, choose the project `nth-pottery-467214-d7`, and wait for
the terminal at the bottom of the page.

## 2. Get the code
```bash
git clone https://github.com/TEKURU-ZENO/Pakka.git
cd Pakka
gcloud config set project nth-pottery-467214-d7
PROJECT_ID=$(gcloud config get-value project)
```

## 3. One-time setup (copy and paste each block)
```bash
# APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com

# Secrets. Paste the Gemini key when asked; it is not shown on screen and never goes into a file.
read -s -p "Gemini API key: " GEMINI_API_KEY; echo
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
unset GEMINI_API_KEY
printf '%s' "$(openssl rand -hex 8)" | gcloud secrets create pakka-access-key --data-file=-
echo "Access key for testers and judges:"; gcloud secrets versions access latest --secret pakka-access-key

# A service account with only what PAKKA needs
gcloud iam service-accounts create pakka-run --display-name "PAKKA Cloud Run"
SA="pakka-run@${PROJECT_ID}.iam.gserviceaccount.com"
for s in gemini-api-key pakka-access-key; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done

# Private media bucket in Mumbai, photos deleted after 180 days
gcloud storage buckets create "gs://pakka-media-${PROJECT_ID}" --location asia-south1 \
  --uniform-bucket-level-access --public-access-prevention
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":180}}]}' > /tmp/lifecycle.json
gcloud storage buckets update "gs://pakka-media-${PROJECT_ID}" --lifecycle-file=/tmp/lifecycle.json
gcloud storage buckets add-iam-policy-binding "gs://pakka-media-${PROJECT_ID}" \
  --member="serviceAccount:$SA" --role=roles/storage.objectUser
```

## 4. Deploy
```bash
bash deploy.sh
```
If it asks to create an Artifact Registry repository called `cloud-run-source-deploy`, answer **Y**. The build takes
3–6 minutes. At the end it prints the service URL, e.g. `https://pakka-xxxxx-el.a.run.app`.

## 5. Check it works
1. `https://<your-url>/api/health` should show `"mock":false`, `"model":"gemini-3.5-flash-lite"` and
   `"access_key_required":true`.
2. Open `https://<your-url>/#/demo`, enter the access key once, and run a check with one of **your own** site photos.
3. Create a capture link and **scan its QR with your phone**. The deployed URL works from any network.
4. Try "Ask your site" on your phone, with the microphone.

## Troubleshooting
- **Build fails with a permission error on Cloud Build or `cloud-run-source-deploy`** (common on new projects):
  ```bash
  PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PN}-compute@developer.gserviceaccount.com" --role=roles/run.builder
  ```
  Then run `bash deploy.sh` again.
- **Checks fail with "daily quota is used up":** the Gemini key is on the free tier (20 requests per model per day).
  Enable billing for the Gemini API in AI Studio, or switch to Vertex AI (see `.env.example`).
- **"Missing service account / bucket / secrets":** `deploy.sh` checks these first; rerun the matching block in step 3.

## Things to know
- **Records reset when the instance restarts or you redeploy:** the SQLite database lives in `/tmp`. Photos persist in
  the bucket. Fine for a demo; production moves records to Cloud SQL.
- **Demo sample photos are not deployed** (they're gitignored for licence reasons), so the A–D tiles use drawn images
  unless you commit your own photos to `frontend/public/samples/` (see the README there).
- **Cost:** `--min-instances 1` keeps one instance warm, which costs money even when idle. After the pitch:
  ```bash
  gcloud run services update pakka --region asia-south1 --min-instances 0   # or delete it:
  gcloud run services delete pakka --region asia-south1
  ```

## Alternative: deploy from your Windows laptop
Install the Google Cloud CLI (https://cloud.google.com/sdk/docs/install), run `gcloud auth login`, then run the same
step 2–4 commands in **Git Bash** from the `pakka` folder (skip the `git clone`).
