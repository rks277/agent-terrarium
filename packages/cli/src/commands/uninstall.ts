import { readFile, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolvePaths } from '@repo-orch/daemon';
import { sha256OfFile } from '../sha256.js';
import { PLIST_LABEL } from './install.js';

export type UninstallOptions = {
  home?: string;
  noLaunchctl?: boolean;
  yes?: boolean;
  purge?: boolean;
  keepData?: boolean;
};

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readInstallState(file: string): Promise<{ settingsJsonSha256Before?: string | null } | null> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<number> {
  const paths = resolvePaths(opts.home);
  const plistPath = path.join(paths.launchAgents, `${PLIST_LABEL}.plist`);

  if (!opts.yes) {
    process.stderr.write(
      'repo-orch: uninstall requires --yes (non-interactive contract).\n',
    );
    return 1;
  }

  if (!opts.noLaunchctl && (await exists(plistPath))) {
    try {
      execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
    } catch {
      // already unloaded
    }
  }
  await rm(plistPath, { force: true });
  await rm(paths.claudePluginRoot, { recursive: true, force: true });

  const settingsPath = path.join(paths.home, '.claude', 'settings.json');
  const state = await readInstallState(paths.installState);
  const before = state?.settingsJsonSha256Before ?? null;
  const after = await sha256OfFile(settingsPath);

  if (before === after) {
    process.stdout.write(`✓ ~/.claude/settings.json byte-identical to pre-install state\n`);
  } else {
    process.stdout.write(
      `⚠ ~/.claude/settings.json sha differs from pre-install: before=${before ?? 'null'} after=${after ?? 'null'}\n`,
    );
  }

  if (opts.purge) {
    await rm(paths.root, { recursive: true, force: true });
    process.stdout.write(`✓ Purged ${paths.root}\n`);
  } else if (!opts.keepData) {
    await rm(paths.socket, { force: true });
    await rm(paths.installState, { force: true });
    process.stdout.write(`(state preserved at ${paths.root}; pass --purge to wipe)\n`);
  }

  process.stdout.write(`✓ Daemon stopped and removed\n`);
  process.stdout.write(`✓ Plugin removed\n`);
  return 0;
}
