# kanbi.cards

> A kamishibai board for individuals and teams. Flip cards from red to green as you complete tasks. Auto-resets at the start of each cycle.

![kanbi cards screenshot](https://kanbi.cards/screenshot.png)

## What is this?

Kamishibai is a lean management technique where physical cards signal task status — red means pending, green means done. This is a digital version built for weekly, monthly, and annual task cycles, with a light/dark UI (David Marques Design System — Figtree + Fluent 2) and owner filtering.

**Live:** [kanbi.cards](https://kanbi.cards)

---

## Status

The app is now **fully free** — the Stripe paywall UI ("Go Pro" / "Upgrade") has been removed from the frontend. Cloud sync is mid-migration:

- Sign in with Google still works.
- The old Supabase-backed cloud sync is now dormant (no UI path makes an account "paid" anymore).
- It's being replaced with **per-user Google Drive storage** — sign in, and your boards save to your own Drive — mirroring the pattern used in the `taskboards` project. Not shipped yet.
- The Stripe/Supabase code still lives in `server.js` for now; it'll be removed once Drive sync lands.

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
| Cloud sync | Supabase *(legacy, dormant — being replaced by Google Drive)* |
| Payments | Stripe *(legacy — paywall removed from UI, backend cleanup pending)* |
| Offline / install | Service worker (`sw.js`) + Web App Manifest (`manifest.json`) |

No framework. No bundler. One `.html` file plus a PWA shell (`manifest.json`, `sw.js`, `icons/`).

---

## Getting started locally

```bash
# Just open the file
open kanbi.html
```

That's it. No `npm install`, no build step. Note: the install button and offline caching only work when `kanbi.html` is served alongside `manifest.json`, `sw.js` and `icons/` from the same origin (e.g. via `node server.js`, or any static file server) — opening the raw file with `file://` skips service worker registration.

```bash
# To test the PWA bits locally
npm install
node server.js
# → http://localhost:3000
```

---

## PWA / installing

- `manifest.json` — app name, theme colors, icons (`icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`).
- `sw.js` — network-first for `kanbi.html` (so updates aren't stuck behind a stale cache), cache-first for icons/manifest. Bump `CACHE_NAME` in `sw.js` on every deploy to evict old assets.
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

The app runs fine with **no environment variables** now that the paywall is gone. Only set these if you're keeping the legacy Stripe/Supabase code alive for testing:

```
STRIPE_SECRET_KEY       = sk_live_...
STRIPE_WEBHOOK_SECRET   = whsec_...
SUPABASE_URL            = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY    = eyJ...
RESEND_API_KEY          = re_...
```

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
4. The Client ID is already wired into `kanbi.html`'s `g_id_onload` config — swap it for your own if you fork this.

---

## Legacy: Stripe / Supabase (being phased out)

These are still present in `server.js` and parts of `kanbi.html` but are no longer reachable from the UI. Kept here for reference until the Google Drive migration replaces them.

<details>
<summary>Supabase schema</summary>

```sql
create table paid_users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  name text,
  created_at timestamptz default now()
);

create table user_boards (
  id uuid default gen_random_uuid() primary key,
  email text not null references paid_users(email),
  tasks jsonb default '{}',
  states jsonb default '{}',
  resets jsonb default '{}',
  updated_at timestamptz default now()
);

alter table paid_users enable row level security;
alter table user_boards enable row level security;
```
</details>

<details>
<summary>Stripe webhook</summary>

In Stripe Dashboard → Developers → Webhooks → Add endpoint:
```
https://kanbi-cards.onrender.com/api/webhook
```
Event: `checkout.session.completed`
</details>

<details>
<summary>Adding a paid user manually (legacy)</summary>

```sql
insert into paid_users (email, name) values ('user@example.com', 'Name');
```

Or via the Supabase dashboard → Table editor → `paid_users` → Insert row.
</details>

---

## Costs

| Service | Notes |
|---|---|
| Vercel / Render / Railway | Free tier covers low traffic |
| Google SSO | Free |
| Supabase | Legacy, dormant — can be decommissioned once Drive sync ships |
| Domain (kanbi.cards) | ~€35/year |

**No per-transaction costs anymore — the app doesn't take payments.**

---

## Roadmap

- [ ] Google Drive sync (per-user, free) — replaces Supabase, mirrors the `taskboards` pattern
- [ ] Remove Stripe/Supabase code from `server.js` once Drive sync ships
- [ ] Team boards (shared owners)
- [ ] API access
- [ ] Mobile swipe to flip

---

## License

MIT — do what you want, just don't sell it as your own SaaS.

---

*Built by one person. Honest software.*
