<h1 align="center">DevGlobe for VS Code</h1>

<p align="center">
  <strong>Show up on a 3D globe in real time while you code.</strong><br/>
  Your activity is displayed live on <a href="https://devglobe.xyz">devglobe.xyz</a> — other developers see you, discover your projects and your links.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=devglobe.devglobe">VS Code Marketplace</a> &nbsp;·&nbsp;
  <a href="https://devglobe.xyz">devglobe.xyz</a> &nbsp;·&nbsp;
  <a href="https://github.com/Nako0/devglobe-extension">Source code</a>
</p>

---

> **Open source & transparent** — This extension is 100% open source. No code is read, no sensitive data is collected. You can audit every line on [GitHub](https://github.com/Nako0/devglobe-extension).

---

## How it works

1. Sign in on [devglobe.xyz](https://devglobe.xyz) with GitHub, X (Twitter), or Google
2. Copy your API key from the site settings
3. Open the **DevGlobe** sidebar in VS Code (globe icon in the activity bar)
4. Paste your API key → **Connect**
5. You're online — your marker appears on the globe

The extension sends a **heartbeat every 30 seconds** as long as you're actively coding. It pauses after 1 minute of inactivity. **After 10 minutes of inactivity, you disappear from the globe.**

Visibility settings (anonymous mode, repo sharing, profile mode) are managed on [devglobe.xyz/dashboard/settings](https://devglobe.xyz/dashboard/settings).

---

## Features

| Feature | Description |
|---------|-------------|
| **Live heartbeat** | Sends your activity every 30s. Auto-pauses after 1 min of inactivity. |
| **Language detection** | Detects 150+ languages from your active editor tab. |
| **Platform detection** | Sends your OS (macOS, Windows or Linux) alongside each heartbeat so it appears on your profile. |
| **Git integration** | Detects your repo from the git remote. Commit data is never read or sent by the extension. |
| **Status message** | Write what you're working on — visible on your globe profile. |
| **Offline recovery** | Detects connection loss and automatically resumes when the network is back. |
| **Status bar** | Displays your coding time for today (e.g. `2h 15m`) in the VS Code status bar. |

### Sidebar

Two views in the side panel:

- **Login** — masked API key field + link to get your key on devglobe.xyz
- **Dashboard** — live coding time, active language, status message, start/stop buttons, logout

### Commands

Accessible from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `DevGlobe: Set Status Message` | Set your status message on the globe |
| `DevGlobe: Show Coding Time` | Show your coding time today |
| `DevGlobe: Open Globe` | Open [devglobe.xyz/space](https://devglobe.xyz/space) in your browser |
| `DevGlobe: Debug` | Toggle debug logging in `~/.devglobe/devglobe.log` |
| `DevGlobe: Open Log File…` | Open `~/.devglobe/devglobe.log` |
| `DevGlobe: Open Config File…` | Open `~/.devglobe/config.toml` |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `devglobe.trackingEnabled` | `true` | Enable/disable tracking |

---

## What DevGlobe brings you

- **Enhanced public profile** — Your GitHub, X, projects, activity, tech stack and links on a single shareable page.
- **Project directory** — Publish your projects, invite teammates, get discovered and upvoted by the community.
- **Comments & upvotes** — Threaded discussions on every project. Give and get feedback from other developers.
- **Developer dashboard** — One place to manage your profile, projects and extensions, track coding stats, unlock badges and read notifications.
- **Discovery** — Browse and filter developers & projects by language, tools and platform.
- **Networking** — See who's coding right now and in which language. Click a marker to discover a developer, their projects and their links.
- **Light & dark mode** — Full theme support across the platform.

---

## Privacy

The extension sends programming language, editor name, OS, coding time, the origin remote URL of your current git repo (when present), branch name, and the file path **relative to your repo root** — never an absolute home path.

Files outside any git repository are not tracked beyond their language. We never read source code, file contents, keystrokes, or commit messages.

Local privacy flags can be toggled in `~/.devglobe/config.toml` under `[privacy]`: `hide_file_names`, `hide_branch_names`, `hide_project_names` (the project flag also hides branches).

Globe-side visibility (anonymous mode, repo sharing on the live globe, profile mode) is managed on [devglobe.xyz/dashboard/settings](https://devglobe.xyz/dashboard/settings).

API keys are stored in the OS keychain via VS Code SecretStorage (macOS Keychain, Windows Credential Manager, Linux libsecret) — never in plain text.

**Network:** HTTPS only (TLS 1.2+), no telemetry, no third-party trackers.

---

## Requirements

- VS Code **1.80+** — also works with **Cursor**, **Windsurf**, **VSCodium**, **Positron**, **Antigravity** and other VS Code forks
- **Zero external dependencies** — uses only native VS Code and Node.js APIs

---

## Links

- [devglobe.xyz/space](https://devglobe.xyz/space) — the globe
- [Source code](https://github.com/Nako0/devglobe-extension) — public GitHub repo

---

<p align="center">
  <a href="https://devglobe.xyz">devglobe.xyz</a>
</p>
