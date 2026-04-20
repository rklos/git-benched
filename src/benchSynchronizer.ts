import type { BenchStore } from './benchStore';
import { hunkIdFromPatch, type HunkPatch } from './hunkParser';
import type { HunkRef } from './types';

export interface SyncGit {
  diffHead(paths?: string[]): Promise<string>;
  headSha(): Promise<string>;
  parseDiff(diff: string): HunkPatch[];
}

export class BenchSynchronizer {
  public constructor(
    private readonly store: BenchStore,
    private readonly git: SyncGit,
  ) {}

  public async reconcile(): Promise<void> {
    const diff = await this.git.diffHead();
    const currentHunks = this.git.parseDiff(diff);
    const currentByKey = new Map<string, HunkPatch>();
    currentHunks.forEach((h) => {
      currentByKey.set(`${h.filePath}|${hunkIdFromPatch(h)}`, h);
    });

    // Remove stale hunks from the ACTIVE bench only.
    // Inactive benches hold shelved patches (on disk), not working-tree modifications —
    // their absence from `git diff HEAD` is expected and must not trigger removal.
    const activeBench = this.store.getActiveBench();
    Array.from(activeBench.files.entries()).forEach(([ filePath, hunks ]) => {
      hunks.forEach((hunk) => {
        const key = `${filePath}|${hunk.hunkId}`;
        if (!currentByKey.has(key)) {
          this.store.removeHunk(activeBench.id, filePath, hunk.hunkId);
        }
      });
    });

    // Add new hunks to active bench
    Array.from(currentByKey.entries()).forEach(([ key, hunk ]) => {
      const sep = key.indexOf('|');
      const filePath = key.slice(0, sep);
      const hunkId = key.slice(sep + 1);
      if (!this.store.findHunk(filePath, hunkId)) {
        const firstAddLine = hunk.patchContent.split('\n').find((l) => l.startsWith('+') && !l.startsWith('+++')) ?? '';
        const ref: HunkRef = {
          hunkId,
          filePath,
          shelfPath: '',
          preview: firstAddLine,
          lineRange: hunk.lineRange,
          fileStatus: hunk.fileStatus,
          renamedFrom: hunk.renamedFrom,
        };
        this.store.assignHunk(activeBench.id, ref);
      }
    });
  }
}
