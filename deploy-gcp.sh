#!/bin/bash
# ==========================================
# HeirFlow — One-Click Google Cloud Run Deployment
# Bash script for macOS and Linux
# ==========================================

set -e

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-heirflow}"
GCS_BUCKET="${4:-}"
GEMINI_KEY="${5:-$GEMINI_API_KEY}"

echo "========================================="
echo " 🏛️  HeirFlow — Google Cloud Run Deploy"
echo "========================================="

if [ -z "$PROJECT_ID" ]; then
    read -p "Enter your Google Cloud Project ID: " PROJECT_ID
fi

echo "Deploying to Project: $PROJECT_ID in Region: $REGION"
gcloud config set project "$PROJECT_ID"

echo "[1/4] Enabling required Google Cloud APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com containerregistry.googleapis.com storage.googleapis.com

ENV_VARS="NODE_ENV=production,PORT=8080,GCP_PROJECT_ID=$PROJECT_ID"

if [ -n "$GEMINI_KEY" ]; then
    ENV_VARS="$ENV_VARS,GEMINI_API_KEY=$GEMINI_KEY"
fi

if [ -n "$GCS_BUCKET" ]; then
    ENV_VARS="$ENV_VARS,GCS_BUCKET_NAME=$GCS_BUCKET"
    echo "[2/4] Ensuring bucket exists: gs://$GCS_BUCKET..."
    gsutil mb -p "$PROJECT_ID" -c STANDARD -l "$REGION" "gs://$GCS_BUCKET" 2>/dev/null || true
fi

echo "[3/4] Building and deploying to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "$ENV_VARS"

echo "========================================="
URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')
echo "🎉 HeirFlow successfully deployed to Google Cloud!"
echo "🌐 Live Application URL: $URL"
echo "📋 Health Check URL:     $URL/api/health"
echo "========================================="

