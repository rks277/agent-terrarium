import { cpSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const src = path.join(pkgRoot, 'src', 'assets');
const dest = path.join(pkgRoot, 'dist');

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
chmodSync(path.join(dest, 'plugins', 'repo-orch', 'hooks', 'dispatch.sh'), 0o755);

console.log(`plugin-claude-code: copied ${src} → ${dest}`);
