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
export interface ProjectStat { project: string; seconds: number }
export interface PeakHourStat { hour: number; seconds: number }
export interface StatusMessageStat { message: string; created_at: string }
export interface InsightsPayload {
    topProject: ProjectStat | null;
    topLanguage: LangStat | null;
    topProjects: ProjectStat[];
    peakHour: PeakHourStat | null;
    recentStatus: StatusMessageStat[];
    periodTotalSeconds: number;
    periodDeltaPct: number | null;
    periodDeltaLabel: string | null;
}

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

function toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function startOfWeek(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysBetweenInclusive(start: Date, end: Date): number {
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const diffDays = Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
    return Math.max(1, diffDays + 1);
}

function sumDailySeconds(rows: Array<{ total_seconds: number | null }>): number {
    return rows.reduce((sum, row) => sum + (row.total_seconds || 0), 0);
}

async function fetchDailyStatsRows(
    userId: string,
    startDate?: string,
    endDate?: string,
): Promise<Array<{ total_seconds: number | null; date: string }>> {
    if (!supabase) return [];

    let query = supabase
        .from('daily_stats')
        .select('total_seconds, date')
        .eq('user_id', userId);

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as Array<{ total_seconds: number | null; date: string }>;
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

function resolveProjectName(row: Record<string, unknown>): string | null {
    const rel = row.projects as { name?: string } | Array<{ name?: string }> | null | undefined;
    if (Array.isArray(rel)) return rel[0]?.name ?? null;
    return rel?.name ?? null;
}

function resolvePeriodRanges(filter: LeaderboardFilter): {
    currentStart?: string;
    currentEnd?: string;
    prevStart?: string;
    prevEnd?: string;
    deltaLabel?: string;
} {
    const now = new Date();
    const today = toDateString(now);

    if (filter === 'today') {
        return {
            currentStart: today,
            currentEnd: today,
            prevStart: toDateString(addDays(now, -7)),
            prevEnd: toDateString(addDays(now, -1)),
            deltaLabel: 'vs 7d avg',
        };
    }

    if (filter === 'week') {
        const currentStartDate = startOfWeek(now);
        const daysSoFar = daysBetweenInclusive(currentStartDate, now);
        const prevStartDate = addDays(currentStartDate, -7);
        const prevEndDate = addDays(prevStartDate, daysSoFar - 1);
        return {
            currentStart: toDateString(currentStartDate),
            currentEnd: today,
            prevStart: toDateString(prevStartDate),
            prevEnd: toDateString(prevEndDate),
            deltaLabel: 'vs last week',
        };
    }

    if (filter === 'month') {
        const currentStartDate = startOfMonth(now);
        const daysSoFar = daysBetweenInclusive(currentStartDate, now);
        const prevStartDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const prevMonthDays = daysBetweenInclusive(prevStartDate, prevMonthEnd);
        const compareDays = Math.min(daysSoFar, prevMonthDays);
        const prevEndDate = addDays(prevStartDate, compareDays - 1);
        return {
            currentStart: toDateString(currentStartDate),
            currentEnd: today,
            prevStart: toDateString(prevStartDate),
            prevEnd: toDateString(prevEndDate),
            deltaLabel: 'vs last month',
        };
    }

    return {};
}

export async function fetchInsights(
    userId: string,
    filter: LeaderboardFilter,
): Promise<InsightsPayload> {
    if (!supabase) {
        return {
            topProject: null,
            topLanguage: null,
            topProjects: [],
            peakHour: null,
            recentStatus: [],
            periodTotalSeconds: 0,
            periodDeltaPct: null,
            periodDeltaLabel: null,
        };
    }

    const since = getDateRange(filter);
    const ranges = resolvePeriodRanges(filter);

    let projectsQuery = supabase
        .from('heartbeats')
        .select('project_id, projects(name)')
        .eq('user_id', userId)
        .not('project_id', 'is', null);

    if (since) projectsQuery = projectsQuery.gte('created_at', since);

    let peakQuery = supabase
        .from('heartbeats')
        .select('created_at')
        .eq('user_id', userId);

    if (since) peakQuery = peakQuery.gte('created_at', since);

    let statusQuery = supabase
        .from('status_messages')
        .select('message, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);

    if (since) statusQuery = statusQuery.gte('created_at', since);

    const [projectsRes, peakRes, statusRes, languages, currentRows, prevRows] = await Promise.all([
        projectsQuery,
        peakQuery,
        statusQuery,
        fetchLanguageLeaderboard(userId, filter),
        filter === 'all'
            ? fetchDailyStatsRows(userId)
            : fetchDailyStatsRows(userId, ranges.currentStart, ranges.currentEnd),
        ranges.prevStart ? fetchDailyStatsRows(userId, ranges.prevStart, ranges.prevEnd) : Promise.resolve([]),
    ]);

    const projectCounts: Record<string, number> = {};
    if (projectsRes.data) {
        for (const row of projectsRes.data) {
            const projectName = resolveProjectName(row) || 'Unknown Project';
            projectCounts[projectName] = (projectCounts[projectName] || 0) + 1;
        }
    }

    const topProjects = Object.entries(projectCounts)
        .map(([project, count]) => ({ project, seconds: count * 30 }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5);

    const topProject = topProjects[0] ?? null;

    let peakHour: PeakHourStat | null = null;
    if (peakRes.data) {
        const byHour: Record<number, number> = {};
        for (const row of peakRes.data) {
            const ts = (row as { created_at?: string }).created_at;
            if (!ts) continue;
            const hour = new Date(ts).getHours();
            byHour[hour] = (byHour[hour] || 0) + 1;
        }
        const peakEntry = Object.entries(byHour)
            .map(([hour, count]) => ({ hour: Number(hour), seconds: Number(count) * 30 }))
            .sort((a, b) => b.seconds - a.seconds)[0];
        if (peakEntry) peakHour = peakEntry;
    }

    const periodTotalSeconds = sumDailySeconds(currentRows);

    let periodDeltaPct: number | null = null;
    let periodDeltaLabel: string | null = ranges.deltaLabel ?? null;

    if (filter !== 'all') {
        const prevTotal = sumDailySeconds(prevRows);
        if (filter === 'today') {
            const prevAvg = prevTotal / 7;
            if (prevAvg > 0) {
                periodDeltaPct = ((periodTotalSeconds - prevAvg) / prevAvg) * 100;
            }
        } else if (prevTotal > 0) {
            periodDeltaPct = ((periodTotalSeconds - prevTotal) / prevTotal) * 100;
        }
    } else {
        periodDeltaLabel = null;
    }

    return {
        topProject,
        topLanguage: languages[0] ?? null,
        topProjects,
        peakHour,
        recentStatus: (statusRes.data as StatusMessageStat[]) || [],
        periodTotalSeconds,
        periodDeltaPct,
        periodDeltaLabel,
    };
}
