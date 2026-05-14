import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function initSupabase(url: string, key: string): SupabaseClient {
    // Strip trailing slash if present to avoid PostgREST errors
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

    supabase = createClient(cleanUrl, key, {
        auth: {
            persistSession: false, // For extension use, we might not need auth session persistence
        }
    });
    return supabase;
}

export function getSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('Supabase client not initialized');
    }
    return supabase;
}

export function isSupabaseInitialized(): boolean {
    return supabase !== null;
}
