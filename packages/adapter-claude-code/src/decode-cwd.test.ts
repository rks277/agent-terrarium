import { describe, it, expect } from 'vitest';
import { decodeCwd, decodeCwdWithFallback } from './decode-cwd.js';

describe('decodeCwd', () => {
  it('decodes a typical absolute path', () => {
    const fakeExists = (p: string) => {
      const set = new Set(['/', '/Users', '/Users/roshan', '/Users/roshan/Documents', '/Users/roshan/Documents/myrepo']);
      return set.has(p);
    };
    expect(decodeCwd('-Users-roshan-Documents-myrepo', { exists: fakeExists })).toBe(
      '/Users/roshan/Documents/myrepo',
    );
  });

  it('handles a literal hyphen in a path component', () => {
    const fakeExists = (p: string) => {
      const set = new Set(['/', '/Users', '/Users/roshan', '/Users/roshan/my-repo']);
      return set.has(p);
    };
    expect(decodeCwd('-Users-roshan-my-repo', { exists: fakeExists })).toBe('/Users/roshan/my-repo');
  });

  it('returns null when no path matches', () => {
    expect(decodeCwd('-nothing-here', { exists: () => false })).toBeNull();
  });
});

describe('decodeCwdWithFallback', () => {
  it('falls back to transcript cwd when decode fails', () => {
    const out = decodeCwdWithFallback('-Users-roshan-myrepo', '/Users/roshan/myrepo', {
      exists: () => false,
    });
    expect(out).toBe('/Users/roshan/myrepo');
  });

  it('falls back to naive replacement when both fail', () => {
    const out = decodeCwdWithFallback('-Users-roshan-myrepo', null, { exists: () => false });
    expect(out).toBe('/Users/roshan/myrepo');
  });
});
