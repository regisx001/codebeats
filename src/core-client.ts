import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import * as path from 'path';
import { log } from './logger';

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

type CoreEvent =
    | { event: 'ready'; data: { configured: boolean } }
    | { event: 'not_configured' }
    | { event: 'invalid_api_key' }
    | { event: 'heartbeat_ok'; data: { today_seconds: number; language: string | null } }
    | { event: 'offline' }
    | { event: 'online' }
    | { event: 'status_ok' }
    | { event: 'status_error'; data: { message: string } };

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
    if (name.includes('cursor'))       return 'cursor';
    if (name.includes('windsurf'))     return 'windsurf';
    if (name.includes('vscodium'))     return 'vscodium';
    if (name.includes('positron'))     return 'positron';
    if (name.includes('void'))         return 'void';
    if (name.includes('antigravity'))  return 'antigravity';
    return 'vscode';
}

export class CoreClient implements vscode.Disposable {
    private proc: ChildProcess | null = null;
    private rl: Interface | null = null;
    private state: TrackerState = { ...DEFAULT_STATE };
    private statusBarItem: vscode.StatusBarItem | null = null;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly onStateChange: (state: TrackerState) => void,
        private readonly pluginVersion: string,
        private readonly onInvalidApiKey: () => void = () => {},
    ) {
        context.subscriptions.push(this);
    }

    dispose(): void {
        this.tearDownProcess();
        this.statusBarItem?.dispose();
    }

    private tearDownProcess(): void {
        this.send({ method: 'shutdown' });
        this.proc?.kill();
        this.proc = null;
        this.rl?.close();
        this.rl = null;
    }

    getState(): TrackerState {
        return { ...this.state };
    }

    private ensureProcess(): void {
        if (this.proc && this.proc.exitCode === null) return;

        const corePath = path.join(this.context.extensionPath, 'out', 'devglobe-core.js');
        let proc: ChildProcess;
        try {
            proc = spawn(process.execPath, [corePath, 'daemon'], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        } catch (err) {
            this.handleProcessFailure(`Failed to start devglobe-core: ${(err as Error).message}`);
            return;
        }
        this.proc = proc;

        proc.on('error', (err) => {
            this.handleProcessFailure(`devglobe-core failed: ${err.message}`);
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
            log.warn('core stderr:', chunk.toString().trim());
        });

        proc.on('exit', (code) => {
            log.info(`core exited with code ${code}`);
            const wasTracking = this.state.tracking;
            this.rl?.close();
            this.rl = null;
            this.proc = null;
            if (wasTracking) {
                this.state.tracking = false;
                this.onStateChange(this.state);
                vscode.window.showWarningMessage(
                    'DevGlobe: tracking stopped — devglobe-core exited unexpectedly.',
                );
            }
        });

        this.rl = createInterface({ input: proc.stdout!, terminal: false });
        this.rl.on('line', (line) => this.handleLine(line));
    }

    private handleProcessFailure(message: string): void {
        log.error(message);
        this.proc = null;
        this.rl?.close();
        this.rl = null;
        if (this.state.tracking) {
            this.state.tracking = false;
            this.onStateChange(this.state);
        }
        vscode.window.showErrorMessage(`DevGlobe: ${message}`);
    }

    private handleLine(line: string): void {
        let event: CoreEvent;
        try { event = JSON.parse(line); } catch { return; }

        switch (event.event) {
            case 'ready':
                this.state.configured = event.data.configured;
                this.onStateChange(this.state);
                break;

            case 'not_configured':
                this.state.configured = false;
                this.state.tracking = false;
                this.onStateChange(this.state);
                break;

            case 'invalid_api_key':
                this.state.configured = false;
                this.state.tracking = false;
                this.onStateChange(this.state);
                vscode.window.showErrorMessage(
                    'DevGlobe: invalid API key. Please reconnect with a valid key.',
                    'Get API key',
                ).then((choice) => {
                    if (choice === 'Get API key') {
                        vscode.env.openExternal(vscode.Uri.parse('https://devglobe.xyz/dashboard/settings'));
                    }
                });
                this.onInvalidApiKey();
                break;

            case 'heartbeat_ok':
                this.state.todaySeconds = event.data.today_seconds;
                this.state.language = event.data.language;
                this.state.tracking = true;
                this.state.offline = false;
                this.updateStatusBarTime(event.data.today_seconds);
                this.onStateChange(this.state);
                break;

            case 'offline':
                this.state.offline = true;
                this.onStateChange(this.state);
                break;

            case 'online':
                this.state.offline = false;
                this.onStateChange(this.state);
                break;

            case 'status_ok':
                vscode.window.showInformationMessage('DevGlobe: Status updated');
                break;

            case 'status_error':
                vscode.window.showErrorMessage(`DevGlobe: ${event.data.message}`);
                break;
        }
    }

    private send(msg: Record<string, unknown>): void {
        if (!this.proc?.stdin?.writable) return;
        this.proc.stdin.write(JSON.stringify(msg) + '\n');
    }

    init(): void {
        this.ensureProcess();
        this.send({
            method: 'init',
            params: {
                plugin_version: this.pluginVersion,
                editor: detectEditor(),
            },
        });
    }

    start(): void {
        this.ensureStatusBar();
        this.state.tracking = true;
        this.send({ method: 'resume' });
        this.onStateChange(this.state);
    }

    pause(): void {
        this.state.tracking = false;
        this.send({ method: 'pause' });
        this.statusBarItem?.hide();
        this.onStateChange(this.state);
    }

    activity(filePath: string, language?: string): void {
        this.send({
            method: 'activity',
            params: { file: filePath, ...(language && { language }) },
        });
    }

    setStatus(message: string): void {
        this.send({ method: 'set_status', params: { message } });
    }

    reset(): void {
        this.tearDownProcess();
        this.state = { ...DEFAULT_STATE };
        this.statusBarItem?.hide();
        this.onStateChange(this.state);
    }

    private ensureStatusBar(): void {
        if (this.statusBarItem) return;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.tooltip = 'DevGlobe: Coding time today';
        this.statusBarItem.text = '$(clock) 0m';
        this.statusBarItem.command = 'devglobe.openGlobe';
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
        this.statusBarItem.tooltip = `DevGlobe: ${label} coded today`;
        this.statusBarItem.show();
    }
}
