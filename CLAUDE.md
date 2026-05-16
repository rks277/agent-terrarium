# Repo Orchestrator — Implementation Agent Guide

You are implementing **Repo Orchestrator**, a local-first daemon that observes Claude Code sessions across all of a user's repositories and exposes a clean event stream.

## Read these first, in order

1. `.specs/final.md` — the locked-in spec. Source of truth for **what** to build.
2. `.plans/0_overall_plan.md` — the full architectural plan. Context for **why** decisions were made.
3. `.plans/1_foundation.md` through `.plans/8_*.md` — phase-by-phase implementation chunks. Execute **in order**. Each file is self-contained: goal, prerequisites, files to create, verification steps.

Do not skip ahead. Each chunk lands on a working artifact that the next chunk builds on.

## Project shape (pnpm monorepo)

```
agent-terrarium/
├── packages/
│   ├── core/                       # event schema, FSM, storage interface
│   ├── daemon/                     # long-running daemon process
│   ├── cli/                        # `repo-orch` CLI
│   ├── adapter-claude-code/        # ClaudeCode-specific watchers and parsers
│   └── plugin-claude-code/         # files shipped to ~/.claude/plugins/repo-orch/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Each package has its own `package.json`, `tsconfig.json`, and `src/`. Tests live in `src/**/*.test.ts` (vitest).

## Non-negotiable constraints

These come from the spec; do not relax them without explicit user approval.

1. **Nothing is ever written into a user's repo.** All state goes under `~/.repo-orch/`.
2. **`~/.claude/settings.json` is never read, written, or referenced by this tool.** Hook delivery happens via the Claude Code plugin system (`~/.claude/plugins/repo-orch/`). The byte-identity check after install→uninstall is the integrity test.
3. **Daemon must not block Claude Code in any way.** The hook script is pure POSIX shell that writes to a maildir and exits. The daemon being down must not affect Claude Code's behavior.
4. **All adapter-specific code stays in `packages/adapter-claude-code/`.** `core` and `daemon` are agent-agnostic — they know about the `Adapter` interface, not Claude Code.
5. **No network calls from the daemon.** Local-only.

## Coding conventions

- **TypeScript strict mode**, `"strict": true`, `"noUncheckedIndexedAccess": true`.
- **ES modules** (`"type": "module"` in every package's `package.json`).
- **Node 20+** target. Use built-ins (`node:fs/promises`, `node:net`, `node:path`) over third-party where reasonable.
- **No default exports.** Named exports only.
- **Pure reducers for state.** The session FSM is a pure function `(state, event) => newState`. No I/O in reducers.
- **No comments explaining *what* code does.** Comments only for non-obvious *why*: subtle invariants, workarounds for documented Claude Code quirks, atomicity guarantees. Identifiers should be self-documenting.
- **No unnecessary error handling.** Trust internal types. Only validate at boundaries: file system, hook payloads, socket inputs. Let unexpected errors crash the daemon — launchd will restart it.
- **No premature abstraction.** Build for today's two adapters (just `claude-code` for MVP); the `Adapter` interface exists, but don't add hypothetical knobs for adapters we haven't designed.

## Dependencies (whitelist)

Stick to this short list unless adding one is justified in a chunk:

- `better-sqlite3` — storage
- `chokidar` — file watching
- `ulid` — event IDs
- `commander` — CLI argument parsing
- `pino` — structured logging
- `vitest` — testing
- `typescript`, `tsx`, `@types/node` — toolchain

Notably **avoid**: heavy frameworks (express, fastify) in the daemon — the Unix socket server uses `node:net` directly. `jsonc-parser` is only needed if the plugin fallback path is taken; otherwise skip it.

## Testing approach

Three layers, in this priority order:

1. **Unit (vitest)** — pure functions: FSM reducer, transcript parser, hook parser, dedupe. Fast, deterministic, run on every save.
2. **Replay integration** — fixtures of recorded JSONL transcript lines + recorded hook payloads. Pipe into the adapter at accelerated speed; assert on the resulting event stream and final DB rows. This is the primary "is the system real" gate. Fixtures live in `packages/adapter-claude-code/test/fixtures/`.
3. **Live smoke** — documented manual steps in `.plans/8_*.md`. Run once before each release.

Do **not** mock the SQLite database in integration tests. Use a real DB in a tempdir.

## Gotchas already discovered

- **Transcript files are appended live.** The watcher must tail (read from last byte, follow appends), not re-read the whole file on each change.
- **JSONL lines may exceed 4KB** (long tool outputs). The transcript line reader must handle arbitrary line sizes.
- **Encoded-cwd directory names** use a specific scheme: every non-alphanumeric character in the absolute path is replaced with `-`. Cross-reference Claude Code's docs before reimplementing decoding.
- **Hook payloads include `transcript_path`**, which is the absolute path to the live JSONL. Use this to correlate hook events with transcript-derived events.
- **`sessions/<pid>.json` is updated periodically**, not on every state change. Don't expect millisecond freshness.
- **`uuidgen` is preinstalled on macOS**; on Linux, fall back to `cat /proc/sys/kernel/random/uuid`. The plugin's `dispatch.sh` handles both.
- **Maildir convention**: write to `.UUID.json` (dotfile), then `mv` to `UUID.json`. The watcher ignores dotfiles to avoid partial reads.

## Where things go on the user's disk

| Path | Purpose |
|---|---|
| `~/.repo-orch/state.db` | SQLite database |
| `~/.repo-orch/daemon.sock` | Unix domain socket |
| `~/.repo-orch/events/` | Maildir for hook events |
| `~/.repo-orch/logs/daemon.log` | Daemon log (size-rotated) |
| `~/.repo-orch/config.json` | User config (privacy opts, ignore globs) |
| `~/.repo-orch/bin/daemon.js` | Daemon entrypoint (or symlink to package binary) |
| `~/Library/LaunchAgents/co.repo-orch.daemon.plist` | macOS launchd unit |
| `~/.claude/plugins/repo-orch/` | The Claude Code plugin (hooks live here) |

## Process for picking up a chunk

1. Open `.plans/<N>_*.md`. Re-read the **Goal** and **Verification** sections.
2. Check that prerequisites (prior chunks) are done — run their verification steps if uncertain.
3. Implement.
4. Run that chunk's verification step. Don't move to the next chunk until it passes.
5. Update the chunk file's status footer (e.g., `Status: done, completed YYYY-MM-DD`).

If a chunk's verification reveals the design is wrong, **stop and surface it** rather than working around it. The spec is the contract; deviations need user approval.

## Things to never do without explicit user approval

- Edit `~/.claude/settings.json` (the spec explicitly forbids this).
- Add a hook event beyond the 5 listed in `.specs/final.md`.
- Add cross-machine sync, cloud features, or any network call.
- Change the canonical event schema names or payload shapes after they're published.
- Skip the byte-identity check in the install/uninstall test.
