import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initLogger, log } from './logger';
import { CoreClient, mapLanguageId } from './core-client';
import { DevTrackerSidebarProvider } from './sidebar';
import {
    writeSupabaseConfig,
    clearSupabaseConfig,
    getSupabaseConfig,
    setDebug,
    isDebugEnabled,
    configPath,
    logPath,
} from './config-writer';
import { initSupabase, getSupabase } from './supabase';

const SECRET_SUPABASE_URL = 'devtracker.supabaseUrl';
const SECRET_SUPABASE_KEY = 'devtracker.supabaseKey';

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
 * Retrieves the Supabase config, migrating from old storage locations if needed.
 */
async function getSupabaseCredentials(context: vscode.ExtensionContext): Promise<{ url: string; key: string } | null> {
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
    log.info('DevTracker activating…');

    const pluginVersion = getPluginVersion(context);

    const sidebar = new DevTrackerSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DevTrackerSidebarProvider.viewType,
            sidebar,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    const onInvalidConfig = async (): Promise<void> => {
        await context.secrets.delete(SECRET_SUPABASE_URL);
        await context.secrets.delete(SECRET_SUPABASE_KEY);
        clearSupabaseConfig();
        log.info('Supabase config cleared after connection failure');
    };

    const client = new CoreClient(
        context,
        (state) => sidebar.updateState(state),
        pluginVersion,
        () => { void onInvalidConfig(); },
    );
    sidebar.setStateGetter(() => client.getState());

    sidebar.setMessageHandler(async (msg) => {
        const config = vscode.workspace.getConfiguration('devtracker');

        switch (msg.type as string) {
            case 'saveConfig': {
                const url = String(msg.url ?? '').trim();
                const key = String(msg.key ?? '').trim();
                if (!url || !key) {
                    vscode.window.showErrorMessage('DevTracker: Supabase URL and Key are required.');
                    break;
                }
                await context.secrets.store(SECRET_SUPABASE_URL, url);
                await context.secrets.store(SECRET_SUPABASE_KEY, key);
                writeSupabaseConfig(url, key);

                initSupabase(url, key);

                // --- Connection Test ---
                // try {
                //     const supabase = getSupabase();
                //     const { error } = await supabase
                //         .from('projects')
                //         .upsert({ name: 'Connection Test', remote_url: 'test://connection' }, { onConflict: 'remote_url' });

                //     if (error) throw error;
                //     log.info('Supabase connection test successful');
                // } catch (err) {
                //     vscode.window.showErrorMessage(`DevTracker: Connection test failed: ${(err as Error).message}`);
                //     break;
                // }
                // -----------------------

                client.init();
                client.start();
                sidebar.updateState(client.getState());
                vscode.window.showInformationMessage('DevTracker: Connected and verified!');
                break;
            }

            case 'setStatus': {
                const message = String(msg.message ?? '');
                client.setStatus(message);
                break;
            }

            case 'stopTracking': {
                await config.update('trackingEnabled', false, vscode.ConfigurationTarget.Global);
                client.pause();
                vscode.window.showInformationMessage('DevTracker: Tracking stopped.');
                break;
            }

            case 'startTracking': {
                const creds = await getSupabaseCredentials(context);
                if (!creds) break;
                await config.update('trackingEnabled', true, vscode.ConfigurationTarget.Global);

                initSupabase(creds.url, creds.key);
                client.init();
                client.start();
                vscode.window.showInformationMessage('DevTracker: Tracking started.');
                break;
            }

            case 'disconnect': {
                await context.secrets.delete(SECRET_SUPABASE_URL);
                await context.secrets.delete(SECRET_SUPABASE_KEY);
                clearSupabaseConfig();
                client.reset();
                vscode.window.showInformationMessage('DevTracker: Disconnected.');
                break;
            }

            case 'openExternal': {
                const url = String(msg.url ?? '');
                try {
                    vscode.env.openExternal(vscode.Uri.parse(url));
                } catch {
                    // invalid URL, ignore
                }
                break;
            }
        }
    });

    // The core debounces, so we just forward every editor event.
    function reportActivity(doc: vscode.TextDocument): void {
        if (doc.uri.scheme !== 'file') return;
        client.activity(doc.uri.fsPath, mapLanguageId(doc.languageId));
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => reportActivity(e.document)),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) reportActivity(editor.document);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devtracker.setStatus', async () => {
            const creds = await getSupabaseCredentials(context);
            if (!creds) return;

            const message = await vscode.window.showInputBox({
                prompt: 'Set your DevTracker status message',
                placeHolder: 'What are you working on?',
                validateInput: (v) => (v.length > 100 ? 'Max 100 characters' : null),
            });

            if (message === undefined) return;
            client.setStatus(message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devtracker.showCodingTime', () => {
            const state = client.getState();
            vscode.window.showInformationMessage(`DevTracker: ${state.codingTime} today`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devtracker.toggleDebug', async () => {
            const current = isDebugEnabled();
            const pick = await vscode.window.showQuickPick(['true', 'false'], {
                title: 'DevTracker Debug',
                placeHolder: `current value: ${current}`,
            });
            if (pick === undefined) return;
            const enabled = pick === 'true';
            setDebug(enabled);
            vscode.window.showInformationMessage(
                `DevTracker: debug ${enabled ? 'enabled' : 'disabled'}. Restart tracking to apply.`,
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devtracker.openLogFile', async () => {
            const p = logPath();
            if (!fs.existsSync(p)) {
                vscode.window.showInformationMessage(
                    'DevTracker: log file is empty. Enable debug first (DevTracker: Debug → true).',
                );
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devtracker.openConfigFile', async () => {
            const p = configPath();
            if (!fs.existsSync(p)) {
                vscode.window.showWarningMessage(
                    'DevTracker: no config file yet. Run setup first.',
                );
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    const savedConfig = vscode.workspace.getConfiguration('devtracker');
    const creds = await getSupabaseCredentials(context);
    const trackingEnabled = savedConfig.get<boolean>('trackingEnabled', true);

    if (creds && trackingEnabled) {
        initSupabase(creds.url, creds.key);
        client.init();
        client.start();
    } else if (creds) {
        initSupabase(creds.url, creds.key);
        client.init();
        sidebar.updateState(client.getState());
    } else {
        sidebar.updateState(client.getState());
    }

    log.info('DevGlobe activated.');
}

export function deactivate(): void {
    // CoreClient.dispose() handles cleanup via context.subscriptions.
}
