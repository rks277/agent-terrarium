# Repo Orchestrator — Install & Setup

A local-first daemon that watches your Claude Code sessions and exposes a
canonical event stream. Nothing is ever written inside your repos, and
`~/.claude/settings.json` is not modified by this tool.

## Requirements

- macOS (launchd is the only supported supervisor for the MVP)
- Node 20+
- [pnpm](https://pnpm.io/installation)
- An existing `~/.claude/` directory (i.e. you've run `claude` at least once)

## Install

From the repo root:

```sh
pnpm install
pnpm -r build
node packages/cli/dist/index.js install
```

That command will:

1. Create `~/.repo-orch/` (SQLite DB, socket, logs, config).
2. Drop the Claude Code plugin at `~/.claude/plugins/repo-orch/`.
3. Write `~/Library/LaunchAgents/co.repo-orch.daemon.plist` and `launchctl load` it.
4. Start the daemon — it begins watching `~/.claude/projects/` immediately.

### Enable hook delivery (required, one-time, inside Claude Code)

File-dropping the plugin at `~/.claude/plugins/repo-orch/` is *not* enough on
its own — Claude Code does not auto-discover plugins from that directory on
the versions we've tested. You must register the plugin manually once. Run
this inside any Claude Code session, after `install` has finished:

```
/plugin marketplace add ~/.claude/plugins/repo-orch
/plugin install repo-orch@repo-orch
```

After that, Claude Code copies the plugin into its own cache
(`~/.claude/plugins/cache/repo-orch/repo-orch/<version>/`) and starts firing
hooks. You only need to do this once per machine. If you skip it the daemon
still works from transcript reads — you just lose the low-latency overlay
(permission prompts, exact tool boundaries, etc.).

## Verify

```sh
node packages/cli/dist/index.js doctor
```

You should see every check green:

```
✓ ~/.repo-orch/ exists
✓ daemon socket exists
✓ daemon responds to ping
✓ plugin installed at ~/.claude/plugins/repo-orch/
✓ ~/.claude/projects/ accessible
✓ events ingested in last 24h (N events)
```

`launchctl list | grep co.repo-orch.daemon` should also show the job loaded.

## Day-to-day use

Stream live events (human-readable):

```sh
node packages/cli/dist/index.js tail --pretty
```

Filter by session, repo, or event type:

```sh
node packages/cli/dist/index.js tail --type 'permission.*'
node packages/cli/dist/index.js tail --repo ~/code/my-project
node packages/cli/dist/index.js tail --session 01HXXXXXXXXXXXXXXXXXXXXX
```

Snapshot of all known sessions and their current FSM state:

```sh
node packages/cli/dist/index.js status
```

Canonical event types emitted: `session.started`, `session.ended`,
`session.state_changed`, `prompt.submitted`, `assistant.turn_completed`,
`tool.used`, `permission.requested`, `permission.resolved`,
`notification.received`.

## Optional: shorter command name

The CLI ships as `repo-orch` in `packages/cli/package.json`. To make that
name available globally on your shell, symlink the entrypoint:

```sh
ln -s "$PWD/packages/cli/dist/index.js" /usr/local/bin/repo-orch
```

Then `repo-orch tail --pretty` works from anywhere.

## Uninstall

```sh
node packages/cli/dist/index.js uninstall --yes
```

This unloads the launchd job, removes the plist, removes
`~/.claude/plugins/repo-orch/`, and removes the daemon socket. By default it
preserves your event history at `~/.repo-orch/`. To wipe everything:

```sh
node packages/cli/dist/index.js uninstall --yes --purge
```

### A note about `~/.claude/settings.json`

The repo-orch installer never reads or writes `settings.json`. However, the
one-time `/plugin install repo-orch@repo-orch` step above causes *Claude Code
itself* to write a `"repo-orch@repo-orch": true` entry into its own
`enabledPlugins` section of `settings.json`, plus an entry in
`installed_plugins.json`, plus a cached copy of the plugin under
`~/.claude/plugins/cache/`. None of these are touched by our uninstaller. They
persist after `repo-orch uninstall` — harmless (the source plugin directory is
gone, so the hooks no longer fire), but if you want a fully clean state run
`/plugin uninstall repo-orch@repo-orch` and `/plugin marketplace remove
repo-orch` inside Claude Code before running `repo-orch uninstall`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `doctor`: daemon socket missing | `launchctl list \| grep co.repo-orch.daemon` — if missing, re-run `install`. |
| `doctor`: 0 events ingested in last 24h | Run a Claude Code session. If still 0, check `~/.repo-orch/logs/daemon.log`. |
| Hook events missing (only transcript-derived events) | The plugin registration step was skipped or didn't take. Run the `/plugin marketplace add` + `/plugin install` pair above, then start a fresh Claude Code session (hooks only attach to new sessions). |
| Want to reinstall over an existing install | `node packages/cli/dist/index.js install --force` |
| Daemon won't start | Check `~/.repo-orch/logs/daemon.log` and `launchctl error <exit-code>`. |
