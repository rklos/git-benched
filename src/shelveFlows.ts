import type { BenchId, HunkRef } from './types';
import type { BenchStore } from './benchStore';
import type { ShelveService, ShelfHeader, PatchDescriptor } from './shelveService';
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

export interface UnshelveResult {
  benchId: BenchId;
  appliedCount: number;
  conflicts: Array<{ filePath: string; hunkId: string; shelfPath: string }>;
}

export async function unshelveBench(
  benchId: BenchId,
  deps: {
    store: BenchStore;
    shelve: ShelveService;
    git: GitOperations;
  },
): Promise<UnshelveResult> {
  const descriptors: PatchDescriptor[] = await deps.shelve.listPatches(benchId);
  const conflicts: UnshelveResult['conflicts'] = [];

  // Sequential application: each apply mutates the working tree.
  // Use Promise-reduce pattern to stay sequential + lint-friendly.
  const applied = await descriptors.reduce<Promise<number>>(
    async (accPromise, descriptor) => {
      const count = await accPromise;
      const patchBody = await deps.shelve.readPatchBody(descriptor);
      try {
        await deps.git.apply(patchBody, { threeWay: true });
        await deps.shelve.deletePatch(descriptor);
        deps.store.removeHunk(benchId, descriptor.filePath, descriptor.hunkId);
        return count + 1;
      } catch {
        conflicts.push({
          filePath: descriptor.filePath,
          hunkId: descriptor.hunkId,
          shelfPath: descriptor.shelfPath,
        });
        return count;
      }
    },
    Promise.resolve(0),
  );

  return { benchId, appliedCount: applied, conflicts };
}

async function collectStagedPaths(
  git: GitOperations,
  bench: { files: Map<string, unknown> },
): Promise<string[]> {
  const porcelain = await git.statusPorcelain();
  const entries = porcelain.split('\0').filter((e) => e.length >= 3);
  return entries
    .map((entry) => {
      const statusPart = entry.slice(0, 2);
      const pathPart = entry.slice(3);
      if (statusPart[0] !== ' ' && statusPart[0] !== '?' && bench.files.has(pathPart)) {
        return pathPart;
      }
      return undefined;
    })
    .filter((p): p is string => p !== undefined);
}

export interface ActivateResult {
  previousBenchId: BenchId;
  newBenchId: BenchId;
  shelvedCount: number;
  unshelvedCount: number;
  conflicts: UnshelveResult['conflicts'];
}

export async function activateBench(
  targetBenchId: BenchId,
  deps: {
    store: BenchStore;
    shelve: ShelveService;
    git: GitOperations;
  },
): Promise<ActivateResult> {
  const currentActive = deps.store.getActiveBench();
  if (currentActive.id === targetBenchId) {
    return {
      previousBenchId: currentActive.id,
      newBenchId: targetBenchId,
      shelvedCount: 0,
      unshelvedCount: 0,
      conflicts: [],
    };
  }

  // 1. Unstage anything staged from current active
  const stagedPaths = await collectStagedPaths(deps.git, currentActive);
  if (stagedPaths.length > 0) {
    await deps.git.resetPaths(stagedPaths);
  }

  // 2. Shelve all of current active's hunks
  const currentFiles = Array.from(currentActive.files.keys());
  const shelvedCount = await currentFiles.reduce<Promise<number>>(
    async (accPromise, filePath) => {
      const count = await accPromise;
      const refs = await shelveHunks(
        { benchId: currentActive.id, filePath },
        deps,
      );
      return count + refs.length;
    },
    Promise.resolve(0),
  );

  // 3. Reset all affected files to HEAD (belt-and-suspenders)
  await deps.git.checkoutHead(currentFiles);

  // 4. Unshelve target bench
  const unshelve = await unshelveBench(targetBenchId, deps);

  // 5. Swap pointer
  deps.store.setActiveBench(targetBenchId);

  return {
    previousBenchId: currentActive.id,
    newBenchId: targetBenchId,
    shelvedCount,
    unshelvedCount: unshelve.appliedCount,
    conflicts: unshelve.conflicts,
  };
}

export interface SelectionArgs {
  benchId: BenchId;
  filePath: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
}

export async function shelveSelection(
  args: SelectionArgs,
  deps: {
    store: BenchStore;
    shelve: ShelveService;
    git: GitOperations;
  },
): Promise<HunkRef[]> {
  const diff = await deps.git.diffHead([ args.filePath ]);
  const allHunks = parseHunks(diff);
  const selected = allHunks.filter((h) => {
    const hunkStart = h.lineRange.startNew;
    const hunkEnd = hunkStart + h.lineRange.countNew - 1;
    return !(hunkEnd < args.startLine || hunkStart > args.endLine);
  });
  if (selected.length === 0) { return []; }
  const hunkIds = selected.map((h) => hunkIdFromPatch(h));
  return shelveHunks({ benchId: args.benchId, filePath: args.filePath, hunkIds }, deps);
}
