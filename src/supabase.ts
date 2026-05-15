import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function initSupabase(url: string, key: string): SupabaseClient {
    // Strip trailing slash if present to avoid PostgREST path errors
    const cleanUrl = url.replace(/\/+$/, '');

    supabase = createClient(cleanUrl, key, {
        auth: {
            persistSession: false,
        },
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

/**
 * Runs a lightweight test query against the `projects` table
 * to verify that the Supabase URL, key, and schema are correct.
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) {
        return { ok: false, error: 'Supabase client not initialized' };
    }
    try {
        // Try to read 0 rows — this validates URL, key, and that the table exists
        const { error } = await supabase
            .from('projects')
            .select('id')
            .limit(0);

        if (error) {
            return { ok: false, error: `${error.code}: ${error.message}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}
