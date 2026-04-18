import { describe, it, expect, vi } from 'vitest';
import { BenchStore } from './benchStore';
import { BenchSynchronizer } from './benchSynchronizer';
import type { HunkPatch } from './hunkParser';

function stubGit(hunks: HunkPatch[]) {
  return {
    diffHead: vi.fn((): Promise<string> => Promise.resolve(hunks.map((h) => h.patchContent).join('\n'))),
    headSha: vi.fn((): Promise<string> => Promise.resolve('sha-1')),
    parseDiff: (_: string): HunkPatch[] => hunks,
  };
}

describe('BenchSynchronizer', () => {
  it('auto-assigns new hunks to the active bench', async () => {
    const store = new BenchStore(undefined, '/r');
    const active = store.getActiveBench();
    const hunks: HunkPatch[] = [{
      filePath: 'src/a.ts',
      oldBlob: 'aaa',
      newBlob: 'bbb',
      fileStatus: 'modified',
      lineRange: { startOld: 1, countOld: 1, startNew: 1, countNew: 2 },
      patchContent: 'patch-1',
    }];
    const git = stubGit(hunks);
    const sync = new BenchSynchronizer(store, git);
    await sync.reconcile();
    expect(store.getBench(active.id)?.files.get('src/a.ts')).toHaveLength(1);
  });

  it('removes hunks no longer present in git diff', async () => {
    const store = new BenchStore(undefined, '/r');
    const active = store.getActiveBench();
    store.assignHunk(active.id, {
      hunkId: 'h_stale',
      filePath: 'src/a.ts',
      shelfPath: '',
      lineRange: { startOld: 1, countOld: 1, startNew: 1, countNew: 1 },
      preview: '',
      fileStatus: 'modified',
    });
    const git = stubGit([]);
    const sync = new BenchSynchronizer(store, git);
    await sync.reconcile();
    expect(store.getBench(active.id)?.files.has('src/a.ts')).toBe(false);
  });
});
