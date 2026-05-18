import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initLogger, log } from './logger';
import { CoreClient, mapLanguageId } from './core-client';
import { CodeBeatsSidebarProvider } from './sidebar';
import {
    writeSupabaseConfig,
    clearSupabaseConfig,
    getSupabaseConfig,
    setDebug,
    isDebugEnabled,
    configPath,
    logPath,
} from './config-writer';
import {
    initSupabase,
    testConnection,
    fetchLanguageLeaderboard,
    fetchInsights,
    LeaderboardFilter,
} from './supabase';

const SECRET_SUPABASE_URL = 'codebeats.supabaseUrl';
const SECRET_SUPABASE_KEY = 'codebeats.supabaseKey';

function getPluginVersion(context: vscode.ExtensionContext): string {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(context.extensionPath, 'package.json'), 'utf-8'),
        );
        return pkg.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/**
 * Retrieves Supabase credentials from SecretStorage, or migrates them
 * from the local config file if they haven't been stored in secrets yet.
 */
async function getSupabaseCredentials(
    context: vscode.ExtensionContext,
): Promise<{ url: string; key: string } | null> {
    const url = await context.secrets.get(SECRET_SUPABASE_URL);
    const key = await context.secrets.get(SECRET_SUPABASE_KEY);
    if (url && key) {
        writeSupabaseConfig(url, key);
        return { url, key };
    }

    const local = getSupabaseConfig();
    if (local) {
        await context.secrets.store(SECRET_SUPABASE_URL, local.url);
        await context.secrets.store(SECRET_SUPABASE_KEY, local.key);
        return local;
    }

    return null;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    initLogger(context.extensionMode === vscode.ExtensionMode.Development);
    log.info('CodeBeats activating…');

    const pluginVersion = getPluginVersion(context);

    // ── Sidebar ──────────────────────────────────────────────────────────
    const sidebar = new CodeBeatsSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CodeBeatsSidebarProvider.viewType,
            sidebar,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    // ── Invalid-config cleanup ────────────────────────────────────────────
    const onInvalidConfig = async (): Promise<void> => {
        await context.secrets.delete(SECRET_SUPABASE_URL);
        await context.secrets.delete(SECRET_SUPABASE_KEY);
        clearSupabaseConfig();
        log.info('Supabase config cleared after connection failure');
    };

    // ── Core tracking client ──────────────────────────────────────────────
    const client = new CoreClient(
        context,
        (state) => sidebar.updateState(state),
        pluginVersion,
        () => { void onInvalidConfig(); },
    );
    sidebar.setStateGetter(() => client.getState());

    // ── Sidebar message handler ───────────────────────────────────────────
    sidebar.setMessageHandler(async (msg) => {
        const config = vscode.workspace.getConfiguration('codebeats');

        switch (msg.type as string) {

            // ── Connect ────────────────────────────────────────────────
            case 'saveConfig': {
                let url = String(msg.url ?? '').trim();
                const key = String(msg.key ?? '').trim();

                if (url && !url.includes('.') && !url.startsWith('http')) {
                    url = `https://${url}.supabase.co`;
                }

                if (!url || !key) {
                    vscode.window.showErrorMessage('CodeBeats: Supabase URL and Key are required.');
                    break;
                }

                await context.secrets.store(SECRET_SUPABASE_URL, url);
                await context.secrets.store(SECRET_SUPABASE_KEY, key);
                writeSupabaseConfig(url, key);
                initSupabase(url, key);

                const result = await testConnection();
                if (!result.ok) {
                    vscode.window.showErrorMessage(
                        `CodeBeats: Connection failed — ${result.error}. ` +
                        'Make sure you have run schema.sql in your Supabase SQL Editor.',
                    );
                    log.error('Connection test failed:', result.error);
                    await context.secrets.delete(SECRET_SUPABASE_URL);
                    await context.secrets.delete(SECRET_SUPABASE_KEY);
                    clearSupabaseConfig();
                    sidebar.updateState(client.getState()); // re-render login form
                    break;
                }

                log.info('Supabase connection test successful');
                await config.update('trackingEnabled', true, vscode.ConfigurationTarget.Global);
                client.init();
                client.start();
                sidebar.updateState(client.getState());
                vscode.window.showInformationMessage('CodeBeats: Connected and verified! ✓');
                break;
            }

            // ── Leaderboard fetch ──────────────────────────────────────
            case 'fetchLeaderboard': {
                const filter = (msg.filter as LeaderboardFilter) || 'today';
                const userId = client.getUserId();
                const data = await fetchLanguageLeaderboard(userId, filter);
                sidebar.postLeaderboard(data);
                break;
            }

            case 'fetchInsights': {
                const filter = (msg.filter as LeaderboardFilter) || 'today';
                const userId = client.getUserId();
                const data = await fetchInsights(userId, filter);
                sidebar.postInsights(data);
                break;
            }

            // ── Status message ─────────────────────────────────────────
            case 'setStatus': {
                const message = String(msg.message ?? '');
                client.setStatus(message);
                break;
            }

            // ── Pause tracking ─────────────────────────────────────────
            case 'stopTracking': {
                await config.update('trackingEnabled', false, vscode.ConfigurationTarget.Global);
                client.pause();
                vscode.window.showInformationMessage('CodeBeats: Tracking paused.');
                break;
            }

            // ── Resume tracking ────────────────────────────────────────
            case 'startTracking': {
                const creds = await getSupabaseCredentials(context);
                if (!creds) {
                    vscode.window.showWarningMessage('CodeBeats: No credentials found. Please reconnect.');
                    break;
                }
                await config.update('trackingEnabled', true, vscode.ConfigurationTarget.Global);
                initSupabase(creds.url, creds.key);
                client.init();
                client.start();
                vscode.window.showInformationMessage('CodeBeats: Tracking resumed.');
                break;
            }

            // ── Disconnect ─────────────────────────────────────────────
            case 'disconnect': {
                await context.secrets.delete(SECRET_SUPABASE_URL);
                await context.secrets.delete(SECRET_SUPABASE_KEY);
                clearSupabaseConfig();
                client.reset();
                vscode.window.showInformationMessage('CodeBeats: Disconnected.');
                break;
            }

            // ── Open schema file ───────────────────────────────────────
            case 'openSchemaFile': {
                const schemaPath = path.join(context.extensionPath, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await vscode.window.showTextDocument(vscode.Uri.file(schemaPath));
                } else {
                    vscode.window.showWarningMessage('CodeBeats: schema.sql not found in extension folder.');
                }
                break;
            }

            // ── Open external URL ──────────────────────────────────────
            case 'openExternal': {
                const url = String(msg.url ?? '');
                try { vscode.env.openExternal(vscode.Uri.parse(url)); } catch { /* ignore */ }
                break;
            }
        }
    });

    // ── Editor activity forwarding ────────────────────────────────────────
    const presenceTickMs = 30_000;
    let lastUserActivity = 0;

    function markUserActivity(doc?: vscode.TextDocument): void {
        if (!doc || doc.uri.scheme !== 'file') return;
        lastUserActivity = Date.now();
    }

    function reportActivity(doc: vscode.TextDocument): void {
        markUserActivity(doc);
        void client.activity(doc.uri.fsPath, mapLanguageId(doc.languageId));
    }

    function getInactiveGraceMs(): number {
        const config = vscode.workspace.getConfiguration('codebeats');
        const minutes = config.get<number>('inactiveGraceMinutes', 10);
        if (!minutes || minutes <= 0) return 0;
        return Math.round(minutes * 60_000);
    }

    function presenceTick(): void {
        if (!client.getState().tracking) return;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') return;

        const graceMs = getInactiveGraceMs();
        const now = Date.now();
        if (graceMs === 0) return;
        if (lastUserActivity === 0 || now - lastUserActivity > graceMs) return;

        void client.activity(editor.document.uri.fsPath, mapLanguageId(editor.document.languageId));
    }

    const presenceTimer = setInterval(presenceTick, presenceTickMs);
    context.subscriptions.push({ dispose: () => clearInterval(presenceTimer) });

    const initialEditor = vscode.window.activeTextEditor;
    if (initialEditor) markUserActivity(initialEditor.document);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => reportActivity(e.document)),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) reportActivity(editor.document);
        }),
        vscode.window.onDidChangeTextEditorSelection((e) => markUserActivity(e.textEditor.document)),
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => markUserActivity(e.textEditor.document)),
        vscode.window.onDidChangeWindowState((e) => {
            if (e.focused) markUserActivity(vscode.window.activeTextEditor?.document);
        }),
    );

    // ── Commands ──────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('codebeats.setStatus', async () => {
            const creds = await getSupabaseCredentials(context);
            if (!creds) return;
            const message = await vscode.window.showInputBox({
                prompt: 'Set your CodeBeats status message',
                placeHolder: 'What are you working on?',
                validateInput: (v) => (v.length > 100 ? 'Max 100 characters' : null),
            });
            if (message !== undefined) await client.setStatus(message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebeats.showCodingTime', () => {
            const state = client.getState();
            vscode.window.showInformationMessage(`CodeBeats: ${state.codingTime} today`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebeats.toggleDebug', async () => {
            const current = isDebugEnabled();
            const pick = await vscode.window.showQuickPick(['true', 'false'], {
                title: 'CodeBeats Debug',
                placeHolder: `current value: ${current}`,
            });
            if (pick === undefined) return;
            const enabled = pick === 'true';
            setDebug(enabled);
            vscode.window.showInformationMessage(
                `CodeBeats: debug ${enabled ? 'enabled' : 'disabled'}.`,
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebeats.openLogFile', async () => {
            const p = logPath();
            if (!fs.existsSync(p)) {
                vscode.window.showInformationMessage('CodeBeats: No log file yet. Enable debug first.');
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebeats.openConfigFile', async () => {
            const p = configPath();
            if (!fs.existsSync(p)) {
                vscode.window.showWarningMessage('CodeBeats: No config file yet. Connect first.');
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    // ── Auto-start on activation ──────────────────────────────────────────
    const savedConfig = vscode.workspace.getConfiguration('codebeats');
    const creds = await getSupabaseCredentials(context);
    const trackingEnabled = savedConfig.get<boolean>('trackingEnabled', true);

    if (creds && trackingEnabled) {
        initSupabase(creds.url, creds.key);
        client.init();
        client.start();
        log.info('CodeBeats activated — tracking started.');
    } else if (creds) {
        initSupabase(creds.url, creds.key);
        client.init();
        sidebar.updateState(client.getState());
        log.info('CodeBeats activated — connected, tracking paused.');
    } else {
        sidebar.updateState(client.getState());
        log.info('CodeBeats activated — no credentials configured.');
    }
}

export function deactivate(): void {
    // Cleanup handled via context.subscriptions (CoreClient.dispose)
}
