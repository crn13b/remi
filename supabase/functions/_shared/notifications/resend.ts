/**
 * Email sender via Resend API.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailPayload {
    to: string;
    subject: string;
    text: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
        console.error('RESEND_API_KEY not set');
        return false;
    }

    try {
        const res = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'REMi Alerts <onboarding@resend.dev>',
                to: payload.to,
                subject: payload.subject,
                text: payload.text,
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`Resend error ${res.status}: ${body}`);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Resend send failed:', err);
        return false;
    }
}
