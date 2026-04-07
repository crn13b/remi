/**
 * oauth-state — Generates a cryptographically random CSRF state token
 * for OAuth flows. Requires authenticated user.
 *
 * POST { provider: "discord" | "telegram" }
 * Returns { state: "<random-token>" }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return new Response("Unauthorized", { status: 401 });
    }

    const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { provider } = await req.json() as { provider?: string };
    if (!provider || !["discord", "telegram"].includes(provider)) {
        return new Response(JSON.stringify({ error: "Invalid provider" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Generate random state token
    const state = crypto.randomUUID();

    // Clean up expired states for this user first
    await supabase.from("oauth_states").delete().lt("expires_at", new Date().toISOString());

    // Insert new state
    const { error } = await supabase.from("oauth_states").insert({
        user_id: user.id,
        state,
        provider,
    });

    if (error) {
        console.error("Failed to create oauth state:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ state }), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
        },
    });
});
