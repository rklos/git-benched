import { randomUUID } from 'node:crypto';
import type {
  Bench, BenchId, BenchChangeEvent, StoreState, HunkRef, FilePath,
  SerializedState,
} from './types';

type Listener = (event: BenchChangeEvent) => void;

export class BenchStore {
  private state: StoreState;
  private readonly listeners: Set<Listener> = new Set();

  public constructor(initial: StoreState | undefined, repoPath: string) {
    this.state = initial ?? BenchStore.createInitial(repoPath);
  }

  public static createInitial(repoPath: string): StoreState {
    const bench: Bench = {
      id: randomUUID(),
      name: 'Default Bench',
      isDefault: true,
      files: new Map(),
      createdAt: Date.now(),
    };
    return {
      activeBenchId: bench.id,
      benches: new Map([[ bench.id, bench ]]),
      repoPath,
    };
  }

  public getBenches(): Bench[] {
    return Array.from(this.state.benches.values());
  }

  public getBench(id: BenchId): Bench | undefined {
    return this.state.benches.get(id);
  }

  public getActiveBench(): Bench {
    const bench = this.state.benches.get(this.state.activeBenchId);
    if (!bench) {
      throw new Error(`Active bench ${this.state.activeBenchId} not found`);
    }
    return bench;
  }

  public getDefaultBench(): Bench {
    const defaultBench = Array.from(this.state.benches.values()).find((b) => b.isDefault);
    if (!defaultBench) {
      throw new Error('Default Bench missing — store invariant violated');
    }
    return defaultBench;
  }

  public createBench(name: string): Bench {
    const bench: Bench = {
      id: randomUUID(),
      name,
      isDefault: false,
      files: new Map(),
      createdAt: Date.now(),
    };
    this.state.benches.set(bench.id, bench);
    this.emit({ type: 'bench-created', benchId: bench.id });
    return bench;
  }

  public renameBench(id: BenchId, name: string): void {
    const bench = this.state.benches.get(id);
    if (!bench) { return; }
    bench.name = name;
    this.emit({ type: 'bench-renamed', benchId: id });
  }

  public deleteBench(id: BenchId): void {
    const bench = this.state.benches.get(id);
    if (!bench) { return; }
    if (bench.isDefault) {
      throw new Error('Cannot delete the Default Bench');
    }
    if (this.state.activeBenchId === id) {
      const fallback = this.getDefaultBench();
      this.state.activeBenchId = fallback.id;
      this.emit({ type: 'active-changed', previous: id, next: fallback.id });
    }
    this.state.benches.delete(id);
    this.emit({ type: 'bench-deleted', benchId: id });
  }

  public setActiveBench(id: BenchId): void {
    if (!this.state.benches.has(id)) {
      throw new Error(`Bench ${id} not found`);
    }
    if (this.state.activeBenchId === id) { return; }
    const previous = this.state.activeBenchId;
    this.state.activeBenchId = id;
    this.emit({ type: 'active-changed', previous, next: id });
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public assignHunk(benchId: BenchId, hunk: HunkRef): void {
    const bench = this.state.benches.get(benchId);
    if (!bench) { throw new Error(`Bench ${benchId} not found`); }
    const existing = bench.files.get(hunk.filePath) ?? [];
    const withoutDup = existing.filter((h) => h.hunkId !== hunk.hunkId);
    bench.files.set(hunk.filePath, [ ...withoutDup, hunk ]);
    this.emit({ type: 'hunks-changed', benchId });
  }

  public removeHunk(benchId: BenchId, filePath: FilePath, hunkId: string): void {
    const bench = this.state.benches.get(benchId);
    if (!bench) { return; }
    const hunks = bench.files.get(filePath);
    if (!hunks) { return; }
    const remaining = hunks.filter((h) => h.hunkId !== hunkId);
    if (remaining.length === 0) {
      bench.files.delete(filePath);
    } else {
      bench.files.set(filePath, remaining);
    }
    this.emit({ type: 'hunks-changed', benchId });
  }

  public moveHunk(
    fromBenchId: BenchId,
    toBenchId: BenchId,
    filePath: FilePath,
    hunkId: string,
  ): HunkRef | undefined {
    const from = this.state.benches.get(fromBenchId);
    const to = this.state.benches.get(toBenchId);
    if (!from || !to) { return undefined; }
    const hunks = from.files.get(filePath);
    const hunk = hunks?.find((h) => h.hunkId === hunkId);
    if (!hunk) { return undefined; }
    this.removeHunk(fromBenchId, filePath, hunkId);
    this.assignHunk(toBenchId, hunk);
    return hunk;
  }

  public findHunk(filePath: FilePath, hunkId: string): { benchId: BenchId; hunk: HunkRef } | undefined {
    const entries = Array.from(this.state.benches.values());
    const found = entries
      .map((bench) => {
        const hunks = bench.files.get(filePath);
        const hunk = hunks?.find((h) => h.hunkId === hunkId);
        return hunk ? { benchId: bench.id, hunk } : undefined;
      })
      .find((x) => x !== undefined);
    return found;
  }

  public serialize(): SerializedState {
    return {
      schemaVersion: 1,
      activeBenchId: this.state.activeBenchId,
      benches: Array.from(this.state.benches.values()).map((b) => ({
        id: b.id,
        name: b.name,
        isDefault: b.isDefault,
        commitMessageDraft: b.commitMessageDraft,
        createdAt: b.createdAt,
        files: Array.from(b.files.entries()).map(([ path, hunks ]) => ({ path, hunks })),
      })),
    };
  }

  public static fromSerialized(serialized: SerializedState, repoPath: string): BenchStore {
    const benches = new Map<BenchId, Bench>();
    serialized.benches.forEach((sb) => {
      benches.set(sb.id, {
        id: sb.id,
        name: sb.name,
        isDefault: sb.isDefault,
        commitMessageDraft: sb.commitMessageDraft,
        createdAt: sb.createdAt,
        files: new Map(sb.files.map((f) => [ f.path, f.hunks ])),
      });
    });
    return new BenchStore(
      { activeBenchId: serialized.activeBenchId, benches, repoPath },
      repoPath,
    );
  }

  public setCommitMessageDraft(id: BenchId, draft: string): void {
    const bench = this.state.benches.get(id);
    if (!bench) { return; }
    bench.commitMessageDraft = draft.length > 0 ? draft : undefined;
    this.emit({ type: 'draft-changed', benchId: id });
  }

  private emit(event: BenchChangeEvent): void {
    Array.from(this.listeners).forEach((listener) => {
      listener(event);
    });
  }
}
