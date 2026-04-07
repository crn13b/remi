/**
 * Discord notification sender + token refresh.
 * Supports both channel messages and DMs via the REMi Discord Bot.
 * The OAuth token is only used to identify the user (get their Discord user ID).
 */

const DISCORD_API = 'https://discord.com/api/v10';

interface TokenRefreshResult {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

/**
 * Refresh a Discord OAuth access token.
 */
export async function refreshDiscordToken(refreshToken: string): Promise<TokenRefreshResult | null> {
    const clientId = Deno.env.get('DISCORD_CLIENT_ID');
    const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
        console.error('Discord client credentials not set');
        return null;
    }

    try {
        const res = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        if (!res.ok) {
            console.error(`Discord token refresh failed: ${res.status}`);
            return null;
        }

        return await res.json() as TokenRefreshResult;
    } catch (err) {
        console.error('Discord token refresh error:', err);
        return null;
    }
}

/**
 * Send a message to a Discord channel via the bot.
 */
export async function sendDiscordChannelMessage(channelId: string, message: string): Promise<boolean> {
    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!botToken) {
        console.error('DISCORD_BOT_TOKEN not set');
        return false;
    }

    try {
        const msgRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: message }),
        });

        if (!msgRes.ok) {
            const body = await msgRes.text();
            console.error(`Discord channel message failed: ${msgRes.status} ${body}`);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Discord channel message error:', err);
        return false;
    }
}

/**
 * Send a DM to a Discord user via the bot.
 * Requires the bot and user to share a server.
 */
export async function sendDiscordDM(discordUserId: string, message: string): Promise<boolean> {
    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!botToken) {
        console.error('DISCORD_BOT_TOKEN not set');
        return false;
    }

    try {
        // Step 1: Create DM channel
        const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ recipient_id: discordUserId }),
        });

        if (!channelRes.ok) {
            const body = await channelRes.text();
            console.error(`Discord create DM channel failed: ${channelRes.status} ${body}`);
            return false;
        }

        const channel = await channelRes.json() as { id: string };

        // Step 2: Send message
        const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: message }),
        });

        if (!msgRes.ok) {
            const body = await msgRes.text();
            console.error(`Discord send message failed: ${msgRes.status} ${body}`);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Discord DM error:', err);
        return false;
    }
}
