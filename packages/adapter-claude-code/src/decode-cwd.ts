import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export type DecodeOptions = {
  exists?: (p: string) => boolean;
};

function defaultExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function decodeCwd(encoded: string, opts: DecodeOptions = {}): string | null {
  const exists = opts.exists ?? defaultExists;
  if (!encoded.startsWith('-')) return null;
  const parts = encoded.slice(1).split('-');

  function walk(idx: number, base: string): string | null {
    if (idx >= parts.length) return exists(base) ? base : null;

    for (let len = 1; len <= parts.length - idx; len++) {
      const component = parts.slice(idx, idx + len).join('-');
      const candidate = base === '/' ? `/${component}` : `${base}/${component}`;
      if (!exists(candidate)) continue;
      const result = walk(idx + len, candidate);
      if (result) return result;
    }
    return null;
  }

  return walk(0, '/');
}

export function decodeCwdWithFallback(
  encoded: string,
  cwdFromTranscript: string | null,
  opts: DecodeOptions = {},
): string {
  const decoded = decodeCwd(encoded, opts);
  if (decoded) return decoded;
  if (cwdFromTranscript) return cwdFromTranscript;
  return path.join('/', encoded.replace(/^-/, '').replace(/-/g, '/'));
}
