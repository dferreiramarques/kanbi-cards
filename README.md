# kanbi.cards

> A kamishibai board for individuals and teams. Flip cards from red to green as you complete tasks. Auto-resets at the start of each cycle.

![kanbi cards screenshot](https://kanbi.cards/screenshot.png)

## What is this?

Kamishibai is a lean management technique where physical cards signal task status — red means pending, green means done. This is a digital version built for weekly, monthly, and annual task cycles. The visual language is harmonized with the **[monco.io](https://www.monco.io) suite** (Roadmaps style: Inter + JetBrains Mono, zinc surfaces, Aura-like tokens) with Kanbi's own violet accent, light/dark theme and owner filtering.

**Live:** [kanbi.cards](https://kanbi.cards)

---

## Google Drive sync

Boards live in the browser. When someone signs in with Google, they are also saved in that person's own Google Drive (a private app folder), so they follow the user across devices. The server stores nothing: it only serves the pages and exchanges Google tokens (`auth.js`, a refresh token in an encrypted httpOnly cookie). It is the same method as the other nimble apps; see the [nimble starter](https://github.com/dferreiramarques/nimble-starter).

To enable it, set these variables on the host (Render): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `COOKIE_SECRET` (a long random string) and `PUBLIC_URL` (e.g. `https://kanbi.cards`). In Google Cloud: enable the Drive API, add the scope `.../auth/drive.appdata` to the consent screen and `<site>/auth/callback` to the OAuth client's redirect URIs. Without them the app keeps working locally, exactly as before.

`drive.js` is the sync module (the safety rules are tested in `test/drive.test.js`); `kanbi-sync.js` maps the `kanbi_*` browser storage keys to and from the synced document. `npm test` runs the sign-in loop against a fake Google and the sync rules against a fake Drive.

## Status

Kanbi Cards is **free and takes no payments**: there is no Pro tier, no checkout and no server-side account. Boards live in your browser. Signing in with Google only puts your name on your boards. Syncing across devices through **your own Google Drive** (the pattern used in `taskboards`) is planned and will stay free.

---

## Monco.io suite

Kanbi Cards is part of the **[monco.io](https://www.monco.io) suite** together with [Roadmaps](https://roadmaps.monco.io) and [Taskboards](https://taskboards.monco.io). All products share the same design system: `product-page.css` defines the shared tokens (Inter + JetBrains Mono, zinc surfaces, Aura-like radii 6/8/12/16px, soft shadows, 3px focus rings) and each product only overrides its accent in its own pages — Kanbi's accent is **violet**. kanbi.cards follows the suite's layout too: a product page at `/` (landing) and the board app at `/app.html`.

---

## Features

- **3 cycles** — Weekly (resets Monday), Monthly (resets 1st), Annual (resets Jan 1st)
- **All cards view** — see every cycle at a glance
- **Flip animation** — square cards flip horizontally from red → green on click, outline + gradient only
- **Owner system** — assign owners to cards, filter by owner (color-coded chips), cards left blank are grouped under an "unassigned" filter
- **Confetti** — fires when a cycle hits 100%
- **Auto-reset** — cards return to red at the start of each cycle automatically
- **Light / dark theme** — explicit switch (☀️/🌙) next to sign in, remembers your choice
- **Installable PWA** — install button (desktop + mobile) via the native browser prompt where supported, with manual instructions as a fallback (iOS Safari, desktop Safari, Firefox); works offline once installed
- **Free, local-first** — local storage, works offline, no account required

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | Vanilla HTML + CSS + JS (single file) |
| Hosting | Vercel / Render / Railway |
| Auth | Google SSO (Google Identity Services) |
| Storage | The browser (`localStorage`); Google Drive sync planned |
| Offline / install | Service worker (`sw.js`) + Web App Manifest (`manifest.json`) |

No framework. No bundler. One `.html` file plus a PWA shell (`manifest.json`, `sw.js`, `icons/`).

---

## Getting started locally

```bash
# Just open the app page
open app.html
```

That's it. No `npm install`, no build step. Note: the install button and offline caching only work when the pages are served alongside `manifest.json`, `sw.js` and `icons/` from the same origin (e.g. via `node server.js`, or any static file server) — opening the raw file with `file://` skips service worker registration.

```bash
# To test the PWA bits locally
npm install
node server.js
# → http://localhost:3000
```

---

## PWA / installing

- `manifest.json` — app name, theme colors, icons (`icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`).
- `sw.js` — network-first for the pages (`index.html` landing + `app.html` board, so updates aren't stuck behind a stale cache), cache-first for icons/manifest. Bump `CACHE_NAME` in `sw.js` on every deploy to evict old assets.
- Install button lives in the header, next to sign in. On Chrome/Edge/Android it triggers the native `beforeinstallprompt` flow; everywhere else (iOS Safari, desktop Safari, Firefox) it opens a small modal with manual "Add to Home Screen" instructions. Hides itself once the app is already running standalone.

---

## Deploying to Render (free tier, no credit card)

### 1. Push to GitLab / GitHub

```bash
git init
git remote add origin https://gitlab.com/YOUR_USERNAME/kanbi-cards.git
git add .
git commit -m "initial commit"
git push -u origin main
```

### 2. Create a Render Web Service

1. Go to [render.com](https://render.com) → New → **Web Service**
2. Connect your GitLab / GitHub account
3. Select the `kanbi-cards` repository
4. Render auto-detects `render.yaml` — confirm settings:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Instance type:** Free

### 3. Environment variables

None. The app needs no environment variables.

### 4. Deploy

Click **Deploy** — live in ~2 minutes at `kanbi-cards.onrender.com`.

> ⚠️ Free tier on Render spins down after 15 min of inactivity (cold start ~30s).
> Fine for testing. For production use Railway or Vercel.

### 5. Add domain (when ready)

Render Dashboard → your service → **Custom Domains** → add `kanbi.cards`

---

## Moving to production (Railway)

Railway is the recommended production host — no sleep, €5/month, one-click deploy from GitLab.

1. Go to [railway.app](https://railway.app) → New Project → Deploy from repo
2. No required environment variables (see above)
3. Add custom domain in Settings

## Deploying to production (Vercel alternative)

```bash
npm i -g vercel
vercel --name kanbi-cards
```

Add your domain under **Settings → Domains**.

### Google SSO

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your domain to Authorized JavaScript Origins
4. The Client ID is already wired into `app.html`'s `g_id_onload` config — swap it for your own if you fork this.

---

## Costs

| Service | Notes |
|---|---|
| Vercel / Render / Railway | Free tier covers low traffic |
| Google SSO | Free |
| Domain (kanbi.cards) | ~€35/year |

**No per-transaction costs anymore — the app doesn't take payments.**

---

## Roadmap

- [ ] Google Drive sync (per-user, free), mirrors the `taskboards` pattern
- [ ] Team boards (shared owners)
- [ ] API access
- [ ] Mobile swipe to flip

---

## License

MIT — do what you want, just don't sell it as your own SaaS.

---

*Built by one person. Honest software.*
