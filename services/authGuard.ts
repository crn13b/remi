import { supabase } from './supabaseClient';

export async function requireAuth(): Promise<boolean> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = '/index.html';
        return false;
    }
    return true;
}
