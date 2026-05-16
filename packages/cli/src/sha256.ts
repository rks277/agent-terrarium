import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function sha256OfFile(filePath: string): Promise<string | null> {
  try {
    const buf = await readFile(filePath);
    return createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}
