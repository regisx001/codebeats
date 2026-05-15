import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CODEBEATS_DIR = path.join(os.homedir(), '.codebeats');
const CONFIG_PATH = path.join(CODEBEATS_DIR, 'config.toml');
const LOG_PATH = path.join(CODEBEATS_DIR, 'codebeats.log');

export function configPath(): string {
    return CONFIG_PATH;
}

export function logPath(): string {
    return LOG_PATH;
}

export function isDebugEnabled(): boolean {
    if (!fs.existsSync(CONFIG_PATH)) return false;
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    let beforeSection = true;
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;
        if (!beforeSection) continue;
        const m = line.match(/^debug\s*=\s*(true|false)/);
        if (m) return m[1] === 'true';
    }
    return false;
}

export function setDebug(enabled: boolean): void {
    if (!fs.existsSync(CODEBEATS_DIR)) {
        fs.mkdirSync(CODEBEATS_DIR, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(CONFIG_PATH)) {
        content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    }

    const lines = content.split('\n');
    let inserted = false;
    let beforeSection = true;
    const updated: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;

        if (beforeSection && line.startsWith('debug')) {
            if (enabled) updated.push(`debug = true`);
            // when disabling, omit the line entirely (matches default)
            inserted = true;
        } else {
            updated.push(rawLine);
        }
    }

    if (!inserted && enabled) {
        // Insert just after api_key if present, otherwise at the top.
        const apiKeyIdx = updated.findIndex((l) => l.trim().startsWith('api_key'));
        if (apiKeyIdx >= 0) {
            updated.splice(apiKeyIdx + 1, 0, `debug = true`);
        } else {
            updated.unshift(`debug = true`);
        }
    }

    const output = updated.join('\n').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(CONFIG_PATH, output.endsWith('\n') ? output : output + '\n', { mode: 0o600 });
}

/**
 * Writes the Supabase credentials to ~/.codebeats/config.toml.
 */
export function writeSupabaseConfig(url: string, key: string): void {
    if (!fs.existsSync(CODEBEATS_DIR)) {
        fs.mkdirSync(CODEBEATS_DIR, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(CONFIG_PATH)) {
        content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    }

    const lines = content.split('\n');
    let urlInserted = false;
    let keyInserted = false;
    let beforeSection = true;
    const updated: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;

        if (beforeSection && line.startsWith('supabase_url')) {
            updated.push(`supabase_url = "${url}"`);
            urlInserted = true;
        } else if (beforeSection && line.startsWith('supabase_key')) {
            updated.push(`supabase_key = "${key}"`);
            keyInserted = true;
        } else if (beforeSection && line.startsWith('api_key')) {
            // Remove legacy api_key
            continue;
        } else {
            updated.push(rawLine);
        }
    }

    if (!urlInserted) updated.unshift(`supabase_url = "${url}"`);
    if (!keyInserted) updated.splice(urlInserted ? 1 : 1, 0, `supabase_key = "${key}"`);

    const output = updated.join('\n').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(CONFIG_PATH, output.endsWith('\n') ? output : output + '\n', { mode: 0o600 });
}

/**
 * Deletes the Supabase credentials from the config file.
 */
export function clearSupabaseConfig(): void {
    if (!fs.existsSync(CONFIG_PATH)) return;
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const lines = content.split('\n');
    let beforeSection = true;
    const updated: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;
        if (beforeSection && (line.startsWith('supabase_url') || line.startsWith('supabase_key') || line.startsWith('api_key'))) continue;
        updated.push(rawLine);
    }

    fs.writeFileSync(CONFIG_PATH, updated.join('\n'), { mode: 0o600 });
}

export function getSupabaseConfig(): { url: string; key: string } | null {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    let url = '';
    let key = '';
    let beforeSection = true;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;
        if (!beforeSection) continue;

        const urlMatch = line.match(/^supabase_url\s*=\s*"(.*)"/);
        if (urlMatch) url = urlMatch[1];

        const keyMatch = line.match(/^supabase_key\s*=\s*"(.*)"/);
        if (keyMatch) key = keyMatch[1];
    }

    return url && key ? { url, key } : null;
}
