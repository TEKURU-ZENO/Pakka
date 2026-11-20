# 1. Build the React app
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Python API that also serves the built app
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/dist ./static
ENV PAKKA_DATA=/tmp/pakka
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
