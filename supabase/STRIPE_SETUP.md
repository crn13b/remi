# Stripe + Supabase Subscription Setup

## 1. Run the database migration

In Supabase dashboard → SQL Editor, paste and run the contents of:
`supabase/migrations/001_profiles.sql`

## 2. Deploy the Edge Function

```bash
npx supabase functions deploy stripe-webhook
```

## 3. Set Edge Function environment variables

In Supabase dashboard → Edge Functions → stripe-webhook → Secrets, add:

| Key | Value |
|-----|-------|
| `STRIPE_SECRET_KEY` | From Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard → Developers → Webhooks (after step 4) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — do not add them.

## 4. Register the webhook in Stripe

1. Go to Stripe dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`) and save it as `STRIPE_WEBHOOK_SECRET` above

## 5. Map your Stripe Price IDs

In `supabase/functions/stripe-webhook/index.ts`, update `PRICE_TO_PLAN` with your real Stripe Price IDs:

```ts
const PRICE_TO_PLAN: Record<string, "core" | "pro" | "founder"> = {
    "price_XXXXXXXXXXXXXXXX": "founder",  // $29/mo founding member
    "price_XXXXXXXXXXXXXXXX": "core",     // $19/mo
    "price_XXXXXXXXXXXXXXXX": "core",     // $159/yr
    "price_XXXXXXXXXXXXXXXX": "pro",      // $49/mo
    "price_XXXXXXXXXXXXXXXX": "pro",      // $399/yr
};
```

Find Price IDs in Stripe dashboard → Products → click a product → copy the Price ID.

## 6. Pass client_reference_id when creating checkout sessions

When you create a Stripe Checkout Session from your backend/frontend, set `client_reference_id` to the user's Supabase user ID so the webhook can link the purchase to the right account:

```ts
const session = await stripe.checkout.sessions.create({
    client_reference_id: supabaseUserId,  // <-- critical
    customer_email: userEmail,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://yourapp.com/dashboard?success=true",
    cancel_url: "https://yourapp.com/pricing",
});
```

## How it works end-to-end

1. User purchases Founding Member plan on your pricing page
2. Stripe fires `checkout.session.completed` → Edge Function sets `profiles.plan = 'founder'`
3. App reads `profiles.plan` on login → `isFounder = true` → badge appears
4. User cancels subscription → Stripe fires `customer.subscription.deleted` → Edge Function sets `profiles.plan = 'free'` → badge disappears on next login
