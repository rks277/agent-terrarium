import { chmod, mkdir, rm, writeFile, access, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { resolvePaths } from '@repo-orch/daemon';
import { PLUGIN_DIST_DIR } from '@repo-orch/plugin-claude-code';
import { copyTree } from '../copy-tree.js';
import { sha256OfFile } from '../sha256.js';

const require = createRequire(import.meta.url);

export type InstallOptions = {
  home?: string;
  noLaunchctl?: boolean;
  force?: boolean;
};

const PLIST_LABEL = 'co.repo-orch.daemon';

function plistContent(home: string, nodePath: string, daemonEntry: string): string {
  const stdoutLog = path.join(home, '.repo-orch', 'logs', 'daemon.log');
  const stderrLog = path.join(home, '.repo-orch', 'logs', 'daemon.err.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${daemonEntry}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>${stdoutLog}</string>
  <key>StandardErrorPath</key>
  <string>${stderrLog}</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>
`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function locateNodeBinary(): string {
  try {
    const out = execFileSync('/usr/bin/env', ['node', '-e', 'process.stdout.write(process.execPath)']).toString();
    if (out.startsWith('/')) return out;
  } catch {
    // fall through
  }
  return process.execPath;
}

async function locateDaemonEntry(): Promise<string> {
  const indexPath = require.resolve('@repo-orch/daemon');
  const entry = path.join(path.dirname(indexPath), 'cli.js');
  await stat(entry);
  return entry;
}

export async function runInstall(opts: InstallOptions = {}): Promise<number> {
  if (process.platform !== 'darwin') {
    process.stderr.write('repo-orch: Linux support coming soon. macOS only for MVP.\n');
    return 1;
  }
  const paths = resolvePaths(opts.home);
  const plistPath = path.join(paths.launchAgents, `${PLIST_LABEL}.plist`);

  if (!opts.force && (await exists(plistPath))) {
    process.stderr.write(
      `repo-orch: ${plistPath} already exists. Pass --force to reinstall.\n`,
    );
    return 1;
  }

  const settingsPath = path.join(paths.home, '.claude', 'settings.json');
  const beforeSha = await sha256OfFile(settingsPath);

  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.events, { recursive: true });
  await mkdir(paths.logs, { recursive: true });
  await mkdir(paths.launchAgents, { recursive: true });

  await rm(paths.claudePluginRoot, { recursive: true, force: true });
  await copyTree(PLUGIN_DIST_DIR, paths.claudePluginRoot);
  await chmod(
    path.join(paths.claudePluginRoot, 'plugins', 'repo-orch', 'hooks', 'dispatch.sh'),
    0o755,
  );

  const daemonEntry = await locateDaemonEntry();
  const nodePath = locateNodeBinary();
  await writeFile(plistPath, plistContent(paths.home, nodePath, daemonEntry));

  if (!opts.noLaunchctl) {
    try {
      execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
    } catch {
      // not loaded yet
    }
    execFileSync('launchctl', ['load', plistPath]);
  }

  const afterSha = await sha256OfFile(settingsPath);
  await writeFile(
    paths.installState,
    JSON.stringify(
      {
        settingsJsonSha256Before: beforeSha,
        settingsJsonSha256AfterInstall: afterSha,
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const untouched = beforeSha === afterSha;
  process.stdout.write(`✓ Daemon installed${opts.noLaunchctl ? ' (launchctl skipped)' : ' and launchd job loaded'}\n`);
  process.stdout.write(`✓ Plugin installed at ${paths.claudePluginRoot}\n`);
  process.stdout.write(
    untouched
      ? `✓ ~/.claude/settings.json: not modified\n`
      : `⚠ ~/.claude/settings.json sha changed during install (recorded for uninstall check)\n`,
  );
  process.stdout.write(`✓ Watching ${paths.claudeProjects}\n`);
  process.stdout.write(`\nTry: repo-orch tail\n`);
  process.stdout.write(
    `\nOne-time hook setup — inside any Claude Code session run:\n` +
      `  /plugin marketplace add ${paths.claudePluginRoot}\n` +
      `  /plugin install repo-orch@repo-orch\n` +
      `(Claude Code's plugins live in marketplaces; the install command above registers ours and enables hook delivery. Without this, the daemon still works via transcript reads — you just lose the low-latency overlay.)\n`,
  );
  return 0;
}

export { PLIST_LABEL };
export async function removeIfExists(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}
