# HeirFlow Prototype — Engineering Handoff Document

## 1. Goal
- **Original User Request:** Build a working prototype for **HeirFlow** based on:
  - Startup concept presentation (`HeirFlow_Startup_Buildathon_Presentation.pdf` and Gemini chat link: `https://share.gemini.google/awYkvd54AgTj`).
  - System and sequence diagrams (`HeirFlow_All_5_Diagrams (1).drawio`).
- **What "Done" Looks Like:** 
  - Fully runnable local full-stack application (frontend at `http://localhost:3000`, backend at `http://localhost:3001`).
  - Working flows for: User Registration/KYC, Asset Vault mapping, Nominee assignment with Shamir key-share generation, Estate Plan activation, Nominee claim initiation & 7-day grace-period simulation, Automated execution actions, and a Gemini-powered AI Copilot.

---

## 2. Done (Specifics & Verification Status)
- **Backend (`d:\Google Buildathon\Heirflow\backend`)** — *[VERIFIED: Live tested on port 3001]*:
  - `server.js`: Express server with CORS and error handling; runs on port `3001`.
  - `db.js`: SQLite (`better-sqlite3`) database (`heirflow.db`) with 7 normalized tables: `users`, `assets`, `nominees`, `claims`, `claim_actions`, `audit_logs`, `messages`. Pre-seeds demo credentials (`john@demo.com` / `demo123` verified owner; `jane@demo.com` / `demo123` nominee).
  - `middleware/auth.js`: JWT Bearer authentication token verifier (`req.user = { id, email, name }`).
  - `routes/auth.js`: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
  - `routes/assets.js`: CRUD endpoints for asset types (`bank`, `crypto`, `subscription`, `file`, `property`, `social`) with instructions (`transfer`, `cancel`, `recover`).
  - `routes/nominees.js`: CRUD endpoints; automatically generates simulated Shamir key share `HEIRFLOW-SHARE-{uuid}` on creation.
  - `routes/claims.js`: `POST /api/claims`, `GET /api/claims`, `PUT /api/claims/:id/review`, `PUT /api/claims/:id/approve` (sets 7-day grace period), `PUT /api/claims/:id/execute` (triggers mock execution actions).
  - `routes/dashboard.js`: `GET /api/dashboard` calculating dynamic `estate_completeness` (0–100%) and audit activity stream.
  - `routes/gemini.js`: `POST /api/gemini/chat` context-aware AI endpoint supporting live Gemini API key (`GEMINI_API_KEY`) or domain-specific fallback assistant.
  - `.env`: Default configurations (`PORT=3001`, `JWT_SECRET=heirflow_secret_key_2024`).

- **Frontend (`d:\Google Buildathon\Heirflow\frontend`)** — *[VERIFIED: Production build succeeded]*:
  - React 18 + TypeScript + Tailwind CSS setup (`tailwind.config.js`, `postcss.config.js`).
  - `src/api/client.ts`: Axios client configured with `baseURL: http://localhost:3001/api` and auto-injected JWT Authorization interceptor.
  - `src/context/AuthContext.tsx`: Full auth lifecycle (`user`, `login`, `register`, `logout`, token persistence in `localStorage`).
  - `src/types/index.ts`: Standardized interfaces (`User`, `Asset`, `Nominee`, `Claim`, `ClaimAction`, `DashboardData`).
  - `src/components/Layout.tsx` & `src/components/AICopilot.tsx`: Collapsible sidebar navigation and floating interactive estate AI copilot widget.
  - Pages implemented:
    - `src/pages/Landing.tsx`: Hero landing page with value proposition, features, and auth redirection.
    - `src/pages/Login.tsx` & `src/pages/Register.tsx`: Authenticated entry points.
    - `src/pages/Dashboard.tsx`: Estate completeness gauge, statistics, recent activity, and quick-action shortcuts.
    - `src/pages/Assets.tsx`: Category filtering, modal creation, and asset instruction assignment.
    - `src/pages/Nominees.tsx`: Nominee management and Shamir key-share inspection.
    - `src/pages/EstatePlan.tsx`: Readiness checklist and estate plan activation trigger.
    - `src/pages/NomineeClaim.tsx`: Stepper claim workflow (Pending $\rightarrow$ Review $\rightarrow$ Grace Period $\rightarrow$ Approved $\rightarrow$ Executing) with live 7-day grace countdown.
  - `src/App.tsx`: React Router v6 setup with route guard protecting `/dashboard`, `/assets`, `/nominees`, `/estate-plan`, and `/claims`.

- **Documentation (`d:\Google Buildathon\Heirflow\README.md`)** — *[VERIFIED]*:
  - Quick-start guide, API catalog, architecture overview, and demo accounts.

---

## 3. In Progress
- End-to-end user testing via browser of the interactive claim flow from John (owner adding assets/nominees) to Jane (nominee initiating and tracking a claim).
- Resolving minor ESLint unused import warnings in `frontend/src` files detected during production build.

---

## 4. Next Steps (In Order)
1. **Start Backend Server:**
   ```powershell
   Set-Location "d:\Google Buildathon\Heirflow\backend"
   node server.js
   # Confirmed port 3001
   ```
2. **Start Frontend Dev Server:**
   ```powershell
   Set-Location "d:\Google Buildathon\Heirflow\frontend"
   npm start
   # Confirmed port 3000
   ```
3. **Configure Live Gemini API Key (Optional for hackathon demo):**
   - In `backend/.env`, replace `GEMINI_API_KEY=your_gemini_api_key_here` with a valid Google Gemini API key.
4. **End-to-End Walkthrough Verification:**
   - Log in as `john@demo.com` (`demo123`).
   - Add a bank asset and assign nominee `Jane Smith`.
   - Copy Jane's generated key share from the `/nominees` tab.
   - Log in as `jane@demo.com` (`demo123`) and submit an inheritance claim on `/claims` using John's email and the key share.
   - Advance the claim status through Review, Grace Period, and Execute.

---

## 5. Key Decisions and Why
- **SQLite via `better-sqlite3`:** Embedded, synchronous, zero-configuration SQL database ensuring local zero-friction setup without external PostgreSQL/Docker requirements.
- **Simulated Shamir's Secret Sharing:** Key shares are formatted as `HEIRFLOW-SHARE-{uuid}` stored per nominee to reflect diagram 4 ("Cryptographic Key Management") without introducing fragile C-library dependencies on Windows.
- **Dual-Mode AI Copilot (`backend/routes/gemini.js`):** Supports live Gemini API calls when an API key is provided, while delivering rich heuristic fallback responses if unconfigured so demos never fail during a presentation.
- **CommonJS in Backend:** Used CommonJS (`require`) rather than ESM to avoid transpilation errors on local Windows Node environments.

---

## 6. Tried and Failed
- **PowerShell `&&` Operator:** Using `&&` in Windows PowerShell commands caused parser errors (`The token '&&' is not a valid statement separator`). *Resolution:* Always use semicolon (`;`) or separate PowerShell commands.
- **Recursive Directory Scan:** Listing the workspace without ignoring `node_modules` resulted in 35,000+ output lines and truncated buffers. *Rule:* Always target specific directories (`src/`, `backend/routes/`).

---

## 7. Files and Resources
- `d:\Google Buildathon\Heirflow\backend\server.js`: API entry point.
- `d:\Google Buildathon\Heirflow\backend\db.js`: SQLite schema initialization and seed logic.
- `d:\Google Buildathon\Heirflow\backend\routes\*.js`: API handlers (`auth`, `assets`, `nominees`, `claims`, `dashboard`, `gemini`).
- `d:\Google Buildathon\Heirflow\frontend\src\App.tsx`: Main React application & routing configuration.
- `d:\Google Buildathon\Heirflow\frontend\src\pages\*.tsx`: Core views for owner and nominee experiences.
- `d:\Google Buildathon\Heirflow\frontend\src\components\AICopilot.tsx`: Slide-out Gemini chatbot interface.
- `d:\Google Buildathon\Heirflow\README.md`: Central project documentation.
- `d:\Google Buildathon\Heirflow\HeirFlow_All_5_Diagrams (1).drawio`: Source architectural diagrams.
- `d:\Google Buildathon\Heirflow\HeirFlow_Startup_Buildathon_Presentation.pdf`: Pitch deck and product concepts.

---

## 8. Constraints and Gotchas
- **Port Binding:** Backend must run on port `3001` because `frontend/src/api/client.ts` expects `http://localhost:3001/api`.
- **Database Lock:** SQLite file is located at `backend/heirflow.db`. Do not run multiple backend instances simultaneously to avoid locking issues.
- **Authentication State:** Frontend relies on JWT token stored under `localStorage.getItem('token')`.
- **Node Environment:** Windows OS using PowerShell. Avoid Unix-specific commands (`rm -rf`, `export VAR=`).

---

## 9. Open Questions
- Does the user want mock file uploads (death certificate PDF) persisted to disk or stored only as metadata in the SQLite record? *(Currently handled as metadata filename string).*
- Will live Google Cloud / Gemini API credentials be provided for the hackathon video pitch, or should the fallback assistant remain active?