# 🏛️ HeirFlow — Digital Estate Management Platform

> *Your Digital Legacy, Secured. Your Family, Protected.*

HeirFlow is an AI-powered digital estate management platform that helps individuals securely plan their digital legacy and automates asset transfer to nominees when it matters most.

## 🚀 Quick Start

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

### Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Estate Owner | john@demo.com | demo123 |
| Nominee/Claimant | jane@demo.com | demo123 |

## 🏗️ Architecture

```
HeirFlow/
├── backend/           # Node.js + Express + SQLite
│   ├── routes/        # API endpoints
│   ├── middleware/    # Auth, validation
│   ├── db.js          # Database setup
│   └── server.js      # Entry point
├── frontend/          # React + TypeScript + Tailwind
│   └── src/
│       ├── pages/     # Route pages
│       ├── components/# Reusable UI
│       ├── context/   # Auth state
│       └── api/       # API client
└── README.md
```

## ✨ Key Features

### For Estate Owners
- 🔐 **Secure Asset Vault** — Map all digital assets (bank accounts, crypto, subscriptions, files, property)
- 👥 **Nominee Management** — Assign trusted nominees with granular permissions
- 🔑 **Cryptographic Key Sharing** — Shamir's Secret Sharing simulated key distribution
- 📋 **Estate Instructions** — Set transfer/cancel/recover instructions per asset
- 🤖 **AI Copilot** — Gemini-powered estate planning assistant

### For Nominees/Claimants
- 📄 **Claim Initiation** — Submit death certificate and key share
- ⏳ **Grace Period** — 7-day contestation window with live countdown
- ✅ **Automated Execution** — Subscription cancellation, asset transfer, family access
- 📊 **Status Tracking** — Real-time claim progress dashboard

## 🔒 Security Design
- JWT authentication
- Encrypted asset metadata
- Shamir's Secret Sharing (key splitting across nominees)
- Minimum-data-access principle
- Tamper-evident audit logs
- Grace period for dispute resolution

## 🤖 AI Integration (Gemini)
- Document parsing for asset discovery
- Estate planning copilot chat
- Smart inheritance instructions
- Risk analysis for estate completeness

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | User registration |
| POST | /api/auth/login | User login |
| GET | /api/assets | List assets |
| POST | /api/assets | Add asset |
| GET | /api/nominees | List nominees |
| POST | /api/nominees | Add nominee |
| POST | /api/claims | Initiate claim |
| PUT | /api/claims/:id/approve | Approve claim |
| PUT | /api/claims/:id/execute | Execute estate |
| POST | /api/gemini/chat | AI copilot chat |
| GET | /api/dashboard | Dashboard stats |

## 🎯 Buildathon Context
Built for the **Google Buildathon** using:
- **Gemini API** — AI copilot & document understanding
- **React + TypeScript** — Modern frontend
- **Node.js + SQLite** — Lightweight backend
- **Tailwind CSS** — Beautiful responsive UI
