# 1. Build the React app
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Python API that also serves the built app
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./static

# SQLite stays on /tmp (small). Media goes to PAKKA_MEDIA_DIR: a Cloud Storage volume mount in deploy.sh,
# because /tmp on Cloud Run is in-memory and a few videos would exhaust the instance.
ENV PAKKA_DATA=/tmp/pakka
# Owners are in India: show times like "Already sent on ..." in IST, not Cloud Run's UTC. A POSIX TZ string needs no
# tzdata in the slim image, and India has no daylight saving.
ENV TZ=IST-5:30
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin pakka && mkdir -p /tmp/pakka && chown pakka /tmp/pakka
USER 10001
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
