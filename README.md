# Repo Orchestrator

A local-first daemon that observes Claude Code sessions across all of a user's
repositories and exposes a clean canonical event stream.

- **Observation-only** for the MVP — no remote control of sessions.
- **Zero interference**: never writes inside a user's repo, never touches
  `~/.claude/settings.json` (verified byte-identical before/after install).
- **Local-first**: SQLite on disk, Unix domain socket for IPC, no network.

For install and day-to-day usage see [`docs/install.md`](./docs/install.md).

## Install (after `pnpm install && pnpm -r build`)

```sh
node packages/cli/dist/index.js install      # drops plugin tree, plist, starts daemon
node packages/cli/dist/index.js tail --pretty
```

Uninstall:

```sh
node packages/cli/dist/index.js uninstall --yes
# add --purge to also wipe ~/.repo-orch state
```

## Workspace layout

```
packages/
  core/                    # event schema, FSM, SQLite storage
  adapter-claude-code/     # transcript & hook watchers, parsers
  daemon/                  # ingest pipeline + Unix socket server
  cli/                     # repo-orch CLI (install, uninstall, tail, status, doctor)
  plugin-claude-code/      # static files dropped into ~/.claude/plugins/repo-orch/
```

## Development

```sh
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
```

## CLI

| Command | Description |
|---------|-------------|
| `repo-orch install` | Install plugin tree + launchd plist, start daemon. |
| `repo-orch uninstall --yes` | Stop daemon, remove plist + plugin. Pass `--purge` to wipe state. |
| `repo-orch status` | Snapshot of known sessions. |
| `repo-orch tail [--pretty]` | Stream live events. Filters: `--session`, `--type`, `--repo`. |
| `repo-orch doctor` | Diagnose daemon + plugin health. |

## Canonical event types

`session.started`, `session.ended`, `session.state_changed`,
`prompt.submitted`, `assistant.turn_completed`, `tool.used`,
`permission.requested`, `permission.resolved`, `notification.received`.
