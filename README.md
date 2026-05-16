<h1 align="center">CodeBeats for VS Code</h1>

<p align="center">
  <strong>Private development tracker with Supabase backend.</strong><br/>
  Track your coding time, languages, and projects completely privately using your own self-hosted or managed Supabase instance.
</p>

---

> **100% Private & Open Source** — You own your data. Heartbeats and stats are sent directly to your own Supabase database. No external servers or third-party trackers are involved.

---

## Features

- **Coding Time Tracking:** Automatically records how long you spend coding in different languages. Sends a heartbeat every 30 seconds while you're actively coding. Auto-pauses after 1 minute of inactivity.
- **Language Detection:** Detects 150+ languages from your active editor tab.
- **Project & Branch Awareness:** Uses Git to automatically detect which project and branch you are working on.
- **Machine-Specific Identity:** Safely tracks activity across multiple computers.
- **Status Messages:** Set a custom status message ("What are you working on?") that gets saved directly to your Supabase database.
- **Live Sidebar Dashboard:** View your coding time today, active project details, and a dynamic Language Leaderboard with filters (Today, Week, Month, All Time).
- **Status Bar Integration:** Displays your coding time for today (e.g. `2h 15m`) right in the VS Code status bar.
- **Offline Resilience:** Recovers gracefully from connection issues.

---

## Setup & Installation

CodeBeats requires a Supabase instance to store your data. 

### 1. Database Setup
Before connecting the extension, you need to set up the database tables.
1. Open your Supabase project dashboard.
2. Go to the **SQL Editor**.
3. Copy the contents of the `schema.sql` file (included in this extension's directory or available via the login screen link).
4. Run the script to create the required tables (`projects`, `heartbeats`, `daily_stats`, `status_messages`) and Row Level Security (RLS) policies.

### 2. Connect the Extension
1. Open the **CodeBeats** sidebar in VS Code (the clock/tracker icon in the activity bar).
2. Enter your **Supabase Project ID** (or full URL) and your **API Key** (anon public key).
3. Click **Connect**. 
4. The extension will verify the connection and confirm that the database schema is correctly set up.

---

## Commands

Accessible from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `CodeBeats: Set Status Message` | Set your status message (saved to Supabase) |
| `CodeBeats: Show Coding Time` | Show your coding time today |
| `CodeBeats: Debug` | Toggle debug logging |
| `CodeBeats: Open Log File…` | Open the CodeBeats log file |
| `CodeBeats: Open Config File…` | Open the local configuration file |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codebeats.trackingEnabled` | `true` | Enable or disable heartbeat tracking |
| `codebeats.inactiveGraceMinutes` | `10` | Minutes to keep counting after the last editor activity (set to `0` to disable) |

---

## Privacy & Security

- **Direct Connection:** The extension communicates *only* and directly with the Supabase URL you provide.
- **Secure Credentials:** Your Supabase URL and API Key are stored securely using VS Code's native `SecretStorage` (macOS Keychain, Windows Credential Manager, Linux libsecret) — never in plain text.
- **No Source Code Tracking:** Files outside any Git repository are not tracked beyond their language. We never read your source code, file contents, keystrokes, or commit messages.

---

## Requirements

- VS Code **1.80+** (Also works with Cursor, Windsurf, VSCodium, Positron, Antigravity, and other VS Code forks)
- A Supabase project (cloud or self-hosted)
