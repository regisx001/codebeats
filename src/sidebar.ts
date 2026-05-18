import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TrackerState } from './core-client';
import { InsightsPayload, LangStat } from './supabase';

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

    postInsights(data: InsightsPayload): void {
        this.view?.webview.postMessage({ type: 'insights', data });
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
    .lang-icon {
        width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .lang-icon svg { width: 14px; height: 14px; display: block; }
    .lang-name {
        font-size: 11px;
        font-weight: 600;
        min-width: 64px;
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

    /* ── Insights ─────────────────────────────────────────────── */
    .insights-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }
    .insight-card {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-widget-border, #333);
        border-radius: 6px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-height: 54px;
    }
    .insight-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: var(--vscode-descriptionForeground);
    }
    .insight-value {
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .insight-sub {
        font-size: 10px;
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .insights-details {
        margin-top: 8px;
    }
    .insights-details summary {
        cursor: pointer;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        user-select: none;
    }
    .insights-list {
        margin-top: 6px;
    }
    .insight-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
    }
    .insight-item-name {
        font-size: 11px;
        min-width: 72px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
    }
    .insight-bar-wrap {
        flex: 1;
        height: 4px;
        background: var(--vscode-input-background);
        border-radius: 3px;
        overflow: hidden;
    }
    .insight-bar {
        height: 100%;
        border-radius: 3px;
    }
    .insight-item-time {
        font-size: 10px;
        opacity: 0.7;
        min-width: 42px;
        text-align: right;
        flex-shrink: 0;
    }
    .insights-status {
        margin-top: 8px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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

    <div class="section">
        <h3>Insights</h3>
        <div class="insights-grid">
            <div class="insight-card">
                <div class="insight-label">Top project</div>
                <div class="insight-value" id="insight-top-project">—</div>
                <div class="insight-sub" id="insight-top-project-time">—</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Top language</div>
                <div class="insight-value" id="insight-top-lang">—</div>
                <div class="insight-sub" id="insight-top-lang-time">—</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Peak hour</div>
                <div class="insight-value" id="insight-peak-hour">—</div>
                <div class="insight-sub" id="insight-peak-hour-time">—</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Period change</div>
                <div class="insight-value" id="insight-delta">—</div>
                <div class="insight-sub" id="insight-period-total">—</div>
            </div>
        </div>
        <details class="insights-details" id="insights-projects-details">
            <summary>Top projects</summary>
            <div class="insights-list" id="insights-projects-list"></div>
        </details>
        <div class="insights-status" id="insights-status">—</div>
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
    const insightTopProject = document.getElementById('insight-top-project');
    const insightTopProjectTime = document.getElementById('insight-top-project-time');
    const insightTopLang = document.getElementById('insight-top-lang');
    const insightTopLangTime = document.getElementById('insight-top-lang-time');
    const insightPeakHour = document.getElementById('insight-peak-hour');
    const insightPeakHourTime = document.getElementById('insight-peak-hour-time');
    const insightDelta = document.getElementById('insight-delta');
    const insightPeriodTotal = document.getElementById('insight-period-total');
    const insightsProjectsDetails = document.getElementById('insights-projects-details');
    const insightsProjectsList = document.getElementById('insights-projects-list');
    const insightsStatus = document.getElementById('insights-status');

    let toastTimer = null;
    let activeFilter = 'today';

    // ── Colour palette for language bars ─────────────────────
    const PALETTE = [
        '#4e79a7','#f28e2b','#e15759','#76b7b2',
        '#59a14f','#edc948','#b07aa1','#ff9da7',
        '#9c755f','#bab0ac',
    ];

    const LANG_ICON_MAP = {
        'TypeScript': { text: 'TS', color: '#3178c6', textColor: '#ffffff' },
        'JavaScript': { text: 'JS', color: '#f7df1e', textColor: '#111111' },
        'React JSX': { text: 'JSX', color: '#61dafb', textColor: '#111111' },
        'React TSX': { text: 'TSX', color: '#61dafb', textColor: '#111111' },
        'Python': { text: 'PY', color: '#3776ab', textColor: '#ffffff' },
        'Go': { text: 'GO', color: '#00add8', textColor: '#ffffff' },
        'Rust': { text: 'RS', color: '#f74c00', textColor: '#ffffff' },
        'Java': { text: 'JV', color: '#ea2d2e', textColor: '#ffffff' },
        'Kotlin': { text: 'KT', color: '#7f52ff', textColor: '#ffffff' },
        'C#': { text: 'C#', color: '#9b4f96', textColor: '#ffffff' },
        'C++': { text: 'C+', color: '#00599c', textColor: '#ffffff' },
        'C': { text: 'C', color: '#5c6bc0', textColor: '#ffffff' },
        'HTML': { text: 'HT', color: '#e34f26', textColor: '#ffffff' },
        'CSS': { text: 'CS', color: '#1572b6', textColor: '#ffffff' },
        'SCSS': { text: 'SC', color: '#c6538c', textColor: '#ffffff' },
        'SQL': { text: 'SQL', color: '#4479a1', textColor: '#ffffff' },
        'Markdown': { text: 'MD', color: '#0f8ccf', textColor: '#ffffff' },
        'JSON': { text: '{}', color: '#9e9e9e', textColor: '#111111' },
        'YAML': { text: 'Y', color: '#cb171e', textColor: '#ffffff' },
        'Docker': { text: 'DK', color: '#0db7ed', textColor: '#111111' },
        'Bash': { text: '$', color: '#4eaa25', textColor: '#ffffff' },
        'Shell': { text: '$', color: '#4eaa25', textColor: '#ffffff' },
        'PHP': { text: 'PHP', color: '#777bb4', textColor: '#ffffff' },
        'Ruby': { text: 'RB', color: '#cc342d', textColor: '#ffffff' },
        'Swift': { text: 'SW', color: '#f05138', textColor: '#ffffff' },
        'Dart': { text: 'DT', color: '#0175c2', textColor: '#ffffff' },
        'Vue': { text: 'VU', color: '#42b883', textColor: '#ffffff' },
        'Svelte': { text: 'SV', color: '#ff3e00', textColor: '#ffffff' },
        'Astro': { text: 'AS', color: '#ff5d01', textColor: '#ffffff' },
    };

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

    function fmtHourRange(hour) {
        const start = String(hour).padStart(2, '0');
        const end = String((hour + 1) % 24).padStart(2, '0');
        return start + ':00-' + end + ':00';
    }

    function fmtRelativeTime(iso) {
        const t = new Date(iso).getTime();
        if (!t || Number.isNaN(t)) return '';
        const minutes = Math.floor((Date.now() - t) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        return days + 'd ago';
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getLangIconSvg(language) {
        const fallbackText = String(language || '').slice(0, 2).toUpperCase() || '--';
        const info = LANG_ICON_MAP[language] || { text: fallbackText, color: '#6c757d', textColor: '#ffffff' };
        const label = escapeHtml(info.text);
        return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
            '<rect x="1" y="1" width="18" height="18" rx="4" fill="' + info.color + '" />' +
            '<text x="10" y="12.5" text-anchor="middle" font-size="8" font-weight="700" fill="' + info.textColor + '" font-family="var(--vscode-font-family, sans-serif)">' + label + '</text>' +
        '</svg>';
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
        requestInsights(activeFilter);
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
            const icon = getLangIconSvg(item.language);
            const langLabel = escapeHtml(item.language);
            return '<div class="lang-row">' +
                '<span class="lang-icon" title="' + langLabel + '">' + icon + '</span>' +
                '<span class="lang-name" title="' + langLabel + '">' + langLabel + '</span>' +
                '<div class="lang-bar-wrap">' +
                    '<div class="lang-bar" style="width:' + pct + '%;background:' + color + '"></div>' +
                '</div>' +
                '<span class="lang-time">' + fmtTime(item.seconds) + '</span>' +
            '</div>';
        }).join('');
    }

    function showInsightsLoading() {
        if (!insightTopProject) return;
        insightTopProject.textContent = 'Loading...';
        insightTopProjectTime.textContent = '';
        insightTopLang.textContent = 'Loading...';
        insightTopLangTime.textContent = '';
        insightPeakHour.textContent = 'Loading...';
        insightPeakHourTime.textContent = '';
        insightDelta.textContent = 'Loading...';
        insightPeriodTotal.textContent = '';
        insightsProjectsList.innerHTML = '';
        insightsProjectsDetails.classList.add('hidden');
        insightsStatus.textContent = 'Loading...';
    }

    function renderInsights(data) {
        if (!data) return;

        const topProject = data.topProject || null;
        if (topProject) {
            insightTopProject.textContent = topProject.project;
            insightTopProject.title = topProject.project;
            insightTopProjectTime.textContent = fmtTime(topProject.seconds);
        } else {
            insightTopProject.textContent = '—';
            insightTopProject.title = '';
            insightTopProjectTime.textContent = '—';
        }

        const topLang = data.topLanguage || null;
        if (topLang) {
            const langLabel = escapeHtml(topLang.language);
            const icon = getLangIconSvg(topLang.language);
            insightTopLang.innerHTML = '<span class="lang-icon">' + icon + '</span><span>' + langLabel + '</span>';
            insightTopLang.title = topLang.language;
            insightTopLangTime.textContent = fmtTime(topLang.seconds);
        } else {
            insightTopLang.textContent = '—';
            insightTopLang.title = '';
            insightTopLangTime.textContent = '—';
        }

        const peak = data.peakHour || null;
        if (peak) {
            insightPeakHour.textContent = fmtHourRange(peak.hour);
            insightPeakHourTime.textContent = fmtTime(peak.seconds);
        } else {
            insightPeakHour.textContent = '—';
            insightPeakHourTime.textContent = '—';
        }

        if (typeof data.periodDeltaPct === 'number') {
            const rounded = Math.round(data.periodDeltaPct);
            const sign = rounded > 0 ? '+' : '';
            insightDelta.textContent = sign + rounded + '%';
        } else {
            insightDelta.textContent = '—';
        }

        const totalLabel = 'Total ' + fmtTime(data.periodTotalSeconds || 0);
        if (data.periodDeltaLabel) {
            insightPeriodTotal.textContent = totalLabel + ' | ' + data.periodDeltaLabel;
        } else {
            insightPeriodTotal.textContent = totalLabel;
        }

        const topProjects = Array.isArray(data.topProjects) ? data.topProjects : [];
        if (topProjects.length > 0) {
            const max = topProjects[0].seconds || 1;
            insightsProjectsList.innerHTML = topProjects.map((item, i) => {
                const pct = Math.round((item.seconds / max) * 100);
                const color = PALETTE[i % PALETTE.length];
                const name = escapeHtml(item.project);
                return '<div class="insight-item">' +
                    '<span class="insight-item-name" title="' + name + '">' + name + '</span>' +
                    '<div class="insight-bar-wrap">' +
                        '<div class="insight-bar" style="width:' + pct + '%;background:' + color + '"></div>' +
                    '</div>' +
                    '<span class="insight-item-time">' + fmtTime(item.seconds) + '</span>' +
                '</div>';
            }).join('');
            insightsProjectsDetails.classList.remove('hidden');
        } else {
            insightsProjectsList.innerHTML = '';
            insightsProjectsDetails.classList.add('hidden');
        }

        const recent = Array.isArray(data.recentStatus) ? data.recentStatus : [];
        if (recent.length > 0) {
            const latest = recent[0];
            const rel = fmtRelativeTime(latest.created_at);
            const label = 'Recent: ' + latest.message + (rel ? ' (' + rel + ')' : '');
            insightsStatus.textContent = label;
            insightsStatus.title = latest.message;
        } else {
            insightsStatus.textContent = 'No recent status messages.';
            insightsStatus.title = '';
        }
    }

    function requestLeaderboard(filter) {
        leaderboardEl.innerHTML = '<div class="leaderboard-loading">Loading…</div>';
        vscode.postMessage({ type: 'fetchLeaderboard', filter });
    }

    function requestInsights(filter) {
        showInsightsLoading();
        vscode.postMessage({ type: 'fetchInsights', filter });
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
            requestInsights(activeFilter);
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
        if (msg.type === 'insights') {
            renderInsights(msg.data);
        }
    });
</script>
</body>
</html>`;
    }
}
