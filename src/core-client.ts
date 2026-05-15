import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { log } from './logger';
import { getSupabase, isSupabaseInitialized } from './supabase';

export interface TrackerState {
    configured: boolean;
    tracking: boolean;
    codingTime: string;
    todaySeconds: number;
    language: string | null;
    offline: boolean;
}

export const DEFAULT_STATE: TrackerState = {
    configured: false,
    tracking: false,
    codingTime: '0m',
    todaySeconds: 0,
    language: null,
    offline: false,
};

const LANG_MAP: Record<string, string> = {
    javascript: 'JavaScript', typescript: 'TypeScript',
    javascriptreact: 'React JSX', typescriptreact: 'React TSX',
    vue: 'Vue', svelte: 'Svelte', astro: 'Astro', angular: 'Angular',
    html: 'HTML', css: 'CSS', sass: 'Sass', scss: 'SCSS', less: 'Less', stylus: 'Stylus',
    graphql: 'GraphQL', mdx: 'MDX',
    handlebars: 'Handlebars', pug: 'Pug', jade: 'Pug', ejs: 'EJS',
    erb: 'ERB', haml: 'Haml', twig: 'Twig', blade: 'Blade',
    'django-html': 'Django', jinja: 'Jinja', liquid: 'Liquid', mustache: 'Mustache',
    razor: 'Razor', nunjucks: 'Nunjucks',
    c: 'C', cpp: 'C++', rust: 'Rust', go: 'Go', zig: 'Zig', d: 'D',
    v: 'V', odin: 'Odin', carbon: 'Carbon', mojo: 'Mojo',
    java: 'Java', kotlin: 'Kotlin', scala: 'Scala', groovy: 'Groovy',
    csharp: 'C#', fsharp: 'F#', vb: 'Visual Basic',
    python: 'Python', ruby: 'Ruby', php: 'PHP', lua: 'Lua', perl: 'Perl',
    r: 'R', julia: 'Julia', matlab: 'MATLAB',
    swift: 'Swift', dart: 'Dart', 'objective-c': 'Objective-C', 'objective-cpp': 'Objective-C++',
    haskell: 'Haskell', elixir: 'Elixir', erlang: 'Erlang', ocaml: 'OCaml',
    elm: 'Elm', purescript: 'PureScript', clojure: 'Clojure', racket: 'Racket',
    scheme: 'Scheme', commonlisp: 'Common Lisp', prolog: 'Prolog',
    gleam: 'Gleam', roc: 'Roc', idris: 'Idris', agda: 'Agda', lean: 'Lean', coq: 'Coq',
    nim: 'Nim', crystal: 'Crystal', haxe: 'Haxe',
    ada: 'Ada', fortran: 'Fortran', pascal: 'Pascal', cobol: 'COBOL',
    vhdl: 'VHDL', verilog: 'Verilog', systemverilog: 'SystemVerilog',
    asm: 'Assembly', 'arm64': 'ARM64', cuda: 'CUDA',
    glsl: 'GLSL', hlsl: 'HLSL', wgsl: 'WGSL', metal: 'Metal', shaderlab: 'ShaderLab',
    shellscript: 'Bash', powershell: 'PowerShell', fish: 'Fish', bat: 'Batch',
    terraform: 'Terraform', bicep: 'Bicep', pulumi: 'Pulumi',
    nix: 'Nix', ansible: 'Ansible', puppet: 'Puppet',
    dockerfile: 'Docker', 'docker-compose': 'Docker Compose',
    makefile: 'Makefile', cmake: 'CMake', just: 'Just', meson: 'Meson',
    sql: 'SQL', plsql: 'PL/SQL', mysql: 'MySQL', pgsql: 'PostgreSQL',
    mongodb: 'MongoDB', redis: 'Redis', cypher: 'Cypher', sparql: 'SPARQL',
    prisma: 'Prisma',
    solidity: 'Solidity', vyper: 'Vyper', move: 'Move', cairo: 'Cairo',
    gdscript: 'GDScript', 'gdresource': 'Godot Resource', 'gdshader': 'Godot Shader',
    json: 'JSON', jsonc: 'JSON', jsonnet: 'Jsonnet',
    yaml: 'YAML', toml: 'TOML', xml: 'XML', ini: 'INI',
    dotenv: 'Config', properties: 'Config',
    csv: 'CSV', tsv: 'TSV',
    cue: 'CUE', dhall: 'Dhall', pkl: 'Pkl',
    proto: 'Protobuf', protobuf: 'Protobuf', thrift: 'Thrift', avro: 'Avro',
    markdown: 'Markdown', restructuredtext: 'reStructuredText',
    latex: 'LaTeX', tex: 'LaTeX', bibtex: 'BibTeX', typst: 'Typst',
    asciidoc: 'AsciiDoc', plaintext: 'Plain Text',
    coffeescript: 'CoffeeScript', tcl: 'Tcl', awk: 'AWK', sed: 'Sed',
    regex: 'Regex', diff: 'Diff', 'git-commit': 'Git Commit', 'git-rebase': 'Git Rebase',
    ignore: 'Gitignore', editorconfig: 'EditorConfig',
    http: 'HTTP', ssh_config: 'SSH Config',
    log: 'Log',
};

export function mapLanguageId(id: string): string {
    return LANG_MAP[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function detectEditor(): string {
    const name = vscode.env.appName.toLowerCase();
    if (name.includes('cursor')) return 'cursor';
    if (name.includes('windsurf')) return 'windsurf';
    if (name.includes('vscodium')) return 'vscodium';
    if (name.includes('positron')) return 'positron';
    if (name.includes('void')) return 'void';
    if (name.includes('antigravity')) return 'antigravity';
    return 'vscode';
}

function getGitInfo(filePath: string): { project?: string; remote?: string; branch?: string; relativePath?: string } {
    try {
        const dir = path.dirname(filePath);
        const root = execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8', timeout: 5000 }).trim();
        const project = path.basename(root);

        let remote: string | undefined;
        try {
            remote = execSync('git remote get-url origin', { cwd: dir, encoding: 'utf8', timeout: 5000 }).trim();
        } catch {
            // No remote configured — that's fine
        }

        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf8', timeout: 5000 }).trim();
        const relativePath = path.relative(root, filePath);
        return { project, remote, branch, relativePath };
    } catch {
        return {};
    }
}

function getMachineUserId(): string {
    const machineId = vscode.env.machineId;
    const hash = crypto.createHash('sha256').update(machineId).update('devtracker-salt').digest('hex');
    // Format as UUID v4-like string
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export class CoreClient implements vscode.Disposable {
    private state: TrackerState = { ...DEFAULT_STATE };
    private statusBarItem: vscode.StatusBarItem | null = null;
    private lastHeartbeat: number = 0;
    private readonly heartbeatInterval: number = 30_000; // 30 seconds
    private timer: NodeJS.Timeout | null = null;
    private readonly userId: string = getMachineUserId();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly onStateChange: (state: TrackerState) => void,
        private readonly pluginVersion: string,
        private readonly onInvalidConfig: () => void = () => { },
    ) {
        context.subscriptions.push(this);
        log.info(`Machine user ID: ${this.userId}`);
    }

    dispose(): void {
        this.pause();
        this.statusBarItem?.dispose();
    }

    getState(): TrackerState {
        return { ...this.state };
    }

    getUserId(): string {
        return this.userId;
    }

    init(): void {
        this.state.configured = isSupabaseInitialized();
        this.onStateChange(this.state);
        if (this.state.configured) {
            void this.fetchTodayStats();
        }
    }

    async fetchTodayStats(): Promise<void> {
        if (!isSupabaseInitialized()) return;
        try {
            const supabase = getSupabase();
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('daily_stats')
                .select('total_seconds, primary_language')
                .eq('user_id', this.userId)
                .eq('date', today)
                .maybeSingle();

            if (error) {
                log.warn('Failed to fetch today stats:', error.message);
                return;
            }

            if (data) {
                this.state.todaySeconds = data.total_seconds;
                this.state.language = data.primary_language;
                this.updateStatusBarTime(data.total_seconds);
                this.onStateChange(this.state);
            }
        } catch (err) {
            log.error('Failed to fetch stats:', err);
        }
    }

    start(): void {
        this.ensureStatusBar();
        this.state.tracking = true;
        this.onStateChange(this.state);

        // Local timer to keep the status bar ticking between heartbeats
        this.timer = setInterval(() => {
            if (Date.now() - this.lastHeartbeat < 120_000) {
                this.state.todaySeconds += 60;
                this.updateStatusBarTime(this.state.todaySeconds);
                this.onStateChange(this.state);
            }
        }, 60_000);
    }

    pause(): void {
        this.state.tracking = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.statusBarItem?.hide();
        this.onStateChange(this.state);
    }

    async activity(filePath: string, language?: string): Promise<void> {
        if (!this.state.tracking) {
            return;
        }
        if (!isSupabaseInitialized()) {
            log.warn('Activity ignored: Supabase not initialized');
            return;
        }

        const now = Date.now();
        if (now - this.lastHeartbeat < this.heartbeatInterval) return;

        this.lastHeartbeat = now;
        this.state.language = language || null;

        const git = getGitInfo(filePath);
        const supabase = getSupabase();

        try {
            // 1. Upsert project (only if inside a git repo)
            let projectId: string | null = null;
            if (git.project) {
                log.debug(`Syncing project: ${git.project} (remote: ${git.remote ?? 'none'})`);
                const upsertPayload: Record<string, unknown> = { name: git.project };
                if (git.remote) {
                    upsertPayload.remote_url = git.remote;
                }

                const { data: project, error: pError } = await supabase
                    .from('projects')
                    .upsert(upsertPayload, { onConflict: git.remote ? 'remote_url' : 'name' })
                    .select('id')
                    .single();

                if (pError) {
                    log.error('Project upsert failed:', pError.message);
                } else {
                    projectId = project?.id || null;
                }
            }

            // 2. Insert heartbeat
            const { error: hError } = await supabase.from('heartbeats').insert({
                user_id: this.userId,
                project_id: projectId,
                language: language || null,
                file_path: git.relativePath || path.basename(filePath),
                branch: git.branch || null,
                editor: detectEditor(),
                os: process.platform,
            });

            if (hError) {
                log.error('Heartbeat insert failed:', hError.message);
                return;
            }

            // 3. Update daily stats
            const today = new Date().toISOString().split('T')[0];
            const { data: stats } = await supabase
                .from('daily_stats')
                .select('total_seconds')
                .eq('user_id', this.userId)
                .eq('date', today)
                .maybeSingle();

            const newTotal = (stats?.total_seconds || 0) + 30;
            const { error: sError } = await supabase.from('daily_stats').upsert({
                user_id: this.userId,
                date: today,
                total_seconds: newTotal,
                primary_language: language || null,
            }, { onConflict: 'user_id,date' });

            if (sError) {
                log.error('Stats upsert failed:', sError.message);
            }

            log.info(`Heartbeat OK — ${git.project || 'unknown'}/${git.branch || '?'} — ${language || '?'} — ${newTotal}s today`);
            this.state.todaySeconds = newTotal;
            this.updateStatusBarTime(newTotal);
            this.onStateChange(this.state);
        } catch (err) {
            log.error('Heartbeat failed:', err);
        }
    }

    setStatus(message: string): void {
        vscode.window.showInformationMessage(`DevTracker: Status set to "${message}"`);
    }

    reset(): void {
        this.pause();
        this.state = { ...DEFAULT_STATE };
        this.statusBarItem?.hide();
        this.onStateChange(this.state);
    }

    private ensureStatusBar(): void {
        if (this.statusBarItem) {
            this.statusBarItem.show();
            return;
        }
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.tooltip = 'DevTracker: Coding time today';
        this.statusBarItem.text = '$(clock) 0m';
        this.statusBarItem.show();
        this.context.subscriptions.push(this.statusBarItem);
    }

    private updateStatusBarTime(todaySeconds: number): void {
        if (!this.statusBarItem) return;
        const h = Math.floor(todaySeconds / 3600);
        const m = Math.floor((todaySeconds % 3600) / 60);
        const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
        this.state.codingTime = label;
        this.statusBarItem.text = `$(clock) ${label}`;
        this.statusBarItem.tooltip = `DevTracker: ${label} coded today`;
        this.statusBarItem.show();
    }
}
