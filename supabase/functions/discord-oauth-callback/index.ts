/**
 * discord-oauth-callback — Exchanges Discord OAuth code for tokens.
 *
 * Frontend opens Discord OAuth popup → Discord redirects here with ?code=...&state=userId
 * This function exchanges the code, fetches the user's Discord identity,
 * and stores credentials in user_connections.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = 'https://discord.com/api/v10';

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

Deno.serve(async (req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // CSRF token from oauth_states table

    if (!code || !state) {
        return new Response('Missing code or state', { status: 400 });
    }

    // Atomically consume the CSRF state token (DELETE + RETURNING prevents race conditions)
    const { data: oauthState, error: stateErr } = await supabase
        .from('oauth_states')
        .delete()
        .eq('state', state)
        .eq('provider', 'discord')
        .gt('expires_at', new Date().toISOString())
        .select('user_id')
        .single();

    if (stateErr || !oauthState) {
        return new Response('Invalid or expired state parameter', { status: 400 });
    }

    const userId = oauthState.user_id;

    const clientId = Deno.env.get('DISCORD_CLIENT_ID')!;
    const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET')!;
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/discord-oauth-callback`;

    try {
        // 1. Exchange code for tokens
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        if (!tokenRes.ok) {
            const body = await tokenRes.text();
            console.error(`Token exchange failed: ${tokenRes.status} ${body}`);
            return new Response(`Discord auth failed`, { status: 400 });
        }

        const tokens = await tokenRes.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            token_type: string;
        };

        // 2. Fetch Discord user identity
        const userRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        });

        if (!userRes.ok) {
            console.error(`Discord user fetch failed: ${userRes.status}`);
            return new Response('Failed to fetch Discord user', { status: 400 });
        }

        const discordUser = await userRes.json() as { id: string; username: string; discriminator: string };

        // 3. Upsert user_connections
        const { error } = await supabase.from('user_connections').upsert({
            user_id: userId,
            provider: 'discord',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            provider_user_id: discordUser.id,
            provider_username: discordUser.username,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            status: 'active',
            connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id,provider' });

        if (error) {
            console.error('Failed to store Discord connection:', error);
            return new Response('Database error', { status: 500 });
        }

        // 4. Signal the opener and close the popup
        // Use JSON.stringify to safely embed the username in JS context (prevents XSS)
        // Use '*' as targetOrigin because the popup has navigated to the Supabase domain,
        // so a restrictive origin would block the message. The payload is non-sensitive.
        const safeUsername = JSON.stringify(discordUser.username);
        return new Response(
            `<html><script>
if (window.opener) {
    window.opener.postMessage({type:'discord-oauth-success',username:${safeUsername}},'*');
}
window.close();
</script><body>Discord connected! This window should close automatically. If not, you can close it.</body></html>`,
            { headers: { 'Content-Type': 'text/html' } },
        );

    } catch (err) {
        console.error('Discord OAuth error:', err);
        return new Response('Internal error', { status: 500 });
    }
});
