/**
 * Telegram message sender via Bot API.
 */

export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN not set');
        return false;
    }

    try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`Telegram error ${res.status}: ${body}`);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Telegram send failed:', err);
        return false;
    }
}
