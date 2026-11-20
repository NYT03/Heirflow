# 🏛️ HeirFlow — Digital Estate Management Platform

> *Your Digital Legacy, Secured. Your Family, Protected.*

HeirFlow is an AI-powered digital estate management platform built for the **Google Buildathon** that helps individuals securely plan their digital legacy and automates asset transfer to nominees when it matters most.

---

## ☁️ Google Cloud Services Integrated

| Google Service | Purpose in HeirFlow | Implementation |
|---|---|---|
| **Google Gemini API** (`@google/generative-ai`) | Multimodal estate copilot & document verification | Ingests death certificates, wills & property deeds; extracts key entities; conversational estate advisory (`gemini-1.5-flash`). |
| **Google Cloud Storage (GCS)** (`@google-cloud/storage`) | Secure object & evidence vault | Stores encrypted death certificates, wills, deeds with time-limited signed URLs for authorized nominee access. |
| **Google Cloud Run** | Serverless production deployment | Containerized single-service deployment serving both API and static frontend assets with automatic scaling. |
| **Google Cloud Build** | Continuous container build pipeline | Builds production container image and triggers seamless zero-downtime Cloud Run deployments. |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Start the Backend
```bash
cd backend
npm install
npm start
# Runs on http://localhost:3001
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

### Demo Credentials (Pre-seeded)
| Role | Email | Password |
|---|---|---|
| **Estate Owner** | `john@demo.com` | `demo123` |
| **Nominee / Claimant** | `jane@demo.com` | `demo123` |

---

## 🚢 Deploy to Google Cloud Run

### Option 1: One-Click PowerShell Script (Windows)
```powershell
.\deploy-gcp.ps1 -ProjectId "your-gcp-project-id" -GeminiApiKey "your_gemini_api_key" -GcsBucket "heirflow-evidence-bucket"
```

### Option 2: One-Click Bash Script (macOS / Linux)
```bash
chmod +x deploy-gcp.sh
./deploy-gcp.sh "your-gcp-project-id" "us-central1" "heirflow" "heirflow-evidence-bucket"
```

### Option 3: Manual Deployment via `gcloud`
```bash
# 1. Set your GCP project
gcloud config set project YOUR_PROJECT_ID

# 2. Enable Google Cloud APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com storage.googleapis.com

# 3. Deploy from source to Cloud Run
gcloud run deploy heirflow \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=8080,GEMINI_API_KEY=YOUR_KEY,GCS_BUCKET_NAME=YOUR_BUCKET
```

---

## 🏗️ Architecture

```
HeirFlow/
├── backend/                  # Node.js + Express API
│   ├── routes/
│   │   ├── auth.js           # Registration & JWT Authentication
│   │   ├── assets.js         # Digital & physical asset vault CRUD
│   │   ├── nominees.js       # Nominee management + Shamir key-share generation
│   │   ├── claims.js         # Claim lifecycle (Pending -> Grace -> Approved -> Executed)
│   │   ├── storage.js        # Google Cloud Storage upload & signed URLs
│   │   ├── gemini.js         # Gemini 1.5 Flash Copilot & Document Verification
│   │   └── dashboard.js      # Dynamic estate completeness & audit metrics
│   ├── services/
│   │   ├── cloudStorage.js   # @google-cloud/storage integration + fallback
│   │   └── geminiService.js  # @google/generative-ai SDK integration
│   ├── db.js                 # Database schema initialization & demo seeds
│   └── server.js             # Entry point (serves API & production frontend)
├── frontend/                 # React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── pages/            # Landing, Login, Dashboard, Assets, Nominees, EstatePlan, NomineeClaim
│   │   ├── components/       # Layout, AICopilot (floating Gemini assistant)
│   │   ├── context/          # AuthContext (state & tokens)
│   │   └── api/              # Axios API client
│   └── vite.config.ts        # Vite configuration
├── Dockerfile                # Production multi-stage container for Cloud Run
├── cloudbuild.yaml           # Google Cloud Build automated pipeline
├── deploy-gcp.ps1            # Windows Cloud Run deployment script
├── deploy-gcp.sh             # Linux/macOS Cloud Run deployment script
└── README.md
```

---

## 📡 API Endpoints

| Method | Endpoint | Description | Google Service |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new estate owner | Auth |
| `POST` | `/api/auth/login` | Login and obtain JWT token | Auth |
| `GET` | `/api/assets` | List user's mapped assets | Vault |
| `POST` | `/api/assets` | Add asset with instructions | Vault |
| `GET` | `/api/nominees` | List nominees & Shamir key shares | Crypto |
| `POST` | `/api/claims` | Nominee files claim with key share | Claim Engine |
| `PUT` | `/api/claims/:id/approve` | Approve claim & start 7-day grace period | Claim Engine |
| `PUT` | `/api/claims/:id/execute` | Execute asset transfer/cancellation | Execution Engine |
| `POST` | `/api/storage/upload` | Upload evidence document / deed | **Google Cloud Storage** |
| `GET` | `/api/storage/signed-url` | Generate time-limited document URL | **Google Cloud Storage** |
| `POST` | `/api/gemini/chat` | AI Copilot estate advice | **Google Gemini API** |
| `POST` | `/api/gemini/analyze-document`| Multimodal document verification | **Google Gemini API** |
| `GET` | `/api/health` | Service & Cloud Run health check | Monitoring |
