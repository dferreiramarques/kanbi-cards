import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const name  = session.customer_details?.name || '';

    if (!email) {
      console.error('No email in session');
      return res.status(400).json({ error: 'No email' });
    }

    // 1. Add to paid_users table
    const { error } = await supabase
      .from('paid_users')
      .upsert({ email, name }, { onConflict: 'email' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: 'DB error' });
    }

    // 2. Send confirmation email via Resend (recommended - free tier: 100 emails/day)
    // Sign up at resend.com, get API key, add RESEND_API_KEY to Vercel env vars
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
              <p style="margin-bottom:8px">Sign in at <a href="https://kanbi.cards" style="color:#7c6af7">kanbi.cards</a> with this email to sync your boards across all devices.</p>
              <p style="color:#6b6b88;font-size:12px;margin-top:32px">Lifetime access · no renewals · honest software</p>
            </div>
          `
        })
      }).catch(err => console.error('Email send failed:', err));
    }

    console.log(`Pro activated: ${email}`);
  }

  res.json({ received: true });
}
