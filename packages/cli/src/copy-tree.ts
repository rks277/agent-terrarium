import { copyFile, mkdir, readdir, stat, chmod } from 'node:fs/promises';
import path from 'node:path';

export async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
      const s = await stat(srcPath);
      await chmod(destPath, s.mode & 0o7777);
    }
  }
}
