# kanbi.cards

> A kamishibai board for individuals and teams. Flip cards from red to green as you complete tasks. Auto-resets at the start of each cycle.

![kanbi cards screenshot](https://kanbi.cards/screenshot.png)

## What is this?

Kamishibai is a lean management technique where physical cards signal task status — red means pending, green means done. This is a digital version built for weekly, monthly, and annual task cycles, with a dark glassmorphism UI and owner filtering.

**Live:** [kanbi.cards](https://kanbi.cards)

---

## Features

- **3 cycles** — Weekly (resets Monday), Monthly (resets 1st), Annual (resets Jan 1st)
- **All cards view** — see every cycle at a glance
- **Flip animation** — cards flip horizontally from red → green on click
- **Owner system** — assign owners to cards, filter by owner, color-coded chips
- **Confetti** — fires when a cycle hits 100%
- **Auto-reset** — cards return to red at the start of each cycle automatically
- **Free tier** — local storage, works offline, no account needed
- **Pro tier (€9 lifetime)** — cloud sync across devices via Supabase

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | Vanilla HTML + CSS + JS (single file) |
| Hosting | Vercel |
| Database | Supabase |
| Payments | Stripe (Payment Link) |
| Auth | Google SSO (Google Identity Services) |

No framework. No bundler. One `.html` file.

---

## Getting started locally

```bash
# Just open the file
open kanbi.html
```

That's it. No `npm install`, no build step.

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

### 3. Add environment variables

In Render Dashboard → your service → **Environment**:

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

### 5. Stripe webhook URL

In Stripe Dashboard → Developers → Webhooks → Add endpoint:
```
https://kanbi-cards.onrender.com/api/webhook
```
Event: `checkout.session.completed`

### 6. Add domain (when ready)

Render Dashboard → your service → **Custom Domains** → add `kanbi.cards`

---

## Moving to production (Railway)

Railway is the recommended production host — no sleep, €5/month, one-click deploy from GitLab.

1. Go to [railway.app](https://railway.app) → New Project → Deploy from repo
2. Same environment variables as Render
3. Add custom domain in Settings


## Deploying to production (Vercel alternative)

### 1. Vercel

```bash
npm i -g vercel
vercel --name kanbi-cards
```

Add your domain under **Settings → Domains**.

### 2. Supabase

Create a project at [supabase.com](https://supabase.com) and run this SQL:

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

### 3. Stripe

1. Create a one-time product for €9
2. Generate a **Payment Link**
3. Set the success URL to `https://kanbi.cards?success=1`
4. Add a webhook for `checkout.session.completed` → `https://kanbi.cards/api/webhook`

### 4. Google SSO

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your domain to Authorized JavaScript Origins
4. Copy the Client ID into `kanbi.html`:

```js
const GOOGLE_CLIENT_ID = "your-client-id.apps.googleusercontent.com";
```

### 5. Webhook (Vercel serverless function)

Create `api/webhook.js`:

```js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const event = stripe.webhooks.constructEvent(
    req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
  );
  if (event.type === 'checkout.session.completed') {
    const { email, name } = event.data.object.customer_details;
    await supabase.from('paid_users').upsert({ email, name });
  }
  res.json({ received: true });
}
```

### 6. Environment variables (Vercel)

```
STRIPE_SECRET_KEY        = sk_live_...
STRIPE_WEBHOOK_SECRET    = whsec_...
SUPABASE_URL             = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY     = eyJ...
```

Also update these constants in `kanbi.html`:

```js
const GOOGLE_CLIENT_ID = "xxxx.apps.googleusercontent.com";
const SUPABASE_URL     = "https://xxxx.supabase.co";
const SUPABASE_KEY     = "eyJ..."; // anon key
```

---

## Adding a paid user manually

Until the webhook is live, add users directly in Supabase:

```sql
insert into paid_users (email, name) values ('user@example.com', 'Name');
```

Or via the Supabase dashboard → Table editor → `paid_users` → Insert row.

---

## Pricing & terms

- **Free** — unlimited cards, local storage only
- **Pro — €9 lifetime** — cloud sync, multi-device

"Lifetime" means the operational lifetime of the service, not the customer's lifetime. If the service is shut down, paying customers receive 60 days notice. Purchases under 1 year old receive a full refund. See full terms in the app.

---

## Costs

| Service | Free tier covers |
|---|---|
| Vercel | ~100k visits/month |
| Supabase | 50k rows, 500MB |
| Stripe | 1.5% + €0.25 per transaction |
| Domain (kanbi.cards) | ~€35/year |

**Total fixed cost to run: ~€35/year.**

---

## Roadmap

- [ ] Supabase sync for Pro users
- [ ] Team boards (shared owners)
- [ ] API access
- [ ] PWA install prompt
- [ ] Mobile swipe to flip

---

## License

MIT — do what you want, just don't sell it as your own SaaS.

---

*Built by one person. Honest software.*
