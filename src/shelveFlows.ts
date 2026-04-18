import type { BenchId, HunkRef } from './types';
import type { BenchStore } from './benchStore';
import type { ShelveService, ShelfHeader } from './shelveService';
import type { GitOperations } from './gitOperations';
import { parseHunks, hunkIdFromPatch, type HunkPatch } from './hunkParser';

export interface ShelveArgs {
  benchId: BenchId;
  filePath: string;
  hunkIds?: string[]; // undefined = all hunks of this file
}

async function shelveOneHunk(
  hunk: HunkPatch,
  benchId: BenchId,
  deps: {
    store: BenchStore;
    shelve: ShelveService;
    git: GitOperations;
  },
  baseCommit: string,
): Promise<HunkRef> {
  const hunkId = hunkIdFromPatch(hunk);
  const header: ShelfHeader = {
    benchId,
    filePath: hunk.filePath,
    hunkId,
    baseCommit,
    shelvedAt: new Date().toISOString(),
    fileStatus: hunk.fileStatus,
    renamedFrom: hunk.renamedFrom,
  };
  const descriptor = await deps.shelve.writePatch({
    benchId,
    filePath: hunk.filePath,
    hunkId,
    patchContent: hunk.patchContent,
    header,
  });
  const firstAddLine = hunk.patchContent.split('\n').find((l) => l.startsWith('+') && !l.startsWith('+++')) ?? '';
  const ref: HunkRef = {
    hunkId,
    filePath: hunk.filePath,
    shelfPath: descriptor.shelfPath,
    preview: firstAddLine,
    lineRange: hunk.lineRange,
    fileStatus: hunk.fileStatus,
    renamedFrom: hunk.renamedFrom,
  };

  // Reverse-apply this single-hunk patch to remove the hunk from the working tree
  await deps.git.apply(hunk.patchContent, { threeWay: false, reverse: true });

  // Move from current owning bench (if any) to target bench
  const existing = deps.store.findHunk(hunk.filePath, hunkId);
  if (existing) {
    deps.store.removeHunk(existing.benchId, hunk.filePath, hunkId);
  }
  deps.store.assignHunk(benchId, ref);

  return ref;
}

export async function shelveHunks(
  args: ShelveArgs,
  deps: {
    store: BenchStore;
    shelve: ShelveService;
    git: GitOperations;
  },
): Promise<HunkRef[]> {
  const diff = args.filePath.length > 0
    ? await deps.git.diffHead([ args.filePath ])
    : await deps.git.diffHead();
  if (diff.length === 0) { return []; }

  const allHunks = parseHunks(diff);
  const relevantHunks: HunkPatch[] = args.hunkIds
    ? allHunks.filter((h) => args.hunkIds!.includes(hunkIdFromPatch(h)))
    : allHunks;

  if (relevantHunks.length === 0) { return []; }

  const baseCommit = await deps.git.headSha();

  // Sequential because each hunk's apply --reverse changes working-tree state;
  // we can't parallelize without risk of conflicting applies.
  const refs = await relevantHunks.reduce<Promise<HunkRef[]>>(
    async (accPromise, hunk) => {
      const acc = await accPromise;
      const ref = await shelveOneHunk(hunk, args.benchId, deps, baseCommit);
      return [ ...acc, ref ];
    },
    Promise.resolve([]),
  );

  return refs;
}
