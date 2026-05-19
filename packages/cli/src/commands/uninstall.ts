import { readFile, rm, access } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { resolvePaths } from '@repo-orch/daemon';
import { sha256OfFile } from '../sha256.js';
import { PLIST_LABEL } from './install.js';

const PLUGIN_KEY = 'repo-orch@repo-orch';
const MARKETPLACE_NAME = 'repo-orch';

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

  // Undo what `registerPlugin` did at install time: ask the claude CLI to
  // remove the plugin from its registry and drop the marketplace entry. If
  // we skip this, ~/.claude/plugins/installed_plugins.json and
  // known_marketplaces.json keep dangling refs to a plugin tree we're about
  // to delete, and Claude Code will error on next session start.
  await unregisterClaudePlugin();

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

async function unregisterClaudePlugin(): Promise<void> {
  if (!(await hasClaudeCli())) {
    process.stdout.write('  (skipped claude plugin unregister: claude CLI not on PATH)\n');
    return;
  }
  const uninstall = await runClaude(['plugin', 'uninstall', PLUGIN_KEY]);
  if (uninstall.code === 0) {
    process.stdout.write(`  ✓ claude plugin uninstall ${PLUGIN_KEY}\n`);
  } else if (/not (installed|found)/i.test(uninstall.stderr + uninstall.stdout)) {
    process.stdout.write(`  (claude: ${PLUGIN_KEY} already absent)\n`);
  } else {
    process.stdout.write(
      `  ⚠ claude plugin uninstall warning: ${oneLine(uninstall.stderr || uninstall.stdout)}\n`,
    );
  }

  const marketplace = await runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
  if (marketplace.code === 0) {
    process.stdout.write(`  ✓ claude plugin marketplace remove ${MARKETPLACE_NAME}\n`);
  } else if (/not (configured|found)/i.test(marketplace.stderr + marketplace.stdout)) {
    process.stdout.write(`  (claude: marketplace ${MARKETPLACE_NAME} already absent)\n`);
  } else {
    process.stdout.write(
      `  ⚠ claude marketplace remove warning: ${oneLine(marketplace.stderr || marketplace.stdout)}\n`,
    );
  }
}

async function hasClaudeCli(): Promise<boolean> {
  const probe = await runClaude(['--version']);
  return probe.code === 0;
}

function runClaude(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', () =>
      resolve({ code: 127, stdout, stderr: 'claude CLI not found on PATH' }),
    );
  });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
