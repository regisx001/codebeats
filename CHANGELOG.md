# Changelog

## 2.0.0

- Multi-provider repo URL detection — GitHub, GitLab, Bitbucket, self-hosted Gitea/Forgejo, Azure DevOps. The clickable repo on the live globe and profile card adapts to the provider.
- Pure file-system git detection — `.git/HEAD` and `.git/config` are read directly. No `git` binary required, ~1 ms latency.
- Sub-second file switching now correctly tracked. Fast edits across multiple files no longer disappear from your stats.
- File paths sent only when in a git repository, always relative to the repo root. No absolute home paths leak.
- Local privacy flags `hide_file_names`, `hide_branch_names`, `hide_project_names` in `~/.devglobe/config.toml` (`hide_project_names` also hides branches).
- Visibility settings (anonymous mode, repo sharing, profile mode) moved to the dashboard at https://devglobe.xyz/dashboard/settings.
- Robust core process recovery — the sidebar reflects state changes when the core exits unexpectedly.
- New `DevGlobe: Open Panel` command for quick sidebar access.
