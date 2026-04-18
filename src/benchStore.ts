import { randomUUID } from 'node:crypto';
import type {
  Bench, BenchId, BenchChangeEvent, StoreState,
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

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: BenchChangeEvent): void {
    Array.from(this.listeners).forEach((listener) => {
      listener(event);
    });
  }
}
