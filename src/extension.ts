import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initLogger, log } from './logger';
import { CoreClient, mapLanguageId } from './core-client';
import { DevGlobeSidebarProvider } from './sidebar';
import {
    writeApiKey,
    clearApiKey,
    setDebug,
    isDebugEnabled,
    configPath,
    logPath,
} from './config-writer';

const SECRET_API_KEY = 'devglobe.apiKey';

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
 * Retrieves the API key, migrating from old storage locations if needed.
 * Priority: secure storage → settings.json (legacy). Once found, writes to
 * ~/.devglobe/config.toml so the core can pick it up.
 */
async function getAndMigrateApiKey(context: vscode.ExtensionContext): Promise<string> {
    const stored = await context.secrets.get(SECRET_API_KEY);
    if (stored) {
        writeApiKey(stored);
        return stored;
    }

    const config = vscode.workspace.getConfiguration('devglobe');
    const legacy = config.get<string>('apiKey', '');
    if (legacy) {
        await context.secrets.store(SECRET_API_KEY, legacy);
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
        writeApiKey(legacy);
        log.info('API key migrated from settings.json to secure storage + config.toml');
        return legacy;
    }
    return '';
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    initLogger(context.extensionMode === vscode.ExtensionMode.Development);
    log.info('DevGlobe activating…');

    const pluginVersion = getPluginVersion(context);

    const sidebar = new DevGlobeSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DevGlobeSidebarProvider.viewType,
            sidebar,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    const onInvalidApiKey = async (): Promise<void> => {
        await context.secrets.delete(SECRET_API_KEY);
        clearApiKey();
        log.info('API key cleared after server rejected it (401)');
    };

    const client = new CoreClient(
        context,
        (state) => sidebar.updateState(state),
        pluginVersion,
        () => { void onInvalidApiKey(); },
    );
    sidebar.setStateGetter(() => client.getState());

    sidebar.setMessageHandler(async (msg) => {
        const config = vscode.workspace.getConfiguration('devglobe');

        switch (msg.type as string) {
            case 'saveToken': {
                const token = String(msg.token ?? '').trim();
                if (!token) {
                    vscode.window.showErrorMessage('DevGlobe: API key is empty.');
                    break;
                }
                await context.secrets.store(SECRET_API_KEY, token);
                writeApiKey(token);
                client.init();
                client.start();
                sidebar.updateState(client.getState());
                vscode.window.showInformationMessage('DevGlobe: Connected!');
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
                vscode.window.showInformationMessage('DevGlobe: Tracking stopped.');
                break;
            }

            case 'startTracking': {
                const apiKey = await getAndMigrateApiKey(context);
                if (!apiKey) break;
                await config.update('trackingEnabled', true, vscode.ConfigurationTarget.Global);
                client.init();
                client.start();
                vscode.window.showInformationMessage('DevGlobe: Tracking started.');
                break;
            }

            case 'disconnect': {
                await context.secrets.delete(SECRET_API_KEY);
                clearApiKey();
                client.reset();
                vscode.window.showInformationMessage('DevGlobe: Disconnected.');
                break;
            }

            case 'openExternal': {
                const url = String(msg.url ?? '');
                try {
                    const parsed = vscode.Uri.parse(url);
                    if (parsed.scheme === 'https' && parsed.authority.endsWith('devglobe.xyz')) {
                        vscode.env.openExternal(parsed);
                    }
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
        vscode.commands.registerCommand('devglobe.setStatus', async () => {
            const apiKey = await getAndMigrateApiKey(context);
            if (!apiKey) return;

            const message = await vscode.window.showInputBox({
                prompt: 'Set your DevGlobe status message',
                placeHolder: 'What are you working on?',
                validateInput: (v) => (v.length > 100 ? 'Max 100 characters' : null),
            });

            if (message === undefined) return;
            client.setStatus(message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devglobe.showCodingTime', () => {
            const state = client.getState();
            vscode.window.showInformationMessage(`DevGlobe: ${state.codingTime} today`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devglobe.openGlobe', () => {
            vscode.env.openExternal(vscode.Uri.parse('https://devglobe.xyz/space'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devglobe.toggleDebug', async () => {
            const current = isDebugEnabled();
            const pick = await vscode.window.showQuickPick(['true', 'false'], {
                title: 'DevGlobe Debug',
                placeHolder: `current value: ${current}`,
            });
            if (pick === undefined) return;
            const enabled = pick === 'true';
            setDebug(enabled);
            vscode.window.showInformationMessage(
                `DevGlobe: debug ${enabled ? 'enabled' : 'disabled'}. Restart tracking to apply.`,
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devglobe.openLogFile', async () => {
            const p = logPath();
            if (!fs.existsSync(p)) {
                vscode.window.showInformationMessage(
                    'DevGlobe: log file is empty. Enable debug first (DevGlobe: Debug → true).',
                );
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devglobe.openConfigFile', async () => {
            const p = configPath();
            if (!fs.existsSync(p)) {
                vscode.window.showWarningMessage(
                    'DevGlobe: no config file yet. Run setup first.',
                );
                return;
            }
            await vscode.window.showTextDocument(vscode.Uri.file(p));
        })
    );

    const savedConfig = vscode.workspace.getConfiguration('devglobe');
    const apiKey = await getAndMigrateApiKey(context);
    const trackingEnabled = savedConfig.get<boolean>('trackingEnabled', true);

    if (apiKey && trackingEnabled) {
        client.init();
        client.start();
    } else if (apiKey) {
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
