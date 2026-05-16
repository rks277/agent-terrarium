#!/usr/bin/env node
import { Command } from 'commander';
import { runTail } from './commands/tail.js';
import { runStatus } from './commands/status.js';
import { runDoctor } from './commands/doctor.js';
import { runInstall } from './commands/install.js';
import { runUninstall } from './commands/uninstall.js';

const program = new Command();
program.name('repo-orch').description('Repo Orchestrator CLI').version('0.1.0');

program
  .command('tail')
  .description('Stream live events from the daemon')
  .option('--session <id>', 'Filter by session id')
  .option('--type <pattern>', 'Filter by event type (supports * glob)')
  .option('--repo <path>', 'Filter by repo path')
  .option('--pretty', 'Human-readable output instead of JSON')
  .action(async (opts: { session?: string; type?: string; repo?: string; pretty?: boolean }) => {
    const controller = new AbortController();
    const onSig = () => controller.abort();
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);
    try {
      await runTail({ ...opts, signal: controller.signal });
    } finally {
      process.off('SIGINT', onSig);
      process.off('SIGTERM', onSig);
    }
  });

program
  .command('status')
  .description('Snapshot of known sessions and their states')
  .action(async () => {
    await runStatus();
  });

program
  .command('doctor')
  .description('Diagnose daemon health')
  .action(async () => {
    const code = await runDoctor();
    process.exit(code);
  });

program
  .command('install')
  .description('Install the daemon, launchd plist, and Claude Code plugin')
  .option('--force', 'Reinstall over an existing install')
  .option('--no-launchctl', 'Skip launchctl load (for tests)')
  .action(async (opts: { force?: boolean; launchctl?: boolean }) => {
    const code = await runInstall({ force: opts.force, noLaunchctl: opts.launchctl === false });
    process.exit(code);
  });

program
  .command('uninstall')
  .description('Stop the daemon and remove the plist and plugin')
  .option('--yes', 'Confirm uninstall (required)')
  .option('--purge', 'Also remove ~/.repo-orch state directory')
  .option('--keep-data', 'Keep socket file and install-state.json')
  .option('--no-launchctl', 'Skip launchctl unload (for tests)')
  .action(
    async (opts: { yes?: boolean; purge?: boolean; keepData?: boolean; launchctl?: boolean }) => {
      const code = await runUninstall({
        yes: opts.yes,
        purge: opts.purge,
        keepData: opts.keepData,
        noLaunchctl: opts.launchctl === false,
      });
      process.exit(code);
    },
  );

program.parseAsync().catch((err: unknown) => {
  process.stderr.write(`repo-orch: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
