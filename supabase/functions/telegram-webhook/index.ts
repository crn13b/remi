/**
 * telegram-webhook — Receives Telegram bot updates.
 *
 * When a user sends /start <linking_code> to the REMi bot,
 * this function maps the linking code to a Supabase user and stores
 * the chat_id in user_connections.
 *
 * Linking codes are stored temporarily in user_connections with
 * provider_user_id = null and access_token = linking_code.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface TelegramUpdate {
    message?: {
        chat: { id: number };
        from?: { id: number; username?: string; first_name?: string };
        text?: string;
    };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    // Verify the request comes from Telegram using the secret token
    // Set via: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>&secret_token=<SECRET>"
    const secretToken = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    if (secretToken) {
        const headerToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (headerToken !== secretToken) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    try {
        const update: TelegramUpdate = await req.json();
        const message = update.message;

        if (!message?.text || !message.from) {
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const text = message.text.trim();

        // Handle /start <linking_code>
        if (text.startsWith('/start ')) {
            const linkingCode = text.replace('/start ', '').trim();
            if (!linkingCode) {
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Find the pending connection with this linking code
            const { data: pending, error: findErr } = await supabase
                .from('user_connections')
                .select('*')
                .eq('provider', 'telegram')
                .eq('access_token', linkingCode)
                .is('provider_user_id', null)
                .maybeSingle();

            if (findErr || !pending) {
                console.error('No pending Telegram connection for code:', linkingCode);
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Update with the real chat_id and username
            const chatId = String(message.chat.id);
            const username = message.from.username ?? message.from.first_name ?? 'Unknown';

            const { error: updateErr } = await supabase
                .from('user_connections')
                .update({
                    provider_user_id: chatId,
                    provider_username: username,
                    access_token: null, // Clear the linking code
                    status: 'active',
                    connected_at: new Date().toISOString(),
                })
                .eq('id', pending.id);

            if (updateErr) {
                console.error('Failed to update Telegram connection:', updateErr);
            } else {
                // Send confirmation message to the user
                const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
                if (botToken) {
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: '✅ Connected to REMi! You\'ll receive alerts here.',
                        }),
                    });
                }
            }
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        console.error('Telegram webhook error:', err);
        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
