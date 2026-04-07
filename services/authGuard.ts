import { supabase } from './supabaseClient';

export async function requireAuth(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/index.html';
        return false;
    }
    return true;
}
