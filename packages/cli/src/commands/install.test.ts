import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInstall } from './install.js';
import { runUninstall } from './uninstall.js';
import { sha256OfFile } from '../sha256.js';

let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'cli-install-'));
  mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
  writeFileSync(
    path.join(tempHome, '.claude', 'settings.json'),
    JSON.stringify(
      {
        permissions: { allow: ['Bash(echo *)', '// keep comment'] },
        model: 'claude-opus-4-7',
      },
      null,
      2,
    ),
  );
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
});

describe('install / uninstall', () => {
  it('install drops plugin tree + plist; settings.json untouched (--no-launchctl)', async () => {
    if (process.platform !== 'darwin') return;
    const settingsPath = path.join(tempHome, '.claude', 'settings.json');
    const before = await sha256OfFile(settingsPath);

    const code = await runInstall({ home: tempHome, noLaunchctl: true });
    expect(code).toBe(0);

    const plistPath = path.join(tempHome, 'Library', 'LaunchAgents', 'co.repo-orch.daemon.plist');
    expect(existsSync(plistPath)).toBe(true);

    const plistBody = readFileSync(plistPath, 'utf8');
    const daemonArg = plistBody.match(/<string>(\/[^<]*cli\.js)<\/string>/)?.[1];
    expect(daemonArg, 'plist must contain an absolute path to a daemon entry').toBeDefined();
    expect(existsSync(daemonArg!), `daemon entry ${daemonArg} must exist`).toBe(true);

    const pluginRoot = path.join(tempHome, '.claude', 'plugins', 'repo-orch');
    expect(existsSync(path.join(pluginRoot, '.claude-plugin', 'marketplace.json'))).toBe(true);
    expect(
      existsSync(path.join(pluginRoot, 'plugins', 'repo-orch', 'hooks', 'hooks.json')),
    ).toBe(true);
    expect(
      existsSync(path.join(pluginRoot, 'plugins', 'repo-orch', 'hooks', 'dispatch.sh')),
    ).toBe(true);

    const after = await sha256OfFile(settingsPath);
    expect(after).toBe(before);

    const stateFile = path.join(tempHome, '.repo-orch', 'install-state.json');
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    expect(state.settingsJsonSha256Before).toBe(before);
  });

  it('uninstall removes plist + plugin and reports byte-identity', async () => {
    if (process.platform !== 'darwin') return;
    const settingsPath = path.join(tempHome, '.claude', 'settings.json');
    const before = await sha256OfFile(settingsPath);

    await runInstall({ home: tempHome, noLaunchctl: true });
    const code = await runUninstall({ home: tempHome, noLaunchctl: true, yes: true });
    expect(code).toBe(0);

    const plistPath = path.join(tempHome, 'Library', 'LaunchAgents', 'co.repo-orch.daemon.plist');
    expect(existsSync(plistPath)).toBe(false);
    const pluginRoot = path.join(tempHome, '.claude', 'plugins', 'repo-orch');
    expect(existsSync(pluginRoot)).toBe(false);

    const after = await sha256OfFile(settingsPath);
    expect(after).toBe(before);
  });

  it('install --force overrides existing plist', async () => {
    if (process.platform !== 'darwin') return;
    await runInstall({ home: tempHome, noLaunchctl: true });
    const code = await runInstall({ home: tempHome, noLaunchctl: true, force: true });
    expect(code).toBe(0);
  });

  it('install without --force on second run refuses', async () => {
    if (process.platform !== 'darwin') return;
    await runInstall({ home: tempHome, noLaunchctl: true });
    const code = await runInstall({ home: tempHome, noLaunchctl: true });
    expect(code).toBe(1);
  });
});
