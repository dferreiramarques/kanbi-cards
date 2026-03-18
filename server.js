import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Stripe webhook (raw body needed BEFORE express.json())
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const name  = session.customer_details?.name || '';

    if (!email) return res.status(400).json({ error: 'No email' });

    // Add to Supabase
    const { error } = await supabase
      .from('paid_users')
      .upsert({ email, name }, { onConflict: 'email' });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'DB error' });
    }

    // Send confirmation email via Resend
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Kanbi Cards <hello@kanbi.cards>',
          to: email,
          subject: 'Your Kanbi Cards Pro access is now active',
          html: `
            <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:32px;background:#0d0d14;color:#e8e8f0;border-radius:12px">
              <h2 style="color:#7c6af7;margin-bottom:8px">// pro_access_activated</h2>
              <p style="color:#9090aa;margin-bottom:24px">Hi ${name || 'there'},</p>
              <p style="margin-bottom:16px">Your <strong style="color:#fff">Kanbi Cards Pro</strong> account is now active for:</p>
              <p style="background:#1a1a28;padding:12px 16px;border-radius:8px;color:#22d3a0;margin-bottom:24px">${email}</p>
              <p style="margin-bottom:8px">Sign in at <a href="https://kanbi.cards" style="color:#7c6af7">kanbi.cards</a> with this email.</p>
              <p style="color:#6b6b88;font-size:12px;margin-top:32px">Lifetime access · no renewals · honest software</p>
            </div>
          `
        })
      }).catch(e => console.error('Email failed:', e));
    }

    console.log(`✅ Pro activated: ${email}`);
  }

  res.json({ received: true });
});

// ── Serve static files (kanbi.html)
app.use(express.static(__dirname));

// ── Catch-all → kanbi.html (SPA behaviour)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'kanbi.html'));
});

app.listen(PORT, () => console.log(`kanbi.cards running on port ${PORT}`));
