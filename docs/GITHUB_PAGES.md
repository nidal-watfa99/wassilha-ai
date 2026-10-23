# Publishing on GitHub Pages (no server)

GitHub Pages hosts **static files only**, so it cannot run the FastAPI backend.
The frontend therefore has a **local mode** (`VITE_LOCAL_MODE=1`): a small
in-browser backend (`frontend/src/services/localBackend.js`) answers the same
`/api` routes and keeps all data in the browser's `localStorage`.

## One-time setup
1. Push this repository to GitHub (branch `main`).
2. Repository → **Settings → Pages → Source: GitHub Actions**.
3. Open the **Actions** tab; the "Deploy to GitHub Pages" run publishes the site at
   `https://<user>.github.io/<repo>/`.

## What works in local mode
Accounts (passwords are PBKDF2-hashed), contacts, tasks, calendar, documents,
products & payment records, dashboard, insights, file attachments and voice notes
(files up to ~1.5 MB each), and the AI assistant.

## What needs the real server
- Live chat between different devices/accounts and push updates (WebSocket)
- Voice/video calls (WebRTC signalling)
- Unlimited file sizes and data that survives clearing the browser

In local mode, starting a chat with an unknown e-mail creates a local contact-style
conversation (messages are saved on this device only).

## AI assistant
Open **Settings → AI connection**, choose a provider (Gemini, Groq, Cerebras or
OpenRouter), paste your own API key and press *Test & save*. The key is stored only in
this browser and requests go directly from the browser to the provider.

## Running with the full backend (unchanged)
Build **without** `VITE_LOCAL_MODE`, or use the instructions in `DEPLOYMENT.md`.
