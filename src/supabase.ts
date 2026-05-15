import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function initSupabase(url: string, key: string): SupabaseClient {
    const cleanUrl = url.replace(/\/+$/, '');
    supabase = createClient(cleanUrl, key, {
        auth: { persistSession: false },
    });
    return supabase;
}

export function getSupabase(): SupabaseClient {
    if (!supabase) throw new Error('Supabase client not initialized');
    return supabase;
}

export function isSupabaseInitialized(): boolean {
    return supabase !== null;
}

/**
 * Validates the connection by performing a lightweight read on the projects table.
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: 'Supabase client not initialized' };
    try {
        const { error } = await supabase.from('projects').select('id').limit(0);
        if (error) return { ok: false, error: `${error.code}: ${error.message}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export type LeaderboardFilter = 'today' | 'week' | 'month' | 'all';
export interface LangStat { language: string; seconds: number }

function getDateRange(filter: LeaderboardFilter): string | null {
    const now = new Date();
    if (filter === 'today') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
    }
    if (filter === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay()); // start of week (Sunday)
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
    }
    if (filter === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return d.toISOString();
    }
    return null; // 'all' — no date filter
}

/**
 * Fetches per-language heartbeat counts for the given user and time filter.
 * Returns an array sorted by seconds descending, capped at 10 entries.
 */
export async function fetchLanguageLeaderboard(
    userId: string,
    filter: LeaderboardFilter,
): Promise<LangStat[]> {
    if (!supabase) return [];

    let query = supabase
        .from('heartbeats')
        .select('language')
        .eq('user_id', userId)
        .not('language', 'is', null);

    const since = getDateRange(filter);
    if (since) {
        query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Tally counts per language in JavaScript (no RPC needed)
    const counts: Record<string, number> = {};
    for (const row of data) {
        const lang = row.language as string;
        counts[lang] = (counts[lang] || 0) + 1;
    }

    return Object.entries(counts)
        .map(([language, count]) => ({ language, seconds: count * 30 }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 10);
}
