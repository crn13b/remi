// Supabase Edge Function — Stripe Webhook Handler
// Deploy: supabase functions deploy stripe-webhook
//
// Required env vars (set in Supabase dashboard → Edge Functions → stripe-webhook):
//   STRIPE_SECRET_KEY        — from Stripe dashboard
//   STRIPE_WEBHOOK_SECRET    — from Stripe webhook endpoint settings (whsec_...)
//   SUPABASE_URL             — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Stripe webhook events to enable (Stripe dashboard → Developers → Webhooks):
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";
import { reconcileEntitlements } from "../_shared/entitlements/index.ts";
import type { PlanType } from "../_shared/entitlements/index.ts";

// ─── Stripe price ID → plan mapping ──────────────────────────────────────────
// Replace these with your actual Stripe Price IDs from the dashboard
const PRICE_TO_PLAN: Record<string, "core" | "pro" | "founder"> = {
    price_FOUNDER_MONTHLY: "founder",   // $29/mo founding member
    price_CORE_MONTHLY:    "core",      // $19/mo
    price_CORE_YEARLY:     "core",      // $159/yr
    price_PRO_MONTHLY:     "pro",       // $49/mo
    price_PRO_YEARLY:      "pro",       // $399/yr
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
    const sig = req.headers.get("stripe-signature");
    if (!sig) return new Response("No signature", { status: 400 });

    let event: Stripe.Event;
    try {
        const body = await req.text();
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
                break;
            }
            case "customer.subscription.updated": {
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;
            }
            case "customer.subscription.deleted": {
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;
            }
            default:
                console.log(`Unhandled event: ${event.type}`);
        }
    } catch (err) {
        console.error(`Error handling ${event.type}:`, err);
        return new Response("Internal error", { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
    });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    // Only handle subscription checkouts
    if (session.mode !== "subscription") return;

    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    // Fetch the subscription to get the price ID
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price.id;
    const plan = PRICE_TO_PLAN[priceId];
    if (!plan) {
        console.error(`UNMAPPED PRICE ID: ${priceId} — skipping plan update for customer ${customerId}`);
        return;
    }

    // Find user by customer ID or by client_reference_id (set this to the user's Supabase ID
    // when creating the Stripe checkout session from your frontend)
    let userId = session.client_reference_id;

    if (!userId) {
        // Fallback: look up existing profile by customer id
        const { data } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
        userId = data?.id ?? null;
    }

    if (!userId) {
        console.error("Could not resolve user for customer", customerId);
        return;
    }

    await supabase.from("profiles").upsert({
        id: userId,
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    });

    await reconcileEntitlements(supabase, userId, plan as PlanType);

    console.log(`User ${userId} upgraded to ${plan}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const priceId = subscription.items.data[0]?.price.id;
    const plan = PRICE_TO_PLAN[priceId];
    const isActive = subscription.status === "active" || subscription.status === "trialing";

    if (!plan && isActive) {
        console.error(`UNMAPPED PRICE ID: ${priceId} — skipping plan update for subscription ${subscription.id}`);
        return;
    }

    const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();

    if (!data?.id) {
        console.error("No profile found for subscription", subscription.id);
        return;
    }

    const newPlan = isActive ? plan! : "free";
    await supabase.from("profiles").update({
        plan: newPlan,
        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    }).eq("id", data.id);

    await reconcileEntitlements(supabase, data.id, newPlan as PlanType);

    console.log(`User ${data.id} plan set to ${newPlan} (status: ${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();

    if (!data?.id) {
        console.error("No profile found for subscription", subscription.id);
        return;
    }

    await supabase.from("profiles").update({
        plan: "free",
        stripe_subscription_id: null,
        subscription_period_end: null,
    }).eq("id", data.id);

    await reconcileEntitlements(supabase, data.id, "free" as PlanType);

    console.log(`User ${data.id} downgraded to free (subscription cancelled)`);
}
