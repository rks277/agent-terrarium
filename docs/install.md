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

### Enable hook delivery (one-time, inside Claude Code)

On most Claude Code versions the plugin is auto-discovered from
`~/.claude/plugins/repo-orch/` and hook delivery starts working immediately. If
`doctor` shows no hook-derived events after a few sessions, register the plugin
manually — run this once inside any Claude Code session:

```
/plugin marketplace add ~/.claude/plugins/repo-orch
/plugin install repo-orch@repo-orch
```

You only need to do this once per machine. Without it the daemon still works
from transcript reads — you just lose the low-latency overlay (permission
prompts, etc.).

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

The repo-orch installer never reads or writes `settings.json`. However, when
Claude Code auto-discovers our plugin it *does* write a
`"repo-orch@repo-orch": true` entry into its own `enabledPlugins` section of
`settings.json`. That entry persists after uninstall — it's harmless (the
plugin directory is gone, so Claude Code ignores the stale entry), but you can
remove it by hand if you want a fully clean state.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `doctor`: daemon socket missing | `launchctl list \| grep co.repo-orch.daemon` — if missing, re-run `install`. |
| `doctor`: 0 events ingested in last 24h | Run a Claude Code session. If still 0, check `~/.repo-orch/logs/daemon.log`. |
| Hook events missing (only transcript-derived events) | Run the `/plugin marketplace add` + `/plugin install` pair above. |
| Want to reinstall over an existing install | `node packages/cli/dist/index.js install --force` |
| Daemon won't start | Check `~/.repo-orch/logs/daemon.log` and `launchctl error <exit-code>`. |
