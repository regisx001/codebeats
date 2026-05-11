import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEVGLOBE_DIR = path.join(os.homedir(), '.devglobe');
const CONFIG_PATH = path.join(DEVGLOBE_DIR, 'config.toml');
const LOG_PATH = path.join(DEVGLOBE_DIR, 'devglobe.log');

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
    if (!fs.existsSync(DEVGLOBE_DIR)) {
        fs.mkdirSync(DEVGLOBE_DIR, { recursive: true });
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
 * Writes the API key to ~/.devglobe/config.toml so the core (running as a
 * subprocess) can pick it up on next init. Preserves other settings already
 * present in the file.
 */
export function writeApiKey(apiKey: string): void {
    if (!fs.existsSync(DEVGLOBE_DIR)) {
        fs.mkdirSync(DEVGLOBE_DIR, { recursive: true });
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

        if (beforeSection && line.startsWith('api_key')) {
            updated.push(`api_key = "${apiKey}"`);
            inserted = true;
        } else {
            updated.push(rawLine);
        }
    }

    if (!inserted) {
        updated.unshift(`api_key = "${apiKey}"`);
    }

    const output = updated.join('\n').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(CONFIG_PATH, output.endsWith('\n') ? output : output + '\n', { mode: 0o600 });
}

/**
 * Deletes the API key from the config file (sets it to empty).
 */
export function clearApiKey(): void {
    if (!fs.existsSync(CONFIG_PATH)) return;
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const lines = content.split('\n');
    let beforeSection = true;
    const updated: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('[')) beforeSection = false;
        if (beforeSection && line.startsWith('api_key')) continue;
        updated.push(rawLine);
    }

    fs.writeFileSync(CONFIG_PATH, updated.join('\n'), { mode: 0o600 });
}
