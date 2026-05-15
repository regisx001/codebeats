import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TrackerState } from './core-client';
import { LangStat } from './supabase';

type MessageHandler = (msg: Record<string, unknown>) => void;
type StateGetter = () => TrackerState;

/**
 * Provides the CodeBeats sidebar webview.
 *
 * Communication: `updateState(state)` and `postLeaderboard(data)` push data
 * into the webview; the webview sends messages back through `vscode.postMessage()`
 * handled via `setMessageHandler()`.
 */
export class CodeBeatsSidebarProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'codebeats.sidebarView';

    private view: vscode.WebviewView | null = null;
    private messageHandler: MessageHandler | null = null;
    private stateGetter: StateGetter | null = null;

    constructor(private readonly extensionUri: vscode.Uri) { }

    setMessageHandler(handler: MessageHandler): void {
        this.messageHandler = handler;
    }

    setStateGetter(getter: StateGetter): void {
        this.stateGetter = getter;
    }

    updateState(data: TrackerState): void {
        this.view?.webview.postMessage({ type: 'state', ...data });
    }

    postLeaderboard(data: LangStat[]): void {
        this.view?.webview.postMessage({ type: 'leaderboard', data });
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
        };

        const nonce = crypto.randomBytes(16).toString('base64');
        webviewView.webview.html = this.getHtml(nonce);

        webviewView.webview.onDidReceiveMessage((msg: Record<string, unknown>) => {
            if (msg.type === 'ready') {
                if (this.stateGetter) this.updateState(this.stateGetter());
                return;
            }
            this.messageHandler?.(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.stateGetter) {
                this.updateState(this.stateGetter());
            }
        });
    }

    private getHtml(nonce: string): string {
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    /* ── Reset ────────────────────────────────────────────────── */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
        padding: 12px;
        opacity: 0;
        transition: opacity 0.2s ease;
    }
    body.ready { opacity: 1; }

    /* ── Typography ───────────────────────────────────────────── */
    h3 {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--vscode-sideBarSectionHeader-foreground);
        margin-bottom: 10px;
    }

    /* ── Sections ─────────────────────────────────────────────── */
    .section { margin-bottom: 18px; }
    .separator {
        border: none;
        border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, #333));
        margin: 14px 0;
    }

    /* ── Inputs ───────────────────────────────────────────────── */
    .field-label { font-size: 10px; opacity: 0.7; margin-bottom: 4px; display: block; }
    input[type="password"], input[type="text"] {
        width: 100%;
        padding: 5px 8px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 3px;
        outline: none;
        font-size: var(--vscode-font-size);
        font-family: var(--vscode-font-family);
    }
    input:focus { border-color: var(--vscode-focusBorder); }

    /* ── Buttons ──────────────────────────────────────────────── */
    button {
        width: 100%;
        padding: 5px 12px;
        margin-top: 6px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: var(--vscode-font-size);
        font-family: var(--vscode-font-family);
        transition: background 0.15s;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.danger { background: rgba(220, 53, 69, 0.15); color: #dc3545; margin-top: 0; }
    button.danger:hover { background: rgba(220, 53, 69, 0.28); }
    button:disabled { opacity: 0.35; cursor: not-allowed; }

    /* ── Status badge ─────────────────────────────────────────── */
    .status-badge {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
        background: var(--vscode-input-background);
        border-radius: 5px;
        margin-bottom: 12px;
    }
    .status-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #6c757d;
        transition: background 0.3s;
    }
    .status-dot.connected { background: #28a745; box-shadow: 0 0 5px rgba(40,167,69,0.5); }
    .status-dot.paused    { background: #ffc107; box-shadow: 0 0 5px rgba(255,193,7,0.4); }
    .status-label { font-size: 11px; font-weight: 600; }
    .status-sublabel { font-size: 10px; opacity: 0.6; margin-left: auto; }

    /* ── Stat rows ────────────────────────────────────────────── */
    .stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 12px;
    }
    .stat-label { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .stat-value { font-weight: 600; font-size: 12px; }
    .stat-mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; opacity: 0.8; }

    /* ── Tracking toggle buttons ──────────────────────────────── */
    .track-row { display: flex; gap: 6px; margin-top: 2px; }
    .track-row button {
        flex: 1; margin-top: 0;
        padding: 4px 8px; font-size: 11px;
    }
    .btn-stop  { background: rgba(220, 53, 69, 0.15)  !important; color: #ff6b7a !important; }
    .btn-stop:hover  { background: rgba(220, 53, 69, 0.28) !important; }
    .btn-start { background: rgba(40, 167, 69, 0.15) !important; color: #4dd87c !important; }
    .btn-start:hover { background: rgba(40, 167, 69, 0.28) !important; }

    /* ── Status message input ─────────────────────────────────── */
    .status-row {
        display: flex;
        align-items: center;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 4px;
        overflow: hidden;
        transition: border-color 0.15s;
    }
    .status-row:focus-within { border-color: var(--vscode-focusBorder); }
    .status-row input {
        flex: 1; background: transparent; border: none; border-radius: 0; padding: 5px 8px;
    }
    .status-row input:focus { border-color: transparent; }
    .status-row button {
        width: auto; margin: 0; padding: 5px 10px; border-radius: 0;
        background: transparent; color: var(--vscode-descriptionForeground);
        font-size: 11px;
    }
    .status-row button:hover { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }

    /* ── Leaderboard ──────────────────────────────────────────── */
    .filter-tabs {
        display: flex;
        gap: 2px;
        background: var(--vscode-input-background);
        border-radius: 5px;
        padding: 2px;
        margin-bottom: 12px;
    }
    .filter-tab {
        flex: 1;
        padding: 3px 0;
        font-size: 10px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        border-radius: 4px;
        color: var(--vscode-descriptionForeground);
        border: none;
        background: transparent;
        margin-top: 0;
        width: auto;
        transition: background 0.15s, color 0.15s;
        letter-spacing: 0.3px;
    }
    .filter-tab:hover { color: var(--vscode-foreground); background: rgba(255,255,255,0.07); }
    .filter-tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }

    .lang-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
    }
    .lang-name {
        font-size: 11px;
        font-weight: 600;
        min-width: 72px;
        flex-shrink: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .lang-bar-wrap {
        flex: 1;
        height: 5px;
        background: var(--vscode-input-background);
        border-radius: 3px;
        overflow: hidden;
    }
    .lang-bar {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
    }
    .lang-time {
        font-size: 10px;
        opacity: 0.7;
        min-width: 42px;
        text-align: right;
        flex-shrink: 0;
    }

    .leaderboard-empty {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        padding: 10px 0;
        opacity: 0.7;
    }

    .leaderboard-loading {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        padding: 8px 0;
        opacity: 0.6;
    }

    /* ── Disconnect link ──────────────────────────────────────── */
    .disconnect-link {
        display: block;
        text-align: center;
        margin-top: 10px;
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.15s, color 0.15s;
    }
    .disconnect-link:hover { opacity: 1; color: #ff6b7a; }

    /* ── Toast ────────────────────────────────────────────────── */
    .toast {
        position: fixed;
        bottom: 10px; left: 10px; right: 10px;
        padding: 7px 10px;
        background: var(--vscode-notificationCenterHeader-background, #2d2d30);
        border: 1px solid var(--vscode-widget-border, #444);
        border-radius: 4px;
        font-size: 11px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.2s, transform 0.2s;
        pointer-events: none;
        z-index: 100;
    }
    .toast.show { opacity: 1; transform: translateY(0); }

    /* ── Link ─────────────────────────────────────────────────── */
    .link {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
        font-size: 11px;
        cursor: pointer;
    }
    .link:hover { text-decoration: underline; }
    .hidden { display: none !important; }
</style>
</head>
<body>

<!-- ── Not connected ──────────────────────────────────────── -->
<div id="login-section">
    <div class="section">
        <h3>Connect to Supabase</h3>
        <div style="margin-bottom: 8px;">
            <label class="field-label" for="supabase-url">Project ID or URL</label>
            <input type="text" id="supabase-url" placeholder="abcdefghijklmnop or https://..." />
        </div>
        <div style="margin-bottom: 8px;">
            <label class="field-label" for="supabase-key">API Key (anon public)</label>
            <input type="password" id="supabase-key" placeholder="eyJhbGci..." />
        </div>
        <button id="connect-btn">Connect</button>
        <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 10px; line-height: 1.5;">
            Get your credentials from the
            <a class="link" id="get-key-link">Supabase Dashboard</a>
            → Project Settings → API.
            <br><br>
            First time? Run
            <a class="link" id="schema-hint-link">schema.sql</a>
            in your SQL Editor.
        </div>
    </div>
</div>

<!-- ── Connected dashboard ────────────────────────────────── -->
<div id="dashboard-section" class="hidden">

    <!-- Status badge -->
    <div class="status-badge">
        <div class="status-dot" id="status-dot"></div>
        <span class="status-label" id="status-label">Tracking</span>
        <span class="status-sublabel" id="status-sublabel"></span>
    </div>

    <!-- Stats -->
    <div class="section">
        <h3>Today</h3>
        <div class="stat-row">
            <span class="stat-label">Coding time</span>
            <span class="stat-value" id="coding-time">0m</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Language</span>
            <span class="stat-value" id="active-lang">—</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Project</span>
            <span class="stat-mono" id="active-project">—</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Branch</span>
            <span class="stat-mono" id="active-branch">—</span>
        </div>
    </div>

    <hr class="separator" />

    <!-- Tracking controls -->
    <div class="section">
        <h3>Tracking</h3>
        <div class="track-row">
            <button class="btn-stop"  id="btn-stop">⏸ Pause</button>
            <button class="btn-start" id="btn-start">▶ Resume</button>
        </div>
    </div>

    <hr class="separator" />

    <!-- Status message -->
    <div class="section">
        <h3>Status Message</h3>
        <div class="status-row">
            <input type="text" id="status-input" placeholder="What are you working on?" maxlength="100" />
            <button id="status-btn">Set</button>
        </div>
    </div>

    <hr class="separator" />

    <!-- Language leaderboard -->
    <div class="section">
        <h3>Languages</h3>
        <div class="filter-tabs">
            <button class="filter-tab active" data-filter="today">Today</button>
            <button class="filter-tab" data-filter="week">Week</button>
            <button class="filter-tab" data-filter="month">Month</button>
            <button class="filter-tab" data-filter="all">All Time</button>
        </div>
        <div id="leaderboard-content">
            <div class="leaderboard-empty">No data yet — start coding!</div>
        </div>
    </div>

    <!-- Disconnect -->
    <a class="disconnect-link" id="disconnect-btn">Disconnect</a>
</div>

<div id="toast" class="toast"></div>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── DOM refs ──────────────────────────────────────────────
    const loginSection     = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const supabaseUrl      = document.getElementById('supabase-url');
    const supabaseKey      = document.getElementById('supabase-key');
    const connectBtn       = document.getElementById('connect-btn');
    const getKeyLink       = document.getElementById('get-key-link');
    const schemaHintLink   = document.getElementById('schema-hint-link');
    const statusDot        = document.getElementById('status-dot');
    const statusLabel      = document.getElementById('status-label');
    const statusSublabel   = document.getElementById('status-sublabel');
    const codingTime       = document.getElementById('coding-time');
    const activeLang       = document.getElementById('active-lang');
    const activeProject    = document.getElementById('active-project');
    const activeBranch     = document.getElementById('active-branch');
    const statusInput      = document.getElementById('status-input');
    const statusBtn        = document.getElementById('status-btn');
    const btnStop          = document.getElementById('btn-stop');
    const btnStart         = document.getElementById('btn-start');
    const disconnectBtn    = document.getElementById('disconnect-btn');
    const leaderboardEl    = document.getElementById('leaderboard-content');
    const filterTabs       = document.querySelectorAll('.filter-tab');
    const toast            = document.getElementById('toast');

    let toastTimer = null;
    let activeFilter = 'today';

    // ── Colour palette for language bars ─────────────────────
    const PALETTE = [
        '#4e79a7','#f28e2b','#e15759','#76b7b2',
        '#59a14f','#edc948','#b07aa1','#ff9da7',
        '#9c755f','#bab0ac',
    ];

    // ── Helpers ───────────────────────────────────────────────
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function fmtTime(seconds) {
        if (seconds < 60)  return seconds + 's';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return h + 'h ' + m + 'm';
        return m + 'm';
    }

    // ── State render ──────────────────────────────────────────
    function renderState(msg) {
        document.body.classList.add('ready');

        if (!msg.configured) {
            loginSection.classList.remove('hidden');
            dashboardSection.classList.add('hidden');
            return;
        }

        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');

        // Status badge
        if (msg.tracking) {
            statusDot.className = 'status-dot connected';
            statusLabel.textContent = 'Tracking';
        } else {
            statusDot.className = 'status-dot paused';
            statusLabel.textContent = 'Paused';
        }
        statusSublabel.textContent = msg.offline ? 'offline' : '';

        codingTime.textContent = msg.codingTime || '0m';
        activeLang.textContent = msg.language   || '—';
        activeProject.textContent = msg.project || '—';
        activeBranch.textContent  = msg.branch  || '—';

        btnStop.disabled  = !msg.tracking;
        btnStart.disabled = !!msg.tracking;

        // Auto-refresh leaderboard on connect
        requestLeaderboard(activeFilter);
    }

    // ── Leaderboard render ────────────────────────────────────
    function renderLeaderboard(data) {
        if (!data || data.length === 0) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">No data — start coding!</div>';
            return;
        }
        const max = data[0].seconds;
        leaderboardEl.innerHTML = data.map((item, i) => {
            const pct = max > 0 ? Math.round((item.seconds / max) * 100) : 0;
            const color = PALETTE[i % PALETTE.length];
            return \`<div class="lang-row">
                <span class="lang-name" title="\${item.language}">\${item.language}</span>
                <div class="lang-bar-wrap">
                    <div class="lang-bar" style="width:\${pct}%;background:\${color}"></div>
                </div>
                <span class="lang-time">\${fmtTime(item.seconds)}</span>
            </div>\`;
        }).join('');
    }

    function requestLeaderboard(filter) {
        leaderboardEl.innerHTML = '<div class="leaderboard-loading">Loading…</div>';
        vscode.postMessage({ type: 'fetchLeaderboard', filter });
    }

    // ── Event listeners ───────────────────────────────────────
    connectBtn.addEventListener('click', () => {
        const url = supabaseUrl.value.trim();
        const key = supabaseKey.value.trim();
        if (!url || !key) { showToast('Please fill both fields'); return; }
        connectBtn.textContent = 'Connecting…';
        connectBtn.disabled = true;
        vscode.postMessage({ type: 'saveConfig', url, key });
    });

    getKeyLink.addEventListener('click', () =>
        vscode.postMessage({ type: 'openExternal', url: 'https://supabase.com/dashboard/project/_/settings/api' })
    );

    schemaHintLink.addEventListener('click', () =>
        vscode.postMessage({ type: 'openSchemaFile' })
    );

    statusBtn.addEventListener('click', () =>
        vscode.postMessage({ type: 'setStatus', message: statusInput.value })
    );
    statusInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') statusBtn.click(); });

    btnStop.addEventListener('click',  () => vscode.postMessage({ type: 'stopTracking' }));
    btnStart.addEventListener('click', () => vscode.postMessage({ type: 'startTracking' }));
    disconnectBtn.addEventListener('click', () => vscode.postMessage({ type: 'disconnect' }));

    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeFilter = tab.dataset.filter;
            requestLeaderboard(activeFilter);
        });
    });

    // ── Message handler ───────────────────────────────────────
    vscode.postMessage({ type: 'ready' });

    window.addEventListener('message', ({ data: msg }) => {
        if (msg.type === 'state') {
            // Reset connect button if it was in loading state
            connectBtn.textContent = 'Connect';
            connectBtn.disabled = false;
            renderState(msg);
        }
        if (msg.type === 'leaderboard') {
            renderLeaderboard(msg.data);
        }
    });
</script>
</body>
</html>`;
    }
}
